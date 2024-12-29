const vscode = require("vscode");

let view;

function activate(context) {
    const provider = {
        resolveWebviewView: webviewView => {
            view = webviewView;
            webviewView.webview.options = { enableScripts: true };
            webviewView.webview.html = getHtmlForWebview(webviewView.webview);
            webviewView.webview.onDidReceiveMessage(async data => {
                switch (data.type) {
                    case "openFile": {
                        const a = await vscode.workspace.findFiles("src/Neurons/Neurons.ts");
                        const doc = await vscode.workspace.openTextDocument(a[0]);
                        const editor = await vscode.window.showTextDocument(doc);
                        const position = new vscode.Position(10, 10);
                        const newSelection = new vscode.Selection(position, position);
                        editor.selection = newSelection;
                        break;
                    }
                }
            });
        },
    };

    context.subscriptions.push(vscode.window.registerWebviewViewProvider("stack-trace-analyzer.root", provider));

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.analyzeStackTraceFromClipboard", async () => {
            const text = await vscode.env.clipboard.readText();
            view.show?.(true);
            view.webview.postMessage({ type: "setText", text: text });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.clearAnalyizedStackTraces", () => {
            view.webview.postMessage({ type: "clearColors" });
        })
    );
}

function getHtmlForWebview(webview) {
    const nonce = getNonce();

    return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'unsafe-inline';">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Cat Colors</title>
		</head>
		<body>
			<script nonce="${nonce}">
				const vscode = acquireVsCodeApi();

				window.addEventListener('message', event => {
					console.log(event);
					const message = event.data; // The json data that the extension sent
					switch (message.type) {
						case 'setText':
							{
								document.body.style.backgroundColor = 'blue';
								document.querySelector('#buffer').value = message.text;
								break;
							}
						case 'clearColors':
							{
								document.body.style.backgroundColor = 'red';
								document.querySelector('#buffer').value = "";
								break;
							}
					}
				});

				document.body.style.backgroundColor = 'red';

				function openFile() {
					vscode.postMessage({
						type: 'openFile',
						value: ''
					});
				}
			</script>
			<input type="text" id="buffer" />
			<button onclick="openFile()">Open</button>
		</body>
		</html>`;
}

function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

module.exports = {
    activate,
    deactivate: () => {},
};
