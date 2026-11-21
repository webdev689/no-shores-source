// A boss's nameplate as the camera finds them: their faction's emblem, their name large across the view, the faction
// under it, and a rule of iron red between, struck in and held while they cry out, then gone. Drawn by the game as a
// layer of its interface; a screen reader hears the name and faction as the plate is struck.
import { dropped, Eased, pageClock, ruleOf } from '../../cinema/cinemaParts.ts';
import { EMBLEM_PIXELS, emblemUrl } from '../../plus/emblems.ts';
import { motionReduced } from '../../plus/kit.ts';
import { announce } from '../../ui/announce.ts';
import { cubicBezier, ease } from '../../ui/ease.ts';
import type { Child } from '../../ui/node.ts';
import type { Stack } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';

/** Over the HUD and the objective, under the cinema's screen. */
const NAMEPLATE_Z = 26;
const STRIKE_S = 0.5;
const RULE_S = 0.7;
const RULE_HOLD_S = 0.15;
const IRON_RULE = ruleOf('nameplate rule', [
  [0.15, '#6b1208'],
  [0.5, '#c8341c'],
  [0.85, '#6b1208'],
]);
/** The strike's and the rule's ease, `cubic-bezier(.2,.9,.2,1)`. */
const struck = (share: number) => cubicBezier(0.2, 0.9, 0.2, 1, share);

export class Nameplate {
  private readonly shown = new Eased(0, ease);
  private readonly clock: () => number;
  private readonly removeLayer: () => void;
  private plate: { readonly name: string; readonly faction: string; readonly emblem: string | null } | null = null;
  private since = 0;
  private hiddenAt = 0;
  private strike = false;

  constructor(stack: Stack, clock: () => number = pageClock) {
    this.clock = clock;
    this.removeLayer = stack.add((ui) => this.node(ui));
  }

  /** Strikes the plate in: the name, its faction by number and name. */
  show(name: string, faction: number, factionName: string): void {
    this.plate = { name, faction: factionName, emblem: emblemUrl(faction) };
    this.since = this.clock();
    this.strike = !motionReduced();
    this.shown.set(1, 0.35, this.since);
    announce(`${name}, ${factionName}`);
  }

  hide(): void {
    this.hiddenAt = this.clock();
    this.shown.set(0, 0.35, this.hiddenAt);
  }

  remove(): void {
    this.removeLayer();
  }

  /** The plate this frame, while it shows or fades. */
  node(ui: Interface): Child {
    const plate = this.plate;
    const now = this.clock();
    const shown = this.shown.value(now);
    if (!plate || shown <= 0) return null;
    const { width, height } = ui.size;
    const into = now - this.since;
    // The name strikes in: its fade, 0 to whole over the first 60% of the strike. Grown and shrunk as the sheet's
    // `scale` did, it cannot be: the face is drawn in whole steps.
    const nameShown = this.strike ? Math.min(1, into / (0.6 * STRIKE_S)) : 1;
    // The rule draws out from the middle as the plate strikes in, and back in as it goes, each after its hold.
    const drawn = (since: number) => struck(Math.min(1, Math.max(0, (since - RULE_HOLD_S) / RULE_S)));
    const rule = this.shown.target > 0 ? drawn(into) : 1 - drawn(now - this.hiddenAt);
    const ruleWide = Math.min(660, Math.round(width * 0.8));
    return {
      width,
      direction: 'column',
      alignX: 'center',
      through: true,
      opacity: shown,
      float: { to: 'screen', y: Math.round(height * 0.58), z: NAMEPLATE_Z },
      children: [
        plate.emblem !== null && {
          width: 55,
          height: 55,
          picture: {
            key: plate.emblem,
            // The emblem's SVG, drawn by the page: its data URL's own markup.
            source: { svg: decodeURIComponent(plate.emblem.slice(plate.emblem.indexOf(',') + 1)) },
            pixel: { width: EMBLEM_PIXELS, height: EMBLEM_PIXELS },
          },
        },
        plate.emblem !== null && { height: 11 },
        dropped(
          {
            words: plate.name.toUpperCase(),
            size: width <= 900 ? 4 : 6,
            leading: (width <= 900 ? 4 : 6) * 11,
            colour: '#f0e4c4',
            tracking: 4,
            wrap: false,
          },
          '#2a0404',
          4,
          { opacity: nameShown },
        ),
        { height: 10 },
        {
          width: ruleWide,
          height: 4,
          alignX: 'center',
          children: [{ width: Math.round(ruleWide * rule), height: 4, picture: IRON_RULE }],
        },
        { height: 11 },
        dropped(
          { words: plate.faction.toUpperCase(), size: 2, colour: '#b9a37a', tracking: 6, wrap: false },
          '#000',
          2,
        ),
      ],
    };
  }
}
