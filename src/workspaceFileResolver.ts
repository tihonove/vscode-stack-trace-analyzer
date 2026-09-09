import * as vscode from "vscode";
import { Token } from "./TokenMeta";
import { getPossibleFilePathsToSearch } from "./stackTraceSplitter";
import { IProgressReporter, ProgressSplitter } from "./utils/progressTracker";
import { createScopedLogger, startTimer } from "./utils/logger";

const log = createScopedLogger("vscode-search");

/** One frame taking longer than this in the legacy searcher is worth flagging. */
const SLOW_FIND_FILE_MS = 1500;

export interface FileSearcher {
    findFile(filePath: string, cancellationToken: vscode.CancellationToken, progress: IProgressReporter): Promise<string | undefined>;
    /**
     * Optional batch resolution: resolve many file paths in one round-trip.
     * When present, `enrichTokensWithWorkspacePaths` prefers it over per-token
     * `findFile` (fewer traversals, cross-frame dedup). Returns a map keyed by
     * the input file paths (undefined = not found).
     */
    findFiles?(
        filePaths: string[],
        cancellationToken: vscode.CancellationToken,
        progress: IProgressReporter
    ): Promise<Map<string, string | undefined>>;
}

export class VscodeWorkspaceFileSearcher implements FileSearcher {
    async findFile(filePath: string, cancellationToken: vscode.CancellationToken, progress: IProgressReporter): Promise<string | undefined> {
        const folders = vscode.workspace.workspaceFolders ?? [];
        const smartPaths = computeSmartCandidatePaths(filePath, folders);
        const elapsed = startTimer();
        // Each suffix candidate below costs two full workspace searches, so the log
        // records how many of them a single frame actually paid for.
        let globSearches = 0;
        const report = (outcome: string): void => {
            const ms = elapsed();
            const message = `findFile("${filePath}") → ${outcome} after ${globSearches} workspace search(es) (${ms} ms)`;
            if (ms >= SLOW_FIND_FILE_MS) log.warn(message);
            else log.debug(message);
        };

        // Smart candidates: construct absolute URI directly, no findFiles needed
        for (const smartPath of smartPaths) {
            if (cancellationToken.isCancellationRequested) {
                report("cancelled");
                progress.complete();
                return undefined;
            }
            try {
                await vscode.workspace.fs.stat(smartPath);
                report(`${smartPath.fsPath} (smart candidate)`);
                progress.complete();
                return smartPath.fsPath;
            } catch {
                // file doesn't exist at this path, try next
            }
        }

        // Fallback: findFiles for all suffix candidates
        const possibleFilePaths = Array.from(getPossibleFilePathsToSearch(filePath));
        const splitter = new ProgressSplitter(progress);
        const candidateProgresses = possibleFilePaths.map(() => splitter.createChild());

        for (let i = 0; i < possibleFilePaths.length; i++) {
            if (cancellationToken.isCancellationRequested) {
                report("cancelled");
                progress.complete();
                return undefined;
            }

            const possibleFilePath = possibleFilePaths[i]!;
            const candidateProgress = candidateProgresses[i]!;

            const uris1 = await vscode.workspace.findFiles(possibleFilePath, null, 1, cancellationToken);
            globSearches++;
            if (uris1.length > 0) {
                candidateProgress.complete();
                report(uris1[0]!.fsPath);
                progress.complete();
                return uris1[0]!.fsPath;
            }

            const uris2 = await vscode.workspace.findFiles(
                "**/*/" + possibleFilePath,
                "**/node_modules/**",
                1,
                cancellationToken
            );
            globSearches++;
            candidateProgress.complete();
            if (uris2.length > 0) {
                report(uris2[0]!.fsPath);
                progress.complete();
                return uris2[0]!.fsPath;
            }
        }
        report("not found");
        progress.complete();
        return undefined;
    }
}

export function computeSmartCandidatePaths(
    filePath: string,
    folders: ReadonlyArray<{ uri: vscode.Uri }>
): vscode.Uri[] {
    const parts = filePath.split(/[\/\\]/);
    const results: vscode.Uri[] = [];
    for (const folder of folders) {
        // The directory's on-disk basename is what appears in a stack-trace path from a
        // build agent — a folder's VSCode display name is a UI-only label that never does.
        const uriSegments = folder.uri.path.split("/").filter(segment => segment.length > 0);
        const folderName = uriSegments[uriSegments.length - 1]?.toLowerCase();
        if (folderName == undefined) continue;
        for (let i = 0; i < parts.length - 1; i++) {
            if (parts[i]!.toLowerCase() === folderName) {
                results.push(vscode.Uri.joinPath(folder.uri, parts.slice(i + 1).join("/")));
            }
        }
    }
    return results;
}

export async function enrichTokensWithWorkspacePaths(
    lines: Token[][],
    fileSearcher: FileSearcher,
    cancellationToken: vscode.CancellationToken,
    progress: IProgressReporter,
    onLineResolved?: (currentLines: Token[][]) => void
): Promise<Token[][]> {
    if (fileSearcher.findFiles != undefined) {
        return enrichTokensBatched(lines, fileSearcher.findFiles.bind(fileSearcher), cancellationToken, progress, onLineResolved);
    }

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

/**
 * Batch variant used when the searcher exposes `findFiles`: collect every
 * distinct file path across all lines, resolve them in a single round-trip
 * (cross-frame dedup), then map the results back onto the tokens.
 */
async function enrichTokensBatched(
    lines: Token[][],
    findFiles: NonNullable<FileSearcher["findFiles"]>,
    cancellationToken: vscode.CancellationToken,
    progress: IProgressReporter,
    onLineResolved?: (currentLines: Token[][]) => void
): Promise<Token[][]> {
    const result: Token[][] = lines.map(l => l.map(([t]) => [t]));

    type FilePathSlot = { lineIndex: number; tokenIndex: number; line: string; filePath: string; tokenMeta: object };
    const filePathSlots: FilePathSlot[] = [];
    lines.forEach((lineTokens, lineIndex) => {
        lineTokens.forEach(([line, meta], tokenIndex) => {
            if (meta == undefined) return;
            if (meta.type === "FilePath") {
                const { filePath, ...tokenMeta } = meta;
                filePathSlots.push({ lineIndex, tokenIndex, line, filePath, tokenMeta });
            } else if (meta.type === "Symbol") {
                result[lineIndex]![tokenIndex] = [line, { ...meta }];
            }
        });
    });

    if (cancellationToken.isCancellationRequested || filePathSlots.length === 0) {
        progress.complete();
        onLineResolved?.(result);
        return result;
    }

    const distinctFilePaths = [...new Set(filePathSlots.map(slot => slot.filePath))];
    log.debug(
        `${filePathSlots.length} file-path token(s) across ${lines.length} line(s) ` +
            `collapse into ${distinctFilePaths.length} distinct path(s).`
    );
    const resolved = await findFiles(distinctFilePaths, cancellationToken, progress);

    for (const slot of filePathSlots) {
        const fileUriPath = resolved.get(slot.filePath);
        if (fileUriPath != undefined) {
            result[slot.lineIndex]![slot.tokenIndex] = [slot.line, { ...slot.tokenMeta, type: "FilePath", fileUriPath } as any];
        }
    }

    progress.complete();
    onLineResolved?.(result);
    return result;
}
