// The fight's display's own sheet, laid once on whichever page shows a fight, so every page draws the fight alike. The
// Enhanced Plus kit paints the windows, troughs, fills and plates by their roles; this sheet gives each its room, and
// never a colour to a border the kit paints, only its width and style.
import { PLATES } from '../plus/barLayout.ts';
import { wearCompass } from '../plus/compass.ts';
import { EMBLEM_PIXELS, markPicture } from '../plus/emblems.ts';
import { wearKit } from '../plus/kit.ts';
import { BEVELS, FILLS, HALO, TONES } from '../plus/tones.ts';
import { ELEMENTS } from '../player/gear.ts';
import { PLATE_SIZE } from './plateSight.ts';

const SHEET_ID = 'fight-hud';
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
    return `.fight-hud .${place} .level { width: ${side}px; height: ${side}px; font-size: ${Math.round(side / 2)}px; }`;
  });
  return `
.fight-hud .plate { display: flex; gap: 5px; align-items: stretch; }
.fight-hud .plate[data-band='red'] { --fill: ${FILLS.red}; }
.fight-hud .plate[data-band='orange'] { --fill: ${FILLS.orange}; }
.fight-hud .plate[data-band='yellow'] { --fill: ${FILLS.yellow}; }
.fight-hud .level { display: flex; flex: none; align-items: center; justify-content: center; box-sizing: border-box;
  border-width: 2px; border-style: solid; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1;
  color: ${TONES.word}; text-shadow: ${HALO}; }
${squares.join('\n')}
.fight-hud .plate .body { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.fight-hud .plate .title { display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden;
  color: ${TONES.word}; text-shadow: ${HALO}; }
.fight-hud .plate .name { overflow: hidden; text-overflow: ellipsis; }
.fight-hud .rank-mark { display: none; flex: none; background-size: 100% 100%; image-rendering: pixelated;
  filter: drop-shadow(1px 1px 0 ${TONES.outline}); }
${marks.join('\n')}
.fight-hud .alert { color: #ffd95a; font-size: 15px; font-weight: 800; }
.fight-hud .alert:empty { display: none; }
.fight-hud .alert.now { color: #ff5a4a; }

.fight-hud .meter { position: relative; display: block; box-sizing: border-box; border-width: 1px; border-style: solid; }
.fight-hud .meter .lost, .fight-hud .meter .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 100%;
  display: block; }
.fight-hud .meter .fill { background-color: var(--fill); }
/* What a foe's bar lost stands pale, its own hue lightened under a cream top line. */
.fight-hud .meter .lost { opacity: 0.6;
  background: linear-gradient(180deg, #fff6e4 0 1px, color-mix(in srgb, var(--fill) 45%, #fff6e4) 1px); }
/* A shield's ward over a foe's health, as DFO's Enhanced HUD laid a boss's: from the bar's left end, a lit top line, its
   element's colour through, a dark foot line. */
.fight-hud .meter .ward { position: absolute; left: 0; top: 0; bottom: 0; display: block; pointer-events: none;
  background: linear-gradient(180deg, var(--ward-lit) 0 1px, var(--ward) 1px calc(100% - 1px),
    var(--ward-dark) calc(100% - 1px)); opacity: 0.9; }
.fight-hud .meter .ward[hidden] { display: none; }
${wards}
/* A piece a loss breaks off: two halves the display drops a step at a time, under the words, over the fill. */
.fight-hud .meter .piece { position: absolute; top: 0; bottom: 0; display: block; pointer-events: none; }
.fight-hud .meter .piece > i { position: absolute; top: 0; bottom: 0; display: block; box-shadow: 0 0 0 1px ${TONES.outline};
  background: linear-gradient(180deg, #fff6e4 0 2px, var(--fill) 2px calc(100% - 3px),
    color-mix(in srgb, var(--fill), #000 35%) calc(100% - 3px)); }
.fight-hud .meter .piece .left { left: 0; width: 55%; }
.fight-hud .meter .piece .right { left: 55%; right: 0; }

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
  .fight-hud .meter .piece { display: none !important; }
  .fight-hud .poise-flash .poise-fill { animation: none; }
}

.fight-hud .overhead { width: ${overhead.width}px; height: ${overhead.height}px; translate: -50% -100%;
  transform-origin: 50% 100%; margin-top: -4px; font-size: ${PLATE_SIZE.letters}px; }
.fight-hud .overhead .body { width: ${overhead.width - overhead.height - 5}px; }
.fight-hud .overhead .title { height: 15px; line-height: 15px; }
.fight-hud .overhead .meter { height: ${overhead.bar}px; }

/* The boss bar and the target's plate stand in the compass's column, under it, the target under the boss bar while both
   show. */
.fight-hud .target { width: min(340px, ${boss.share * 100}%); font-size: 14px; }
.fight-hud .target .body { flex: 1; gap: 3px; }
.fight-hud .target .meter.health { height: 12px; }

.fight-hud .boss { width: min(${boss.width}px, ${boss.share * 100}%); }
.fight-hud .boss .body { flex: 1; }
.fight-hud .boss .title { align-items: baseline; gap: 12px; font-size: 18px; }
.fight-hud .boss .faction, .fight-hud .boss .phase { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: ${TONES.wordDim}; }
.fight-hud .boss .phase { margin-left: auto; }
.fight-hud .boss .meter.health { height: ${boss.bar}px; border-width: 2px; }
.fight-hud .boss .poise-track { margin-top: 3px; }
.fight-hud .boss .phase-mark { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px;
  display: block; background: ${TONES.outline}; box-shadow: 1px 0 0 ${TONES.groove}; }
`;
}

/** The vitals' panel: a carved window of three bars, each naming itself and saying its percentage inside it. */
function vitalsCss(): string {
  return `
.fight-hud .vitals { position: absolute; left: 24px; bottom: 24px; width: 260px; box-sizing: border-box;
  display: grid; gap: 6px; padding: 9px 10px; border-width: 2px; border-style: solid; }
.fight-hud .vital { display: flex; align-items: center; justify-content: space-between; height: 20px;
  border-width: 2px; }
.fight-hud .vital.poise { height: 16px; }
.fight-hud .vital.health { --fill: ${FILLS.health}; }
.fight-hud .vital.stamina { --fill: ${FILLS.stamina}; }
/* What a vital lost is its own body tone, faint: darker than any band of the fill, never brighter. */
.fight-hud .vital .lost { background: var(--fill); opacity: 0.35; }
/* Full and untouched, the panel rests: it goes in six steps, and comes back in two at the first change. */
.fight-hud .vitals { transition: opacity 120ms steps(2, end); }
.fight-hud .vitals.rest { opacity: 0; transition: opacity 1200ms steps(6, end); }
.fight-hud .vital .label, .fight-hud .vital .number { position: relative; padding: 0 7px; color: ${TONES.word};
  text-shadow: ${HALO}; }
.fight-hud .vital .label { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; }
.fight-hud .vital .number { font-size: 11px; font-variant-numeric: tabular-nums; }
.fight-hud .vital.low { animation: fight-low 0.9s steps(1, end) infinite; }
@keyframes fight-low { 0% { border-color: ${BEVELS.blood}; } 50% { border-color: ${BEVELS.sunk}; } }
.fight-hud .vital.stamina.flash { box-shadow: 0 0 0 1px #fff, 0 0 8px #fff; animation: fight-blink 0.15s steps(2) infinite; }
@keyframes fight-blink { 50% { background-color: rgba(255,255,255,0.27); } }
@media (prefers-reduced-motion: reduce) {
  .fight-hud .vital.low { animation: none; border-color: ${BEVELS.blood}; }
  .fight-hud .vital.stamina.flash { animation: none; }
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
.fight-hud .parry::before, .fight-hud .parry::after { content: ''; position: absolute; translate: -50% -50%;
  box-sizing: border-box; border-radius: 50%; border: 2px solid #f2f2f2; box-shadow: 0 0 3px #000c; }
.fight-hud .parry::before { width: 14px; height: 14px; }
.fight-hud .parry::after { width: var(--span); height: var(--span); }
.fight-hud .parry.now::before, .fight-hud .parry.now::after { border-color: #ffd95a; box-shadow: 0 0 8px #ffd95a; }
.fight-hud .parry.iron::before { background: #e0281c; border-color: #fff; }
.fight-hud .parry.iron::after { display: none; }
/* A word rises and fades as the sheet says, from where the display sets it; a great turn's pops larger and rises
   farther. With reduced motion asked for it stands where it happened and fades. */
.fight-hud .word { white-space: nowrap; translate: -50% 0; }
.fight-hud .word .rise { display: inline-block; font-size: 15px; padding: 1px 7px; border-radius: 4px;
  background: #000b; text-shadow: none; text-align: center;
  animation: fight-word-rise 0.95s cubic-bezier(0.2, 0.7, 0.3, 1) forwards; }
.fight-hud .word .tag { display: block; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase;
  color: #ffd95a; }
.fight-hud .word.dealt .rise { color: #f2f2f2; }
.fight-hud .word.taken .rise { color: #ff7468; }
.fight-hud .word.great .rise { color: #ffd95a; font-size: 18px; animation-name: fight-word-great; }
.fight-hud .word.good .rise { color: #ffd95a; }
.fight-hud .word.warn .rise { color: #fff; font-size: 18px; background: #a0140ccc; border: 2px solid #fff; }
.fight-hud .word.plain .rise { color: #bfc8d2; }
${shieldWords}
@keyframes fight-word-rise {
  0% { opacity: 0; transform: translateY(10px) scale(0.9); }
  12% { opacity: 1; transform: translateY(0) scale(1); }
  70% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-64px) scale(1); } }
@keyframes fight-word-great {
  0% { opacity: 0; transform: translateY(10px) scale(0.6); }
  14% { opacity: 1; transform: translateY(-4px) scale(1.18); }
  30% { transform: translateY(-8px) scale(1); }
  72% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-80px) scale(1); } }
@keyframes fight-word-still { 0% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .fight-hud .word .rise, .fight-hud .word.great .rise { animation-name: fight-word-still; }
}
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
  return cuesCss() + platesCss() + vitalsCss();
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
