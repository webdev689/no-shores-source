"""Checks the rewrap moves only line breaks: every word stays, in order, and no line passes 120 where it can wrap.

    python3 -I tools/rewrap/test_rewrap.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rewrap import WIDTH, comparable_words, rewrap  # noqa: E402

WORDS = 'the quick brown fox jumps over the lazy dog and sails on past the harbour wall at dusk '


def wrapped(text, at, note):
    """The text with line `at` (0-based) rewrapped, checked to hold the same words as before."""
    lines = text.split('\n')
    rewrap(lines, at, note)
    after = '\n'.join(lines)
    assert comparable_words(after, note) == comparable_words(text, note), after
    return after


class Notes(unittest.TestCase):
    def test_a_long_paragraph_line_splits_and_keeps_its_words(self):
        line = (WORDS * 3).strip()
        after = wrapped(line, 0, True)
        self.assertTrue(all(len(each) <= WIDTH for each in after.split('\n')))
        self.assertGreater(after.count('\n'), 0)

    def test_the_push_stops_at_a_line_with_room_and_leaves_the_rest(self):
        long = (WORDS * 2).strip()
        text = '\n'.join(['before it', long, 'short', 'kept as it is', '', 'next paragraph'])
        after = wrapped(text, 1, True).split('\n')
        self.assertEqual(after[0], 'before it')
        self.assertEqual(after[after.index('kept as it is') + 1 :], ['', 'next paragraph'])

    def test_a_bullet_continues_under_its_text_and_the_next_bullet_is_left(self):
        text = '- ' + (WORDS * 2).strip() + '\n- the next bullet'
        after = wrapped(text, 0, True).split('\n')
        self.assertTrue(after[1].startswith('  ') and not after[1].startswith('   '))
        self.assertEqual(after[-1], '- the next bullet')

    def test_a_code_span_and_a_wiki_link_never_break(self):
        span = '`' + 'a b ' * 10 + '`'
        link = '[[Where You Go and the Seas You Choose]]'
        text = 'word ' * 20 + span + ' ' + link + ' ' + 'word ' * 10
        for line in wrapped(text, 0, True).split('\n'):
            self.assertEqual(line.count('`') % 2, 0)
            self.assertEqual(line.count('[['), line.count(']]'))

    def test_a_number_stays_with_its_unit(self):
        text = 'x' * 116 + ' 30 s on'
        self.assertIn('30 s', wrapped(text, 0, True).split('\n')[1])

    def test_no_new_line_starts_a_list_or_heading(self):
        text = 'y' * 117 + ' - z and # w'
        for line in wrapped(text, 0, True).split('\n')[1:]:
            self.assertFalse(line.startswith(('- ', '# ')), line)


class Comments(unittest.TestCase):
    def test_a_line_comment_keeps_its_mark_and_indent(self):
        text = '    /// ' + (WORDS * 2).strip() + '\n    fn sail() {}'
        after = wrapped(text, 0, False).split('\n')
        self.assertTrue(all(line.startswith('    /// ') for line in after[:-1]))
        self.assertEqual(after[-1], '    fn sail() {}')

    def test_a_one_line_doc_block_continues_under_a_star(self):
        text = '  /** ' + (WORDS * 2).strip() + ' */\n  run(): void;'
        after = wrapped(text, 0, False).split('\n')
        self.assertTrue(after[1].startswith('   *  '))
        self.assertTrue(after[-2].endswith(' */'))
        self.assertEqual(after[-1], '  run(): void;')

    def test_a_docstring_stops_at_its_closing_quotes(self):
        text = '    """' + (WORDS * 2).strip() + '"""\n    wind = 3'
        after = wrapped(text, 0, False).split('\n')
        self.assertEqual(after[-1], '    wind = 3')
        self.assertTrue(after[-2].endswith('"""'))

    def test_a_python_comment_flows_into_the_next_and_stops_before_code(self):
        text = '# ' + (WORDS * 2).strip() + '\n# short\nwind = 3'
        after = wrapped(text, 0, False).split('\n')
        self.assertTrue(after[-2].endswith('short'))
        self.assertEqual(after[-1], 'wind = 3')


if __name__ == '__main__':
    unittest.main()
