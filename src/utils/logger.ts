// A tiny, vscode-free logging seam.
//
// The fast file searcher core (`src/native/`) must stay importable without the
// VS Code runtime — it is unit-tested directly — so it cannot reach for an
// `OutputChannel`. Instead every module logs through a scoped logger backed by a
// module-level sink that defaults to a no-op. The extension host installs the
// real sink (a `vscode.LogOutputChannel`) on activation via `setLogger`; tests
// simply never install one and pay nothing.

export interface Logger {
    /** Very fine-grained detail: one line per external command, per candidate. */
    trace(message: string): void;
    /** Per-stage detail useful when diagnosing a slow or failed search. */
    debug(message: string): void;
    /** The few lines that summarize what a whole operation did. */
    info(message: string): void;
    /** Something worked, but slowly or by falling back to a worse path. */
    warn(message: string, error?: unknown): void;
    /** Something failed. */
    error(message: string, error?: unknown): void;
}

const noopLogger: Logger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
};

let sink: Logger = noopLogger;

/** Installs the process-wide log sink. Passing `undefined` restores the no-op. */
export function setLogger(logger: Logger | undefined): void {
    sink = logger ?? noopLogger;
}

/**
 * A logger that prefixes every message with `[scope]`. It reads the sink lazily,
 * so a scoped logger created at module load still writes to whatever sink is
 * installed later.
 */
export function createScopedLogger(scope: string): Logger {
    const prefix = `[${scope}] `;
    return {
        trace: message => sink.trace(prefix + message),
        debug: message => sink.debug(prefix + message),
        info: message => sink.info(prefix + message),
        warn: (message, error) => sink.warn(prefix + message, error),
        error: (message, error) => sink.error(prefix + message, error),
    };
}

/** Starts a stopwatch; the returned function yields elapsed whole milliseconds. */
export function startTimer(): () => number {
    const started = Date.now();
    return () => Date.now() - started;
}

/** Renders a list for a log line, keeping it short enough to stay readable. */
export function formatList(items: ReadonlyArray<string>, limit = 8): string {
    if (items.length === 0) return "(none)";
    if (items.length <= limit) return items.join(", ");
    return `${items.slice(0, limit).join(", ")} … (+${items.length - limit} more)`;
}
