import vscode from "vscode";
import { splitIntoTokens, getPossibleFilePathsToSearch } from "./stackTraceSplitter";
import { Token } from "./TokenMeta";
import { delay } from "./utils/asyncUtils";

let view: vscode.WebviewView | undefined;

type StackTraceInfo = {
    source: string;
    lines?: Token[][];
};

const stackTraceInfos: StackTraceInfo[] = [];
let currentStackTraceFromLast = 0;
let isVcsIntegrationEnabled = true;

function restoreStackTracesFromWorkspaceState(context: vscode.ExtensionContext) {
    const prevStackTraceInfos = context.workspaceState.get("stack-trace-analyzer.stackTraceInfos", []);
    stackTraceInfos.splice(0, stackTraceInfos.length);
    stackTraceInfos.push(...prevStackTraceInfos);
    
    // Restore VCS integration state
    isVcsIntegrationEnabled = context.workspaceState.get("stack-trace-analyzer.vcsIntegrationEnabled", true);
}

function storeStackTracesToWorkspaceState(context: vscode.ExtensionContext) {
    context.workspaceState.update("stack-trace-analyzer.stackTraceInfos", stackTraceInfos.slice(-10));
    context.workspaceState.update("stack-trace-analyzer.vcsIntegrationEnabled", isVcsIntegrationEnabled);
}

function updateContext() {
    vscode.commands.executeCommand(
        "setContext",
        "stack-trace-analyzer.canSelectPrevStackTrace",
        currentStackTraceFromLast < stackTraceInfos.length - 1
    );
    vscode.commands.executeCommand(
        "setContext",
        "stack-trace-analyzer.canSelectNextStackTrace",
        currentStackTraceFromLast > 0
    );
    vscode.commands.executeCommand(
        "setContext",
        "stack-trace-analyzer.vcsIntegrationEnabled",
        isVcsIntegrationEnabled
    );
}

function showStackTraceTokensInWebView(lines: Token[][]) {
    if (lines == undefined) return;
    if (view == undefined) return;
    view.webview.postMessage({ type: "setStackTraceTokens", lines: lines });
}

function setLoadingState(isLoading: boolean, progress = 0) {
    if (view == undefined) return;
    view.webview.postMessage({ type: "setLoadingState", isLoading: isLoading, progress: progress });
}

function getCurrentStackTraceInfo(): StackTraceInfo | undefined {
    return stackTraceInfos[stackTraceInfos.length - 1 - currentStackTraceFromLast];
}

function normalizeCurrentIndex() {
    if (currentStackTraceFromLast < 0) currentStackTraceFromLast = 0;
    if (currentStackTraceFromLast >= stackTraceInfos.length) currentStackTraceFromLast = stackTraceInfos.length - 1;
}

function updateCurrentStackTraceIndex(updateFn: (x: number) => number) {
    currentStackTraceFromLast = updateFn(currentStackTraceFromLast);
    normalizeCurrentIndex();
    const current = getCurrentStackTraceInfo();
    if (current != null && current.lines != null) 
        showStackTraceTokensInWebView(current.lines);
    updateContext();
}

export function activate(context: vscode.ExtensionContext) {
    const provider = {
        resolveWebviewView: (webviewView: vscode.WebviewView) => {
            view = webviewView;
            webviewView.webview.options = { enableScripts: true };
            webviewView.webview.html = getHtmlForWebview(webviewView.webview, context.extensionUri);
            webviewView.webview.onDidReceiveMessage(async data => {
                switch (data.type) {
                    case "OpenFile": {
                        const tokenMeta = data.tokenMeta;
                        const textDocument = await vscode.workspace.openTextDocument(tokenMeta.fileUriPath);
                        const editor = await vscode.window.showTextDocument(textDocument);
                        if (tokenMeta.line != undefined) {
                            const position = new vscode.Position(tokenMeta.line - 1, (tokenMeta.column ?? 1) - 1);
                            const newSelection = new vscode.Selection(position, position);
                            editor.selection = newSelection;
                            editor.revealRange(newSelection, vscode.TextEditorRevealType.InCenter);
                        }
                        break;
                    }
                    case "GoToSymbol": {
                        const tokenMeta = data.tokenMeta;
                        vscode.commands.executeCommand(
                            "workbench.action.quickOpen",
                            "#" + tokenMeta.symbols.reverse().slice(0, 2).join(" ")
                        );
                        break;
                    }
                }
            });
        },
    };

    context.subscriptions.push(vscode.window.registerWebviewViewProvider("stack-trace-analyzer.root", provider));

    restoreStackTracesFromWorkspaceState(context);
    updateContext();

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.selectPrevStackTrace", async () => {
            updateCurrentStackTraceIndex(x => x + 1);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.selectNextStackTrace", async () => {
            updateCurrentStackTraceIndex(x => x - 1);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.analyzeStackTraceFromClipboard", async () => {
            if (view == undefined) await vscode.commands.executeCommand("stack-trace-analyzer.root.focus");
            if (view != undefined) view.show?.(true);

            const clipboardContent = await vscode.env.clipboard.readText();
            if (clipboardContent === stackTraceInfos[stackTraceInfos.length - 1]?.source) {
                updateCurrentStackTraceIndex(_ => 0);
                return;
            }

            const stackTraceInfo: StackTraceInfo = { source: clipboardContent };
            stackTraceInfos.push(stackTraceInfo);

            currentStackTraceFromLast = 0;
            normalizeCurrentIndex();
            updateContext();

            await vscode.window.withProgress(
                {
                    location: { viewId: "stack-trace-analyzer.root" },
                    title: "Analyzing stack trace...",
                    cancellable: true,
                },
                async (_, cancellationToken) => {
                    setLoadingState(true, 0);
                  
                    stackTraceInfo.lines = splitIntoTokens(clipboardContent, (progress) => {
                        setLoadingState(true, Math.round(progress * 10));
                    });
                    showStackTraceTokensInWebView(stackTraceInfo.lines.map(x => x.map(t => [t[0]])));
                    
                    stackTraceInfo.lines = await echrichWorkspacePathsInToken(
                        stackTraceInfo.lines, 
                        cancellationToken,
                        (progress) => setLoadingState(true, Math.round(10 + progress * 90))
                    );
                    storeStackTracesToWorkspaceState(context);
                                        
                    if (getCurrentStackTraceInfo() == stackTraceInfo) {
                        showStackTraceTokensInWebView(stackTraceInfo.lines);
                    }

                    if (isVcsIntegrationEnabled) {
                        stackTraceInfo.lines = await enrichWorkspacePathsWithVscInfo(
                            stackTraceInfo.lines, 
                            cancellationToken,
                            _ => {}
                        );
                        storeStackTracesToWorkspaceState(context);
                        if (getCurrentStackTraceInfo() == stackTraceInfo) {
                            showStackTraceTokensInWebView(stackTraceInfo.lines);
                        }
                    }


                    if (view == undefined) {
                        vscode.window.showInformationMessage("Extension is still initializing, please wait...");
                    }
                    
                    setLoadingState(true, 100);
                    await delay(300);
                    setLoadingState(false, 0);
                }
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.clearAnalyizedStackTraces", () => {
            if (view == undefined) return;
            view.webview.postMessage({ type: "clearAnalyizedStackTraces" });
            stackTraceInfos.splice(0, stackTraceInfos.length);
            currentStackTraceFromLast = 0;
            updateContext();
            storeStackTracesToWorkspaceState(context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.disableVcsIntegration", async () => {
            isVcsIntegrationEnabled = false;
            updateContext();
            
            // Remove VCS info from all stack traces
            for (const stackTrace of stackTraceInfos) {
                if (stackTrace.lines) {
                    stackTrace.lines = removeVcsInfoFromLines(stackTrace.lines);
                }
            }
            
            // Update current view
            const currentStackTrace = getCurrentStackTraceInfo();
            if (currentStackTrace && currentStackTrace.lines) {
                showStackTraceTokensInWebView(currentStackTrace.lines);
            }
            
            storeStackTracesToWorkspaceState(context);
            vscode.window.showInformationMessage("VCS integration disabled");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.enableVcsIntegration", async () => {
            isVcsIntegrationEnabled = true;
            updateContext();
            
            if (stackTraceInfos.length > 0) {
                await vscode.window.withProgress(
                    {
                        location: { viewId: "stack-trace-analyzer.root" },
                        title: "Enriching with VCS info...",
                    },
                    async (progress, cancellationToken) => {
                        const stackTrace = getCurrentStackTraceInfo();
                        if (stackTrace && stackTrace.lines) {
                            stackTrace.lines = await enrichWorkspacePathsWithVscInfo(
                                stackTrace.lines,
                                cancellationToken,
                                () => {}
                            );
                        }
                        const currentStackTrace = getCurrentStackTraceInfo();
                        if (currentStackTrace && currentStackTrace.lines) {
                            showStackTraceTokensInWebView(currentStackTrace.lines);
                        }                        
                        storeStackTracesToWorkspaceState(context);
                    }
                );
            }
            
            vscode.window.showInformationMessage("VCS integration enabled");
        })
    );
}

async function enrichWorkspacePathsWithVscInfo(lines: Token[][], cancellationToken: vscode.CancellationToken, onProgress: (progress: number) => void): Promise<Token[][]> {
    try {
        if (cancellationToken.isCancellationRequested) {
            return lines;
        }
        
        // Check if VCS integration is disabled
        if (!isVcsIntegrationEnabled) {
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

async function echrichWorkspacePathsInToken(lines: Token[][], cancellationToken: vscode.CancellationToken, onProgress: (progress: number) => void): Promise<Token[][]> {
    let totalFilePathTokens = 0;
    for (const lineTokens of lines) {
        for (const [_, meta] of lineTokens) {
            if (meta && meta.type === "FilePath") {
                totalFilePathTokens += 1;
            }
        }
    }

    let processedPaths = 0;

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
                                processedPaths += 1;
                                if (onProgress) {
                                    onProgress(totalFilePathTokens > 0 ? processedPaths / totalFilePathTokens : 1);
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
                                    processedPaths += 1;
                                    if (onProgress) {
                                        onProgress(totalFilePathTokens > 0 ? processedPaths / totalFilePathTokens : 1);
                                    }
                                    return [line, { ...tokenMeta, fileUriPath: uris2[0]?.path ?? "" }];
                                }
                            }
                        }
                        processedPaths += 1;
                        if (onProgress) {
                            onProgress(totalFilePathTokens > 0 ? processedPaths / totalFilePathTokens : 1);
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

const randomString10 = () => (Math.random() + 1).toString(36).substring(2);

function getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri) {
    const nonce = randomString10();    
    const webviewCss = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "out", "webview", "webview.css"));
    const webviewJs = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "out", "webview", "webview.js"));

    return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta http-equiv="Content-Security-Policy" content="content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Stack trace analyzer</title>
            <script>
                var exports = {};
            </script>
            <link nonce="${nonce}" rel="stylesheet" href="${webviewCss}" />
		</head>
		<body>
            <template id="tooltip-template"><div class="tooltip">
                <div class="tooltip-row commit-message-row">
                    <div class="commit-message"></div>
                    <div class="commit-hash"></div>
                </div>
                <div class="tooltip-row commit-author-row">
                    <div class="commit-author"></div>
                    <div class="commit-date"></div>
                </div>
            </div></template>
            
            <div id="loading-container">
                <div id="loading-fill"></div>
            </div>
            <div id="current-stack-trace">Call 'Analyze stack trace from clipboard' to see the stack trace</div>
			<script type="module" nonce="${nonce}" src="${webviewJs}"></script>
		</body>
		</html>`;
}

function removeVcsInfoFromLines(lines: Token[][]): Token[][] {
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

export function deactivate() {

}
