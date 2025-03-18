const tokenizers = [
    [
        /((?:(?:\w\:\\{1,})|[\/\\]+|[\d\w\.])([^\/\\\t\n\r\(\):]*[^\/\\\s\(\):][\/\\]+)+([^\\\/\t\n\r\(\):]*[^\\\/\s\(\):]\.([\d\w]{2,5})))((?:\??:(line )?(?<line1>\d+)(\:(?<col1>\d+))?)|(?:\((?<line2>\d+)(\,(?<col2>\d+))\)))/gi,
        m => {
            const result = { type: "FilePath", filePath: normalizeFilePath(m[1]), line: Number(m.groups.line1 ?? m.groups.line2) };
            if (m.groups.col1 || m.groups.col2) {
                result.column = Number(m.groups.col1 || m.groups.col2);
            }
            return result;
        },
    ],
    [
        /(\s*at\s)?(([^\/\\\t\n\r\(\):]*[^\/\\\s\(\):][\/\\]+)*([^\\\/\t\n\r\(\):]*[^\\\/\s\(\):]\.([\d\w]{2,5})))((?:\??:(line )?(?<line1>\d+)(\:(?<col1>\d+))?)|(?:\((?<line2>\d+)(\,(?<col2>\d+))\)))/gi,
        m => {
            const result = { type: "FilePath", filePath: normalizeFilePath(m[2]), line: Number(m.groups.line1 ?? m.groups.line2) };
            if (m.groups.col1 || m.groups.col2) {
                result.column = Number(m.groups.col1 || m.groups.col2);
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
            const result = { type: "FilePath", filePath: normalizeFilePath(m[1]), line: Number(m[2]) };
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
        m => [
            [m[1]],
            ...intersperse(
                m[2]
                    .split(".")
                    .reduce(
                        (result, symbol) => [
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
            [m[3]],
        ],
    ],
];

function intersperse(arr, separator) {
    return arr.length === 0 ? [] : arr.slice(1).reduce((r, item) => [...r, separator, item], [arr[0]]);
}

const normalizeFilePath = filePath => filePath.replace(/[\/\\]+/g, "/");

function splitByRegex(input, regex, tokenFactory) {
    const result = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(input)) !== null) {
        if (match.index > lastIndex) {
            result.push([input.slice(lastIndex, match.index)]);
        }
        const tokenMeta = tokenFactory(match);
        if (Array.isArray(tokenMeta)) result.push(...tokenMeta);
        else result.push([match[0], tokenFactory(match)]);
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < input.length) {
        result.push([input.slice(lastIndex)]);
    }
    return result;
}

function regexMatchCount(str, regex) {
    let count = 0;
    let match;
    while ((match = regex.exec(str)) !== null) {
        count++;
    }
    return count;
}

exports.splitIntoTokens = function splitIntoTokens(trace) {
    const result = [];
    const lines = trace.split("\n");

    for (const preline of lines) {
        const escapedNewLineCount = regexMatchCount(trace, /\\n\s+/gi);
        if (preline.length / (escapedNewLineCount - 1) > 100 || (preline.length / 240 && escapedNewLineCount > 5)) {
            lineOfLines = preline.replace(/\\n/gi, "\n").split("\n");
        } else {
            lineOfLines = [preline];
        }

        for (const line of lineOfLines) {
            let lineTokens = [[line]];

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
    }
    return result;
};

exports.getPossibleFilePathsToSearch = function* getPossibleFilePathsToSearch(filePath) {
    const parts = filePath.split(/[\/\\]/);
    const result = [];
    for (let i = 0; i < parts.length; i++) {
        yield parts.slice(i).join("/");
    }
    return result;
};
