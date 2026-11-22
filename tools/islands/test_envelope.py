"""The contract, the envelopes, the pack and the shapes, without Blender; with ISLAND_MODULES set to a build's --out
folder, every pack that build wrote too.

    python3 -I tools/islands/test_envelope.py
    ISLAND_MODULES=DIR python3 -I tools/islands/test_envelope.py

Under -I unittest cannot import a file by its path, and discovery would import the kit, which needs Blender.
"""
import hashlib
import http.client
import json
import os
import struct
import sys
import tempfile
import unittest
import urllib.error
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
# R2's door is one up, as publish.py finds it.
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import catalog  # noqa: E402
import details  # noqa: E402
import envelope  # noqa: E402
import export  # noqa: E402
import publish  # noqa: E402
import r2  # noqa: E402
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

    def test_a_canopy_over_a_solid_does_not_stand_in_it(self):
        tree = {'role': 'tree', 'size': [4.0, 4.0, 8.0], 'solids': [[0, 0, 0.3]]}
        with mock.patch.dict(catalog.MODULES, {'common.test.tree': tree}):
            canopy = triangles(shapes.box(-2, -2, 6, 2, 2, 8) + shapes.box(1.7, 1.7, 0, 2, 2, 6))
            self.assertTrue(any('solid at (0' in problem for problem in envelope.problems('common.test.tree', canopy)))
            trunk = canopy + triangles(shapes.box(-0.2, -0.2, 0, 0.2, 0.2, 6))
            self.assertEqual(envelope.problems('common.test.tree', trunk), [])

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


class Publishing(unittest.TestCase):
    def build(self, folder, stamped=True):
        """A build's folder: a one-triangle pack of every kit, its model, and the stamp naming them."""
        triangle = [[((0, 0, 0), (0, 0, 1), (0, 0), 0), ((1, 0, 0), (0, 0, 1), (1, 0), 0),
                     ((0, 1, 0), (0, 0, 1), (0, 1), 0)]]
        hashes = {}
        for kit in catalog.KITS:
            data = export.pack(kit, [(name, triangle) for name in catalog.required(kit)])
            with open(os.path.join(folder, f'{kit}.modules'), 'wb') as file:
                file.write(data)
            hashes[kit] = hashlib.sha256(data).hexdigest()
        with open(os.path.join(folder, 'modules.blend'), 'wb') as file:
            file.write(b'blend')
        if stamped:
            with open(os.path.join(folder, export.STAMP), 'w') as file:
                json.dump({'kits': hashes, 'blend': hashlib.sha256(b'blend').hexdigest()}, file)

    def test_only_one_builds_every_kit_is_published(self):
        with tempfile.TemporaryDirectory() as folder:
            self.build(folder)
            packs, model = publish.read_build(folder)
            self.assertEqual((list(packs), model), (list(catalog.KITS), b'blend'))
            # A one-kit run rewrites its own pack beside the others an older run left.
            with open(os.path.join(folder, 'arid.modules'), 'ab') as file:
                file.write(b' ')
            with self.assertRaises(SystemExit):
                publish.read_build(folder)
        with tempfile.TemporaryDirectory() as folder:
            self.build(folder, stamped=False)
            with self.assertRaises(SystemExit):
                publish.read_build(folder)

    def test_a_file_too_short_for_a_pack_is_refused(self):
        with self.assertRaises(ValueError):
            export.read_header(b'\x01')

    def test_the_committed_manifest_names_the_contracts_kits_and_parts(self):
        with open(os.path.join(catalog.CONTENT, 'modules.json')) as file:
            manifest = json.load(file)
        self.assertEqual((manifest['parts'], sorted(manifest['kits'])), (list(catalog.PARTS), sorted(catalog.KITS)))

    def test_a_dropped_answer_and_a_busy_answer_are_tried_again(self):
        with mock.patch('urllib.request.urlopen', side_effect=http.client.RemoteDisconnected('closed')):
            self.assertEqual(r2.fetch('PUT', r2.API + 'x', b'')[0], 0)
        answers = iter([(404, b''), (429, b'slow down'), (0, b'dropped'), (200, b'')])
        with mock.patch.object(r2, 'fetch', side_effect=lambda *_, **__: next(answers)), \
                mock.patch.object(r2.time, 'sleep') as slept:
            self.assertTrue(r2.put(b'data', 'islands', 'modules', 'application/octet-stream').startswith('islands/'))
        self.assertEqual([call.args[0] for call in slept.call_args_list], [5, 20])

    def test_a_staged_put_writes_the_stage_and_reads_back_from_it_with_no_upload(self):
        offline = mock.patch('urllib.request.urlopen', side_effect=urllib.error.URLError('offline'))
        with tempfile.TemporaryDirectory() as stage, mock.patch.dict(os.environ, {'R2_STAGE': stage}), offline as sent:
            key = r2.put(b'data', 'flora', 'png', 'image/png')
            self.assertEqual(key, f'flora/{hashlib.sha256(b"data").hexdigest()}.png')
            with open(os.path.join(stage, key), 'rb') as file:
                self.assertEqual(file.read(), b'data')
            self.assertEqual(r2.fetch('HEAD', r2.PUBLIC + key), (200, b''))
            self.assertEqual(r2.published({'base': r2.PUBLIC}, key), b'data')
        # The one request is the check that R2 does not already serve it.
        self.assertEqual([call.args[0].get_method() for call in sent.call_args_list], ['HEAD'])

    def test_an_upload_sends_a_stage_only_when_each_file_is_named_by_its_hash_in_a_publishers_folder(self):
        digest = hashlib.sha256(b'sound').hexdigest()
        other = hashlib.sha256(b'other').hexdigest()
        good = f'sounds/{digest}.mp3'

        def staged(stage, *keys):
            for key in keys:
                os.makedirs(os.path.dirname(os.path.join(stage, key)), exist_ok=True)
                with open(os.path.join(stage, key), 'wb') as file:
                    file.write(b'sound')

        for bad in (f'sounds/{other}.mp3', f'islands/{digest}.modules', f'sounds/{digest}.png', f'{digest}.mp3',
                    f'sounds/deeper/{digest}.mp3'):
            with tempfile.TemporaryDirectory() as stage, mock.patch.object(r2, 'put') as put:
                staged(stage, good, bad)
                with self.assertRaises(SystemExit):
                    r2.upload(stage)
                put.assert_not_called()
        with tempfile.TemporaryDirectory() as stage, mock.patch.object(r2, 'put') as put, \
                mock.patch.object(r2, 'fetch', return_value=(200, b'')) as fetched:
            staged(stage, good)
            r2.upload(stage)
        put.assert_called_once_with(b'sound', 'sounds', 'mp3', 'audio/mpeg')
        fetched.assert_called_once_with('HEAD', r2.PUBLIC + good)


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
