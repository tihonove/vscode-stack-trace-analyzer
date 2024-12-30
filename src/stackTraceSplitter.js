const tokenizers = [
    [
        /((?:(?:\w\:\\{1,})|[\/\\]+|[\d\w\.])([^\/\\\s\(\):]+[\/\\]+)+([^\\\/\s\(\):]+\.([\d\w]{2,5})))(:(line )?(\d+)(\:(\d+))?)/gi,
        m => {
            const result = { type: "FullFilePathWithLine", filePath: normalizeFilePath(m[1]), line: Number(m[7]) };
            if (m[9]) {
                result.column = Number(m[9]);
            }
            return result;
        },
    ],
    [/(?:(?:\w\:\\{1,})|[\/\\]+|[\d\w\.])([^\/\\\s\(\):]+[\/\\]+)+([^\/\\\s\(\):]+\.([\d\w]{2,5}))/gi, m => ({ type: "FullFilePath", filePath: normalizeFilePath(m[0]) })],
];

const normalizeFilePath = filePath => filePath.replace(/[\/\\]+/g, '/');

function splitByRegex(input, regex, tokenFactory) {
    const result = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(input)) !== null) {
        if (match.index > lastIndex) {
            result.push([input.slice(lastIndex, match.index)]);
        }
        result.push([match[0], tokenFactory(match)]);
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < input.length) {
        result.push([input.slice(lastIndex)]);
    }
    return result;
}

exports.splitIntoTokens = function splitIntoTokens(trace) {
    const result = [];
    const lines = trace.split("\n");

    for (const line of lines) {
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
