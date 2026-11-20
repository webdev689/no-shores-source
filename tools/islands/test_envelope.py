"""The contract, the envelopes, the pack and the shapes, without Blender; with ISLAND_MODULES set to a build's --out
folder, every pack that build wrote too.

    python3 -I tools/islands/test_envelope.py
    ISLAND_MODULES=DIR python3 -I tools/islands/test_envelope.py

Under -I unittest cannot import a file by its path, and discovery would import the kit, which needs Blender.
"""
import json
import os
import struct
import sys
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import catalog  # noqa: E402
import details  # noqa: E402
import envelope  # noqa: E402
import export  # noqa: E402
import shapes  # noqa: E402


def triangles(faces):
    """Faces (shapes.py's) cut into triangles as fans: three corner positions each."""
    return [(face[0][0], face[k][0], face[k + 1][0]) for face in faces for k in range(1, len(face) - 1)]


def filling(module, skirt=0.0):
    """A box filling a module's size, sunk `skirt` metres below its base."""
    x, y, z = catalog.MODULES[module]['size']
    return triangles(shapes.box(-x / 2, -y / 2, -skirt, x / 2, y / 2, z))


class Contract(unittest.TestCase):
    def test_kits_json_makes_sense(self):
        self.assertEqual(envelope.contract_problems(), [])

    def test_a_solid_reaching_past_its_size_is_refused(self):
        wide = {'role': 'ruin', 'size': [6.0, 1.2, 3.5], 'solids': [[-2.5, 0, 0.6]]}
        with mock.patch.dict(catalog.MODULES, {'common.test.wall': wide}):
            self.assertTrue(any('common.test.wall: solid' in problem for problem in envelope.contract_problems()))

    def test_every_kit_holds_its_modules_in_the_files_order(self):
        names = [name for kit in catalog.KITS for name in catalog.required(kit)]
        self.assertEqual(names, list(catalog.MODULES))
        self.assertEqual(catalog.required('temperate')[0], 'temperate.shore.rock.a')
        self.assertEqual(catalog.piece_of('common.wreck.bow'), 'wreck.bow')
        with self.assertRaises(KeyError):
            catalog.required('lunar')

    def test_a_kit_missing_a_biome_piece_is_refused(self):
        with mock.patch.dict(catalog.MODULES):
            del catalog.MODULES['frozen.grass']
            self.assertTrue(any(problem.startswith('frozen:') for problem in envelope.contract_problems()))


class Envelope(unittest.TestCase):
    def test_a_module_filling_its_size_with_a_skirt_passes(self):
        self.assertEqual(envelope.problems('temperate.boulder.b', filling('temperate.boulder.b', skirt=0.8)), [])

    def test_a_module_past_its_size_or_too_deep_fails(self):
        x, y, z = catalog.MODULES['common.ruin.wall']['size']
        wide = triangles(shapes.box(-x / 2 - 0.1, -y / 2, 0, x / 2, y / 2, z))
        self.assertTrue(any('spans x' in problem for problem in envelope.problems('common.ruin.wall', wide)))
        deep = filling('common.ruin.wall', skirt=1.0)
        self.assertTrue(any('spans z' in problem for problem in envelope.problems('common.ruin.wall', deep)))

    def test_a_module_short_of_its_footprint_fails(self):
        x, y, z = catalog.MODULES['temperate.tree.a']['size']
        thin = triangles(shapes.box(-0.3, -0.3, 0, 0.3, 0.3, z))
        found = envelope.problems('temperate.tree.a', thin)
        self.assertTrue(any('along x' in problem for problem in found))
        self.assertTrue(any('along y' in problem for problem in found))
        low = triangles(shapes.box(-x / 2, -y / 2, 0, x / 2, y / 2, z * 0.7))
        self.assertTrue(any('along z' in problem for problem in envelope.problems('temperate.tree.a', low)))

    def test_a_skirt_does_not_count_toward_the_height(self):
        x, y, z = catalog.MODULES['temperate.boulder.a']['size']
        sunk = triangles(shapes.box(-x / 2, -y / 2, -0.8, x / 2, y / 2, z * 0.7))
        self.assertTrue(any('along z' in problem for problem in envelope.problems('temperate.boulder.a', sunk)))

    def test_over_its_roles_budget_fails(self):
        many = filling('temperate.grass') * 30
        self.assertTrue(any('over the 300' in problem for problem in envelope.problems('temperate.grass', many)))

    def test_a_solid_with_no_mesh_under_it_fails(self):
        arch = {'role': 'ruin', 'size': [5.0, 1.4, 5.5], 'solids': [[-2.0, 0, 0.45], [2.0, 0, 0.45]]}
        with mock.patch.dict(catalog.MODULES, {'common.test.arch': arch}):
            # Only the right pier, and a marker out at the far left: the left solid at x -2 stands on nothing.
            right = triangles(shapes.box(1.4, -0.7, 0, 2.5, 0.7, 5.5) + shapes.box(-2.5, 0.6, 5.4, -2.45, 0.7, 5.5))
            self.assertTrue(any('solid at (-2.0' in problem for problem in envelope.problems('common.test.arch',
                                                                                           right)))
            whole = right + triangles(shapes.box(-2.5, -0.7, 0, -1.4, 0.7, 5.5))
            self.assertEqual(envelope.problems('common.test.arch', whole), [])

    def test_a_name_outside_the_contract_fails(self):
        self.assertTrue(envelope.problems('temperate.tree.z', filling('temperate.tree.a')))


def read_pack(data):
    """A reader of the pack written from its format alone, apart from export.py: header, vertices and indices."""
    length = struct.unpack_from('<I', data, 0)[0]
    header = json.loads(data[4:4 + length].decode())
    start = 4 + length
    vertex_count = sum(module['vertexCount'] for module in header['modules'])
    index_count = sum(module['indexCount'] for module in header['modules'])
    vertices = [struct.unpack_from('<3f4b2f4B', data, start + 28 * index) for index in range(vertex_count)]
    indices = struct.unpack_from(f'<{index_count}I', data, start + 28 * vertex_count)
    assert len(data) == start + 28 * vertex_count + 4 * index_count, 'bytes left over'
    modules = {}
    for module in header['modules']:
        own = vertices[module['vertexStart']:module['vertexStart'] + module['vertexCount']]
        order = indices[module['indexStart']:module['indexStart'] + module['indexCount']]
        assert all(index < module['vertexCount'] for index in order), 'an index past its module'
        modules[module['name']] = [[own[index] for index in order[at:at + 3]] for at in range(0, len(order), 3)]
    return header, modules


class Pack(unittest.TestCase):
    def corners(self, faces, part):
        return [[(point, shapes.normal_of(list(corners)), (point[0], point[2]), part) for point in corners]
                for corners in triangles(faces)]

    def test_a_pack_round_trips(self):
        crate = self.corners(shapes.box(-0.5, -0.5, 0, 0.5, 0.5, 1), catalog.PARTS.index('plank'))
        column = self.corners(shapes.cylinder((0, 0, 0), (0, 0, 6), 0.7), catalog.PARTS.index('stone'))
        data = export.pack('common', [('common.wreck.crate', crate), ('common.ruin.column', column)])
        self.assertEqual((4 + struct.unpack_from('<I', data)[0]) % 4, 0)
        header, modules = read_pack(data)
        self.assertEqual((header['format'], header['style'], header['parts']), (1, 'common', list(catalog.PARTS)))
        self.assertEqual([module['name'] for module in header['modules']], ['common.wreck.crate', 'common.ruin.column'])
        self.assertEqual(header['modules'][0]['bounds'], [-0.5, -0.5, 0, 0.5, 0.5, 1])
        for name, wrote in (('common.wreck.crate', crate), ('common.ruin.column', column)):
            read = modules[name]
            self.assertEqual(len(read), len(wrote))
            for got, want in zip(read, wrote):
                for vertex, (position, normal, uv, part) in zip(got, want):
                    for value, expected in zip(vertex[0:3] + vertex[7:9], position + uv):
                        self.assertAlmostEqual(value, expected, places=5)
                    for value, expected in zip(vertex[3:6], normal):
                        self.assertAlmostEqual(value / 127, expected, delta=0.01)
                    self.assertEqual(vertex[9:], (part, 0, 0, 0))
        self.assertEqual(export.read_header(data)['style'], 'common')

    def test_a_pack_refuses_a_part_past_the_parts_and_an_empty_module(self):
        with self.assertRaises(ValueError):
            export.pack('common', [('common.wreck.crate', self.corners(shapes.box(0, 0, 0, 1, 1, 1),
                                                                       len(catalog.PARTS)))])
        with self.assertRaises(ValueError):
            export.pack('common', [('common.wreck.crate', [])])

    @unittest.skipUnless(os.environ.get('ISLAND_MODULES'), "set ISLAND_MODULES to a build's --out folder")
    def test_a_builds_packs_hold_every_module_in_order_within_its_envelope(self):
        for kit in catalog.KITS:
            with open(os.path.join(os.environ['ISLAND_MODULES'], f'{kit}.modules'), 'rb') as file:
                header, modules = read_pack(file.read())
            self.assertEqual((header['style'], header['parts'], list(modules)),
                             (kit, list(catalog.PARTS), catalog.required(kit)))
            for name, read in modules.items():
                self.assertTrue(all(corner[9] < len(catalog.PARTS) for corners in read for corner in corners), name)
                self.assertEqual(envelope.problems(name, [[vertex[0:3] for vertex in corners] for corners in read]),
                                 [])


class Shapes(unittest.TestCase):
    def test_a_rock_fills_its_size_and_the_same_call_makes_the_same_rock(self):
        rock = details.rock(1, 2, 0.5, (0.6, 0.4, 0.3), seed='x')
        points = [point for face in rock for point, _ in face]
        for axis, (low, high) in enumerate(((0.7, 1.3), (1.8, 2.2), (0.5, 0.8))):
            self.assertAlmostEqual(min(point[axis] for point in points), low, places=6)
            self.assertAlmostEqual(max(point[axis] for point in points), high, places=6)
        self.assertEqual(rock, details.rock(1, 2, 0.5, (0.6, 0.4, 0.3), seed='x'))
        self.assertNotEqual(rock, details.rock(1, 2, 0.5, (0.6, 0.4, 0.3), seed='y'))


if __name__ == '__main__':
    unittest.main()
