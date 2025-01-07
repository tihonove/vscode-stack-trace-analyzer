const vscode = require("vscode");
const { splitIntoTokens, getPossibleFilePathsToSearch } = require("./stackTraceSplitter.js");

let view;
const stackTraceInfos = [];
let currentStackTraceFromLast = 0;

function restoreStackTracesFromWorkspaceState(context) {
    const prevStackTraceInfos = context.workspaceState.get("stack-trace-analyzer.stackTraceInfos", []);
    stackTraceInfos.splice(0, stackTraceInfos.length);
    stackTraceInfos.push(...prevStackTraceInfos);
}

function storeStackTracesToWorkspaceState(context) {
    context.workspaceState.update("stack-trace-analyzer.stackTraceInfos", stackTraceInfos.slice(-10));
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
}

function showStackTraceTokensInWebView(lines) {
    if (lines == undefined) return;
    if (view == undefined) return;
    view.webview.postMessage({ type: "setStackTraceTokens", lines: lines });
}

function getCurrentStackTraceInfo() {
    return stackTraceInfos[stackTraceInfos.length - 1 - currentStackTraceFromLast];
}

function normalizeCurrentIndex() {
    if (currentStackTraceFromLast < 0) currentStackTraceFromLast = 0;
    if (currentStackTraceFromLast >= stackTraceInfos.length) currentStackTraceFromLast = stackTraceInfos.length - 1;
}

function updateCurrentStackTraceIndex(updateFn) {
    currentStackTraceFromLast = updateFn(currentStackTraceFromLast);
    normalizeCurrentIndex();
    showStackTraceTokensInWebView(getCurrentStackTraceInfo()?.lines);
    updateContext();
}

function activate(context) {
    const provider = {
        resolveWebviewView: webviewView => {
            view = webviewView;
            webviewView.webview.options = { enableScripts: true };
            webviewView.webview.html = getHtmlForWebview();
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
            
            const stackTraceInfo = { source: clipboardContent };
            stackTraceInfos.push(stackTraceInfo);

            currentStackTraceFromLast = 0;
            normalizeCurrentIndex();
            updateContext();

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: "Analyzing stack trace...",
                    cancellable: true,
                },
                async (_, cancellationToken) => {
                    stackTraceInfo.lines = splitIntoTokens(clipboardContent);
                    showStackTraceTokensInWebView(stackTraceInfo.lines.map(x => x.map(t => [t[0]])))
                    stackTraceInfo.lines = await echrichWorkspacePathsInToken(stackTraceInfo.lines, cancellationToken);
                    storeStackTracesToWorkspaceState(context);                    
                    if (getCurrentStackTraceInfo() == stackTraceInfo) {
                        showStackTraceTokensInWebView(stackTraceInfo.lines)
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
            view.webview.postMessage({ type: "clearAnalyizedStackTraces" });
            stackTraceInfos.splice(0, stackTraceInfos.length);
            currentStackTraceFromLast = 0;
            updateContext();
            storeStackTracesToWorkspaceState(context);
        })
    );
}

async function echrichWorkspacePathsInToken(lines, cancellationToken) {
    return await Promise.all(
        lines.map(async (lineTokens) => {
            return await Promise.all(
                lineTokens.map(async ([line, meta]) => {
                    if (meta == undefined || cancellationToken.isCancellationRequested) return [line];
                    const { filePath, ...tokenMeta } = meta;
                    for (const possibleFilePath of getPossibleFilePathsToSearch(filePath)) {
                        const uris = await vscode.workspace.findFiles(
                            possibleFilePath,
                            null,
                            1,
                            cancellationToken
                        );
                        if (uris.length > 0) {
                            return [line, { fileUriPath: uris[0].path, ...tokenMeta }];
                        }
                    }
                    return [line];
                })
            );
        })
    );
}

const randomString10 = () => (Math.random() + 1).toString(36).substring(2);

function getHtmlForWebview() {
    const nonce = randomString10();

    return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Cat Colors</title>
            <style nonce="${nonce}">
                #current-stack-trace {
                    font-family: monospace;
                    white-space: pre-wrap;
                }
            </style>
		</head>
		<body>
            <div id="current-stack-trace">Call 'Analyze stack trace from clipboard' to see the stack trace</div>
			<script nonce="${nonce}">
				const vscode = acquireVsCodeApi();
                const prevLines = (vscode.getState() || { lines: null }).lines;

                function showLines(lines) {
                    const element = document.querySelector('#current-stack-trace');
                    element.innerText = "";
                    for (const lineTokens of lines) {
                        const lineElement = document.createElement('div');
                        for (const token of lineTokens) {
                            const tokenText = token[0]; 
                            let tokenElement;
                            if (token[1] != undefined) {
                                tokenElement = document.createElement('a');
                                tokenElement.innerText = tokenText;
                                tokenElement.href = "#";
                                tokenElement.onclick = () => {
                                    vscode.postMessage({
                                        type: 'OpenFile',
                                        tokenMeta: token[1],
                                    });
                                };
                            } else {
                                tokenElement = document.createElement('span');
                                tokenElement.innerText = tokenText;
                            }
                            lineElement.appendChild(tokenElement);
                        }
                        element.appendChild(lineElement);
                    }
                }
        
                if (prevLines) {
                    showLines(prevLines);
                }

				window.addEventListener('message', async event => {
					const message = event.data;
					switch (message.type) {
						case 'setStackTraceTokens':
							{
                                showLines(message.lines);
                                vscode.setState({ lines: message.lines });
								break;
							}
						case 'clearAnalyizedStackTraces':
							{
								document.querySelector('#current-stack-trace').innerText = "Call 'Analyze stack trace from clipboard' to see the stack trace";
                                vscode.setState({ lines: null });
								break;
							}
					}
				});
			</script>
		</body>
		</html>`;
}

module.exports = {
    activate,
    deactivate: () => {},
};
