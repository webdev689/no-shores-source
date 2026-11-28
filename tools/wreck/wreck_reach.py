"""Where a body can walk to in the wreck, from the ground's squares (wreck_course.py): from a square to its neighbour
up no more than a step, or down any drop, as the game's movement walks and falls. The level's check that every zone is
reached from the last, and none past a gate that still stands.
"""
from collections import deque

from wreck_course import CELL_M, SQUARE_CELLS

# The rise a body steps up, metres (crates/movement's TUNING), and the most it climbs with a jump: a jump's apex (4.5
# m/s against 20 m/s² is 0.51 m) and a step up from where it lands.
STEP_M = 0.5
CLIMB_M = 1.05
SIZE_M = CELL_M * SQUARE_CELLS
# A body's radius (crates/movement's body): it walks only where nothing higher than it climbs stands within it.
BODY_M = 0.35


class Reach:
    """The squares of a measured grid (wreck_course.squares), in the game's frame (x east, y south)."""

    def __init__(self, grid, squares):
        self.west = grid['west']
        self.north_y = -grid['north']
        self.squares = squares
        self.rows = len(squares)
        self.columns = len(squares[0]) if squares else 0
        self.square_m2 = SIZE_M * SIZE_M

    def square_of(self, x, y):
        """The square (row, column) under the game's (x, y)."""
        return int((y - self.north_y) // SIZE_M), int((x - self.west) // SIZE_M)

    def middle(self, row, column):
        """The game's (x, y) at a square's middle."""
        return self.west + (column + 0.5) * SIZE_M, self.north_y + (row + 0.5) * SIZE_M

    def height(self, row, column):
        if 0 <= row < self.rows and 0 <= column < self.columns:
            return self.squares[row][column]
        return None

    def flood(self, start, closed=(), climb=STEP_M, roomy=True):
        """Every square reached from the game's point `start`, never into a box of `closed` (minX, minY, maxX,
        maxY): the gates still standing. A body goes up no more than `climb` from a square to the next, down any drop,
        and, with `roomy`, only into a square with room for it (`roomy`): a step by default, a jump's climb to find
        every way round a gate. Without it, every square of ground its feet could reach, for the ground's size."""
        first = self.square_of(*start)
        if self.height(*first) is None:
            return set()

        def shut(row, column):
            x, y = self.middle(row, column)
            return any(box[0] <= x <= box[2] and box[1] <= y <= box[3] for box in closed)

        reached = {first}
        queue = deque([first])
        while queue:
            row, column = queue.popleft()
            here = self.height(row, column)
            for step_row, step_column in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                near = (row + step_row, column + step_column)
                there = self.height(*near)
                if there is None or near in reached or shut(*near) or there - here > climb:
                    continue
                if roomy and not self.roomy(*near, climb):
                    continue
                reached.add(near)
                queue.append(near)
        return reached

    def roomy(self, row, column, climb=STEP_M):
        """Whether a body stands in a square with room for it: nothing higher than `climb` over the square within
        BODY_M of its middle, as a wall or a splinter stands against it. An edge beside it leaves it room."""
        own = self.height(row, column)
        span = int(BODY_M // SIZE_M) + 1
        middle = self.middle(row, column)
        for near_row in range(row - span, row + span + 1):
            for near_column in range(column - span, column + span + 1):
                x, y = self.middle(near_row, near_column)
                if (x - middle[0]) ** 2 + (y - middle[1]) ** 2 > BODY_M * BODY_M:
                    continue
                there = self.height(near_row, near_column)
                if there is not None and own is not None and there - own > climb:
                    return False
        return True

    def reaches(self, reached, point):
        """Whether the game's `point` stands in a square reached."""
        return self.square_of(*point) in reached

    def clear(self, point, room):
        """Whether every square whose middle lies within `room` of the game's `point` is ground within a step of the
        square under it: nothing a body stands against, and no edge, round a figure standing there."""
        row, column = self.square_of(*point)
        own = self.height(row, column)
        if own is None:
            return False
        span = int(room // SIZE_M) + 1
        for near_row in range(row - span, row + span + 1):
            for near_column in range(column - span, column + span + 1):
                x, y = self.middle(near_row, near_column)
                if (x - point[0]) ** 2 + (y - point[1]) ** 2 > room * room:
                    continue
                there = self.height(near_row, near_column)
                if there is None or abs(there - own) > STEP_M:
                    return False
        return True
