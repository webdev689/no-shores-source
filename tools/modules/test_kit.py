"""Checks the event props' steady normals (kit.py) on small meshes, without a bake: each normal is worked out in
doubles from the positions alone, and a corner with no face of any area to smooth with still gets a normal.

    python -I tools/modules/test_kit.py   # with Blender's module (tools/modules/requirements.txt)
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,I001 (Blender's mathutils loads with bpy)
import mathutils  # noqa: E402

import kit  # noqa: E402


def mesh_of(points, faces):
    mesh = bpy.data.meshes.new('test')
    mesh.from_pydata(points, [], faces)
    mesh.update()
    mesh.calc_loop_triangles()
    return mesh


def corners_at(mesh, vertex):
    return [loop.index for loop in mesh.loops if loop.vertex_index == vertex]


class SteadyNormals(unittest.TestCase):
    def test_a_corner_of_a_face_of_no_area_takes_the_faces_at_its_point(self):
        # A flat triangle facing up, and a triangle of no area (its points in a line) sharing its first point.
        mesh = mesh_of([(0, 0, 0), (1, 0, 0), (0, 1, 0), (2, 2, 0), (3, 3, 0)], [(0, 1, 2), (0, 3, 4)])
        blender = [mathutils.Vector((0.0, 0.0, 1.0)) for _ in mesh.loops]
        for loop in corners_at(mesh, 0):
            if mesh.loops[loop].index in mesh.polygons[1].loop_indices:
                # Blender's own normal for a face of no area: none, which smooths with nothing.
                blender[loop] = mathutils.Vector((0.0, 0.0, 0.0))
        steady = kit._steady_normals(mesh, blender)
        for loop in corners_at(mesh, 0):
            self.assertEqual(tuple(steady[loop]), (0.0, 0.0, 1.0), 'the flat face at its point, not none')

    def test_a_point_with_no_face_of_any_area_points_up(self):
        mesh = mesh_of([(0, 0, 0), (1, 1, 0), (2, 2, 0)], [(0, 1, 2)])
        blender = [mathutils.Vector((0.0, 0.0, 0.0)) for _ in mesh.loops]
        for normal in kit._steady_normals(mesh, blender):
            self.assertEqual(tuple(normal), (0.0, 0.0, 1.0))


class DoubleNormals(unittest.TestCase):
    def test_a_box_corner_points_out_along_its_diagonal(self):
        points = [(x, y, z) for x in (0, 1) for y in (0, 1) for z in (0, 1)]
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        normals = kit._double_normals(mesh_of(points, faces))
        third = 1.0 / 3.0 ** 0.5
        for (x, y, z), normal in zip(points, normals):
            want = [third if axis else -third for axis in (x, y, z)]
            for got, wanted in zip(normal, want):
                self.assertAlmostEqual(got, wanted, places=12)
            self.assertIsInstance(normal[0], float)

    def test_a_point_on_no_face_points_up(self):
        mesh = mesh_of([(0, 0, 0), (1, 0, 0), (0, 1, 0), (5, 5, 5)], [(0, 1, 2)])
        self.assertEqual(kit._double_normals(mesh)[3], (0.0, 0.0, 1.0))


if __name__ == '__main__':
    unittest.main()
