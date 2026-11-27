"""The ship export's mesh bytes: a window's pane is written as iron marked glass, and nothing else changes.

    python3 -I tools/ships/test_export.py

Blender's module is stood in for where it is not installed: the mesh bytes need none of it.
"""
import json
import os
import struct
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    import bpy  # noqa: F401
except ImportError:
    sys.modules['bpy'] = types.ModuleType('bpy')

import export_ship  # noqa: E402

SIZE = {'level_m': 1.2, 'length_m': 6.0, 'beam_m': 2.0, 'draught_m': 0.5}
IRON = export_ship.PARTS.index('iron')


def vertices(mesh):
    """Each vertex of a mesh file as struct unpacks it: position, normal, uv and its four part bytes."""
    length = struct.unpack_from('<I', mesh, 0)[0]
    count = json.loads(mesh[4:4 + length])['vertices']
    return [struct.unpack_from('<3f4b2f4B', mesh, 4 + length + index * 28) for index in range(count)]


def triangle(x, part, shell):
    return [((x + dx, dy, 1.0), (1.0, 0.0, 0.0), (dx, dy), part, shell) for dx, dy in ((0, 0), (1, 0), (0, 1))]


class MeshBytes(unittest.TestCase):
    def test_a_pane_is_iron_marked_glass_and_the_rest_keep_their_bytes(self):
        _, mesh = export_ship.mesh_bytes('test', [triangle(0, IRON, 0), triangle(5, IRON, export_ship.GLASS_SHELL)],
                                         SIZE)
        written = vertices(mesh)
        self.assertEqual(len(written), 6)
        for vertex in written[:3]:
            self.assertEqual(vertex[9:], (IRON, 0, 0, 0))
        for vertex in written[3:]:
            self.assertEqual(vertex[9:], (IRON, 2, 0, 0))

    def test_glass_and_iron_at_one_corner_stay_two_vertices(self):
        _, mesh = export_ship.mesh_bytes('test', [triangle(0, IRON, 0), triangle(0, IRON, export_ship.GLASS_SHELL)],
                                         SIZE)
        self.assertEqual(len(vertices(mesh)), 6)

    def test_the_shell_byte_is_the_games_glass(self):
        with open(os.path.join(HERE, '..', '..', 'client', 'src', 'ships', 'lanternMesh.ts')) as file:
            self.assertIn(f'export const GLASS_SHELL = {export_ship.GLASS_SHELL};', file.read())


if __name__ == '__main__':
    unittest.main()
