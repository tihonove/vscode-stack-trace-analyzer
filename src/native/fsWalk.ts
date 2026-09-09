import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { createScopedLogger, startTimer } from "../utils/logger";

const log = createScopedLogger("walk");

/** A walk slower than this is the usual culprit behind a sluggish search. */
const SLOW_WALK_MS = 1500;

// Directory names skipped entirely while walking. Mirrors (and slightly extends)
// the exclude behavior of the previous VS Code `findFiles` search.
export const IGNORED_DIRS = new Set([".git", "node_modules", ".hg", ".svn", "bin", "obj", ".vs", "dist", "out", ".idea"]);

const MAX_CONCURRENT_READDIRS = 16;

/**
 * Walks `root` and collects absolute paths of files whose lowercased basename is
 * in `wanted`. Symlinks are not followed. vscode-free so it can back both the
 * extension and the tests. Concurrency is bounded to avoid exhausting file
 * descriptors on huge trees.
 *
 * `excludeDirs` holds absolute directories to skip entirely — used to carve the
 * git repositories discovered inside a non-repo workspace folder out of the walk,
 * since those are served by `git ls-files` instead.
 */
export async function walkForBasenames(
    root: string,
    wanted: ReadonlySet<string>,
    signal?: AbortSignal,
    excludeDirs: ReadonlyArray<string> = []
): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    const excluded = new Set(excludeDirs.map(dir => path.resolve(dir).toLowerCase()));
    const elapsed = startTimer();
    let directoriesVisited = 0;
    let active = 0;
    const pending: Array<() => void> = [];

    const acquire = (): Promise<void> => {
        if (active < MAX_CONCURRENT_READDIRS) {
            active++;
            return Promise.resolve();
        }
        return new Promise<void>(resolve => pending.push(resolve)).then(() => {
            active++;
        });
    };
    const release = (): void => {
        active--;
        pending.shift()?.();
    };

    const walk = async (dir: string): Promise<void> => {
        if (signal?.aborted) return;
        await acquire();
        let entries;
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        } finally {
            release();
        }

        directoriesVisited++;
        const subdirs: string[] = [];
        for (const entry of entries) {
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                if (IGNORED_DIRS.has(entry.name)) continue;
                const subdir = path.join(dir, entry.name);
                if (excluded.has(path.resolve(subdir).toLowerCase())) continue;
                subdirs.push(subdir);
            } else if (entry.isFile()) {
                const nameLower = entry.name.toLowerCase();
                if (wanted.has(nameLower)) {
                    const list = result.get(nameLower);
                    const fullPath = path.join(dir, entry.name);
                    if (list) list.push(fullPath);
                    else result.set(nameLower, [fullPath]);
                }
            }
        }

        await Promise.all(subdirs.map(walk));
    };

    await walk(root);

    const matches = [...result.values()].reduce((total, paths) => total + paths.length, 0);
    const ms = elapsed();
    const message =
        `Walked ${directoriesVisited} directory/ies under ${root} in ${ms} ms: ` +
        `${matches} match(es) for ${wanted.size} basename(s)` +
        (signal?.aborted ? " (aborted)" : "");
    // A disk walk means git could not serve this area; on a big tree it is what a
    // user experiences as "the search hangs".
    if (ms >= SLOW_WALK_MS) log.warn(message);
    else log.debug(message);
    return result;
}
