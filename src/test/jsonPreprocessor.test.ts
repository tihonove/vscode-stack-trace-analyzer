import { describe, test, expect } from "vitest";
import { preprocessJsonInText } from "../utils/jsonPreprocessor";

describe("preprocessJsonInText", () => {
    test("returns plain text without JSON unchanged", () => {
        const text = "  at com.foo.Bar.method(Bar.java:42)\n  at com.foo.Baz.run(Baz.java:10)";
        expect(preprocessJsonInText(text)).toBe(text);
    });

    test("returns short text unchanged", () => {
        expect(preprocessJsonInText("hello")).toBe("hello");
        expect(preprocessJsonInText("{x}")).toBe("{x}");
    });

    test("formats a pure single-line JSON with stack trace field", () => {
        const input = '{"error":"NullPointerException","stack":"at com.foo.Bar.method(Bar.java:42)\\nat com.foo.Baz.run(Baz.java:10)"}';
        const result = preprocessJsonInText(input);

        // Should be pretty-printed
        expect(result).toContain('"error": "NullPointerException"');
        // The stack field has \\n which should be expanded since it's long enough
        expect(result).toContain("at com.foo.Bar.method(Bar.java:42)");
        expect(result).toContain("at com.foo.Baz.run(Baz.java:10)");
    });

    test("formats JSON embedded in text (log prefix)", () => {
        const input = '2024-01-01 12:00:00 ERROR: {"error":"RuntimeException","message":"something failed"}';
        const result = preprocessJsonInText(input);

        expect(result).toMatch(/^2024-01-01 12:00:00 ERROR: /);
        expect(result).toContain('"error": "RuntimeException"');
    });

    test("expands escaped newlines in long string values", () => {
        const longStack = "at com.foo.Bar.method(Bar.java:42)\\nat com.foo.Baz.run(Baz.java:10)\\nat com.foo.Main.main(Main.java:5)";
        const input = JSON.stringify({ stack: longStack });
        const result = preprocessJsonInText(input);

        // Escaped \\n in JSON string should be expanded into real newlines in the output
        expect(result).toContain("at com.foo.Bar.method(Bar.java:42)\\nat com.foo.Baz.run(Baz.java:10)");
    });

    test("recursively parses double-encoded JSON strings", () => {
        const inner = JSON.stringify({ key: "value", num: 42 });
        const input = JSON.stringify({ data: inner });
        const result = preprocessJsonInText(input);

        // Inner JSON should be parsed and formatted too
        expect(result).toContain('"key": "value"');
        expect(result).toContain('"num": 42');
    });

    test("handles invalid JSON gracefully (returns text unchanged)", () => {
        const text = '{"unclosed": "value';
        expect(preprocessJsonInText(text)).toBe(text);
    });

    test("handles text with curly braces that are not JSON", () => {
        const text = "function foo() { return bar(); }";
        expect(preprocessJsonInText(text)).toBe(text);
    });

    test("handles multiple JSON objects in text", () => {
        const input = 'first: {"a":1} second: {"b":2}';
        const result = preprocessJsonInText(input);

        expect(result).toContain('"a": 1');
        expect(result).toContain('"b": 2');
        expect(result).toContain("first: ");
        expect(result).toContain(" second: ");
    });

    test("preserves text before and after JSON", () => {
        const input = 'PREFIX {"key":"val"} SUFFIX';
        const result = preprocessJsonInText(input);

        expect(result).toMatch(/^PREFIX /);
        expect(result).toMatch(/ SUFFIX$/);
        expect(result).toContain('"key": "val"');
    });

    test("handles nested JSON objects", () => {
        const input = '{"outer":{"inner":"value"}}';
        const result = preprocessJsonInText(input);

        expect(result).toContain('"outer":');
        expect(result).toContain('"inner": "value"');
    });

    test("does not expand newlines in short strings", () => {
        const input = '{"short":"a\\nb"}';
        const result = preprocessJsonInText(input);

        // Short string - newlines should NOT be expanded
        expect(result).toContain('"short": "a\\nb"');
    });

    test("handles real-world JSON error with stack trace", () => {
        const input = '{"timestamp":"2024-01-01T12:00:00Z","level":"ERROR","message":"Request failed","exception":"java.lang.NullPointerException: null\\n\\tat com.example.service.UserService.getUser(UserService.java:42)\\n\\tat com.example.controller.UserController.handle(UserController.java:28)\\n\\tat org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:97)"}';
        const result = preprocessJsonInText(input);

        expect(result).toContain('"level": "ERROR"');
        // The exception field should have expanded newlines since it's long
        expect(result).toContain("com.example.service.UserService.getUser(UserService.java:42)");
        expect(result).toContain("com.example.controller.UserController.handle(UserController.java:28)");
    });
});
