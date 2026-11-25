// The mouths' card in the patrol zone: E within reach of a run's sealed door opens it on that door's mouth, and it
// closes once its place is left: another room, another flow (the ship, the map), or walked away from the door.
import type { Foot } from '../foot.ts';
import type { Uses } from '../footPlace.ts';
import type { NodeLayout } from '../../layout/layouts.ts';
import type { PassageWeb } from '../../rules/passageRules.ts';
import { MouthsCardView } from './passagePanels.ts';
import { MOUTH_REACH_M, mouthAt } from './passageReach.ts';
import { mouthsChoice, type Route } from './passageWords.ts';

/** How far past a mouth's reach the mouths' card stays open, metres: walked further, it closes. */
const CARD_REACH_M = 6;

/** What the card asks of the game: the player's foot and body, whether they are on foot, the company's places, the
 *  lamps lit this week and the player's level, and what its choice does. */
export interface CardHost {
  readonly foot: () => Foot | null;
  readonly body: () => { readonly x: number; readonly y: number };
  readonly onFoot: () => boolean;
  readonly companyPlaces: () => Promise<readonly string[]>;
  readonly lit: (island: string) => readonly number[];
  readonly level: () => number | null;
  readonly go: (route: Route, lamp: number | null) => void;
}

export class MouthsCard {
  readonly view: MouthsCardView;
  /** The patrol zone's mouth whose card stands open, the foot it was opened on and where its door stands. */
  mouth: number | null = null;
  private cardAt: { readonly foot: Foot; readonly door: readonly [number, number] } | null = null;
  private readonly host: CardHost;

  constructor(host: CardHost) {
    this.host = host;
    this.view = new MouthsCardView({ go: (route, lamp) => host.go(route, lamp), close: () => this.close() });
  }

  /** What E does at the sealed doors of `runs`, the patrol zone's, whose mouths `web` leads from. */
  uses(web: PassageWeb, runs: NonNullable<NodeLayout['runs']>): Uses {
    return (x, y) => {
      const door = mouthAt(web, runs, x, y);
      if (!door) return null;
      const sealed = runs.find((run) => run.name === door.run)?.door ?? [x, y];
      const opened = () => void this.open(web, door.mouth, door.run, [sealed[0], sealed[1]]);
      return { words: 'Into the passages', run: opened };
    };
  }

  private async open(web: PassageWeb, mouth: number, run: string, door: readonly [number, number]): Promise<void> {
    const foot = this.host.foot();
    const company = (await this.host.companyPlaces()).length > 0;
    const choice = mouthsChoice(web, run, company, this.host.lit(web.island), this.host.level());
    if (!choice || !foot || this.host.foot() !== foot) return;
    [this.mouth, this.cardAt] = [mouth, { foot, door }];
    this.view.show(choice);
  }

  close(): void {
    [this.mouth, this.cardAt] = [null, null];
    this.view.hide();
  }

  /** Each frame: the card closes once its place is left. */
  keep(foot: Foot | null): void {
    const opened = this.cardAt;
    if (!opened) return;
    const body = this.host.body();
    const away = Math.hypot(body.x - opened.door[0], body.y - opened.door[1]) > MOUTH_REACH_M + CARD_REACH_M;
    if (foot !== opened.foot || !this.host.onFoot() || away) this.close();
  }
}
