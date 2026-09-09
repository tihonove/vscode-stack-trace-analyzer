import * as vscode from "vscode";
import { FileSearcher } from "../workspaceFileResolver";
import { IProgressReporter } from "../utils/progressTracker";
import { resolveFilePaths } from "./candidateResolver";
import { getKnownRepoRoots } from "./vscodeGitRepos";
import { createScopedLogger, formatList, startTimer } from "../utils/logger";

const log = createScopedLogger("searcher");

/**
 * Fast `FileSearcher` backed by the vscode-free resolver core: smart-candidate
 * stat → targeted `git ls-files` per search scope → widening to the repository
 * top → `git ls-files --ignored`, with a filesystem walk only for areas git
 * cannot serve. It only touches VS Code to read the workspace folders, to pick up
 * the repositories `vscode.git` already found, and to bridge the cancellation token.
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
        const repoRoots = getKnownRepoRoots();
        const abortController = new AbortController();
        const cancellationSubscription = cancellationToken.onCancellationRequested(() => abortController.abort());
        if (cancellationToken.isCancellationRequested) abortController.abort();

        log.info(`Resolving ${filePaths.length} stack-trace path(s) across ${roots.length} workspace folder(s).`);
        log.debug(`Workspace folders: ${formatList(roots)}`);
        // An empty list here means the search planner has to discover the repositories
        // itself (git rev-parse + a depth-1 probe) instead of reusing what VS Code knows.
        log.debug(`Repositories known to vscode.git: ${formatList(repoRoots)}`);
        const elapsed = startTimer();
        try {
            const resolved = await resolveFilePaths(filePaths, roots, {
                signal: abortController.signal,
                useGitIndex: this.options.useGitIndex ?? true,
                repoRoots,
            });
            const found = [...resolved.values()].filter(candidate => candidate != undefined).length;
            const cancelled = cancellationToken.isCancellationRequested ? " (cancelled)" : "";
            log.info(`Resolved ${found}/${resolved.size} distinct path(s) in ${elapsed()} ms${cancelled}.`);
            return resolved;
        } catch (error) {
            log.warn(`The git-index search failed after ${elapsed()} ms.`, error);
            throw error;
        } finally {
            cancellationSubscription.dispose();
            progress.complete();
        }
    }
}
