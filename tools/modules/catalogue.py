"""Every module the bake builds, by name: its builder and its seed."""
import bridge
import cavern
import chest
import citadel
import fissure
import stairs
import stones
import tithe

BUILDERS = {'old-stones': stones.build, 'cavern-chamber': cavern.build, 'keep-citadel': citadel.build}
SEEDS = {'old-stones': 11, 'cavern-chamber': 23, 'keep-citadel': 31}
for rise in stairs.RISES:
    BUILDERS[f'cliff-stair-{rise}'] = stairs.builder(rise)
    SEEDS[f'cliff-stair-{rise}'] = 40 + rise
for length in bridge.LENGTHS:
    BUILDERS[f'stone-bridge-{length}'] = bridge.builder(length)
    SEEDS[f'stone-bridge-{length}'] = 70 + length
# The public events' props: drawn by the page where an event stands, never placed by a layout.
EVENTS = {'lattice-fissure': (fissure.fissure, 101), 'lattice-fissure-sealed': (fissure.sealed, 102),
          'lattice-growth': (fissure.growth, 103), 'lattice-shard': (fissure.shard, 104),
          'tithe-stores-a': (tithe.stores_a, 111), 'tithe-stores-b': (tithe.stores_b, 112),
          'tithe-stores-c': (tithe.stores_c, 113), 'tithe-stores-plundered': (tithe.stores_plundered, 114),
          'tithe-banner': (tithe.banner, 115), 'event-chest': (chest.chest, 121), 'event-chest-lid': (chest.chest_lid, 122),
          'event-chest-heroic': (chest.heroic, 123), 'event-chest-heroic-lid': (chest.heroic_lid, 124)}
for name, (build, seed) in EVENTS.items():
    BUILDERS[name] = build
    SEEDS[name] = seed
