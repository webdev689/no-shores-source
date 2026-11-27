#!/usr/bin/env python3
"""PreToolUse and PostToolUse hook for Serena's replace_symbol_body and insert_before_symbol. A symbol's range takes
in its doc comment and attributes, so a new body without them silently deletes them. Before the edit the file is kept
aside; after it, an edit that lowers the file's count of `///`, `/**` or `#[` lines is undone (the file put back as it
was) and the agent told to send the body again with them."""
import hashlib, json, os, re, sys, tempfile

MARK = re.compile(r'^\s*(///|/\*\*|#\[)', re.M)
try:
    ev = json.load(sys.stdin)
    # shortcut: Serena's paths are relative to its project, taken here as the session's folder (true for workers); a
    # session in another folder than Serena's pin goes unguarded. Read the pin from ~/.claude.json if that bites.
    path = os.path.join(ev.get('cwd') or os.getcwd(), ev['tool_input']['relative_path'])
except (ValueError, KeyError, TypeError):
    sys.exit(0)
keep = os.path.join(tempfile.gettempdir(), 'serena-guard',
                    hashlib.sha1((ev.get('tool_use_id') or '').encode() + path.encode()).hexdigest())
if not os.path.isfile(path):
    sys.exit(0)
if ev.get('hook_event_name') == 'PreToolUse':
    os.makedirs(os.path.dirname(keep), exist_ok=True)
    with open(path, 'rb') as a, open(keep, 'wb') as b:
        b.write(a.read())
    sys.exit(0)
if not os.path.exists(keep):
    sys.exit(0)
before = open(keep, 'rb').read()
os.remove(keep)
now = open(path, 'rb').read()
lost = len(MARK.findall(before.decode('utf-8', 'replace'))) - len(MARK.findall(now.decode('utf-8', 'replace')))
if lost > 0:
    with open(path, 'wb') as f:
        f.write(before)
    print(json.dumps({'decision': 'block', 'reason': (
        f'kit Serena guard: this edit removed {lost} doc comment or attribute line(s) (`///`, `/**`, `#[`) from '
        f'{ev["tool_input"]["relative_path"]}, so it was undone and the file is as it was. The symbol\'s range '
        'includes its doc comment and attributes: send the body again with them, or remove them with replace_content '
        'if that is meant.')}))
