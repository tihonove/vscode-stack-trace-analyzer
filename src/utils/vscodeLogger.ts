import * as vscode from "vscode";
import { Logger } from "./logger";

/**
 * Bridges the vscode-free {@link Logger} onto a `vscode.LogOutputChannel`, which
 * gives us timestamps, per-level colouring and — the point of using it — a log
 * level the user controls from *Developer: Set Log Level…* without any setting
 * of our own. `debug`/`trace` are therefore off by default: the diagnostics for
 * a slow search are one command away, not always on.
 */
export function createVscodeLogger(channel: vscode.LogOutputChannel): Logger {
    return {
        trace: message => channel.trace(message),
        debug: message => channel.debug(message),
        info: message => channel.info(message),
        // The variadic form keeps the Error object intact, so VS Code renders its stack.
        warn: (message, error) => (error === undefined ? channel.warn(message) : channel.warn(message, error)),
        error: (message, error) => (error === undefined ? channel.error(message) : channel.error(message, error)),
    };
}
