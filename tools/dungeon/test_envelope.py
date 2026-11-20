"""The envelopes, the pack and the shapes, without Blender.

    python3 -I tools/dungeon/test_envelope.py
    python3 -m unittest tools/dungeon/test_envelope.py    (from the repository)

Under -I unittest cannot import a file by its path, and discovery would import the kit, which needs Blender.
"""
import json
import math
import os
import struct
import sys
import unittest

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


def corner_at(point, size=0.01):
    """A small triangle with a corner at `point`."""
    x, y, z = point
    return (point, (x + size, y, z), (x, y + size, z))


def footprint_floor(landmark):
    """Two triangles laying a landmark's floor at z 0 over its whole footprint."""
    width, depth = (cells * catalog.CELL_M for cells in landmark['cells'])
    return [((0, 0, 0), (width, 0, 0), (width, depth, 0)), ((0, 0, 0), (width, depth, 0), (0, depth, 0))]


def under_dome(faces):
    """Faces bent down as the smallest dome falls away from the origin."""
    return [[((x, y, z - envelope.dome_drop(math.hypot(x, y))), uv) for (x, y, z), uv in face] for face in faces]


def broken(module, faces_or_triangles):
    return envelope.problems(module, faces_or_triangles)


class PlanCases(unittest.TestCase):
    def test_a_door_corner_in_the_way_through_fails(self):
        found = broken('crypt.door.a', [corner_at((0, 0.1, 1.0))])
        self.assertTrue(any('way through' in problem for problem in found), found)

    def test_a_landmark_corner_in_the_walk_zone_over_no_solid_fails(self):
        landmark = catalog.landmark('crypt.collapsed-vault')
        found = broken('crypt.collapsed-vault', footprint_floor(landmark) + [corner_at((0.2, 0.2, 1.0))])
        self.assertTrue(any('walk zone' in problem for problem in found), found)

    def test_a_landmark_corner_over_a_solid_passes(self):
        landmark = catalog.landmark('crypt.collapsed-vault')
        self.assertEqual(broken('crypt.collapsed-vault', footprint_floor(landmark) + [corner_at((3.0, 3.0, 1.0))]), [])

    def test_a_floor_piece_at_z_0_06_fails(self):
        self.assertTrue(broken('crypt.floor.a', [corner_at((0, 0, 0.06))]))


class KitEnvelopes(unittest.TestCase):
    def passes(self, module, faces):
        self.assertEqual(broken(module, triangles(faces)), [])

    def fails(self, module, faces, words):
        found = broken(module, triangles(faces))
        self.assertTrue(any(words in problem for problem in found), found)

    def test_door(self):
        jambs = shapes.box(0.85, -0.12, 0, 1.6, 0.42, 2.3) + shapes.box(-1.6, -0.12, 0, -0.85, 0.42, 2.3)
        self.passes('crypt.door.a', jambs + shapes.box(-1.6, -0.1, 2.3, 1.6, 0.4, 2.8))
        self.fails('crypt.door.b', shapes.box(-1.0, 0.0, 1.0, 1.0, 0.2, 1.2), 'way through')
        self.fails('crypt.door.a', shapes.box(0.9, 0.0, 0, 1.6, 0.45, 2.0), 'y > 0.42')
        self.fails('crypt.door.a', shapes.box(0.9, 0.0, 0, 1.6, 0.3, 3.5), 'z > 3.4')
        self.fails('crypt.door.a', shapes.box(0.9, 0.0, 0, 1.7, 0.3, 2.0), 'x > 1.6')

    def test_a_triangle_crossing_the_way_through_fails_though_its_corners_do_not(self):
        crossing = [((-1.0, 0.1, 1.0), (1.0, 0.1, 1.0), (1.0, 0.1, 1.2))]
        self.assertTrue(broken('crypt.door.a', crossing))

    def test_pillar_base(self):
        self.passes('crypt.pillar.base', shapes.box(-0.55, -0.55, 0, 0.55, 0.55, 0.25)
                    + shapes.box(-0.35, -0.35, 0.25, 0.35, 0.35, 0.6))
        self.fails('crypt.pillar.base', shapes.box(-0.6, -0.5, 0, 0.5, 0.5, 0.2), '±0.55')
        self.fails('crypt.pillar.base', shapes.box(-0.4, -0.3, 0.3, 0.3, 0.3, 0.5), '±0.35')
        self.fails('crypt.pillar.base', shapes.box(-0.3, -0.3, 0, 0.3, 0.3, 0.65), 'z > 0.6')

    def test_pillar_shaft(self):
        self.passes('crypt.pillar.shaft', shapes.cylinder((0, 0, 0), (0, 0, 1), 0.35))
        self.fails('crypt.pillar.shaft', shapes.cylinder((0, 0, 0), (0, 0, 1), 0.4), '±0.35')
        self.fails('crypt.pillar.shaft', shapes.cylinder((0, 0, 0), (0, 0, 1.1), 0.3), 'z > 1')

    def test_pillar_capital(self):
        self.passes('crypt.pillar.capital', shapes.box(-0.7, -0.7, 0, 0.7, 0.7, 0.7))
        self.fails('crypt.pillar.capital', shapes.box(-0.75, -0.7, 0, 0.7, 0.7, 0.5), '±0.7')
        self.fails('crypt.pillar.capital', shapes.box(-0.5, -0.5, 0, 0.5, 0.5, 0.75), 'z > 0.7')

    def test_wall_base_and_shaft(self):
        self.passes('crypt.wall.base', shapes.box(-0.8, 0, 0, 0.8, 0.3, 2.4) + shapes.box(-1.0, 0, 2.4, 1.0, 0.6, 2.6))
        self.fails('crypt.wall.base', shapes.box(-0.5, 0, 0, 0.5, 0.35, 1.0), 'y 0.3')
        self.fails('crypt.wall.base', shapes.box(-0.9, 0, 0, 0.5, 0.2, 1.0), '|x| 0.8')
        self.fails('crypt.wall.base', shapes.box(-0.5, 0, 2.5, 0.5, 0.65, 2.8), 'past y 0.6')
        self.passes('crypt.wall.shaft', shapes.box(-0.8, 0, 0, 0.8, 0.3, 1))
        self.fails('crypt.wall.shaft', shapes.box(-0.5, 0, 0, 0.5, 0.31, 1), 'shaft spans it')

    def test_wall_cap_hangs_from_the_least_ceiling(self):
        self.passes('crypt.wall.cap', shapes.box(-1.2, 0, 0, 1.2, 0.5, 0.4))
        tall = shapes.box(-0.5, 0, 0, 0.5, 0.5, 1.2)
        self.fails('crypt.wall.cap', tall, 'below z 0.4')
        self.passes('sanctum.wall.cap', tall)
        self.fails('crypt.wall.cap', shapes.box(-0.5, 0, 0, 0.5, 0.65, 0.4), 'y 0.6')

    def test_feature(self):
        self.passes('crypt.feature.a', shapes.box(-0.8, -0.2, 0, 0.8, 0.3, 3.0))
        self.fails('crypt.feature.a', shapes.box(-0.85, 0, 0, 0.8, 0.3, 2.0), 'x < -0.8')
        self.fails('crypt.feature.b', shapes.box(-0.5, 0, 0, 0.5, 0.3, 3.1), 'z > 3')

    def test_ceiling_hangs_by_the_least_ceiling(self):
        self.passes('crypt.ceiling.a', under_dome(shapes.cone((0, 0, 0), (0, 0, -0.8), 0.3)))
        self.fails('crypt.ceiling.a', shapes.cone((0, 0, 0), (0, 0, -0.9), 0.3), 'hangs at most 0.8')
        self.passes('caverns.ceiling.b', shapes.cone((0, 0, 0), (0, 0, -1.9), 0.3))
        self.fails('crypt.ceiling.c', shapes.box(-0.2, -0.2, -0.3, 0.2, 0.2, 0.1), 'z > 0')
        self.fails('crypt.ceiling.b', shapes.box(-1.7, -0.1, -0.3, 1.6, 0.1, 0), 'x < -1.6')

    def test_a_ceiling_piece_under_a_dome_or_a_vault_keeps_near_its_origin(self):
        arms = shapes.box(-0.9, -0.1, -0.2, 0.9, 0.1, 0)
        self.fails('sanctum.ceiling.c', arms, 'x > 0.8')
        self.fails('halls.ceiling.a', shapes.box(-0.1, -0.85, -0.2, 0.1, 0.1, 0), 'y < -0.8')
        self.passes('crypt.ceiling.b', under_dome(shapes.box(-0.8, -0.8, -0.2, 0.8, 0.8, 0)))
        self.passes('cells.ceiling.c', arms)
        self.passes('caverns.ceiling.a', arms)

    def test_a_ceiling_piece_under_a_dome_or_a_vault_keeps_under_the_smallest_domes_curve(self):
        boss = shapes.box(-0.4, -0.4, -0.2, 0.4, 0.4, 0)
        self.fails('halls.ceiling.a', boss, "smallest dome's curve")
        self.passes('halls.ceiling.a', under_dome(boss))
        lifted = [[((x, y, z + 0.003), uv) for (x, y, z), uv in face] for face in under_dome(boss)]
        self.fails('crypt.ceiling.b', lifted, "smallest dome's curve")
        self.passes('cells.ceiling.a', boss)
        self.passes('caverns.ceiling.c', boss)

    def test_the_smallest_dome_is_the_pages(self):
        path = os.path.join(HERE, '..', '..', 'client', 'src', 'game', 'dungeonCeilings.ts')
        with open(path) as file:
            source = file.read()
        dome = float(source.split('const RISE_M = {')[1].split('dome:')[1].split('}')[0])
        share = float(source.split('const RISE_SHARE =')[1].split(';')[0])
        self.assertEqual(envelope.DOME_RADIUS_M, catalog.CELL_M)
        self.assertAlmostEqual(envelope.DOME_RISE_M, min(dome, envelope.DOME_RADIUS_M * share))

    def test_floor(self):
        self.passes('crypt.floor.b', shapes.box(-1.6, -1.6, -0.2, 1.6, 1.6, 0.05))
        self.fails('crypt.floor.a', shapes.box(-1.7, -1.0, 0, 1.0, 1.0, 0.03), 'x < -1.6')

    def test_sconce(self):
        plate = shapes.box(-0.06, 0, -0.25, 0.06, 0.03, 0.05) + shapes.box(-0.02, 0.03, -0.17, 0.02, 0.29, -0.13)
        cup = shapes.box(-0.06, 0.29, -0.15, 0.06, 0.41, -0.07)
        self.passes('crypt.sconce', plate + cup)
        self.fails('crypt.sconce', plate, 'nothing holds')
        self.fails('crypt.sconce', plate + cup + shapes.box(-0.02, 0.33, -0.07, 0.02, 0.37, 0.1), 'flame')
        self.fails('crypt.sconce', plate + cup + shapes.box(-0.25, 0, 0, 0.2, 0.03, 0.05), 'x < -0.2')
        self.fails('crypt.sconce', plate + shapes.box(-0.06, 0.29, -0.15, 0.06, 0.45, -0.07), 'y > 0.42')

    def test_portal_and_exit(self):
        posts = shapes.box(0.75, 0, 0, 1.05, 0.18, 2.6) + shapes.box(-1.05, 0, 0, -0.75, 0.18, 2.6)
        backing = shapes.box(-1, -0.5, 0, 1, 0, 3)
        self.passes('crypt.portal', posts + shapes.box(-1.05, 0, 2.6, 1.05, 0.18, 2.9) + backing)
        self.fails('crypt.exit', posts + shapes.box(-0.5, 0, 1.0, 0.5, 0.1, 1.2), "code's face")
        self.fails('crypt.exit', posts + shapes.box(-1.05, 0, 2.6, 1.05, 0.18, 3.2), 'z > 3.1')
        self.fails('crypt.portal', shapes.box(1.0, 0, 0, 1.35, 0.18, 2.6), 'x > 1.3')

    def test_a_kit_piece_over_its_own_kind_of_budget_fails(self):
        floor = [corner_at((0, 0, 0))]
        self.assertTrue(any('300 a floor.a' in problem for problem in broken('crypt.floor.a', floor * 301)))
        self.assertFalse(any('triangles, over' in problem for problem in broken('crypt.floor.a', floor * 300)))
        self.assertEqual(envelope.kit_budget('door.b'), 1500)
        self.assertEqual(envelope.kit_budget('pillar.capital'), 750)
        self.assertEqual(envelope.kit_budget('ceiling.c'), 600)

    def test_the_way_through_a_door_is_the_rules_doorway(self):
        rules = os.path.join(HERE, '..', '..', 'crates', 'dungeon', 'src', 'dungeon.rs')
        with open(rules) as file:
            line = next(line for line in file if line.startswith('pub const DOORWAY_HALF_M'))
        self.assertEqual(float(line.split('=')[1].strip(' ;\n')), envelope.DOORWAY_HALF_M)

    def test_an_unknown_module_fails(self):
        self.assertTrue(broken('crypt.nothing', [corner_at((0, 0, 0))]))


class LandmarkEnvelopes(unittest.TestCase):
    def test_a_landmark_keeps_to_its_footprint(self):
        landmark = catalog.landmark('mines.collapse')
        found = broken('mines.collapse', footprint_floor(landmark) + [corner_at((-0.1, 3.0, 0.01))])
        self.assertTrue(any('footprint' in problem for problem in found), found)

    def test_a_landmark_keeps_under_its_styles_least_ceiling(self):
        for module, top, fails in (('crypt.collapsed-vault', 3.15, True), ('halls.fallen-chandelier', 3.15, False)):
            landmark = catalog.landmark(module)
            found = broken(module, footprint_floor(landmark) + [corner_at((3.2, 3.2, top))])
            self.assertEqual(any('least ceiling' in problem for problem in found), fails, (module, found))

    def test_a_triangle_spanning_the_walk_zone_between_solids_fails(self):
        landmark = catalog.landmark('caverns.stone-teeth')
        beam = [((1.2, 1.2, 1.0), (5.2, 1.4, 1.0), (5.2, 1.4, 1.2))]
        found = broken('caverns.stone-teeth', footprint_floor(landmark) + beam)
        self.assertTrue(any('span the walk zone' in problem for problem in found), found)

    def test_geometry_over_one_solid_or_out_of_the_walk_zone_passes(self):
        landmark = catalog.landmark('caverns.stone-teeth')
        solids = [face for x0, y0, x1, y1, top in landmark['solids'] for face in shapes.box(x0, y0, 0, x1, y1, top)]
        rug = shapes.box(0, 0, -0.05, 6.4, 6.4, 0.05) + shapes.box(0, 0, -1.0, 6.4, 6.4, -0.5)
        high = [((0.5, 0.5, 2.2), (5.9, 0.5, 2.2), (5.9, 5.9, 2.3))]
        self.assertEqual(broken('caverns.stone-teeth', triangles(solids + rug) + high), [])

    def test_a_landmark_draws_its_own_floor(self):
        landmark = catalog.landmark('crypt.bone-pit')
        half = footprint_floor(landmark)[:1]
        found = broken('crypt.bone-pit', half)
        self.assertTrue(any('floor is open' in problem for problem in found), found)

    def test_a_landmark_floor_sunk_or_raised_where_a_body_stands_is_open(self):
        landmark = catalog.landmark('caverns.stone-teeth')
        floor = footprint_floor(landmark)
        for lift in (-0.5, 3.0):
            moved = [tuple((x, y, z + lift) for x, y, z in corners) for corners in floor]
            found = broken('caverns.stone-teeth', moved)
            self.assertTrue(any('floor is open' in problem for problem in found), (lift, found))
        self.assertFalse(any('floor is open' in problem for problem in broken('caverns.stone-teeth', floor)))

    def test_a_landmark_floor_meets_the_rooms_at_its_edge_or_is_skirted(self):
        landmark = catalog.landmark('caverns.stone-teeth')
        width, depth = (cells * catalog.CELL_M for cells in landmark['cells'])
        for low, top, fails in ((0.0, 0.01, True), (-0.02, 0.01, True), (-0.05, -0.01, True), (-0.05, 0.01, False),
                                (-0.05, 0.0, False), (0.0, 0.001, False)):
            found = broken('caverns.stone-teeth', triangles(shapes.box(0, 0, low, width, depth, top)))
            self.assertEqual(any('edge' in problem for problem in found), fails, (low, top, found))
        raised = [tuple((x, y, 0.01) for x, y, _ in corners) for corners in footprint_floor(landmark)]
        found = broken('caverns.stone-teeth', raised)
        self.assertTrue(any('edge' in problem for problem in found), found)

    def test_a_landmark_floor_off_the_rooms_over_a_solid_at_its_edge_passes(self):
        rest = [face for x0, y0, x1, y1 in ((0, 0, 0.6, 3.2), (5.8, 0, 6.4, 3.2), (0.6, 1.2, 5.8, 3.2))
                for face in shapes.box(x0, y0, -0.01, x1, y1, 0)]
        hearth = shapes.box(0.6, 0, 0, 5.8, 1.2, 0.01)
        self.assertEqual(broken('halls.great-hearth', triangles(rest + hearth)), [])
        wider = shapes.box(0.2, 0, 0, 5.8, 1.2, 0.01)
        self.assertTrue(any('edge' in problem for problem in broken('halls.great-hearth', triangles(rest + wider))))


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
        door = self.corners(shapes.box(0.9, 0, 0, 1.6, 0.3, 2.3), catalog.PARTS.index('trim'))
        pit = self.corners(shapes.cylinder((3.2, 3.2, 0), (3.2, 3.2, 0.7), 2.0), catalog.PARTS.index('bone'))
        data = export.pack('crypt', [('crypt.door.a', door), ('crypt.bone-pit', pit)])
        self.assertEqual((4 + struct.unpack_from('<I', data)[0]) % 4, 0)
        header, modules = read_pack(data)
        self.assertEqual((header['format'], header['style'], header['parts']), (1, 'crypt', list(catalog.PARTS)))
        self.assertEqual([module['name'] for module in header['modules']], ['crypt.door.a', 'crypt.bone-pit'])
        self.assertEqual(header['modules'][0]['bounds'], [0.9, 0, 0, 1.6, 0.3, 2.3])
        self.assertEqual(header['modules'][1]['indexStart'], header['modules'][0]['indexCount'])
        for name, wrote in (('crypt.door.a', door), ('crypt.bone-pit', pit)):
            read = modules[name]
            self.assertEqual(len(read), len(wrote))
            for got, want in zip(read, wrote):
                for vertex, (position, normal, uv, part) in zip(got, want):
                    for value, expected in zip(vertex[0:3] + vertex[7:9], position + uv):
                        self.assertAlmostEqual(value, expected, places=5)
                    for value, expected in zip(vertex[3:6], normal):
                        self.assertAlmostEqual(value / 127, expected, delta=0.01)
                    self.assertEqual(vertex[6], 0)
                    self.assertEqual(vertex[9:], (part, 0, 0, 0))
        self.assertEqual(export.read_header(data)['style'], 'crypt')

    @unittest.skipUnless(os.environ.get('DUNGEON_MODULES'), "set DUNGEON_MODULES to a build's --out folder")
    def test_a_builds_packs_read_whole_and_hold_every_module_in_order(self):
        for style in catalog.STYLES:
            with open(os.path.join(os.environ['DUNGEON_MODULES'], f'{style}.modules'), 'rb') as file:
                header, modules = read_pack(file.read())
            self.assertEqual((header['style'], list(modules)), (style, catalog.required(style)))
            for name, read in modules.items():
                self.assertEqual(envelope.problems(name, [[vertex[0:3] for vertex in corners] for corners in read]),
                                 [])

    def test_a_pack_refuses_a_part_past_the_parts_and_an_empty_module(self):
        with self.assertRaises(ValueError):
            export.pack('crypt', [('crypt.door.a', self.corners(shapes.box(0, 0, 0, 1, 1, 1), len(catalog.PARTS)))])
        with self.assertRaises(ValueError):
            export.pack('crypt', [('crypt.door.a', [])])


def volume(faces):
    """The volume a closed mesh holds, positive when its faces wind outward."""
    return sum(shapes.dot(a, shapes.cross(b, c)) for a, b, c in triangles(faces)) / 6


class Shapes(unittest.TestCase):
    def test_a_cylinders_u_runs_round_it_in_metres_and_its_v_up_it(self):
        faces = shapes.cylinder((0, 0, 0), (0, 0, 2), 0.5, sides=24)
        sides = [face for face in faces if abs(shapes.normal_of([point for point, _ in face])[2]) < 0.5]
        us = [uv[0] for face in sides for _, uv in face]
        self.assertAlmostEqual(max(us) - min(us), 24 * 2 * 0.5 * math.sin(math.pi / 24), places=6)
        self.assertAlmostEqual(max(us) - min(us), 2 * math.pi * 0.5, delta=0.01)
        for face in sides:
            for point, uv in face:
                self.assertAlmostEqual(uv[1], point[2], places=6)

    def test_a_flat_upright_face_has_v_up_and_u_rightward(self):
        north = shapes.box(0, 0, 0, 1, 1, 1)[2]
        for (x, _, z), (u, v) in north:
            self.assertAlmostEqual(v, z)
            self.assertAlmostEqual(u, -x)

    def test_every_shape_is_closed_and_wound_outward(self):
        made = {
            'box': shapes.box(0, 0, 0, 1, 0.5, 0.3),
            'bevelled box': shapes.bevelled_box(0, 0, 0, 1, 0.5, 0.3, bevel=0.05, wear=0.01, seed='a'),
            'cone': shapes.cone((0, 0, 0), (0.3, 0.2, -1), 0.2),
            'lathe': shapes.lathe([(0, 0.6), (0.15, 0.6), (0.1, 0.5), (0.25, 0.3), (0.2, 0), (0, 0)]),
            'ring': shapes.ring((0, 0, 1), 0.3, 0.03, axis=(0, 1, 0)),
            'outline xz': shapes.extrude_outline([(-1, 0), (1, 0), (1, 2), (0.5, 2), (0.5, 1), (-0.5, 1),
                                                  (-0.5, 2), (-1, 2)], 0, 0.3, 'xz'),
            'round arch': details.arch(0.8, 2.3, 0.2, 0, 0.3, stones=7, keystone=0.05),
            'pointed arch': details.arch(0.8, 2.0, 0.2, 0, 0.3, shape='pointed'),
            'segmental arch': details.arch(0.8, 2.0, 0.2, 0, 0.3, shape='segmental', rise=0.3, stones=5),
            'rock': details.rock(0, 0, 0, (0.5, 0.4, 0.3), seed='a', detail=2),
            'planks': details.planks((-0.7, 0, 0), (0.7, 0.05, 2.2), along='z', across='x', seed='d'),
            'stones': details.stones(-0.8, 0.8, 0, 1.2, seed='w')['stone'],
            'chain': details.chain(details.sag_path((0, 0, 2), (1, 0, 2), 0.3)),
            'rope': details.rope(details.helix((0, 0, 0.03), 0.1, 2, 0, radius_end=0.3), radius=0.03),
            'drape': details.drape(-0.6, 0.6, 2.5, 0.8, folds=3, ragged=0.1),
        }
        for name, faces in made.items():
            edges = {}
            for face in faces:
                points = [tuple(round(value, 6) for value in point) for point, _ in face]
                for a, b in zip(points, points[1:] + points[:1]):
                    edges[a, b] = edges.get((a, b), 0) + 1
            self.assertTrue(all(edges.get((b, a)) == count for (a, b), count in edges.items()), f'{name}: open')
            self.assertGreater(volume(faces), 0, name)

    def test_a_rock_fills_its_size_and_the_same_call_makes_the_same_rock(self):
        rock = details.rock(1, 2, 0.5, (0.6, 0.4, 0.3), seed='x')
        points = [point for face in rock for point, _ in face]
        for axis, (low, high) in enumerate(((0.7, 1.3), (1.8, 2.2), (0.5, 0.8))):
            self.assertAlmostEqual(min(point[axis] for point in points), low, places=6)
            self.assertAlmostEqual(max(point[axis] for point in points), high, places=6)
        self.assertEqual(rock, details.rock(1, 2, 0.5, (0.6, 0.4, 0.3), seed='x'))
        self.assertNotEqual(rock, details.rock(1, 2, 0.5, (0.6, 0.4, 0.3), seed='y'))

    def test_masonry_stays_in_its_box(self):
        points = [point for faces in details.stones(-0.8, 0.8, 0, 2.4, 0, 0.25, alt=0.5, seed='s').values()
                  for face in faces for point, _ in face]
        for axis, (low, high) in enumerate(((-0.8, 0.8), (0, 0.25), (0, 2.4))):
            self.assertGreaterEqual(min(point[axis] for point in points), low - 1e-9)
            self.assertLessEqual(max(point[axis] for point in points), high + 1e-9)


class Catalog(unittest.TestCase):
    def test_a_style_needs_every_kit_piece_and_its_three_landmarks(self):
        for style in catalog.STYLES:
            names = catalog.required(style)
            self.assertEqual(names[:len(catalog.PIECES)], [f'{style}.{piece}' for piece in catalog.PIECES])
            self.assertEqual(len(names), len(catalog.PIECES) + 3)
            self.assertTrue(all(catalog.landmark(name)['style'] == style for name in names[len(catalog.PIECES):]))
        self.assertEqual(catalog.piece_of('mines.wall.cap'), 'wall.cap')
        self.assertIsNone(catalog.piece_of('mines.collapse'))


if __name__ == '__main__':
    unittest.main()
