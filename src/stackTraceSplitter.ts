import { TokenMeta, Token } from "./TokenMeta";
import { intersperse, regexMatchCount } from "./utils/commontUtils";

type TokenFactory = (match: RegExpExecArray) => TokenMeta | Token[];

const tokenizers: Array<[RegExp, TokenFactory]> = [
    [
        // C/C++ debugger (cppdbg) stack trace format: FunctionName(params) (path/to/file.c:line)
        /\(((?:\w:[\/\\]|[\/\\])[\w\/\\\-\.]+\.(c|cpp|cc|cxx|h|hpp)):(\d+)\)/gi,
        (m: RegExpExecArray): Token[] => {
            const filePath = m[1] ?? "";
            const lineNumber = m[3] ?? "0";
            
            const result: any = {
                type: "FilePath",
                filePath: normalizeFilePath(filePath),
                line: Number(lineNumber),
            };
            
            return [
                ["("],
                [m[1] + ":" + m[3], result],
                [")"],
            ];
        },
    ],
    [
        /((?:(?:\w\:\\{1,})|[\/\\]+|[\d\w\.])([^\/\\\t\n\r\(\):]*[^\/\\\s\(\):][\/\\]+)+([^\\\/\t\n\r\(\):]*[^\\\/\s\(\):]\.([\d\w]{2,5})))((?:\??:(line )?(?<line1>\d+)(\:(?<col1>\d+))?)|(?:\((?<line2>\d+)(\,(?<col2>\d+))\)))/gi,
        (m: RegExpExecArray): TokenMeta => {
            const result: any = { type: "FilePath", filePath: normalizeFilePath(m[1] ?? ""), line: Number(m.groups?.["line1"] ?? m.groups?.["line2"]) };
            if (m.groups?.["col1"] || m.groups?.["col2"]) {
                result.column = Number(m.groups["col1"] || m.groups["col2"]);
            }
            return result;
        },
    ],
    [
        /(\s*at\s)?(([^\/\\\t\n\r\(\):]*[^\/\\\s\(\):][\/\\]+)*([^\\\/\t\n\r\(\):]*[^\\\/\s\(\):]\.([\d\w]{2,5})))((?:\??:(line )?(?<line1>\d+)(\:(?<col1>\d+))?)|(?:\((?<line2>\d+)(\,(?<col2>\d+))\)))/gi,
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
        /(?:(?:\w\:\\{1,})|[\/\\]+|[\d\w\.])([^\/\\\s\(\):]+[\/\\]+)+([^\/\\\s\(\):]+\.([\d\w]{2,5}))/gi,
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
