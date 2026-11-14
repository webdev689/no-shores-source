---
type: reference
code:
  - tools/claude-toolkit/install-all.sh
  - tools/claude-toolkit/check-tools.sh
  - tools/claude-toolkit/workers/run-worker.sh
  - tools/claude-toolkit/workers/brief-common-template.md
---
# Toolkit

How Claude uses the co-dev's toolkit in `tools/claude-toolkit/` ([[The Co-Dev's Toolkit, Whole]]). `CLAUDE.md` says
when to install it and what each session does at its start and end; this note says how to use each tool.

## Running the kit

- Call its scripts as `bash x.sh` or `python3 x.py`.
- After any change to the kit, run `bash tools/claude-toolkit/check-tools.sh --worker` and expect no FAIL line.
- Plugins and MCP servers the install adds load in the next session. In the session that ran the install, use a
  skill by reading its `SKILL.md` (`find ~/.claude/plugins/cache -path '*skills/<name>/SKILL.md'`), and hand Serena
  and claude-mem work to a worker.
- `SHARED_DIR` defaults to `~/toolkit-data`, which a cloud container loses at its end: the claude-mem store and the
  task-observer log carry over only where `SHARED_DIR` points at storage that survives.
- The SkillsMP and Context7 keys are network secrets the proxy adds to requests; their variables hold only the
  placeholder `proxy-injected`.

## Tools

| Tool | How to use it |
|---|---|
| graphify | The code map. `graphify explain <symbol or file>` or `graphify path <A> <B>` for known names; `graphify query` only with a pointed question naming a function or file. Ask it before grepping or opening big files; update it after every merge or commit. Its `graphify-out/` is ignored by git. |
| Serena | MCP, tools interface: `find_symbol`, `find_referencing_symbols`, `get_symbols_overview`, `replace_symbol_body`. graphify finds the file or system, Serena the exact symbol. Plain Edit only for small in-line changes and files Serena cannot parse. If only `serena_repl` shows, the install is broken: fix it first. Its project lists both `typescript` and `rust`. |
| claude-mem | Search it before re-investigating anything. Its `smart_search` and `smart_outline` are not for code: use Serena. |
| Headroom | Compress big outputs with `headroom_compress` and `headroom_retrieve`. MCP only, never in the API path. |
| Context7 | MCP: a library's current docs before guessing its API. |
| superpowers | brainstorming, writing-plans, using-git-worktrees, subagent-driven-development, test-driven-development, verification-before-completion, systematic-debugging; requesting-code-review for the final review. |
| ponytail | The smallest complete change; a ponytail review before each merge and on the final diff. |
| Caveman | Through the kit's SubagentStart hook only: sub-agents and workers are terse; replies to the owner stay in full sentences. |
| rtk | Compacts `git status`, `git log` and `ls` only; reads, greps, diffs and test runs stay exact. If an output looks cut, run it again as `rtk bypass <command>`; write `git --no-pager log ...` for an exact log. |
| MarkItDown | Convert uploaded files (PDF, Word, Excel, PowerPoint) with `markitdown <file>` before reading them. |
| impeccable | The web and UI layer only. |
| SkillsMP | Find a skill for a new kind of job. |
| claude-code-setup | Run "recommend Claude Code automations for this project" when the setup is reviewed or a new stack arrives; adopt only what the other tools do not already cover. |
| task-observer | Log each correction, tool clash or slow rule with its `new-observation.sh` into `$SHARED_DIR/task-observer`, never the repo. Workers never log; they end with an "OBSERVATIONS:" line and the controller logs it. The owner approves every rule change at a review. |
| Syntax hook | "syntax check failed" after an Edit or Write means fix it now. |
| Commit guard | The clone's pre-commit hook refuses archives and C2PA-stamped PNGs. Never bypass it with `--no-verify`. |
| Browser QA | Playwright with the preinstalled Chromium; never run `playwright install` in a cloud session. |

## Workers

Work that fans out goes to headless workers, each in its own git worktree.

- Start one with `bash tools/claude-toolkit/workers/run-worker.sh <worktree> <brief>` (Bash, in the background,
  timeout 7200000). Each gets Serena pinned to its worktree, Context7, Headroom, claude-mem and SkillsMP.
- Every brief starts from `tools/claude-toolkit/workers/brief-common-template.md`.
- A late change goes in the worker's inbox (`~/wt/reports/inbox-<name>.md`, under a `## <short heading>` line), not a
  stop and `--resume`.
- Stop one with TaskStop or `bash tools/claude-toolkit/workers/stop-worker.sh <name>`, never `pkill -f <pattern>`.
- A worker's first three actions: one claude-mem search; `graphify update .` and one `graphify explain` or `path`;
  Serena `get_symbols_overview` on each source file it will change.
- Every worker ends with superpowers:verification-before-completion, one reviewer sub-agent, then
  ponytail:ponytail-review on its diff, even for a one-line change.
- Before merging a worker's branch: `python3 tools/claude-toolkit/workers/audit.py <worktree>` (its MISSING line must
  say none) and a ponytail review of its diff.
