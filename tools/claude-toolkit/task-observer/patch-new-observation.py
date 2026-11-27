"""Local changes to the pinned task-observer's scripts/new-observation.sh, made by install.sh at each install.
usage: python3 patch-new-observation.py <path to new-observation.sh>   (exit 1, file untouched, if a needle is gone)

- The floor counts only all-digit claim markers: a stray `0125-` marker in .id-claims broke its arithmetic.
- The script writes the new file's `---` and `id:` lines itself, so the rest is appended with a quoted heredoc and the
  id is never typed into an unquoted one.
"""
import sys

CHANGES = (
    ('"${p##*/}"; done | sort -n | tail -1)\ntop_claim=$((10#',
     '"${p##*/}"; done | grep -xE \'[0-9]+\' | sort -n | tail -1)\ntop_claim=$((10#'),
    ('if ! (set -C; : > "$f") 2>/dev/null; then',
     'if ! (set -C; printf -- \'---\\nid: %s\\n\' "$next_id" > "$f") 2>/dev/null; then'),
    ('Write the observation body into the printed path, with the id\n# from its NNNN- prefix in the `id:` field'
     ' — copied, never retyped.',
     'The file holds its `---` and `id:` lines; append the rest of the front\n# matter and the body with a QUOTED'
     ' heredoc: cat >> "$f" <<\'EOF\'.'),
)

path = sys.argv[1]
text = open(path, newline='').read()
for old, new in CHANGES:
    if new in text:
        continue
    if text.count(old) != 1:
        sys.exit(f'patch-new-observation: needle gone from {path}: {old[:60]!r}')
    text = text.replace(old, new)
open(path, 'w', newline='').write(text)
