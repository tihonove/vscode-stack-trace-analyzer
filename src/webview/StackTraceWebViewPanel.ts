import * as vscode from "vscode";
import { Token } from "../TokenMeta";

export class StackTraceWebViewPanel {
    private readonly webviewView: vscode.WebviewView;
    private readonly context: vscode.ExtensionContext;

    public constructor(context: vscode.ExtensionContext, webviewView: vscode.WebviewView) {
        this.context = context;
        this.webviewView = webviewView;
        this.webviewView.webview.options = { enableScripts: true };
        this.webviewView.webview.html = this.getHtmlForWebview();
        this.webviewView.webview.onDidReceiveMessage(async data => {
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
    }

    public show() {
        this.webviewView.show(true);
    }

    public setStackTraceTokens(lines: Token[][]) {
        this.webviewView.webview.postMessage({ type: "setStackTraceTokens", lines: lines });
    }

    public clearAnalyizedStackTraces() {
        this.webviewView.webview.postMessage({ type: "clearAnalyizedStackTraces" });
    }

    private randomString10(): string {
        return (Math.random() + 1).toString(36).substring(2);
    }

    private getHtmlForWebview() {
        const extensionUri = this.context.extensionUri;
        const nonce = this.randomString10();
        const webviewCss = this.webviewView.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "out", "webview", "client", "webview.css"));
        const webviewJs = this.webviewView.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "out", "webview", "client", "webview.js"));

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="content="default-src 'none'; style-src ${this.webviewView.webview.cspSource}; script-src ${this.webviewView.webview.cspSource};">
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
                
                <div id="current-stack-trace">Call 'Analyze stack trace from clipboard' to see the stack trace</div>
                <script type="module" nonce="${nonce}" src="${webviewJs}"></script>
            </body>
            </html>`;
    }
}
