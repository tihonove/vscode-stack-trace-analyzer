import type { CommitInfo, Token } from "../../TokenMeta";

const vscode = acquireVsCodeApi();
// @ts-ignore
const prevLines = (vscode.getState() || { lines: null }).lines;

function getTimeAgo(date: Date) {
    const now = new Date();
    // @ts-ignore
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) {
        return diffDays + " day" + (diffDays > 1 ? "s" : "") + " ago";
    } else if (diffHours > 0) {
        return diffHours + " hour" + (diffHours > 1 ? "s" : "") + " ago";
    } else if (diffMinutes > 0) {
        return diffMinutes + " minute" + (diffMinutes > 1 ? "s" : "") + " ago";
    } else {
        return "just now";
    }
}

function createTooltip(lastCommit: CommitInfo): HTMLElement | null | undefined {
    const template = document.querySelector("#tooltip-template") as HTMLTemplateElement;
    const tooltip = template.content.cloneNode(true) as HTMLTemplateElement;

    const messageRow = tooltip.querySelector(".commit-message-row") as HTMLElement;
    const authorRow = tooltip.querySelector(".commit-author-row") as HTMLElement;

    const commitMessageElement = tooltip.querySelector(".commit-message") as HTMLElement;
    if (commitMessageElement != null) {
        if (lastCommit.message) {
            commitMessageElement.textContent = lastCommit.message;
        } else {
            commitMessageElement.style.display = "none";
        }
    }

    const commitHashElement = tooltip.querySelector(".commit-hash") as HTMLElement;
    if (commitHashElement != null) {
        if (lastCommit.hash) {
            const shortHash = lastCommit.hash.substring(0, 7);
            commitHashElement.textContent = shortHash;
        } else {
            commitHashElement.style.display = "none";
        }
    }

    const commitAuthorElement = tooltip.querySelector(".commit-author") as HTMLElement;
    if (commitAuthorElement != null) {
        if (lastCommit.authorName) {
            commitAuthorElement.textContent = lastCommit.authorName;
        } else {
            commitAuthorElement.style.display = "none";
        }
    }

    const commitDateElement = tooltip.querySelector(".commit-date") as HTMLElement;
    if (commitDateElement != null) {
        if (lastCommit.authorDate) {
            const date = new Date(lastCommit.authorDate);
            const timeAgo = getTimeAgo(date);
            commitDateElement.textContent = timeAgo;
        } else {
            commitDateElement.style.display = "none";
        }
    }

    if (messageRow != null && !lastCommit.message && !lastCommit.hash) {
        messageRow.style.display = "none";
    }
    if (authorRow != null && !lastCommit.authorName && !lastCommit.authorDate) {
        authorRow.style.display = "none";
    }

    return tooltip;
}

function showLines(lines: Token[][]) {
    const element = document.querySelector("#current-stack-trace") as HTMLElement;
    if (element == null) return;
    element.innerText = "";
    for (const lineTokens of lines) {
        const lineElement = document.createElement("div");
        for (const token of lineTokens) {
            const tokenText = token[0];
            let tokenElement;
            if (token[1]?.type == "FilePath") {
                tokenElement = document.createElement("a");
                tokenElement.innerText = tokenText;
                tokenElement.href = "#";

                const lastCommit = token[1]?.vcsInfo?.lastChangeCommit;
                if (lastCommit && lastCommit.authorDate) {
                    const commitDate = new Date(lastCommit.authorDate);
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                    if (commitDate > sevenDaysAgo) {
                        tokenElement.classList.add("file-path-recent");
                        const tooltip = createTooltip(lastCommit);
                        if (tooltip != null) {
                            tokenElement.appendChild(tooltip);
                        }
                    }
                }

                tokenElement.onclick = () => {
                    vscode.postMessage({
                        type: "OpenFile",
                        tokenMeta: token[1],
                    });
                };
            } else if (token[1]?.type == "Symbol") {
                tokenElement = document.createElement("a");
                tokenElement.classList.add("symbol");
                tokenElement.innerText = tokenText;
                tokenElement.href = "#";
                tokenElement.onclick = event => {
                    vscode.postMessage({
                        type: "GoToSymbol",
                        // @ts-ignore
                        tokenMeta: event.shiftKey ? { ...token[1], symbols: token[1].symbols.slice(-1) } : token[1],
                    });
                };
            } else {
                tokenElement = document.createElement("span");
                tokenElement.innerText = tokenText;
            }
            lineElement.appendChild(tokenElement);
        }
        element.appendChild(lineElement);
    }
}

if (prevLines) {
    showLines(prevLines);
}

window.addEventListener("message", async event => {
    const message = event.data;
    switch (message.type) {
        case "setStackTraceTokens": {
            showLines(message.lines);
            vscode.setState({ lines: message.lines });
            break;
        }
        case "clearAnalyizedStackTraces": {
            const currentStackTraceElement = document.querySelector("#current-stack-trace") as HTMLElement;
            if (currentStackTraceElement != null) {
                currentStackTraceElement.innerText = "Call 'Analyze stack trace from clipboard' to see the stack trace";
            }
            vscode.setState({ lines: null });
            break;
        }
    }
});
