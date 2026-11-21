"""The common kit, which serves every climate: wreckage, ruins, the dungeon's doors, the isles' landmarks and camps."""
from kits import doors, landmarks, ruins, wreck


def build(kit):
    return {**wreck.pieces(kit), **ruins.pieces(kit), **doors.pieces(kit), **landmarks.pieces(kit)}
