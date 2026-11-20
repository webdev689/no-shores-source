import type { FightEvent, ShotName } from '../rules/fightRules.ts';
import type { FleetLay, FleetLook } from '../rules/fleetRules.ts';
import type { ShipFloats } from '../rules/landRules.ts';
import { RANKS, shipName } from '../ships/shipBars.ts';
import { Afloat } from './afloat.ts';
import { wordsFor } from './fighting.ts';
import type { FleetInput, FleetSession, FleetVessel } from './fleetLink.ts';

/** How long a message stays on the panel, seconds. */
const MESSAGE_S = 3.5;
const LOADS: readonly ShotName[] = ['round', 'grape', 'chain', 'heated'];

/**
 * The owner's Sloop in a fleet room, as the World Editor shows her: her session there (her orders and her predicted
 * ship), her wake as she moves, and what the panel says of her, the nearest captain and what happened.
 */
export class FleetSloop extends Afloat {
  readonly session: FleetSession;
  private messages: { readonly text: string; readonly until: number }[] = [];

  constructor(session: FleetSession) {
    super(session.shipFloats(), session.shipPose());
    this.session = session;
  }

  /** The room's clock at `now`. */
  roomTime(now: number): number {
    return this.session.roomTime(now);
  }

  /** Every other ship the room shows. */
  others(): readonly FleetVessel[] {
    return this.session.others();
  }

  /** The balls aloft at `now`. */
  balls(now: number): (readonly [number, number, number, number])[] {
    return this.session.balls(now);
  }

  /** Her fires aboard by the room's word, on her deck as predicted (x, y, heave); none once she sinks. */
  fires(): readonly [number, number, number, number] {
    const own = this.session.own();
    const [x = 0, y = 0] = this.ship;
    return [x, y, this.pose.heave, own && own.state !== 'sinking' ? own.fires : 0];
  }

  /** Her look's lay, as the room would lay it now. */
  lay(look: FleetLook, now: number): FleetLay | null {
    return this.session.lay(look, now);
  }

  /** Her orders owed for `seconds` sent, her ship taken as predicted (her wake stirred by her run), and what happened
   *  made words for the panel. */
  advance(seconds: number, input: FleetInput, now: number): void {
    this.session.advance(seconds, input, now);
    this.moveTo(new Float64Array(this.session.shipFloats()) as ShipFloats, this.session.shipPose());
    for (const event of this.session.takeEvents()) {
      const words =
        event.kind === 'gone' ? goneWords(event.ship, event.sunk) : wordsFor(event, () => 'captain’s Sloop');
      if (words) this.say(words, now);
    }
  }

  private say(text: string, now: number): void {
    this.messages = [...this.messages.filter((message) => message.text !== text), { text, until: now + MESSAGE_S }];
  }

  /** The fight's events since last taken, for its feel. */
  takeEvents(): FightEvent[] {
    return this.session.takeFeel();
  }

  /** The panel's lines at `now`: her hurts and guns, the nearest captain's, her lay, the broadside warning, the fleet,
   *  and the messages. */
  lines(now: number, lay: FleetLay | null): string[] {
    const own = this.session.own();
    const whole = (have: number, most: number) => `${Math.ceil(have)}/${most}`;
    const lines: string[] = [];
    if (own) {
      const side = (index: 0 | 1) => (own.guns.left[index] > 0 ? `${own.guns.left[index].toFixed(1)} s` : 'ready');
      const load = LOADS[own.load - 1] ?? 'round';
      lines.push(
        `Your Sloop: hull ${whole(own.hurts.hull, own.hurts.maxHull)}, sails ${whole(own.hurts.sail, own.hurts.maxSail)}.` +
          ` Port ${side(0)}, starboard ${side(1)}. ${load[0]?.toUpperCase() ?? ''}${load.slice(1)} shot.` +
          (own.braced ? ' Braced.' : ''),
      );
    } else lines.push('Putting to sea…');
    const [x = 0, y = 0] = this.ship;
    const captains = this.others().filter((vessel) => vessel.captain);
    const apart = (vessel: FleetVessel) => Math.hypot((vessel.ship[0] ?? 0) - x, (vessel.ship[1] ?? 0) - y);
    const nearest = captains.reduce<FleetVessel | null>(
      (best, vessel) => (best && apart(best) <= apart(vessel) ? best : vessel),
      null,
    );
    if (nearest) {
      const { hurts } = nearest;
      const named = `${shipName(nearest.faction, nearest.hull)} (${RANKS[nearest.rank - 1] ?? 'Major'})`;
      lines.push(
        `${named}, ${Math.round(apart(nearest))} m off, ${nearest.state === 'afloat' ? nearest.mode : nearest.state}:` +
          ` hull ${whole(hurts.hull, hurts.maxHull)}, sails ${whole(hurts.sail, hurts.maxSail)}, ${Math.round(hurts.crew)} men.`,
      );
    }
    if (lay) lines.push(`Laying the ${lay.side} guns${lay.onTarget ? ': on target.' : '.'}`);
    const id = this.session.id;
    const broadside = captains.some(
      (vessel) => vessel.target === id && vessel.runOut !== 0 && vessel.state === 'afloat',
    );
    if (broadside) lines.push('Broadside: C to brace.');
    const players = this.others().length - captains.length;
    lines.push(
      `In the fleet: ${players} other ${players === 1 ? 'ship' : 'ships'}, ${captains.length} ${captains.length === 1 ? 'captain' : 'captains'}. F calls a captain, X sends them off.`,
    );
    if (this.session.rejoining) lines.push('Reconnecting…');
    else if (this.session.lost) lines.push(`The fleet room is lost: ${this.session.lost}.`);
    this.messages = this.messages.filter((message) => message.until > now);
    return [...lines, ...this.messages.map((message) => message.text)];
  }
}

/** What the panel says of a captain leaving the fight (ship 1, as the fight's words number a captain). */
function goneWords(ship: number, sunk: boolean): string | null {
  if (ship !== 1) return null;
  return sunk ? 'A captain’s Sloop has gone down.' : 'A captain’s Sloop is gone.';
}
