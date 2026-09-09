# Stack trace analyzer [![Open VSX Version](https://img.shields.io/open-vsx/v/tihonove/stack-trace-analyzer)](https://open-vsx.org/extension/tihonove/stack-trace-analyzer)


Stack trace analyzer - Easy way to analyze stack traces from any language and sources.

## Features

- Analyze stack traces from clipboard with a single command.
- Automatically highlights and links file paths and line numbers in stack traces.
- Supports any programming language as it uses the built-in index.
- Handles stack traces even if paths partially do not match (e.g., due to CI builds).

## Commands

- `Analyze stack from clipboard`

![Commands](docs/Commands.png)

## Usage

1. Copy a stack trace to your clipboard.
2. Run the `Analyze stack from clipboard` command.
3. The stack trace will be analyzed and displayed in the panel with clickable file paths and line numbers.

![Result](docs/StackTracePanel.png)

## Troubleshooting

If your stack trace is not working, please open an issue on [GitHub](https://github.com/tihonove/vscode-stack-trace-analyzer/issues).

### When the search is slow or finds nothing

Run `Stack Trace Analyzer: Show logs` to open the extension's log. It reports which search strategy
was used and how long each phase took. For the full detail — the search plan, every `git ls-files`
call and every directory scan with its duration — raise the level first with
`Developer: Set Log Level…` → *Stack Trace Analyzer* → *Debug*, then analyze the stack trace again.
Attaching that log to an issue helps a lot.

Successfully tested on the following languages:

- C
- C#
- Go
- Java
- JavaScript
- PHP
- Python
- Ruby
- Rust

## License

MIT License