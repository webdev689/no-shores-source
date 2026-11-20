// The fight's display's own sheet, laid once on whichever page shows a fight, so every page draws the fight alike. The
// Enhanced Plus kit paints the windows, troughs, fills and plates by their roles; this sheet gives each its room, and
// never a colour to a border the kit paints, only its width and style.
import { PLATES } from '../plus/barLayout.ts';
import { wearCompass } from '../plus/compass.ts';
import { EMBLEM_PIXELS, markPicture } from '../plus/emblems.ts';
import { barSheetCss, thinBarsCss } from '../plus/barSheet.ts';
import { wearKit } from '../plus/kit.ts';
import { BAR_EDGE, BAR_TONES, CORNER, tipOf, VITAL_SIZES } from '../plus/barFrame.ts';
import { BEVELS, FILLS, HALO, TONES } from '../plus/tones.ts';
import { ELEMENTS } from '../player/gear.ts';
import { OVERHEAD_SIZES } from './foePlate.ts';
import { PLATE_SIZE } from './plateSight.ts';
import { statusCss } from './statusIcons.ts';
import { weaponsCss } from './weapons.ts';
import { wordsCss } from './wordsSheet.ts';

const SHEET_ID = 'fight-hud';
/** The light either side of a third's dark mark, so it reads over a bar's empty trough as well as over its fill. */
const THIRD_EDGE = `color-mix(in srgb, ${TONES.wordDim} 60%, transparent)`;
/** Each plate's level square, as large as a ship's emblem square at the same scale, inside a 2 px edge. */
const SQUARE_SCALE = { overhead: 2, target: 3, boss: 4 } as const;
const { overhead, boss } = PLATES;

/** The plates' sheet: a level square, a title line and the bars under it, sized for each place a plate stands. */
function platesCss(): string {
  const marks = (['elite', 'miniboss'] as const).map((mark) => {
    const { url, width, height } = markPicture(mark);
    return `.fight-hud .rank-mark[data-mark='${mark}'] { display: block; width: ${width * 2}px; height: ${height * 2}px;
  background-image: url("${url}"); }`;
  });
  // Each element's ward, from its palette: its dark, its own colour and its light (`ELEMENTS`).
  const wards = ELEMENTS.flatMap((element, number) => {
    if (!element) return [];
    const [dark, , lit] = element.palette;
    return [
      `.fight-hud .ward[data-element='${number}'] { --ward-dark: ${dark}; --ward: ${element.colour}; --ward-lit: ${lit}; }`,
    ];
  }).join('\n');
  const squares = Object.entries(SQUARE_SCALE).map(([place, scale]) => {
    const side = EMBLEM_PIXELS * scale + 4;
    // Over a figure the plate scales with its distance; the plates that stand still keep the face's 22 px step.
    const letters = place === 'overhead' ? Math.round(side / 2) : 22;
    return `.fight-hud .${place} .level { width: ${side}px; height: ${side}px; font-size: ${letters}px; }`;
  });
  // Over a figure a plate's size says its foe's rank at a glance, so the crowd's fodder stays quiet.
  const tiers = Object.entries(OVERHEAD_SIZES).map(
    ([tier, { width, bar, barShare }]) => `.fight-hud .overhead[data-tier='${tier}'] { width: ${width}px; }
.fight-hud .overhead[data-tier='${tier}'] .body { width: ${width - overhead.height - 5}px; }
/* An ally's plate shows no level square, so its body takes the whole plate. */
.fight-hud .overhead[data-tier='${tier}'][data-band='ally'] .body { width: ${width}px; }
.fight-hud .overhead[data-tier='${tier}'] .meter { height: ${bar}px; width: ${barShare * 100}%; }`,
  );
  return `
.fight-hud .level { display: flex; flex: none; align-items: center; justify-content: center; box-sizing: border-box;
  border-width: 2px; border-style: solid; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1;
  color: ${TONES.word}; text-shadow: ${HALO}; }
.fight-hud .plate[data-band='ally'] .level { display: none; }
${squares.join('\n')}
.fight-hud .rank-mark { display: none; flex: none; background-size: 100% 100%; image-rendering: pixelated;
  filter: drop-shadow(1px 1px 0 ${TONES.outline}); }
${marks.join('\n')}
.fight-hud .alert { color: #ffd95a; font-size: 22px; font-weight: 800; }
.fight-hud .overhead .alert { font-size: 15px; }
.fight-hud .alert:empty { display: none; }
.fight-hud .alert.now { color: #ff5a4a; }

/* A shield's ward over a foe's health, as DFO's Enhanced HUD laid a boss's: from the bar's left end, a lit top line, its
   element's colour through, a dark foot line. */
.fight-hud .meter .ward { position: absolute; left: 0; top: 0; bottom: 0; display: block; pointer-events: none;
  background: linear-gradient(180deg, var(--ward-lit) 0 1px, var(--ward) 1px calc(100% - 1px),
    var(--ward-dark) calc(100% - 1px)); opacity: 0.9; }
.fight-hud .meter .ward[hidden] { display: none; }
${wards}

/* The poise track under a foe's health: its poise filling toward a break, iron hatched in red (never by its colour
   alone), a white flash as it breaks into a stagger, a brass edge while it stands open; its word centred under it. It
   keeps its room while it has nothing to say, so the plate never jumps. */
.fight-hud .poise-track { position: relative; display: block; height: 6px; box-sizing: border-box; border: 1px solid;
  border-color: ${BEVELS.sunk}; background-color: ${TONES.groundTrack}; box-shadow: 0 0 0 1px ${TONES.outline}; }
.fight-hud .poise-track.poise-empty { visibility: hidden; }
.fight-hud .poise-fill { display: block; height: 100%; width: 0; }
.fight-hud .poise-filling .poise-fill { background-color: ${FILLS.poise}; }
.fight-hud .poise-iron .poise-fill { background: repeating-linear-gradient(135deg, #d8342c 0 4px, #7a1410 4px 6px); }
.fight-hud .poise-staggered .poise-fill { background-color: #fff; }
.fight-hud .poise-flash .poise-fill { animation: fight-poise-flash 0.45s ease-out; }
@keyframes fight-poise-flash { 0% { box-shadow: 0 0 10px 3px rgba(255,255,255,0.9); }
  100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); } }
.fight-hud .poise-open { border-color: rgba(241,192,79,0.9); }
.fight-hud .poise-word { position: absolute; left: 50%; top: calc(100% + 3px); translate: -50% 0; white-space: nowrap;
  font-size: 11px; line-height: 13px; letter-spacing: 0.16em; text-transform: uppercase; text-shadow: ${HALO}; }
.fight-hud .poise-iron .poise-word { color: #ff6a5a; }
.fight-hud .poise-staggered .poise-word { color: #fff; }
.fight-hud .poise-open .poise-word { color: #f1c04f; }
@media (prefers-reduced-motion: reduce) {
  .fight-hud .poise-flash .poise-fill { animation: none; }
}

.fight-hud .overhead { height: ${overhead.height}px; translate: -50% -100%;
  transform-origin: 50% 100%; margin-top: -4px; font-size: ${PLATE_SIZE.letters}px; }
${tiers.join('\n')}
.fight-hud .overhead .title { height: 15px; line-height: 15px; }
/* Over a figure an Elite's and up's bar is cut in thirds, as Destiny's are, so how much is left, and how much is lost,
   reads at a glance. */
.fight-hud .meter .third-mark { display: none; position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px;
  background: ${TONES.outline}; box-shadow: -1px 0 0 ${THIRD_EDGE}, 1px 0 0 ${THIRD_EDGE}; }
.fight-hud .overhead[data-tier='elite'] .third-mark { display: block; }


.fight-hud .boss { width: min(${boss.width}px, ${boss.share * 100}%); }
.fight-hud .boss .body { flex: 1; }
.fight-hud .boss .title { align-items: baseline; gap: 12px; font-size: 22px; }
.fight-hud .boss .faction, .fight-hud .boss .phase { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: ${TONES.wordDim}; }
.fight-hud .boss .phase { margin-left: auto; }
.fight-hud .boss .meter.health { height: ${boss.bar}px; border-width: 2px; }
.fight-hud .boss .poise-track { margin-top: 3px; }
.fight-hud .boss .phase-mark { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px;
  display: block; background: ${TONES.outline}; box-shadow: 1px 0 0 ${TONES.groove}; }
`;
}

/** The vitals as the kit's thin bars: each at its height, health's frame warning in blood, stamina's in white, poise's
 *  in brass. */
const VITAL_BARS = Object.fromEntries(
  (['health', 'stamina', 'poise'] as const).map((name) => [
    name,
    {
      base: VITAL_SIZES.base[name],
      wide: VITAL_SIZES.wide[name],
      alert: name === 'health' ? BAR_TONES.blood : name === 'stamina' ? BAR_TONES.light : BAR_TONES.brass,
    },
  ]),
);

/** One step of the vitals: where they stand, the gap between two, the poise's word and the buffs' icons. */
function vitalStepCss(scope: string, wide: boolean): string {
  const sizes = wide ? VITAL_SIZES.wide : VITAL_SIZES.base;
  return `${scope} .vital.poise .poise-word { left: calc(100% + ${tipOf(sizes.poise) + (wide ? 10 : 6)}px); }
${scope} .vitals { left: ${CORNER.side}px; top: ${CORNER.top}px; gap: ${sizes.gap}px; }
${scope} .vitals .poise-word { font-size: ${wide ? 22 : 11}px; line-height: ${wide ? 22 : 12}px; }
${wide ? `${scope} .vitals .poise-word { top: -${BAR_EDGE}px; translate: none; }` : ''}
${scope} .vitals > .statuses .status { --size: ${wide ? 36 : 24}px; }`;
}

/** The vitals at the top left: long thin bars with pointed ends in a fine frame, as long as what each holds; health's
 *  frame flashes blood when low, stamina's white for a press with none, poise's brass while open. */
function vitalsCss(): string {
  return `
${thinBarsCss('.fight-hud', VITAL_BARS)}
.fight-hud .vital.health { --fill: ${FILLS.health}; }
.fight-hud .vital.stamina { --fill: ${FILLS.stamina}; }
.fight-hud .vital.poise { --fill: ${FILLS.poise}; }
.fight-hud .vital.stamina.flash::after { opacity: 1; animation: fight-blink 0.15s steps(2) infinite; }
.fight-hud .vital.stamina.flash .meter { animation: fight-blink-ground 0.15s steps(2) infinite; }
@keyframes fight-blink { 50% { opacity: 0; } }
@keyframes fight-blink-ground { 50% { background-color: rgba(255,255,255,0.27); } }
/* Poise fills in brass toward a break; an iron blow hatched in red, a stagger full and white, an opening edged in
   brass, each also said in its word beside the bar, never by its colour alone. */
.fight-hud .vital.poise-iron .fill { background: repeating-linear-gradient(135deg, #d8342c 0 4px, #7a1410 4px 6px); }
.fight-hud .vital.poise-staggered .fill { background-color: #fff; }
.fight-hud .vital.poise-flash .fill { animation: fight-poise-flash 0.45s ease-out; }
.fight-hud .vital.poise-open::after { opacity: 1; }
.fight-hud .vital .poise-word { position: absolute; top: 50%; translate: 0 -50%; white-space: nowrap;
  letter-spacing: 0.16em; text-transform: uppercase; color: ${TONES.word}; text-shadow: ${HALO}; }
.fight-hud .vital.poise-iron .poise-word { color: #ff6a5a; }
.fight-hud .vital.poise-open .poise-word { color: #f1c04f; }
.fight-hud .vitals > .statuses { margin-top: 4px; gap: 6px; }
/* Whole and untouched, the vitals rest: they go in six steps, and come back in two at the first change. */
.fight-hud .vitals { transition: opacity 120ms steps(2, end); }
.fight-hud .vitals.rest { opacity: 0; transition: opacity 1200ms steps(6, end); }
/* Past 1440p the compass's column with the boss bar and the target's plate stands at twice its first size, as the
   vitals and the rest of the display do. */
.fight-hud.double .compass-column { zoom: 2; }
${vitalStepCss('.fight-hud', false)}
${vitalStepCss('.fight-hud.wide', true)}
@media (prefers-reduced-motion: reduce) {
  .fight-hud .vital.stamina.flash::after { animation: none; }
  .fight-hud .vital.stamina.flash .meter { animation: none; }
  .fight-hud .vital.poise-flash .fill { animation: none; }
}
`;
}

/** The rest of the display: the struck edge, the lock's mark, the crosshair, the parry ring, the words, the arrows to
 *  threats off the screen and the veil. */
/** What a shield took is said in its element's colour. */
const shieldWords = ELEMENTS.flatMap((element, number) =>
  element ? [`.fight-hud .word.shield[data-element='${number}'] .rise { color: ${element.colour}; }`] : [],
).join('\n');

function cuesCss(): string {
  return `
.fight-hud { position: absolute; inset: 0; pointer-events: none; overflow: hidden; font-weight: 600;
  text-shadow: 0 1px 2px #000; isolation: isolate; }
.fight-hud [hidden] { display: none !important; }
/* The plates over figures are stacked nearest in front among themselves only, so the veil, laid after, covers them as
   it covers the rest of the display, and nothing of the display stands over the page's own windows. */
.fight-hud .over { isolation: isolate; }
.fight-hud .hurt { position: absolute; inset: 0; opacity: 0; box-shadow: inset 0 0 90px 24px #c41a12; }
.fight-hud .mark { position: absolute; left: -6px; top: -6px; width: 12px; height: 12px; border: 2px solid #f4e3b0;
  border-radius: 50%; box-shadow: 0 0 6px #f4e3b0; }
.fight-hud .over > * { position: absolute; left: 0; top: 0; }
.fight-hud .crosshair { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; translate: -50% -50%;
  border-radius: 50%; filter: drop-shadow(0 0 1px #000);
  background: linear-gradient(#f2f2f2, #f2f2f2) center / 2px 2px no-repeat,
    linear-gradient(#f2f2f2c0, #f2f2f2c0) center / 1px 22px no-repeat,
    linear-gradient(#f2f2f2c0, #f2f2f2c0) center / 22px 1px no-repeat; }
.fight-hud .crosshair .charge { position: absolute; inset: -5px; border-radius: 50%;
  background: conic-gradient(#ffd95a var(--charge), #ffffff38 var(--charge));
  mask: radial-gradient(circle, transparent 12px, #000 13px, #000 15px, transparent 16px); }
.fight-hud .crosshair:not(.charging) .charge { display: none; }
.fight-hud .crosshair.full { filter: drop-shadow(0 0 4px #ffd95a); }
/* The shots left, beside the crosshair on the face's grid, outlined as the HUD's words are; few in brass, none in the
   gear screen's loss colour. */
.fight-hud .ammo { position: absolute; left: calc(50% + 22px); top: calc(50% + 11px); font-size: 22px; line-height: 22px;
  font-weight: 500; color: #f2f2f2; text-shadow: ${HALO}; font-variant-numeric: tabular-nums; }
.fight-hud .ammo.low { color: #f1c04f; }
.fight-hud .ammo.empty { color: #e8968a; }
.fight-hud .parry::before, .fight-hud .parry::after { content: ''; position: absolute; translate: -50% -50%;
  box-sizing: border-box; border-radius: 50%; border: 2px solid #f2f2f2; box-shadow: 0 0 3px #000c; }
.fight-hud .parry::before { width: 14px; height: 14px; }
.fight-hud .parry::after { width: var(--span); height: var(--span); }
.fight-hud .parry.now::before, .fight-hud .parry.now::after { border-color: #ffd95a; box-shadow: 0 0 8px #ffd95a; }
.fight-hud .parry.iron::before { background: #e0281c; border-color: #fff; }
.fight-hud .parry.iron::after { display: none; }
${shieldWords}
.fight-hud .arrow { width: 0; height: 0; margin: -12px 0 0 -10px; border-top: 12px solid transparent;
  border-bottom: 12px solid transparent; border-left: 22px solid #ff5a4a; transform-origin: 10px 12px;
  filter: drop-shadow(0 0 2px #000) drop-shadow(0 0 2px #000); }
.fight-hud .veil { position: absolute; inset: 0; display: grid; place-items: center; background: #300a;
  font-size: 22px; text-shadow: ${HALO}; }
.fight-hud .veil.link { background: rgba(5,7,10,0.72); }
/* A page whose own sheet styles .mark and .veil for its map (the Game's) must not reach the fight's. */
.fight-hud .mark { border: 2px solid #f4e3b0 !important; }
.fight-hud .veil { opacity: 1; transition: none; pointer-events: none; }
`;
}

/** The whole sheet. */
export function fightSheetCss(): string {
  return cuesCss() + barSheetCss('.fight-hud') + platesCss() + vitalsCss() + weaponsCss() + statusCss() + wordsCss();
}

/** Lays the kit's sheet, the compass's and then the display's on `page`, once each. */
export function wearFightSheet(page: Document): void {
  wearKit(page);
  wearCompass(page);
  if (page.getElementById(SHEET_ID)) return;
  const sheet = page.createElement('style');
  sheet.id = SHEET_ID;
  sheet.textContent = fightSheetCss();
  page.head.append(sheet);
}
