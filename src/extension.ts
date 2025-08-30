import vscode from "vscode";
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
            controller.executeSelectNextStackTraceCommand();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.analyzeStackTraceFromClipboard", async () => {
            await controller.executeAnalyzeStackTraceFromClipboardCommand();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.clearAnalyizedStackTraces", () => {
            controller.executeClearAnalyizedStackTracesCommand();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.disableVcsIntegration", async () => {
            await controller.executeDisableVcsIntegrationCommand();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.enableVcsIntegration", async () => {
            await controller.executeEnableVcsIntegrationCommand();
        })
    );
}

export function deactivate() {

}
