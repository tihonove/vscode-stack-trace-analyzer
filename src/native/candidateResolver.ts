import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { addCandidateTo, basenameLower, computeSmartCandidatePathsPure, rankCandidates } from "./pathMatch";
import { IGNORED_DIRS, walkForBasenames } from "./fsWalk";
import { gitLsFilesByBasenames, gitListIgnoredEntries } from "./gitCli";
import { SearchScope, planSearchScopes } from "./searchScopes";

// vscode-free core of the fast file searcher. It resolves stack-trace file paths
// to absolute on-disk paths inside the given roots.
//
// The workspace is first turned into a plan of search scopes (see searchScopes.ts)
// so that git serves as much of it as possible — including containers holding
// several repositories and repositories nested inside a workspace folder — and a
// filesystem walk only ever covers areas git cannot reach.
//
// Per batch the resolver climbs a ladder, each rung running only for the paths
// still unresolved (so the expensive rungs see a shrinking set of basenames):
//   1. a direct "smart candidate" stat,
//   2. the primary pass: `git ls-files` per git scope, a walk per walk scope,
//   3. widening: the same git query from the repository top level, for scopes
//      where the workspace folder is only a subdirectory of the repository,
//   4. the git-ignored areas — generated code git deliberately omits.
//
// If git itself crashes (killed, unexpected exit, spawn failure), a GitSearchError
// is thrown so the caller can fall back to the legacy VS Code searcher.

export { GitSearchError } from "./gitCli";

export interface ResolveOptions {
    signal?: AbortSignal;
    /**
     * Use the git index (`git ls-files`) as the primary file source. Defaults to
     * `true`. When `false`, always use the filesystem walk and never invoke git.
     */
    useGitIndex?: boolean;
    /**
     * Repository roots already known to the host (the `vscode.git` API). Lets the
     * planner place git scopes without probing the disk. Empty in unit tests.
     */
    repoRoots?: ReadonlyArray<string>;
}

/** How many scopes are queried at once — git and walk scopes are independent. */
const MAX_CONCURRENT_SCOPES = 4;

/** Ranked candidates a single frame is allowed to `stat` before giving up. */
const MAX_CANDIDATE_STATS = 10;

async function pathExists(candidate: string): Promise<boolean> {
    try {
        await fsp.stat(candidate);
        return true;
    } catch {
        return false;
    }
}

function mergeCandidates(target: Map<string, string[]>, source: Map<string, string[]>, wanted: ReadonlySet<string>): void {
    for (const [nameLower, paths] of source) {
        if (!wanted.has(nameLower)) continue;
        const list = target.get(nameLower);
        if (list) list.push(...paths);
        else target.set(nameLower, [...paths]);
    }
}

/** Runs `worker` over `items` with a bounded number of concurrent calls. */
async function mapWithConcurrency<T, R>(
    items: ReadonlyArray<T>,
    limit: number,
    worker: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const index = next++;
            if (index >= items.length) return;
            results[index] = await worker(items[index]!);
        }
    });
    await Promise.all(runners);
    return results;
}

/** Distinct repository top levels of the git scopes, preserving plan order. */
function distinctRepoTops(scopes: ReadonlyArray<SearchScope>, onlyWidened: boolean): string[] {
    const tops: string[] = [];
    const seen = new Set<string>();
    for (const scope of scopes) {
        if (scope.kind !== "git") continue;
        if (onlyWidened && scope.repoTop === scope.dir) continue;
        if (seen.has(scope.repoTop)) continue;
        seen.add(scope.repoTop);
        tops.push(scope.repoTop);
    }
    return tops;
}

/**
 * Primary pass over the plan: git scopes are queried with `git ls-files`, walk
 * scopes are walked. A git scope whose directory git refuses to serve (not a
 * repo after all) degrades to a walk of that directory.
 */
async function collectFromScopes(
    wanted: Set<string>,
    scopes: ReadonlyArray<SearchScope>,
    signal?: AbortSignal
): Promise<Map<string, string[]>> {
    const basenames = [...wanted];
    const perScope = await mapWithConcurrency(scopes, MAX_CONCURRENT_SCOPES, async scope => {
        if (signal?.aborted) return new Map<string, string[]>();
        if (scope.kind === "walk") {
            return await walkForBasenames(scope.dir, wanted, signal, scope.excludeDirs);
        }
        const fromGit = await gitLsFilesByBasenames(scope.dir, basenames, { signal });
        return fromGit ?? (await walkForBasenames(scope.dir, wanted, signal));
    });

    const candidates = new Map<string, string[]>();
    for (const scopeCandidates of perScope) mergeCandidates(candidates, scopeCandidates, wanted);
    return candidates;
}

/** Runs `git ls-files` across `dirs` and merges what it found. */
async function collectFromGitDirs(
    wanted: Set<string>,
    dirs: ReadonlyArray<string>,
    signal?: AbortSignal
): Promise<Map<string, string[]>> {
    const basenames = [...wanted];
    const perDir = await mapWithConcurrency(dirs, MAX_CONCURRENT_SCOPES, async dir => {
        if (signal?.aborted) return undefined;
        return await gitLsFilesByBasenames(dir, basenames, { signal });
    });

    const candidates = new Map<string, string[]>();
    for (const dirCandidates of perDir) {
        if (dirCandidates != undefined) mergeCandidates(candidates, dirCandidates, wanted);
    }
    return candidates;
}

/** Ignored directories this many at most are walked per repository — a runaway guard. */
const MAX_IGNORED_DIRS_WALKED = 32;

/**
 * Looks inside the git-ignored areas of `repoTops` — generated code that git
 * deliberately omits from `ls-files`.
 *
 * Asking git for ignored *files* would mean scanning every `node_modules` in the
 * repository. Instead we ask for ignored *entries* with directories collapsed
 * (cheap, git never descends), drop the build-output and dependency directories
 * the walk prunes anyway, and walk only what is left — in practice a handful of
 * small generated folders.
 */
async function collectFromIgnoredAreas(
    wanted: Set<string>,
    repoTops: ReadonlyArray<string>,
    signal?: AbortSignal
): Promise<Map<string, string[]>> {
    const candidates = new Map<string, string[]>();
    const perRepo = await mapWithConcurrency(repoTops, MAX_CONCURRENT_SCOPES, async repoTop => {
        if (signal?.aborted) return undefined;
        const entries = await gitListIgnoredEntries(repoTop, signal);
        if (entries == undefined) return undefined;

        const found = new Map<string, string[]>();
        const dirsToWalk: string[] = [];
        for (const entry of entries) {
            if (entry.endsWith("/")) {
                const relDir = entry.slice(0, -1);
                if (IGNORED_DIRS.has(basenameLower(relDir))) continue;
                if (dirsToWalk.length < MAX_IGNORED_DIRS_WALKED) dirsToWalk.push(path.join(repoTop, relDir));
            } else if (wanted.has(basenameLower(entry))) {
                // A standalone ignored file — no walking needed.
                addCandidateTo(found, repoTop, entry);
            }
        }

        for (const dir of dirsToWalk) {
            if (signal?.aborted) break;
            mergeCandidates(found, await walkForBasenames(dir, wanted, signal), wanted);
        }
        return found;
    });

    for (const repoCandidates of perRepo) {
        if (repoCandidates != undefined) mergeCandidates(candidates, repoCandidates, wanted);
    }
    return candidates;
}

/**
 * Builds a `basenameLower -> [absolute candidate paths]` map across all roots,
 * preferring git and falling back to a filesystem walk. Kept for direct use /
 * testing; `resolveFilePaths` is the full pipeline.
 */
export async function resolveByBasenames(
    basenames: ReadonlyArray<string>,
    roots: ReadonlyArray<string>,
    options: ResolveOptions = {}
): Promise<Map<string, string[]>> {
    const wanted = new Set(basenames.map(name => name.toLowerCase()).filter(name => name.length > 0));
    if (wanted.size === 0) return new Map<string, string[]>();
    const scopes = await planSearchScopes(roots, options.repoRoots, {
        useGitIndex: options.useGitIndex,
        signal: options.signal,
    });
    return await collectFromScopes(wanted, scopes, options.signal);
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

    const scopes = await planSearchScopes(roots, options.repoRoots, {
        useGitIndex: options.useGitIndex,
        signal,
    });

    // Stack-trace paths often carry the build agent's directory name for the repo
    // ("…/work/abc/my-repo/src/X.cs"), so repository tops are anchors too, not just
    // the workspace folders.
    const anchors = [...new Set([...roots, ...scopes.map(scope => (scope.kind === "git" ? scope.repoTop : scope.dir))])];

    // Stage 1: smart candidates — a direct stat, highest confidence, no git.
    let pending: string[] = [];
    for (const filePath of distinct) {
        if (signal?.aborted) {
            result.set(filePath, undefined);
            continue;
        }
        let found: string | undefined;
        for (const candidate of computeSmartCandidatePathsPure(filePath, anchors)) {
            if (await pathExists(candidate)) {
                found = candidate;
                break;
            }
        }
        if (found != undefined) result.set(filePath, found);
        else pending.push(filePath);
    }

    // Candidates accumulate across stages so a later, wider stage can still lose to
    // a better suffix match an earlier one found.
    const candidates = new Map<string, string[]>();
    const wantedOf = (paths: ReadonlyArray<string>): Set<string> =>
        new Set(paths.map(basenameLower).filter(name => name.length > 0));

    /** Re-matches every pending path against everything collected so far. */
    const resolvePending = async (): Promise<void> => {
        const stillPending: string[] = [];
        for (const filePath of pending) {
            const ranked = rankCandidates(filePath, candidates.get(basenameLower(filePath)) ?? [], roots);
            let found: string | undefined;
            for (const candidate of ranked.slice(0, MAX_CANDIDATE_STATS)) {
                if (await pathExists(candidate)) {
                    found = candidate;
                    break;
                }
            }
            if (found != undefined) result.set(filePath, found);
            else stillPending.push(filePath);
        }
        pending = stillPending;
    };

    const runStage = async (collect: (wanted: Set<string>) => Promise<Map<string, string[]>>): Promise<void> => {
        if (pending.length === 0 || signal?.aborted) return;
        const wanted = wantedOf(pending);
        if (wanted.size === 0) return;
        mergeCandidates(candidates, await collect(wanted), wanted);
        await resolvePending();
    };

    if (scopes.length > 0) {
        // Stage 2: the primary pass — git per git scope, a walk per walk scope.
        await runStage(wanted => collectFromScopes(wanted, scopes, signal));

        // Stage 3: widen to the repository top for workspace folders that are only a
        // subdirectory of their repository. `git ls-files` from a subdirectory reports
        // that subtree only, so anything living in a sibling folder of the repo needs
        // this — but it is a whole-repo scan, so it runs only on what is still missing.
        const widenedTops = distinctRepoTops(scopes, true);
        if (widenedTops.length > 0) {
            await runStage(wanted => collectFromGitDirs(wanted, widenedTops, signal));
        }

        // Stage 4: the git-ignored areas (generated code). Build output and
        // dependency directories stay excluded, matching what the walk prunes.
        const allTops = distinctRepoTops(scopes, false);
        if (allTops.length > 0) {
            await runStage(wanted => collectFromIgnoredAreas(wanted, allTops, signal));
        }
    }

    for (const filePath of pending) {
        if (!result.has(filePath)) result.set(filePath, undefined);
    }
    return result;
}
