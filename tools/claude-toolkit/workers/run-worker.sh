#!/bin/bash
# Headless worker with the full tool set (Serena on ITS worktree, Context7, Headroom, claude-mem, SkillsMP;
# Caveman voice; rtk, syntax and task-observer hooks from ~/.claude/settings.json).
# usage: run-worker.sh <worktree dir> <brief file> [--resume]
#   brief file: the whole task (common rules + the item). With --resume the brief is sent as a follow-up to the
#   worker's last conversation in that worktree (claude -c), e.g. a controller update; its context is kept.
# Log: <worktree>/../reports/<name>.log ; report: <worktree>/../reports/<name>.md, the path the brief names.
# Controller: start it detached, `setsid nohup bash run-worker.sh <worktree> <brief> >/dev/null 2>&1 </dev/null &`, and
# wait with `wait-worker.sh <name>` (Bash run_in_background, timeout 7200000, started again at that limit): a worker
# started as the background task itself is killed with it at 2 h. If one is stopped anyway: --resume it.
# Late owner changes: append them to <worktree>/../reports/inbox-<name>.md; the worker re-reads it before each commit
# and before its final report. Stop/--resume only for changes that invalidate work in progress.
# Stop a worker: `bash stop-worker.sh <worktree>` (pid file); never pkill -f.
# Refused (exit 3): a start past WORKERS_MAX live workers (the owner's 2) or with under 15 GB free on the disk.
KIT_DIR=${KIT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}; SHARED_DIR=${SHARED_DIR:-$HOME/toolkit-data}; export KIT_DIR SHARED_DIR
set -u; WT=$(cd "$1" && pwd); BRIEF=$2; MODE=${3:-}; NAME=$(basename "$WT"); OUT=$(dirname "$WT")/reports; mkdir -p "$OUT"
cd "$WT"
# A refusal goes to the log too: a detached start discards stderr.
refuse() { echo "run-worker.sh: $1" | tee -a "$OUT/$NAME.log" >&2; exit "$2"; }
# Refuse a brief copied from brief-common-template.md whose <...> lines were never filled in (check-tools expects this).
left=$(grep -oE '<(the hand-off doc|project rules:|the session.s attribution lines)[^>]*>' "$BRIEF" | head -3 | tr '\n' ' ')
[ -z "$left" ] || refuse "brief $BRIEF still has: $left(fill in the template's <...> lines first)" 2
# Read once, here: a brief missing or empty when the worker starts would start it with no task.
PROMPT=$(cat "$BRIEF" 2>/dev/null); [ -n "$PROMPT" ] || refuse "brief $BRIEF is missing or empty" 2
# Refuse a brief that runs vitest or one tsc config: `npm run -s types` checks every config and `node --test` runs the
# client's tests. A line that forbids them ("never", "not", "no", "avoid", "instead", "refuse") passes.
bad=$(grep -inE 'vitest|tsc -p [^ `<]' "$BRIEF" | grep -viE "never|not |n't|no |avoid|instead|refuse" | head -2 | tr '\n' ' ')
[ -z "$bad" ] || refuse "brief $BRIEF names vitest or a single tsc -p: $bad(use npm run -s types, node --test)" 2
# At most WORKERS_MAX workers at once (the owner's 2 on this 4-core machine), and none with under 15 GB free: more
# swamped the CPU, and a full disk killed checks mid-run. The lock makes two starts at once count each other.
exec 8> "$OUT/.start.lock"; flock 8
live=0; for f in "$OUT"/*.pid; do
  [ "$f" != "$OUT/$NAME.pid" ] && [ -s "$f" ] && kill -0 "$(cat "$f")" 2>/dev/null && live=$((live + 1))
done
[ "$live" -lt "${WORKERS_MAX:-2}" ] || refuse "$live workers already running (the cap is ${WORKERS_MAX:-2}); start this one when one ends" 3
free=$(df -Pk "$WT" | awk 'NR == 2 {print $4}')
[ "$free" -ge $((15 * 1024 * 1024)) ] || refuse "$((free / 1048576)) GB free, under 15 GB; clear merged worktrees' target/ (clear-target.sh)" 3
echo $$ > "$OUT/$NAME.pid"; trap 'rm -f "$OUT/$NAME.pid"' EXIT; exec 8>&-
INBOX="$OUT/inbox-$NAME.md"
# A fresh run starts an empty inbox: one left by an earlier worker of this name is kept aside, not handed on.
[ "$MODE" != "--resume" ] && [ -f "$INBOX" ] && mv "$INBOX" "$OUT/inbox-$NAME.$(date +%Y%m%d%H%M%S).md"
[ -f "$INBOX" ] || printf '# Inbox for worker %s: the controller appends late owner changes here.\n' "$NAME" > "$INBOX"
pgrep -x graphify >/dev/null || rm -f graphify-out/.rebuild.lock   # a stopped worker can leave a stale lock
# The fork commit, from the first run: the reviewer diffs $WORKER_BASE...HEAD, only the worker's own commits. A resume
# with none recorded (a worker started before this) takes its merge-base with main.
if [ "$MODE" != "--resume" ]; then git rev-parse HEAD > "$OUT/$NAME.base"
elif [ ! -s "$OUT/$NAME.base" ]; then { git merge-base HEAD origin/main || git rev-parse HEAD; } > "$OUT/$NAME.base" 2>/dev/null; fi
WORKER_BASE=$(cat "$OUT/$NAME.base"); export WORKER_BASE
# A worktree holds only what git tracks. Link the main checkout's packages, and build here what the client's tests read
# and git ignores (the generated messages, the WebAssembly, and the fixtures Rust tests write: the protocol's messages,
# the schedule, the arts' first levels and the native elite layouts), so the worker's tests run as the main checkout's
# do, on its own Rust. Built again when the branch or head moved since the last build; one worktree builds at a time,
# so parallel starts queue instead of racing for the CPU.
MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
[ -e node_modules ] || [ ! -d "$MAIN/node_modules" ] || ln -s "$MAIN/node_modules" node_modules
stamp="$(git rev-parse --abbrev-ref HEAD) $(git rev-parse HEAD)"
if [ -f package.json ] && [ "$(cat target/.worker-built 2>/dev/null)" != "$stamp" ]; then
  ( flock 9
    { npm run -s schema && npm run -s wasm && cargo test -q -p protocol && cargo test -q -p room written_for &&
      cargo test -q -p room-wasm every_elite_dungeon_answers; } >> "$OUT/$NAME.log" 2>&1 && echo "$stamp" > target/.worker-built
  ) 9> "$OUT/.setup.lock" ||
    echo "run-worker.sh: the worktree's generated messages, WebAssembly or test fixtures did not build; see $OUT/$NAME.log" >&2
fi
[ -f .serena/project.yml ] || yes n | serena project create --name "$NAME" $(bash "$KIT_DIR/serena-languages.sh" "$WT") "$WT" >/dev/null 2>&1   # "n": extra-server prompts abort without a terminal
G=$(git rev-parse --git-common-dir); grep -qx '.serena/' "$G/info/exclude" 2>/dev/null || echo '.serena/' >> "$G/info/exclude"
MEM=$(ls -d /root/.claude/plugins/cache/thedotmack/claude-mem/*/ 2>/dev/null | sort -V | tail -1)
# headroom_compress needs its proxy. setsid: the proxy is shared, so it outlives this worker's session.
curl -s --noproxy '*' --max-time 2 http://127.0.0.1:8787/health >/dev/null || \
  (HEADROOM_BEACON=off setsid nohup headroom proxy --host 127.0.0.1 --port 8787 --no-subscription-tracking >/tmp/headroom-proxy.log 2>&1 &)
CFG="$OUT/mcp-$NAME.json"
# Serena's first start in a fresh container can pass Claude's 30 s MCP connect limit (CONNECT_TIMEOUT), and the
# worker then runs without it. Warm it with one handshake (retried once) and give MCP servers 2 minutes to connect.
serena_up() { python3 - "$WT" <<'PY'
import json, subprocess, sys
p = subprocess.Popen(['serena', 'start-mcp-server', '--context=claude-code', '--project', sys.argv[1], '--open-web-dashboard',
                      'false', '--agent-interface', 'tools'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
p.stdin.write(json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2024-11-05',
              'capabilities': {}, 'clientInfo': {'name': 'run-worker', 'version': '1'}}}) + '\n'); p.stdin.flush()
import select
ok = bool(select.select([p.stdout], [], [], 90)[0]) and '"result"' in p.stdout.readline()
p.kill(); sys.exit(0 if ok else 1)
PY
}
serena_up || serena_up || echo "run-worker.sh: Serena did not answer twice; the worker starts without a warm Serena" >&2
export MCP_TIMEOUT=120000
python3 - "$WT" "$MEM" "$CFG" <<'PY'
import json,sys
wt,mem,cfg=sys.argv[1:4]
s={"serena":{"command":"serena","args":["start-mcp-server","--context=claude-code","--project",wt,"--open-web-dashboard","false","--agent-interface","tools"]},
   "context7":{"type":"http","url":"https://mcp.context7.com/mcp"},
   "headroom":{"command":"/usr/local/bin/headroom","args":["mcp","serve"]},
   "skillsmp":{"type":"http","url":"https://skillsmp.com/mcp"}}
import os
if os.environ.get("CONTEXT7_API_KEY"): s["context7"]["headers"]={"CONTEXT7_API_KEY":"${CONTEXT7_API_KEY}"}  # expanded by claude at connect time; the key is never written
if mem: s["claude-mem"]={"command":"node","args":[mem.rstrip('/')+"/scripts/mcp-server.cjs"],"env":{"CLAUDE_PLUGIN_ROOT":mem.rstrip('/')}}
json.dump({"mcpServers":s},open(cfg,"w"),indent=1)
PY
CAVE=$(python3 -c "import re,os;print(re.sub(r'\A---.*?---\s*','',open(os.path.expanduser('~/.claude/caveman/SKILL.md')).read(),flags=re.S))" 2>/dev/null)
NOTE="CAVEMAN MODE ACTIVE (worker only): your final reply goes to the controller Claude, never to a person. Keep code, comments, commits, docs, ledger and report files in normal prose.
Your inbox is $INBOX: re-read it before each commit and before your final report, and act on anything new in it (the controller appends late owner changes there)."
export TASK_OBSERVER_ROLE=worker WORKER_INBOX=$INBOX
# A worker that ends its turn to wait on its own sub-agent (a reviewer) is woken by its result, never stopped after
# the default 10 minutes with the review lost.
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0
work() {   # work <prompt> [-c]: one headless run, its output to the log
  claude "${@:2}" -p "$1" --append-system-prompt "$CAVE

$NOTE" --strict-mcp-config --mcp-config "$CFG" \
    --allowedTools "Bash,Edit,Write,Read,Grep,Glob,Agent,Task,TodoWrite,Skill,mcp__serena__*,mcp__context7__*,mcp__headroom__*,mcp__claude-mem__*,mcp__skillsmp__*" \
    --max-turns 600 </dev/null >> "$OUT/$NAME.log" 2>&1
  echo "WORKER $NAME EXIT $?" >> "$OUT/$NAME.log"
}
C=(); [ "$MODE" = "--resume" ] && C=(-c)
work "$PROMPT" "${C[@]}"
# The branch is the deliverable: a run that ends with its edits uncommitted is resumed once to commit them.
left=$(git status --porcelain | grep -vc 'graphify-out/')
if [ "$left" -gt 0 ]; then
  echo "WORKER $NAME UNCOMMITTED $left files: resumed once to commit" >> "$OUT/$NAME.log"
  work "Your run ended with $left files changed and not committed. Re-read your inbox, finish what your brief and inbox still ask, run the brief's checks, commit on your branch with the brief's trailer, write your report and give the final reply the brief asks for." -c
fi
# A run that ends with its report older than its last commit (an error, or a turn ended while it waited) is resumed
# once to finish and write it, so the controller never reads the round before's report as this one's.
REPORT="$OUT/$NAME.md"
if [ ! -f "$REPORT" ] || [ "$(stat -c %Y "$REPORT")" -lt "$(git log -1 --format=%ct)" ]; then
  echo "WORKER $NAME REPORT STALE: resumed once to finish and write it" >> "$OUT/$NAME.log"
  work "Your run ended with your report ($REPORT) older than your last commit. Re-read your inbox, finish what your brief and inbox still ask (a review you started included), run the brief's checks, commit, write this round's report and give the final reply the brief asks for." -c
fi
# Audit the run as it ends; a final reply without its INBOX or OBSERVATIONS line is resumed once to add them.
aud=$(python3 "$KIT_DIR/workers/audit.py" "$WT" 2>&1); printf '%s\n' "$aud" >> "$OUT/$NAME.log"
if grep -qE 'OBSERVATIONS: line|INBOX NOT ACKED' <<< "$aud"; then
  echo "WORKER $NAME REPLY LINES MISSING: resumed once" >> "$OUT/$NAME.log"
  work "Your final reply lacks its INBOX or OBSERVATIONS line (audit: $(grep -E 'OBSERVATIONS: line|INBOX NOT ACKED' <<< "$aud" | tr '\n' ' ')). Re-read your inbox and give the final reply again, ending with the INBOX and OBSERVATIONS lines the brief asks for." -c
fi
# Stop what the worker left running (a preview server, a watcher): each process whose folder is in its worktree, but
# this script and its callers. The Bash tool gives each command a session of its own, so the session can't find them.
keep=" "; p=$$; while [ "${p:-0}" -gt 1 ]; do keep="$keep$p "; p=$(ps -o ppid= -p "$p" | tr -d ' '); done
for d in /proc/[0-9]*; do
  case "$keep" in *" ${d#/proc/} "*) continue ;; esac
  case "$(readlink "$d/cwd" 2>/dev/null)" in "$WT" | "$WT"/*) kill "${d#/proc/}" 2>/dev/null ;; esac
done
# The last line, after every resume: what wait-worker.sh waits on.
echo "WORKER $NAME DONE" >> "$OUT/$NAME.log"
