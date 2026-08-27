import { spawn } from "node:child_process";
import { addCandidateTo } from "./pathMatch";

// Thin, vscode-free wrappers around the `git` CLI used by the fast file searcher.
// Everything here distinguishes two failure kinds:
//   * "git can't serve this" (not a repo, git missing, aborted) → resolve to undefined,
//     the caller falls back to a filesystem walk;
//   * "git crashed" (killed, unexpected exit code, spawn error) → GitSearchError,
//     the caller falls the whole request back to the legacy VS Code searcher.

/** Thrown when git fails unexpectedly (not "not a repo") — signals: fall back to the legacy searcher. */
export class GitSearchError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "GitSearchError";
    }
}

/** Basenames per `git ls-files` invocation — keeps the argv well under any platform limit. */
const MAX_PATHSPECS_PER_CALL = 100;

function isBenignSpawnFailure(error: NodeJS.ErrnoException, signal?: AbortSignal): boolean {
    // git not installed, or the run was cancelled → let the caller walk instead.
    return signal?.aborted === true || error.code === "ABORT_ERR" || error.name === "AbortError" || error.code === "ENOENT";
}

/**
 * Runs `git -C cwd <args>` and resolves with its stdout, or `undefined` when git
 * cannot serve this directory (exit 128 = not a repo, git missing, aborted).
 */
function gitCapture(cwd: string, args: ReadonlyArray<string>, signal?: AbortSignal): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
        let child;
        try {
            child = spawn("git", ["-C", cwd, ...args], { signal });
        } catch (error) {
            reject(new GitSearchError(`failed to spawn git: ${String(error)}`));
            return;
        }

        let out = "";
        let settled = false;
        const succeed = (value: string | undefined): void => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
            out += chunk;
        });
        child.on("error", (error: NodeJS.ErrnoException) => {
            if (settled) return;
            settled = true;
            if (isBenignSpawnFailure(error, signal)) resolve(undefined);
            else reject(new GitSearchError(`git spawn error: ${error.message}`));
        });
        child.on("close", (code, closeSignal) => {
            if (settled) return;
            if (closeSignal != null || code !== 0) {
                // Any failure of a probe command just means "git can't tell us" — never
                // escalate: `rev-parse` is best-effort and must not break the search.
                succeed(undefined);
                return;
            }
            succeed(out);
        });
    });
}

/**
 * Absolute path of the git repository containing `dir`, or `undefined` when `dir`
 * is not inside a repository (or git is unavailable). Transparently handles
 * worktrees and directories nested at any depth below the repo top.
 */
export async function gitTopLevel(dir: string, signal?: AbortSignal): Promise<string | undefined> {
    const out = await gitCapture(dir, ["rev-parse", "--show-toplevel"], signal);
    const top = out?.trim();
    return top != undefined && top.length > 0 ? top : undefined;
}

export interface LsFilesOptions {
    signal?: AbortSignal | undefined;
}

/**
 * Queries git for files whose basename matches one of `basenames` inside `root`.
 * Output is streamed and split on NUL incrementally, so we never materialize the
 * whole `git ls-files` output as one buffer.
 *
 * Resolves to `undefined` when git can't serve this root and a filesystem walk
 * should be used instead: `root` is not a git repo (exit 128), git is not
 * installed (ENOENT), or the operation was aborted.
 *
 * Rejects with `GitSearchError` when git crashes: killed by a signal, an
 * unexpected non-zero exit, or an unexpected spawn error.
 */
export async function gitLsFilesByBasenames(
    root: string,
    basenames: ReadonlyArray<string>,
    options: LsFilesOptions = {}
): Promise<Map<string, string[]> | undefined> {
    const map = new Map<string, string[]>();
    let served = false;
    for (let offset = 0; offset < basenames.length; offset += MAX_PATHSPECS_PER_CALL) {
        if (options.signal?.aborted) return served ? map : undefined;
        const chunk = basenames.slice(offset, offset + MAX_PATHSPECS_PER_CALL);
        const chunkServed = await lsFilesChunk(root, chunk, map, options);
        if (!chunkServed) return undefined;
        served = true;
    }
    return served ? map : new Map<string, string[]>();
}

function lsFilesChunk(
    root: string,
    basenames: ReadonlyArray<string>,
    map: Map<string, string[]>,
    options: LsFilesOptions
): Promise<boolean> {
    const { signal } = options;
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

        let buffer = "";
        let settled = false;
        const succeed = (value: boolean): void => {
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
                if (rel.length > 0) addCandidateTo(map, root, rel);
            }
        });
        child.on("error", (error: NodeJS.ErrnoException) => {
            if (isBenignSpawnFailure(error, signal)) {
                succeed(false);
                return;
            }
            fail(new GitSearchError(`git spawn error: ${error.message}`));
        });
        child.on("close", (code, closeSignal) => {
            if (closeSignal != null) {
                if (signal?.aborted) succeed(false);
                else fail(new GitSearchError(`git was killed by ${closeSignal}`));
                return;
            }
            if (code === 0) {
                if (buffer.length > 0) addCandidateTo(map, root, buffer);
                succeed(true);
                return;
            }
            // 128 is git's "fatal" code, used for "not a git repository" — expected,
            // fall back to a walk. Any other non-zero exit is treated as a crash.
            if (code === 128) succeed(false);
            else fail(new GitSearchError(`git exited with code ${code}`));
        });
    });
}

/**
 * Git-ignored entries of the repository at `root`, relative to it, with ignored
 * directories collapsed to a single entry ending in `/`.
 *
 * `--directory` makes git stop at the topmost ignored directory instead of
 * descending into it, which is what keeps this affordable: listing the ignored
 * *files* of a repository means walking every `node_modules` in it, while listing
 * the ignored *entries* costs nothing. The caller decides which of those
 * directories are worth walking for real.
 *
 * Resolves to `undefined` when git cannot serve `root`.
 */
export function gitListIgnoredEntries(root: string, signal?: AbortSignal): Promise<string[] | undefined> {
    return new Promise((resolve, reject) => {
        const args = [
            "-C",
            root,
            "ls-files",
            "-z",
            "--others",
            "--ignored",
            "--exclude-standard",
            "--directory",
            "--no-empty-directory",
        ];

        let child;
        try {
            child = spawn("git", args, { signal });
        } catch (error) {
            reject(new GitSearchError(`failed to spawn git: ${String(error)}`));
            return;
        }

        let buffer = "";
        const entries: string[] = [];
        let settled = false;
        const settle = (fn: () => void): void => {
            if (settled) return;
            settled = true;
            fn();
        };

        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
            buffer += chunk;
            let idx: number;
            while ((idx = buffer.indexOf("\0")) >= 0) {
                const entry = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 1);
                if (entry.length > 0) entries.push(entry);
            }
        });
        child.on("error", (error: NodeJS.ErrnoException) => {
            if (isBenignSpawnFailure(error, signal)) settle(() => resolve(undefined));
            else settle(() => reject(new GitSearchError(`git spawn error: ${error.message}`)));
        });
        child.on("close", (code, closeSignal) => {
            if (closeSignal != null) {
                if (signal?.aborted) settle(() => resolve(undefined));
                else settle(() => reject(new GitSearchError(`git was killed by ${closeSignal}`)));
                return;
            }
            if (code === 0) {
                if (buffer.length > 0) entries.push(buffer);
                settle(() => resolve(entries));
                return;
            }
            if (code === 128) settle(() => resolve(undefined));
            else settle(() => reject(new GitSearchError(`git exited with code ${code}`)));
        });
    });
}
