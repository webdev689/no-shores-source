// The bars' sheet the on-foot HUD and the sea fight's readout both wear, so a bar and the target's plate read the same
// wherever they stand: the bar's trough, fill, lost strip and falling pieces; the plates' emblem square, bands, title
// and the target's size; and the long thin bars of the vitals on foot and of the ship at sea. Each rule is laid under
// `scope`, the root of the display that wears it.
import { BAR_EDGE, BAR_TONES, type BarTone, barFrameImage, tipOf } from './barFrame.ts';
import { PLATES } from './barLayout.ts';
import { EMBLEM_FACTIONS, EMBLEM_PIXELS, emblemUrl } from './emblems.ts';
import { FILLS, HALO, TONES } from './tones.ts';

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

/** A thin bar's height, frame and all, at the first step and the larger, and the frame its warning flashes to. */
export interface ThinBar {
  readonly base: number;
  readonly wide: number;
  readonly alert: BarTone;
}

/** Long thin bars with pointed ends in a fine stone frame, under `scope`: the vitals on foot, and the ship's hull, sails
 *  and crew at sea. `bars` gives each bar's class its heights and its warning's frame; a bar's `width` is its length.
 *  The scope's `.wide` takes the larger step and its `.double` doubles the bars; a bar's `.low` flashes its frame. */
export function thinBarsCss(scope: string, bars: Readonly<Record<string, ThinBar>>): string {
  const frames = (scoped: string, step: 'base' | 'wide') =>
    Object.entries(bars).map(([name, bar]) => {
      const height = bar[step];
      const tip = tipOf(height);
      return `${scoped} .vital.${name} { height: ${height}px; border-width: ${BAR_EDGE}px ${tip}px;
  border-image: ${barFrameImage(height, BAR_TONES.stone)}; }
${scoped} .vital.${name}::after { inset: -${BAR_EDGE}px -${tip}px; border-width: ${BAR_EDGE}px ${tip}px;
  border-image: ${barFrameImage(height, bar.alert)}; }`;
    });
  return `
${scope} .vitals { position: absolute; display: flex; flex-direction: column; align-items: flex-start; }
${scope} .vital { position: relative; box-sizing: border-box; width: 160px; border-style: solid; }
${scope} .vital .meter { height: 100%; border: 0; background-color: ${TONES.groundTrack}; }
/* What a bar lost is its own body tone, faint: darker than any band of the fill, never brighter. */
${scope} .vital .lost { background: var(--fill); opacity: 0.35; }
${scope} .vital::after { content: ''; position: absolute; border-style: solid; opacity: 0; pointer-events: none; }
${scope} .vital.low::after { animation: thin-low 0.9s steps(1, end) infinite; }
@keyframes thin-low { 0% { opacity: 1; } 50% { opacity: 0; } }
/* Past 1440p the bars stand at twice their first size, as the rest of the display does. */
${scope}.double .vitals { zoom: 2; }
${frames(scope, 'base').join('\n')}
${frames(`${scope}.wide`, 'wide').join('\n')}
@media (prefers-reduced-motion: reduce) {
  ${scope} .vital.low::after { animation: none; opacity: 1; }
}
`;
}
