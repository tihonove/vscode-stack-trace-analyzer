import vscode from "vscode";
import { ExtensionController } from "./ExtensionController";
import { createScopedLogger, setLogger } from "./utils/logger";
import { createVscodeLogger } from "./utils/vscodeLogger";

const log = createScopedLogger("extension");

export function activate(context: vscode.ExtensionContext) {
    const logChannel = vscode.window.createOutputChannel("Stack Trace Analyzer", { log: true });
    context.subscriptions.push(logChannel);
    setLogger(createVscodeLogger(logChannel));
    context.subscriptions.push({ dispose: () => setLogger(undefined) });
    log.info(
        `Activated (version ${String(context.extension.packageJSON.version)}). ` +
            "Run 'Developer: Set Log Level…' → 'Stack Trace Analyzer' → Debug for the details of a slow search."
    );

    var controller = new ExtensionController(context);

    context.subscriptions.push(vscode.window.registerWebviewViewProvider("stack-trace-analyzer.root", {
        resolveWebviewView: (webviewView: vscode.WebviewView) => {
            controller.setWebView(webviewView);
        },
    }, {
        webviewOptions: { retainContextWhenHidden: true },
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

    context.subscriptions.push(
        vscode.commands.registerCommand("stack-trace-analyzer.showLogs", () => {
            logChannel.show();
        })
    );
}

export function deactivate() {

}
