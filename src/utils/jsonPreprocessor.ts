const MAX_CANDIDATES = 50;
const MAX_CANDIDATE_LENGTH = 100_000;
const MIN_CANDIDATE_LENGTH = 5;
const LONG_STRING_THRESHOLD = 80;

function findMatchingBrace(text: string, start: number): number {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < text.length; i++) {
        if (i - start > MAX_CANDIDATE_LENGTH) {
            return -1;
        }

        const ch = text[i];

        if (escape) {
            escape = false;
            continue;
        }

        if (ch === "\\") {
            if (inString) {
                escape = true;
            }
            continue;
        }

        if (ch === '"') {
            inString = !inString;
            continue;
        }

        if (inString) {
            continue;
        }

        if (ch === "{") {
            depth++;
        } else if (ch === "}") {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}

function formatJsonValue(value: unknown, depth: number): string {
    if (value === null) return "null";
    if (typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);

    const indent = "  ".repeat(depth);
    const innerIndent = "  ".repeat(depth + 1);

    if (typeof value === "string") {
        // Try to recursively parse JSON strings
        if (value.startsWith("{") || value.startsWith("[")) {
            try {
                const nested = JSON.parse(value);
                return formatJsonValue(nested, depth);
            } catch {
                // not JSON, continue with string formatting
            }
        }
        // Expand escaped newlines in long strings
        if (value.length > LONG_STRING_THRESHOLD && /\\n|\\r/.test(value)) {
            const expanded = value.replace(/\\r\\n|\\n|\\r/g, "\n");
            if (expanded.includes("\n")) {
                return JSON.stringify(expanded);
            }
        }
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        if (value.length === 0) return "[]";
        const items = value.map(item => `${innerIndent}${formatJsonValue(item, depth + 1)}`);
        return `[\n${items.join(",\n")}\n${indent}]`;
    }

    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) return "{}";
        const lines = entries.map(
            ([key, val]) => `${innerIndent}${JSON.stringify(key)}: ${formatJsonValue(val, depth + 1)}`
        );
        return `{\n${lines.join(",\n")}\n${indent}}`;
    }

    return String(value);
}

export function preprocessJsonInText(text: string): string {
    if (!text.includes("{")) {
        return text;
    }

    const parts: string[] = [];
    let lastEnd = 0;
    let candidatesChecked = 0;

    for (let i = 0; i < text.length; i++) {
        if (text[i] !== "{") continue;

        if (candidatesChecked >= MAX_CANDIDATES) break;
        if (text.length - i < MIN_CANDIDATE_LENGTH) break;

        candidatesChecked++;

        const closeIndex = findMatchingBrace(text, i);
        if (closeIndex === -1) continue;

        const candidate = text.substring(i, closeIndex + 1);
        if (!candidate.includes('"')) {
            continue;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(candidate);
        } catch {
            continue;
        }

        // Found valid JSON — emit text before it, then formatted JSON
        if (i > lastEnd) {
            parts.push(text.substring(lastEnd, i));
        }
        parts.push(formatJsonValue(parsed, 0));
        lastEnd = closeIndex + 1;
        i = closeIndex; // skip past this JSON (loop will i++)
    }

    if (lastEnd === 0) {
        return text;
    }

    if (lastEnd < text.length) {
        parts.push(text.substring(lastEnd));
    }

    return parts.join("");
}
