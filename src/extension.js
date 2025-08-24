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

function setLoadingState(isLoading, progress = 0) {
    if (view == undefined) return;
    view.webview.postMessage({ type: "setLoadingState", isLoading: isLoading, progress: progress });
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

                    stackTraceInfo.lines = await enrichWorkspacePathsWithVscInfo(
                        stackTraceInfo.lines, 
                        cancellationToken,
                        (progress) => {}
                    );
                    storeStackTracesToWorkspaceState(context);
                    if (getCurrentStackTraceInfo() == stackTraceInfo) {
                        showStackTraceTokensInWebView(stackTraceInfo.lines);
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
}

async function enrichWorkspacePathsWithVscInfo(lines, cancellationToken, onProgress) {
    try {
        if (cancellationToken.isCancellationRequested) {
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

async function echrichWorkspacePathsInToken(lines, cancellationToken, onProgress) {
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
        lines.map(async lineTokens => {
            return await Promise.all(
                lineTokens.map(async ([line, meta]) => {
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
                                return [line, { fileUriPath: uris1[0].path, ...tokenMeta }];
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
                                    return [line, { fileUriPath: uris2[0].path, ...tokenMeta }];
                                }
                            }
                        }
                        processedPaths += 1;
                        if (onProgress) {
                            onProgress(totalFilePathTokens > 0 ? processedPaths / totalFilePathTokens : 1);
                        }
                    } else if (meta.type === "Symbol") {
                        return [line, { type: "Symbol", ...meta }];
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
			<title>Stack trace analyzer</title>
            <style nonce="${nonce}">
                #current-stack-trace {
                    font-family: monospace;
                    white-space: pre-wrap;
                }
                .symbol {
                    color: inherit;
                    text-decoration: none;
                }
                .symbol:hover {
                    color: inherit;
                    text-decoration: underline;
                }
                .file-path-recent {
                    background-color: var(--vscode-editorOverviewRuler-modifiedForeground, rgba(255, 140, 0, 0.2));
                    color: var(--vscode-errorForeground, #ff8c00);
                    border-radius: 2px;
                    padding: 1px 2px;
                }
                #loading-container {
                    height: 2px;
                    width: 100%;
                    overflow: hidden;
                    position: relative;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                #loading-container.loading {
                    opacity: 1;
                }
                #loading-fill {
                    height: 100%;
                    background-color: var(--vscode-progressBar-background);
                    width: 0%;
                    transition: width 0.3s ease;
                }
            </style>
		</head>
		<body>
            <div id="loading-container">
                <div id="loading-fill"></div>
            </div>
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
                            if (token[1]?.type == "FilePath") {
                                tokenElement = document.createElement('a');
                                tokenElement.innerText = tokenText;
                                tokenElement.href = "#";
                                
                                // Проверяем дату последнего коммита
                                const lastCommit = token[1]?.vcsInfo?.lastChangeCommit;
                                if (lastCommit && lastCommit.authorDate) {
                                    const commitDate = new Date(lastCommit.authorDate);
                                    const sevenDaysAgo = new Date();
                                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                                    
                                    if (commitDate > sevenDaysAgo) {
                                        tokenElement.classList.add('file-path-recent');
                                    }
                                }
                                
                                tokenElement.onclick = () => {
                                    vscode.postMessage({
                                        type: 'OpenFile',
                                        tokenMeta: token[1],
                                    });
                                };
                            } else if (token[1]?.type == "Symbol") {
                                tokenElement = document.createElement('a');
                                tokenElement.classList.add('symbol');
                                tokenElement.innerText = tokenText;
                                tokenElement.href = "#";
                                tokenElement.onclick = (event) => {
                                    vscode.postMessage({
                                        type: 'GoToSymbol',
                                        tokenMeta: event.shiftKey 
                                            ? { ...token[1], symbols: token[1].symbols.slice(-1) } 
                                            : token[1],
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
						case 'setLoadingState':
							{
                                const loadingContainer = document.querySelector('#loading-container');
                                const loadingFill = document.querySelector('#loading-fill');
                                
                                if (message.isLoading) {
                                    loadingContainer.classList.add('loading');
                                    loadingFill.style.width = message.progress + '%';
                                } else {
                                    loadingContainer.classList.remove('loading');
                                    setTimeout(() => { loadingFill.style.width = '0%'; }, 300);
                                }
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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    activate,
    deactivate: () => {},
};
