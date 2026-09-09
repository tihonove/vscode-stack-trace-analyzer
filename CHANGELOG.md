# Changelog

All notable changes to this project are documented here. Versions ending in
`-pre` were published to the pre-release channel only.

## [1.17.0-pre] - 2026-09-09

### Features

- Log the whole file-search path to a VS Code log channel

## [1.16.0-pre] - 2026-08-28

### Features

- Plan git search scopes instead of assuming one repo per workspace folder

### Miscellaneous

- Add pre-release channel to the publish pipeline

## [1.15.0] - 2026-07-12

### Features

- Add fast git/filesystem file searcher for stack-trace resolution

### Bug Fixes

- Install prettier via postCreateCommand instead of feature
- Use javascript-node image so npm is on system PATH

### Refactor

- Make search strategy a set of search.* feature flags
- Keep only the search.gitIndex flag

### Miscellaneous

- Add claude-code CLI to devcontainer global npm installs
- Fix kitty terminfo and locale in devcontainer
- Bump devcontainer to Node 24 and add gh CLI
- Install tmux in devcontainer
- Update devcontainer

## [1.14.0] - 2026-06-01

### Bug Fixes

- Keep stack trace panel scroll position when opening a link ([#39](https://github.com/tihonove/vscode-stack-trace-analyzer/pull/39))

### Performance

- Resolve stacktrace paths using workspace folder segment ([#38](https://github.com/tihonove/vscode-stack-trace-analyzer/pull/38))

## [1.13.3] - 2026-05-25

### Miscellaneous

- Prepare for file searching update

## [1.13.2] - 2026-05-23

### Features

- Stream file search results to webview progressively

## [1.13.1] - 2026-05-23

### Documentation

- Update README.md to remove Visual Studio Marketplace badge

### Miscellaneous

- Update release workflow to include version info and enhance release body

## [1.13.0] - 2026-05-23

### Documentation

- Update AGENTS.md and add ARCHITECTURE.md for project guidelines

### Miscellaneous

- Add github releases with conventional commits changelog

## [1.12.0] - 2026-03-27

### Features

- Migrate testing framework from Jest to Vitest
- Detect and format JSON with embedded stack traces

### Bug Fixes

- Update Node.js version to 20.x in CI workflow

## 1.11.1 and earlier

Releases from 1.0.0 (2024-12-29) through 1.11.1 (2026-03-19) predate conventional
commits in this repository, so there is nothing to generate a changelog from.
The full list, with the packaged `.vsix` for each version, is at
[github.com/tihonove/vscode-stack-trace-analyzer/releases](https://github.com/tihonove/vscode-stack-trace-analyzer/releases).

Versions 1.12.2 through 1.12.4 are absent above by design: they were built from a
release-pipeline branch that never merged, and carry no user-facing changes.
