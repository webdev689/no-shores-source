// Which of the world's sound cues (content/audio/freesound.json) a moment of play calls for: pure, so each rule is
// tested on its own. worldSounds.ts watches the fight and the walkers frame by frame and plays what these choose.

import { SPELLS } from '../network/artMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import type { Action, StatusName } from '../rules/fighters.ts';
import type { Block, Mode } from '../rules/movementRules.ts';
import { EVENT, HOW } from './cues.ts';
import type { Surface } from './shotMarks.ts';

type Point = readonly [number, number, number];

/** A fighter's arms code as the combat crate packs it: the melee class, the shooting weapon and the left hand. */
export function armsOf(code: number): { readonly melee: number; readonly ranged: number; readonly shield: boolean } {
  return { melee: code & 0xff, ranged: (code >> 8) & 0xff, shield: ((code >> 16) & 0xff) === OFF_HAND_SHIELD };
}

const OFF_HAND_SHIELD = 1;
/** The combat crate's melee classes: a flail, an axe, a warhammer and a greatsword are heavy; a staff is its own; the
 *  rest (fists, a dagger, a sword, a mace) are light. A dagger, a sword, an axe and a greatsword cut. */
const HEAVY = new Set([4, 5, 6, 8]);
const STAFF = 7;
const BLADES = new Set([1, 2, 5, 8]);
/** The shooting weapons: a bow, a crossbow, a pistolet, a thunderlock and a pistolet in each hand. */
const RANGED_SHOTS: Readonly<Record<number, string>> = {
  1: 'bow.shot',
  2: 'crossbow.shot',
  3: 'pistol.shot',
  4: 'musket.shot',
  5: 'pistol.shot',
};
const BOW = 1;
const CROSSBOW = 2;
/** The guns fire balls; the bow and the crossbow loose arrows and bolts. */
export const isGun = (ranged: number): boolean => ranged >= 3 && ranged <= 5;

/** The swing of a melee weapon, by its class. */
export function swingCue(arms: number): string {
  const { melee } = armsOf(arms);
  if (melee === STAFF) return 'swing.staff';
  return HEAVY.has(melee) ? 'swing.heavy' : 'swing.light';
}

/** A shot let go by a shooting weapon; none for a number that is not one. */
export const shotCue = (ranged: number): string | null => RANGED_SHOTS[ranged] ?? null;

/** A reload begun: a crossbow wound, a gun loaded; a bow has none. */
export function reloadCue(ranged: number): string | null {
  if (ranged === CROSSBOW) return 'crossbow.reload';
  return isGun(ranged) ? 'gun.reload' : null;
}

/** A shot stopped on what the tracers say it met: a body's is the fight's word on the hit, so none here; a ball on stone
 *  rings, an arrow sticks in the ground, any shot splashes in water. A ball in the ground and an arrow on stone have no
 *  cue of their own. */
export function struckCue(surface: Surface, ball: boolean): string | null {
  if (surface === 'water') return 'shot.splash';
  if (surface === 'stone') return ball ? 'ball.hit' : null;
  if (surface === 'ground') return ball ? null : 'arrow.stick';
  return null;
}

const ELEMENTS = ['', 'blaze', 'volt', 'cosmic'] as const;

/** A cue an event calls for, heard where its striker or its defender stands. */
export interface EventCue {
  readonly cue: string;
  readonly at: 'striker' | 'defender';
}

/**
 * The cues a fight's event calls for: a blow landing by what struck it (a blade, something blunt, an arrow or bolt, a
 * ball; a spell is heard as its own cast), a crit, the element it burst in (`look`, as its picture bursts) and a kill
 * in an element's finisher; a blow met by a shield or a blade, a parry, a guard broken, a kill, and a foe's shield
 * struck or broken.
 */
export function eventCues(
  event: FightEvent,
  { striker, defender, look }: { readonly striker: number; readonly defender: number; readonly look: number },
): EventCue[] {
  const atDefender = (cue: string): EventCue => ({ cue, at: 'defender' });
  const element = ELEMENTS[look] ?? '';
  switch (event.kind) {
    case EVENT.hit: {
      const cues: EventCue[] = [];
      if (event.how !== HOW.spell) cues.push(atDefender(hitCue(event.how, striker)));
      if (event.crit) cues.push(atDefender('crit'));
      if (element && event.how !== HOW.spell) cues.push(atDefender(`element.${element}`));
      return cues;
    }
    case EVENT.blocked:
      return [atDefender(armsOf(defender).shield ? 'block.shield' : 'block.blade')];
    case EVENT.parried:
      return [atDefender('parry')];
    case EVENT.guardBroken:
      return [atDefender('guard.break')];
    case EVENT.killed:
      return element ? [atDefender('kill'), atDefender(`finish.${element}`)] : [atDefender('kill')];
    case EVENT.shielded:
      return [atDefender('shield.hit')];
    case EVENT.shieldBroken:
      return [atDefender('shield.break')];
    default:
      return [];
  }
}

/** A blow landing on a body: a shot by its weapon's kind (a ball strikes as something blunt), any other by the
 *  striker's melee weapon. */
function hitCue(how: number, striker: number): string {
  const { melee, ranged } = armsOf(striker);
  if (how === HOW.shot) return isGun(ranged) ? 'hit.blunt' : 'arrow.hit';
  return BLADES.has(melee) ? 'hit.blade' : 'hit.blunt';
}

/** The cue a fighter's action calls for as it changes from `before` to `now`: a swing begun (another begun at once
 *  counts), a foe's wound-up blow landing (a feint or an aimed shot does not swing), a dodge's roll, a bow drawn and a
 *  reload. */
export function actionCue(before: Action | null, now: Action, arms: number): string | null {
  const began = before?.kind !== now.kind;
  if (now.kind === 'attack' && (before?.kind !== 'attack' || now.elapsed < before.elapsed)) return swingCue(arms);
  if (before?.kind === 'telegraph' && began && before.shape !== 'aimed' && before.feintAt === null)
    return before.elapsed + LANDED_TICKS >= before.windup ? swingCue(arms) : null;
  if (!began) return null;
  const { ranged } = armsOf(arms);
  if (now.kind === 'dodge') return 'roll';
  if (now.kind === 'draw' && ranged === BOW) return 'bow.draw';
  if (now.kind === 'reload') return reloadCue(ranged);
  return null;
}

/** A wound-up blow last seen this near its end, in ticks, had landed: snapshots come a few ticks apart. */
const LANDED_TICKS = 6;

/** A body's time in the air, as kept from frame to frame: the height it left the ground from, the highest it reached,
 *  and whether it rose. */
export interface Air {
  readonly from: number;
  readonly peak: number;
  readonly rose: boolean;
}

/** It jumped once it rose this far (metres) over where it left the ground; it lands loudly from this far above. */
const JUMP_RISE_M = 0.1;
const FALL_M = 0.6;

/** A jump as a body rises off the ground, and a landing back on it after a real fall; a step off a kerb, or a ledge
 *  caught, is neither. */
export function airCue(
  air: Air | null,
  mode: Mode,
  z: number,
): { readonly air: Air | null; readonly cue: string | null } {
  if (mode === 'air') {
    const was = air ?? { from: z, peak: z, rose: false };
    const rose = was.rose || z > was.from + JUMP_RISE_M;
    return { air: { from: was.from, peak: Math.max(was.peak, z), rose }, cue: rose && !was.rose ? 'jump' : null };
  }
  const fell = air !== null && mode === 'ground' && air.peak - z >= FALL_M;
  return { air: null, cue: fell ? 'land' : null };
}

/** A footstep falls each time a walker's metres walked pass a step's middle, its feet a step apart. */
export const STEP_M = 2.5;
export function stepsBetween(before: number, after: number, stepM = STEP_M): number {
  return Math.max(0, Math.floor(after / stepM - 0.5) - Math.floor(before / stepM - 0.5));
}

/** Feet within this height of a block's top stand on it. */
const ON_BLOCK_M = 0.15;

/** A footstep's ground: a wooden block's top, any other block's (the city's stone), water (land below the sea at 0 m),
 *  else earth and grass. */
export function stepCue(
  feet: Point,
  { blocks, wooden = [], groundAt }: StepGround,
): 'step.wood' | 'step.stone' | 'step.water' | 'step.ground' {
  const [x, y, z] = feet;
  const under = (block: Block) =>
    x >= block.minX && x <= block.maxX && y >= block.minY && y <= block.maxY && Math.abs(z - block.top) < ON_BLOCK_M;
  if (wooden.some(under)) return 'step.wood';
  if (blocks.some(under)) return 'step.stone';
  return (groundAt?.(x, y) ?? 0) < 0 ? 'step.water' : 'step.ground';
}

/** What the ground under a footstep is made of: the place's blocks, those of wood among them, and its land's height. */
export interface StepGround {
  readonly blocks: readonly Block[];
  readonly wooden?: readonly Block[];
  readonly groundAt?: (x: number, y: number) => number | null;
}

const STATUS_CUES: readonly (readonly [StatusName, string])[] = [
  ['expose', 'status.expose'],
  ['charge', 'status.charge'],
  ['haste', 'status.haste'],
  ['linked', 'status.linked'],
  ['veiled', 'status.veil'],
];

/** The statuses given since a fighter was last seen: each whose ticks rose from none. */
export function statusCues(
  before: Partial<Record<StatusName, number>>,
  now: Partial<Record<StatusName, number>>,
): string[] {
  return STATUS_CUES.flatMap(([name, cue]) => ((before[name] ?? 0) <= 0 && (now[name] ?? 0) > 0 ? [cue] : []));
}

const SPELL_CUES: Readonly<Record<number, readonly string[]>> = {
  [SPELLS.tempest]: ['spell.tempest', 'anima.storm'],
  [SPELLS.quicken]: ['spell.quicken'],
  [SPELLS.arcLash]: ['spell.arclash'],
  [SPELLS.sunwell]: ['spell.sunwell', 'anima.divine'],
  [SPELLS.mend]: ['spell.mend'],
  [SPELLS.dawnflare]: ['spell.dawnflare'],
  [SPELLS.duskraven]: ['spell.duskraven', 'spell.duskraven.fire', 'anima.shadow'],
  [SPELLS.duskDaggers]: ['spell.daggers'],
  [SPELLS.vanish]: ['spell.vanish'],
  [SPELLS.bolt]: ['spell.ravenbolt'],
};

/** A spell as it first appears: its own cue, the Duskraven's fire under its raven, and an Anima's release with it. */
export const spellCues = (kind: number): readonly string[] => SPELL_CUES[kind] ?? [];

/** Whether a spell kind is an Anima, whose cast gathers before it is released. */
export const isAnima = (kind: number): boolean =>
  kind === SPELLS.tempest || kind === SPELLS.sunwell || kind === SPELLS.duskraven;

/** A Tempest orb gone before its time had struck what it sought, and bursts. */
export const orbBurst = (kind: number, age: number, life: number): boolean => kind === SPELLS.tempest && age < life - 2;
