"""Every module the bake builds, by name: its builder and its seed."""
import bridge
import cavern
import citadel
import stairs
import stones

BUILDERS = {'old-stones': stones.build, 'cavern-chamber': cavern.build, 'keep-citadel': citadel.build}
SEEDS = {'old-stones': 11, 'cavern-chamber': 23, 'keep-citadel': 31}
for rise in stairs.RISES:
    BUILDERS[f'cliff-stair-{rise}'] = stairs.builder(rise)
    SEEDS[f'cliff-stair-{rise}'] = 40 + rise
for length in bridge.LENGTHS:
    BUILDERS[f'stone-bridge-{length}'] = bridge.builder(length)
    SEEDS[f'stone-bridge-{length}'] = 70 + length
