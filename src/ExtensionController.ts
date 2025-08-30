import * as vscode from "vscode";
import { StackTraceWebViewPanel } from "./webview/StackTraceWebViewPanel";
import { Token } from "./TokenMeta";
import { getPossibleFilePathsToSearch, splitIntoTokens } from "./stackTraceSplitter";

type StackTraceInfo = {
    source: string;
    lines?: Token[][];
};

export class ExtensionController {
    private readonly context: vscode.ExtensionContext;
    private stackTraceInfos: StackTraceInfo[] = [];
    private view: StackTraceWebViewPanel | undefined;
    private currentStackTraceFromLast = 0;
    private isVcsIntegrationEnabled = true;

    public constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public executeSelectPrevStackTraceCommand() {
        this.updateCurrentStackTraceIndex(x => x + 1);
    }

    public executeSelectNextStackTraceCommand() {
        this.updateCurrentStackTraceIndex(x => x - 1);
    }

    public async executeAnalyzeStackTraceFromClipboardCommand(): Promise<void> {
        if (this.view == undefined) await vscode.commands.executeCommand("stack-trace-analyzer.root.focus");
        if (this.view != undefined) this.view.show();

        const clipboardContent = await vscode.env.clipboard.readText();
        if (clipboardContent === this.stackTraceInfos[this.stackTraceInfos.length - 1]?.source) {
            this.updateCurrentStackTraceIndex(_ => 0);
            return;
        }

        const stackTraceInfo: StackTraceInfo = { source: clipboardContent };
        this.stackTraceInfos.push(stackTraceInfo);

        this.currentStackTraceFromLast = 0;
        this.normalizeCurrentIndex();
        this.updateContext();

        await vscode.window.withProgress(
            {
                location: { viewId: "stack-trace-analyzer.root" },
                title: "Analyzing stack trace...",
                cancellable: true,
            },
            async (progress, cancellationToken) => {
                progress.report({ message: "Parsing stacktrace" });
                stackTraceInfo.lines = splitIntoTokens(clipboardContent, (progressIncrementValue: number) => {
                    progress.report({ increment: progressIncrementValue * 10 });
                });
                if (stackTraceInfo.lines) {
                    this.showStackTraceTokensInWebView(stackTraceInfo.lines.map(x => x.map(t => [t[0]])));
                }

                progress.report({ message: "Searching files" });
                if (stackTraceInfo.lines) {
                    stackTraceInfo.lines = await this.echrichWorkspacePathsInToken(
                        stackTraceInfo.lines,
                        cancellationToken,
                        (progressIncrementValue: number) => progress.report({ increment: progressIncrementValue * 90 })
                    );
                }
                this.storeStackTracesToWorkspaceState();

                if (this.getCurrentStackTraceInfo() == stackTraceInfo && stackTraceInfo.lines) {
                    this.showStackTraceTokensInWebView(stackTraceInfo.lines);
                }

                if (this.isVcsIntegrationEnabled && stackTraceInfo.lines) {
                    stackTraceInfo.lines = await this.enrichWorkspacePathsWithVscInfo(
                        stackTraceInfo.lines,
                        cancellationToken,
                        (_: number) => {}
                    );
                    this.storeStackTracesToWorkspaceState();
                    if (this.getCurrentStackTraceInfo() == stackTraceInfo && stackTraceInfo.lines) {
                        this.showStackTraceTokensInWebView(stackTraceInfo.lines);
                    }
                }

                if (this.view == undefined) {
                    vscode.window.showInformationMessage("Extension is still initializing, please wait...");
                }
            }
        );
    }

    public executeClearAnalyizedStackTracesCommand() {
        if (this.view == undefined) return;
        this.view.clearAnalyizedStackTraces();
        this.stackTraceInfos.splice(0, this.stackTraceInfos.length);
        this.currentStackTraceFromLast = 0;
        this.updateContext();
        this.storeStackTracesToWorkspaceState();
    }

    public async executeDisableVcsIntegrationCommand() {
        this.isVcsIntegrationEnabled = false;
        this.updateContext();

        // Remove VCS info from all stack traces
        for (const stackTrace of this.stackTraceInfos) {
            if (stackTrace.lines) {
                stackTrace.lines = this.removeVcsInfoFromLines(stackTrace.lines);
            }
        }

        // Update current view
        const currentStackTrace = this.getCurrentStackTraceInfo();
        if (currentStackTrace && currentStackTrace.lines) {
            this.showStackTraceTokensInWebView(currentStackTrace.lines);
        }

        this.storeStackTracesToWorkspaceState();
        vscode.window.showInformationMessage("VCS integration disabled");
    }

    public async executeEnableVcsIntegrationCommand(): Promise<void> {
        this.isVcsIntegrationEnabled = true;
        this.updateContext();

        if (this.stackTraceInfos.length > 0) {
            await vscode.window.withProgress(
                {
                    location: { viewId: "stack-trace-analyzer.root" },
                    title: "Enriching with VCS info...",
                },
                async (_progress, cancellationToken) => {
                    const stackTrace = this.getCurrentStackTraceInfo();
                    if (stackTrace && stackTrace.lines) {
                        stackTrace.lines = await this.enrichWorkspacePathsWithVscInfo(
                            stackTrace.lines,
                            cancellationToken,
                            (_: number) => {}
                        );
                    }
                    const currentStackTrace = this.getCurrentStackTraceInfo();
                    if (currentStackTrace && currentStackTrace.lines) {
                        this.showStackTraceTokensInWebView(currentStackTrace.lines);
                    }
                    this.storeStackTracesToWorkspaceState();
                }
            );
        }

        vscode.window.showInformationMessage("VCS integration enabled");
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
        if (this.currentStackTraceFromLast >= this.stackTraceInfos.length)
            this.currentStackTraceFromLast = this.stackTraceInfos.length - 1;
    }

    private updateCurrentStackTraceIndex(updateFn: (x: number) => number) {
        this.currentStackTraceFromLast = updateFn(this.currentStackTraceFromLast);
        this.normalizeCurrentIndex();
        const current = this.getCurrentStackTraceInfo();
        if (current != null && current.lines != null) this.showStackTraceTokensInWebView(current.lines);
        this.updateContext();
    }

    private async enrichWorkspacePathsWithVscInfo(
        lines: Token[][],
        cancellationToken: vscode.CancellationToken,
        _onProgress: (progress: number) => void
    ): Promise<Token[][]> {
        try {
            if (cancellationToken.isCancellationRequested) {
                return lines;
            }

            // Check if VCS integration is disabled
            if (!this.isVcsIntegrationEnabled) {
                return lines;
            }

            const gitExtension = vscode.extensions.getExtension("vscode.git");
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
                                                maxEntries: 1,
                                            });
                                            if (historyItem && historyItem.length > 0) {
                                                return [
                                                    line,
                                                    { ...meta, vcsInfo: { lastChangeCommit: historyItem[0] } },
                                                ];
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
                    );
                })
            );
        } catch (error) {
            return lines;
        }
    }

    private async echrichWorkspacePathsInToken(
        lines: Token[][],
        cancellationToken: vscode.CancellationToken,
        onProgress: (progress: number) => void
    ): Promise<Token[][]> {
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
                return [line, meta];
            });
        });
    }
}
