import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { gitTopLevel } from "./gitCli";
import { isSameOrInside } from "./pathMatch";
import { IGNORED_DIRS } from "./fsWalk";
import { createScopedLogger, formatList, startTimer } from "../utils/logger";

const log = createScopedLogger("scopes");

// Turns the workspace folders into a plan of *search scopes*.
//
// The old resolver assumed "one workspace folder == one git repository" and fell
// back to a full filesystem walk whenever that did not hold. Two very common
// layouts broke it:
//   * a container folder holding several repositories (and nested repos /
//     submodules inside a repository — `git ls-files` never descends into those),
//   * a workspace folder that is only a subdirectory of one big repository
//     (`git ls-files` run from a subdirectory only ever reports that subtree).
//
// Planning makes both explicit: every area is either served by git (cheap, C-speed,
// honors .gitignore) or walked, and the walk only ever covers what git cannot.

export interface GitScope {
    kind: "git";
    /** Directory git is queried from — the narrow, first-pass scope. */
    dir: string;
    /** Top level of the repository containing `dir`; the widened second-pass scope. */
    repoTop: string;
}

export interface WalkScope {
    kind: "walk";
    dir: string;
    /** Absolute directories carved out of the walk because a git scope covers them. */
    excludeDirs: string[];
}

export type SearchScope = GitScope | WalkScope;

const normalize = (dir: string): string => path.resolve(dir);

async function isRepoDir(dir: string): Promise<boolean> {
    try {
        // A `.git` directory for a normal clone, a `.git` file for a worktree/submodule.
        await fsp.stat(path.join(dir, ".git"));
        return true;
    } catch {
        return false;
    }
}

/**
 * Repositories sitting directly inside `root` (depth 1, matching VS Code's default
 * `git.repositoryScanMaxDepth`). A safety net for the "container folder full of
 * repos" and "submodule" layouts when the `vscode.git` API did not report them
 * (extension disabled, or unit tests). One `readdir` plus a `stat` per
 * subdirectory — negligible next to the walk it replaces.
 */
async function scanContainerForRepos(root: string, signal?: AbortSignal): Promise<string[]> {
    let entries;
    try {
        entries = await fsp.readdir(root, { withFileTypes: true });
    } catch {
        return [];
    }
    const found: string[] = [];
    for (const entry of entries) {
        if (signal?.aborted) break;
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        if (IGNORED_DIRS.has(entry.name)) continue;
        const candidate = path.join(root, entry.name);
        if (await isRepoDir(candidate)) found.push(candidate);
    }
    return found;
}

/** The innermost known repository that contains `dir` (or is `dir` itself). */
function findEnclosingRepo(dir: string, repoRoots: ReadonlyArray<string>): string | undefined {
    let best: string | undefined;
    for (const repoRoot of repoRoots) {
        if (!isSameOrInside(dir, repoRoot)) continue;
        if (best == undefined || repoRoot.length > best.length) best = repoRoot;
    }
    return best;
}

/**
 * Builds the search plan for `roots`.
 *
 * `knownRepoRoots` comes from the `vscode.git` API (`api.repositories`) — free,
 * already-scanned knowledge about every repository VS Code has open. It is empty
 * in unit tests and whenever the git extension is unavailable; the plan then
 * relies on `git rev-parse --show-toplevel` plus the depth-1 container scan.
 *
 * When `useGitIndex` is false every root becomes a walk scope and git is never invoked.
 */
export async function planSearchScopes(
    roots: ReadonlyArray<string>,
    knownRepoRoots: ReadonlyArray<string> = [],
    options: { useGitIndex?: boolean | undefined; signal?: AbortSignal | undefined } = {}
): Promise<SearchScope[]> {
    const { useGitIndex = true, signal } = options;
    const elapsed = startTimer();
    const normalizedRoots = [...new Set(roots.map(normalize))];
    if (!useGitIndex) {
        log.debug(`Git is disabled — every one of ${normalizedRoots.length} folder(s) will be walked from disk.`);
        return normalizedRoots.map(dir => ({ kind: "walk", dir, excludeDirs: [] }));
    }

    const repoRoots = [...new Set(knownRepoRoots.map(normalize))];
    const scopes: SearchScope[] = [];
    const gitDirs = new Set<string>();

    const addGitScope = (dir: string, repoTop: string): void => {
        if (gitDirs.has(dir)) return;
        gitDirs.add(dir);
        scopes.push({ kind: "git", dir, repoTop });
    };

    for (const root of normalizedRoots) {
        if (signal?.aborted) break;

        const enclosing = findEnclosingRepo(root, repoRoots) ?? (await gitTopLevel(root, signal));
        // Repositories living inside this root: git never descends into them, so
        // each one needs its own query no matter whether the root itself is a repo.
        const nested = repoRoots.filter(repoRoot => repoRoot !== root && isSameOrInside(repoRoot, root));

        const contained = [...new Set([...nested, ...(await scanContainerForRepos(root, signal))])];

        if (enclosing != undefined) {
            const repoTop = normalize(enclosing);
            log.debug(
                `${root}: inside repository ${repoTop}` +
                    (repoTop === root ? "" : " (a subdirectory — the search may widen to the repository top)") +
                    (contained.length > 0 ? `, containing ${contained.length} nested repository/ies` : "")
            );
            addGitScope(root, repoTop);
            for (const nestedRepo of contained) addGitScope(nestedRepo, nestedRepo);
            continue;
        }

        // The root is not inside any repository — it is (at most) a container of them.
        log.warn(
            `${root} is not inside a git repository: ${contained.length} repository/ies found directly inside it, ` +
                "the rest of the folder has to be scanned from disk (slow on large trees)."
        );
        for (const repo of contained) addGitScope(repo, repo);
        scopes.push({ kind: "walk", dir: root, excludeDirs: contained });
    }

    log.debug(`Planned ${scopes.length} search scope(s) in ${elapsed()} ms: ${formatList(scopes.map(describeScope))}`);
    return scopes;
}

function describeScope(scope: SearchScope): string {
    if (scope.kind === "walk") {
        return `walk ${scope.dir}` + (scope.excludeDirs.length > 0 ? ` (−${scope.excludeDirs.length} repo dirs)` : "");
    }
    return `git ${scope.dir}` + (scope.repoTop === scope.dir ? "" : ` (repo ${scope.repoTop})`);
}
