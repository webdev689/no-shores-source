// What a click at sea leads to, and the landing it asks the player to confirm before the ship makes for it: a port's
// icon, or anywhere on its island, asks to dock there; a coast with no port asks to go ashore on it; one of the sea's
// islands asks to go ashore on it. Yes sets the ship making for it, and it lands once it lies where it can; another
// course given meanwhile lets the landing go.
import type { Point2 } from '../overworld/ground.ts';
import type { Pick } from '../overworld/overworldPick.ts';
import { HOSTILE_PREFIX } from './seaHostiles.ts';
import type { Landfall } from './seaLaw.ts';
import type { SeaLevel } from './seaView.ts';

/** A landing the player may make: docking at a port city's harbour, going ashore on a coast with no port (toward the
 *  point clicked), or going ashore on one of the sea's islands. */
export type LandingAim =
  | { readonly kind: 'dock'; readonly port: string; readonly harbour: Point2 }
  | { readonly kind: 'ashore'; readonly coast: string; readonly toward: Point2 }
  | { readonly kind: 'isle'; readonly id: number; readonly words: string };

/** What a click at sea does: sails there, chases a hostile ship by its mark, asks to land, or nothing. */
export type SeaClick =
  | { readonly kind: 'sail'; readonly point: Point2 }
  | { readonly kind: 'chase'; readonly id: string }
  | { readonly kind: 'ask'; readonly aim: LandingAim }
  | null;

/** What the click is judged against: the open landmass's port city, if it is a living one, and its coast's name; the
 *  sea's island a point lies on or by, if any. */
export interface ClickContext {
  readonly port: { readonly id: string; readonly name: string; readonly harbour: Point2 } | null;
  readonly coast: string;
  readonly isleAt: (point: Point2) => { readonly id: number; readonly words: string } | null;
}

/** What a click that met `pick` does in the view switched to (`level`): a port's icon, or its island's land, asks to
 *  dock there, a coast with no port to go ashore; a sea island's water asks to go ashore on it; a hostile ship's mark
 *  sets the chase. Only the Oversea view sails to a point clicked: at sea level the helm's keys sail. */
export function clickAtSea(pick: Pick, level: SeaLevel, here: ClickContext): SeaClick {
  if (pick.kind === 'none') return null;
  if (pick.kind === 'mark') {
    if (pick.id.startsWith(HOSTILE_PREFIX)) return { kind: 'chase', id: pick.id };
    return here.port && pick.id === here.port.id ? { kind: 'ask', aim: dockAt(here.port) } : null;
  }
  const point: Point2 = [pick.point[0], pick.point[1]];
  // A sea island's own ground, or the water by it, is that island's before the open landmass's.
  const isle = here.isleAt(point);
  if (isle) return { kind: 'ask', aim: { kind: 'isle', ...isle } };
  if (pick.kind === 'land')
    return { kind: 'ask', aim: here.port ? dockAt(here.port) : { kind: 'ashore', coast: here.coast, toward: point } };
  return level === 'oversea' ? { kind: 'sail', point } : null;
}

const dockAt = (port: NonNullable<ClickContext['port']>): LandingAim => ({
  kind: 'dock',
  port: port.name,
  harbour: port.harbour,
});

/** The confirmation's words for a landing: its question, what yes does (made at once where the ship lies within reach,
 *  `near`, else sailed for first), and its yes. They name no pace: a voyage set at ×60 eases to the ship's true speed
 *  while the view is close on it, and the console shows which. */
export function askWords(
  aim: LandingAim,
  near: boolean,
): { readonly title: string; readonly line: string; readonly yes: string } {
  if (aim.kind === 'dock')
    return {
      title: `Dock at ${aim.port}?`,
      line: near
        ? `Your ship lies off ${aim.port}'s harbour. Docking shows what its island holds.`
        : `Your ship will make for ${aim.port}'s harbour and dock there.`,
      yes: 'Dock',
    };
  if (aim.kind === 'isle')
    return {
      title: `Go ashore on ${aim.words}?`,
      line: 'Your ship will sail round to its anchorage, and you will walk ashore on its beach.',
      yes: 'Go ashore',
    };
  return {
    title: `Go ashore on ${aim.coast}?`,
    line: near
      ? 'No port stands on this coast. Going ashore shows what lies inland.'
      : 'No port stands on this coast. Your ship will make for it and you will go ashore.',
    yes: 'Go ashore',
  };
}

/** Whether a landing can be made where the ship lies now, by what the sea offers it there. */
export function inReach(aim: LandingAim, landfall: Landfall): boolean {
  if (!landfall) return false;
  if (aim.kind === 'dock') return landfall.kind === 'dock' && landfall.port === aim.port;
  if (aim.kind === 'isle') return landfall.kind === 'isle' && landfall.id === aim.id;
  return landfall.kind === 'ashore';
}

/** A landing answered yes and made for: the ship sails toward it until it lies where it can land, unless another course
 *  is given meanwhile (a click, the helm's keys, a chase), which lets it go. */
export class LandingCourse {
  private aim: LandingAim | null = null;
  /** Where the ship was sent for it, which its voyage stays bound for while the landing stands. */
  private sent: Point2 | null = null;

  /** Makes for `aim`, sent to `sent` (the harbour, or the point on the coast clicked). */
  begin(aim: LandingAim, sent: Point2): void {
    [this.aim, this.sent] = [aim, sent];
  }

  /** The landing being made for, if any. */
  get making(): LandingAim | null {
    return this.aim;
  }

  /** The landing due now, taken once: once what the sea offers (`landfall`) reaches it. Let go if the ship is bound
   *  elsewhere (`bound`, kept while it is stopped short to be resumed), or at anchor with no voyage and out of reach. */
  due(landfall: Landfall, bound: Point2 | null): LandingAim | null {
    const { aim, sent } = this;
    if (!aim || !sent) return null;
    if (inReach(aim, landfall)) {
      this.cancel();
      return aim;
    }
    const still = bound !== null && Math.hypot(bound[0] - sent[0], bound[1] - sent[1]) < 1;
    if (!still) this.cancel();
    return null;
  }

  cancel(): void {
    [this.aim, this.sent] = [null, null];
  }
}
