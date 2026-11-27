"""Rewraps the lines `cargo xtask repo` finds past 120 characters, changing no word: only where lines break.

    cargo xtask repo | python3 -I tools/rewrap/rewrap.py

Each refused line is split at 120, and what it pushes on flows into the lines after it in the same paragraph, bullet
or comment block, until a line has room for it; the lines before it, and those after the push stops, stay as they
are. A code span or wiki link never breaks, nor a number from what follows it, and no new line starts with a mark
that Markdown would read as a list, heading or quote. It prints what it changed and any line it left for a hand.
"""
import re
import sys

WIDTH = 120
REFUSED = re.compile(r'^\s*(.+?):(\d+)  \[(?:comments|vault)\] a \d+-character line')
CODE_LEAD = re.compile(r'^(\s*)(//!|///|//|#|/\*\*|/\*|\*(?!/)|"""|\'\'\')?([ \t]*)((?:[-*+]|\d+[.)])[ \t]+)?')
NOTE_LEAD = re.compile(r'^(\s*)((?:>[ \t]?)*)([ \t]*)((?:[-*+]|\d+[.)])[ \t]+)?')
# A word Markdown (and so rustdoc) would read as a block's start if a line began with it.
BLOCK_START = re.compile(r'^([-+*>|=#]+|\d+[.)])$|^(```|~~~|\||\*/|"""|\'\'\')')
NUMBER = re.compile(r'^[~±≈<>−+-]?\d[\d.,:]*$')
STOP_BODY = re.compile(r'^(#|\||```|~~~|<|@|\*/)')
CLOSERS = ('"""', "'''", '*/')


def lead_of(line, note):
    """A line's lead (indent, comment mark, quote, bullet) and the lead its wrapped lines continue under."""
    match = (NOTE_LEAD if note else CODE_LEAD).match(line)
    indent, mark, space, bullet = match.groups(default='')
    if note:
        return match.group(0), indent + mark + space + ' ' * len(bullet)
    tail = space + ' ' * len(bullet)
    if mark in ('/**', '/*'):
        return match.group(0), indent + ' *' + ' ' * (len(mark) - 1 + len(tail) - 1)
    if mark in ('"""', "'''"):
        return match.group(0), indent
    return match.group(0), indent + mark + tail


def words_of(text):
    """The text's words, a code span or wiki link (closed on the same text) kept whole however many spaces it holds."""
    words, index = [], 0
    while index < len(text):
        if text[index].isspace():
            index += 1
            continue
        start = index
        while index < len(text) and not text[index].isspace():
            run = re.match(r'`+', text[index:])
            closer = run.group(0) if run else (']]' if text.startswith('[[', index) else None)
            opener = len(closer) if closer else 1
            end = text.find(closer, index + opener) if closer else -1
            index = end + len(closer) if end >= 0 else index + opener
        words.append(text[start:index])
    return words


def atoms_of(words):
    """Words grouped where no break may fall: after a number, and before a word that would start a block."""
    atoms = []
    for word in words:
        if atoms and (NUMBER.match(atoms[-1][-1]) or BLOCK_START.match(word)):
            atoms[-1].append(word)
        else:
            atoms.append([word])
    return [' '.join(atom) for atom in atoms]


def filled(words, first, rest):
    """The words laid in lines of at most WIDTH, the first under `first`, the others under `rest`."""
    lines, line = [], None
    for atom in atoms_of(words):
        if line is not None and len(line) + 1 + len(atom) > WIDTH:
            lines.append(line)
            line = None
        line = (rest if lines else first) + atom if line is None else line + ' ' + atom
    lines.append(line)
    return lines


def continues(line, lead, note):
    """Whether `line` goes on the paragraph or comment block whose continuation lead is `lead`."""
    own, _ = lead_of(line, note)
    body = line[len(own):].strip()
    return own == lead and body != '' and not STOP_BODY.match(body)


def ends_block(line):
    return line.endswith('  ') or line.endswith('\\') or line.rstrip().endswith(CLOSERS)


def rewrap(lines, at, note):
    """Rewraps lines[at] and pushes what it sheds on through the block's later lines; returns the lines changed."""
    first, rest = lead_of(lines[at], note)
    index, carry, out = at, [], []
    while True:
        line = lines[index]
        own = first if index == at else lead_of(line, note)[0]
        words = carry + words_of(line[len(own):])
        hard_break = line[len(line.rstrip()):] if line.endswith('  ') else ''
        laid = filled(words, own, rest)
        last = (index + 1 >= len(lines) or ends_block(line) or not continues(lines[index + 1], rest, note))
        if len(laid) == 1 or last:
            laid[-1] += hard_break
            out.extend(laid)
            break
        out.extend(laid[:-1])
        carry = words_of(laid[-1][len(rest):])
        index += 1
    lines[at:index + 1] = out
    return index + 1 - at


def inside_docstring(lines, at):
    return sum(line.count('"""') + line.count("'''") for line in lines[:at]) % 2 == 1


def rewrap_file(path, numbers):
    """Rewraps each refused line of one file, from the last up so earlier numbers hold; gives lines rewrapped, left."""
    with open(path, encoding='utf-8', newline='') as file:
        text = file.read()
    if '\r' in text:
        return 0, sorted(numbers)
    lines = text.split('\n')
    note = path.endswith('.md')
    done, left = 0, []
    for number in sorted(set(numbers), reverse=True):
        at = number - 1
        mark = CODE_LEAD.match(lines[at]).group(2)
        if not note and mark is None and not (path.endswith('.py') and inside_docstring(lines, at)):
            left.append(number)
            continue
        rewrap(lines, at, note)
        done += 1
    with open(path, 'w', encoding='utf-8', newline='') as file:
        file.write('\n'.join(lines))
    return done, left


def comparable_words(text, note):
    """The file's words with comment and quote marks dropped: the rewrap must leave this sequence exactly as it was."""
    if note:
        return [word for line in text.split('\n') for word in re.sub(r'^\s*(?:>[ \t]?)*', '', line).split()]
    return [word for line in text.split('\n') for word in line[len(CODE_LEAD.match(line).group(0)) :].split()]


def main():
    refused = {}
    for line in sys.stdin:
        match = REFUSED.match(line)
        if match:
            refused.setdefault(match.group(1), []).append(int(match.group(2)))
    for path, numbers in sorted(refused.items()):
        done, left = rewrap_file(path, numbers)
        print(f'{path}: {done} rewrapped' + (f', left for a hand: {sorted(left)}' if left else ''))


if __name__ == '__main__':
    main()
