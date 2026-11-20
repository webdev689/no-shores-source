import { make } from '../editor/dom.ts';
import { CLOTHING_DYES } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import { ARMOUR_PIECES, type Outfit } from '../forge/outfit.ts';
import type { HairColours } from '../forge/skins.ts';
import { type Dress, type Race, PLAIN_DYE, RACES, lookOutfit, wardrobeOf } from '../player/dressing.ts';
import type { Placed } from '../player/figures.ts';

const pairs = (keys: readonly string[]) => keys.map((key) => [key, key] as const);

/** A control with its name before it, on one row. */
export function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const label = make('label', '', 'row');
  label.append(make('span', text), control);
  return label;
}

/** A drop-down of `[value, text]` options that calls `onPick` with the value chosen. */
export function choice(
  options: readonly (readonly [string, string])[],
  value: string,
  onPick: (value: string) => void,
): HTMLSelectElement {
  const select = make('select');
  for (const [key, text] of options) select.append(new Option(text, key, false, key === value));
  select.addEventListener('change', () => onPick(select.value));
  return select;
}

function checkbox(checked: boolean, onChange: (checked: boolean) => void): HTMLInputElement {
  const box = make('input');
  Object.assign(box, { type: 'checkbox', checked });
  box.addEventListener('change', () => onChange(box.checked));
  return box;
}

/**
 * The chosen figure's dress: its body, race and skin tone, hair, armour by piece, garments, what each hand holds and
 * whether it is drawn, each garment's dye, and one of the forge's dressed looks to start from. `changed` follows each edit.
 */
export function dressControls(
  looks: ForgeLooks,
  hair: HairColours,
  placed: Placed,
  garmentFilter: { text: string },
  changed: () => void,
): HTMLElement[] {
  const drawn = looks.bodies[placed.dress.body]?.layers ?? {};
  const wardrobe = wardrobeOf(placed.dress.body, drawn);
  const { outfit } = placed.dress;
  const set = (patch: Partial<Dress>) => {
    placed.dress = { ...placed.dress, ...patch };
    changed();
  };
  const wear = (patch: Partial<Outfit>) => set({ outfit: { ...outfit, ...patch } });

  const tone = make('input');
  Object.assign(tone, { type: 'range', min: '0', max: '100', value: String(Math.round(placed.dress.tone * 100)) });
  tone.addEventListener('change', () => set({ tone: Number(tone.value) / 100 }));
  const raceKey = RACES[placed.dress.race] ?? '*';
  const colours = Object.keys(hair.bodies[placed.dress.body]?.[raceKey] ?? hair.bodies[placed.dress.body]?.['*'] ?? {});
  const styles = placed.dress.race === 'anole' ? [] : wardrobe.hairStyles;

  const armour = ARMOUR_PIECES.map((piece) =>
    labelled(
      piece,
      choice([['', 'none'], ...pairs(wardrobe.sets[piece])], outfit.armour[piece] ?? '', (value) =>
        wear({ armour: { ...outfit.armour, [piece]: value || undefined } }),
      ),
    ),
  );
  const allSets = [...new Set(wardrobe.sets.cuirass)];
  const wholeSet = choice([['', 'pick a whole set'], ...pairs(allSets)], '', (value) =>
    wear({
      armour: Object.fromEntries(
        ARMOUR_PIECES.filter((piece) => wardrobe.sets[piece].includes(value)).map((piece) => [piece, value]),
      ),
    }),
  );

  const search = make('input');
  Object.assign(search, { type: 'search', placeholder: 'Filter clothes', value: garmentFilter.text });
  const list = make('div', '', 'gear');
  const listGarments = () => {
    list.replaceChildren();
    const worn = new Set(outfit.garments);
    const shown = wardrobe.garments.filter((garment) => garment.includes(garmentFilter.text));
    for (const garment of shown.sort((first, second) => Number(worn.has(second)) - Number(worn.has(first)))) {
      const row = make('label', '', 'row');
      row.append(
        checkbox(worn.has(garment), (checked) => {
          const others = outfit.garments.filter((each) => each !== garment);
          wear({ garments: checked ? [...others, garment] : others });
        }),
        make('span', garment),
      );
      list.append(row);
    }
  };
  search.addEventListener('input', () => {
    garmentFilter.text = search.value;
    listGarments();
  });
  listGarments();

  const dyeable = new Set(looks.dye ?? []);
  const dyeChoices = outfit.garments
    .filter((garment) => Object.keys(drawn).some((layer) => dyeable.has(layer) && layer.startsWith(garment)))
    .map((garment) =>
      labelled(
        garment,
        choice(pairs(CLOTHING_DYES), outfit.dyes[garment] ?? PLAIN_DYE, (dye) =>
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

  return [
    labelled(
      'Body',
      choice(pairs(Object.keys(looks.bodies)), placed.dress.body, (body) =>
        set({ body, outfit: { ...outfit, hair: null } }),
      ),
    ),
    labelled(
      'Race',
      choice(
        [
          ['human', 'Human'],
          ['felid', 'Felid'],
          ['anole', 'Anole'],
        ],
        placed.dress.race,
        (race) => set({ race: race as Race, outfit: race === 'anole' ? { ...outfit, hair: null } : outfit }),
      ),
    ),
    ...(placed.dress.race === 'human' ? [labelled('Skin tone', tone)] : []),
    labelled(
      'Hair',
      choice([['', 'none'], ...pairs(styles)], outfit.hair?.style ?? '', (style) =>
        wear({ hair: style ? { style, colour: outfit.hair?.colour ?? colours[0] ?? 'black' } : null }),
      ),
    ),
    ...(outfit.hair
      ? [
          labelled(
            'Hair colour',
            choice(pairs(colours), outfit.hair.colour, (colour) =>
              wear({ hair: outfit.hair && { ...outfit.hair, colour } }),
            ),
          ),
        ]
      : []),
    labelled(
      'Dress as',
      choice([['', 'one of the forge’s looks'], ...presets], '', (key) => {
        const look = looks.looks?.[key];
        if (look) wear(lookOutfit(look, outfit));
      }),
    ),
    make('h2', 'Armour'),
    labelled('Set', wholeSet),
    ...armour,
    make('h2', 'In hand'),
    labelled(
      'Right',
      choice([['', 'nothing'], ...pairs(wardrobe.right)], outfit.right ?? '', (value) =>
        wear({ right: value || null }),
      ),
    ),
    labelled(
      'Left',
      choice([['', 'nothing'], ...pairs(wardrobe.left)], outfit.left ?? '', (value) => wear({ left: value || null })),
    ),
    labelled(
      'Drawn',
      checkbox(outfit.drawn, (drawnOut) => wear({ drawn: drawnOut })),
    ),
    make('h2', 'Dyes'),
    ...(dyeChoices.length > 0
      ? dyeChoices
      : [make('p', 'Wear a garment to dye it. Metal takes its set’s colour.', 'hint')]),
    make('h2', 'Clothes'),
    search,
    list,
  ];
}
