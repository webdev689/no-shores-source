// What a keeper says on their screen: a greeting as it opens, their thanks once a ware is bought, and a line for a
// player short of the price, each a scene of content/story/keepers.json named for its speaker and moment
// ("mageHello1", "tailorThanks2"), checked against the cast as every scene is, and said in turn.
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import keepers from '../../../../content/story/keepers.json' with { type: 'json' };
import { type Line, castOf, scenesOf } from '../../speech/cast.ts';
import type { VoiceProfile } from '../../speech/voice.ts';

/** When a keeper speaks: as their screen opens, after a ware bought, and after a refusal for want of the price. */
export type Moment = 'Hello' | 'Thanks' | 'Short';

const CAST = castOf(cast);
/** The keepers' scenes, checked against the cast. */
export const KEEPER_LINES: Readonly<Record<string, readonly Line[]>> = scenesOf(keepers, CAST);

/** A speaker's voice, or none for one not in the cast. */
export function voiceOf(speaker: string): VoiceProfile | null {
  const voice = CAST.speakers[speaker]?.voice;
  return voice ? (CAST.voices[voice] ?? null) : null;
}

/** The name a speaker's words are shown under, as the dialogue box shows it. */
export const nameOf = (speaker: string): string => CAST.speakers[speaker]?.name ?? '';

/** The answer the room gives an ask the player could not pay for. */
const SHORT_ANSWER = 15;

/** The asks a screen waits on: how many asks the room had answered at the first, and how many were made. */
export interface Asked {
  readonly from: number;
  readonly asked: number;
}

/** The keeper's moment once the room has answered every ask made (thanks for one done, the short line for a price
 *  not met, null for another refusal); undefined while it has not. A hold ends unseen by a page, which is not built
 *  again while it is held, so the answers are counted from the first ask and the keeper speaks to the last. */
export function answeredWith(waiting: Asked, answered: number, answer: number): Moment | null | undefined {
  if (answered - waiting.from < waiting.asked) return undefined;
  return answer === 0 ? 'Thanks' : answer === SHORT_ANSWER ? 'Short' : null;
}

/** Each speaker's lines for each moment, said in turn from the first. */
export class LineTurns {
  private readonly said = new Map<string, number>();
  private readonly scenes: Readonly<Record<string, readonly Line[]>>;

  constructor(scenes: Readonly<Record<string, readonly Line[]>>) {
    this.scenes = scenes;
  }

  /** The speaker's next line for the moment, or null when they have none. */
  next(speaker: string, moment: Moment): Line | null {
    const name = new RegExp(`^${speaker}${moment}\\d*$`);
    const lines = Object.keys(this.scenes)
      .filter((scene) => name.test(scene))
      .sort((one, other) => one.localeCompare(other, 'en', { numeric: true }))
      .map((scene) => this.scenes[scene]?.[0])
      .filter((line): line is Line => line !== undefined);
    if (lines.length === 0) return null;
    const key = `${speaker}${moment}`;
    const turn = this.said.get(key) ?? 0;
    this.said.set(key, turn + 1);
    return lines[turn % lines.length] ?? null;
  }
}
