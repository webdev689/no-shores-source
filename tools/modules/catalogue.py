"""Every module the bake builds, by name: its builder and its seed."""
import adorn
import bridge
import cavern
import chapels
import citadel
import court_pieces
import market
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
for number, (name, builder) in enumerate(HUB):
    BUILDERS[name] = builder
    SEEDS[name] = 100 + number
