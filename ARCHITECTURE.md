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
│   ├── pathMatch.ts              — pure smart-candidate + suffix matching/ranking (testable)
│   ├── fsWalk.ts                 — bounded-concurrency directory walk by basename
│   ├── gitCli.ts                 — `git` CLI wrappers: rev-parse, ls-files, ignored entries
│   ├── searchScopes.ts           — workspace folders → plan of git / walk scopes
│   ├── candidateResolver.ts      — the resolution ladder → resolveFilePaths() (vscode-free)
│   ├── vscodeGitRepos.ts         — repository roots from the `vscode.git` API
│   ├── indexedFileSearcher.ts    — FileSearcher adapter (reads workspaceFolders)
│   └── fileSearcherFactory.ts    — composite fast+fallback searcher, config-gated
├── utils/
│   ├── asyncUtils.ts             — delay()
│   ├── commontUtils.ts           — intersperse(), regexMatchCount()
│   ├── logger.ts                 — vscode-free logging seam: scoped loggers + timers
│   ├── vscodeLogger.ts           — LogOutputChannel adapter, installed on activation
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

#### Fast searcher (the default)

On large repos the `findFiles("**/*/…")` fallback above is slow (a full workspace walk per suffix
candidate, per frame, with no dedup) — on a Java monorepo one 30-frame trace took 82 s through it
versus 5 s through the git index. The **fast, vscode-free resolver** in `src/native/` is therefore the
default; `createFileSearcher()` (`fileSearcherFactory.ts`) picks it from the
`stack-trace-analyzer.search.*` feature flags (the highest-priority enabled one wins; the legacy
`VscodeWorkspaceFileSearcher` is the base fallback, reached only when every flag is off):

- **`search.gitIndex`** (default **on**) — the fast resolver, git first (with filesystem-walk
  fallbacks internally). Turning it off restores VS Code's workspace search.
- *(future: `search.native`, `search.filesystem`, slotting in as more flags ordered fastest-first.)*

`createFileSearcher()` is called per analysis, so a flag change takes effect without reloading the
window. All frames resolve in one batch (`FileSearcher.findFiles`, consumed by
`enrichTokensWithWorkspacePaths` after de-duplicating paths).

##### Search scopes (`searchScopes.ts`)

The resolver never assumes "one workspace folder == one git repository" — that assumption used to
collapse into a full filesystem walk in two very common layouts:

- a folder holding **several repositories** (and repositories **nested** inside a workspace folder:
  `git ls-files` never descends into another repository), and
- a workspace folder that is only a **subdirectory of one big repository** (`git ls-files` run from a
  subdirectory only ever reports that subtree).

`planSearchScopes()` turns the workspace folders into a list of scopes, each either **git** (`dir` to
query, plus the `repoTop` of its repository) or **walk** (`dir` plus `excludeDirs` carved out because a
git scope covers them). Per workspace folder it:

1. finds the enclosing repository — first among the roots the host already knows
   (`vscodeGitRepos.getKnownRepoRoots()`, i.e. `vscode.git`'s `api.repositories`), otherwise one
   `git rev-parse --show-toplevel` call;
2. probes the folder's immediate subdirectories for `.git` (depth 1, matching VS Code's default
   `git.repositoryScanMaxDepth`) as a safety net for containers and submodules when the git extension
   reported nothing — one `readdir` plus a `stat` per subdirectory;
3. emits a git scope for the folder itself (when it is inside a repository) plus one per contained
   repository, or — when nothing encloses it — git scopes for the contained repositories and a single
   walk scope for the remainder.

##### The resolution ladder (`candidateResolver.ts`)

`resolveFilePaths()` climbs four rungs, each running **only for the frames still unresolved**, so the
expensive rungs see a shrinking set of basenames:

1. **Smart candidate** — a direct `stat` (`pathMatch.computeSmartCandidatePathsPure`). Anchors are the
   workspace folders *and* the repository tops, since a build-agent path carries the repo's directory name.
2. **Primary pass over the scopes** (bounded concurrency): git scopes get
   `git ls-files -z --cached --others --exclude-standard -- :(icase)*<basename>…` (git filters by
   basename on its side, streamed and NUL-split, `.gitignore` honored for free); walk scopes get
   `fsWalk.walkForBasenames` with their `excludeDirs`. A git scope git refuses to serve (exit 128)
   degrades to a walk of that directory.
3. **Widening to the repository top** — for scopes where the workspace folder is only a subdirectory,
   the same query re-runs from `repoTop`. This is a whole-repo query, so it only runs on what is still
   missing.
4. **The git-ignored areas** — generated code git deliberately omits. Asking git for ignored *files*
   would mean scanning every `node_modules`; instead `gitListIgnoredEntries()` asks for ignored
   *entries* with directories collapsed (`--directory --no-empty-directory` — git never descends, so
   this is essentially free), the build-output and dependency directories from `fsWalk.IGNORED_DIRS`
   are dropped, and only what remains is walked.

Candidates accumulate across rungs and are ranked by longest matching path suffix
(`pathMatch.rankCandidates`), preferring a candidate inside a workspace folder when suffixes tie
(rung 3 can reach outside them), then the shorter path. The resolver `stat`s down the ranked list, so a
stale index entry (sparse checkout) does not sink the frame.

If **git crashes** (killed, unexpected exit, spawn error — as opposed to "not a repo"), the resolver
throws `GitSearchError` and the composite in `fileSearcherFactory.ts` falls the whole request back to
`VscodeWorkspaceFileSearcher`. The core (`pathMatch`, `fsWalk`, `gitCli`, `searchScopes`,
`candidateResolver`) imports no `vscode`, so it is unit-tested directly against real git fixtures in
`src/test/nativeFileSearch.test.ts` (fixtures under `src/test/fixtures/sample-repo/`, plus throwaway
repos built per layout test).

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
| `showLogs` | — | Reveal the "Stack Trace Analyzer" output channel |
| `disableVcsIntegration` | `executeDisableVcsIntegrationCommand` | Disable VCS |

---

## Logging

Everything the file search does is traced to a `vscode.LogOutputChannel` named
**Stack Trace Analyzer** (`Stack Trace Analyzer: Show logs`, or the Output panel). The channel is a
log channel, so the *level* is the user's to pick via **Developer: Set Log Level…** — no setting of
our own. Info is the default; the timings below live at Debug.

The resolver core (`src/native/`) must stay importable without the VS Code runtime, so it never
touches an `OutputChannel`. `utils/logger.ts` is the seam instead:

- `createScopedLogger(scope)` — a `Logger` prefixing every message with `[scope]`; it resolves the
  sink lazily, so module-level loggers work no matter when the sink is installed.
- `setLogger(logger)` — installs the process-wide sink. The default is a no-op, which is what unit
  tests get: they never install one and pay nothing.
- `startTimer()` / `formatList()` — elapsed whole milliseconds, and list rendering that stays short.

`extension.ts` creates the channel on activation and installs `createVscodeLogger(channel)`.

What each level carries:

| Level | Content |
|---|---|
| `info` | One line per phase: which searcher was picked and why, parse / search / VCS durations, how many frames resolved. |
| `debug` | The search plan, each ladder stage (resolved / left / ms), each `git ls-files` call, each disk walk, each legacy `findFiles` frame. |
| `trace` | `git rev-parse` probes. |
| `warn` | The slow or degraded paths: a workspace folder that is not in a repository (so it gets walked), a git call or walk over ~1.5 s, and — previously swallowed silently — the fast searcher throwing and falling back to VS Code's workspace search. |

The intent is that a "why was the search slow?" question is answerable from one Debug-level run:
whether the git index was used at all, which scope ate the time, and how much of it each rung of the
ladder cost.

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
