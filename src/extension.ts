import vscode from "vscode";
import { splitIntoTokens, getPossibleFilePathsToSearch } from "./stackTraceSplitter";
import { Token } from "./TokenMeta";
import { StackTraceWebViewPanel } from "./webview/StackTraceWebViewPanel";
import { ExtensionController } from "./ExtensionController";


export function activate(context: vscode.ExtensionContext) {
    var controller = new ExtensionController(context);

    context.subscriptions.push(vscode.window.registerWebviewViewProvider("stack-trace-analyzer.root", {
        resolveWebviewView: (webviewView: vscode.WebviewView) => {
            controller.setWebView(webviewView);
        },
    }));
    
    controller.init();

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.selectPrevStackTrace", async () => {
            controller.executeSelectPrevStackTraceCommand();
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
            if (view != undefined) view.show();

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
                async (progress, cancellationToken) => {
                  
                    progress.report({ message: "Parsing stacktrace" });
                    stackTraceInfo.lines = splitIntoTokens(clipboardContent, (progressIncrementValue) => {
                        progress.report({ increment: progressIncrementValue * 10 });
                    });
                    showStackTraceTokensInWebView(stackTraceInfo.lines.map(x => x.map(t => [t[0]])));
                    
                    progress.report({ message: "Searching files" });
                    stackTraceInfo.lines = await echrichWorkspacePathsInToken(
                        stackTraceInfo.lines, 
                        cancellationToken,
                        (progressIncrementValue) => progress.report({ increment: progressIncrementValue * 90 })
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
                }
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.clearAnalyizedStackTraces", () => {
            if (view == undefined) return;
            view.clearAnalyizedStackTraces();
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

export function deactivate() {

}
