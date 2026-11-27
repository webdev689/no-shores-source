import { CLOTHING_DYES } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import { ARMOUR_PIECES, type Outfit } from '../forge/outfit.ts';
import type { HairColours } from '../forge/skins.ts';
import { type Dress, LIGHTS, type Race, PLAIN_DYE, RACES, lookOutfit, wardrobeOf } from '../player/dressing.ts';
import type { Placed } from '../player/figures.ts';
import { KINDS, kindName, slotOf } from '../player/gear.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { LOOK, field, heading, hint, labelled, pick, slide, tick } from './panelKit.ts';

const pairs = (keys: readonly string[]) => keys.map((key) => [key, key] as const);

/** The player's own hands: the kinds their gear wears in its Melee and Ranged loadouts (0 for none), and the ask that
 *  wears another kind; the light their left carries (a forge layer, or null), and the pick of another. */
export interface OwnHands {
  readonly worn: { readonly melee: number; readonly ranged: number };
  wear(kind: number): void;
  readonly light: string | null;
  carry(light: string | null): void;
}

/** The gear's `outfit` with `light` in its left hand where the room lets the hands hold it (`allowed`, the arms codes
 *  it sent, which `armsCode` gives for a pair of hands); else as the gear has it, so a light never costs the fight its
 *  arms. */
export function withLight(
  outfit: Outfit,
  light: string | null,
  allowed: readonly number[] | undefined,
  armsCode: (right: string | null, left: string) => number,
): Outfit {
  return light && allowed?.includes(armsCode(outfit.right, light)) ? { ...outfit, left: light } : outfit;
}

/** The kinds worn in a loadout's slot (0 Melee, 1 Ranged), as `[number, name]` options. */
export const loadoutKinds = (slot: number) =>
  KINDS.flatMap((name, kind) => (name && slotOf(kind) === slot ? [[String(kind), kindName(kind)] as const] : []));

/** What the player's hands hold: a loadout of each kind their gear can wear, worn through it when picked, since the
 *  room fights only with what a worn loadout puts in their hands; and one of the `lights` the body carries. */
function ownHands(ui: Interface, hands: OwnHands, lights: readonly string[]): Node[] {
  // Each keeps showing what is worn until the room's answer wears another, so a refused kind is never shown.
  const loadout = (slot: number, worn: number) =>
    pick(
      ui,
      `tg:dress:loadout${slot}`,
      [...(worn ? [] : [['', 'none worn'] as const]), ...loadoutKinds(slot)],
      worn ? String(worn) : '',
      (value) => value && hands.wear(Number(value)),
    );
  return [
    labelled('Melee', loadout(0, hands.worn.melee)),
    labelled('Ranged', loadout(1, hands.worn.ranged)),
    labelled(
      'Left',
      pick(ui, 'tg:dress:light', [['', 'what the loadout holds'], ...pairs(lights)], hands.light ?? '', (value) =>
        hands.carry(value || null),
      ),
    ),
    hint(
      'Your hands hold what your gear wears. Picking a weapon wears it; 1 and 2 draw them. A light goes in the left ' +
        'only beside a weapon that leaves it free.',
    ),
  ];
}

/** The skin tone's slider, from 0 to 100: the tone is set as the slider is let go, as each tone is composed afresh. */
function toneSlider(ui: Interface, tone: number, set: (tone: number) => void): Node {
  const id = 'tg:dress:tone';
  const kept = Math.round(tone * 100);
  const dragged = ui.store.get(id);
  const made = slide(ui, id, typeof dragged === 'number' ? dragged : kept, { low: 0, high: 100, step: 1 });
  if (ui.pressing(id)) ui.store.set(id, made.value);
  else {
    ui.store.delete(id);
    if (made.value !== kept) set(made.value / 100);
  }
  return { ...made.node, label: `Skin tone: ${made.value}` };
}

/** The garments to wear, those worn first, filtered by the words in the filter's field; each ticked to wear it, worn
 *  in the order they are ticked. */
function garmentList(
  ui: Interface,
  garments: readonly string[],
  worn: readonly string[],
  wear: (garments: string[]) => void,
): Node {
  const filter = ui.fieldText('tg:dress:filter');
  const wearing = new Set(worn);
  const shown = garments
    .filter((garment) => garment.includes(filter))
    .sort((first, second) => Number(wearing.has(second)) - Number(wearing.has(first)));
  return {
    id: 'tg:dress:garments',
    direction: 'column',
    width: 'grow',
    maxHeight: 320,
    scroll: true,
    padding: [4, 6],
    gap: 6,
    outline: { width: 1, colour: LOOK.line },
    children: shown.map((garment) => {
      const ticked = tick(ui, `tg:dress:garment:${garment}`, garment, wearing.has(garment));
      if (ticked.ticked !== wearing.has(garment)) {
        const others = worn.filter((each) => each !== garment);
        wear(ticked.ticked ? [...others, garment] : others);
      }
      return ticked.node;
    }),
  };
}

/**
 * The chosen figure's dress: its body, race and skin tone, hair, armour by piece, garments, what each hand holds and
 * whether it is drawn, each garment's dye, and one of the forge's dressed looks to start from. `changed` follows each
 * edit. The player's own hands (`own`) hold what their gear wears, so theirs pick a loadout to wear and a light
 * instead.
 */
export function dressNodes(
  ui: Interface,
  looks: ForgeLooks,
  hair: HairColours,
  placed: Placed,
  changed: () => void,
  own: OwnHands | null = null,
): Node[] {
  const drawn = looks.bodies[placed.dress.body]?.layers ?? {};
  const wardrobe = wardrobeOf(placed.dress.body, drawn);
  const { outfit } = placed.dress;
  const set = (patch: Partial<Dress>) => {
    placed.dress = { ...placed.dress, ...patch };
    changed();
  };
  const wear = (patch: Partial<Outfit>) => set({ outfit: { ...outfit, ...patch } });
  const raceKey = RACES[placed.dress.race] ?? '*';
  const colours = Object.keys(hair.bodies[placed.dress.body]?.[raceKey] ?? hair.bodies[placed.dress.body]?.['*'] ?? {});
  const styles = placed.dress.race === 'anole' ? [] : wardrobe.hairStyles;

  const armour = ARMOUR_PIECES.map((piece) =>
    labelled(
      piece,
      pick(
        ui,
        `tg:dress:${piece}`,
        [['', 'none'], ...pairs(wardrobe.sets[piece])],
        outfit.armour[piece] ?? '',
        (value) => wear({ armour: { ...outfit.armour, [piece]: value || undefined } }),
      ),
    ),
  );
  const allSets = [...new Set(wardrobe.sets.cuirass)];
  const wholeSet = pick(ui, 'tg:dress:set', [['', 'pick a whole set'], ...pairs(allSets)], '', (value) =>
    wear({
      armour: Object.fromEntries(
        ARMOUR_PIECES.filter((piece) => wardrobe.sets[piece].includes(value)).map((piece) => [piece, value]),
      ),
    }),
  );
  const dyeable = new Set(looks.dye ?? []);
  const dyeChoices = outfit.garments
    .filter((garment) => Object.keys(drawn).some((layer) => dyeable.has(layer) && layer.startsWith(garment)))
    .map((garment) =>
      labelled(
        garment,
        pick(ui, `tg:dress:dye:${garment}`, pairs(CLOTHING_DYES), outfit.dyes[garment] ?? PLAIN_DYE, (dye) =>
          wear({ dyes: { ...outfit.dyes, [garment]: dye } }),
        ),
      ),
    );
  const presets = Object.entries(looks.looks ?? {})
    .filter(([, look]) => look.body === placed.dress.body)
    .map(
      ([key, look]) =>
        [
          key,
          [...look.gear.filter((layer) => !/^(face|under)/.test(layer)), look.weapon].filter(Boolean).join(', '),
        ] as const,
    );
  const drawnOut = tick(ui, 'tg:dress:drawn', '', outfit.drawn);
  if (drawnOut.ticked !== outfit.drawn) wear({ drawn: drawnOut.ticked });

  return [
    labelled(
      'Body',
      pick(ui, 'tg:dress:body', pairs(Object.keys(looks.bodies)), placed.dress.body, (body) =>
        set({ body, outfit: { ...outfit, hair: null } }),
      ),
    ),
    labelled(
      'Race',
      pick(
        ui,
        'tg:dress:race',
        [
          ['human', 'Human'],
          ['felid', 'Felid'],
          ['anole', 'Anole'],
        ],
        placed.dress.race,
        (race) => set({ race: race as Race, outfit: race === 'anole' ? { ...outfit, hair: null } : outfit }),
      ),
    ),
    placed.dress.race === 'human' &&
      labelled(
        'Skin tone',
        toneSlider(ui, placed.dress.tone, (tone) => set({ tone })),
      ),
    labelled(
      'Hair',
      pick(ui, 'tg:dress:hair', [['', 'none'], ...pairs(styles)], outfit.hair?.style ?? '', (style) =>
        wear({ hair: style ? { style, colour: outfit.hair?.colour ?? colours[0] ?? 'black' } : null }),
      ),
    ),
    outfit.hair &&
      labelled(
        'Hair colour',
        pick(ui, 'tg:dress:hairColour', pairs(colours), outfit.hair.colour, (colour) =>
          wear({ hair: outfit.hair && { ...outfit.hair, colour } }),
        ),
      ),
    labelled(
      'Dress as',
      pick(ui, 'tg:dress:look', [['', 'one of the forge’s looks'], ...presets], '', (key) => {
        const look = looks.looks?.[key];
        if (look) wear(lookOutfit(look, outfit));
      }),
    ),
    heading('Armour'),
    labelled('Set', wholeSet),
    ...armour,
    heading('In hand'),
    ...(own
      ? ownHands(
          ui,
          own,
          wardrobe.left.filter((layer) => LIGHTS.includes(layer)),
        )
      : [
          labelled(
            'Right',
            pick(ui, 'tg:dress:right', [['', 'nothing'], ...pairs(wardrobe.right)], outfit.right ?? '', (value) =>
              wear({ right: value || null }),
            ),
          ),
          labelled(
            'Left',
            pick(ui, 'tg:dress:left', [['', 'nothing'], ...pairs(wardrobe.left)], outfit.left ?? '', (value) =>
              wear({ left: value || null }),
            ),
          ),
        ]),
    labelled('Drawn', { ...drawnOut.node, label: `Drawn: ${outfit.drawn ? 'on' : 'off'}` }),
    heading('Dyes'),
    ...(dyeChoices.length > 0 ? dyeChoices : [hint('Wear a garment to dye it. Metal takes its set’s colour.')]),
    heading('Clothes'),
    field('tg:dress:filter', 'Filter clothes', { placeholder: 'Filter clothes' }),
    garmentList(ui, wardrobe.garments, outfit.garments, (garments) => wear({ garments })),
  ].filter((child): child is Node => Boolean(child));
}
