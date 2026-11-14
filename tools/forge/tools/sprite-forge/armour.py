"""The armour sets: helm, cuirass, pauldrons, gauntlets, greaves and boots in each of Daggerfall's twelve armour
materials, leather, chain and plate in its ten metals, cut as Daggerfall cuts its armoured folk: a muscled
breastplate, broad lames under a dark belt, an open helm, a cloth panel hung before and behind on the lighter sets.
Each culture is told by its helm's crown, its pauldrons, its trim and its colour: iron horned under fur; steel round
and plain; silver keeled; elven fanned, its lames toothed like leaves and its pauldrons swept back in blades; dwarven
squared round a gear-boss, ear-discs on its helm; mithril winged; adamantium faceted under a blade crest; ebony keen,
ribbed and finned; orcish faceted and spiked under a tusked helm; daedric ribbed, spiked and horned, its seam aglow.

Every plate is a solid with hard edges (armourkit.py), fitted to the shaped body's own outline where it sits, and hangs
rigid on the joint under it, as plate does. Built after the body is shaped (`dress`), on either body. Its metal is grey,
which the game dyes on the set's own Daggerfall ramp, and the lighter sets leave arms and thighs bare (`COVERAGE`)."""
import math

import numpy as np

import anatomy
import fabric
import materials
import metals
import model
import shape
from armourkit import (TAU, Mesh, Outline, angles, box, cap_band, dome, faceted, fleece, fur, keel, rot, sleeve, solid,
                       spike, squared, strap, teeth, tube)
from body import coords
from gear import BENT, hang
from rig import arm_z, rest

MATERIALS = ('Leather', 'Chain', 'Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony',
             'Orcish', 'Daedric')
GUILDS = ('Thieves', 'Brotherhood', 'Mages', 'Fighters', 'Knights')   # the guilds' own sets, beside the materials': each its own outfit, not a metal's
SETS = MATERIALS + GUILDS
PIECES = ('helm', 'cuirass', 'pauldrons', 'gauntlets', 'greaves', 'boots')
SLOTS = ('plate', 'trim', 'strap', 'fur', 'glow', 'mail', 'leather', 'dark', 'horn', 'shade', 'sash')
S_PLATE, S_TRIM, S_STRAP, S_FUR, S_GLOW, S_MAIL, S_LEATHER, S_DARK, S_HORN, S_SHADE, S_SASH = range(len(SLOTS))

# each culture's hand, drawn for a sprite, where a pixel is 1.6 cm and nothing finer than two of them reads. Every
# set is cut as Daggerfall cuts its armoured folk's - a muscled breastplate (its depth), broad lames to the hips under
# a belt, an open helm, and on the lighter sets a cloth panel hung before and behind - and a culture is told by its
# helm, its pauldrons, its trim and its colour: its plates' section (round, squared, cut into a few broad facets),
# the keel down their middle, their gap off the body and thickness, how many lames, their rolled edges, and what it
# lays on - straps, fur, a gorget, a boss, ribs, spikes, glowing seams, a plackart, a mail skirt, big studs, broad
# strips, leather strips; what it wears under (mail, or a padded cloth of a colour); its sabatons' toes; its helm;
# its pauldrons. The padding's and the panels' cloth is in the greens, teals and browns Daggerfall dresses them in;
# the mail's padding is grey, as the mail itself reads
STYLE = {
    'Leather': {'kind': 'leather', 'under': ('cloth', (58, 44, 30)), 'gap': 0.008, 'thick': 0.005, 'lames': 1,
                'edge': 0.005, 'straps': True, 'fur': 'collar', 'muscle': 0.9, 'helm': 'cap', 'fleece': True,
                'toe': 'round',
                'paul': {'make': 'round', 'size': 0.9, 'lames': 1}},
    'Chain': {'kind': 'chain', 'under': ('cloth', (46, 103, 103)), 'gap': 0.011, 'thick': 0.004, 'lames': 0,
              'edge': 0.0, 'helm': 'coif', 'fleece': True, 'toe': 'round',
              'paul': {'make': 'mail', 'size': 0.9, 'lames': 0}},
    'Iron': {'under': 'mail', 'gap': 0.012, 'thick': 0.006, 'lames': 1, 'edge': 0.0, 'plain': True, 'muscle': 1.0,
             'fauld': False, 'helm': 'horned', 'toe': 'round',
             'paul': {'make': 'round', 'size': 0.92, 'lames': 3, 'smooth': True, 'stretch': (1.08, 1.0, 0.8)},
             'woman': {'neckline': (0.12, 0.75),
                       'paul': {'make': 'round', 'size': 0.9, 'lames': 2, 'smooth': True, 'stretch': (1.2, 1.0, 0.75),
                                'point': True}}},
    # Daggerfall's guard's (TEXTURE.399): one broad plate a shoulder from the collar out, a yoke across the back; a
    # dark carved breast whose blocks' tops catch the light; mail thighs over a round knee and a smooth shin. Its helm
    # is the guard's made round, a nasal for its cheek plates and mail hung from it, so its profile reads as a face
    'Steel': {'under': 'mail', 'keel': 0.006, 'gap': 0.011, 'thick': 0.006, 'lames': 2,
              'edge': 0.0, 'plain': True, 'muscle': 1.0, 'bevel': 0.02, 'abs_wide': 2.0, 'helm': 'guard',
              'helm_point': 0.0, 'helm_tall': 1.04, 'cheeks': False, 'nasal': True, 'aventail': True, 'toe': 'round',
              'paul': {'make': 'round', 'size': 0.95, 'lames': 1, 'smooth': True, 'stretch': (1.15, 1.15, 0.55),
                       'mantle': 0.06}},
    # Daggerfall's medium fighter's (TEXTURE.488): a dark breastplate whose carved tops catch the light, his back left
    # to the mail, a broad plate a shoulder over a bare arm, its edge trimmed and riveted, dark bracers rimmed bright, a
    # dark bowl of a helm; the woman's cut as hers (TEXTURE.487), her helm drawn in and its horns up in a crescent
    'Silver': {'under': 'mail', 'gap': 0.011, 'thick': 0.006, 'lames': 2, 'edge': 0.0, 'plain': True, 'muscle': 1.0,
               'bevel': 0.024, 'abs_wide': 2.4, 'open_back': True, 'fauld': False, 'helm': 'bowl', 'toe': 'point',
               'dark_bracers': True, 'bracer_trim': True, 'helm_shade': True, 'trimlines': True, 'rivets': True,
               'paul': {'make': 'round', 'size': 1.0, 'lames': 1, 'smooth': True, 'stretch': (1.2, 1.15, 0.55),
                        'mantle': 0.02},
               'woman': {'helm': 'bowl_horned', 'helm_wide': (1.06, 1.04), 'neckline': (0.12, 0.75), 'cuisse': True,
                         'fauld': 'back',
                         'paul': {'make': 'round', 'size': 1.0, 'lames': 1, 'smooth': True, 'stretch': (1.5, 1.05, 0.5),
                                  'point': True}}},
    # elven gold (its own colours, `SET_GRADE`): layered plate, a spiral boss on each shoulder, forearm and knee, over
    # a dark red tunic
    'Elven': {'under': ('cloth', (88, 40, 30)), 'keel': 0.008, 'gap': 0.01, 'thick': 0.005, 'lames': 2,
              'teeth': (0.035, 6), 'edge': 0.005, 'gorget': True, 'muscle': 0.6, 'helm': 'elven',
              'toe': 'point', 'spirals': True, 'chevrons': 3, 'trimlines': True,
              'paul': {'make': 'swept', 'size': 1.0, 'lames': 3, 'point': True, 'ridge': True, 'smooth': True}},
    # the dwarves' bronze (its own colours, `SET_GRADE`): heavy rounded plate, studs across the breast between raised
    # bands, the belly in lames, a helm with a tall crest and a face mask over a thick collar, angular pauldrons
    # sloped from the neck with a fin standing by it, banded greaves, square toes, a dark violet sash over a violet
    # under-cloth
    'Dwarven': {'under': ('cloth', (26, 20, 30)), 'sash': (34, 26, 38), 'gap': 0.014, 'thick': 0.007, 'lames': 3,
                'edge': 0.007, 'muscle': 0.7, 'gorget': True, 'collar': True, 'helm': 'dwarven', 'mask': True,
                'toe': 'square', 'stud_rows': 3, 'bands': (1.435, 1.255), 'greave_bands': True,
                'paul': {'make': 'wedge', 'drop': 0.1, 'drape': 0.08, 'reach': 0.03, 'fin': 0.11}},
    # mithril, in Daggerfall's own mithril dye: a tall closed helm, a broad dark visor behind a narrow plate, thin
    # feathers fanned up and back off each side, a high collar; a smooth breastplate ridged and drawn to a point over
    # the belly, a small shield of an emblem at its top, lames in a V under it; pauldrons of two bands, the lower a broad
    # wing drawn to a point past the arm, the upper a cap with a lip standing by the neck
    'Mithril': {'under': 'mail', 'keel': 0.006, 'gap': 0.01, 'thick': 0.005, 'lames': 2, 'edge': 0.005,
                'muscle': 0.0, 'helm': 'mithril', 'mask': True, 'mask_wrap': 1.25, 'mask_low': -1.0,
                'slit': (0.62, 0.0, 0.82), 'beak': True, 'beak_w': 0.022, 'feathers': 5, 'neck_guard': True,
                'gorget': True, 'collar': True, 'breast_point': 0.07, 'breast_ridge': True, 'emblem': True,
                'vplates': 3, 'vplates_at': (1.16, 0.04), 'toe': 'point',
                'paul': {'make': 'blades', 'blades': 2, 'claws': False, 'reach': 0.1, 'width': 0.08, 'drape': 0.055,
                         'droop': 0.02, 'shrink': (0.45, 0.1), 'flange': 0.045, 'rivets': False}},
    # adamantium, polished steel in its own colours (`SET_GRADE`): a rounded helm drawn up to a peak, a visor's brim at
    # the brow under a pale blue gem, two fins off its sides, its face shut behind a slit; broad round pauldrons, a lip
    # standing by the neck and a point jutting past the arm; a bright breastplate, muscled and ridged, a plackart arched
    # up into it and drawn to a V over a dark belly; a belt with a round buckle, plates at the hips and thighs, a dark
    # slate under-cloth
    'Adamantium': {'under': ('cloth', (40, 44, 56)), 'keel': 0.006, 'gap': 0.012, 'thick': 0.007, 'lames': 2,
                   'edge': 0.005, 'muscle': 1.1, 'gorget': True, 'helm': 'adamantium', 'helm_point': 0.17, 'mask': True,
                   'mask_wrap': 1.3, 'slit': (0.2, 0.06, 0.7), 'neck_guard': True, 'brim': True, 'gem': True,
                   'side_fins': True, 'seam': ((80, 170, 210), 0.9), 'plackart': 'bright', 'plackart_point': 0.045, 'breast_ridge': True, 'dark_belly': True,
                   'buckle': 'disc', 'toe': 'point',
                   'paul': {'make': 'round', 'size': 1.14, 'lames': 2, 'smooth': True, 'point': True, 'lip': 0.026,
                            'tip': 0.045}},
    # ebony, in Daggerfall's own ebony dye: black steel lit to a dull grey, its edges bright. A tall helm, its front lit
    # and ridged down to a point between the eyes over a face all black, a long thin blade up each side from the jaw
    # past the crown; each shoulder one broad plate standing high by the neck and swept out past the arm into a long
    # point, plates under it each drawn to a point of their own; a shield of bright plate down a dark breast over
    # chevrons on the belly; a dark belt with a ring for a buckle; tassets drawn to points over the thighs, blades off
    # the forearms, the knees drawn up to a point, long pointed toes
    'Ebony': {'under': ('cloth', (30, 26, 32)), 'keel': 0.008, 'gap': 0.012, 'thick': 0.006, 'lames': 2,
              'edge': 0.0045, 'gorget': True, 'muscle': 0.3, 'helm': 'ebony', 'helm_point': 0.12, 'mask': True,
              'mask_wrap': 1.9, 'mask_low': -1.15, 'mask_dark': True, 'brow_v': 0.45, 'neck_guard': True,
              'cheek_blades': 0.07, 'emblem': (0.4, 0.25, 0.0), 'breast_ridge': True, 'vplates': 3,
              'vplates_at': (1.235, 0.045), 'buckle': 'ring', 'fins': 'arms', 'knee_point': True, 'tasset_point': 0.07,
              'toe': 'point', 'paul': {'make': 'scythe', 'reach': 0.09, 'drape': 0.075, 'lames': 2}},
    # orcish, in Daggerfall's own orcish dye held low on its ramp, a dark olive bronze: an open helm, a tall crest blade
    # from the nose up over the crown under a dark topknot, leaf ribs swept back along its sides, long cheek guards;
    # shoulders of rounded lames down the arm, the top one's outer corner swept up into a horn; a studded yoke over
    # the breast and a stack of chevron plates down its middle, through the waist and over the belt to a point; dark
    # leather braces ringed at the belt, a ring at each hip; pointed tassets over dark leather thighs; tall
    # boot-greaves, a pointed plate down the shin, fur at the ankle, big round toes
    'Orcish': {'under': ('cloth', (40, 31, 24)), 'gap': 0.014, 'thick': 0.008, 'lames': 2, 'edge': 0.006,
               'muscle': 0.3, 'helm': 'orcish', 'cheeks': False, 'crest_blade': 0.05, 'topknot': True,
               'leaf_ribs': 3,
               'yoke': 0.06, 'chevron_stack': (5, 0.11), 'braces': True, 'belt_rings': 1, 'tasset_point': 0.06,
               'boot_greave': True, 'ankle_fur': True, 'fleece': True, 'fur_colour': (52, 44, 38), 'toe': 'round',
               'paul': {'make': 'round', 'size': 1.0, 'lames': 3, 'smooth': True, 'horn': 0.1},
               # her helm already grown over her hair: a lower crest on it, and no topknot
               'woman': {'crest_blade': 0.035, 'topknot': False}},
    # the thieves guild's: brown leather in its own colours, its buckles and clasps brass. A hood peaked over the brow,
    # shadowing the face, its cowl over the neck; a jacket with a high collar buckled at the throat, a bandolier of
    # brass-clasped pouches across it beside a brass badge, two belts, the jacket stopping fitted just under them (no
    # skirt); shoulders of two small leather lames; snug strapped bracers over dark leather sleeves; dark leather
    # breeches, padded knees, tall boots turned down in a cuff under the knee
    'Thieves': {'kind': 'leather', 'under': ('leather', (46, 36, 30)), 'under_order': 0.007, 'leather_colour': (88, 66, 48),
                'strap_colour': (54, 40, 30), 'gap': 0.008, 'thick': 0.005, 'lames': 1, 'edge': 0.004,
                'muscle': 0.3, 'helm': 'hood', 'helm_point': 0.24, 'cowl': True, 'stand_collar': True, 'bandolier': 4, 'belts': 2,
                'jacket_hem': True, 'bracer': 'strapped', 'knee_pads': True, 'boot_cuff': True, 'boot_strap': False,
                'seam': ((150, 112, 52), 0.04), 'toe': 'round',
                'paul': {'make': 'round', 'size': 0.88, 'lames': 2, 'smooth': True, 'stretch': (1.0, 1.0, 0.6)}},
    # the dark brotherhood's: black leather with deep crimson leather plates, in its own colours. A close black hood,
    # its face open, its cowl round the neck; crimson plates layered in a V across the breast and a crimson panel down
    # the belly; one wide studded belt, the jacket fitted under it (no skirt, no sash); small crimson shoulder caps;
    # banded crimson bracers over black sleeves; crimson plates on the thighs' fronts, crimson knees and boots
    'Brotherhood': {'kind': 'leather', 'under': ('leather', (30, 26, 26)), 'under_order': 0.007, 'leather_colour': (38, 32, 32),
                    'strap_colour': (104, 30, 28), 'gap': 0.008, 'thick': 0.005, 'lames': 1, 'edge': 0.004,
                    'muscle': 0.4, 'helm': 'hood', 'hood_fit': 'close', 'cowl': True, 'vplates': 4,
                    'vplates_at': (1.44, 0.045), 'vplates_slot': 'trim', 'belly_panel': True, 'belts': 1,
                    'belt_studs': 8, 'jacket_hem': True, 'bracer': 'banded', 'knee_pads': True, 'thigh_plates': True,
                    'boot_strap': False, 'seam': ((150, 120, 72), 0.04), 'toe': 'round', 'crimson': True,
                    'trim_pieces': ('pauldrons', 'bracers', 'knees', 'shins', 'boots'),
                    'paul': {'make': 'round', 'size': 0.82, 'lames': 1, 'smooth': True, 'stretch': (1.0, 1.0, 0.6)}},
    # the mages guild's: a coat of teal cloth trimmed in brown leather, its clasps silver. A loose teal hood edged in
    # brown, the face open; a teal capelet over the shoulders rimmed in brown; brown panels down the front either side
    # of a row of silver clasps; one belt, a round emblem for its buckle, the coat fitted under it (no tabard, no
    # skirt); brown laced bracers over teal sleeves, brown gloves; teal breeches; tall brown boots laced up the front
    'Mages': {'kind': 'leather', 'cloth': True, 'under': ('cloth', (50, 86, 80)), 'under_order': 0.007,
              'leather_colour': (56, 102, 94), 'strap_colour': (64, 42, 28), 'gap': 0.008, 'thick': 0.005,
              'lames': 1, 'edge': 0.004, 'muscle': 0.2, 'helm': 'hood', 'helm_point': 0.18, 'hood_brow': 0.045,
              'cowl': True, 'cowl_low': 1.42, 'cowl_open': 0.32, 'cowl_flare': 0.03, 'cowl_rim': 0.0065,
              'braces': True,
              'braces_at': (0.36, 0.0), 'brace_rings': False, 'clasps': 5, 'belts': 1, 'buckle': 'disc',
              'jacket_hem': True, 'bracer': 'laced', 'knee_guard': False, 'boot_top': -0.035, 'boot_lace': True,
              'boot_strap': False, 'seam': ((196, 192, 176), 0.0), 'toe': 'round',
              'trim_pieces': ('shins', 'boots'),
              'paul': {'make': 'round', 'size': 1.0, 'lames': 1, 'smooth': True, 'stretch': (1.0, 1.0, 0.7)}},
    # the fighters guild's: polished silver plate in its own colours (`SET_GRADE`), its straps and belt a red-brown
    # leather. An open helm, its nape guarded, no plate over the face; a high gorget; a yoke over the breast dipped in a
    # V, a strap buckled down the breastbone from the collar; a plackart arched up over the breast's foot; round
    # pauldrons in three lames, a lip standing by the neck; a broad belt; plate at the hips and thighs over dark blue
    # cloth (no skirt); a leather band round each greave under the knee; long pointed toes
    'Fighters': {'under': ('cloth', (44, 56, 94)), 'keel': 0.006, 'gap': 0.012, 'thick': 0.006, 'lames': 2,
                 'edge': 0.005, 'muscle': 0.6, 'gorget': True, 'helm': 'fighters', 'cheeks': False, 'yoke': 0.07,
                 'yoke_studs': False, 'chest_strap': True, 'plackart': True, 'strap_colour': (84, 40, 28), 'glove': 'trim',
                 'greave_strap': True, 'trimlines': True, 'toe': 'point',
                 'paul': {'make': 'round', 'size': 0.9, 'lames': 3, 'smooth': True, 'lip': 0.04,
                          'stretch': (1.08, 1.0, 0.8)}},
    # the knightly orders': bright faceted plate in its own colours (`SET_GRADE`), whiter than the fighters'. A tall
    # closed helm drawn up to a point under a spike, its visor barred in upright slits; angular pauldrons in two lames,
    # each with a peak standing up from its top; a faceted breast ridged down its middle over plates in a V; blades off
    # the forearms; plate at the hips drawn to points; knees drawn up to a point; layered sabatons, square-toed
    'Knights': {'under': ('cloth', (58, 62, 86)), 'sash': (40, 54, 120), 'section': ('facet', 12), 'keel': 0.014, 'gap': 0.016,
                'thick': 0.007, 'lames': 2, 'edge': 0.004, 'gorget': True, 'muscle': 0.5, 'breast_ridge': True,
                'vplates': 3, 'vplates_at': (1.2, 0.045), 'fins': 'arms', 'knee_point': True, 'tasset_point': 0.05,
                'helm': 'knight', 'helm_point': 0.32, 'cheeks': False, 'mask': True, 'mask_wrap': 1.75,
                'grille': 3, 'crown_spike': 0.12, 'strap_colour': (46, 48, 70), 'glove': 'trim', 'toe': 'square',
                'paul': {'make': 'facet', 'size': 0.95, 'lames': 2, 'smooth': True, 'lip': 0.12, 'lip_peak': True,
                         'lip_beta': 0.15}},
    # daedric: blackened metal in its own colours (`SET_GRADE`), a deep red seam dimly aglow only between its plates
    # (`seam`): plates layered in a V down the breast, a ribbed spine down the belly, spikes off the knees and elbows
    # but none off the flanks, clawed toes
    'Daedric': {'under': ('cloth', (40, 18, 16)), 'section': ('facet', 12), 'keel': 0.018, 'gap': 0.013,
                'thick': 0.007, 'lames': 2, 'teeth': (0.045, 6), 'edge': 0.0, 'gorget': True, 'vplates': 3,
                'belly_spine': True, 'seam': ((70, 13, 9), 0.12), 'glow': True, 'spikes': True, 'flanks': False, 'fins': True,
                'muscle': 1.0, 'helm': 'daedric', 'helm_shade': True, 'mask': True, 'mask_wrap': 2.0, 'mask_low': -1.1,
                'neck_guard': True, 'beak': True,
                'helm_spikes': True, 'toe': 'claw',
                'claws': True,
                'paul': {'make': 'blades', 'blades': 4, 'reach': 0.08, 'rise': 0.2, 'width': 0.075, 'drape': 0.06}},
}
# elven gold, brightness onto the palette's own warm golds (ART_PAL.COL 191, 189, 44, 29, 24, 21, 18, 15, 13, 5, 1,
# 226): umber shade, amber gold and a pale glint, apart from dwarven's yellow
ELVEN_GOLD = [[40.0, 90.0, 130.0, 160.0, 185.0, 205.0, 220.0, 232.0, 242.0, 248.0, 253.0, 255.0],
              [[35, 23, 11], [59, 39, 19], [91, 67, 38], [137, 112, 66], [164, 130, 67], [185, 148, 76],
               [206, 159, 73], [228, 178, 80], [247, 189, 79], [255, 206, 90], [255, 229, 129], [254, 235, 170]]]
# elven leather and cloth on the palette's copper (ART_PAL.COL 191, 189..182, 238, 236)
ELVEN_COPPER = [[10.0, 25.0, 40.0, 55.0, 70.0, 85.0, 100.0, 115.0, 130.0, 150.0, 175.0],
                [[35, 23, 11], [59, 39, 19], [75, 47, 23], [87, 55, 27], [99, 63, 31], [115, 67, 35], [127, 75, 39],
                 [139, 83, 43], [155, 91, 47], [205, 107, 35], [219, 131, 43]]]
# dwarven bronze, brightness onto the palette's own bronzes (ART_PAL.COL 191, 189, 188, 44, 73, 71, 69, 67, 66, 11):
# browner than elven's gold, its shade a deep brown, most of it bronze, only its tops a pale brass, apart from
# Daggerfall's lemon dwarven ramp. Its plate renders in a narrow band of light, so the steps are close together
DWARVEN_BRONZE = [[50.0, 95.0, 125.0, 150.0, 170.0, 188.0, 203.0, 218.0, 235.0, 252.0],
                  [[35, 23, 11], [59, 39, 19], [75, 47, 23], [91, 67, 38], [123, 92, 60], [151, 110, 69],
                   [173, 127, 78], [196, 154, 105], [213, 174, 128], [231, 198, 122]]]
# daedric's blackened metal, brightness onto the palette's own near-blacks and its warm grey-browns (ART_PAL.COL
# 223, 221, 219, 217, 216, 254, 30, 27, 25): black through most of its light, only its brightest glints a dull warm
# grey, never Daggerfall's red dye. Each step a hair off grey, so no dye touches it; the snap lays it on the palette's
DAEDRIC_BLACK = [[30.0, 85.0, 130.0, 168.0, 200.0, 226.0, 242.0, 250.0, 255.0],
                 [[9, 8, 8], [16, 15, 15], [24, 23, 23], [32, 31, 31], [41, 39, 39], [57, 45, 41], [72, 62, 56],
                  [92, 81, 73], [112, 100, 89]]]
# adamantium's polished steel, brightness onto the palette's whole blue-grey run (ART_PAL.COL 223, 219, 95..80): the
# run Daggerfall's adamantium dye draws its dark third from, carried on up to its palest, share for share as the
# reference's chrome is lit: its shadows in black, the plate facing the viewer in the run's dark third, so the shapes
# on the breast and belly read, a tenth of lit faces in the pale steels and a fiftieth near white. Each step a little
# blue, never grey, so no dye touches it
ADAMANTIUM_STEEL = [[50.0, 80.0, 105.0, 125.0, 140.0, 152.0, 163.0, 173.0, 183.0, 192.0, 200.0, 207.0, 213.0, 218.0,
                     223.0, 228.0, 233.0, 238.0, 246.0],
                    [[16, 16, 18], [22, 22, 24], [31, 31, 34], [40, 40, 42], [46, 46, 48], [53, 53, 59], [61, 61, 67],
                     [68, 68, 80], [75, 75, 85], [85, 85, 96], [94, 94, 109], [103, 103, 116], [114, 114, 127],
                     [122, 122, 137], [135, 135, 149], [145, 145, 159], [165, 165, 174], [188, 188, 199],
                     [205, 205, 224]]]
# the fighters' polished silver: the palette's steels (as adamantium's), but lit high up them, its glints near white
FIGHTERS_STEEL = [[60.0, 92.0, 120.0, 142.0, 162.0, 180.0, 196.0, 210.0, 222.0, 233.0, 242.0, 250.0, 255.0],
                  [[53, 53, 59], [61, 61, 67], [75, 75, 85], [85, 85, 96], [103, 103, 116], [114, 114, 127],
                   [122, 122, 137], [135, 135, 149], [145, 145, 159], [165, 165, 174], [188, 188, 199],
                   [205, 205, 224], [205, 205, 224]]]
# the knights' bright plate: the same steels, lit higher still, its faces near white
KNIGHT_STEEL = [[52.0, 84.0, 110.0, 131.0, 150.0, 167.0, 182.0, 196.0, 209.0, 222.0, 234.0, 245.0, 253.0],
                FIGHTERS_STEEL[1]]
# the close-up hand the first-person forge draws a gauntlet and a boot in (fparmour.py), where a rivet is many pixels
# wide: each culture's fine detail, laid over its sprite hand - rivets a row, flutes, trim lines, toothed lames, its
# gauntlets' knuckles
CLOSE_UP = {
    'Leather': {'edge': 0.0025, 'rivets': 14, 'knuckles': 'studs'},
    'Iron': {'edge': 0.0065, 'rivets': 12, 'knuckles': 'studs', 'stud': 0.0055, 'keel': 0.004, 'stepped': True,
             'buckled': (0.2, 0.42), 'cuff_rivets': 10},
    # steel polished smooth, as the guard's plate: no straps or studs, a bar across the knuckles, its edges rolled
    # bold, its shade darker and its glints brighter than the plate's own grade
    'Steel': {'edge': 0.0045, 'knuckles': 'bar', 'cuff_rivets': 6, 'polish': True,
              'grade': {'plate': {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0],
                                            [36.0, 48.0, 72.0, 104.0, 148.0, 204.0, 236.0]]}}},
    # silver polished, and graded down the band: its ramp starts at a light blue-grey, so the plate's own grade left it
    # near white; its fluted vambrace and its trim read in its shade
    'Silver': {'edge': 0.004, 'keel': 0.005, 'flutes': 5, 'trimlines': True, 'polish': True, 'dark_vambrace': True,
               'grade': {'plate': {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0],
                                             [24.0, 44.0, 58.0, 87.0, 132.0, 190.0, 224.0]]}}},
    # elven gold up close in its sprite's own colours (ELVEN_GOLD), polished: its plate's light share for share onto
    # the gold, and its rims, flutes and lines (`dark_trim`) and the mail under its plates in its umbers, so each rim
    # draws a line between plates; a spiral boss on the forearm and the knee, as on its sprite
    'Elven': {'edge': 0.003, 'keel': 0.006, 'teeth': (0.016, 20), 'flutes': 7, 'trimlines': True, 'polish': True,
              'dark_trim': True, 'spirals': True, 'cloth_legs': True,
              'grade': {'legging': {'ramp': [[0.0, 15.0, 30.0, 50.0, 80.0, 120.0], [10.0, 35.0, 60.0, 90.0, 120.0, 150.0],
                                             *ELVEN_COPPER]},
                        'plate': {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0],
                                            [40.0, 78.0, 122.0, 164.0, 204.0, 238.0, 253.0]], 'colours': ELVEN_GOLD},
                        'shade': {'share': [[1.0, 50.0, 99.0], [40.0, 112.0, 175.0]], 'colours': ELVEN_GOLD},
                        'mail': {'share': [[1.0, 50.0, 99.0], [40.0, 100.0, 170.0]], 'colours': ELVEN_GOLD}}},
    # dwarven bronze up close in its sprite's own colours (DWARVEN_BRONZE), polished: its plate's light share for share
    # onto the bronze, its rims and lines (`dark_trim`) and the mail under its plates down in its browns; bold raised
    # bands round the vambrace and the greave (`bold_bands`), studded knuckles and riveted rows, as on its sprite; the
    # kick's leggings its violet under-cloth, its hue kept
    'Dwarven': {'under': ('cloth', (44, 30, 58)),   # the kick's leggings keep their violet up close
                'edge': 0.005, 'rivets': 14, 'knuckles': 'studs', 'stud': 0.005, 'polish': True, 'dark_trim': True,
                'bold_bands': True, 'cloth_legs': True,
                'grade': {'legging': {'lum': [[0.0, 10.0, 25.0, 50.0, 90.0, 255.0], [0.0, 40.0, 66.0, 95.0, 125.0, 200.0]]},
                          'plate': {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0],
                                              [50.0, 95.0, 130.0, 165.0, 195.0, 225.0, 250.0]],
                                    'colours': DWARVEN_BRONZE},
                          'shade': {'share': [[1.0, 50.0, 99.0], [50.0, 120.0, 172.0]], 'colours': DWARVEN_BRONZE},
                          'mail': {'share': [[1.0, 50.0, 99.0], [50.0, 110.0, 165.0]], 'colours': DWARVEN_BRONZE}}},
    # mithril up close polished, in Daggerfall's own mithril dye: its plate graded onto the band's upper half, where the
    # ramp runs from slate to steel blue, so none of it falls on the ramp's blacks but its deepest shadow
    'Mithril': {'edge': 0.0025, 'keel': 0.004, 'teeth': (0.008, 30), 'flutes': 9, 'trimlines': True, 'polish': True,
                'grade': {'plate': {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0],
                                              [80.0, 99.0, 119.0, 147.0, 174.0, 197.0, 220.0]]},
                          'mail': {'lum': [[0.0, 20.0, 60.0, 120.0, 200.0, 255.0], [87.0, 99.0, 110.0, 132.0, 162.0, 185.0]]}}},
    # adamantium up close polished as its sprite (ADAMANTIUM_STEEL), never grey: a mirror's dark and bright faces, its
    # plate down in the dark steels through half its light and up to the pale steels at its glints; a smooth bar over
    # the knuckles, its edges rolled; its kick's leggings its dark grey under-cloth
    'Adamantium': {'edge': 0.0045, 'keel': 0.005, 'knuckles': 'bar', 'polish': True,
                   'cloth_legs': True,
                   'grade': {'legging': {'lum': [[0.0, 10.0, 25.0, 50.0, 90.0, 255.0],
                                                 [0.0, 30.0, 48.0, 68.0, 90.0, 150.0]]},
                             'plate': {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0],
                                                 [50.0, 99.0, 142.0, 173.0, 207.0, 230.0, 244.0]],
                                       'colours': ADAMANTIUM_STEEL},
                             'shade': {'share': [[1.0, 50.0, 99.0], [50.0, 138.0, 207.0]], 'colours': ADAMANTIUM_STEEL},
                             'mail': {'share': [[1.0, 50.0, 99.0], [50.0, 124.0, 196.0]], 'colours': ADAMANTIUM_STEEL}}},
    # the knights' up close: bright plate in its own steels (KNIGHT_STEEL), never grey; a ridge over the knuckles,
    # blades off the vambrace, the kick's leggings its dark blue under-cloth
    'Knights': {'edge': 0.004, 'keel': 0.006, 'knuckles': 'ridge', 'polish': True, 'trimlines': True,
                'cloth_legs': True, 'section': ('facet', 10),   # a gauntlet up close keeps its ten faces
                'grade': {'legging': {'lum': [[0.0, 10.0, 25.0, 50.0, 90.0, 255.0],
                                              [0.0, 30.0, 48.0, 68.0, 90.0, 150.0]]},
                          'plate': {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0],
                                              [80.0, 130.0, 172.0, 200.0, 224.0, 240.0, 250.0]],
                                    'colours': KNIGHT_STEEL},
                          'shade': {'share': [[1.0, 50.0, 99.0], [70.0, 165.0, 224.0]], 'colours': KNIGHT_STEEL},
                          'mail': {'share': [[1.0, 50.0, 99.0], [70.0, 150.0, 214.0]], 'colours': KNIGHT_STEEL}}},
    # the fighters' up close: polished silver in its own steels (FIGHTERS_STEEL), lit high, never grey; a bar over the
    # knuckles, its edges rolled; the kick's leggings its dark blue under-cloth
    'Fighters': {'edge': 0.0045, 'keel': 0.005, 'knuckles': 'bar', 'polish': True, 'trimlines': True,
                 'cloth_legs': True,
                 'grade': {'legging': {'lum': [[0.0, 10.0, 25.0, 50.0, 90.0, 255.0],
                                               [0.0, 30.0, 48.0, 68.0, 90.0, 150.0]]},
                           'plate': {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0],
                                               [70.0, 118.0, 160.0, 188.0, 214.0, 234.0, 246.0]],
                                     'colours': FIGHTERS_STEEL},
                           'shade': {'share': [[1.0, 50.0, 99.0], [60.0, 150.0, 214.0]], 'colours': FIGHTERS_STEEL},
                           'mail': {'share': [[1.0, 50.0, 99.0], [60.0, 140.0, 205.0]], 'colours': FIGHTERS_STEEL}}},
    # ebony up close polished, in Daggerfall's own ebony dye: its plate low on the ramp, black through most of its light,
    # its rims and trim lines (`trimlines`) catching the ramp's dull grey, as the reference's silver edges do; blades
    # off the vambrace (`fins`), a ridge over the knuckles, the kick's leggings its dark under-cloth
    'Ebony': {'edge': 0.004, 'keel': 0.006, 'trimlines': True, 'polish': True, 'knuckles': 'ridge', 'cloth_legs': True,
              'grade': {'legging': {'lum': [[0.0, 10.0, 25.0, 50.0, 90.0, 255.0], [0.0, 26.0, 42.0, 60.0, 80.0, 140.0]]},
                        'plate': {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0],
                                            [24.0, 44.0, 67.0, 99.0, 132.0, 185.0, 220.0]]}}},
    # orcish up close in its sprite's dark olive (the orcish dye held low, `grade`): a vambrace in stepped lames, riveted,
    # its edges rolled; studs over the knuckles; the kick's leggings its dark leather
    'Orcish': {'edge': 0.0045, 'rivets': 10, 'keel': 0.004, 'stepped': True, 'knuckles': 'studs', 'stud': 0.0045,
               'cuff_rivets': 8, 'cloth_legs': True,
               'grade': {'legging': {'lum': [[0.0, 10.0, 25.0, 50.0, 90.0, 255.0], [0.0, 28.0, 44.0, 62.0, 84.0, 150.0]]},
                         'plate': {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0],
                                             [24.0, 44.0, 67.0, 99.0, 132.0, 162.0, 197.0]]}}},
    # the thieves' up close: its leather glove, a snug bracer strapped twice round, never flared open (`bracer`), its
    # sleeve and its kick's breeches its dark under-leather (`cloth_legs`)
    'Thieves': {'cloth_legs': True,
                'grade': {'legging': {'lum': [[0.0, 10.0, 25.0, 50.0, 90.0, 255.0], [0.0, 24.0, 38.0, 54.0, 72.0, 130.0]]}}},
    # the mages' up close: a dark brown glove and boots, as its sprite's, a snug bracer in the glove's leather laced
    # three times round in cream, a teal sleeve and breeches held light, as its coat is
    'Mages': {'cloth_legs': True, 'glove_leather': ((0.025, 0.012, 0.006), (0.07, 0.035, 0.017)),
              'boot_leather': ((0.025, 0.012, 0.006), (0.07, 0.035, 0.017)),
              'grade': {'legging': {'lum': [[0.0, 10.0, 25.0, 50.0, 90.0, 255.0], [0.0, 30.0, 46.0, 64.0, 86.0, 150.0]]},
                        # its leather onto the palette's dark browns, never the tan of skin; its laces a pale cream
                        'gauntlet': {'ramp': [[0.0, 255.0], [0.0, 255.0], [0.0, 30.0, 70.0, 140.0, 255.0],
                                              [[24, 16, 10], [40, 27, 16], [58, 39, 24], [78, 54, 33], [100, 72, 45]]]},
                        'boot': {'ramp': [[0.0, 255.0], [0.0, 255.0], [0.0, 30.0, 70.0, 140.0, 255.0],
                                          [[22, 14, 9], [38, 25, 15], [54, 36, 22], [72, 50, 31], [94, 66, 41]]]},
                        'strap': {'ramp': [[0.0, 255.0], [0.0, 255.0], [0.0, 15.0, 35.0, 60.0, 255.0],
                                           [[90, 78, 60], [120, 104, 80], [150, 132, 100], [172, 152, 116],
                                            [190, 170, 130]]]}}},
    # the brotherhood's up close: a black glove, a snug crimson bracer banded black, a black sleeve and breeches, and
    # crimson boots; its leathers linear colours, dark and lit (`glove_leather`, `boot_leather`)
    'Brotherhood': {'cloth_legs': True, 'glove_leather': ((0.012, 0.01, 0.01), (0.05, 0.045, 0.045)),
                    'boot_leather': ((0.07, 0.008, 0.006), (0.2, 0.025, 0.018)),
                    # its glove onto the palette's near-blacks, its crimson onto its dark reds, as its sprite's are
                    'grade': {'legging': {'lum': [[0.0, 10.0, 25.0, 50.0, 90.0, 255.0],
                                                  [0.0, 16.0, 26.0, 38.0, 52.0, 110.0]]},
                              'gauntlet': {'ramp': [[0.0, 255.0], [0.0, 255.0], [0.0, 30.0, 70.0, 140.0, 255.0],
                                                    [[14, 12, 12], [24, 20, 20], [38, 32, 32], [58, 50, 48], [82, 72, 68]]]},
                              'boot': {'ramp': [[0.0, 255.0], [0.0, 255.0], [0.0, 22.0, 48.0, 90.0, 150.0, 255.0],
                                                [[22, 12, 10], [56, 30, 24], [74, 39, 27], [83, 32, 10], [102, 33, 1],
                                                 [130, 22, 0]]]}}},
    # daedric up close blackened as its sprite (DAEDRIC_BLACK), never grey: its plate black through most of its light,
    # its rims and lines in a plate of their own graded up to its warm greys (`own_trim`), so they catch a pale light
    # over the black as its sprite's rims do; its seams the sprite's dull deep red; its kick's leggings its dark red
    # under-cloth
    'Daedric': {'keel': 0.014, 'section': ('facet', 20), 'teeth': (0.02, 14), 'knuckles': 'spikes', 'own_trim': True,
                'cloth_legs': True,
                'grade': {'legging': {'lum': [[0.0, 10.0, 25.0, 50.0, 90.0, 255.0], [0.0, 30.0, 52.0, 78.0, 104.0, 170.0]]},
                          'plate': {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0],
                                              [30.0, 80.0, 120.0, 155.0, 190.0, 218.0, 238.0]],
                                    'colours': DAEDRIC_BLACK},   # its broad lit faces a dark warm grey, never pale
                          'shade': {'share': [[1.0, 50.0, 99.0], [168.0, 230.0, 254.0]], 'colours': DAEDRIC_BLACK},
                          'mail': {'share': [[1.0, 50.0, 99.0], [30.0, 110.0, 175.0]], 'colours': DAEDRIC_BLACK}}},
}
# how much of the body each culture covers, past its breastplate: its arms ('full' rerebraces and couters, 'couter'
# the elbow's cop alone, 'short' mail to above the elbow, None bare), its tassets and its cuisses, and whether its
# padding leaves the arms bare. Daggerfall's own armoured folk show bare arms and cloth thighs between their plates;
# only the heaviest sets close up
CLOSE_UP['Brotherhood']['grade']['strap'] = CLOSE_UP['Brotherhood']['grade']['boot']   # its bracer's crimson its boot's

FULL = {'arms': 'full', 'tassets': True, 'cuisse': True, 'bare_arms': False}
COVERAGE = {'Leather': {'arms': None, 'tassets': False, 'cuisse': False, 'bare_arms': True},
         'Chain': {'arms': 'short', 'cuisse': False, 'bare_arms': True},
         'Iron': {'cuisse': False, 'tassets': False},
         'Steel': {'cuisse': False, 'tassets': False},
         'Silver': {'arms': None, 'tassets': False, 'cuisse': False, 'bare_arms': True},
         'Elven': {'cuisse': False, 'tassets': False},
         'Orcish': {'arms': None, 'cuisse': False, 'bare_arms': False},
         'Thieves': {'arms': None, 'tassets': False, 'cuisse': False, 'bare_arms': False},
         'Brotherhood': {'arms': None, 'tassets': False, 'cuisse': False, 'bare_arms': False},
         'Mages': {'arms': None, 'tassets': False, 'cuisse': False, 'bare_arms': False},
         'Fighters': {}, 'Knights': {}}
for _m in STYLE:
    STYLE[_m] = {**FULL, **COVERAGE.get(_m, {}), **STYLE[_m], 'set': _m}   # its name picks its makes (armourmakes.py)

# The metal is drawn grey and the game lays the set's own Daggerfall ramp on it (forgeLayers.js; the armour dye
# tables, src/characters/dyes.js), as Daggerfall dyes a sprite's metal band: a set's colour is its ramp's. Each
# culture's finish is its plate's grey, its roughness and its trim's grey against its plate's: iron and orcish
# matte, their trim dark; silver, elven and ebony keen, their trim bright; dwarven's trim darker than its plate;
# daedric's far brighter, so its rims and its mask's beak catch a pale light over black plate; adamantium's darker,
# for the lames under its breastplate (`dark_belly`). Mithril's and orcish's ramps end in a run of blacks, so their
# plate is lit higher up its ramp, its colour showing past its shadows; ebony's is graded down its own (`SET_GRADE`). A fourth, where a set has one, is its
# shade plate's grey against its plate's: silver's breastplate and cheek plates, dark as the medium fighter's under his
# bright crown and shoulders. Mithril's and adamantium's are brighter than their plate: a polished breastplate high on
# its ramp over the lames under it.
# A fifth is the shade plate's own roughness: steel's breastplate a soft dark sheen, so its carving's lit tops read
# and no gloss blooms across its top
FINISH = {'Leather': (0.4, 0.4, 1.0), 'Chain': (0.4, 0.4, 1.0), 'Iron': (0.4, 0.32, 1.3),
          'Steel': (0.4, 0.5, 1.3, 0.8, 0.85), 'Silver': (0.4, 0.42, 1.45, 0.5, 0.6), 'Elven': (0.35, 0.32, 0.55),
          'Dwarven': (0.4, 0.26, 0.6), 'Mithril': (0.6, 0.18, 1.3, 1.35), 'Adamantium': (0.42, 0.26, 0.7, 1.2),
          'Ebony': (0.5, 0.2, 1.4, 0.6), 'Orcish': (0.45, 0.3, 1.3), 'Thieves': (0.4, 0.4, 1.0), 'Brotherhood': (0.4, 0.4, 1.0),
          'Mages': (0.4, 0.4, 1.0), 'Fighters': (0.5, 0.24, 1.2), 'Knights': (0.55, 0.2, 1.25),
          'Daedric': (0.45, 0.22, 1.25, 0.5, 0.4)}
# the plate's light, share for share (our steel's at those shares), onto the brightness Daggerfall's guard draws
# his armour's greys at (TEXTURE.399's walk): half of it in the blacks under the metal band, a tenth climbing past
# the band's middle, its brightest tops near white
METAL_GRADE = {'lum': [[37.0, 81.0, 135.0, 169.0, 195.0, 213.0, 255.0], [19.0, 19.0, 19.0, 38.0, 67.0, 119.0, 220.0]]}
# the steel band's sixteen steps, darkest first (ART_PAL.COL 0x7f..0x70): the band the game lays a metal's ramp on.
# A texel lands on its nearest step, drawn grey at that step (16 of grey a step) for the dye to read; darker than the
# band's foot it is shadow, kept at its own brightness in the palette's blacks, which no dye touches
STEEL_BAND = (44, 51, 58, 67, 78, 87, 99, 110, 119, 132, 147, 162, 174, 185, 197, 220)
METAL_SHADOW = 41
# the armour's mail's light (`armourmail`) share for share onto the greys Daggerfall's medium fighter's mail legs are
# drawn in (TEXTURE.488): its rings bright, the gaps between them dark, never half lost in shadow as the plate's grade
# would leave it
MAIL_GRADE = {'lum': [[16.0, 54.0, 74.0, 99.0, 128.0, 164.0, 255.0], [19.0, 19.0, 31.0, 53.3, 99.0, 147.0, 220.0]]}
# a set's own grades, by class, over those for its layers alone (layers.py). Silver's ramp starts at a light blue-grey,
# so what the grades leave under the band would jump from light silver to black: its mail is kept on the band, and its
# plate's mid shade, so only its deepest shadow is black
SET_GRADE = {'Silver': {
    'armourmail': {'lum': [[16.0, 54.0, 74.0, 99.0, 128.0, 164.0, 255.0], [19.0, 44.0, 51.0, 67.0, 110.0, 162.0, 220.0]]},
    'metal': {'lum': [[37.0, 81.0, 135.0, 169.0, 195.0, 213.0, 255.0], [19.0, 19.0, 44.0, 58.0, 87.0, 147.0, 220.0]]}},
    # elven gold in its own colours (ELVEN_GOLD), not the dye's: Daggerfall's elven ramp is silver's pale white.
    # Never grey, so the game lays no dye on it
    'Elven': {'metal': {'ramp': ELVEN_GOLD},
              # its belt and tunic on the palette's copper (ELVEN_COPPER), which its leather's own hue, lifted by
              # the leather grade, washed to salmon
              'leather': {'ramp': ELVEN_COPPER}},
    # dwarven bronze in its own colours (DWARVEN_BRONZE), not the dye's lemon: never grey, so no dye touches it
    'Dwarven': {'metal': {'ramp': DWARVEN_BRONZE}},
    # daedric blackened in its own colours (DAEDRIC_BLACK), not the dye's bright red
    'Daedric': {'metal': {'ramp': DAEDRIC_BLACK}},
    # adamantium polished steel in its own colours (ADAMANTIUM_STEEL), Daggerfall's adamantium blue-greys carried up
    'Adamantium': {'metal': {'ramp': ADAMANTIUM_STEEL}},
    # the fighters' polished silver in its own colours (FIGHTERS_STEEL), never grey for the dye
    'Knights': {'metal': {'ramp': KNIGHT_STEEL},
                'leather': {'lum': [[0.0, 5.0, 31.0, 48.0, 60.0, 70.0, 85.0, 103.0, 255.0],
                                    [0.0, 10.0, 16.0, 26.0, 38.0, 50.0, 64.0, 80.0, 150.0]]}},
    'Fighters': {'metal': {'ramp': FIGHTERS_STEEL},
                 # its straps and belt a dark red-brown, held low so they never run to orange
                 'leather': {'lum': [[0.0, 5.0, 31.0, 48.0, 60.0, 70.0, 85.0, 103.0, 255.0],
                                     [0.0, 10.0, 16.0, 26.0, 38.0, 50.0, 64.0, 80.0, 150.0]]}},
    # mithril in Daggerfall's own mithril dye, its light onto the band's upper half, where that ramp turns from slate
    # to steel blue: most of it the slate blues of the ramp's middle, so its polished breastplate (its brighter shade
    # plate, `FINISH`) and its glints alone reach the bright blue; only its deepest shadow on the ramp's blacks
    # the thieves' leather dark as the reference's, its light held low: a dark brown its lit faces lift to a worn tan
    'Thieves': {'leather': {'lum': [[0.0, 5.0, 31.0, 48.0, 60.0, 70.0, 85.0, 103.0, 255.0],
                                    [0.0, 9.0, 14.0, 22.0, 33.0, 46.0, 62.0, 82.0, 165.0]]}},
    # the mages' teal cloth and brown trim held lower than leather's own grade, a muted sea green, its trim a dark
    # brown that never reads as skin
    'Mages': {'leather': {'lum': [[0.0, 5.0, 31.0, 48.0, 60.0, 70.0, 85.0, 103.0, 255.0],
                                  [0.0, 12.0, 19.0, 30.0, 44.0, 58.0, 74.0, 92.0, 170.0]]}},
    # the brotherhood's black leather and deep crimson held low as the thieves' leather, so the crimson stays dark
    'Brotherhood': {'leather': {'lum': [[0.0, 5.0, 31.0, 48.0, 60.0, 70.0, 85.0, 103.0, 255.0],
                                        [0.0, 9.0, 14.0, 22.0, 33.0, 46.0, 62.0, 82.0, 165.0]]},
                    # its crimson onto the palette's own dark reds (ART_PAL.COL 252, 251, 249, 247): a deep red-brown
                    # through most of its light, crimson only on its brightest few texels, never the bright reds
                    'crimson': {'ramp': [[10.0, 30.0, 50.0, 70.0, 92.0, 115.0, 255.0],
                                         [[30, 18, 16], [56, 30, 24], [74, 39, 27], [83, 32, 10], [102, 33, 1],
                                          [130, 22, 0], [130, 22, 0]]]}},
    # ebony in Daggerfall's own ebony dye, its light up the band, so its black plate shows its shape in the ramp's dull
    # greys and its rims and glints reach the ramp's top; only its shadow on the ramp's blacks
    'Ebony': {'metal': {'lum': [[30.0, 95.0, 180.0, 206.0, 225.0, 240.0, 250.0, 255.0],
                                [19.0, 30.0, 72.0, 110.0, 140.0, 197.0, 220.0, 220.0]]}},
    # orcish in Daggerfall's own orcish dye held low on its ramp: most of its light on the dark olives over its greys,
    # so it reads as old dark bronze; only its rims and glints reach the ramp's green
    'Orcish': {'metal': {'lum': [[30.0, 95.0, 160.0, 200.0, 225.0, 242.0, 255.0],
                                 [19.0, 35.0, 72.0, 110.0, 140.0, 175.0, 197.0]]}},
    'Mithril': {'metal': {'lum': [[24.0, 72.0, 120.0, 184.0, 232.0, 250.0, 255.0],
                                  [44.0, 80.0, 99.0, 119.0, 147.0, 185.0, 220.0]]}}}
# the armour's leather onto Daggerfall's, share for share: its boots run from the ramp's darkest to a lit tan, where
# a matte render's leather sits in a narrow middle (raw brightness at each share, then Daggerfall's at the same share)
LEATHER_GRADE = {'lum': [[0.0, 5.0, 31.0, 48.0, 60.0, 70.0, 85.0, 103.0, 255.0],
                         [0.0, 16.0, 24.0, 38.0, 64.0, 90.0, 115.0, 140.0, 220.0]]}
# the armour's mail (`armourmail`, its own grade): a fine lattice, as Daggerfall dithers its mail, its rings only a
# little brighter than its gaps, so the light on the form leads and the rings break it up, where black gaps under
# white rings read as a chessboard in any light. Its cells are counted round each part's own axis, so a limb, under
# half the torso's girth, takes under half as many round it, else its rings fall under a pixel
MAIL_TONES = ((0.11, 0.11, 0.12), (0.30, 0.30, 0.33))
MAIL_ROUND = {'body': 11.0, 'limb': 5.0}
MAIL_ROWS = 95.0
LIMBS = ('uarm_', 'farm_', 'thigh_', 'shin_', 'foot_')
SPECK = 40   # a texel this much brighter or darker than every one round it is a speck (a band's step is about 10)
FUR = (96, 78, 58)
LEATHER = (84, 50, 28)
STRAP = (56, 36, 22)
DARK = (18, 16, 18)
BONE = (206, 182, 136)   # a horn's or a tusk's, as Daggerfall's horned helms carry them: never metal
UNDER_PUSH = 0.0025   # the under-suit off the skin
YOKE_PUSH = 0.006   # the yoke and collar off the skin: out past the under-suit, in under the cuirass's rings
NECK_FOOT = 0.015   # how far over the neck's joint the under-suit reaches: the collar (`yoke`) covers the neck
SKIRT_PUSH = 0.007    # the mail skirt off the under-suit at the waist, hanging looser down the thighs


def palette(material, M):
    """The materials a set wears by role, each named for the palette's own so the fitter and the grade read it as
    what it stands for: plate, trim, strap, fur, glow (daedric's; else the trim), mail, leather, the dark of a
    visor's slit and a sole, and what the set wears under it. Its metal (`metal.*`: plate, trim, mail) is grey."""
    lin = metals._linear
    plate, rough, trim, *shade = FINISH[material]

    def grey(role, g, r=None):
        # mostly lit plate under a soft sheen, as Daggerfall shades it: a plate facing the key light takes it, and a
        # highlight blooms on what curves toward it, where a mirror's would show only the dark stage
        return materials.plain(f'metal.{material}.{role}', (g, g, g), metal=0.15, rough=r or rough, spec=0.6)
    S = STYLE[material]
    coat = fabric.cloth if S.get('cloth') else fabric.leather   # the mages' coat is cloth, trimmed in leather
    out = {'leather': coat(f'leather.{material}', lin(S.get('leather_colour', LEATHER)), rough=0.72, spec=0.3),
           # a set's straps and trim in leather, or a crimson leather graded on its own (`crimson`, the brotherhood's)
           'strap': fabric.leather(f'crimson.{material}' if S.get('crimson') else f'leather.{material}.strap',
                                   lin(S.get('strap_colour', STRAP)), rough=0.65, spec=0.35, mottle=0.1, grain=0.0),
           'fur': materials.plain(f'leather.{material}.fur', lin(STYLE[material].get('fur_colour', FUR)), rough=0.98,
                                  spec=0.05),
           'dark': materials.plain(f'leather.{material}.dark', lin(DARK), rough=0.9, spec=0.1),
           'horn': materials.plain(f'horn.{material}', lin(BONE), rough=0.45, spec=0.4),
           'mail': materials.chain(f'armourmail.{material}', *MAIL_TONES, around=MAIL_ROUND['body'], rows=MAIL_ROWS),
           'mail_limb': materials.chain(f'armourmail.{material}.limb', *MAIL_TONES, around=MAIL_ROUND['limb'],
                                        rows=MAIL_ROWS)}   # graded as Daggerfall's mail legs are (MAIL_GRADE)
    if S.get('kind') == 'leather':
        out['plate'], out['trim'] = out['leather'], out['strap']
        if S.get('seam'):   # its buckles and clasps (the thieves' brass), in their own colour
            out['glow'] = materials.plain(f'seam.{material}', lin(S['seam'][0]), metal=0.6, rough=0.35, spec=0.6)
            b = out['glow'].node_tree.nodes['Principled BSDF']
            b.inputs['Emission Color'].default_value = (*lin(S['seam'][0]), 1)
            b.inputs['Emission Strength'].default_value = S['seam'][1]
    elif material == 'Chain':
        out['plate'], out['trim'] = out['mail'], out['strap']
    else:
        out['plate'], out['trim'] = grey('plate', plate), grey('trim', min(plate * trim, 0.9))
        if shade:   # plate darker than the rest: the medium fighter's breastplate and cheek plates, under bright
            # pauldrons and a bright crown
            out['shade'] = grey('shade', plate * shade[0], shade[1] if len(shade) > 1 else None)
        seam = STYLE[material].get('seam')   # (colour, its glow): a deep red under the plates, dimly lit (daedric's)
        glow = None if seam else metals.LOOK.get(material, {}).get('glow')
        if seam:   # its own material, ungraded: the colour it is, a little light of its own so it shows in shadow
            out['glow'] = materials.plain(f'seam.{material}', lin(seam[0]), rough=0.6, spec=0.2)
            b = out['glow'].node_tree.nodes['Principled BSDF']
            b.inputs['Emission Color'].default_value = (*lin(seam[0]), 1)
            b.inputs['Emission Strength'].default_value = seam[1]
        if glow:   # past any lamp's light, and never grey, so no dye touches it
            out['glow'] = materials.plain(f'edge.{material}.glow', lin(glow), rough=0.5)
            b = out['glow'].node_tree.nodes['Principled BSDF']
            b.inputs['Emission Color'].default_value = (*lin(glow), 1)
            b.inputs['Emission Strength'].default_value = 6.0
    out.setdefault('glow', out['trim'])
    out.setdefault('shade', out['plate'])
    under = STYLE[material].get('under', 'mail')
    out['under'] = (out[under] if isinstance(under, str) else
                    fabric.leather(f'leather.{material}.under', lin(under[1]), rough=0.7, spec=0.3)
                    if under[0] == 'leather' else
                    fabric.cloth(f'leather.{material}.under', lin(under[1]), rough=0.88, spec=0.15))
    sash = STYLE[material].get('sash')   # the belt in cloth (dwarven's violet), else the straps' leather
    out['sash'] = fabric.cloth(f'leather.{material}.sash', lin(sash), rough=0.85, spec=0.15) if sash else out['strap']
    out['facets'] = STYLE[material].get('section', ('round',))[0] == 'facet'
    return out


def _mats(mat):
    return [mat[k] for k in SLOTS]


class Fit:
    """What a set is fitted to: the shaped body's outline by region, and the set's hand."""

    def __init__(self, body, style, close=None, woman=False):
        self.body, self.woman = body, woman
        self.close = {**style, **(close or {})}   # the style with its close-up detail (the pauldrons keep theirs)
        self.piece = np.array(anatomy.PIECES)[np.argmax(body.alpha, axis=1)]
        self.O = Outline(body.rest, self.piece)
        self.s = style
        self.kind = style.get('kind', 'plate')
        self.material = None   # the set's name, which picks its own makes (armourmakes.py), set by `dress`
        self._seen = {}

    def outline(self, region, z, axis=2, dz=0.014):
        key = (tuple(region), round(float(z), 3), axis, dz)
        if key not in self._seen:
            self._seen[key] = self.O.at(region, z, dz, axis=axis)
        return self._seen[key]

    def shoulder(self, side):
        """The shoulder's bounds at rest, (low corner, high corner): across, the torso's flank out to the arm's top;
        front to back, the arm's own depth a little over. The chest's flank runs deeper than the shoulder, so a
        pauldron measured on it stood twice the shoulder's depth, swollen seen from the side."""
        x = 1.0 if side == 'L' else -1.0
        p = self.body.rest
        arm = (self.piece == f'arm_{side}') & (p[:, 2] > 1.30)
        sel = arm | ((self.piece == 'torso') & (p[:, 0] * x > 0.15) & (p[:, 2] > 1.34))
        lo, hi = p[sel].min(axis=0), p[sel].max(axis=0)
        lo[1], hi[1] = p[arm][:, 1].min() - 0.015, p[arm][:, 1].max() + 0.015
        return lo, hi

    def shape(self, th, r, keel_h=None, facing=-math.pi / 2):
        sec = self.s.get('section', ('round',))
        if sec[0] == 'square':
            r = squared(th, r, sec[1])
        elif sec[0] == 'facet':
            r = faceted(th, r, sec[1])
        k = self.s.get('keel', 0.0) if keel_h is None else keel_h
        return r + keel(th, k, 0.45, facing)

    def rings(self, region, ats, gap, th=None, keel_h=None, facing=-math.pi / 2, axis=2, bulge=None, top=None,
              foot=None, dz=0.014):
        """A plate's outer surface over `region`, a row a station `ats` along `axis` (heights, top first, or places
        along Y), a column a direction `th`: the body's outline pushed out by `gap` (a number, or one a station) and
        by `bulge(at, th)`, shaped by the culture's hand. `top(th)` raises its first row's line and `foot(th)` lowers
        its last's, each fading across the rows, and the outline is read where each point lands."""
        full = angles(self.O.n)
        t = full if th is None else np.asarray(th, float)
        n = len(ats)
        rows = []
        for i, z in enumerate(ats):
            w = np.full(len(t), float(z))
            if top is not None:
                w = w + top(t) * (1 - i / max(n - 1, 1))
            if foot is not None:
                w = w - foot(t) * (i / max(n - 1, 1))
            g = gap(z) if callable(gap) else gap
            cu, cv, rr = np.zeros(len(t)), np.zeros(len(t)), np.zeros(len(t))
            for level in np.unique(np.round(w, 3)):
                at = np.round(w, 3) == level
                c, r = self.outline(region, level, axis, dz)
                cu[at], cv[at] = c[0], c[1]
                rr[at] = np.interp(np.mod(t[at], TAU), full, r, period=TAU)
            rr = self.shape(t, rr + g + (bulge(z, t) if bulge else 0.0), keel_h, facing)
            u, v = cu + rr * np.cos(t), cv + rr * np.sin(t)
            rows.append(np.stack([u, v, w], axis=1) if axis == 2 else np.stack([u, w, v], axis=1))
        return np.array(rows)

    def band(self, region, zs, gap, th=None, keel_h=None, facing=-math.pi / 2, toothed=False, bulge=None, top=None,
             hem=None):
        """`rings` round heights `zs`, its foot toothed by the culture's teeth if `toothed`, and lowered by `hem(th)`
        (raised where it is less than nought)."""
        tooth = (lambda t: teeth(t, *self.s['teeth'])) if toothed and self.s.get('teeth') else None
        foot = tooth if hem is None else hem if tooth is None else (lambda t: hem(t) + tooth(t))
        return self.rings(region, zs, gap, th, keel_h, facing, bulge=bulge, top=top, foot=foot)


def _out(grid, row, by=0.0, axis=2):
    """A row of a plate's surface, and each point's way out of it (from the row's middle, across `axis`)."""
    pts = np.asarray(grid[row], float)
    o = pts - pts.mean(axis=0)
    o[:, axis] = 0
    o /= np.maximum(np.linalg.norm(o, axis=1, keepdims=True), 1e-9)
    return pts + o * by, o


def _edge(mesh, grid, row, radius, slot=S_TRIM, closed=True):
    pts, _ = _out(grid, row, radius * 0.6)
    tube(mesh, pts, radius, slot, n=6, closed=closed)


def _rim(mesh, grid, radius, slot=S_TRIM):
    """A rolled edge all round an open plate: its top row, its far side, its foot, its near side."""
    g = np.asarray(grid, float)
    loop = np.concatenate([g[0], g[1:, -1], g[-1, -2::-1], g[-2:0:-1, 0]])
    tube(mesh, loop, radius, slot, n=5, closed=True)


def _rivets(mesh, grid, row, count, radius=0.0055, slot=S_TRIM, inset=0.6):
    pts, o = _out(grid, row)
    nxt, _ = _out(grid, min(row + 1, len(grid) - 1))
    for k in np.linspace(0, len(pts) - 1, count, endpoint=False).astype(int):
        dome(mesh, pts[k] * inset + nxt[k] * (1 - inset), radius, o[k], slot)


def _lames(fit, mesh, region, top, bottom, count, gap, th=None, step=0.002, facing=-math.pi / 2, rows=3, hem=None,
           studs=0, crown=None, slot=S_PLATE):
    """`count` lames from `top` down to `bottom`, each a little wider than the one above and over its foot, each its
    own solid, its foot rolled (or toothed), the last's foot lowered by `hem(th)`, the first's top by `crown(th)` (to
    sit under a breastplate drawn to a point), `studs` round each. More `rows` follow the body closer."""
    h = (top - bottom) / max(count, 1)
    for k in range(count):
        g = fit.band(region, np.linspace(top - k * h + 0.012, top - (k + 1) * h, rows), gap + step * (k + 1), th=th,
                     toothed=True, facing=facing, hem=hem if k == count - 1 else None,
                     top=(lambda t: -crown(t)) if crown and k == 0 else None)
        solid(mesh, g, fit.s.get('thick', 0.007), slot, closed=th is None)
        if fit.s.get('edge'):
            _edge(mesh, g, len(g) - 1, fit.s['edge'] * 0.8, closed=th is None)
        if studs:
            _rivets(mesh, g, len(g) // 2, studs * 2, 0.0085, S_PLATE)   # half of them behind, round the lame
    return h


def _hang_all(parts, mat, items, fit=None):
    """Each (name, mesh, joint) one object hung on its joint, its edges split sharp where the culture's plate turns:
    the faceted cultures' at every facet. With `fit`, a piece on the torso's joints bends with the torso (`_bend`)."""
    split = 0.3 if mat.get('facets') else 0.55
    limb = {**mat, 'mail': mat.get('mail_limb', mat['mail'])}
    for name, mesh, joint in items:
        if mesh:
            ob = mesh.object(name, _mats(limb if joint.startswith(LIMBS) else mat), split)
            fabric.mark(ob.data)   # where it lies on the body at rest, before it is hung on its joint
            hang(parts, ob, joint)
            if fit is not None and joint in TORSO:
                _bend(fit, ob, joint)


TORSO = ('pelvis', 'spine', 'chest')   # the joints a cuirass's rings bend with


def _bend(fit, ob, joint):
    """`ob`, hung on `joint`, bent with the torso as the skin under it is: each vertex weighted over the pelvis, the
    spine and the chest as its nearest skin is, the rest of its weight on its own joint. Each ring meets the next
    between two joints, so hung rigidly a lean or a twist lifts one off the next and the padding shows between."""
    from scipy.spatial import cKDTree
    body = fit.body
    torso = np.flatnonzero(fit.piece == 'torso')
    at = coords(ob.data) + rest(joint)
    near = torso[cKDTree(body.rest[torso]).query(at)[1]]
    w = body.w[near][:, [body.joints.index(j) for j in TORSO]]
    w[:, TORSO.index(joint)] += np.clip(1.0 - w.sum(axis=1), 0.0, None)   # an arm's or the neck's share stays put
    BENT[ob.name] = (at, TORSO, w, np.array([rest(j) for j in TORSO]))


def _bump(z, z0, half):
    """1 at `z0`, falling smoothly to 0 `half` either side."""
    return np.cos(np.clip((np.asarray(z, float) - z0) / half, -1, 1) * math.pi / 2) ** 2


def _toward(t, at, width):
    """1 facing `at`, falling smoothly to 0 `width` radians off it."""
    d = np.abs((np.asarray(t, float) - at + math.pi) % TAU - math.pi)
    return np.cos(np.clip(d / width, 0, 1) * math.pi / 2) ** 2


def _plateau(x, at, half, edge, angle=False, above=None):
    """1 within `half` of `at`, falling to 0 over `edge` past it: a carved block's face and its steep side; `above`
    the side's width past it upward, where it differs. An `angle` is measured the short way round."""
    d = np.asarray(x, float) - at
    if angle:
        d = (d + math.pi) % TAU - math.pi
    e = edge if above is None else np.where(d > 0, above, edge)
    return np.clip((half + e - np.abs(d)) / e, 0.0, 1.0) ** 1.5


def _relief(s, front, woman=False):
    """The breastplate's relief: a muscled breast as Daggerfall draws its armoured folk, the chest's two broad masses
    over two rows of the belly's, each the size a sprite shows, `muscle` deep. A plain culture's (Daggerfall's
    guard's) is carved: the pecs and three rows of abs as blocks, steep-sided, so the light lays a bright edge on
    each one's top and a dark groove under it; on the woman the abs alone, her breastplate shaped by her own form.
    None for a plain plate."""
    m = s.get('muscle', 0.0)
    if not m:
        return None
    if s.get('plain'):
        bevel = s.get('bevel')   # each block's top side this broad, so the light lays a line on it and not a speck
        w = s.get('abs_wide', 1.0)   # the abs' columns this much wider, each a few pixels across

        def carved(z, t):
            pecs = 0.0 if woman else (0.022 * m * _plateau(z, 1.385, 0.042 - (bevel or 0) / 3, 0.016, above=bevel)
                                      * (_plateau(t, front - 0.5, 0.36, 0.1, True) + _plateau(t, front + 0.5, 0.36, 0.1, True)))
            belly = sum(0.02 * m * _plateau(z, zz, 0.019 - (bevel or 0) / 3, 0.01, above=bevel)
                        * (_plateau(t, front - 0.21 * w, 0.1 * w, 0.05 * w, True)
                           + _plateau(t, front + 0.21 * w, 0.1 * w, 0.05 * w, True))
                        for zz in (1.282, 1.214, 1.146))
            return pecs + belly
        return carved

    def muscle(z, t):   # each mass narrow enough that a groove lies dark between it and the next
        pecs = 0.028 * m * _bump(z, 1.365, 0.075) * (_toward(t, front - 0.5, 0.42) + _toward(t, front + 0.5, 0.42))
        belly = sum(0.013 * m * _bump(z, zz, 0.032) * (_toward(t, front - 0.19, 0.15) + _toward(t, front + 0.19, 0.15))
                    for zz in (1.262, 1.198, 1.14))
        return pecs + belly
    return muscle


def _lit_tops(grid, th, sculpt, base, rise=0.4):
    """A slot for each face of a carved plate's surface: the trim's where the carving rises going down it (a block's
    top side, which the light from above catches), else `base`. Picked out so, the edge reads as a line of light."""
    z = np.asarray(grid, float)[..., 2]
    up = sculpt(z, np.asarray(th, float)[None, :])
    gain = (up[1:] - up[:-1]) / np.maximum(z[:-1] - z[1:], 1e-6)   # the bulge gained a metre down, row to row
    gain = (gain + np.roll(gain, -1, axis=1)) / 2
    return np.where(gain > rise, S_TRIM, base)


# -- under it all

def undersuit(fit, mat):
    """What the set wears under its plate, the body's own surface a few millimetres out from the neck to the toes:
    mail, leather, or a padded cloth; where the culture goes bare-armed, over the shoulders' tops alone, under the
    pauldrons."""
    body = fit.body
    mask = (fit.piece != 'skull') & ~np.char.startswith(fit.piece.astype(str), 'barefoot')   # boots cover the feet
    if fit.s['bare_arms']:
        arm = np.char.startswith(fit.piece.astype(str), 'arm_')
        mask &= ~(arm & (body.rest[:, 2] < arm_z(1.36)))
    mask &= ~((fit.piece == 'torso') & (body.rest[:, 2] > rest('neck')[2] + NECK_FOOT))   # to the neck's foot alone
    if fit.s.get('neckline'):   # open as deep as the breastplate's, a little wider, so none of it shows at the cut
        p = body.rest
        torso = fit.piece == 'torso'
        depth, half = fit.s['neckline']
        c, r = fit.outline(['torso'], 1.38)
        t = -math.pi / 2 + half
        width = abs(np.interp(t % TAU, angles(len(r)), r, period=TAU) * math.cos(t)) * 1.1   # its corner's x
        top = min(1.5, p[torso, 2].max())
        mask &= ~(torso & (p[:, 1] < c[1]) & (p[:, 2] > top - (depth + 0.01)
                                               * np.clip(1 - np.abs(p[:, 0] - c[0]) / width, 0, 1)))
    sub = body.alpha[mask]

    def axis(p):   # the limb's own axis under the mail's lattice, blended where pieces meet
        return sum((sub[:, k:k + 1] * ax(p) for k, ax in enumerate(body.axes) if ax is not None), 0.0 * p)
    out = body.shell('armour_under', mat['under'], mask, UNDER_PUSH, axis=axis)
    fabric.mark(out.me, out.rest)
    return out


def yoke(fit, mat):
    """The cuirass's yoke and collar: the set's own plate, mail or leather over the shoulders' tops and up the neck
    to the jaw, the body's surface a little out past the under-suit, so it moves with the shoulders and the head. The
    breastplate and its back meet there under the pauldrons; with none worn, no padding or skin shows between the helm
    and the armour."""
    body = fit.body
    z = body.rest[:, 2]
    arm = np.char.startswith(fit.piece.astype(str), 'arm_')
    mask = ((fit.piece == 'torso') & (z > 1.38)) | (arm & (z > arm_z(1.36)))   # the arms as high as bare arms' padding
    sub = body.alpha[mask]

    def axis(p):
        return sum((sub[:, k:k + 1] * ax(p) for k, ax in enumerate(body.axes) if ax is not None), 0.0 * p)
    return body.shell('armour_yoke', mat['mail'] if fit.kind == 'chain' else mat['plate'], mask, YOKE_PUSH, axis=axis)


def mailskirt(fit, mat):
    """A skirt of mail under the plate from the waist to mid-thigh, hanging looser as it falls: the body's own
    surface over the hips and the thighs' tops, out past the under-suit, so it moves with the legs."""
    body = fit.body
    z = body.rest[:, 2]
    leg = np.char.startswith(fit.piece.astype(str), 'leg_')
    mask = ((fit.piece == 'torso') & (z < 1.06)) | (leg & (z > 0.74))
    push = SKIRT_PUSH + 0.05 * np.clip(1.02 - z, 0.0, None)
    sub = body.alpha[mask]

    def axis(p):
        return sum((sub[:, k:k + 1] * ax(p) for k, ax in enumerate(body.axes) if ax is not None), 0.0 * p)
    return body.shell('armour_skirt', mat['mail'], mask, push, axis=axis)


# -- the cuirass

def cuirass(parts, fit, mat):
    """The cuirass: the breastplate and backplate one shell on the chest, a plackart over its foot, the lames under
    it on the spine, the fauld on the pelvis, tassets on the thighs, rerebraces and couters on the arms; and what the
    culture lays on them. Chain is a hauberk to mid-thigh with its sleeves; leather is studded, belted and strapped."""
    s, kind = fit.s, fit.kind
    gap, thick = s.get('gap', 0.02), s.get('thick', 0.007)
    chest, spine, pelvis = Mesh(), Mesh(), Mesh()
    torso = ['torso']
    front = -math.pi / 2
    if kind == 'chain':
        g = fit.band(torso, np.linspace(1.48, 1.18, 8), gap)
        solid(chest, g, thick, S_MAIL)
        _edge(chest, g, 0, 0.006, S_STRAP)
        solid(spine, fit.band(torso, np.linspace(1.20, 0.98, 6), gap + 0.002), thick, S_MAIL)
        hem = fit.band(torso, np.linspace(1.0, 0.86, 4), lambda z: gap + 0.004 + 0.25 * (1.0 - z))
        solid(pelvis, hem, thick, S_MAIL)
        _edge(pelvis, hem, len(hem) - 1, 0.005, S_STRAP)
        _belt(pelvis, fit, 1.06)
        _hang_all(parts, mat, [('armour_cuirass.chest', chest, 'chest'), ('armour_cuirass.spine', spine, 'spine'),
                               ('armour_cuirass.pelvis', pelvis, 'pelvis')], fit)
        _sleeves(parts, fit, mat, S_MAIL, 0.012, short=fit.s['arms'] == 'short')
        return
    top, bottom = (1.5 if s.get('plain') else 1.47), 1.17   # the guard's up to the neck's foot
    sculpt = _relief(s, front, fit.woman)
    vee = s.get('neckline')   # (depth, half its width in radians): cut down to the breast at the front
    armhole = lambda t: (-0.08 * np.abs(np.cos(t)) ** 4   # noqa: E731  (its top cut down toward the armpits at the sides)
                         - (vee[0] * np.clip(1 - np.abs((t - front + math.pi) % TAU - math.pi) / vee[1], 0, 1)
                            if vee else 0.0))
    spine_ridge = lambda z, t: keel(t, 0.006, 0.3, math.pi / 2) + (sculpt(z, t) if sculpt else 0.0)   # noqa: E731
    fine = s.get('plain')   # a carved breast's edges need rows and columns finer than its grooves
    # the medium fighter's breastplate is a front alone, round to his flanks, his mail's back bare behind it
    wrap = (np.linspace(front - 1.95, front + 1.95, 90) if s.get('open_back') else angles(144))
    closed = not s.get('open_back')
    point = s.get('breast_point', 0.0)   # mithril's: its foot drawn down to a point over the belly
    g = fit.band(torso, np.linspace(top, bottom, 40 if fine else 15), gap, th=wrap if fine else None,
                 bulge=spine_ridge, top=armhole,
                 hem=(lambda t: point * _toward(t, front, 1.1) ** 1.5) if point else None)
    if s.get('breast_ridge'):   # a ridge down its middle from the collar to its point
        zs = np.linspace(top - 0.02, bottom - point + 0.01, 10)
        ridge = np.array([fit.band(torso, [z], gap + thick + 0.002, th=[front], bulge=spine_ridge)[0, 0] for z in zs])
        tube(chest, ridge, 0.005, S_TRIM, n=6)
    if s.get('emblem'):   # a small shield of a plate at its top, drawn to a point (ebony's a broad arrowhead
        ew, eh, drop = (0.42, 0.09, 0.0) if s['emblem'] is True else s['emblem']   # down the breast: its half-width,
        rows = []                                                                 # its length, how far under the collar
        for f in np.linspace(0.0, 1.0, 6 if eh < 0.12 else 12):
            w = (ew * (1.0 - f) ** 0.9 + 0.02 if eh < 0.12 else   # a broad one a shield: broadest a third of the way
                 ew * min(1.0, 0.55 + f / 0.35 * 0.45) * (1.0 - max(0.0, (f - 0.35) / 0.65)) ** 0.8 + 0.008)   # down
            rows.append(fit.band(torso, [top - 0.015 - drop - eh * f], gap + thick + (0.004 if eh < 0.12 else 0.008),
                                 th=np.linspace(front - w, front + w, 7), bulge=spine_ridge)[0])
        em = np.array(rows)
        solid(chest, em, 0.004, S_TRIM, closed=False)
        _rim(chest, em, 0.0035 if s['emblem'] is True else 0.0045)
    lit = s.get('bevel') and sculpt
    solid(chest, g, thick, S_SHADE, closed=closed, outer=_lit_tops(g, wrap, sculpt, S_SHADE) if lit else None)
    if s.get('edge'):
        _edge(chest, g, 0, s['edge'] * 1.3)
        _edge(chest, g, len(g) - 1, s['edge'])
    for zb in s.get('bands', ()):   # raised bands round the breast, the dwarves' key-cut borders at a sprite's size
        bg = fit.band(torso, [zb + 0.013, zb - 0.013], gap + thick + 0.001, th=wrap if s.get('open_back') else None,
                      bulge=sculpt)
        solid(chest, bg, 0.006, S_TRIM, closed=closed)
    for k in range(s.get('stud_rows', 0)):   # rows of studs across the breast, each narrower: a wedge to the sternum,
        zk = 1.40 - 0.04 * k   # each stud raised in the plate's own metal, so its top catches the light
        for t in np.linspace(front - 0.8 + 0.3 * k, front + 0.8 - 0.3 * k, 5 - 2 * k):
            q = fit.band(torso, [zk], gap + thick, th=[t], bulge=sculpt)[0, 0]
            out = q - np.array([*fit.outline(torso, zk)[0], zk])
            out[2] = 0.0
            dome(chest, q, 0.012, out, S_PLATE, height=0.008)
    if s.get('strips'):   # the dwarves' broad strips down the breast
        for side in (-1, 1):
            at = front + side * 0.62
            sg = fit.band(torso, np.linspace(1.46, 1.19, 8), gap + thick + 0.001,
                          th=np.linspace(at - 0.14, at + 0.14, 5), bulge=sculpt)
            solid(chest, sg, 0.007, S_TRIM, closed=False)
    v_top, v_step = s.get('vplates_at', (1.375, 0.06))   # daedric's down the breast, mithril's down the belly
    for k in range(s.get('vplates', 0)):   # plates layered in a V, each stepped out over the one under it, its foot a
        zk = v_top - v_step * k             # ridge (daedric's over a deep red seam a texel or two tall)
        t = np.linspace(front - 1.15, front + 1.15, 25)
        rise = 0.085 * np.abs(t - front)
        lift = gap + thick + 0.002 + 0.0025 * (s['vplates'] - k)

        def vrow(dz, off, z0=zk):
            return np.array([fit.band(torso, [z0 + r - dz], off, th=[tt], bulge=sculpt)[0, 0] for r, tt in zip(rise, t)])
        plate = np.array([vrow(dz, lift) for dz in (0.0, 0.015, 0.03)])
        body, foot = (S_TRIM, S_PLATE) if s.get('vplates_slot') == 'trim' else (S_PLATE, S_TRIM)   # the brotherhood's
        solid(chest, plate, 0.005, body, closed=False)                                         # crimson, its feet black
        tube(chest, plate[-1], 0.0068, foot, n=5)   # its rolled foot a whole texel, a line and not a row of dots
        if s.get('seam') and s.get('kind', 'plate') == 'plate':   # a band of it under the plate's foot, a line
            solid(chest, np.array([vrow(0.03, lift - 0.003), vrow(0.052, lift - 0.003)]), 0.003, S_GLOW, closed=False)
    if s.get('belly_panel'):   # the brotherhood's: a crimson panel down the belly, narrowing to a point, rimmed black
        rows = []
        for f in np.linspace(0.0, 1.0, 8):
            w = 0.5 - 0.3 * f
            rows.append(fit.band(torso, [1.27 - 0.15 * f], gap + thick + 0.004, th=np.linspace(front - w, front + w, 9),
                                 bulge=sculpt)[0])
        bp = np.array(rows)
        bp[-1, :] = bp[-1, :] + np.outer(-0.04 * np.cos(np.linspace(-math.pi / 2, math.pi / 2, 9)), [0.0, 0.0, 1.0])
        solid(chest, bp, 0.004, S_TRIM, closed=False)
        _rim(chest, bp, 0.003, S_PLATE)
    if s.get('belly_spine'):   # daedric: a spine down the belly, ribbed, deep red between its ribs
        zs = np.linspace(1.24, 1.05, 9)
        ridge = np.array([fit.band(torso, [z], gap + thick + 0.008, th=[front])[0, 0] for z in zs])
        tube(chest, ridge, 0.008, S_TRIM, n=6)
        for z in np.linspace(1.22, 1.08, 5):
            rib = fit.band(torso, [z], gap + thick + 0.006, th=np.linspace(front - 0.42, front + 0.42, 9))[0]
            tube(chest, rib, 0.0042, S_TRIM, n=5)
            if s.get('seam'):
                solid(chest, fit.band(torso, [z - 0.008, z - 0.022], gap + thick + 0.004,
                                      th=np.linspace(front - 0.36, front + 0.36, 9)), 0.003, S_GLOW, closed=False)
    if s.get('chevrons'):   # elven: ridges in a V down the breast, each a line of the culture's trim
        for k in range(s['chevrons']):
            zc = 1.33 - 0.065 * k
            t = np.linspace(front - 1.05, front + 1.05, 23)
            zs = zc + 0.075 * np.abs(t - front)
            pts = np.array([fit.band(torso, [z], gap + thick + 0.002, th=[tt], bulge=sculpt)[0, 0]
                            for z, tt in zip(zs, t)])
            tube(chest, pts, 0.0045, S_TRIM, n=5)
    if s.get('boss'):   # the dwarves' gear-boss on the breast
        _boss(chest, fit.band(torso, [1.33], gap + 0.004, th=[front])[0, 0], 0.07)
    if s.get('plackart'):   # a plate over the breastplate's foot, its top drawn up to a point (adamantium's foot
        span = np.linspace(front - 1.55, front + 1.55, 33)   # drawn down to one too, `plackart_point`)
        vee = s.get('plackart_point', 0.0)
        bright = s['plackart'] == 'bright'   # adamantium's: lit as its breastplate and stood proud of it, so its
        pk = fit.band(torso, np.linspace(1.25, 1.135, 6), gap + thick + (0.008 if bright else 0.002), th=span,
                      bulge=sculpt, top=lambda t: 0.075 * _toward(t, front, 1.55) ** 0.8,   # arched top catches the
                      hem=(lambda t: vee * _toward(t, front, 1.3) ** 1.5) if vee else None)   # light, its foot a shadow
        solid(chest, pk, thick, S_SHADE if bright else S_PLATE, closed=False)
        if s.get('edge'):
            _rim(chest, pk, s['edge'] * 0.9)
        else:   # the plackart's top as a sharp ridge
            tube(chest, _out(pk, 0, 0.003)[0], 0.006, S_TRIM, n=5)
        if bright:   # its top a bold roll in its own bright plate
            tube(chest, _out(pk, 0, 0.004)[0], 0.0065, S_SHADE, n=6)
    if s.get('yoke'):   # orcish: a broad plate over the top of the breast from shoulder to shoulder, its foot dipped
        span = np.linspace(front - 1.75, front + 1.75, 31)   # in a V to the breastbone, studded along it
        yk = fit.band(torso, np.linspace(1.515, 1.44, 4), gap + thick + 0.004, th=span, bulge=sculpt,
                      hem=lambda t: s['yoke'] * _toward(t, front, 1.2) ** 1.2)
        solid(chest, yk, thick, S_PLATE, closed=False)
        _rim(chest, yk, max(s.get('edge', 0.0), 0.005))
        foot, o = _out(yk, len(yk) - 1, 0.0)
        for j in range(3, len(span) - 3, 3) if s.get('yoke_studs', True) else ():   # the fighters' plain
            q = foot[j] + np.array([0.0, 0.0, 0.016])
            dome(chest, q, 0.008, o[j], S_TRIM, height=0.005)
    if s.get('chest_strap'):   # the fighters': a leather strap down the breastbone from the collar, buckled
        pts, nrm = [], []
        for z in np.linspace(1.52, 1.33, 8):
            q = fit.band(torso, [z], gap + thick + 0.011, th=[front], bulge=sculpt)[0, 0]
            n = q - np.array([*fit.outline(torso, z)[0], z])
            n[2] = 0.0
            pts.append(q)
            nrm.append(n)
        strap(chest, pts, nrm, 0.032, 0.005, S_STRAP)
        n = nrm[-2] / np.linalg.norm(nrm[-2])
        box(chest, pts[-2] + n * 0.005, (0.03, 0.026, 0.006), n, (0, 0, 1), S_TRIM)   # its buckle
    n_ch, deep = s.get('chevron_stack', (0, 0.0))
    for k in range(n_ch):   # orcish: chevron plates stacked down the middle from the breast on through the waist, over
        f = k / max(n_ch - 1, 1)   # the belt, to a long point over the groin; each over the one under it, broad at the
        zk = 1.42 - 0.44 * f       # top and narrowing down, its foot rolled
        half = 1.0 - 0.55 * f
        t = np.linspace(front - half, front + half, 21)
        rise = deep * (1.0 + 0.6 * f) * np.abs(t - front) / half * (0.55 + 0.45 * (k > 0))
        low = zk < 1.12   # on the hips, it rides them, stood out past the belt so the belt runs behind it
        lift = gap + thick + 0.003 + 0.003 * (n_ch - k) + (0.016 if low else 0.004)
        rows = []
        for dz in (0.0, 0.035, 0.07, 0.1):   # shingled: its top tucked under the plate above, its foot standing
            out = lift - 0.012 + 0.024 * dz / 0.1   # out over the one below
            rows.append(np.array([fit.band(torso, [zk + r - dz], out, th=[tt], bulge=None if low else sculpt)[0, 0]
                                  for r, tt in zip(rise, t)]))
        plate = np.array(rows)
        on = pelvis if low else chest
        solid(on, plate, thick * 0.8, S_PLATE, closed=False)
        tube(on, plate[-1], 0.0068, S_TRIM, n=5)   # its foot rolled bright over a dark line of shadow, so each V
        shadow = np.array([fit.band(torso, [zk + r - 0.1 - 0.014], out - 0.008, th=[tt],   # reads at a sprite's size
                                    bulge=None if low else sculpt)[0, 0] for r, tt in zip(rise, t)])
        solid(on, np.array([plate[-1] - np.array([0.0, 0.0, 0.004]), shadow]), 0.002, S_DARK, closed=False)
    if s.get('braces'):   # orcish: broad dark leather braces down from the yoke beside the chevrons to the belt, a ring
        at, spread = s.get('braces_at', (1.18, 0.2))   # at each one's foot by the belt; the mages' near the middle
        for side in (-1, 1):
            pts, nrm = [], []
            for z in np.linspace(1.46, 1.09, 12):
                p = fit.band(torso, [z], gap + thick + 0.009, th=[front + side * (at + spread * (1.46 - z))],
                             bulge=sculpt)[0, 0]
                n = p - np.array([*fit.outline(torso, z)[0], z])
                n[2] = 0.0
                pts.append(p)
                nrm.append(n)
            strap(chest, pts, nrm, 0.036, 0.005, S_STRAP)
            if not s.get('brace_rings', True):
                continue
            n = nrm[-1] / np.linalg.norm(nrm[-1])
            across = np.cross(n, [0.0, 0.0, 1.0])
            across /= np.linalg.norm(across)
            tube(chest, [pts[-1] + n * 0.006 + 0.017 * (math.cos(a) * across + math.sin(a) * np.array([0.0, 0.0, 1.0]))
                         for a in np.linspace(0.0, TAU, 13)[:-1]], 0.0045, S_TRIM, n=5, closed=True)
    if s.get('cowl'):   # the thieves' hood's cowl: fallen round the neck onto the shoulders' tops, open at the front
        low, gape = s.get('cowl_low', 1.46), s.get('cowl_open', 0.6)   # over the collar; the mages' a capelet, down
        flare = s.get('cowl_flare', 0.05)                               # over the breast's top and closed nearer
        th = np.linspace(front + gape, front + TAU - gape, 36)
        cw = fit.band(torso, np.linspace(1.6, low, 6), lambda z: gap + 0.014 + flare * (1.6 - z) / (1.6 - low), th=th)
        solid(chest, cw, thick, S_LEATHER, closed=False)
        _rim(chest, cw, s.get('cowl_rim', 0.004), S_TRIM)   # the mages' rim bolder, a line and not a row of dots
    for k in range(s.get('clasps', 0)):   # the mages': silver clasps down the coat's front, between its panels
        z = 1.42 - k * 0.065
        p = fit.band(torso, [z], gap + thick + 0.004, th=[front], bulge=sculpt)[0, 0]
        n = p - np.array([*fit.outline(torso, z)[0], z])
        n[2] = 0.0
        box(chest, p, (0.04, 0.012, 0.006), n, (0, 0, 1), S_GLOW)
    if s.get('stand_collar'):   # the thieves': a high collar standing round the neck, a strap buckled across its
        cg = fit.band(torso, np.linspace(1.55, 1.47, 4), gap * 0.7 + 0.006)   # front at the throat
        solid(chest, cg, thick, S_PLATE)
        tube(chest, _out(cg, 0, 0.003)[0], 0.0045, S_TRIM, n=5, closed=True)
        th = np.linspace(front - 0.7, front + 0.7, 11)
        pts, o = _out(fit.band(torso, [1.515], gap * 0.7 + 0.006 + thick + 0.002, th=th), 0)
        strap(chest, pts, o, 0.018, 0.004, S_TRIM)
        box(chest, pts[5] + o[5] * 0.005, (0.024, 0.02, 0.006), o[5], (0, 0, 1), S_GLOW)   # its brass buckle
    if s.get('bandolier'):   # the thieves': a bandolier from the right shoulder to the left hip, pouches along it
        pts, nrm = [], []    # with brass clasps, a brass badge at its top
        for f in np.linspace(0.0, 1.0, 16):
            z = 1.48 - 0.38 * f
            p = fit.band(torso, [z], gap + thick + 0.006, th=[front - 1.2 + 2.15 * f], bulge=sculpt)[0, 0]
            n = p - np.array([*fit.outline(torso, z)[0], z])
            n[2] = 0.0
            pts.append(p)
            nrm.append(n)
        pts, nrm = np.array(pts), np.array(nrm)
        strap(chest, pts, nrm, 0.036, 0.005, S_TRIM)
        along = np.gradient(pts, axis=0)
        for k in range(s['bandolier']):   # high on the right of the breast, down to its middle
            i = 3 + k
            n = nrm[i] / np.linalg.norm(nrm[i])
            up = np.cross(n, along[i])   # across the strap, toward its upper side
            up = up * (1.0 if up[2] > 0 else -1.0)
            c = pts[i] + n * 0.008
            box(chest, c, (0.036, 0.046, 0.022), n, up, S_TRIM)   # the pouch, its flap a lighter leather
            box(chest, c + n * 0.022 + up / np.linalg.norm(up) * 0.012, (0.034, 0.02, 0.004), n, up, S_PLATE)
            box(chest, c + n * 0.027 + up / np.linalg.norm(up) * 0.004, (0.016, 0.012, 0.004), n, up, S_GLOW)   # clasp
        q = fit.band(torso, [1.43], gap + thick + 0.008, th=[front - 0.32], bulge=sculpt)[0, 0]   # the badge, a brass
        n = q - np.array([*fit.outline(torso, 1.43)[0], 1.43])                                   # lozenge beside it
        n[2] = 0.0
        box(chest, q, (0.05, 0.05, 0.007), n, np.cross(n, [0.0, 0.0, 1.0]) + np.array([0.0, 0.0, 0.07]), S_GLOW)
    if s.get('gorget'):   # a gorget standing round the neck, in two lames
        for k, (a, b) in enumerate(((1.545, 1.5), (1.505, 1.465))):
            g = fit.band(torso, np.linspace(a, b, 3), gap * 0.7 + 0.004 * k)
            solid(chest, g, thick * 0.8, S_TRIM if k == 0 else S_PLATE)
            if s.get('edge'):
                _edge(chest, g, 0, s['edge'])
            else:
                _edge(chest, g, len(g) - 1, 0.003)
            if k == 0 and s.get('collar'):   # a thick roll round the gorget's top, a collar
                tube(chest, _out(g, 0, 0.006)[0], 0.012, S_TRIM, n=8, closed=True)
    if s.get('straps'):
        _cross_straps(chest, fit, gap + thick + 0.002)
    if s.get('fur'):   # a fur collar all round, or a mantle over the left shoulder
        th = angles(36) if s['fur'] == 'collar' else np.linspace(-0.4, 1.9, 18)
        pts, o = _out(fit.band(torso, [1.47], gap + 0.006, th=th), 0)
        _fur(chest, s, pts + np.array([0, 0, 0.004]), o, 0.036, rows=2, seed=3, closed=s['fur'] == 'collar')
    if s.get('spikes') and s.get('flanks', True):   # spikes along the flanks
        for side in (-1, 1):
            for z in (1.40, 1.28):
                p = fit.band(torso, [z], gap + thick, th=[front + side * 1.2])[0, 0]
                spike(chest, p, p + np.array([side * 0.7, -0.6, 0.35]) * 0.06, 0.012, S_TRIM)
    if s.get('plain'):   # Daggerfall's guard: the belly's plate under the breastplate, the abs carried down it, and
        g = fit.band(torso, np.linspace(1.215, 1.09, 18), gap - 0.001, th=wrap, bulge=sculpt)   # a broad fauld
        solid(spine, g, thick, S_SHADE, closed=closed, outer=_lit_tops(g, wrap, sculpt, S_SHADE) if lit else None)
        if s.get('fauld', True) == 'back':   # a plate over the seat alone, the woman's medium fighter's
            seat = np.linspace(math.pi / 2 - 0.85, math.pi / 2 + 0.85, 25)
            solid(pelvis, fit.band(torso, np.linspace(1.095, 0.94, 6), gap + 0.006, th=seat), thick, S_PLATE,
                  closed=False)
        elif s.get('fauld', True):   # the hips plated; else the mail under shows below the belt (the barbarian's)
            solid(pelvis, fit.band(torso, np.linspace(1.095, 0.95, 6), gap + 0.004), thick, S_SHADE)
        _belt(pelvis, fit, 1.085, out=0.01)
    elif s.get('mailskirt'):   # the mail skirt hangs from under one lame at the waist
        _lames(fit, spine, torso, 1.19, 1.1, 1, gap + 0.002)
        _belt(pelvis, fit, 1.085)
    elif s.get('jacket_hem'):   # the thieves': the jacket on down over the belly to just under its two belts,
        solid(spine, fit.band(torso, np.linspace(1.19, 1.06, 5), gap + 0.002), thick, S_PLATE)   # fitted, its hem
        hem = fit.band(torso, np.linspace(1.07, 1.02, 3), gap + 0.004,                           # rolled: no skirt
                       hem=(lambda t: -0.03 * _toward(t, math.pi / 2, 1.3)) if fit.woman else None)
        solid(pelvis, hem, thick, S_PLATE)
        _edge(pelvis, hem, len(hem) - 1, 0.0035, S_TRIM)
        for k, z in enumerate((1.1, 1.06)[:s.get('belts', 1)]):
            _belt(pelvis, fit, z, out=0.006 + 0.004 * k)
    else:   # broad lames down to the hips, belted over: Daggerfall's dark band at the waist
        _lames(fit, spine, torso, 1.19, 1.03, s.get('lames', 2), gap + 0.002, studs=s.get('lame_studs', 0),
               crown=(lambda t: point * _toward(t, front, 1.1) ** 1.5) if point else None,
               slot=S_TRIM if s.get('dark_belly') else S_PLATE)   # adamantium's dark under its bright breast
        # hers follows her body and is cut up over her seat behind: a straight lame would stand out from it in a lip
        _lames(fit, pelvis, torso, 1.05, 0.95, 1, gap + 0.006, rows=8 if fit.woman else 3,
               hem=(lambda t: -0.045 * _toward(t, math.pi / 2, 1.3)) if fit.woman else None)
        _belt(pelvis, fit, 1.06, out=0.006 + 0.002 * s.get('lames', 2))
    _hang_all(parts, mat, [('armour_cuirass.chest', chest, 'chest'), ('armour_cuirass.spine', spine, 'spine'),
                           ('armour_cuirass.pelvis', pelvis, 'pelvis')], fit)
    for side in 'LR' if s['tassets'] else '':   # tassets: lames over each thigh's front; iron's over leather strips
        tm = Mesh()
        x = 1.0 if side == 'L' else -1.0
        span = np.linspace(-2.7, -0.45, 19)
        if s.get('pteruges'):
            for a in np.linspace(-2.6, -0.55, 5):
                line = fit.band([f'leg_{side}'], np.linspace(0.95, 0.74, 8), gap + 0.003, th=[a, a + 0.001])[:, 0]
                nrm = line - np.array([rest(f'thigh_{side}')[0], rest(f'thigh_{side}')[1], 0.0])
                nrm[:, 2] = 0
                strap(tm, line, nrm, 0.04, 0.004, S_LEATHER)
        vee = s.get('tasset_point')   # ebony's: the last lame's foot drawn down to a point over the thigh's front
        _lames(fit, tm, [f'leg_{side}'], 0.94, 0.80 if s.get('pteruges') else 0.76,
               1 if kind == 'leather' or s.get('plain') else 2, gap + 0.006, th=span, facing=-math.pi / 2 + 0.25 * x,
               hem=(lambda t, at=-math.pi / 2 + 0.25 * x: vee * _toward(t, at, 1.0) ** 1.3) if vee else None)
        _hang_all(parts, mat, [(f'armour_cuirass.tasset_{side}', tm, f'thigh_{side}')])
    if s['arms']:
        _sleeves(parts, fit, mat, S_PLATE if kind != 'leather' else S_LEATHER, gap * 0.7, upper=s['arms'] == 'full')


def _cop(fit, mesh, region, at, facing, gap, half, height, span=1.3, wing=None, slot=S_PLATE):
    """A cop over a joint: a cup fitted to the limb `half` above and below `at` on the side `facing`, swelling
    `height` at its heart, keeled and rolled (a plain culture's smooth, unrolled); with `wing` (the direction it
    faces), a fan flaring off its side."""
    s = fit.s
    thick = s.get('thick', 0.007)
    th = np.linspace(facing - span, facing + span, 23)
    g = fit.band(region, np.linspace(at + half, at - half, 9), gap, th=th, facing=facing,
                 keel_h=max(s.get('keel', 0.0) * 0.4, 0.003),
                 bulge=lambda z, t: height * _bump(z, at, half) ** 0.75 * _toward(t, facing, span) ** 0.6)
    solid(mesh, g, thick, slot, closed=False)
    if not s.get('plain'):
        _rim(mesh, g, max(s.get('edge', 0.0), 0.005) * 0.9)
    if wing is not None:
        w = fit.band(region, np.linspace(at + half * 0.8, at - half * 0.7, 7), gap + height * 0.45,
                     th=np.linspace(wing - 0.6, wing + 0.6, 13), facing=wing, keel_h=0.0,
                     bulge=lambda z, t: height * 0.6 * _bump(z, at, half * 0.9) * _toward(t, wing, 0.7))
        solid(mesh, w, thick * 0.8, S_TRIM, closed=False)
        _rim(mesh, w, max(s.get('edge', 0.0), 0.005) * 0.8)
    if s.get('spikes'):
        p = g[len(g) // 2, len(th) // 2]
        o = p - np.array([*fit.outline(region, at)[0], at])
        o[2] = 0
        spike(mesh, p, p + o / np.linalg.norm(o) * 0.07 + np.array([0, 0, 0.02]), 0.015, S_TRIM)
    return g


def _sleeves(parts, fit, mat, slot, gap, upper=True, short=False):
    """Rerebraces: the upper arms' lames (or leather, or mail) from under the pauldron to the elbow (`short`, mail to
    a hand above it, hemmed in leather), and a couter over its point, winged on its outer side; without the `upper`
    arm's lames, the couter alone, strapped on above and below the elbow."""
    for side in 'LR':
        rere, lower = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        ez = rest(f'farm_{side}')[2]
        zs = np.linspace(arm_z(1.43), ez + (0.09 if short else 0.03), 4)   # from well up under the pauldron
        if fit.s.get('plain'):   # one smooth piece from under the pauldron to the elbow, as Daggerfall's guard wears
            zs = zs[[0, -1]]
        for k, (a, b) in enumerate(zip(zs, zs[1:]) if upper else ()):
            g = fit.band([f'arm_{side}'], np.linspace(a + 0.008, b, 3 if len(zs) > 2 else 8), gap + 0.0015 * k,
                         keel_h=0.0, facing=0.0 if side == 'L' else math.pi)
            solid(rere, g, fit.s.get('thick', 0.006) * 0.8, slot)
            if fit.s.get('edge') and slot == S_PLATE:
                _edge(rere, g, len(g) - 1, fit.s['edge'] * 0.7)
            elif short and k == len(zs) - 2:
                _edge(rere, g, len(g) - 1, 0.004, S_LEATHER)
        if slot == S_PLATE and not upper:   # each strap on the bone it binds, so it bends with the elbow
            for z, on in ((ez + 0.06, rere), (ez - 0.06, lower)):
                solid(on, fit.band([f'arm_{side}'], [z + 0.007, z - 0.007], gap + 0.001, keel_h=0.0), 0.003, S_STRAP)
        if slot == S_PLATE:
            out = 0.0 if side == 'L' else math.pi
            _cop(fit, lower, [f'arm_{side}'], ez, math.pi / 2, gap + 0.005, 0.05, 0.01, span=2.9,   # round the crook too
                 wing=None if fit.s.get('plain') else out + 0.5 * x)
        elif slot == S_LEATHER:
            solid(lower, fit.band([f'arm_{side}'], np.linspace(ez + 0.04, ez - 0.04, 4), gap + 0.006,
                                  th=np.linspace(math.pi / 2 - 1.2, math.pi / 2 + 1.2, 13), keel_h=0.0,
                                  bulge=lambda z, t: 0.008 * _bump(z, ez, 0.04)), 0.005, S_STRAP, closed=False)
        _hang_all(parts, mat, [(f'armour_cuirass.rere_{side}', rere, f'uarm_{side}'),
                               (f'armour_cuirass.couter_{side}', lower, f'farm_{side}')])


def _cross_straps(mesh, fit, gap):
    for side in (-1, 1):
        pts, nrm = [], []
        for t in np.linspace(0, 1, 14):
            z = 1.46 - 0.26 * t
            p = fit.band(['torso'], [z], gap, th=[-math.pi / 2 + side * (1.15 - 2.3 * t)])[0, 0]
            n = p - np.array([0.0, 0.0, z])
            n[2] = 0
            pts.append(p)
            nrm.append(n)
        strap(mesh, pts, nrm, 0.03, 0.004, S_STRAP)
        n = nrm[7] / np.linalg.norm(nrm[7])
        box(mesh, pts[7] + n * 0.004, (0.026, 0.022, 0.006), n, (0, 0, 1), S_TRIM)


def _belt(mesh, fit, z, out=0.008):
    """A broad belt of dark leather (or a set's `sash`) round the waist `out` past the plate, its buckle big enough
    to read."""
    g = fit.band(['torso'], [z + 0.02, z - 0.02], fit.s.get('gap', 0.01) + out)
    solid(mesh, g, 0.006, S_SASH)
    p, o = _out(g, 1)
    k = int(np.argmin(p[:, 1]))
    c = (g[0, k] + g[1, k]) / 2 + o[k] * 0.005
    for k in range(fit.s.get('belt_studs', 0)):   # the brotherhood's: studs along the belt's front
        t = -math.pi / 2 + (k - (fit.s['belt_studs'] - 1) / 2) * 0.26
        j = int(np.argmin(np.abs(np.arctan2(p[:, 1] - p[:, 1].mean(), p[:, 0] - p[:, 0].mean()) - t)))
        if abs(t + math.pi / 2) > 0.2:   # none behind the buckle
            dome(mesh, (g[0, j] + g[1, j]) / 2 + o[j] * 0.003, 0.006, o[j], S_GLOW)
    for side in (-1, 1) if fit.s.get('belt_rings') else ():   # orcish: rings hung on the belt at each hip
        for k in range(fit.s['belt_rings']):
            j = int(np.argmin(np.abs(np.arctan2(p[:, 1] - p[:, 1].mean(), p[:, 0] - p[:, 0].mean())
                                     - (-math.pi / 2 + side * (0.75 + 0.3 * k)))))
            cc, oo = (g[0, j] + g[1, j]) / 2 + o[j] * 0.008, o[j]
            across = np.cross(oo, [0.0, 0.0, 1.0])
            across /= np.linalg.norm(across)
            tube(mesh, [cc - np.array([0.0, 0.0, 0.016]) + 0.016 * (math.cos(t) * across + math.sin(t) * np.array(
                [0.0, 0.0, 1.0])) for t in np.linspace(0.0, TAU, 13)[:-1]], 0.0045, S_TRIM, n=5, closed=True)
    if fit.s.get('buckle') == 'disc':   # adamantium's: a round boss of a buckle, ringed
        dome(mesh, c, 0.03, o[k], S_TRIM, height=0.01)
        dome(mesh, c + o[k] * 0.008, 0.012, o[k], S_PLATE)
    elif fit.s.get('buckle') == 'ring':   # ebony's: a ring standing on the belt, bright on the dark leather
        across = np.cross(o[k], [0.0, 0.0, 1.0])
        across /= np.linalg.norm(across)
        tube(mesh, [c + o[k] * 0.006 + 0.022 * (math.cos(t) * across + math.sin(t) * np.array([0.0, 0.0, 1.0]))
                    for t in np.linspace(0.0, TAU, 15)[:-1]], 0.0055, S_TRIM, n=5, closed=True)
    elif fit.s.get('kind') == 'leather' and fit.s.get('seam'):   # a small brass buckle (the thieves')
        box(mesh, c, (0.03, 0.03, 0.008), o[k], (0, 0, 1), S_GLOW)
    else:
        box(mesh, c, (0.055, 0.05, 0.01), o[k], (0, 0, 1), S_TRIM)


def _fur(mesh, s, pts, out, length, rows=1, seed=0, closed=False):
    """A set's fur trim along `pts`: tufts, or, where the set draws it for a sprite (`fleece`), one soft roll lying
    on the line, a little thicker than the tufts were long."""
    if not s.get('fleece'):
        fur(mesh, pts, out, length, S_FUR, rows=rows, seed=seed)
        return
    r = length * 0.6
    o = np.asarray(out, float)
    o = o / np.maximum(np.linalg.norm(o, axis=1, keepdims=True), 1e-9)
    fleece(mesh, np.asarray(pts, float) + o * r * 0.8, r, S_FUR, seed=seed, closed=closed)


def _boss(mesh, p, r):
    """A boss: a thick disc notched round like a gear, riveted, a dome at its heart."""
    n = np.array([0.0, -1.0, 0.25])
    n /= np.linalg.norm(n)
    side = np.cross([0.0, 0.0, 1.0], n)
    side /= np.linalg.norm(side)
    up = np.cross(n, side)
    th = angles(48)
    rr = r * (1 - 0.12 * (np.sin(th * 12) > 0.3))
    face = np.array([[p + n * 0.016 + (side * math.cos(t) + up * math.sin(t)) * k * rr[i] for i, t in enumerate(th)]
                     for k in (1.0, 0.98)])
    solid(mesh, face, 0.016, S_TRIM, inward=lambda g: -np.broadcast_to(n, g.shape))
    for t in angles(8):
        dome(mesh, p + n * 0.017 + (side * math.cos(t) + up * math.sin(t)) * r * 0.62, 0.006, n, S_PLATE)
    dome(mesh, p + n * 0.017, r * 0.35, n, S_PLATE, height=0.014)


# -- the pauldrons

def _spiral(mesh, c, n, r, slot=S_PLATE):
    """A spiral boss raised on a plate at `c`, facing `n`, `r` across its ring: a ring round a domed heart and a
    scroll winding out between them, so at a sprite's size it reads as a bright ring and a dot."""
    n = np.asarray(n, float) / max(np.linalg.norm(n), 1e-9)
    u = np.cross(n, (0.0, 0.0, 1.0) if abs(n[2]) < 0.9 else (1.0, 0.0, 0.0))
    u /= np.linalg.norm(u)
    w = np.cross(n, u)
    at = lambda t, rr, lift: c + n * lift + rr * (math.cos(t) * u + math.sin(t) * w)   # noqa: E731
    ts = np.linspace(0, TAU, 19)[:-1]   # on a dark sunk disc, so gold on gold still reads at a sprite's size
    solid(mesh, np.array([[at(t, r * 0.05, 0.0008) for t in ts], [at(t, r * 1.1, 0.0008) for t in ts]]), 0.0008,
          S_DARK, closed=True, inward=c - n * 0.02)
    tube(mesh, [at(t, r, 0.002) for t in ts], r * 0.17, slot, n=5, closed=True)
    dome(mesh, c + n * 0.001, r * 0.34, n, slot)
    tube(mesh, [at(t, r * (0.34 + 0.55 * k / 18), 0.0025) for k, t in enumerate(np.linspace(0, 3 * math.pi, 19))],
         r * 0.11, slot, n=4)


def _on_shell(c, radii, R, lat, lon, out=0.0):
    """Points on a pauldron's shell (an ellipsoid about `c`, turned by `R`) at latitudes `lat` along longitude `lon`,
    `out` metres proud of it."""
    lat = np.asarray(lat, float)
    p = np.stack([np.cos(lat) * math.cos(lon), np.cos(lat) * math.sin(lon), np.sin(lat)], axis=1)
    n = p / np.asarray(radii, float)
    n /= np.linalg.norm(n, axis=1, keepdims=True)
    return c + (p * radii + n * out) @ np.asarray(R).T


def _crest(c, radii, R, out=0.0, reach=0.22, n=17):
    """Points along a pauldron's line from front to back over its crown, `out` proud of its shell."""
    a = np.linspace(-(math.pi / 2 + reach), math.pi / 2 + reach, n)
    p = np.stack([np.zeros_like(a), np.sin(a), np.cos(a)], axis=1)
    nrm = p / np.asarray(radii, float)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    return c + (p * radii + nrm * out) @ np.asarray(R).T


def _wedge(m, fit, s, p, side, rim):
    """A dwarven pauldron, angular where the others are round: a plate sloped like a roof from the neck down over the
    shoulder, kept clear of it, its front a face to a point over the arm, a bold ridge along its foot, its outer edge a
    squared ledge jutting past the arm; a tall rounded fin standing up off it by the neck, turned so its face shows
    from the front, and a big stud at the fin's foot."""
    x = 1.0 if side == 'L' else -1.0
    lo, hi = fit.shoulder(side)
    thick, gap = s.get('thick', 0.007), s.get('gap', 0.01)
    xin, xout = (lo[0], hi[0]) if x > 0 else (hi[0], lo[0])   # the flank's side, the arm's
    cy, half = (lo[1] + hi[1]) / 2, (hi[1] - lo[1]) / 2
    u = np.linspace(0.0, 1.0, 9)[:, None]   # across, neck to arm
    v = np.linspace(-1.0, 1.0, 13)[None, :]   # front to back
    X = xin + (xout + x * p.get('reach', 0.02) - xin) * u + 0 * v
    Y = cy + v * half * (1.05 + 0.15 * u)
    Z = hi[2] + 0.012 - p.get('drop', 0.07) * u ** 1.8 - p.get('drape', 0.07) * v ** 2 * (0.5 + 0.5 * u)   # draped
    # down at the front and back, so its front shows a face as well as its slope
    near = fit.body.rest[fit.body.rest[:, 2] > hi[2] - 0.2]
    for i in range(X.shape[0]):   # never through the shoulder under it
        for j in range(X.shape[1]):
            d = (near[:, 0] - X[i, j]) ** 2 + (near[:, 1] - Y[i, j]) ** 2
            under = near[d < 0.016 ** 2]
            if len(under):
                Z[i, j] = max(Z[i, j], under[:, 2].max() + gap + 0.009)   # off it, so a shadow shows under it
    g = np.stack([X, Y, Z], axis=-1)
    down = lambda gg: np.broadcast_to([0.0, 0.0, -1.0], gg.shape)   # noqa: E731
    solid(m, g, thick, S_PLATE, closed=False, inward=down)
    _rim(m, g, max(rim, 0.006))   # a bold rolled rim all round, so it reads apart from the arm's plate under it
    for edge in (g[:, 0], g[:, -1]):   # its foot at the front and back a bold ridge out to the point
        tube(m, edge + np.array([0.0, 0.0, -0.002]), 0.008, S_TRIM, n=6)
    ledge = np.stack([g[-1], g[-1] + np.array([x * 0.025, 0.0, -0.014])])   # its outer edge squared and jutting
    solid(m, ledge, thick * 1.3, S_TRIM, closed=False, inward=down)
    tube(m, ledge[-1], max(rim, 0.005), S_TRIM, n=6)
    if p.get('fin'):   # the fin: a blade standing up off the slope by the neck, run from its inner front corner back
        k = np.arange(7)   # and out, so seen from the front its face shows; its top rounded, leaning out, rolled
        base = g[np.round(k * 3 / 6).astype(int), 3 + k]
        rise = p['fin'] * np.sin(np.linspace(0.3, math.pi - 0.3, len(base))) ** 0.2   # steep sides, a round top
        up = np.outer(rise, [0.0, 0.0, 1.0])
        mid = base + up * 0.55 + np.outer(0.05 * rise, [x, 0.0, 0.0])
        top = base + up + np.outer(0.28 * rise, [x, 0.0, 0.0])   # its top curled out
        across = np.cross(base[-1] - base[0], [0.0, 0.0, 1.0])
        across = across / np.linalg.norm(across) * (1.0 if across[0] * x > 0 else -1.0)
        solid(m, np.array([base, mid, top]), thick * 1.2, S_PLATE, closed=False,
              inward=lambda gg: np.broadcast_to(across, gg.shape))
        tube(m, top, max(rim, 0.006), S_TRIM, n=6)
    q = g[2, 4]   # the stud, big, at the fin's foot
    n = np.cross(g[3, 4] - g[1, 4], g[2, 5] - g[2, 3])
    n = n * np.sign(n[2]) / np.linalg.norm(n)
    dome(m, q + n * 0.002, 0.02, n, S_PLATE, height=0.012)


def _scythe(m, fit, s, p, side, rim):
    """Ebony's pauldron: one broad plate standing high by the neck, curved over the shoulder and swept out past the
    arm into a long point turned a little up, draped front and back so its face shows, rimmed bright; under it
    shorter plates down the arm's outer side, each drawn out to a point of its own, so the shoulder reads as a fan of
    blades. Each is held clear of the shoulder and of the plate under it."""
    x = 1.0 if side == 'L' else -1.0
    lo, hi = fit.shoulder(side)
    thick, gap = s.get('thick', 0.007), s.get('gap', 0.01)
    xin, xout = (lo[0], hi[0]) if x > 0 else (hi[0], lo[0])   # the flank's side, the arm's
    span, cy, half = abs(xout - xin), (lo[1] + hi[1]) / 2, (hi[1] - lo[1]) / 2
    piece = fit.piece.astype(str)   # what lies under a plate: the arm and the torso, never the head or neck
    body = (piece == 'torso') | np.char.startswith(piece, 'arm_')
    near = fit.body.rest[body & (fit.body.rest[:, 2] > hi[2] - 0.3)]
    reach = p.get('reach', 0.09)
    v = np.linspace(-1.0, 1.0, 11)[None, :]   # across a plate, front to back
    u = np.linspace(0.0, 1.0, 20)[:, None]    # along it, its root to its point
    for k in range(p.get('lames', 2) + 1):    # the broad plate first, then the plates under it
        top = k == 0
        start = 0.0 if top else 0.5 + 0.08 * k   # where its root lies, a share of the way from the neck to the arm
        length = (1.0 - start) * span + reach * (1.0 if top else 0.55 - 0.15 * k)
        along = start * span + length * u          # how far out from the neck
        past = np.clip((along - span * 0.8) / (length + start * span - span * 0.8), 0.0, 1.0)   # 0 over the
        taper = np.cos(past * math.pi / 2) ** 0.9 * 0.96 + 0.04                                 # shoulder, 1 at its tip
        X = xin + x * along + 0 * v
        Y = cy + v * half * (1.12 - 0.12 * k) * taper
        Z = (hi[2] + 0.012 - 0.045 * k + (0.04 if top else 0.0) * (1.0 - u) ** 3   # standing high by the neck
             + (0.03 if top else 0.012) * past ** 2                               # its point turned up
             - p.get('drape', 0.075) * v ** 2 * taper * (0.5 + 0.5 * np.minimum(u * 2.0, 1.0)))
        X, Y, Z = (np.array(a, float) for a in np.broadcast_arrays(X, Y, Z))
        for i in range(X.shape[0]):   # clear of the shoulder and arm, and of the plates under it
            for j in range(X.shape[1]):
                d = (near[:, 0] - X[i, j]) ** 2 + (near[:, 1] - Y[i, j]) ** 2
                under = near[d < 0.016 ** 2]
                if len(under):
                    Z[i, j] = max(Z[i, j], under[:, 2].max() + gap + 0.004 + (0.012 if top else 0.0))
        g = np.stack([X, Y, Z], axis=-1)
        solid(m, g, thick, S_PLATE, closed=False, inward=lambda gg: np.broadcast_to([0.0, 0.0, -1.0], gg.shape))
        _rim(m, g, max(rim, 0.0045))


def _blades(m, fit, s, p, side, rim):
    """Daedric pauldrons: layered bands over the shoulder like a wing's feathers, each wrapped over it from front to
    back and draped down at both, so it shows a face from every side, its outer end narrowed and curled up into a claw.
    The lowest is the longest, reaching past the arm, its claw low; each above sits higher and is shorter, its claw
    taller, the top one rising like a horn. A claw is solid, so it reads from every side. Each is held clear of the shoulder and of the band under it, rimmed; the
    lowest riveted."""
    x = 1.0 if side == 'L' else -1.0
    lo, hi = fit.shoulder(side)
    thick, gap = s.get('thick', 0.007), s.get('gap', 0.01)
    xin, xout = (lo[0], hi[0]) if x > 0 else (hi[0], lo[0])   # the flank's side, the arm's
    span, cy = abs(xout - xin), (lo[1] + hi[1]) / 2
    piece = fit.piece.astype(str)   # what lies under a band: the arm and the torso, never the head or neck
    body = (piece == 'torso') | np.char.startswith(piece, 'arm_')
    near = fit.body.rest[body & (fit.body.rest[:, 2] > hi[2] - 0.25)]
    n = p.get('blades', 4)
    clawed = p.get('claws', True)   # else each band drawn to a point of its own, its tip lowered (`droop`)
    shorter, narrower = p.get('shrink', (0.4, 0.45))   # how much the top band is shorter and narrower than the lowest
    u = np.linspace(0.0, 1.0, 16)[:, None]   # along a band, its root by the neck to its claw's tip
    v = np.linspace(-1.0, 1.0, 9)[None, :]   # across it, front to back
    for k in range(n):
        f = k / max(n - 1, 1)
        x0 = xin + x * (0.02 + 0.2 * f) * span
        length = (span + p.get('reach', 0.08)) * (1.0 - shorter * f)
        rise = p.get('rise', 0.2) * (0.15 + 0.85 * f ** 1.2)   # the claw's height
        half = p.get('width', 0.075) * (1.0 - narrower * f)   # half its breadth, front to back
        drape = p.get('drape', 0.06) * (1.0 - 0.5 * f)
        X = x0 + x * length * u
        taper = (1.0 - 0.45 * u ** 4) if clawed else (1.0 - 0.95 * u ** 2.2)   # its end rounded in, or a point
        Y = cy + 0.004 * k + v * half * taper
        Z = (hi[2] + 0.01 + 0.016 * k + (0.25 * rise if clawed else -p.get('droop', 0.0)) * u ** 3 - drape * v ** 2
             - 0.02 * np.sin(np.pi * u) * (1.0 - f))
        X, Y, Z = np.broadcast_arrays(X, Y, Z)
        X, Y, Z = X.copy(), Y.copy(), Z.copy()
        for i in range(X.shape[0]):   # clear of the shoulder, and of the bands under it
            for j in range(X.shape[1]):
                d = (near[:, 0] - X[i, j]) ** 2 + (near[:, 1] - Y[i, j]) ** 2
                under = near[d < 0.016 ** 2]
                if len(under):
                    Z[i, j] = max(Z[i, j], under[:, 2].max() + gap + 0.004 + 0.011 * k)
        g = np.stack([X, Y, Z], axis=-1)
        solid(m, g, thick, S_PLATE, closed=False, inward=lambda gg: np.broadcast_to([0.0, 0.0, -1.0], gg.shape))
        _rim(m, g, max(rim, 0.004))
        if clawed:   # its claw: thick at its root, curving up and out like a horn
            base = g[-2, g.shape[1] // 2]
            spike(m, base, base + np.array([x * (0.05 + 0.03 * f), 0.01, rise]), 0.03 * (1.0 - 0.2 * f), S_PLATE,
                  n=7, curve=(x * 0.05, 0.0, 0.0))   # broad enough at its root to read as a blade, a few texels across
        if p.get('flange') and k == n - 1:   # a lip standing up along the top band's root by the neck, rolled
            base = g[0]
            lip = p['flange'] * np.sin(np.linspace(0.25, math.pi - 0.25, len(base))) ** 0.4
            top = base + np.outer(lip, [0.0, 0.0, 1.0])
            solid(m, np.array([base, (base + top) / 2, top]), thick, S_PLATE, closed=False,
                  inward=lambda gg: np.broadcast_to([x, 0.0, 0.0], gg.shape))
            tube(m, top, max(rim, 0.004), S_TRIM, n=6)
        if k == 0 and p.get('rivets', True):
            for i in (3, 6, 9):
                q = g[i, 1]
                dome(m, q + np.array([0.0, -0.003, 0.002]), 0.006, (0.0, -1.0, 0.4), S_TRIM)


def pauldrons(parts, fit, mat):
    """The pauldrons: a cap over the shoulder and lames stacked down the arm under it, each a solid stepped at its
    foot and rolled there; a crest from front to back over the cap, low on the rounded, a fin on the swept and the
    faceted; flutes down it and a border where the culture draws them. Swept, the cap is small and the lames long
    blades layered back to a point (elven, mithril, ebony, daedric); square on the dwarves, faceted where the
    culture cuts its plate in facets; spikes and fur where it wears them. Mail is the hauberk's own."""
    p = fit.s['paul']
    if p['make'] == 'mail':
        return
    s = fit.s if p.get('smooth') else fit.close   # drawn as they were, rivets, flutes and border lines with them
    size, make = p.get('size', 1.0), p['make']
    swept = make == 'swept'
    thick = s.get('thick', 0.007)
    facets = s.get('section', ('round',))[0] == 'facet'
    cols = {'square': 6, 'facet': 9}.get(make, 12 if facets else 30)
    rim = max(s.get('edge', 0.0), 0.0035)
    for side in 'LR':
        m = Mesh()
        if make in ('wedge', 'blades', 'scythe'):   # the dwarves': angular, sloped, finned; daedric: a fan of blades;
            {'wedge': _wedge, 'blades': _blades, 'scythe': _scythe}[make](m, fit, s, p, side, rim)   # ebony: a sweep
            _hang_all(parts, mat, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])
            continue
        x = 1.0 if side == 'L' else -1.0
        lo, hi = fit.shoulder(side)   # the cap fitted over the shoulder, its crown on the shoulder's top
        body_r = np.array([(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, 0.1])
        c = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[2] - body_r[2]])
        mid = 0.0 if side == 'L' else math.pi
        lon = (mid - 2.15, mid + 2.15)
        radii = (body_r + s.get('gap', 0.01) + 0.006) * size * (np.array([1.0, 1.12, 0.95]) if swept else 1)
        radii = radii * np.array(p.get('stretch', (1.0, 1.0, 1.0)))   # broad and flat across the shoulder's top
        mantle = p.get('mantle', 0.0)
        if mantle:   # its inner side drawn in to the collar, its outer reach kept: one plate from the neck out
            c = c - np.array([mantle * x / 2, 0.0, 0.0])
            radii = radii + np.array([mantle / 2, 0.0, 0.0])
            lon = (mid - 2.6, mid + 2.6)
        sweep = rot((1, 0, 0), 14) if swept else np.eye(3)
        point = (lambda b: 0.32 * max(0.0, math.sin(b - mid + math.pi / 2)) ** 3) if p.get('point') else None
        toothed = None
        if s.get('teeth'):
            toothed = lambda b: float(teeth(np.array([b]), s['teeth'][0] * 2.4, s['teeth'][1] // 2)[0])   # noqa: E731
        edge = ((lambda b: point(b) + (toothed(b) * 0.6 if toothed else 0.0)) if point else toothed)
        R = sweep @ rot((0, 1, 0), -24 * x)
        lat = (0.15, 1.38) if swept else (-0.25, 1.35)
        body, rimmed = (S_TRIM, S_PLATE) if 'pauldrons' in fit.s.get('trim_pieces', ()) else (S_PLATE, S_TRIM)
        cap = cap_band(m, c, radii, lat, lon, thick * 1.1, body, tilt=R, rows=8, cols=cols, edge=edge)
        tube(m, cap[0], rim, rimmed, n=6)
        if s.get('spirals'):   # a spiral boss on its outer face
            q = _on_shell(c, radii, R, [lat[0] + 0.45], mid, thick * 1.1)[0]
            _spiral(m, q, q - c, 0.055 * size)
        step = cap_band(m, c, radii * 1.022, (lat[0], lat[0] + 0.2), lon, thick * 0.6, body, tilt=R, rows=2,
                        cols=cols, edge=edge)   # a flange stepped out over the foot
        if s.get('trimlines'):   # its border picked out, broad enough to read at a sprite's size
            tube(m, step[-1], 0.0035, S_TRIM, n=4)
        if s.get('rivets'):
            for q in step[1][np.linspace(1, cols - 1, 7).astype(int)]:
                dome(m, q, 0.0055, q - c, S_TRIM)
        if p.get('ridge') or swept or make == 'facet':   # the crest, front to back over the crown
            side_n = R @ np.array([1.0, 0.0, 0.0])
            reach = -lat[0] + 0.05 if not swept else -0.05
            line = _crest(c, radii, R, 0.001, reach)
            if swept or make == 'facet':
                tall = 0.016 * size * np.sin(np.linspace(0.25, math.pi - 0.1, len(line))) ** 0.6
                crest = _crest(c, radii, R, 0.0, reach) + (line - c) / np.linalg.norm(line - c, axis=1)[:, None] * tall[:, None]
                solid(m, np.stack([line + side_n * 0.003, crest + side_n * 0.003], axis=1), 0.006, S_TRIM,
                      closed=False, inward=lambda g: -np.broadcast_to(side_n, g.shape))
            else:
                tube(m, _crest(c, radii, R, 0.004, reach), 0.0055, S_TRIM, n=6)
        if s.get('flutes'):   # flutes fanning down from the crown
            for lo in np.linspace(lon[0] + 0.45, lon[1] - 0.45, s['flutes']):
                tube(m, _on_shell(c, radii, R, np.linspace(lat[0] + 0.15, 1.15, 9), lo, 0.0025), 0.0025, S_TRIM, n=5)
        lames = p.get('lames', 0)
        for k in range(lames):   # lames down the arm, each out over the next; swept, long blades laid back
            if swept:
                ck = c + np.array([0.024 * x * (k + 1), 0.01 * (k + 1), -0.042 * (k + 1)])
                Rk = rot((1, 0, 0), 14 + 6 * (k + 1)) @ rot((0, 1, 0), -(30 + 9 * k) * x)
                rk = radii * (1.0 - 0.06 * k)
                lk = (-0.3, 0.42)
            else:
                ck = c + np.array([0.026 * x * (k + 1), 0.0, -0.045 * (k + 1)])
                Rk = sweep @ rot((0, 1, 0), -(30 + 8 * k) * x)
                rk = radii * (0.92 - 0.05 * k)
                lk = (-0.35, 0.25)
            g = cap_band(m, ck, rk, lk, lon, thick, body, tilt=Rk, rows=4 if swept else 3, cols=cols, edge=edge)
            tube(m, g[0], rim * 0.85, rimmed, n=6)
            cap_band(m, ck, rk * 1.02, (lk[0], lk[0] + 0.14), lon, thick * 0.5, body, tilt=Rk, rows=1, cols=cols,
                     edge=edge)
            if s.get('rivets'):
                for q in g[2][::max(1, cols // 5)]:
                    dome(m, q, 0.005, q - ck, S_TRIM)
        if p.get('lip'):   # its inner edge by the neck turned up in a standing lip, front to back (adamantium's)
            a = np.linspace(-1.15, 1.15, 13)
            beta = p.get('lip_beta', 0.45)   # in from the crown toward the neck
            u = np.stack([np.full_like(a, -x * math.sin(beta)), math.cos(beta) * np.sin(a),
                          math.cos(beta) * np.cos(a)], axis=1)
            nrm = u / radii
            nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
            foot = c + (u * radii) @ R.T
            rise = (nrm @ R.T) * 0.5 + np.array([0.0, 0.0, 1.0])
            rise /= np.linalg.norm(rise, axis=1, keepdims=True)
            tall = p['lip'] * size * (np.clip(1.0 - np.abs(np.linspace(-1.0, 1.0, len(a))), 0.0, 1.0) ** 1.3   # a peak
                                      if p.get('lip_peak') else np.sin(np.linspace(0.3, math.pi - 0.3, len(a))) ** 0.7)
            inner = np.array([-x, 0.0, 0.0])
            solid(m, np.stack([foot - rise * 0.004, foot + rise * tall[:, None]], axis=1), thick * 0.8, S_PLATE,
                  closed=False, inward=lambda g: -np.broadcast_to(inner, g.shape))
            tube(m, foot + rise * tall[:, None], rim, S_TRIM, n=5)
        if p.get('horn'):   # orcish: the cap's outer corner swept up into a horn, a broad plate drawn to a point,
            hz = p['horn']   # its root along the cap from its outer side up toward its crown, so its face is to the
            base = _on_shell(c, radii, R, np.linspace(0.05, 1.05, 7), mid, -0.003)   # front
            tip = c + R @ np.array([x * (radii[0] * 0.95 + 0.03), -0.012, radii[2] + hz])
            rows = [base + (tip - base) * f + np.outer(np.full(7, 0.012 * math.sin(f * math.pi)), [x, 0.0, 0.0])
                    for f in np.linspace(0.0, 0.95, 7) ** 0.85]   # short of a single point: its rim's tube needs a
                                                                    # length between each pair of its points
            hn = np.array(rows)
            solid(m, hn, thick, S_PLATE, closed=False, inward=lambda g: np.broadcast_to([0.0, 1.0, 0.0], g.shape))
            _rim(m, hn, max(rim, 0.004))
        if p.get('tip'):   # a point jutting out past the arm off its foot's outer edge (adamantium's)
            q = _on_shell(c, radii, R, [lat[0] + 0.12], mid, 0.0)[0]
            spike(m, q, q + R @ np.array([x * p['tip'], 0.0, -0.25 * p['tip']]), 0.016 * size, S_PLATE)
        if p.get('fur'):   # iron's: fur over the cap
            pts = cap[len(cap) // 2][::2]
            _fur(m, s, pts, pts - c, 0.03, rows=2, seed=7 if side == 'L' else 9)
        _hang_all(parts, mat, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


# -- the gauntlets

def gauntlets(parts, fit, mat):
    """The gauntlets: a vambrace up the forearm with a ridge down its outer side, a cuff flaring at the wrist; the
    hands covered after (`gauntlet_hands`). Leather is a laced bracer; mail a sleeve."""
    s, kind = fit.s, fit.kind
    for side in 'LR':
        m = Mesh()
        out = 0.0 if side == 'L' else math.pi
        region = [f'arm_{side}']
        wrist, elbow = arm_z(0.972) - 0.04, rest(f'farm_{side}')[2] - 0.025
        # a set may wear its bracers in its dark plate, as Daggerfall's medium fighter does (`dark_bracers`)
        slot = {'leather': S_LEATHER, 'chain': S_MAIL}.get(kind, S_SHADE if s.get('dark_bracers') else S_PLATE)
        g = fit.band(region, np.linspace(elbow, wrist + 0.05, 6), 0.005,
                     keel_h=0.005 if kind == 'plate' else 0.0, facing=out)
        solid(m, g, s.get('thick', 0.006) * 0.8, slot)
        if s.get('bracer') == 'strapped':   # the thieves': a snug leather bracer, two straps round it
            fl = fit.band(region, np.linspace(elbow, wrist + 0.03, 6), 0.008, keel_h=0.0, facing=out)
            solid(m, fl, s.get('thick', 0.006), slot)
            _edge(m, fl, 0, 0.0035, S_STRAP)
            _edge(m, fl, len(fl) - 1, 0.0035, S_STRAP)
            for z in (wrist + 0.06, wrist + 0.13):
                sg = fit.band(region, [z + 0.008, z - 0.008], 0.012, keel_h=0.0, facing=out)
                solid(m, sg, 0.003, S_STRAP)
        elif s.get('bracer') == 'banded':   # the brotherhood's: a snug crimson bracer, three black bands round it
            br = fit.band(region, np.linspace(elbow, wrist + 0.03, 6), 0.009, keel_h=0.0, facing=out)
            solid(m, br, s.get('thick', 0.006), S_TRIM)
            for z in np.linspace(wrist + 0.05, elbow - 0.02, 3):
                solid(m, fit.band(region, [z + 0.006, z - 0.006], 0.013, keel_h=0.0, facing=out), 0.003, S_PLATE)
        elif s.get('bracer') == 'laced':   # the mages': a brown bracer laced up its back, crossing
            br = fit.band(region, np.linspace(elbow, wrist + 0.03, 6), 0.009, keel_h=0.0, facing=out)
            solid(m, br, s.get('thick', 0.006), S_TRIM)
            _edge(m, br, 0, 0.0035, S_TRIM)
            back = math.pi / 2   # its back, away from the eye at rest
            zs = np.linspace(elbow - 0.02, wrist + 0.05, 6)
            pts = [fit.band(region, [z], 0.0145, th=[back + (0.35 if k % 2 else -0.35)], keel_h=0.0)[0, 0]
                   for k, z in enumerate(zs)]
            for a, b in zip(pts, pts[1:]):
                tube(m, [a, b], 0.002, S_GLOW, n=4)
        elif kind == 'leather':   # laced: bands round the bracer
            for t in np.linspace(0.15, 0.85, 4):
                z = elbow - (elbow - wrist - 0.05) * t
                solid(m, fit.band(region, [z + 0.004, z - 0.004], 0.008, keel_h=0.0), 0.003, S_STRAP)
        elif s.get('plain'):   # Daggerfall's guard: the vambrace smooth to the wrist, flaring a little there
            cf = fit.band(region, np.linspace(wrist + 0.06, wrist - 0.005, 4),
                          lambda z: 0.007 + 0.08 * max(0.0, z - wrist), facing=out)
            solid(m, cf, s.get('thick', 0.006), slot)
            if s.get('bracer_trim'):   # a bright rim rolled round each end of a dark bracer
                tube(m, _out(g, 0, 0.004)[0], 0.0045, S_TRIM, n=6, closed=True)
                tube(m, _out(cf, len(cf) - 1, 0.004)[0], 0.0045, S_TRIM, n=6, closed=True)
        else:   # the cuff: flaring from the wrist, rolled at its lip; the vambrace's top rolled
            _edge(m, g, 0, max(s.get('edge', 0.0), 0.005) * 0.8, S_TRIM if kind == 'plate' else S_LEATHER)
            cuff = fit.band(region, np.linspace(wrist + 0.07, wrist - 0.005, 4),
                            lambda z: 0.008 + (0.16 * max(0.0, z - wrist) if kind == 'plate' else 0.0),
                            facing=out, toothed=True)
            solid(m, cuff, s.get('thick', 0.006), slot)
            tube(m, _out(cuff, 0, 0.004)[0], max(s.get('edge', 0.0), 0.005), S_TRIM if kind == 'plate' else S_LEATHER,
                 n=6, closed=True)
            if s.get('spirals') and kind == 'plate':   # a spiral boss on the forearm's outer side, by the elbow
                p, o = _out(g, 1, s.get('thick', 0.006))
                k = int(np.argmax(o[:, 0] * (1.0 if side == 'L' else -1.0)))
                _spiral(m, p[k], o[k], 0.03)
            if s.get('fins') and kind == 'plate':   # daedric: blades off the forearm's outer side, swept to the elbow
                for row, length in ((1, 0.08), (3, 0.065)):
                    p, o = _out(g, row, s.get('thick', 0.006))
                    k = int(np.argmax(o[:, 0] * (1.0 if side == 'L' else -1.0)))
                    way = o[k] * 0.55 + np.array([0.0, 0.0, 0.85])
                    spike(m, p[k], p[k] + way / np.linalg.norm(way) * length, 0.02, S_PLATE, n=6)
        _hang_all(parts, mat, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def _hand_plates(m, x, closed, style, kind):
    """A gauntlet's plates over a hand, open or closed: one broad plate over the back of the hand and one across the
    knuckles, the fingers in the glove under them (a finger's lames would be finer than a sprite's pixel). In rest
    space. Leather is a padded back and a knuckle pad."""
    P0 = model.hand_frame(x)
    P = lambda o, f, d: np.array(P0(o, f, d))   # noqa: E731
    slot = S_PLATE if kind == 'plate' else S_TRIM if style.get('cloth') else S_LEATHER
    th = 0.002
    back = P(1, 0, 0) - P(0, 0, 0)
    down = P(0, 0, 1) - P(0, 0, 0)
    knots = [0.0, 0.04, 0.07, 0.095]
    o_back = np.interp(knots, knots, [0.022, 0.026, 0.039, 0.041] if closed else [0.023, 0.0225, 0.0195, 0.0175])
    fs = np.linspace(-0.036, 0.038, 11)
    grid = [[P(np.interp(d, knots, o_back) + 0.006 - 0.011 * (f / 0.036) ** 2, f, d) for f in fs]
            for d in np.linspace(0.004, 0.078, 6)]
    solid(m, grid, th * 1.5, slot, closed=False, inward=lambda g: -np.broadcast_to(back, g.shape))
    if closed:   # the knuckles' plate, across the hand
        kc = lambda f: P(0.021, f, model.knuckle_at(0.093) - 0.003)   # noqa: E731
        dorsal = back * 0.6 + down * 0.8
    else:
        kc = lambda f: P(0.002, f, 0.084)   # noqa: E731
        dorsal = back
    sleeve(m, kc(-0.038), kc(0.042), 0.02, dorsal, 1.2, th * 1.5, S_PLATE if kind == 'plate' else S_STRAP, rows=3,
           cols=9)


def gauntlet_hands(hands, mat, style):
    """The gauntlets over the hands: each hand's open and closed mesh again a few millimetres out, a glove of leather
    (or mail), and over it its plates (`_hand_plates`), shaped as the hand is. Gives (the hand's object's name, a
    cover), each to be shown and moved with that hand."""
    import bpy
    from armourmakes import hand_of
    kind = style.get('kind', 'plate')
    glove = style.get('glove') or ('strap' if style.get('cloth') else   # cloth's gloves are its trim's leather; the
                                   {'leather': 'leather', 'chain': 'mail'}.get(kind, 'strap'))   # fighters' its steel
    out = []
    for side, kinds in hands.items():
        x = 1.0 if side == 'L' else -1.0
        J = np.array(rest(f'hand_{side}'))
        for kname, ob in kinds.items():
            me = ob.data.copy()
            co = np.array([v.co[:] for v in me.vertices])
            n = np.array([v.normal[:] for v in me.vertices])
            me.vertices.foreach_set('co', (co + n * 0.0025).ravel())
            me.materials.clear()
            me.materials.append(mat[glove])
            me.update()
            cover = bpy.data.objects.new(f'armour_gauntlets.{ob.name}', me)
            bpy.context.scene.collection.objects.link(cover)
            for mod in ob.modifiers:
                if mod.type == 'SUBSURF':
                    sub = cover.modifiers.new('subsurf', 'SUBSURF')
                    sub.levels = sub.render_levels = mod.render_levels
            out.append((ob.name, cover))
            if kind == 'chain':
                continue
            m = Mesh()
            _hand_plates(m, x, kname == 'fist', style, kind)
            own = hand_of(style)   # what the set lays over its hand of its own: studs, spikes, claws, a bar
            if own:
                own(m, x, kname == 'fist', model.hand_frame(x))
            m.v = [shape.transform(f'hand_{side}', v - J) for v in m.v]
            out.append((ob.name, m.object(f'armour_gauntlets.{ob.name}.plates', _mats(mat))))
    return out


# -- the greaves and boots

def greaves(parts, fit, mat):
    """The greaves: a cuisse over the front and sides of the thigh with a ridge, a lame over the knee, a poleyn's
    cop over it winged on its outer side, a lame under, and a greave round the shin keeled down its front. Leather is
    a quilted legging with a knee guard; mail chausses. Where the culture wears no cuisses the thigh is bare of them
    (the padding, or what is worn there, shows): leather from the knee down, mail from just above it, gartered."""
    s, kind = fit.s, fit.kind
    thick = s.get('thick', 0.007)
    gap = max(0.007, s.get('gap', 0.01) * 0.75)
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        region = [f'leg_{side}']
        kz = rest(f'shin_{side}')[2] + 0.005
        front = -math.pi / 2
        if kind != 'plate':
            slot = S_MAIL if kind == 'chain' else S_LEATHER
            off = s.get('gap', 0.01)   # clear of the padding and the breeches worn under it, as a plate set's gap is
            if s['cuisse']:
                solid(thigh, fit.band(region, np.linspace(0.96, 0.6, 6), off, keel_h=0.0), 0.004, slot)
                solid(shin, fit.band(region, np.linspace(0.6, 0.2, 5), off, keel_h=0.0), 0.004, slot)
            else:
                top = kz + (0.08 if kind == 'chain' else -0.06 if s.get('boot_cuff') else s.get('boot_top', 0.03))
                trims = s.get('trim_pieces', ())   # the brotherhood's crimson
                solid(shin, fit.band(region, np.linspace(top, 0.2, 6), off, keel_h=0.0), 0.004,
                      S_TRIM if 'shins' in trims else slot)
                if s.get('thigh_plates'):   # the brotherhood's: a crimson plate down the thigh's front, pointed at
                    tp = fit.band(region, np.linspace(0.9, kz + 0.12, 6), 0.009, th=np.linspace(front - 0.75,   # each end
                                  front + 0.75, 13), keel_h=0.0, top=lambda t: 0.04 * _toward(t, front, 0.75),
                                  hem=lambda t: 0.05 * _toward(t, front, 0.75))
                    solid(thigh, tp, 0.004, S_TRIM, closed=False)
                    _rim(thigh, tp, 0.003, S_PLATE)
                if s.get('boot_cuff'):   # the thieves': the boot's top turned down in a cuff flaring under the knee
                    cuff = fit.band(region, np.linspace(top + 0.008, top - 0.07, 4),
                                    lambda z: 0.01 + 0.12 * max(0.0, z - (top - 0.07)), keel_h=0.0)
                    solid(shin, cuff, 0.004, slot)
                    _edge(shin, cuff, len(cuff) - 1, 0.0035, S_STRAP)
                if kind == 'chain':
                    solid(shin, fit.band(region, [top + 0.004, top - 0.012], off + 0.003, keel_h=0.0), 0.003, S_STRAP)
                if s.get('boot_lace'):   # the mages': the boot's top rolled, and laced up its front, crossing
                    _edge(shin, fit.band(region, [top + 0.004, top - 0.01], 0.008, keel_h=0.0), 0, 0.0035, S_STRAP)
                    zs = np.linspace(top - 0.03, 0.14, 7)
                    pts = [fit.band(region, [z], 0.011, th=[front + (0.3 if k % 2 else -0.3)], keel_h=0.0)[0, 0]
                           for k, z in enumerate(zs)]
                    for a, b in zip(pts, pts[1:]):
                        tube(shin, [a, b], 0.0022, S_GLOW, n=4)
            if kind == 'leather':   # quilted rings down the thigh, a knee guard
                for z in np.linspace(0.92, 0.64, 5) if s['cuisse'] else ():
                    solid(thigh, fit.band(region, [z + 0.006, z - 0.006], 0.009, keel_h=0.0), 0.003, S_STRAP)
                if s.get('knee_pads'):   # a padded leather knee, rimmed (the brotherhood's crimson)
                    _cop(fit, shin, region, kz + 0.005, front, 0.012, 0.06, 0.016, span=1.3,
                         slot=S_TRIM if 'knees' in s.get('trim_pieces', ()) else S_LEATHER)
                elif s.get('knee_guard', True):
                    _cop(fit, shin, region, kz, front, 0.01, 0.05, 0.008, span=1.2, slot=S_STRAP)
        else:
            span = np.linspace(front - 1.85, front + 1.85, 29)   # far enough round that no open edge shows inside
            plain = s.get('plain')   # Daggerfall's guard: smooth plates, a round knee, no rims, wings or lames
            if s['cuisse']:
                g = fit.band(region, np.linspace(0.9, kz + 0.07, 6), gap, th=span, keel_h=s.get('keel', 0.006) * 0.6)
                solid(thigh, g, thick, S_SHADE if plain else S_PLATE, closed=False)
                if not plain:
                    _rim(thigh, g, max(s.get('edge', 0.0), 0.005))
            boot = s.get('boot_greave')   # orcish: a tall boot to under the knee, no knee plates over it
            if not plain and not boot:
                lg = fit.band(region, np.linspace(kz + 0.085, kz + 0.035, 3), gap + 0.002, th=span)
                solid(thigh, lg, thick * 0.9, S_PLATE, closed=False)
                _edge(thigh, lg, len(lg) - 1, max(s.get('edge', 0.0), 0.005) * 0.8, closed=False)
            cop = None if boot else _cop(fit, shin, region, kz + 0.01, front, gap + 0.004, 0.085, 0.022,   # a bold
                                         span=1.45, wing=None if plain else front + 1.2 * x)              # knee
            if s.get('knee_point') and cop is not None:   # ebony's: its top drawn up over the thigh to a point
                q = cop[1, cop.shape[1] // 2]
                o = q - np.array([*fit.outline(region, kz + 0.01)[0], kz + 0.01])
                o[2] = 0.0
                o /= np.linalg.norm(o)
                spike(shin, q - np.array([0.0, 0.0, 0.01]), q + o * 0.016 + np.array([0.0, 0.0, 0.08]), 0.026,
                      S_PLATE, n=6)
            if s.get('spirals') and cop is not None:   # a spiral boss at its heart
                q = cop[len(cop) // 2, cop.shape[1] // 2]
                o = q - np.array([*fit.outline(region, kz + 0.01)[0], kz + 0.01])
                o[2] = 0.0
                _spiral(shin, q, o, 0.032)
            if boot:   # its top flared out under the knee, its shin a plate drawn down to a point, fur round the ankle
                g2 = fit.band(region, np.linspace(kz - 0.035, 0.13, 9),
                              lambda z: gap + 0.012 * np.clip((z - (kz - 0.1)) / 0.065, 0.0, 1.0),
                              keel_h=0.004)
                solid(shin, g2, thick, S_PLATE)
                vp = fit.band(region, np.linspace(kz - 0.05, 0.3, 6), gap + thick + 0.004,
                              th=np.linspace(front - 0.95, front + 0.95, 15), keel_h=0.004,
                              hem=lambda t: 0.08 * _toward(t, front, 0.95) ** 1.2)
                solid(shin, vp, thick * 0.8, S_PLATE, closed=False)
                _rim(shin, vp, max(s.get('edge', 0.0), 0.005))
                if s.get('ankle_fur'):
                    pts, o = _out(fit.band(region, [0.14], gap + thick), 0)
                    _fur(shin, s, pts, o, 0.022, rows=1, seed=5 if x > 0 else 6, closed=True)
            else:
                g2 = fit.band(region, np.linspace(kz - 0.07, 0.15, 8), gap, keel_h=s.get('keel', 0.006) * 0.6 + 0.004)
                solid(shin, g2, thick, S_PLATE)
            for row, length in ((2, 0.085), (5, 0.07)) if s.get('fins') not in (None, False, 'arms') else ():   # daedric's: off the shin's
                q, o = _out(g2, row, thick)                                      # outer side, swept up and back
                k = int(np.argmax(o[:, 0] * x))
                way = o[k] * 0.6 + np.array([0.0, 0.3, 0.75])
                spike(shin, q[k], q[k] + way / np.linalg.norm(way) * length, 0.02, S_PLATE, n=6)
            if s.get('greave_strap'):   # the fighters': a band of leather round the greave's top, under the knee
                solid(shin, fit.band(region, [kz - 0.075, kz - 0.105], gap + thick + 0.002,
                                     keel_h=s.get('keel', 0.006) * 0.6 + 0.004), 0.004, S_STRAP)
            for zb in ((kz - 0.1, 0.2) if s.get('greave_bands') else ()):   # raised bands round it, under the knee
                solid(shin, fit.band(region, [zb + 0.012, zb - 0.012], gap + thick + 0.001,   # and over the ankle
                                     keel_h=s.get('keel', 0.006) * 0.6 + 0.004), 0.005, S_TRIM)
            if not plain:
                _edge(shin, g2, 0, max(s.get('edge', 0.0), 0.005))
                _edge(shin, g2, len(g2) - 1, max(s.get('edge', 0.0), 0.005))
        _hang_all(parts, mat, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def _foot_rows(fit, side, ys, gap, th, keel_h=0.0):
    return fit.rings([f'barefoot_{side}'], ys, gap, th=th, keel_h=keel_h, facing=math.pi / 2, axis=1, dz=0.008)


def _shut(grid, ys, scales, drop=0.0):
    """Rows past a plate's end that draw its last row in to a point: each the last scaled about its middle by
    `scales`, at `ys` along Y, lowered `drop` at the last."""
    last = np.asarray(grid[-1], float)
    c = last.mean(axis=0)
    rows = []
    for k, (y, sc) in enumerate(zip(ys, scales)):
        row = c + (last - c) * sc
        row[:, 1] = y
        row[:, 2] -= drop * (k + 1) / len(ys)
        rows.append(row)
    return np.concatenate([grid, rows])


def boots(parts, fit, mat):
    """The boots: a shaft from the shin to the ankle, rolled at its top, and sabatons over the foot fitted to it - a
    heel cup, lames from the ankle each over the next, a toe cap rounded, pointed, squared or clawed by the culture,
    on a sole of dark leather. Leather boots are one smooth shell with a strap and buckle at the ankle and a seam
    down the instep."""
    s, kind = fit.s, fit.kind
    plate = kind == 'plate'
    thick = s.get('thick', 0.006) * 0.8
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        region = [f'leg_{side}']
        slot = S_PLATE if plate else S_TRIM if 'boots' in s.get('trim_pieces', ()) else S_LEATHER
        # under mail chausses the boot stops just past their foot: a shaft beneath them would show through the rings
        top, rows = (0.22, 5) if kind == 'chain' else (0.36, 8)
        # the shaft run on down over the foot's top, so as the ankle bends in a stride no gap opens between it (on the
        # shin) and the foot's shell (on the foot) for the bare ankle to show through
        g = fit.band(region, np.linspace(top, 0.03, rows + 1), 0.006, keel_h=s.get('keel', 0.0) * 0.3 if plate else 0.0)
        solid(sh, g, thick, slot)
        if plate and s.get('plain'):   # Daggerfall's cuffed boot in plate: a smooth shaft under a turned-down cuff
            solid(sh, fit.band(region, np.linspace(0.37, 0.30, 4), 0.016, keel_h=0.0), thick, S_PLATE)
        elif plate:
            _edge(sh, g, 0, max(s.get('edge', 0.0), 0.005))
            for z in (0.12, 0.085):   # two lames round the ankle
                ag = fit.band(region, np.linspace(z + 0.02, z - 0.02, 3), 0.008)
                solid(sh, ag, thick, S_PLATE)
                _edge(sh, ag, len(ag) - 1, max(s.get('edge', 0.0), 0.005) * 0.8)
        elif s.get('boot_strap', True):   # a strap and buckle at the ankle
            sg = fit.band(region, [0.17, 0.145], 0.008, keel_h=0.0)
            solid(sh, sg, 0.004, S_STRAP)
            p, o = _out(sg, 1)
            k = int(np.argmax(p[:, 0] * x))
            box(sh, (sg[0, k] + sg[1, k]) / 2 + o[k] * 0.004, (0.026, 0.022, 0.006), o[k], (0, 0, 1), S_TRIM)
        pts = fit.body.rest[fit.piece == f'barefoot_{side}']
        heel, toe = float(pts[:, 1].max()) - 0.004, float(pts[:, 1].min()) + 0.004
        over = np.linspace(-0.4, math.pi + 0.4, 21)   # from the foot's outer side over its top to its inner
        under = np.linspace(math.pi + 0.4, TAU - 0.4, 9)
        kh = s.get('keel', 0.0) * 0.3 if plate else 0.0
        # the heel cup, shut behind the heel
        # its back wrapped right round the heel and shut to a point: an arch over its top and sides alone, drawn in,
        # left the back of the heel open below, and the bare heel showed through it from behind in a stride
        ring = angles(32)
        back = _foot_rows(fit, side, np.linspace(heel - 0.03, heel, 3), 0.005, ring, kh)
        back = _shut(back, [heel + 0.007, heel + 0.011, heel + 0.013], [0.65, 0.25, 0.0])
        solid(ft, back, thick, slot, closed=True, inward=lambda gg: _toward_axis(gg))
        cup = _foot_rows(fit, side, np.linspace(0.02, heel - 0.025, 4), 0.005, over, kh)
        solid(ft, cup, thick, slot, closed=False, inward=lambda gg: _toward_axis(gg))
        # the sole, heel to toe
        sole = _foot_rows(fit, side, np.linspace(heel, toe, 12), 0.003, under)
        solid(ft, sole, 0.006, S_DARK, closed=False, inward=lambda gg: _toward_axis(gg))
        # plate leaves the instep to its lames; leather is one smooth shell from the ankle to the toe
        toe_y = np.linspace(toe + 0.06, toe, 5) if plate else np.linspace(0.025, toe, 12)
        if plate:
            n = 1 if s.get('plain') else 2
            ys = np.linspace(0.025, toe + 0.05, n + 1)
            for k in range(n):   # the lames, from the ankle down the foot, each over the next
                rows = _foot_rows(fit, side, np.linspace(ys[k] + 0.008, ys[k + 1], 3), 0.005 + 0.0015 * (n - k),
                                  over, kh)
                solid(ft, rows, thick, S_PLATE, closed=False, inward=lambda gg: _toward_axis(gg))
                if not s.get('plain'):
                    tube(ft, _out(rows, len(rows) - 1, 0.001, axis=1)[0], max(s.get('edge', 0.0), 0.005) * 0.8,
                         S_TRIM, n=5)
        cap = _foot_rows(fit, side, toe_y, 0.005, over, kh)
        make = s.get('toe', 'round')
        if make == 'point' and plate:
            cap = _shut(cap, toe - np.array([0.012, 0.026, 0.042]), [0.75, 0.42, 0.06], drop=0.01)
        elif make == 'square' and plate:
            cap = _shut(cap, toe - np.array([0.006, 0.009]), [0.96, 0.3])
        elif make == 'claw' and plate:
            cap = _shut(cap, toe - np.array([0.008, 0.016]), [0.8, 0.35])
        else:
            cap = _shut(cap, toe - np.array([0.006, 0.011]), [0.7, 0.25])
        solid(ft, cap, thick, slot, closed=False, inward=lambda gg: _toward_axis(gg))
        if plate and not s.get('plain'):
            tube(ft, _out(cap, 0, 0.001, axis=1)[0], max(s.get('edge', 0.0), 0.005) * 0.8, S_TRIM, n=5)
        if make == 'claw' and plate:   # three claws off the toe
            for a in (math.pi / 2 - 0.7, math.pi / 2, math.pi / 2 + 0.7):
                k = int(np.argmin(np.abs(over - a)))
                b = cap[len(toe_y) - 1, k]
                spike(ft, b, b + np.array([0.0, -0.045, -0.012]), 0.008, S_TRIM, n=5, curve=(0, 0, -0.01))
        if not plate:   # the seam down the instep
            seam = _foot_rows(fit, side, np.linspace(0.02, toe + 0.01, 8), 0.006, [math.pi / 2])[:, 0]
            tube(ft, seam, 0.0016, S_STRAP, n=4)
        _hang_all(parts, mat, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


def _toward_axis(g):
    """Each point of a foot's plate toward the middle of its row, across Y."""
    c = g.mean(axis=1, keepdims=True)
    d = c - g
    d[..., 1] = 0
    return d


# -- the helm

HORNS = {   # (points from the temple, metres off the skull's centre; the root's radius)
    'horned': ([(0.07, -0.01, 0.035), (0.12, -0.015, 0.035), (0.165, -0.025, 0.06), (0.19, -0.035, 0.1),
                (0.195, -0.05, 0.145), (0.18, -0.065, 0.18)], 0.034),   # out wide from the temples, then curling up
    'winged': ([(0.08, 0.0, 0.08), (0.12, 0.03, 0.13), (0.13, 0.08, 0.18)], 0.02),
    # daedric's: up from high on the skull's sides, bowed a little out, their tips turned in: a crescent over the crown
    'daedric': ([(0.05, 0.0, 0.075), (0.09, 0.0, 0.13), (0.115, 0.005, 0.19), (0.117, 0.01, 0.25),
                 (0.097, 0.01, 0.305), (0.062, 0.0, 0.345), (0.035, -0.01, 0.37)], 0.034),
    # the woman medium fighter's: out from high on the bowl and up in a crescent, their tips turned in
    'bowl_horned': ([(0.07, 0.0, 0.055), (0.11, 0.0, 0.065), (0.145, 0.004, 0.09), (0.165, 0.008, 0.125),
                     (0.162, 0.01, 0.165), (0.145, 0.01, 0.195)], 0.024),
}


def head(fit):
    """The head a helm is fitted to: its centre, where the head's own is (a head sized or set higher on its neck,
    shape.py, carries it along), and its radii across, front to back and up."""
    j = rest('head')[2]
    hz = j + (1.655 - j) * shape.SHAPE.get('head', 1.0) + shape.SHAPE.get('head_dz', 0.0)
    c, r = fit.O.at(['skull'], hz + 0.005)
    full = angles(len(r))
    rx = float(np.interp(0.0, full, r, period=TAU)) + 0.01
    ry = float(np.interp(-math.pi / 2, full, r, period=TAU) + np.interp(math.pi / 2, full, r, period=TAU)) / 2 + 0.012
    rz = float(fit.body.rest[fit.piece == 'skull'][:, 2].max()) - hz + 0.012
    return np.array([c[0], c[1], hz]), (rx, ry, rz)


def skull(fit, hc, radii, tall=1.0, wide=(1.0, 1.0), above=0.0):
    """A helm's skull about the head: its radii, `tall` times the head's height, grown until the cranium's back and
    crown lie a few millimetres inside it (the head is no ellipsoid), `wide` across and front to back; the latitude of
    its brow across the forehead, read off this head's own face (seven tenths of the way up it, so the eyes show under
    it on either body), `above` higher; and the skull's points."""
    rx, ry, rz = radii
    skull_r = np.array([rx, ry, rz * tall])
    p = fit.body.rest[fit.piece == 'skull']
    cranium = p[(p[:, 2] > hc[2] - 0.05) & ((p[:, 1] > hc[1] - 0.02) | (p[:, 2] > hc[2] + 0.06))]
    reach = np.sqrt((((cranium - hc) / (skull_r - 0.006)) ** 2).sum(axis=1)).max()
    skull_r = skull_r * max(1.0, reach) * np.array([wide[0], wide[1], 1.0])
    face = p[p[:, 1] < p[:, 1].min() + 0.03]
    brow = face[:, 2].min() + 0.71 * (face[:, 2].max() - face[:, 2].min()) + above
    return skull_r, float(np.arcsin(np.clip((brow - hc[2]) / skull_r[2], -0.9, 0.3))), p


HELM_POINT = {'guard': 0.32, 'pointed': 0.45, 'bowl': 0.12, 'bowl_horned': 0.12, 'elven': 0.22}   # how far a crown is drawn up


def helm(parts, fit, mat):
    """The helm, by its make, fitted to the head: its skull with a comb down the crown, its brow rolled, cheek plates
    (unless the style has no `cheeks`), the face showing under it as Daggerfall's armoured folk show theirs. What
    crowns it tells the culture: iron's horns, mithril's wings, elven fans, a dwarven crest, adamantium's blade,
    ebony fins, orcish tusks, daedric horns. Leather is a cap with ear flaps and fur; chain a coif open at the face; a
    kettle hat a cap over a broad brim. A style may add a `nasal`, an `aventail` of mail, or a `mask` closing the
    face."""
    s, kind, make = fit.s, fit.kind, fit.s['helm']
    m = Mesh()
    hc, (rx, ry, rz) = head(fit)
    thick = s.get('thick', 0.007)
    if make == 'coif':   # open at the face alone, closed over the brow and crown, a dark band round the brow
        radii = np.array([rx + 0.004, ry + 0.004, rz + 0.01])
        cap_band(m, hc + np.array([0, 0.005, 0]), radii, (-0.75, 0.37),
                 (-math.pi / 2 + 0.75, 3 * math.pi / 2 - 0.75), 0.005, S_MAIL, rows=8, cols=28)
        cap_band(m, hc + np.array([0, 0.005, 0]), radii, (0.33, 1.57), (0, TAU), 0.005, S_MAIL, rows=6, cols=32)
        cap_band(m, hc + np.array([0, 0.005, 0]), np.array([rx + 0.01, ry + 0.01, rz + 0.016]), (0.32, 0.42),
                 (0, TAU), 0.004, S_STRAP, rows=1, cols=32)
        _hang_all(parts, mat, [('armour_helm', m, 'head')])
        return
    tall = {'knight': 1.16, 'elven': 1.15, 'dwarven': 1.04, 'mithril': 1.12, 'adamantium': 1.12, 'sallet': 1.04, 'ebony': 1.14, 'kettle': 1.02,
            'daedric': 1.04, 'guard': 1.12, 'pointed': 1.16, 'bowl': 1.06, 'bowl_horned': 1.06}.get(make, 1.0)
    tall = s.get('helm_tall', tall)
    bowl = make.startswith('bowl')   # the medium fighter's: broad and round, cheek plates down to the jaw
    cols = {'dwarven': 8, 'orcish': 14, 'daedric': 16}.get(make, 32)
    wide = s.get('helm_wide', (1.25, 1.1)) if bowl else (1.0, 1.0)   # the bowl broad over the head, unless the style
    skull_r, low, p = skull(fit, hc, (rx, ry, rz), tall, wide, 0.012 if make == 'cap' else 0.0)   # draws it in
    rx, ry, rz = skull_r[0], skull_r[1], skull_r[2] / tall
    if make == 'hood':   # the thieves': a leather hood, loose over the head and drawn up to a soft peak leaning
        front = -math.pi / 2   # forward, low over the brow at the front so the eyes lie in its shadow; its sides and
        close = s.get('hood_fit') == 'close'   # the brotherhood's: close round the head, hardly peaked
        R = skull_r + (np.array([0.008, 0.01, 0.008]) if close else np.array([0.016, 0.02, 0.016]))   # back down past
        c0 = hc + np.array([0.0, 0.004, 0.0])   # the jaw, the face open, its edges seamed
        lean = rot((1, 0, 0), 0 if close else 6)
        crown = cap_band(m, c0, R, (low + 0.02, 1.5707), (0, TAU), thick, S_LEATHER, tilt=lean, rows=10, cols=32,
                         edge=lambda b: s.get('hood_brow', 0.03 if close else 0.06) * float(_toward(b, front, 0.9)),
                         point=s.get('helm_point', 0.05 if close else 0.16))
        sides = cap_band(m, c0, R, (-1.2, low), (front + 0.85, front + TAU - 0.85), thick, S_LEATHER, tilt=lean,
                         rows=8, cols=24)
        edge = S_LEATHER if s.get('crimson') else S_STRAP   # the brotherhood's in its black: its straps are crimson
        ring = _out(crown, 0, 0.002)[0]   # the crown's foot rolled all round, closing its seam with the sides, in the
        tube(m, ring, 0.0045, S_LEATHER, n=5, closed=True)   # hood's own leather; its brow, over the face alone,
        brow = _out(crown, 0, 0.0035)[0]                      # turned back in its edge's
        at = np.arctan2(brow[:, 1] - c0[1], brow[:, 0] - c0[0])
        brow = np.roll(brow, -int(np.argmax(np.abs((at - front + math.pi) % TAU - math.pi))), axis=0)
        at = np.arctan2(brow[:, 1] - c0[1], brow[:, 0] - c0[0])
        tube(m, brow[np.abs((at - front + math.pi) % TAU - math.pi) < 0.85], 0.0047, edge, n=5)
        for j in (0, sides.shape[1] - 1):   # and the face's edge down each side
            tube(m, sides[:, j], 0.0045, edge, n=5)
        _hang_all(parts, mat, [('armour_helm', m, 'head')])
        return
    tilt = rot((1, 0, 0), -8 if make == 'elven' else 0)
    nape = None if make in ('cap', 'kettle') else (lambda b: 0.55 * float(_toward(b, math.pi / 2, 1.5)))   # the nape
    # its bowl and cheek plates dark (`helm_shade`) where Daggerfall draws a dark helm, the light caught on its crown
    shell = (S_SHADE if s.get('helm_shade') else S_PLATE) if kind == 'plate' else S_LEATHER
    sk = cap_band(m, hc, skull_r, (low, 1.5707), (0, TAU), thick, shell,
                  tilt=tilt, rows=10, cols=cols, edge=nape,
                  point=s.get('helm_point', HELM_POINT.get(make, 0.0)))
    if make == 'kettle':   # a watchman's kettle hat: a round cap over a broad brim sloping down, the face open
        inner, o = _out(sk, 0)
        outer = inner + o * s.get('brim', 0.045) - np.array([0.0, 0.0, 0.016])
        g = np.stack([inner + np.array([0.0, 0.0, 0.004]), outer])
        solid(m, g, thick * 0.8, S_PLATE)
        tube(m, outer, 0.004, S_PLATE, n=6, closed=True)   # its edge rolled
        _hang_all(parts, mat, [('armour_helm', m, 'head')])
        return
    if make == 'cap':   # leather: ear flaps up to its brim, fur round the brim
        for x in (1, -1):
            cap_band(m, hc, skull_r * 1.02, (-0.75, low + 0.08),
                     (-0.5, 0.5) if x > 0 else (math.pi - 0.5, math.pi + 0.5), 0.004, S_LEATHER, rows=3, cols=6)
        pts, o = _out(sk, 1)
        _fur(m, s, pts[::2], o[::2], 0.022 if s.get('fleece') else 0.04, seed=5, closed=True)
        _hang_all(parts, mat, [('armour_helm', m, 'head')])
        return
    if s.get('aventail'):   # mail from inside its rim down over the ears and the nape to the neck, the face open
        cap_band(m, hc + np.array([0, 0.004, 0]), skull_r * np.array([1.0, 1.0, 1.0 / tall]) + 0.004,
                 (-1.05, low + 0.12), (-math.pi / 2 + 0.85, 3 * math.pi / 2 - 0.85), 0.005, S_MAIL, rows=8, cols=28)
    plain = make in ('guard', 'pointed') or bowl or s.get('plain')   # Daggerfall's: smooth, no rim, brow, neck guard
    if not plain:
        tube(m, _out(sk, 0, 0.003)[0], max(s.get('edge', 0.0), 0.005), S_TRIM, n=6, closed=True)
        back = math.pi / 2
        # the brow: a band stepped out round the skull, its foot rolled
        brow = (low + 0.03, low + 0.16)
        bg = cap_band(m, hc, skull_r * 1.02, brow, (0, TAU), thick * 0.7, S_TRIM if kind == 'plate' else S_STRAP,
                      tilt=tilt, rows=1, cols=cols)
        tube(m, bg[0], 0.005, S_TRIM, n=5, closed=True)
        # the neck guard: two lames flaring out behind, each over the next
        for k in range(2):
            a0 = low - 0.02 - 0.17 * k
            cap_band(m, hc + np.array([0, 0.003 * k, 0.0]), skull_r * (1.015 + 0.02 * (k + 1)), (a0 - 0.2, a0),
                     (back - 1.35, back + 1.35), thick * 0.8, S_PLATE, tilt=tilt @ rot((1, 0, 0), -6 * (k + 1)),
                     rows=2, cols=max(8, cols // 2))
        # the comb down the crown, front (-Y) over the top to the back
        comb = {'fighters': 0.0, 'knight': 0.0, 'sallet': 0.05, 'elven': 0.07, 'adamantium': 0.025, 'ebony': 0.0, 'dwarven': 0.075, 'winged': 0.02,
                'mithril': 0.012, 'orcish': 0.0, 'daedric': 0.0, 'horned': 0.012}.get(make, 0.02)
        if comb:   # none on daedric's, whose horns crown it
            a = np.linspace(-1.2, 1.2, 15)
            line = hc + (tilt @ np.stack([np.zeros_like(a), -np.sin(a) * skull_r[1], np.cos(a) * skull_r[2]])).T
            up = line - hc
            up /= np.linalg.norm(up, axis=1, keepdims=True)
            h = comb * np.cos(a * 0.9) ** 0.5 * (np.linspace(0.6, 1.5, 15) if make in ('elven', 'ebony', 'daedric')
                                                 else np.linspace(0.4, 1.6, 15) if make == 'dwarven' else 1)   # rising back
            crown = line + up * h[:, None]
            solid(m, np.stack([line + [0.005, 0, 0], crown + [0.003, 0, 0]], axis=1), 0.01, S_TRIM, closed=False,
                  inward=lambda g: g - np.array([0.02, 0, 0]))
    if s.get('nasal'):   # a bar down over the nose from the rim
        cap_band(m, hc, skull_r + 0.006, (low - 0.42, low + 0.08), (-math.pi / 2 - 0.1, -math.pi / 2 + 0.1),
                 thick * 0.9, S_PLATE, rows=4, cols=3)
    for x in (1, -1) if s.get('cheeks', True) else ():   # cheek plates, the face open between them (the guard's narrow)
        a0 = -math.pi / 2 + (0.58 if bowl else 0.8 if plain else 0.55) * x
        w = 1.1 if bowl else 0.7 if plain else 0.95
        # a bowl's run up under its rim, so no skin shows between them and it seen from the side
        lat = (-0.8, low + 0.04) if bowl else (-0.9, low + 0.04) if make == 'elven' else (-0.85, -0.1)
        if make == 'elven':   # broad guards over the cheeks, run up under the rim, their front drawn down to a point
            a0, w = -math.pi / 2 + 0.5 * x, 1.35
        point = (lambda b, a=a0: 0.35 * max(0.0, 1.0 - abs(b - a) / 0.55)) if make == 'elven' else None
        cg = cap_band(m, hc, skull_r + (0.008 if bowl else 0.004), lat,
                      (min(a0, a0 + w * x), max(a0, a0 + w * x)), thick * 0.9, shell,
                      rows=5 if bowl else 4, cols=10 if bowl else 8, edge=point)
        if not plain:
            _rim(m, cg, 0.005)
    if s.get('mask'):   # a mask closing the face under the brow, out past the nose: a dark slit across the eyes, a
        front = -math.pi / 2   # ridge down the nose
        fr = np.array([skull_r[0] + 0.006, max(skull_r[1], hc[1] - p[:, 1].min()) + 0.01, skull_r[2]])
        wrap = s.get('mask_wrap', 0.95)   # how far round the face from its front (daedric's to the cheeks' backs)
        dark = s.get('mask_dark')   # ebony's: the whole face black under a lit brow, no slit cut in it
        mk = cap_band(m, hc, fr, (s.get('mask_low', -0.95), low + 0.06), (front - wrap, front + wrap), thick,
                      S_DARK if dark else shell, rows=7, cols=12)
        if not dark:
            _rim(m, mk, 0.004)
        if s.get('brow_v'):   # the helm's front, lit, run up over the crown, its foot drawn down to a point
            bp = cap_band(m, hc, fr + 0.003, (low - 0.03, 1.45), (front - 1.25, front + 1.25), thick, shell,   # between
                          rows=8, cols=18, edge=lambda b: s['brow_v'] * float(_toward(b, front, 1.25)) ** 1.3,   # the eyes
                          point=s.get('helm_point', 0.0))
            _edge(m, bp, 0, 0.0035, closed=False)   # only its foot rolled, so no line crosses the crown
            ridge = bp[:, bp.shape[1] // 2]   # a thin bright ridge down its middle, from the crown to the point
            tube(m, ridge + (ridge - hc) / np.linalg.norm(ridge - hc, axis=1, keepdims=True) * 0.002, 0.003, S_TRIM,
                 n=5)
        foot_s, top_s, half_s = s.get('slit', (0.24, 0.1, 0.62))   # its dark slit under the brow: how far under it
        for b in np.linspace(front - 0.42, front + 0.42, s.get('grille', 0)):   # the knights': upright slits instead,
            cap_band(m, hc, fr + 0.0025, (low - 0.62, low - 0.06), (b - 0.05, b + 0.05), 0.002, S_DARK, rows=4,
                     cols=2)   # far enough apart that the plate between them reads
        if not dark and not s.get('grille'):
            cap_band(m, hc, fr + 0.0025, (low - foot_s, low - top_s), (front - half_s, front + half_s), 0.002,
                     S_DARK, rows=3, cols=10)   # how far under it its foot and its top lie, half its breadth
                                                # (mithril's a broad dark visor to the jaw)
        if not dark and not s.get('grille'):   # a ridge down the nose
            tube(m, [hc + np.array([0.0, -(fr[1] + 0.004) * math.cos(t), fr[2] * math.sin(t)])
                     for t in np.linspace(low - 0.1, -0.55, 5)], 0.006, S_TRIM, n=6)
        if s.get('beak'):   # daedric's: a shield of a plate down the mask's middle from the brow, drawn to a point
            rows = []       # under the chin, its sides swept back, ridged down its middle
            for f in np.linspace(0.0, 1.0, 8):
                la = (low + 0.12) + (-1.2 - (low + 0.12)) * f
                w = s.get('beak_w', 0.046) * (1.0 - f) ** 0.8 + 0.003   # mithril's a narrow visor plate
                xs = np.linspace(-w, w, 7)
                front_y = hc[1] - fr[1] * max(math.cos(la), 0.78) - 0.009 - 0.01 * f
                rows.append(np.stack([hc[0] + xs, front_y + 0.012 * (xs / w) ** 2,
                                      np.full(len(xs), hc[2] + fr[2] * math.sin(la))], axis=1))
            bk = np.array(rows)
            solid(m, bk, thick, S_TRIM, closed=False, inward=lambda gg: np.broadcast_to([0.0, 1.0, 0.0], gg.shape))
            _rim(m, bk, 0.0035)
            tube(m, bk[:, 3] - np.array([0.0, 0.004, 0.0]), 0.005, S_TRIM, n=6)
    if s.get('crown_spike'):   # the knights': a spike standing up from the crown's point
        top = hc + tilt @ np.array([0.0, 0.0, skull_r[2]])
        spike(m, top - np.array([0.0, 0.0, 0.025]), top + np.array([0.0, 0.0, s['crown_spike']]), 0.016, S_TRIM, n=6)
    for x in (1, -1) if s.get('helm_spikes') else ():   # daedric's: spikes swept back off each side, at the temple
        for (oy, oz), (dx, dy, dz), r0 in (((0.01, 0.03), (0.07, 0.06, 0.05), 0.013),   # and by the jaw
                                            ((-0.005, -0.045), (0.06, 0.05, -0.005), 0.011)):
            base = hc + np.array([(skull_r[0] - 0.004) * x, oy, oz])
            spike(m, base, base + np.array([dx * x, dy, dz]), r0, S_TRIM, n=5)
    if bowl or s.get('neck_guard'):   # a dark guard flaring from the rim behind, down the neck to the shoulders
        back = math.pi / 2
        th = np.linspace(back - 1.75, back + 1.75, 21)
        z0 = hc[2] + math.sin(low - 0.04) * rz * tall   # from just under the rim, as broad as the bowl there
        rows = []
        for f in np.linspace(0.0, 1.0, 5):
            z = z0 + (1.49 - z0) * f
            k = math.cos(low - 0.04) + 0.3 * f
            rows.append(np.stack([hc[0] + rx * k * np.cos(th), hc[1] + 0.012 * f + ry * k * np.sin(th),
                                  np.full(len(th), z)], axis=1))
        solid(m, np.array(rows), thick * 0.8, S_SHADE, closed=False,
              inward=lambda g: np.stack([hc[0] - g[..., 0], hc[1] - g[..., 1], 0 * g[..., 2]], axis=-1))
    tube(m, [hc + np.array([0.0, -(ry + 0.008) * math.cos(t), rz * tall * math.sin(t)])
             for t in np.linspace(0.25, -0.38, 6)], 0.008, S_TRIM, n=6)
    if make in HORNS:
        pts, r0 = HORNS[make]
        past = max(0.0, skull_r[0] - 0.098)   # a broader helm than the man's: its horns start as far out of its side
        for x in (1, -1):
            P = np.array([hc + np.array([(px + past) * x, py, pz]) for px, py, pz in pts])
            t = np.linspace(0, 1, 12)
            Q = np.array([np.interp(t, np.linspace(0, 1, len(P)), P[:, k]) for k in range(3)]).T
            rad = r0 * (1 - t) ** (0.6 if make == 'daedric' else 0.9) + 0.003   # daedric's thick to near its tip
            tube(m, Q, rad, S_HORN if make in ('horned', 'bowl_horned') else S_SHADE if make == 'daedric'
                 else S_TRIM, n=8)   # bone, or metal: daedric's dark as its shell
    if make == 'elven':   # two plates layered along each side from the temple, swept up and back past the crown
        for x in (1, -1):
            side = 0.0 if x > 0 else math.pi
            for k in range(2):
                lo = (side - 0.25 * x, side + 1.25 * x)
                wg = cap_band(m, hc + np.array([0.0, 0.006 * k, 0.012 * k]), skull_r * (1.035 + 0.03 * k),
                              (low + 0.12 + 0.14 * k, 1.1 + 0.08 * k), (min(lo), max(lo)), thick * 0.8, S_PLATE,
                              tilt=tilt, rows=4, cols=9)
                _rim(m, wg, max(s.get('edge', 0.0), 0.004))
    for x in (1, -1) if s.get('feathers') else ():   # mithril's wings: thin feathers fanned up and back off each side
        base = hc + np.array([(skull_r[0] + 0.004) * x, 0.025, 0.02])
        n = s['feathers']
        for k in range(n):
            up = math.radians(30 + 50 * k / max(n - 1, 1))   # the lowest swept back, the highest nearly upright
            length = 0.21 - 0.015 * abs(k - (n - 1) / 2)
            tip = base + np.array([0.035 * x, math.cos(up) * length, math.sin(up) * length])
            spike(m, base + np.array([0.0, 0.004 * k, -0.006 * k]), tip, 0.013, S_TRIM, n=5, curve=(0.015 * x, 0.0, 0.0))
    if s.get('brim'):   # adamantium's: a visor's brim stood out round the front at the brow
        bb = cap_band(m, hc, skull_r + 0.013, (low - 0.05, low + 0.045), (-math.pi / 2 - 1.25, -math.pi / 2 + 1.25),
                      thick, S_TRIM, rows=2, cols=14)
        _rim(m, bb, 0.0035)
    if s.get('gem'):   # a gem over the brim, in the set's own lit colour (`seam`), ringed
        la = low + 0.17
        q = hc + np.array([0.0, -(skull_r[1] + 0.004) * math.cos(la), skull_r[2] * math.sin(la)])
        dome(m, q, 0.014, (0.0, -1.0, 0.25), S_GLOW, height=0.009)
        tube(m, [q + 0.016 * np.array([math.cos(t), -0.15, math.sin(t)]) for t in np.linspace(0.0, TAU, 13)], 0.003,
             S_TRIM, n=4, closed=True)
    for x in (1, -1) if s.get('cheek_blades') else ():   # ebony's: a long thin blade up each side from the jaw, bowed
        t = np.linspace(0.0, 1.0, 14)                      # out with the helm and on up past its crown to a point,
        z0, z1 = hc[2] - 0.085, hc[2] + skull_r[2] + s['cheek_blades']   # bright, framing the dark face
        spine = np.stack([hc[0] + (skull_r[0] + 0.007 + 0.028 * t ** 2.4) * x, hc[1] - 0.03 + 0.035 * t,
                          z0 + (z1 - z0) * t], axis=1)
        half = 0.011 * (1.0 - t) ** 0.6 + 0.0015
        across = np.array([0.6 * x, 1.0, 0.0]) / math.hypot(0.6, 1.0)   # turned a little to the front
        blade = np.stack([spine - np.outer(half, across), spine + np.outer(half, across)], axis=1)
        inside = np.array([-1.0 * x, 0.6, 0.0]) / math.hypot(1.0, 0.6)
        solid(m, blade, 0.007, S_TRIM, closed=False, inward=lambda g, d=inside: np.broadcast_to(d, g.shape))
    if s.get('crest_blade'):   # orcish: a blade standing on the helm's middle from the bridge of the nose up over
        a = np.linspace(low - 0.32, 2.3, 22)   # the forehead, tallest over the crown, its back run down behind it:
        line = hc + np.stack([np.zeros_like(a), -np.cos(a) * (skull_r[1] + 0.003), np.sin(a) * skull_r[2]], axis=1)
        out = (line - hc) / np.linalg.norm(line - hc, axis=1, keepdims=True)   # a ridge, never a tall hat
        peak = 1.35   # where along it it stands tallest, over the front of the crown
        h = s['crest_blade'] * np.where(a < peak, np.clip((a - a[0]) / (peak - a[0]), 0, 1) ** 1.6,
                                        np.clip((a[-1] - a) / (a[-1] - peak), 0, 1) ** 0.8)
        top = line + out * h[:, None] + np.outer(np.clip(h / s['crest_blade'], 0, 1), [0.0, -0.012, 0.0])
        wide = 0.02 * np.clip(h / s['crest_blade'] * 3, 0.3, 1.0)   # a ridge with sides, not a sheet: broad at its foot
        solid(m, np.stack([line - np.outer(wide, [1, 0, 0]), top, line + np.outer(wide, [1, 0, 0])], axis=1), 0.005,
              S_TRIM, closed=False, inward=hc)   # in the bright trim, so it reads against the sky and the helm
        tube(m, top, 0.004, S_TRIM, n=5)   # its edge rolled, so it reads as a line of light
        if s.get('topknot'):   # a dark topknot bound at its back, standing up and falling behind
            k = int(np.argmin(np.abs(a - 1.75)))
            base = top[k] + np.array([0.0, 0.0, -0.01])
            knot = [base + np.array([0.0, 0.03 * f ** 1.5, 0.06 * math.sin(f * 2.2)]) for f in np.linspace(0, 1, 8)]
            tube(m, knot, np.linspace(0.012, 0.005, 8), S_DARK, n=6)
        for x in (1, -1):   # leaf ribs fanned back along each side from the crest's foot
            for k in range(s.get('leaf_ribs', 0)):
                la = np.linspace(0.95 - 0.2 * k, 0.25 - 0.12 * k, 9)
                lo = -math.pi / 2 + x * np.linspace(0.25 + 0.15 * k, 1.5 + 0.1 * k, 9)
                pts = [hc + np.array([math.cos(b) * math.cos(c) * (skull_r[0] + 0.004), math.cos(b) * math.sin(c)
                                      * (skull_r[1] + 0.004), math.sin(b) * skull_r[2]]) for b, c in zip(la, lo)]
                tube(m, pts, 0.0045, S_TRIM, n=5)
    for x in (1, -1) if s.get('side_fins') else ():   # two fins standing up off the sides, bright as the plate
        base = hc + np.array([skull_r[0] * 0.9 * x, 0.012, 0.045])
        spike(m, base, base + np.array([0.03 * x, 0.035, 0.15]), 0.016, S_PLATE, n=5, curve=(0.012 * x, 0.0, 0.0))
    _hang_all(parts, mat, [('armour_helm', m, 'head')])


def dress(M, body, parts, material, pieces=PIECES, woman=False):
    """`material`'s pieces on the shaped body (`body` its fused Skinned; `woman`, the woman's), hung into `parts`, over
    the set's under-suit. Gives the set's materials, for the hands' covers (`gauntlet_hands`), and its skinned layers
    to pose: the under-suit, the cuirass's yoke, and the mail skirt where the culture wears one."""
    style = {**STYLE[material], **STYLE[material].get('woman', {})} if woman else STYLE[material]
    mat = palette(material, M)
    fit = Fit(body, style, CLOSE_UP.get(material), woman)
    fit.material = material
    skins = [undersuit(fit, mat)]
    if 'cuirass' in pieces:
        skins.append(yoke(fit, mat))
    if style.get('mailskirt') and 'cuirass' in pieces:
        skins.append(mailskirt(fit, mat))
    from armourmakes import make_of   # each set's own make of a piece, where it has one
    for piece, build in (('cuirass', cuirass), ('pauldrons', pauldrons), ('gauntlets', gauntlets),
                         ('greaves', greaves), ('boots', boots), ('helm', helm)):
        if piece in pieces:
            (make_of(fit, piece) or build)(parts, fit, mat)
    return mat, skins
