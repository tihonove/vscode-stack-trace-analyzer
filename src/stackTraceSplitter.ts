import { TokenMeta, Token } from "./TokenMeta";
import { intersperse, regexMatchCount } from "./utils/commontUtils";

function re(flags: string): (strings: TemplateStringsArray, ...values: RegExp[]) => RegExp;
function re(strings: TemplateStringsArray, ...values: RegExp[]): RegExp;
function re(stringsOrFlags: TemplateStringsArray | string, ...values: RegExp[]): RegExp | ((strings: TemplateStringsArray, ...values: RegExp[]) => RegExp) {
    const build = (strings: TemplateStringsArray, values: RegExp[], flags?: string): RegExp => {
        let source = '';
        for (let i = 0; i < strings.length; i++) {
            source += strings[i];
            if (i < values.length) {
                source += values[i]!.source;
            }
        }
        return new RegExp(source, flags);
    };
    if (typeof stringsOrFlags === 'string') {
        return (strings: TemplateStringsArray, ...values: RegExp[]) => build(strings, values, stringsOrFlags);
    }
    return build(stringsOrFlags, values);
}

type TokenFactory = (match: RegExpExecArray) => TokenMeta | Token[];

/**
 * Matches:
 *   :line 123:45
 *   :123:45
 *   (123,45)
 *   (123)
 *   ?:line 123
 *   ?:123
 */
const lineAndColumn = /((?:\??:(line )?(?<line1>\d+)(\:(?<col1>\d+))?)|(?:\((?<line2>\d+)(\,(?<col2>\d+))\)))/;

/** Matches file extension: .c, .h, .ts, .java, .rs, etc. */
const fileExtension = /\.(c|h|[\d\w]{2,5})/;

/**
 * Matches the start of a file path:
 *   C:\\  (Windows drive)
 *   /    (Unix root)
 *   a    (relative: letter, digit or dot)
 */
const pathStart = /(?:(?:\w\:\\{1,})|[\/\\]+|[\d\w\.])/;

/** Matches a path segment (directory or file name), allows spaces inside */
const pathSegment = /[^\/\\\t\n\r\(\):]*[^\/\\\s\(\):]/;

/** Matches a path segment, no spaces allowed */
const strictPathSegment = /[^\/\\\s\(\):]+/;

/** Matches directory separators: / or \ (one or more) */
const dirSeparator = /[\/\\]+/;

const tokenizers: Array<[RegExp, TokenFactory]> = [
    [
        /(?<![a-zA-Z])([a-zA-Z]:[\/][^\s\t\n\r\(\):]+\.[\d\w]{2,5}):(\d+)/g,
        (m: RegExpExecArray): TokenMeta => ({
            type: "FilePath",
            filePath: normalizeFilePath(m[1] ?? ""),
            line: Number(m[2]),
        } as any),
    ],
    [
        /(?<=',\s)(\S+):(\d+):(\d+)/g,
        (m: RegExpExecArray): TokenMeta => ({
            type: "FilePath",
            filePath: normalizeFilePath(m[1] ?? ""),
            line: Number(m[2]),
            column: Number(m[3]),
        } as any),
    ],
    [
        /(\s+)(at\s+)((?:\.?[\/\\]|\w:[\/\\])\S+):(\d+):(\d+)/g,
        (m: RegExpExecArray): Token[] => [
            [m[1] ?? ""],
            [m[2] ?? ""],
            [(m[3] ?? "") + ":" + (m[4] ?? "") + ":" + (m[5] ?? ""), {
                type: "FilePath",
                filePath: normalizeFilePath(m[3] ?? ""),
                line: Number(m[4]),
                column: Number(m[5]),
            } as any],
        ],
    ],
    [
        /(?<![\/\\])(\.\.?[\/\\](?:[^\/\\\s\(\):]+[\/\\])*[^\/\\\s\(\):]+\.[\d\w]{2,5})((?:\??\:(?:line )?(?<line1>\d+)(?:\:(?<col1>\d+))?)|(?:\((?<line2>\d+)\)))/gi,
        (m: RegExpExecArray): TokenMeta => {
            const result: any = { type: "FilePath", filePath: normalizeFilePath(m[1] ?? ""), line: Number(m.groups?.["line1"] ?? m.groups?.["line2"]) };
            if (m.groups?.["col1"]) {
                result.column = Number(m.groups["col1"]);
            }
            return result;
        },
    ],
    [
        /((?:(?:\w\:\\{1,})|[\/\\]+|[\d\w\.])([^\/\\\t\n\r\(\):]*[^\/\\\s\(\):][\/\\]+)+([^\\\/\t\n\r\(\):]*[^\\\/\s\(\):]\.(c|h|[\d\w]{2,5})))\((\d+)(?!,)\)/gi,
        (m: RegExpExecArray): TokenMeta => ({
            type: "FilePath",
            filePath: normalizeFilePath(m[1] ?? ""),
            line: Number(m[5]),
        } as any),
    ],
    [
        /(?<![\/\\])(\.\.?[\/\\](?:[^\/\\\s\(\):]+[\/\\])*[^\/\\\s\(\):]+\.[\d\w]{2,5})/gi,
        (m: RegExpExecArray): TokenMeta => ({
            type: "FilePath",
            filePath: normalizeFilePath(m[1] ?? ""),
        } as any),
    ],
    [
        re("gi")`(${pathStart}(${pathSegment}${dirSeparator})+(${pathSegment}${fileExtension}))${lineAndColumn}`,
        (m: RegExpExecArray): TokenMeta => {
            const result: any = { type: "FilePath", filePath: normalizeFilePath(m[1] ?? ""), line: Number(m.groups?.["line1"] ?? m.groups?.["line2"]) };
            if (m.groups?.["col1"] || m.groups?.["col2"]) {
                result.column = Number(m.groups["col1"] || m.groups["col2"]);
            }
            return result;
        },
    ],
    [
        re("gi")`${/(\s*at\s)?/}((${pathSegment}${dirSeparator})*(${pathSegment}${fileExtension}))${lineAndColumn}`,
        m => {
            const result: any = { type: "FilePath", filePath: normalizeFilePath(m[2] ?? ""), line: Number(m.groups?.["line1"] ?? m.groups?.["line2"]) };
            if (m.groups?.["col1"] || m.groups?.["col2"]) {
                result.column = Number(m.groups?.["col1"] || m.groups?.["col2"]);
            }
            const resultList = [[m[2] + (m[6] ?? ""), result]]
            if (m[1]) {
                resultList.unshift([m[1]])
            }
            return resultList;
        },
    ],
    [
        /webpack\:\[(.*?)\]\(.*?\)\?:(\d+)(?:\:(\d+))/gi,
        m => {
            const result: any = { type: "FilePath", filePath: normalizeFilePath(m[1] ?? ""), line: Number(m[2]) };
            if (m[3]) {
                result.column = Number(m[3]);
            }
            return result;
        },
    ],
    [
        re("gi")`${pathStart}(${strictPathSegment}${dirSeparator})+(${strictPathSegment}${fileExtension})`,
        m => ({ type: "FilePath", filePath: normalizeFilePath(m[0]) }),
    ],
    [
        /(at\s+)([\dа-яеёα-ωΑ-Ωא-תء-يๅ-๏ก-๛\w\.\: ]+?)(\s*\()/gi,
        (m: RegExpExecArray): Token[] => [
            [m[1] ?? ""],
            ...intersperse(
                (m[2] ?? "")
                    .split(".")
                    .reduce<Token[]>(
                        (result: Token[], symbol: string): Token[] => [
                            ...result,
                            [
                                symbol,
                                { type: "Symbol", symbols: [...(result.slice(-1)[0]?.[1]?.symbols ?? []), symbol] },
                            ],
                        ],
                        []
                    ),
                ["."]
            ),
            [m[3] ?? ""],
        ],
    ],
    [
        /^(created by )?(\w+)\.([^.()]+)(.*)/g,
        (m: RegExpExecArray): Token[] => {
            const prefix = m[1] ?? "";
            const sym1 = m[2] ?? "";
            const sym2 = m[3] ?? "";
            const rest = m[4] ?? "";
            const result: Token[] = [];
            if (prefix) result.push([prefix]);
            result.push([sym1, { type: "Symbol", symbols: [sym1] }]);
            result.push(["."]);
            result.push([sym2, { type: "Symbol", symbols: [sym1, sym2] }]);
            if (rest) result.push([rest]);
            return result;
        },
    ],
];

const normalizeFilePath = (filePath: string) => filePath.replace(/[\/\\]+/g, "/");

function splitByRegex(input: string, regex: RegExp, tokenFactory: TokenFactory): Token[] {
    const result: Token[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(input)) !== null) {
        if (match.index > lastIndex) {
            result.push([input.slice(lastIndex, match.index)]);
        }
        const tokenMeta = tokenFactory(match);
        if (Array.isArray(tokenMeta)) result.push(...tokenMeta);
        else result.push([match[0], tokenMeta]);
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < input.length) {
        result.push([input.slice(lastIndex)]);
    }
    return result;
}

export function splitIntoTokens(trace: string, onProgress: (null | ((progress: number) => void)) = null): Token[][] {
    const result = [];
    const lines = trace.split("\n");
    
    const totalLinesToProcess = lines.length;

    for (const preline of lines) {
        const escapedNewLineCount = regexMatchCount(trace, /\\n\s+/gi);
        let lineOfLines;
        if (preline.length / (escapedNewLineCount - 1) > 100 || (preline.length / 240 && escapedNewLineCount > 5)) {
            lineOfLines = preline.replace(/\\n/gi, "\n").split("\n");
        } else {
            lineOfLines = [preline];
        }

        for (const line of lineOfLines) {
            let lineTokens: Token[] = [[line]];

            for (const tokenizer of tokenizers) {
                const nextTokens = [];
                for (const lineToken of lineTokens) {
                    if (lineToken.length == 1) {
                        const result = splitByRegex(lineToken[0], tokenizer[0], tokenizer[1]);
                        nextTokens.push(...result);
                    } else {
                        nextTokens.push(lineToken);
                    }
                }
                lineTokens = nextTokens;
            }
            result.push(lineTokens);
            
        }
        if (onProgress && totalLinesToProcess > 0) {
            onProgress(1 / totalLinesToProcess);
        }
    }
    return result;
};

export function* getPossibleFilePathsToSearch(filePath: string): Generator<string> {
    const parts = filePath.split(/[\/\\]/);
    for (let i = 0; i < parts.length; i++) {
        yield parts.slice(i).join("/");
    }
}
