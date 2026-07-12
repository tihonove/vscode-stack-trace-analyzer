import * as vscode from "vscode";
import { FileSearcher } from "../workspaceFileResolver";
import { IProgressReporter } from "../utils/progressTracker";
import { resolveFilePaths } from "./candidateResolver";

/**
 * Fast `FileSearcher` backed by the vscode-free resolver core: smart-candidate
 * stat → targeted `git ls-files` → filesystem walk. It only touches VS Code to
 * read the workspace folders and to bridge the cancellation token.
 */
export class IndexedFileSearcher implements FileSearcher {
    public constructor(private readonly options: { useGitIndex?: boolean } = {}) {}

    public async findFile(
        filePath: string,
        cancellationToken: vscode.CancellationToken,
        progress: IProgressReporter
    ): Promise<string | undefined> {
        const resolved = await this.findFiles([filePath], cancellationToken, progress);
        return resolved.get(filePath);
    }

    public async findFiles(
        filePaths: string[],
        cancellationToken: vscode.CancellationToken,
        progress: IProgressReporter
    ): Promise<Map<string, string | undefined>> {
        const roots = (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath);
        const abortController = new AbortController();
        const cancellationSubscription = cancellationToken.onCancellationRequested(() => abortController.abort());
        if (cancellationToken.isCancellationRequested) abortController.abort();
        try {
            return await resolveFilePaths(filePaths, roots, {
                signal: abortController.signal,
                useGitIndex: this.options.useGitIndex ?? true,
            });
        } finally {
            cancellationSubscription.dispose();
            progress.complete();
        }
    }
}
