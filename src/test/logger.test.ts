import { describe, expect, it, afterEach } from "vitest";
import { Logger, createScopedLogger, formatList, setLogger, startTimer } from "../utils/logger";

function createRecordingLogger(): Logger & { readonly messages: string[] } {
    const messages: string[] = [];
    return {
        messages,
        trace: message => messages.push(`trace: ${message}`),
        debug: message => messages.push(`debug: ${message}`),
        info: message => messages.push(`info: ${message}`),
        warn: (message, error) => messages.push(`warn: ${message}${error == undefined ? "" : ` (${String(error)})`}`),
        error: (message, error) => messages.push(`error: ${message}${error == undefined ? "" : ` (${String(error)})`}`),
    };
}

describe("logger", () => {
    afterEach(() => setLogger(undefined));

    it("swallows everything until a sink is installed", () => {
        const log = createScopedLogger("search");
        expect(() => log.info("nobody is listening")).not.toThrow();
    });

    it("prefixes messages with the scope and routes them to the installed sink", () => {
        const log = createScopedLogger("search");
        const sink = createRecordingLogger();
        setLogger(sink);

        log.debug("planning");
        log.warn("slow", new Error("boom"));

        expect(sink.messages).toEqual(["debug: [search] planning", "warn: [search] slow (Error: boom)"]);
    });

    it("picks up a sink installed after the scoped logger was created", () => {
        const log = createScopedLogger("git");
        const sink = createRecordingLogger();
        setLogger(sink);
        log.info("late");
        expect(sink.messages).toEqual(["info: [git] late"]);
    });

    it("stops writing once the sink is removed", () => {
        const log = createScopedLogger("git");
        const sink = createRecordingLogger();
        setLogger(sink);
        setLogger(undefined);
        log.info("dropped");
        expect(sink.messages).toEqual([]);
    });

    it("measures elapsed time as a non-negative number of milliseconds", () => {
        const elapsed = startTimer();
        expect(elapsed()).toBeGreaterThanOrEqual(0);
    });

    describe("formatList", () => {
        it("marks an empty list", () => expect(formatList([])).toBe("(none)"));
        it("joins a short list in full", () => expect(formatList(["a", "b"])).toBe("a, b"));
        it("truncates a long list and counts the rest", () =>
            expect(formatList(["a", "b", "c", "d"], 2)).toBe("a, b … (+2 more)"));
    });
});
