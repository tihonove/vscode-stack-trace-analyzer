import { spawn } from "node:child_process";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { basenameLower, computeSmartCandidatePathsPure, matchCandidate } from "./pathMatch";
import { walkForBasenames } from "./fsWalk";

// vscode-free core of the fast file searcher. It resolves stack-trace file paths
// to absolute on-disk paths inside the given roots. Per query it tries, in order:
//   1. a direct "smart candidate" stat,
//   2. a targeted `git ls-files` pathspec query (git index),
//   3. a filesystem walk of the git-served roots (nested repos, gitignored files),
// keeping whatever an earlier stage already resolved. If git itself crashes
// (killed, unexpected exit, spawn failure), a GitSearchError is thrown so the
// caller can fall back to the legacy VS Code searcher.

export interface ResolveOptions {
    signal?: AbortSignal;
    /**
     * Use the git index (`git ls-files`) as the primary file source when a root
     * is a git repo. Defaults to `true`. When `false`, always use the filesystem
     * walk and never invoke git.
     */
    useGitIndex?: boolean;
}

/** Thrown when git fails unexpectedly (not "not a repo") — signals: fall back to the legacy searcher. */
export class GitSearchError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "GitSearchError";
    }
}

async function pathExists(candidate: string): Promise<boolean> {
    try {
        await fsp.stat(candidate);
        return true;
    } catch {
        return false;
    }
}

function addCandidate(map: Map<string, string[]>, root: string, relPath: string): void {
    const fullPath = path.join(root, relPath);
    const nameLower = basenameLower(relPath);
    const list = map.get(nameLower);
    if (list) list.push(fullPath);
    else map.set(nameLower, [fullPath]);
}

function mergeCandidates(target: Map<string, string[]>, source: Map<string, string[]>, wanted: ReadonlySet<string>): void {
    for (const [nameLower, paths] of source) {
        if (!wanted.has(nameLower)) continue;
        const list = target.get(nameLower);
        if (list) list.push(...paths);
        else target.set(nameLower, [...paths]);
    }
}

/**
 * Queries git for files whose basename matches one of `basenames` inside `root`.
 * Output is streamed and split on NUL incrementally, so we never materialize the
 * whole `git ls-files` output as one buffer.
 *
 * Resolves to `undefined` when git can't serve this root and a filesystem walk
 * should be used instead: `root` is not a git repo (exit 128), git is not
 * installed (ENOENT), or the operation was aborted. This transparently covers
 * worktrees (a `.git` file, not a directory — git resolves it) and roots nested
 * above/below the repo top (git works from any subdirectory).
 *
 * Rejects with `GitSearchError` when git crashes: killed by a signal, an
 * unexpected non-zero exit, or an unexpected spawn error.
 */
function gitLsFilesByBasenames(
    root: string,
    basenames: ReadonlyArray<string>,
    signal?: AbortSignal
): Promise<Map<string, string[]> | undefined> {
    return new Promise((resolve, reject) => {
        // A plain (non-`:(glob)`) pathspec treats `*` as matching across path
        // separators, so `*Foo.cs` matches Foo.cs at any depth (incl. repo root).
        // `:(icase)` makes it case-insensitive (basenames are lowercased, and disk
        // casing may differ from the stack trace). Over-matches (e.g. `MyFoo.cs`)
        // are filtered later by segment matching.
        const pathspecs = basenames.map(name => ":(icase)*" + name);
        const args = ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...pathspecs];

        let child;
        try {
            child = spawn("git", args, { signal });
        } catch (error) {
            reject(new GitSearchError(`failed to spawn git: ${String(error)}`));
            return;
        }

        const map = new Map<string, string[]>();
        let buffer = "";
        let settled = false;
        const succeed = (value: Map<string, string[]> | undefined): void => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        const fail = (error: GitSearchError): void => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
            buffer += chunk;
            let idx: number;
            while ((idx = buffer.indexOf("\0")) >= 0) {
                const rel = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 1);
                if (rel.length > 0) addCandidate(map, root, rel);
            }
        });
        child.on("error", (error: NodeJS.ErrnoException) => {
            // git not installed, or the run was cancelled → let the caller walk instead.
            if (signal?.aborted || error.code === "ABORT_ERR" || error.name === "AbortError" || error.code === "ENOENT") {
                succeed(undefined);
                return;
            }
            fail(new GitSearchError(`git spawn error: ${error.message}`));
        });
        child.on("close", (code, closeSignal) => {
            if (closeSignal != null) {
                if (signal?.aborted) succeed(undefined);
                else fail(new GitSearchError(`git was killed by ${closeSignal}`));
                return;
            }
            if (code === 0) {
                if (buffer.length > 0) addCandidate(map, root, buffer);
                succeed(map);
                return;
            }
            // 128 is git's "fatal" code, used for "not a git repository" — expected,
            // fall back to a walk. Any other non-zero exit is treated as a crash.
            if (code === 128) succeed(undefined);
            else fail(new GitSearchError(`git exited with code ${code}`));
        });
    });
}

/**
 * Collects candidate paths by basename across roots using the primary source
 * (git index when `useGitIndex`, otherwise a walk). Returns the merged
 * candidates plus the roots that git actually served, so the caller can walk
 * exactly those roots afterwards for anything git missed.
 */
async function collectPrimaryCandidates(
    wanted: Set<string>,
    roots: ReadonlyArray<string>,
    options: ResolveOptions
): Promise<{ candidates: Map<string, string[]>; gitServedRoots: string[] }> {
    const candidates = new Map<string, string[]>();
    const gitServedRoots: string[] = [];
    const useGitIndex = options.useGitIndex !== false;

    for (const root of roots) {
        if (options.signal?.aborted) break;
        let perRoot: Map<string, string[]> | undefined;
        if (useGitIndex) {
            perRoot = await gitLsFilesByBasenames(root, [...wanted], options.signal);
            if (perRoot != undefined) gitServedRoots.push(root);
        }
        if (perRoot == undefined) {
            perRoot = await walkForBasenames(root, wanted, options.signal);
        }
        mergeCandidates(candidates, perRoot, wanted);
    }
    return { candidates, gitServedRoots };
}

async function walkRootsForBasenames(
    wanted: Set<string>,
    roots: ReadonlyArray<string>,
    signal?: AbortSignal
): Promise<Map<string, string[]>> {
    const candidates = new Map<string, string[]>();
    for (const root of roots) {
        if (signal?.aborted) break;
        mergeCandidates(candidates, await walkForBasenames(root, wanted, signal), wanted);
    }
    return candidates;
}

/**
 * Builds a `basenameLower -> [absolute candidate paths]` map across all roots,
 * preferring git and falling back to a filesystem walk per root. Kept for direct
 * use / testing; `resolveFilePaths` is the full pipeline.
 */
export async function resolveByBasenames(
    basenames: ReadonlyArray<string>,
    roots: ReadonlyArray<string>,
    options: ResolveOptions = {}
): Promise<Map<string, string[]>> {
    const wanted = new Set(basenames.map(name => name.toLowerCase()).filter(name => name.length > 0));
    if (wanted.size === 0) return new Map<string, string[]>();
    return (await collectPrimaryCandidates(wanted, roots, options)).candidates;
}

/**
 * Resolves a batch of stack-trace file paths to absolute on-disk paths.
 * Returns a map keyed by the original `filePaths` (undefined = not found).
 * May throw `GitSearchError` if git crashes.
 */
export async function resolveFilePaths(
    filePaths: ReadonlyArray<string>,
    roots: ReadonlyArray<string>,
    options: ResolveOptions = {}
): Promise<Map<string, string | undefined>> {
    const { signal } = options;
    const result = new Map<string, string | undefined>();
    const distinct = [...new Set(filePaths)];

    // Stage 1: smart candidates — a direct stat, highest confidence, no git.
    const unresolved: string[] = [];
    for (const filePath of distinct) {
        if (signal?.aborted) {
            result.set(filePath, undefined);
            continue;
        }
        let found: string | undefined;
        for (const candidate of computeSmartCandidatePathsPure(filePath, roots)) {
            if (await pathExists(candidate)) {
                found = candidate;
                break;
            }
        }
        if (found != undefined) result.set(filePath, found);
        else unresolved.push(filePath);
    }

    if (unresolved.length === 0 || roots.length === 0 || signal?.aborted) {
        for (const filePath of unresolved) {
            if (!result.has(filePath)) result.set(filePath, undefined);
        }
        return result;
    }

    // Stage 2: primary source (git index, with a per-root walk for non-git roots).
    const wanted = new Set(unresolved.map(basenameLower).filter(name => name.length > 0));
    const { candidates, gitServedRoots } = await collectPrimaryCandidates(wanted, roots, options);
    const stillUnresolved: string[] = [];
    for (const filePath of unresolved) {
        const best = matchCandidate(filePath, candidates.get(basenameLower(filePath)) ?? []);
        if (best != undefined && (await pathExists(best))) result.set(filePath, best);
        else stillUnresolved.push(filePath);
    }

    // Stage 3: whatever git couldn't resolve, keep the fast wins and continue by
    // walking the git-served roots on disk (nested repos, submodules, gitignored
    // generated files git deliberately omits). Non-git roots were already walked
    // in stage 2, so we only re-scan the roots git served here.
    if (stillUnresolved.length > 0 && gitServedRoots.length > 0 && !signal?.aborted) {
        const wanted3 = new Set(stillUnresolved.map(basenameLower).filter(name => name.length > 0));
        const walkCandidates = await walkRootsForBasenames(wanted3, gitServedRoots, signal);
        for (const filePath of stillUnresolved) {
            const combined = [
                ...(candidates.get(basenameLower(filePath)) ?? []),
                ...(walkCandidates.get(basenameLower(filePath)) ?? []),
            ];
            const best = matchCandidate(filePath, combined);
            result.set(filePath, best != undefined && (await pathExists(best)) ? best : undefined);
        }
    } else {
        for (const filePath of stillUnresolved) result.set(filePath, undefined);
    }

    return result;
}
