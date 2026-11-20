// The bars' sheet the on-foot HUD and the sea fight's readout both wear, so a bar and the target's plate read the same
// wherever they stand: the bar's trough, fill, lost strip and falling pieces; the plates' emblem square, bands, title
// and the target's size. The vitals' carved window of three labelled bars is the sea fight's ship plate alone, since
// the vitals on foot stand at the top left as long thin bars. Each rule is laid under `scope`, the root of the display
// that wears it.
import { PLATES } from './barLayout.ts';
import { EMBLEM_FACTIONS, EMBLEM_PIXELS, emblemUrl } from './emblems.ts';
import { BEVELS, FILLS, HALO, TONES } from './tones.ts';

/** Each plate's emblem square, in CSS pixels: the emblem shown at a whole number of screen pixels a pixel inside a
 *  2 px edge. */
const EMBLEM_SCALE = { overhead: 2, target: 3, boss: 4 } as const;

/** The bars' and plates' rules under `scope`. */
export function barSheetCss(scope: string): string {
  const emblems = EMBLEM_FACTIONS.map(
    (faction) => `${scope} .emblem[data-faction='${faction}'] { background-image: url("${emblemUrl(faction)}"); }`,
  );

  const squares = Object.entries(EMBLEM_SCALE).map(([place, scale]) => {
    const side = EMBLEM_PIXELS * scale;
    return `${scope} .${place} .emblem { width: ${side + 4}px; height: ${side + 4}px; background-size: ${side}px ${side}px; }`;
  });
  return `
${scope} .plate { display: flex; gap: 5px; align-items: stretch; }
${scope} .plate[data-band='red'] { --fill: ${FILLS.red}; }
${scope} .plate[data-band='orange'] { --fill: ${FILLS.orange}; }
${scope} .plate[data-band='yellow'] { --fill: ${FILLS.yellow}; }
${scope} .plate[data-band='green'] { --fill: ${FILLS.green}; }
${scope} .plate[data-band='ally'] { --fill: ${FILLS.ally}; }
${scope} .plate[data-band='ally'] .name { color: ${TONES.ally}; }
${scope} .plate[data-band='ally'] .emblem { display: none; }
${scope} .emblem { display: block; flex: none; box-sizing: border-box; border-width: 2px; border-style: solid;
  background-repeat: no-repeat; background-position: center; image-rendering: pixelated; }
${emblems.join('\n')}
${squares.join('\n')}
${scope} .plate .body { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
${scope} .plate .title { display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden;
  color: ${TONES.word}; text-shadow: ${HALO}; }
${scope} .plate .name { overflow: hidden; text-overflow: ellipsis; }

${scope} .meter { position: relative; display: block; box-sizing: border-box; border-width: 1px; border-style: solid; }
${scope} .meter .lost, ${scope} .meter .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 100%;
  display: block; }
${scope} .meter .fill { background-color: var(--fill); }
/* What a foe's bar lost stands pale, its own hue lightened under a cream top line. */
${scope} .meter .lost { opacity: 0.6;
  background: linear-gradient(180deg, #fff6e4 0 1px, color-mix(in srgb, var(--fill) 45%, #fff6e4) 1px); }

/* A piece a loss breaks off: two halves the display drops a step at a time, under the words, over the fill. */
${scope} .meter .piece { position: absolute; top: 0; bottom: 0; display: block; pointer-events: none; }
${scope} .meter .piece > i { position: absolute; top: 0; bottom: 0; display: block; box-shadow: 0 0 0 1px ${TONES.outline};
  background: linear-gradient(180deg, #fff6e4 0 2px, var(--fill) 2px calc(100% - 3px),
    color-mix(in srgb, var(--fill), #000 35%) calc(100% - 3px)); }
${scope} .meter .piece .left { left: 0; width: 55%; }
${scope} .meter .piece .right { left: 55%; right: 0; }

/* The boss bar and the target's plate stand in the compass's column, under it, the target under the boss bar while both
   show. */
${scope} .target { width: min(340px, ${PLATES.boss.share * 100}%); font-size: 11px; }
${scope} .target .body { flex: 1; gap: 3px; }
${scope} .target .meter.health { height: 12px; }
@media (prefers-reduced-motion: reduce) {
  ${scope} .meter .piece { display: none !important; }
}
`;
}

/** The vitals' carved window of three bars, each naming itself and saying its percentage inside it, under `scope`. */
// Its keyframes are its own: the vitals on foot name theirs fight-low and fight-blink, and both sheets may share a page.
export function windowVitalsCss(scope: string): string {
  return `
${scope} .vitals { position: absolute; left: 24px; bottom: 24px; width: 260px; box-sizing: border-box;
  display: grid; gap: 6px; padding: 9px 10px; border-width: 2px; border-style: solid; }
${scope} .vital { display: flex; align-items: center; justify-content: space-between; height: 20px;
  border-width: 2px; }
${scope} .vital.poise { height: 16px; }
${scope} .vital.health { --fill: ${FILLS.health}; }
${scope} .vital.stamina { --fill: ${FILLS.stamina}; }
/* What a vital lost is its own body tone, faint: darker than any band of the fill, never brighter. */
${scope} .vital .lost { background: var(--fill); opacity: 0.35; }
/* Full and untouched, the panel rests: it goes in six steps, and comes back in two at the first change. */
${scope} .vitals { transition: opacity 120ms steps(2, end); }
${scope} .vitals.rest { opacity: 0; transition: opacity 1200ms steps(6, end); }
${scope} .vital .label, ${scope} .vital .number { position: relative; padding: 0 7px; color: ${TONES.word};
  text-shadow: ${HALO}; }
${scope} .vital .label { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; }
${scope} .vital .number { font-size: 11px; font-variant-numeric: tabular-nums; }
${scope} .vital.low { animation: window-low 0.9s steps(1, end) infinite; }
@keyframes window-low { 0% { border-color: ${BEVELS.blood}; } 50% { border-color: ${BEVELS.sunk}; } }
${scope} .vital.stamina.flash { box-shadow: 0 0 0 1px #fff, 0 0 8px #fff; animation: window-blink 0.15s steps(2) infinite; }
@keyframes window-blink { 50% { background-color: rgba(255,255,255,0.27); } }
@media (prefers-reduced-motion: reduce) {
  ${scope} .vital.low { animation: none; border-color: ${BEVELS.blood}; }
  ${scope} .vital.stamina.flash { animation: none; }
}
/* Where the HUD is wide, the vitals' words stand at the face's next step, and their bars grow to hold them. */
@media (min-width: 1500px) and (min-height: 900px) {
  ${scope} .vitals { width: 330px; gap: 8px; padding: 11px; }
  ${scope} .vital { height: 33px; }
  ${scope} .vital.poise { height: 22px; }
  ${scope} .vital .label, ${scope} .vital .number { font-size: 22px; padding: 0 11px; }
  ${scope} .vital.poise .label, ${scope} .vital.poise .number { font-size: 11px; }
}
`;
}
