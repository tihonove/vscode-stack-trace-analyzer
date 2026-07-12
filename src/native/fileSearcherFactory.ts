import * as vscode from "vscode";
import { FileSearcher, VscodeWorkspaceFileSearcher } from "../workspaceFileResolver";
import { IProgressReporter } from "../utils/progressTracker";
import { IndexedFileSearcher } from "./indexedFileSearcher";

export type SearchMode = "gitIndex" | "filesystem" | "vscode";

/**
 * Builds the file searcher used by the extension, per `stack-trace-analyzer.searchMode`:
 * - `vscode`     — the original `VscodeWorkspaceFileSearcher`.
 * - `gitIndex`   — the fast indexed searcher using `git ls-files` (walk fallback).
 * - `filesystem` — the fast indexed searcher, always scanning the filesystem.
 *
 * The indexed modes return a composite that transparently falls back to
 * `VscodeWorkspaceFileSearcher` if the fast path throws, so a resolver hiccup
 * never breaks stack-trace analysis.
 */
export function createFileSearcher(): FileSearcher {
    const fallback = new VscodeWorkspaceFileSearcher();
    const mode = vscode.workspace.getConfiguration("stack-trace-analyzer").get<SearchMode>("searchMode", "vscode");
    if (mode === "vscode") return fallback;
    return new CompositeFileSearcher(new IndexedFileSearcher({ useGitIndex: mode !== "filesystem" }), fallback);
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
