import type { PlayerDress, SeenPlayer } from '../network/messages.ts';
import type { PlayerPlate } from '../network/plateMessages.ts';
import { glanceFrom, glanceView } from '../rules/fighters.ts';
import type { Body } from '../rules/movementRules.ts';
import type { Cards } from './cards.ts';
import { type Dress, dressFrom, plainDress } from './dressing.ts';
import type { Placed } from './figures.ts';

/** How a page keeps other players' figures: it places one for a player who comes, and takes away one who leaves. */
export interface Others {
  place(dress: Dress, x: number, y: number, facing: number): Placed;
  remove(placed: Placed): void;
}

/** Faster than a walk on foot is running. */
export const RUNNING = 5.5;

/** The forge move another player's figure plays for the body the room last saw. */
export function moveOf(body: Body): string {
  if (body.mode === 'hang') return body.moving ? 'shimmy' : 'hang';
  if (body.mode === 'climb' || body.mode === 'mantle' || body.mode === 'vault') return body.mode;
  if (body.mode === 'air') return 'jump';
  if (body.crouched) return body.moving ? 'crouch_walk' : 'crouch_idle';
  if (!body.moving) return 'idle';
  return Math.hypot(body.vx, body.vy) > RUNNING ? 'run' : 'walk';
}

/** Moves another player's figure to the body the room last saw. It shows the move their own screen showed with it,
 *  facing as it faced, where the forge draws that move for this figure; else the move their body is in. */
export function showOther(placed: Placed, seen: SeenPlayer, draws: (anim: string) => boolean): void {
  const own = seen.anim !== '' && draws(seen.anim);
  const { x, y, z } = seen.body;
  const look = own
    ? { anim: seen.anim, frame: seen.frame, facing: seen.facing }
    : { anim: moveOf(seen.body), frame: null, facing: seen.body.facing };
  Object.assign(placed, { x, y, z, ...look });
}

/** Another player's dress as their figure wears it now: the weapon put away while the room's snapshot shows them
 *  drinking, at once, though the dress their page sends, at most once a second, says so only later. */
export function dressNow(dress: Dress, fighter: ArrayLike<number> | null): Dress {
  const drinking = fighter !== null && fighter.length > 0 && glanceView(glanceFrom(fighter)).action.kind === 'drink';
  return drinking ? { ...dress, outfit: { ...dress.outfit, drawn: false } } : dress;
}

/** Every other player in a room as their figures: each in their own dress, standing where the room last saw them, and
 *  taken away once the room no longer sees them. */
export class OtherPlayers {
  /** Each other player's figure, by their number. */
  readonly placed: ReadonlyMap<number, Placed>;
  private readonly figures = new Map<number, Placed>();
  private readonly dresses = new Map<number, Dress>();
  private readonly plates = new Map<number, PlayerPlate>();
  private readonly page: Others;

  constructor(page: Others) {
    this.page = page;
    this.placed = this.figures;
  }

  /** The dresses and plates a welcome or a snapshot carries. Another player's dress is used only when it is one: a
   *  broken or hostile one keeps the dress they had. */
  take(said: { readonly dressed: readonly PlayerDress[]; readonly plates?: readonly PlayerPlate[] }): void {
    for (const plate of said.plates ?? []) this.plates.set(plate.player, plate);
    for (const { player: number, dress } of said.dressed) {
      const taken = dressFrom(dress);
      if (!taken) continue;
      this.dresses.set(number, taken);
      const placed = this.figures.get(number);
      if (placed) placed.dress = taken;
    }
  }

  /** Every player a snapshot saw but `own`, placed or moved, as `forge` draws their moves, in their dress as it is now
   *  (`dressNow`); one it no longer sees, taken away. */
  seen(players: readonly SeenPlayer[], own: number | null, forge: Cards): void {
    const present = new Set<number>();
    for (const seen of players) {
      const { player: number, body } = seen;
      if (number === own) continue;
      present.add(number);
      const dress = this.dresses.get(number) ?? plainDress('human', 0.6);
      const placed = this.figures.get(number) ?? this.page.place(dress, body.x, body.y, body.facing);
      this.figures.set(number, placed);
      placed.dress = dressNow(dress, seen.fighter);
      showOther(placed, seen, (anim) => forge.draws(placed.dress.body, anim, null));
    }
    for (const [number, placed] of this.figures) {
      if (present.has(number)) continue;
      this.page.remove(placed);
      this.figures.delete(number);
    }
  }

  /** What another player's plate says, as the room last sent it; null before it has. */
  plateOf(number: number): PlayerPlate | null {
    return this.plates.get(number) ?? null;
  }

  /** Takes away every figure. */
  clear(): void {
    for (const placed of this.figures.values()) this.page.remove(placed);
    this.figures.clear();
  }
}
