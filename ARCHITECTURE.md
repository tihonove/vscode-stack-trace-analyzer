# Architecture: vscode-stack-trace-analyzer

A VS Code extension for analyzing stack traces: parses text, resolves file paths in the workspace, and displays an interactive list of lines with navigation to the source file.

---

## File Structure

```
src/
├── extension.ts                  — extension entry point
├── ExtensionController.ts        — main state and logic controller
├── stackTraceSplitter.ts         — parses stack trace text into tokens
├── TokenMeta.ts                  — Token, TokenMeta, CommitInfo types
├── utils/
│   ├── asyncUtils.ts             — delay()
│   ├── commontUtils.ts           — intersperse(), regexMatchCount()
│   └── jsonPreprocessor.ts       — extracts stack trace from JSON strings
└── webview/
    ├── StackTraceWebViewPanel.ts — wrapper around vscode.WebviewView (host side)
    └── client/
        ├── webview.ts            — browser-side code: render tokens, clicks, tooltips
        └── webview.css           — panel styles
```

---

## Core Data Structures

### `Token`  (`TokenMeta.ts`)
```ts
type Token = [string] | [string, TokenMeta]
```
A pair of display text + metadata. Metadata has two variants:
- `{ type: "FilePath", filePath, line?, column?, fileUriPath?, vcsInfo? }` — a link to a file
- `{ type: "Symbol", symbols: string[] }` — a symbol chain (e.g. `MyClass.myMethod`)

`Token[][]` — the full stack trace: an array of lines, each line is an array of tokens.

### `StackTraceInfo` (`ExtensionController.ts`)
```ts
type StackTraceInfo = {
    source: string;    // original text
    lines?: Token[][]  // parsed result (populated asynchronously)
}
```
The controller maintains a `stackTraceInfos[]` array (up to 10 entries) persisted in `workspaceState`.

---

## Data Flow: Analyzing a Stack Trace

```
Clipboard text
    │
    ▼
preprocessJsonInText()          // extract stack trace from JSON if needed
    │
    ▼
splitIntoTokens()               // parse into Token[][], no fileUriPath yet
    │
    ▼
showStackTraceTokensInWebView() // display immediately (text only, no links)
    │
    ▼
echrichWorkspacePathsInToken()  // workspace.findFiles() → populate fileUriPath
    │
    ▼
showStackTraceTokensInWebView() // update panel (clickable file links)
    │
    ▼
enrichWorkspacePathsWithVscInfo() // git log via vscode.git API → vcsInfo
    │
    ▼
showStackTraceTokensInWebView() // final update (tooltips with git info)
    │
    ▼
storeStackTracesToWorkspaceState()
```

---

## Stack Trace Parser (`stackTraceSplitter.ts`)

Algorithm:
1. Split the input by `\n` (handling `\n` escape sequences inside JSON strings).
2. For each line, run all **tokenizers** sequentially.
3. Each tokenizer only touches raw tokens (no metadata yet) and tries to split them into tokens with metadata.

### How the tokenizer array works

Tokenizers execute **sequentially**: the first one that matches a piece of the string claims it — subsequent tokenizers never see it.

The array is ordered from **specific** to **general**:

- **Specific tokenizers** (beginning of the array) — match the exact syntax of a particular language or runtime: a specific separator, a specific prefix, a specific line/column format. They come first precisely to claim their format before the general ones get a chance.

- **General tokenizers** (end of the array) — broad regexes that try to find a file path in any text. They are intentionally greedy: they grab anything that looks like a path, even without line/column information.

**The primary goal of every tokenizer is to extract the file name** (`filePath`). Line and column are a bonus when the format includes them.

### Rule for adding a new tokenizer

Inserting at the end (into the general zone) won't work — those regexes already claim everything that looks like a path.  
A new tokenizer must be placed **before** the general ones that would otherwise match its format. It must be narrow and precise: matching only its own specific syntax.

### Regex primitives

Reusable building blocks for composing tokenizers:
- `pathStart` — beginning of a path (Windows drive letter, `/`, or a word character)
- `pathSegment` / `strictPathSegment` — path segment (with spaces / without)
- `fileExtension` — file extension
- `dirSeparator` — path separator
- `lineAndColumn` — `:123:45`, `(123)`, `?:line 123`, etc.
- `re` — tagged template function for composing regexes from primitives

### `getPossibleFilePathsToSearch`

For a path `a/b/c/file.ts` generates `a/b/c/file.ts`, `b/c/file.ts`, `c/file.ts`, `file.ts` — used to find a file in the workspace when the stack trace contains a partial path.

---

## Extension ↔ WebView Communication

Uses the standard VS Code Message Passing API.

**Extension → WebView:**
| Message type | Data | Action |
|---|---|---|
| `setStackTraceTokens` | `lines: Token[][]` | Re-render the stack trace |
| `clearAnalyizedStackTraces` | — | Clear the panel |

**WebView → Extension:**
| Message type | Data | Action |
|---|---|---|
| `OpenFile` | `tokenMeta` | Open the file and navigate to line/column |
| `GoToSymbol` | `tokenMeta` | `workbench.action.quickOpen` with `#Symbol` |

---

## Extension Commands

| Command | Controller method | Description |
|---|---|---|
| `analyzeStackTraceFromClipboard` | `executeAnalyzeStackTraceFromClipboardCommand` | Main command |
| `clearAnalyizedStackTraces` | `executeClearAnalyizedStackTracesCommand` | Clear history |
| `selectPrevStackTrace` | `executeSelectPrevStackTraceCommand` | Navigate backward |
| `selectNextStackTrace` | `executeSelectNextStackTraceCommand` | Navigate forward |
| `enableVcsIntegration` | `executeEnableVcsIntegrationCommand` | Enable VCS |
| `disableVcsIntegration` | `executeDisableVcsIntegrationCommand` | Disable VCS |

---

## VCS Integration

Uses the built-in `vscode.git` extension. For each `FilePath` token with a resolved `fileUriPath`, calls `repository.log({ path, maxEntries: 1 })`.  
The result — `CommitInfo` — is stored in `token[1].vcsInfo.lastChangeCommit` and shown in the WebView as a tooltip.

The `isVcsIntegrationEnabled` flag is persisted in `workspaceState`. When disabled, VCS info is stripped from all tokens without re-parsing.

---

## Persistence

The last 10 stack traces (with already computed tokens) are stored in `vscode.ExtensionContext.workspaceState` under these keys:
- `stack-trace-analyzer.stackTraceInfos`
- `stack-trace-analyzer.vcsIntegrationEnabled`

Restored on `init()`.

---

## Tests

`src/test/` — tests using **vitest**. One file per language/stack trace format.  
Only `splitIntoTokens` (and `getPossibleFilePathsToSearch`) are tested.  
Run: `npm test`.
