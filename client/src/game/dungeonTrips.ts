// Going into a patrol's dungeons and out again: in behind the veil at its way in, out before the door of the entrance
// the player went in by, facing away from it; each at the seas of the room the player stands in.
import { askDungeon, type DungeonLayout } from './dungeonLayout.ts';
import { beforeDoor, type Entrance } from './entrances.ts';
import type { AtEntrance } from './footPlace.ts';
import type { InDungeon } from './footTrips.ts';
import type { Happening } from './flow.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { PropTable } from '../models/tables.ts';
import type { NodeInfo } from './worldData.ts';

/** What a trip reads of where the player stands on foot: the place, its node file's text, the seas of its room, the
 *  dungeon they are in, and the entrances its room last gave. */
export interface TripFoot {
  readonly node: NodeInfo;
  readonly text: string;
  readonly seas: Difficulty;
  readonly dungeon: InDungeon | null;
  readonly held: { readonly entrances: { readonly entrances: readonly Entrance[] } };
}

/** What going in and out asks of the game: the player's place on foot, its way behind the veil, the room's module, a
 *  way into a dungeon and onto a patrol, each joined at `seas`, and the dungeons' drawers. */
export interface TripGame {
  readonly foot: () => TripFoot | null;
  readonly travel: (happening: Happening, work: () => Promise<void>) => void;
  readonly module: Promise<WebAssembly.Module>;
  readonly intoDungeon: (
    patrol: { readonly node: NodeInfo; readonly text: string },
    number: number,
    layout: DungeonLayout,
    seas: Difficulty,
  ) => Promise<void>;
  readonly ontoPatrol: (patrol: NodeInfo, facing: number, seas: Difficulty, arriving?: AtEntrance) => Promise<void>;
  readonly drawers: {
    readonly props: PropTable | null;
    show(layout: DungeonLayout, patrol: NodeInfo, entrance: Entrance | undefined): Promise<void> | void;
  };
}

/** The ways into a patrol's dungeon and out again, and into a company member's dungeon from wherever the player is. */
export function dungeonTrips(game: TripGame): {
  enter(number: number, name: string): void;
  leave(): void;
  join(patrol: NodeInfo, number: number, seas: Difficulty): void;
} {
  /** The entrance the player last went in by; none after a join, which came by no entrance. */
  let wentIn: Entrance | undefined;
  const into = (patrol: NodeInfo, text: string, number: number, seas: Difficulty, entrance?: Entrance) => async () => {
    const layout = askDungeon(await game.module, patrol.id, patrol.name, number);
    await game.intoDungeon({ node: patrol, text }, number, layout, seas);
    await game.drawers.show(layout, patrol, entrance);
    wentIn = entrance;
  };
  return {
    enter: (number, name) => {
      const from = game.foot();
      if (!from || from.dungeon) return;
      const entrance = from.held.entrances.entrances[number];
      const work = into(from.node, from.text, number, from.seas, entrance);
      game.travel({ kind: 'enter', node: `${from.node.id}--dungeon-${number}`, name }, work);
    },
    leave: () => {
      const inside = game.foot();
      if (!inside?.dungeon) return;
      const { patrol, number, layout } = inside.dungeon;
      const props = game.drawers.props;
      const before = wentIn && props ? beforeDoor(wentIn, props) : null;
      const arriving = before ? { number, ...before } : undefined;
      game.travel({ kind: 'leave', node: patrol.id, name: layout.name }, () =>
        game.ontoPatrol(patrol, before?.facing ?? 0, inside.seas, arriving),
      );
    },
    // A company joins online only, where a dungeon's room never asks for the patrol's node file.
    join: (patrol, number, seas) => {
      void game.module.then((module) => {
        const { name } = askDungeon(module, patrol.id, patrol.name, number);
        const happening = { kind: 'join', node: `${patrol.id}--dungeon-${number}`, name } as const;
        game.travel(happening, into(patrol, '', number, seas));
      });
    },
  };
}
