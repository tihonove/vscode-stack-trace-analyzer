import * as vscode from "vscode";
import { FileSearcher, VscodeWorkspaceFileSearcher } from "../workspaceFileResolver";
import { IProgressReporter } from "../utils/progressTracker";
import { IndexedFileSearcher } from "./indexedFileSearcher";

/**
 * Builds the file searcher used by the extension from the `stack-trace-analyzer.search.*`
 * feature flags. The enabled method with the highest priority wins; VS Code's
 * `VscodeWorkspaceFileSearcher` is the base fallback when no flag is set. New
 * strategies (e.g. a future `search.native`) slot in as another flag + branch,
 * ordered fastest/preferred first.
 *
 * The fast methods are wrapped in a composite that transparently falls back to
 * `VscodeWorkspaceFileSearcher` if the fast path throws, so a resolver hiccup
 * never breaks stack-trace analysis.
 */
export function createFileSearcher(): FileSearcher {
    const config = vscode.workspace.getConfiguration("stack-trace-analyzer");
    const fallback = new VscodeWorkspaceFileSearcher();

    // Priority order, fastest/preferred first. (Future: config.get("search.native").)
    if (config.get<boolean>("search.gitIndex", false)) {
        return new CompositeFileSearcher(new IndexedFileSearcher({ useGitIndex: true }), fallback);
    }
    if (config.get<boolean>("search.filesystem", false)) {
        return new CompositeFileSearcher(new IndexedFileSearcher({ useGitIndex: false }), fallback);
    }
    return fallback;
}

class CompositeFileSearcher implements FileSearcher {
    public constructor(
        private readonly primary: FileSearcher,
        private readonly fallback: FileSearcher
    ) {}

    public async findFile(
        filePath: string,
        cancellationToken: vscode.CancellationToken,
        progress: IProgressReporter
    ): Promise<string | undefined> {
        try {
            return await this.primary.findFile(filePath, cancellationToken, progress);
        } catch {
            return await this.fallback.findFile(filePath, cancellationToken, progress);
        }
    }

    public async findFiles(
        filePaths: string[],
        cancellationToken: vscode.CancellationToken,
        progress: IProgressReporter
    ): Promise<Map<string, string | undefined>> {
        try {
            if (this.primary.findFiles != undefined) {
                return await this.primary.findFiles(filePaths, cancellationToken, progress);
            }
        } catch {
            // fall through to the per-path fallback below
        }
        const result = new Map<string, string | undefined>();
        for (const filePath of filePaths) {
            result.set(filePath, await this.fallback.findFile(filePath, cancellationToken, progress));
        }
        return result;
    }
}
