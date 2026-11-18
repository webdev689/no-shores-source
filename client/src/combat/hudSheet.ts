// The fight's display's own sheet, laid once on whichever page shows a fight, so every page draws the fight alike. The
// Enhanced Plus kit paints the windows, troughs, fills and plates by their roles; this sheet gives each its room, and
// never a colour to a border the kit paints, only its width and style.
import { EMBLEM_FACTIONS, EMBLEM_PIXELS, emblemUrl, markPicture } from '../plus/emblems.ts';
import { wearKit } from '../plus/kit.ts';
import { BEVELS, FILLS, TONES } from '../plus/tones.ts';

const SHEET_ID = 'fight-hud';
/** Each plate's emblem square, in CSS pixels: the emblem shown at a whole number of screen pixels a pixel inside a
 *  2 px edge. */
const EMBLEM_SCALE = { overhead: 2, target: 3, boss: 4 } as const;
const WORDS_SHADOW = `1px 1px 0 ${TONES.outline}, 0 0 3px #000`;

/** The plates' sheet: an emblem square, a title line and the bars under it, sized for each place a plate stands. */
function platesCss(): string {
  const emblems = EMBLEM_FACTIONS.map(
    (faction) => `.fight-hud .emblem[data-faction='${faction}'] { background-image: url("${emblemUrl(faction)}"); }`,
  );
  const marks = (['elite', 'miniboss'] as const).map((mark) => {
    const { url, width, height } = markPicture(mark);
    return `.fight-hud .rank-mark[data-mark='${mark}'] { display: block; width: ${width * 2}px; height: ${height * 2}px;
  background-image: url("${url}"); }`;
  });
  const squares = Object.entries(EMBLEM_SCALE).map(([place, scale]) => {
    const side = EMBLEM_PIXELS * scale;
    return `.fight-hud .${place} .emblem { width: ${side + 4}px; height: ${side + 4}px; background-size: ${side}px ${side}px; }`;
  });
  return `
.fight-hud .plate { display: flex; gap: 5px; align-items: stretch; }
.fight-hud .plate[data-band='red'] { --fill: ${FILLS.red}; }
.fight-hud .plate[data-band='orange'] { --fill: ${FILLS.orange}; }
.fight-hud .plate[data-band='yellow'] { --fill: ${FILLS.yellow}; }
.fight-hud .emblem { display: block; flex: none; box-sizing: border-box; border-width: 2px; border-style: solid;
  background-repeat: no-repeat; background-position: center; image-rendering: pixelated; }
${emblems.join('\n')}
${squares.join('\n')}
.fight-hud .plate .body { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.fight-hud .plate .title { display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden;
  color: ${TONES.word}; text-shadow: ${WORDS_SHADOW}; }
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
.fight-hud .meter .lost { background-color: #fff6e4; opacity: 0.42; }
.fight-hud .meter.poise { --fill: ${FILLS.poise}; }

.fight-hud .overhead { width: 140px; height: 26px; translate: -50% -100%; margin-top: -30px; font-size: 12px; }
.fight-hud .overhead .body { width: 109px; }
.fight-hud .overhead .title { height: 15px; line-height: 15px; }
.fight-hud .overhead .meter { height: 8px; }

.fight-hud .target { position: absolute; top: 16px; left: 50%; width: 340px; translate: -50% 0; font-size: 14px; }
.fight-hud .target .body { flex: 1; gap: 3px; }
.fight-hud .target .meter.health { height: 12px; }
.fight-hud .target .meter.poise { height: 6px; }
.fight-hud.bossed .target { top: 80px; }

.fight-hud .boss { position: absolute; top: 14px; left: 50%; width: min(640px, 76%); translate: -50% 0; }
.fight-hud .boss .body { flex: 1; }
.fight-hud .boss .title { align-items: baseline; gap: 12px; font-size: 18px; }
.fight-hud .boss .faction, .fight-hud .boss .phase { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: ${TONES.wordDim}; }
.fight-hud .boss .phase { margin-left: auto; }
.fight-hud .boss .meter.health { height: 16px; border-width: 2px; }
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
.fight-hud .vital .label, .fight-hud .vital .number { position: relative; padding: 0 7px; color: ${TONES.word};
  text-shadow: 1px 1px 0 ${TONES.outline}, 2px 2px 0 rgba(0,0,0,0.7); }
.fight-hud .vital .label { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; }
.fight-hud .vital .number { font-size: 11px; font-variant-numeric: tabular-nums; }
.fight-hud .vital.low { animation: fight-low 0.9s steps(1, end) infinite; }
@keyframes fight-low { 0% { border-color: ${BEVELS.blood}; } 50% { border-color: ${BEVELS.sunk}; } }
.fight-hud .vital.stamina.flash { box-shadow: 0 0 0 1px #fff, 0 0 8px #fff; animation: fight-blink 0.15s steps(2) infinite; }
@keyframes fight-blink { 50% { background-color: rgba(255,255,255,0.27); } }
@media (prefers-reduced-motion: reduce) {
  .fight-hud .vital.low { animation: none; border-color: ${BEVELS.blood}; }
}
`;
}

/** The rest of the display: the struck edge, the lock's mark, the crosshair, the parry ring, the words, the arrows to
 *  threats off the screen and the veil. */
function cuesCss(): string {
  return `
.fight-hud { position: absolute; inset: 0; pointer-events: none; overflow: hidden; font-weight: 600;
  text-shadow: 0 1px 2px #000; }
.fight-hud [hidden] { display: none !important; }
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
.fight-hud .word { white-space: nowrap; translate: -50% 0; font-size: 15px; padding: 1px 7px; border-radius: 4px;
  background: #000b; text-shadow: none; }
.fight-hud .word.dealt { color: #f2f2f2; }
.fight-hud .word.taken { color: #ff7468; }
.fight-hud .word.great { color: #ffd95a; font-size: 18px; }
.fight-hud .word.good { color: #ffd95a; }
.fight-hud .word.warn { color: #fff; font-size: 18px; background: #a0140ccc; border: 2px solid #fff; }
.fight-hud .word.plain { color: #bfc8d2; }
.fight-hud .arrow { width: 0; height: 0; margin: -12px 0 0 -10px; border-top: 12px solid transparent;
  border-bottom: 12px solid transparent; border-left: 22px solid #ff5a4a; transform-origin: 10px 12px;
  filter: drop-shadow(0 0 2px #000) drop-shadow(0 0 2px #000); }
.fight-hud .veil { position: absolute; inset: 0; display: grid; place-items: center; background: #300a;
  font-size: 22px; }
`;
}

/** The whole sheet. */
export function fightSheetCss(): string {
  return cuesCss() + platesCss() + vitalsCss();
}

/** Lays the kit's sheet and then the display's on `page`, once each. */
export function wearFightSheet(page: Document): void {
  wearKit(page);
  if (page.getElementById(SHEET_ID)) return;
  const sheet = page.createElement('style');
  sheet.id = SHEET_ID;
  sheet.textContent = fightSheetCss();
  page.head.append(sheet);
}
