import * as vscode from "vscode";
import { Token } from "./TokenMeta";
import { getPossibleFilePathsToSearch } from "./stackTraceSplitter";
import { IProgressReporter, ProgressSplitter } from "./utils/progressTracker";

export interface FileSearcher {
    findFile(filePath: string, cancellationToken: vscode.CancellationToken, progress: IProgressReporter): Promise<string | undefined>;
}

export class VscodeWorkspaceFileSearcher implements FileSearcher {
    async findFile(filePath: string, cancellationToken: vscode.CancellationToken, progress: IProgressReporter): Promise<string | undefined> {
        const possibleFilePaths = Array.from(getPossibleFilePathsToSearch(filePath));
        const splitter = new ProgressSplitter(progress);
        const candidateProgresses = possibleFilePaths.map(() => splitter.createChild());

        for (let i = 0; i < possibleFilePaths.length; i++) {
            if (cancellationToken.isCancellationRequested) {
                progress.complete();
                return undefined;
            }

            const possibleFilePath = possibleFilePaths[i]!;
            const candidateProgress = candidateProgresses[i]!;

            const uris1 = await vscode.workspace.findFiles(possibleFilePath, null, 1, cancellationToken);
            if (uris1.length > 0) {
                candidateProgress.complete();
                progress.complete();
                return uris1[0]!.path;
            }

            const uris2 = await vscode.workspace.findFiles(
                "**/*/" + possibleFilePath,
                "**/node_modules/**",
                1,
                cancellationToken
            );
            candidateProgress.complete();
            if (uris2.length > 0) {
                progress.complete();
                return uris2[0]!.path;
            }
        }
        progress.complete();
        return undefined;
    }
}

export async function enrichTokensWithWorkspacePaths(
    lines: Token[][],
    fileSearcher: FileSearcher,
    cancellationToken: vscode.CancellationToken,
    progress: IProgressReporter,
    onLineResolved?: (currentLines: Token[][]) => void
): Promise<Token[][]> {
    const result: Token[][] = lines.map(l => l.map(([t]) => [t]));
    const splitter = new ProgressSplitter(progress);
    await Promise.all(
        lines.map(async (lineTokens, lineIndex): Promise<void> => {
            const resolvedLine = await Promise.all(
                lineTokens.map(async ([line, meta]): Promise<Token> => {
                    if (meta == undefined || cancellationToken.isCancellationRequested) return [line];
                    if (meta.type === "FilePath") {
                        const { filePath, ...tokenMeta } = meta;
                        const tokenProgress = splitter.createChild();
                        const fileUriPath = await fileSearcher.findFile(filePath, cancellationToken, tokenProgress);
                        tokenProgress.complete();
                        if (fileUriPath != undefined) {
                            return [line, { ...tokenMeta, fileUriPath }];
                        }
                    } else if (meta.type === "Symbol") {
                        return [line, { ...meta }];
                    }
                    return [line];
                })
            );
            result[lineIndex] = resolvedLine;
            onLineResolved?.(result);
        })
    );
    return result;
}
