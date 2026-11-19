"""Mesh making for the ship builder: the five painted parts, and objects made from lists of points and faces.

Every face names its part directly, so tools/ships/paint_ship.py keeps it where it was put rather than sorting it by
the way it faces.
"""
import math

import bpy  # noqa: I001 - Blender's own modules load once bpy has

PARTS = ('hull', 'deck', 'spar', 'sail', 'iron')


def part_materials():
    """The five part materials, made once a file."""
    return [bpy.data.materials.get(name) or bpy.data.materials.new(name) for name in PARTS]


class Piece:
    """Points and faces gathered for one object, each face with its part."""

    def __init__(self):
        self.points = []
        self.faces = []
        self.parts = []

    def point(self, point):
        self.points.append(tuple(point))
        return len(self.points) - 1

    def face(self, corners, part):
        self.faces.append(tuple(corners))
        self.parts.append(PARTS.index(part))

    def quad(self, corners, part, facing):
        """A face through the points given, wound so its normal leans the way of `facing`."""
        indices = [self.point(corner) for corner in corners]
        normal = face_normal(corners)
        self.face(indices if sum(normal[axis] * facing[axis] for axis in range(3)) >= 0 else indices[::-1], part)

    def box(self, low, high, part, skip=()):
        """An axis-aligned box from its low corner to its high, without the sides named in `skip` (e.g. 'bottom')."""
        (x0, y0, z0), (x1, y1, z1) = low, high
        sides = {
            'bottom': ([(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)], (0, 0, -1)),
            'top': ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
            'aft': ([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], (-1, 0, 0)),
            'fore': ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
            'starboard': ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
            'port': ([(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)], (0, 1, 0)),
        }
        for name, (corners, facing) in sides.items():
            if name not in skip:
                self.quad(corners, part, facing)

    def prism(self, start, end, radius, part, sides=8, end_radius=None, caps=True):
        """A tapered prism along a line, `sides` facets round, its radius going from `radius` to `end_radius`."""
        axis = [end[index] - start[index] for index in range(3)]
        length = math.sqrt(sum(value * value for value in axis))
        along = [value / length for value in axis]
        helper = (0.0, 0.0, 1.0) if abs(along[2]) < 0.9 else (1.0, 0.0, 0.0)
        first = normalised(cross(along, helper))
        second = cross(along, first)
        rings = []
        for centre, size in ((start, radius), (end, radius if end_radius is None else end_radius)):
            ring = []
            for step in range(sides):
                angle = 2 * math.pi * (step + 0.5) / sides
                offset = [math.cos(angle) * first[index] + math.sin(angle) * second[index] for index in range(3)]
                ring.append(self.point([centre[index] + size * offset[index] for index in range(3)]))
            rings.append(ring)
        low, high = rings
        for step in range(sides):
            following = (step + 1) % sides
            corners = [low[step], low[following], high[following], high[step]]
            middle = [sum(self.points[corner][axis] for corner in corners) / 4 for axis in range(3)]
            centre = [(start[axis] + end[axis]) / 2 for axis in range(3)]
            outward = [middle[axis] - centre[axis] for axis in range(3)]
            self.orient(corners, part, outward)
        if caps:
            self.orient(low, part, [-value for value in along])
            self.orient(high, part, along)

    def slab(self, corner, edges, part):
        """A box at any angle: from `corner`, spanned by its three edge vectors."""
        first, second, third = edges
        at = lambda a, b, c: tuple(corner[axis] + a * first[axis] + b * second[axis] + c * third[axis]  # noqa: E731
                                   for axis in range(3))
        middle = at(0.5, 0.5, 0.5)
        for fixed in range(3):
            for level in (0, 1):
                corners = []
                for one, other in ((0, 0), (1, 0), (1, 1), (0, 1)):
                    weights = [one, other]
                    weights.insert(fixed, level)
                    corners.append(at(*weights))
                centre = [sum(point[axis] for point in corners) / 4 for axis in range(3)]
                self.quad(corners, part, [centre[axis] - middle[axis] for axis in range(3)])

    def ring(self, centre, axis, radius, thickness, part, segments=12):
        """A hoop round `axis` through `centre`: a band, `thickness` across, of `segments` prisms."""
        along = normalised(axis)
        helper = (0.0, 0.0, 1.0) if abs(along[2]) < 0.9 else (1.0, 0.0, 0.0)
        first = normalised(cross(along, helper))
        second = cross(along, first)
        points = []
        for step in range(segments + 1):
            angle = 2 * math.pi * step / segments
            points.append(tuple(centre[index] + radius * (math.cos(angle) * first[index] + math.sin(angle)
                                                          * second[index]) for index in range(3)))
        for start, end in zip(points, points[1:]):
            self.prism(start, end, thickness / 2, part, sides=4)

    def orient(self, indices, part, facing):
        """A face through points already made, wound so its normal leans the way of `facing`."""
        normal = face_normal([self.points[index] for index in indices])
        leans = sum(normal[axis] * facing[axis] for axis in range(3)) >= 0
        self.face(tuple(indices) if leans else tuple(reversed(indices)), part)

    def build(self, name, collection):
        """The object these make, its material slots the five parts, linked into `collection`."""
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.points, [], self.faces)
        for material in part_materials():
            mesh.materials.append(material)
        for polygon, part in zip(mesh.polygons, self.parts, strict=True):
            polygon.material_index = part
        mesh.validate()
        mesh.update()
        item = bpy.data.objects.new(name, mesh)
        collection.objects.link(item)
        return item


def face_normal(corners):
    """A face's normal by Newell's sum, as Blender winds it: counter-clockwise seen from the side it faces."""
    normal = [0.0, 0.0, 0.0]
    for index, here in enumerate(corners):
        after = corners[(index + 1) % len(corners)]
        normal[0] += (here[1] - after[1]) * (here[2] + after[2])
        normal[1] += (here[2] - after[2]) * (here[0] + after[0])
        normal[2] += (here[0] - after[0]) * (here[1] + after[1])
    return normal


def cross(first, second):
    return (
        first[1] * second[2] - first[2] * second[1],
        first[2] * second[0] - first[0] * second[2],
        first[0] * second[1] - first[1] * second[0],
    )


def normalised(vector):
    length = math.sqrt(sum(value * value for value in vector))
    return tuple(value / length for value in vector)
