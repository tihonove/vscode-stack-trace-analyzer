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
├── native/                       — fast, vscode-free file resolver core + adapters
│   ├── pathMatch.ts              — pure smart-candidate + suffix matching (testable)
│   ├── fsWalk.ts                 — bounded-concurrency directory walk by basename
│   ├── candidateResolver.ts      — git ls-files / walk → resolveFilePaths() (vscode-free)
│   ├── indexedFileSearcher.ts    — FileSearcher adapter (reads workspaceFolders)
│   └── fileSearcherFactory.ts    — composite fast+fallback searcher, config-gated
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

### File path resolution (`workspaceFileResolver.ts`)

`VscodeWorkspaceFileSearcher` resolves a `filePath` from a token to an absolute URI in the workspace. The search strategy, in order:

1. **Smart candidates** (`computeSmartCandidatePaths`) — looks for a workspace folder's on-disk directory name among the path segments. If found, constructs the URI directly with `vscode.Uri.joinPath(folder.uri, suffix)` and checks existence via `workspace.fs.stat()` — a single fast call, no glob search. Example: workspace folder `my-repo` at `/home/user/my-repo`, path `C:/BuildAgent/work/hash/my-repo/src/Utils/Helper.cs` → stats `/home/user/my-repo/src/Utils/Helper.cs` directly.

2. **All suffix candidates** (`getPossibleFilePathsToSearch`) — fallback. For `a/b/c/file.ts` generates `a/b/c/file.ts`, `b/c/file.ts`, `c/file.ts`, `file.ts` and tries each in order. For each candidate, two `workspace.findFiles()` calls are made: an exact match, then a wildcard-prefix match (`**/*/<candidate>`).

`computeSmartCandidatePaths` lives in `workspaceFileResolver.ts` — takes `filePath` and workspace folders, then returns candidate `vscode.Uri` values built with `vscode.Uri.joinPath()`. Tested in `src/test/computeSmartCandidatePaths.test.ts`.

#### Fast searcher (opt-in)

On large repos the `findFiles("**/*/…")` fallback above is slow (a full workspace walk per suffix candidate, per frame, with no dedup). An opt-in **fast, vscode-free resolver** lives in `src/native/`, selected by `createFileSearcher()` (`fileSearcherFactory.ts`) from the `stack-trace-analyzer.search.*` feature flags (the highest-priority enabled one wins; the legacy `VscodeWorkspaceFileSearcher` is the base fallback when none is set):

- **`search.gitIndex`** — the fast resolver, git index first.
- **`search.filesystem`** — the fast resolver, filesystem walk only (never invokes git).
- *(future: `search.native`, slotting in as another flag ordered fastest-first.)*

`createFileSearcher()` is called per analysis, so a flag change takes effect without reloading the window. All frames resolve in one batch (`FileSearcher.findFiles`, consumed by `enrichTokensWithWorkspacePaths` after de-duplicating paths). Per unresolved frame the resolver walks a chain, keeping whatever an earlier step found:

1. **Smart candidate** — a direct `stat` (`pathMatch.computeSmartCandidatePathsPure`).
2. **Targeted git query** (`gitIndex` mode) — one `git ls-files -z --cached --others --exclude-standard -- :(icase)*<basename>…` per root. git filters by basename on its side (streamed, NUL-split), so memory stays tiny and `.gitignore` is honored for free. Because it just runs `git -C <root>`, it transparently handles worktrees (a `.git` file, not a directory) and roots at any depth relative to the repo top; a root that is not a repo (git exit 128) or has no git falls through to the walk.
3. **Filesystem walk** — for non-git roots, for `filesystem` mode, and for anything git served but did **not** contain (nested repos, submodules, git-ignored generated files), `fsWalk.walkForBasenames` scans the git-served roots for the still-missing basenames.

Candidates are ranked by longest matching path suffix (`pathMatch.matchCandidate`), then the winner is `stat`-validated (handles sparse-checkout). If **git crashes** (killed, unexpected exit, spawn error — as opposed to "not a repo"), the resolver throws `GitSearchError` and the composite in `fileSearcherFactory.ts` falls the whole request back to `VscodeWorkspaceFileSearcher`. The core (`pathMatch`, `fsWalk`, `candidateResolver`) imports no `vscode`, so it is unit-tested directly against a real git fixture in `src/test/nativeFileSearch.test.ts` (fixtures under `src/test/fixtures/sample-repo/`).

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
