#!/usr/bin/env python3
"""PreToolUse hook for Bash, in place of rtk's own `rtk hook claude`: runs rtk's rewrite, then fixes three things.
1. A bare assignment whose value ends in a task-runner name (S=/x/task-observer, S="/x/just") became `rtk S=...`,
   which runs "S=..." as a program: the variable is lost and every later $S path is empty.
   `rtk ` before NAME= is removed.
2. Inside ( ) subshells rtk ignores exclude_commands, so `(cd x; git diff)` became `rtk git diff` (condensed).
   `rtk ` before any excluded command is removed, so reads, greps, diffs and tests stay exact everywhere.
3. `graphify update .` rewrites the tracked graphify-out/, so a later pull/rebase/merge stopped on "unstaged
   changes". Each `git pull|rebase|merge` (not --continue/--abort) first restores graphify-out/;
   run `graphify update .` after it.
It also refuses, each refusal saying what to do instead, three commands that do harm a rule alone did not stop:
`pkill -f` (its pattern matches the shell that typed it), polling CI with `gh` in a cloud session, and `git stash`
while a merge is in progress (the stash drops MERGE_HEAD and the resolved merge becomes plain changes).
Only command positions outside heredoc bodies are touched (shortcut: `echo "a; git pull"` still
matches; parse with bashlex if that ever bites). Everything else rtk rewrites (git status, git log, ls ...) passes through."""
import json, os, re, subprocess, sys
try:
    import tomllib
    EXCL = tomllib.load(open(os.path.expanduser('~/.config/rtk/config.toml'), 'rb'))['hooks']['exclude_commands']
except Exception:  # noqa: BLE001 - no config: keep the other fixes
    EXCL = []
raw = sys.stdin.read()
try:
    orig = json.loads(raw)['tool_input']['command']
except (ValueError, KeyError, TypeError):
    sys.exit(0)
AT = r'(^|[;&|({\n]\s*)'              # command position only, so text in strings and messages is left alone


def code_lines(cmd):
    """Yield (line, is_code): heredoc bodies are data (file contents, commit messages), never commands."""
    end = None
    for line in cmd.split('\n'):
        if end is not None:
            yield line, False
            if line.strip() == end:
                end = None
            continue
        yield line, True
        m = re.search(r'<<-?\s*([\'"]?)(\w+)\1', line)
        end = m.group(2) if m else None


def refusal(code, cwd):
    if re.search(AT + r'pkill\b[^;&|\n]*?(\s-\w*f|\s--full\b|\$\(\s*pgrep\b)', code):
        return ('`pkill -f` (or `pkill -P $(pgrep -f ...)`) matches the shell that typed it too. Stop a process by its '
                'pid: TaskStop for a background task, `bash $KIT_DIR/workers/stop-worker.sh <name>` for a worker, '
                'or `kill <pid>` after reading the pid with `pgrep -f <pattern>`.')
    if os.environ.get('CLAUDE_CODE_REMOTE') == 'true' and re.search(
            AT + r'gh\s+(run\s+watch|pr\s+checks|api\s+\S*(check-runs|actions/runs(/\d+)?)(?![\w/]))', code):
        return ('Do not poll CI with gh in a cloud session. Subscribe to the pull request\'s activity and end the turn '
                '(a check run wakes you), or read its check runs once with the GitHub MCP tools.')
    # shortcut: `cd <dir> && git stash` is judged in the session's folder, not <dir>; follow the cd if that bites.
    for m in re.finditer(AT + r'git\s+(?:-C\s+(\S+)\s+)?stash\b(?!\s+(list|show)\b)', code):
        d = os.path.join(cwd, os.path.expanduser(m.group(2).strip('\'"'))) if m.group(2) else cwd
        r = subprocess.run(['git', '-C', d, 'rev-parse', '--git-path', 'MERGE_HEAD'], capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(os.path.join(d, r.stdout.strip())):
            return ('A merge is in progress (MERGE_HEAD exists): `git stash` would drop it and turn the resolved merge '
                    'into plain changes. Commit the merge first, or copy a file aside and back, or work in another '
                    'worktree.')
    return None


_cwd = (json.loads(raw).get('cwd') or os.getcwd())
for _line, _code in code_lines(orig):
    _why = _code and refusal(_line, _cwd)
    if _why:
        print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny',
                                                 'permissionDecisionReason': 'kit Bash guard: ' + _why}}))
        sys.exit(0)
try:
    out = subprocess.run(['rtk', 'hook', 'claude'], input=raw, capture_output=True, text=True, timeout=20).stdout.strip()
    o = json.loads(out) if out else None
    cmd = o['hookSpecificOutput']['updatedInput']['command'] if o else orig
except (OSError, subprocess.TimeoutExpired, ValueError, KeyError, TypeError):
    o, cmd = None, orig                # rtk missing, hung or odd output: no compaction, the other fixes still apply
alts = '|'.join(re.escape(e) for e in sorted(EXCL, key=len, reverse=True))
STRIP = re.compile(AT + r'rtk (?=[A-Za-z_][A-Za-z0-9_]*=' + (r'|(?:' + alts + r')(?:[\s;|&)]|$))' if alts else ')'))
PULL = re.compile(AT + r'(rtk )?git ((?:-C \S+ )?)(pull|rebase|merge)\b(?! --(?:continue|abort|skip|quit))')


def fix(code):
    code = STRIP.sub(r'\1', code)
    return PULL.sub(r'\1{ git \3checkout -q -- graphify-out 2>/dev/null; true; } && \2git \3\4', code)


cmd = '\n'.join(fix(line) if code else line for line, code in code_lines(cmd))
if cmd == orig:
    sys.exit(0)                        # no output: run the command as typed
if o is None:
    o = {'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecisionReason': 'kit Bash guard',
                                'updatedInput': dict(json.loads(raw)['tool_input'])}}
o['hookSpecificOutput']['updatedInput']['command'] = cmd
print(json.dumps(o))
