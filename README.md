# Stack Trace Analyzer — clickable stack traces

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/tihonove.stack-trace-analyzer.svg)](https://marketplace.visualstudio.com/items?itemName=tihonove.stack-trace-analyzer)
[![Installs](https://vsmarketplacebadges.dev/installs-short/tihonove.stack-trace-analyzer.svg)](https://marketplace.visualstudio.com/items?itemName=tihonove.stack-trace-analyzer)
[![Open VSX](https://img.shields.io/open-vsx/v/tihonove/stack-trace-analyzer?label=open%20vsx)](https://open-vsx.org/extension/tihonove/stack-trace-analyzer)
[![Downloads](https://img.shields.io/open-vsx/dt/tihonove/stack-trace-analyzer?label=downloads)](https://open-vsx.org/extension/tihonove/stack-trace-analyzer)
[![License: MIT](https://img.shields.io/github/license/tihonove/vscode-stack-trace-analyzer)](https://github.com/tihonove/vscode-stack-trace-analyzer/blob/main/LICENSE.md)

**Analyze Stack Trace, like in IntelliJ IDEA — for VS Code.** Copy any stack trace or traceback, run one
command, and every frame becomes a link straight to the line in your code. Any language, any source:
CI logs, Sentry, Slack, a colleague's message.

![A stack trace rendered as clickable frames in the Stack Trace Analyzer panel](https://raw.githubusercontent.com/tihonove/vscode-stack-trace-analyzer/main/docs/StackTracePanel.png)

*Note the paths in that trace: `/builds/forms/forms/…`. They come from a build agent and do not exist on
this machine — the frames are links anyway.*

## Why

A stack trace almost never arrives inside your editor. It arrives as dead text: pasted into a chat, sitting
in a CI job log, quoted in a bug report.

Reading it means doing the same thing by hand thirty times — eyeball a path, guess which local file it
means, open it, scroll to the line number. By the tenth frame you have lost the thread you were actually
chasing.

## How it works

1. Copy a stack trace to the clipboard — the whole thing, however messy.
2. Run **Stack Trace Analyzer: Analyze stack from clipboard**.
3. The panel renders the trace immediately as text, so you can start reading right away.
4. Links and git tooltips fill in as resolution completes, frame by frame.

Pasting a JSON log line works too: if the trace is embedded in a JSON string, it is unwrapped and unescaped
automatically, so a Sentry or Loki payload can go in whole.

Any language works — Java, C#, Python, JavaScript/TypeScript, Go, Rust, PHP, Ruby, C, and anything else
that prints `path:line`.

### When the paths don't match

This is the part that usually matters, and it is why the extension exists.

A trace produced on a build agent, in a container, or on a teammate's machine carries paths that do not
exist on yours. That is fine: Stack Trace Analyzer finds the matching file in your workspace by name and
by as much of the path as lines up, so `C:/BuildAgent/work/<hash>/my-repo/src/Utils/Helper.cs` opens
`src/Utils/Helper.cs` in your local `my-repo` — and wins over an unrelated `Helper.cs` elsewhere. No
configuration, no path mappings.

It stays fast on big repositories too: the search goes through git rather than scanning the disk, and
setups with several repositories or nested repositories are handled.

## Coming from IntelliJ IDEA?

This is the "Analyze Stack Trace" feature you are missing, with the same job and a few different habits:

| | IntelliJ IDEA | Stack Trace Analyzer |
|---|---|---|
| Entry point | A dialog you paste into | A command that reads the clipboard |
| Results | One analysis at a time | A panel keeping the last 10 traces, with next/previous |
| Unmatched paths | Resolved within the project's modules | Matched against your workspace by path — CI and container paths resolve with no configuration |
| Thread dumps | Analyzes thread dumps and deadlocks | Not supported |

## Commands and settings

Everything lives in the Command Palette; the extension does not claim any keyboard shortcuts of its own.

![The extension's commands in the VS Code Command Palette](https://raw.githubusercontent.com/tihonove/vscode-stack-trace-analyzer/main/docs/Commands.png)

| Command | What it does |
|---|---|
| `Stack Trace Analyzer: Analyze stack from clipboard` | The main one: parse the clipboard and show the trace |
| `Stack Trace Analyzer: Previous stack trace` / `Next stack trace` | Step through the last 10 analyzed traces |
| `Stack Trace Analyzer: Clear analyzed stack traces` | Empty the panel and the history |
| `Stack Trace Analyzer: Enable VCS Integration` / `Disable VCS Integration` | Turn the last-commit tooltips on and off |
| `Stack Trace Analyzer: Show logs` | Open the extension's log — start here if a search is slow |

| Setting | Default | What it does |
|---|---|---|
| `stack-trace-analyzer.search.gitIndex` | `true` | Find files through git. Turn it off only if links go missing — VS Code's own search is used instead, which is much slower on large repositories. |

## FAQ

**My stack trace isn't recognised.**
[Open an issue](https://github.com/tihonove/vscode-stack-trace-analyzer/issues) and paste the trace.

**The frames aren't linked — my paths don't match.**
Run `Stack Trace Analyzer: Show logs` to see what the search did. For more detail, switch the level to
Debug (`Developer: Set Log Level…` → *Stack Trace Analyzer*) and analyze the trace again — that log is the
most useful thing to attach to an issue.

**Does it send anything anywhere?**
No. No network calls, no telemetry — your stack traces never leave your machine.

**What is the tooltip on a resolved frame?**
With VCS integration on, each resolved file is looked up in git history and the commit that last touched it
is shown — often enough on its own to tell you who to ask.

## Contributing

Issues and pull requests are welcome at
[github.com/tihonove/vscode-stack-trace-analyzer](https://github.com/tihonove/vscode-stack-trace-analyzer).
New stack-trace formats are the most useful contribution — see
[ARCHITECTURE.md](https://github.com/tihonove/vscode-stack-trace-analyzer/blob/main/ARCHITECTURE.md) for how
the parser is put together.

[Changelog](https://github.com/tihonove/vscode-stack-trace-analyzer/blob/main/CHANGELOG.md) ·
[Report a problem](https://github.com/tihonove/vscode-stack-trace-analyzer/issues) ·
[Rate it on the Marketplace](https://marketplace.visualstudio.com/items?itemName=tihonove.stack-trace-analyzer&ssr=false#review-details)

## License

MIT — see [LICENSE.md](https://github.com/tihonove/vscode-stack-trace-analyzer/blob/main/LICENSE.md).
