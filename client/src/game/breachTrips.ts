// Going into a Breach and out again: launched or found from the Playlist, to its gate's patrol zone, standing at the
// gate in the run's company; through the gate into its run once the room says it is open to the player's company;
// and out of the run back to the gate. The rooms judge each way: the zone's which company a player stands in, the
// gate's whether it is open, the run's whom it lets in.
import type { Happening } from './flow.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import type { AtEntrance } from './footPlace.ts';
import { type BreachPlan, breachPlanOf, socketAt, socketBearing } from './breachPlan.ts';
import { type InBreach, gateOf } from './breachView.ts';
import { inSentence } from './breachWords.ts';
import type { NodeLayout } from '../layout/layouts.ts';
import { nodeOfRoom } from './rooms.ts';
import type { NodeInfo } from './worldData.ts';

/** The gate's answers to a player asking to enter (crates/room/src/asks.rs INTO_BREACH and OUT_OF_REACH,
 *  breach/gate.rs GATE_SHUT): let through, too far from its doorway, or shut to them. */
export const INTO_BREACH = 108;
export const OUT_OF_REACH = 100;
export const GATE_SHUT = 112;
/** What the page says of each refusal, the shut gate in the server's own words (server/breach.ts GATE_SHUT), and of
 *  a gate that gave no answer. */
export const GATE_WORDS: Readonly<Record<number, string>> = {
  [OUT_OF_REACH]: 'Too far from the gate.',
  [GATE_SHUT]: 'The Sunken Gate has not opened to your company.',
};
export const GATE_UNANSWERED = 'The gate did not answer. Try again.';
/** How long the page waits on the gate's answer, and how often it looks. */
const ANSWER_WAIT_MS = 3000;
const POLL_MS = 100;

/** What going into a Breach asks of the game: where the player stands on foot (its place, its run, their gear and
 *  the way to ask of it), its way behind the veil, the room's module, the places by id, and the ways onto the zone's
 *  room and into a run's. */
export interface BreachGame {
  readonly foot: () => {
    readonly node: NodeInfo;
    readonly run: InBreach | null;
    readonly gear: { readonly gear: GearState | null; ask(ask: GearAsk): void } | null;
  } | null;
  readonly travel: (happening: Happening, work: () => Promise<void>) => void;
  readonly module: Promise<WebAssembly.Module>;
  readonly nodes: readonly NodeInfo[];
  readonly ontoPatrol: (patrol: NodeInfo, facing: number, seas: 'normal', arriving?: AtEntrance) => Promise<void>;
  readonly intoBreach?: (into: InBreach) => Promise<void>;
  /** Says why the player is not where they went; how a wait for the gate's answer is waited. */
  readonly tell?: (words: string) => void;
  readonly wait?: (span: number) => Promise<void>;
}

/** Where a player launched for `run` arrives in its gate's zone: at the gate's own arrival, facing out, once the
 *  zone's layout says where the gate stands; at the zone's first spawn until then. The zone's room stands them. */
export async function gateArrival(
  land: { layoutsNamed(ids: readonly string[]): Promise<string> },
  zone: NodeInfo,
  run: string,
): Promise<AtEntrance> {
  const layouts = JSON.parse(await land.layoutsNamed([zone.id]).catch(() => '[]')) as NodeLayout[];
  const gate = layouts.map(gateOf).find(Boolean);
  if (!gate) {
    const [x, y] = zone.spawns[0] ?? zone.centre;
    return { number: -1, x, y, facing: 0, breach: run };
  }
  const [x, y] = socketAt('breach-gate', 'arrival', gate.at, gate.turn);
  return { number: -1, x, y, facing: socketBearing('breach-gate', 'arrival', gate.turn), breach: run };
}

/** How a player launched for `run` asks to join its gate's zone: the zone's room stands them at the gate, in the run's
 *  company, and `gateArrival` says where on the page. */
export const launchedArrival = (run: string): AtEntrance => ({ number: -1, x: 0, y: 0, facing: 0, breach: run });

/** The run a room's name is, by its plan: its tier and its gate's zone; null for a name that is no run of it. */
export function runOf(plan: BreachPlan, nodes: readonly NodeInfo[], run: string): InBreach | null {
  const where = nodeOfRoom(run);
  const zone = nodes.find((node) => node.id === plan.zone);
  if (!where || where.breach === null || where.run === null || where.id !== plan.zone || !zone) return null;
  return { run, tier: where.breach, plan, zone };
}

/** The ways into a Breach and out: to the gate with a run launched or found (`toGate`), through it into the run on
 *  the gate's yes (`enterBreach`), out of the run back to the gate (`leaveBreach`), and straight into a company
 *  member's run (`joinRun`). */
export function breachTrips(game: BreachGame) {
  /** The run the player was launched for, which the gate's E goes into. */
  let launched: InBreach | null = null;
  const plan = async () => breachPlanOf(await game.module);
  const wait = game.wait ?? ((span: number) => new Promise<void>((done) => setTimeout(done, span)));
  /** To the gate in the zone with `into`, as `happening` tells it. */
  const toGate = (into: InBreach, happening: Happening) =>
    game.travel(happening, async () => {
      launched = into;
      // The zone's room stands the player at the gate; the page stands them there too, as its layout says.
      await game.ontoPatrol(into.zone, 0, 'normal', launchedArrival(into.run));
    });
  return {
    /** Says a word of the Breach's to the player, as the gate's refusals are said. */
    tell: (words: string) => game.tell?.(words),
    /** To the gate of the run the Playlist launched or found. */
    toGate: (run: string) =>
      void plan().then((read) => {
        const into = runOf(read, game.nodes, run);
        if (into) toGate(into, { kind: 'enter', node: into.zone.id, name: `${inSentence(read.name)}'s gate` });
      }),
    /** Into the run the player was launched for, once the gate says it is open to them. */
    enterBreach: () => {
      const [into, asker, enter] = [launched, game.foot()?.gear ?? null, game.intoBreach];
      if (!into || !asker?.gear || !enter) return;
      const before = asker.gear.answered;
      asker.ask({ kind: ASKS.enterBreach });
      void (async () => {
        for (let waited = 0; waited < ANSWER_WAIT_MS; waited += POLL_MS) {
          await wait(POLL_MS);
          const now = game.foot()?.gear?.gear;
          if (!now || now.answered === before) continue;
          if (now.answer === INTO_BREACH)
            game.travel({ kind: 'enter', node: `${into.zone.id}--breach`, name: inSentence(into.plan.name) }, () =>
              enter(into),
            );
          else game.tell?.(GATE_WORDS[now.answer] ?? GATE_UNANSWERED);
          return;
        }
        game.tell?.(GATE_UNANSWERED);
      })();
    },
    /** Out of the run, back to its gate in the zone, in its company still. */
    leaveBreach: () => {
      const into = game.foot()?.run;
      if (into) toGate(into, { kind: 'leave', node: into.zone.id, name: inSentence(into.plan.name) });
    },
    /** Into a company member's run by its name, from wherever the player is: false for a name that is none. */
    joinRun: (place: string): boolean => {
      if ((nodeOfRoom(place)?.breach ?? null) === null) return false;
      void plan().then((read) => {
        const into = runOf(read, game.nodes, place);
        const enter = game.intoBreach;
        if (!into || !enter) return;
        launched = into;
        game.travel({ kind: 'join', node: `${into.zone.id}--breach`, name: inSentence(read.name) }, () => enter(into));
      });
      return true;
    },
  };
}
