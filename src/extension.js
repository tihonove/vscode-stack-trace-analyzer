const vscode = require("vscode");
const { splitIntoTokens, getPossibleFilePathsToSearch } = require("./stackTraceSplitter.js");

let view;

function activate(context) {
    const provider = {
        resolveWebviewView: webviewView => {
            view = webviewView;
            webviewView.webview.options = { enableScripts: true };
            webviewView.webview.html = getHtmlForWebview();
            webviewView.webview.onDidReceiveMessage(async data => {
                switch (data.type) {
                    case "openFile": {
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

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.analyzeStackTraceFromClipboard", async () => {
            if (view == undefined) {
                await vscode.commands.executeCommand("stack-trace-analyzer.root.focus");
            }
            if (view != undefined) { 
                view.show?.(true);
            }
            const clipboardContent = await vscode.env.clipboard.readText();
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: "Analyzing stack trace...",
                    cancellable: true,
                },
                async (_, cancellationToken) => {
                    const linesTokens = splitIntoTokens(clipboardContent);
                    if (view != undefined) {
                        view.webview.postMessage({
                            type: "setStacktracePreview",
                            lines: linesTokens.map(lineTokens => lineTokens.map(t => [t[0]])),
                        });
                    }
                    const linesVsCodeTokens = await Promise.all(
                        linesTokens.map(async lineTokens => {
                            return await Promise.all(
                                lineTokens.map(async ([line, meta]) => {
                                    if (meta == undefined || cancellationToken.isCancellationRequested) return [line];
                                    const { filePath, ...tokenMeta } = meta;
                                    for (const possibleFilePath of getPossibleFilePathsToSearch(filePath)) {
                                        const uris = await vscode.workspace.findFiles(possibleFilePath, null, 1, cancellationToken);
                                        if (uris.length > 0) {
                                            return [line, { fileUriPath: uris[0].path, ...tokenMeta }];
                                        }
                                    }    
                                    return [line];
                                })
                            );    
                        })
                    );
                    if (view != undefined) {
                        view.webview.postMessage({ type: "addAnalyzedStackTrace", lines: linesVsCodeTokens });
                    } else {
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
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
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

				window.addEventListener('message', async event => {
					const message = event.data;
					switch (message.type) {
						case 'setStacktracePreview':
						case 'addAnalyzedStackTrace':
							{
                                const element = document.querySelector('#current-stack-trace');
                                element.innerText = "";
                                for (const lineTokens of message.lines) {
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
                                                    type: 'openFile',
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

								break;
							}
						case 'clearAnalyizedStackTraces':
							{
								document.querySelector('#current-stack-trace').innerText = "Call 'Analyze stack trace from clipboard' to see the stack trace";
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
