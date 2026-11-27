#!/usr/bin/env python3
"""Tool audit of a headless worker: which tools it really called (from its transcript), not what it says.
usage: python3 audit.py <worktree dir> ...   (reads ~/.claude/projects/<dir with / -> ->/*.jsonl, newest)"""
import collections, glob, json, os, re, subprocess, sys
for wt in sys.argv[1:]:
    d = os.path.expanduser('~/.claude/projects/' + re.sub(r'[^A-Za-z0-9]', '-', os.path.abspath(wt)))
    fs = sorted(glob.glob(d + '/*.jsonl'), key=os.path.getmtime)
    # Serena's replace_symbol_body takes a symbol's doc comment and attributes with it: a hunk that drops `///` or `#[`
    # lines but keeps its item (every `fn`, `struct` ... it removes comes back) is a slip until the report says
    # otherwise.
    diff = subprocess.run(['git', '-C', wt, 'diff', '-U0', 'origin/main...HEAD'], capture_output=True, text=True).stdout
    hunks, f = [], ''
    for l in diff.splitlines():
        if l.startswith('+++ '):
            f = l[6:] if l.startswith('+++ b/') else ''
        elif l.startswith('@@'):
            hunks.append((f, []))
        elif hunks and l[:1] in ('+', '-') and not l.startswith('--- '):
            hunks[-1][1].append(l)
    fns = lambda h, sign: set(re.findall(r'\b(?:fn|function|struct|enum|impl|trait|mod|class|interface|const|static|type)\s+(\w+)', '\n'.join(l for l in h if l[0] == sign)))
    for f, h in hunks:
        gone = [l for l in h if re.match(r'-\s*(///|#\[)', l)]
        if f and len(gone) > sum(1 for l in h if re.match(r'\+\s*(///|#\[)', l)) and not fns(h, '-') - fns(h, '+'):
            print(f'  DROPPED DOCS (check) {os.path.basename(wt.rstrip("/"))}: {f}: ' + '; '.join(l[1:].strip()[:40] for l in gone[:3]))
    if not fs: print(wt, 'no transcript'); continue
    c = collections.Counter(); first3_ok = None
    for l in open(fs[-1]):
        try: m = json.loads(l).get('message') or {}
        except ValueError: continue
        for b in m.get('content') if isinstance(m.get('content'), list) else ():
            if b.get('type') != 'tool_use': continue
            n = b['name']; cmd = b['input'].get('command', '') if n == 'Bash' else ''
            if n.startswith('mcp__'): c[n.split('__')[1]] += 1
            elif n == 'Skill': c['skill:' + str(b['input'].get('skill') or b['input'].get('command'))] += 1
            elif n in ('Agent', 'Task'): c['sub-agent'] += 1
            for t in ('graphify query', 'graphify explain', 'graphify path', 'graphify update', 'rtk bypass'):
                if t in cmd: c[t] += 1
            if 'new-observation.sh' in cmd or (n == 'Skill' and 'task-observer' in str(b['input'].get('skill'))):
                c['task-observer (worker must not)'] += 1
            if n == 'Bash' and re.match(r'\s*(cd [^;&]+&&\s*)?(grep|rg|sed -n|cat) ', cmd): c['bash read/grep'] += 1
            if n in ('Edit', 'Write') or (n.startswith('mcp__serena__') and re.search(r'replace|insert', json.dumps(b['input']))):
                c['edit/write'] += 1
                if first3_ok is None:
                    first3_ok = bool(c['claude-mem'] and c['graphify update'] and (c['graphify explain'] + c['graphify path'] + c['graphify query']) and c['serena'])
    print(os.path.basename(wt.rstrip('/')), dict(sorted(c.items())))
    # Verdict (every tool used; non-use is a defect unless the report says "not needed, because ...").
    ask = c['graphify explain'] + c['graphify path'] + c['graphify query']
    need = {'claude-mem search': c['claude-mem'], 'graphify update': c['graphify update'], 'graphify explain/path/query': ask,
            'serena': c['serena'], 'ponytail skill': sum(v for k, v in c.items() if k.startswith('skill:') and 'ponytail' in k),
            'verification skill': sum(v for k, v in c.items() if k.startswith('skill:') and 'verification' in k),
            'reviewer sub-agent': c['sub-agent']}
    missing = [k for k, v in need.items() if not v]
    optional = [k for k in ('headroom', 'context7', 'skillsmp') if not c[k]]
    print('  MISSING (defect):', ', '.join(missing) or 'none', '| unused, needs a "not needed, because" line:', ', '.join(optional) or 'none')
    print('  FIRST3 before first edit:', 'ok' if first3_ok or first3_ok is None and all(list(need.values())[:4]) else 'NO (claude-mem, graphify update+ask and serena must come before any Edit/Write)')
    # task-observer: workers report OBSERVATIONS: lines, only the controller logs them.
    last_text, all_text = '', ''
    for l in open(fs[-1]):
        try: m = json.loads(l).get('message') or {}
        except ValueError: continue
        if m.get('role') == 'assistant' and isinstance(m.get('content'), list):
            t = ''.join(b.get('text', '') for b in m['content'] if b.get('type') == 'text')
            if t: last_text = t; all_text += t
    # A finish spread over several turns, or a line kept only in the report, still counts.
    w = os.path.abspath(wt.rstrip('/'))
    report = os.path.join(os.path.dirname(w), 'reports', os.path.basename(w) + '.md')
    if 'OBSERVATIONS:' not in all_text + (open(report).read() if os.path.exists(report) else ''):
        print('  MISSING (defect): OBSERVATIONS: line in final reply')
    # late owner changes: each inbox item must be answered in the final reply
    inbox = os.path.join(os.path.dirname(w), 'reports', 'inbox-' + os.path.basename(w) + '.md')
    lines = open(inbox).read().splitlines() if os.path.exists(inbox) else []
    heads = [l[3:].strip() for l in lines if l.startswith('## ')] or [l.strip() for l in lines if l.strip() and not l.startswith('#')]
    low = last_text.lower()
    miss = [h for h in heads if 'INBOX:' not in last_text or h.lower()[:40] not in low]
    if miss: print(f'  INBOX NOT ACKED: {len(miss)} of {len(heads)} inbox item(s) not named in the final reply: ' + '; '.join(m[:50] for m in miss))
    if c['task-observer (worker must not)']: print('  DEFECT: worker used task-observer (controller logs, workers report)')
    # The branch is the deliverable: a run that ends with its edits uncommitted has handed back nothing.
    dirty = [l for l in subprocess.run(['git', '-C', wt, 'status', '--porcelain'], capture_output=True, text=True).stdout.splitlines() if 'graphify-out/' not in l]
    if dirty: print(f'  UNCOMMITTED (defect): {len(dirty)} file(s) changed and not committed in the worktree')
    # The type check CI runs, over every config: workers checked one `tsc -p` and missed the tests' type errors.
    if os.path.exists(os.path.join(wt, 'package.json')):
        try:
            t = subprocess.run(['npm', 'run', '-s', 'types'], cwd=wt, capture_output=True, text=True, timeout=1800)
            if t.returncode: print('  TYPES FAIL (defect): npm run -s types: ' + (t.stdout + t.stderr).strip()[-400:])
        except subprocess.TimeoutExpired:
            print('  TYPES FAIL (defect): npm run -s types took over 30 min')
