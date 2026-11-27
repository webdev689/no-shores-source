"""Checks bake.py's --only without Blender: the manifest written back unchanged byte for byte, and a fresh module
spliced into its own place, the others untouched.

    python3 -I tools/modules/test_bake.py
"""
import json
import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# The bake's builders need Blender; the splice does not.
sys.modules['catalogue'] = types.ModuleType('catalogue')
sys.modules['kit'] = types.ModuleType('kit')
import bake  # noqa: E402


class Splice(unittest.TestCase):
    def test_the_manifest_is_written_back_byte_for_byte(self):
        with open(bake.MANIFEST) as file:
            text = file.read()
        self.assertEqual(bake.manifest_text(bake.spliced(json.loads(text)['modules'], [])), text)

    def test_a_fresh_module_takes_its_own_place_and_a_new_one_goes_last(self):
        published = [dict(name='a', size=[1.0]), dict(name='b', size=[2.0]), dict(name='c', size=[3.0])]
        fresh = [dict(name='b', size=[5.0]), dict(name='d', size=[4.0])]
        self.assertEqual(bake.spliced(published, fresh), [published[0], fresh[0], published[2], fresh[1]])


if __name__ == '__main__':
    unittest.main()
