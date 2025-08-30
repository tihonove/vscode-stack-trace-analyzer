import * as vscode from 'vscode';
import { StackTraceWebViewPanel } from './webview/StackTraceWebViewPanel';
import { Token } from './TokenMeta';
import { getPossibleFilePathsToSearch } from './stackTraceSplitter';

type StackTraceInfo = {
    source: string;
    lines?: Token[][];
};

export class ExtensionController {
    private view: StackTraceWebViewPanel | undefined;
    private stackTraceInfos: StackTraceInfo[] = [];
    private currentStackTraceFromLast = 0;
    private isVcsIntegrationEnabled = true;


    public constructor(private context: vscode.ExtensionContext) {

    }

    public executeSelectPrevStackTraceCommand() {
        this.updateCurrentStackTraceIndex(x => x + 1);
    }

    public setWebView(webviewView: vscode.WebviewView) {
        this.view = new StackTraceWebViewPanel(this.context, webviewView);
    }

    public init() {
        this.restoreStackTracesFromWorkspaceState();
        this.updateContext();
    }

    private restoreStackTracesFromWorkspaceState() {
        const context = this.context;
        const prevStackTraceInfos = context.workspaceState.get("stack-trace-analyzer.stackTraceInfos", []);
        this.stackTraceInfos.splice(0, this.stackTraceInfos.length);
        this.stackTraceInfos.push(...prevStackTraceInfos);
        this.isVcsIntegrationEnabled = context.workspaceState.get("stack-trace-analyzer.vcsIntegrationEnabled", true);
    }
    
    private storeStackTracesToWorkspaceState() {
        const context = this.context;
        context.workspaceState.update("stack-trace-analyzer.stackTraceInfos", this.stackTraceInfos.slice(-10));
        context.workspaceState.update("stack-trace-analyzer.vcsIntegrationEnabled", this.isVcsIntegrationEnabled);
    }
    
    private updateContext() {
        vscode.commands.executeCommand(
            "setContext",
            "stack-trace-analyzer.canSelectPrevStackTrace",
            this.currentStackTraceFromLast < this.stackTraceInfos.length - 1
        );
        vscode.commands.executeCommand(
            "setContext",
            "stack-trace-analyzer.canSelectNextStackTrace",
            this.currentStackTraceFromLast > 0
        );
        vscode.commands.executeCommand(
            "setContext",
            "stack-trace-analyzer.vcsIntegrationEnabled",
            this.isVcsIntegrationEnabled
        );
    }


    private showStackTraceTokensInWebView(lines: Token[][]) {
        if (lines == undefined) return;
        if (this.view == undefined) return;
        this.view.setStackTraceTokens(lines);
        
    }
    
    private getCurrentStackTraceInfo(): StackTraceInfo | undefined {
        return this.stackTraceInfos[this.stackTraceInfos.length - 1 - this.currentStackTraceFromLast];
    }
    
    private normalizeCurrentIndex() {
        if (this.currentStackTraceFromLast < 0) this.currentStackTraceFromLast = 0;
        if (this.currentStackTraceFromLast >= this.stackTraceInfos.length) this.currentStackTraceFromLast = this.stackTraceInfos.length - 1;
    }
    
    private updateCurrentStackTraceIndex(updateFn: (x: number) => number) {
        this.currentStackTraceFromLast = updateFn(this.currentStackTraceFromLast);
        this.normalizeCurrentIndex();
        const current = this.getCurrentStackTraceInfo();
        if (current != null && current.lines != null) 
            this.showStackTraceTokensInWebView(current.lines);
        this.updateContext();
    }
    
    
    private async enrichWorkspacePathsWithVscInfo(lines: Token[][], cancellationToken: vscode.CancellationToken, onProgress: (progress: number) => void): Promise<Token[][]> {
        try {
            if (cancellationToken.isCancellationRequested) {
                return lines;
            }
            
            // Check if VCS integration is disabled
            if (!this.isVcsIntegrationEnabled) {
                return lines;
            }
            
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension || !gitExtension.isActive) {
                return lines;
            }
            
            const api = gitExtension.exports.getAPI(1);
            if (!api || !api.repositories || api.repositories.length === 0) {
                return lines;
            }
            
            return await Promise.all(
                lines.map(async lineTokens => {
                    return await Promise.all(
                        lineTokens.map(async ([line, meta]) => {
                            if (cancellationToken.isCancellationRequested) return [line];
                            if (meta == undefined) return [line];
                            if (meta.type === "FilePath" && meta.fileUriPath) {
                                try {
                                    for (const repository of api.repositories) {
                                        if (cancellationToken.isCancellationRequested) return [line, meta];
                                        try {
                                            const historyItem = await repository.log({ 
                                                path: meta.fileUriPath, 
                                                maxEntries: 1 
                                            });
                                            if (historyItem && historyItem.length > 0) {
                                                return [line, { ...meta, vcsInfo: { lastChangeCommit: historyItem[0] } }];
                                            }
                                        } catch (repoError) {
                                            continue;
                                        }
                                    }
                                } catch {
                                    // skip
                                }
                            }
                            return [line, meta];
                        })
                    )
                })
            );
        } catch (error) {
            return lines;
        }
    }

    private async echrichWorkspacePathsInToken(lines: Token[][], cancellationToken: vscode.CancellationToken, onProgress: (progress: number) => void): Promise<Token[][]> {
        let totalFilePathTokens = 0;
        for (const lineTokens of lines) {
            for (const [_, meta] of lineTokens) {
                if (meta && meta.type === "FilePath") {
                    totalFilePathTokens += 1;
                }
            }
        }

        return await Promise.all(
            lines.map(async (lineTokens): Promise<Token[]> => {
                return await Promise.all(
                    lineTokens.map(async ([line, meta]): Promise<Token> => {
                        if (meta == undefined || cancellationToken.isCancellationRequested) return [line];
                        if (meta.type === "FilePath") {
                            const { filePath, ...tokenMeta } = meta;
                            for (const possibleFilePath of getPossibleFilePathsToSearch(filePath)) {                            
                                const uris1 = await vscode.workspace.findFiles(
                                    possibleFilePath,
                                    null,
                                    1,
                                    cancellationToken
                                );
                                if (uris1.length > 0) {
                                    if (onProgress && totalFilePathTokens > 0) {
                                        onProgress(1 / totalFilePathTokens);
                                    }
                                    return [line, { ...tokenMeta, fileUriPath: uris1[0]?.path ?? "" }];
                                } else {
                                    const uris2 = await vscode.workspace.findFiles(
                                        "**/*/" + possibleFilePath,
                                        "**/node_modules/**",
                                        1,
                                        cancellationToken
                                    );
                                    if (uris2.length > 0) {
                                        if (onProgress && totalFilePathTokens > 0) {
                                            onProgress(1 / totalFilePathTokens);
                                        }
                                        return [line, { ...tokenMeta, fileUriPath: uris2[0]?.path ?? "" }];
                                    }
                                }
                            }
                            if (onProgress && totalFilePathTokens > 0) {
                                onProgress(1 / totalFilePathTokens);
                            }
                        } else if (meta.type === "Symbol") {
                            return [line, { ...meta }];
                        }
                        return [line];
                    })
                );
            })
        );
    }

    private removeVcsInfoFromLines(lines: Token[][]): Token[][] {
        return lines.map(lineTokens => {
            return lineTokens.map(([line, meta]): Token => {
                if (meta && "vcsInfo" in meta) {
                    const { vcsInfo, ...metaWithoutVcs } = meta;
                    return [line, metaWithoutVcs];
                }
                return [line, meta]
            });
        });
    }
}