import * as fsp from "node:fs/promises";
import * as path from "node:path";

// Directory names skipped entirely while walking. Mirrors (and slightly extends)
// the exclude behavior of the previous VS Code `findFiles` search.
const IGNORED_DIRS = new Set([".git", "node_modules", ".hg", ".svn", "bin", "obj", ".vs", "dist", "out", ".idea"]);

const MAX_CONCURRENT_READDIRS = 16;

/**
 * Walks `root` and collects absolute paths of files whose lowercased basename is
 * in `wanted`. Symlinks are not followed. vscode-free so it can back both the
 * extension and the tests. Concurrency is bounded to avoid exhausting file
 * descriptors on huge trees.
 */
export async function walkForBasenames(
    root: string,
    wanted: ReadonlySet<string>,
    signal?: AbortSignal
): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
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

        const subdirs: string[] = [];
        for (const entry of entries) {
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                if (!IGNORED_DIRS.has(entry.name)) subdirs.push(path.join(dir, entry.name));
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
    return result;
}
