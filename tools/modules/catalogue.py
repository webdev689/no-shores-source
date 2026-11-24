"""Every module the bake builds, by name: its builder and its seed."""
import adorn
import bridge
import cavern
import chapels
import chest
import citadel
import court_pieces
import dress
import fissure
import market
import outpost_halls
import outpost_standards
import outpost_stores
import outpost_works
import outpost_yards
import props
import ranges
import stairs
import stall_armorsmith
import stall_harbour
import stall_mage
import stall_tack
import stall_tailor
import stall_vault
import stall_weaponsmith
import stones
import tithe
import war_table

BUILDERS = {'old-stones': stones.build, 'cavern-chamber': cavern.build, 'keep-citadel': citadel.build}
SEEDS = {'old-stones': 11, 'cavern-chamber': 23, 'keep-citadel': 31}
for rise in stairs.RISES:
    BUILDERS[f'cliff-stair-{rise}'] = stairs.builder(rise)
    SEEDS[f'cliff-stair-{rise}'] = 40 + rise
for length in bridge.LENGTHS:
    BUILDERS[f'stone-bridge-{length}'] = bridge.builder(length)
    SEEDS[f'stone-bridge-{length}'] = 70 + length

# The hub's pieces, after every module before them: a solid names its module by its place in this order.
HUB = (
    ('stall-mage', stall_mage.build),
    ('stall-vault', stall_vault.build),
    ('stall-weaponsmith', stall_weaponsmith.build),
    ('stall-armorsmith', stall_armorsmith.build),
    ('stall-tailor', stall_tailor.stall_tailor),
    ('stall-tack', stall_tack.stall_tack),
    ('stall-harbourmaster', stall_harbour.stall_harbourmaster),
    ('stall-chandler', stall_harbour.stall_chandler),
    ('chapel-stormcallers', chapels.chapel_stormcallers),
    ('chapel-lamplighters', chapels.chapel_lamplighters),
    ('chapel-veiled', chapels.chapel_veiled),
    ('range', ranges.range_segment),
    ('range-gate', ranges.range_gate),
    ('sealed-gate', ranges.sealed_gate),
    ('war-table', war_table.war_table),
    ('bandstand', court_pieces.bandstand),
    ('fountain', court_pieces.fountain),
    ('market-stall-fish', market.market_stall_fish),
    ('market-stall-fruit', market.market_stall_fruit),
    ('market-stall-pots', market.market_stall_pots),
    ('crates-barrels', props.crates_barrels),
    ('lamp-post', props.lamp_post),
    ('bench', props.bench),
    ('anvil-yard', props.anvil_yard),
    ('hay-cart', props.hay_cart),
    ('bollards', props.bollards),
)
# The hub's adornments, after its pieces.
HUB += adorn.ADORNMENTS
# What fills the courts, after the adornments.
HUB += dress.DRESSING
for number, (name, builder) in enumerate(HUB):
    BUILDERS[name] = builder
    SEEDS[name] = 100 + number
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
# The outposts' structures: drawn by the page on a guild's plot, each on its footprint of 4 m cells.
OUTPOST = {'outpost-hall-1': (outpost_halls.hall_camp, 201), 'outpost-hall-2': (outpost_halls.hall_longhouse, 202),
           'outpost-hall-3': (outpost_halls.hall_stronghold, 203),
           'outpost-counting-1': (outpost_works.counting_camp, 204),
           'outpost-counting-2': (outpost_works.counting_shed, 205),
           'outpost-counting-3': (outpost_works.counting_house, 206),
           'outpost-war-table-1': (outpost_works.war_table_camp, 207),
           'outpost-war-table-2': (outpost_works.war_table_pavilion, 208),
           'outpost-war-table-3': (outpost_works.war_table_stone, 209),
           'outpost-camp-1': (outpost_stores.camp_open, 210), 'outpost-camp-2': (outpost_stores.camp_shed, 211),
           'outpost-camp-3': (outpost_stores.camp_workshop, 212), 'outpost-dock-1': (outpost_stores.dock_yard, 213),
           'outpost-dock-2': (outpost_stores.dock_shed, 214), 'outpost-dock-3': (outpost_stores.dock_works, 215),
           'outpost-gate-1': (outpost_yards.gate_mound, 216), 'outpost-gate-2': (outpost_yards.gate_arch, 217),
           'outpost-gate-3': (outpost_yards.gate_monument, 218), 'outpost-lodge-1': (outpost_yards.lodge_tent, 219),
           'outpost-lodge-2': (outpost_yards.lodge_timber, 220), 'outpost-lodge-3': (outpost_yards.lodge_stone, 221),
           'outpost-horn-1': (outpost_yards.horn_frame, 222), 'outpost-horn-2': (outpost_yards.horn_platform, 223),
           'outpost-horn-3': (outpost_yards.horn_tower, 224), 'outpost-assay-1': (outpost_works.assay_camp, 225),
           'outpost-assay-2': (outpost_works.assay_smithy, 226), 'outpost-assay-3': (outpost_works.assay_house, 227)}
for number, (name, build) in enumerate(outpost_standards.STANDARDS + outpost_standards.SCAFFOLDS):
    OUTPOST[name] = (build, 228 + number)
for name, (build, seed) in OUTPOST.items():
    BUILDERS[name] = build
    SEEDS[name] = seed
