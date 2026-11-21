// The band a keeper speaks in on their screen, under their words: their name over a line typed and voiced as Speech
// types and voices every line (speech/typing.ts, speech/voice.ts). The line outlives the frames drawn under it: each
// frame's band shows it where it stands, until the screen closes (`hush`). A screen reader hears it once, whole.
import { Typing } from '../../speech/typing.ts';
import { speakSyllable } from '../../speech/voice.ts';
import { announce } from '../../ui/announce.ts';
import type { Node } from '../../ui/node.ts';
import { INK } from '../gearNodes.ts';
import { worldOutput } from '../uiSounds.ts';
import { KEEPERS, type KeeperKind } from '../keepers.ts';
import { KEEPER_LINES, LineTurns, type Moment, nameOf, voiceOf } from './npcLines.ts';

const turns = new LineTurns(KEEPER_LINES);

/** The line being said: by whom, its typing, and whether it has been heard whole. */
let said: { readonly speaker: string; readonly typing: Typing; heard: boolean } | null = null;
let looping = false;
let last = 0;

function frame(now: number): void {
  const line = said;
  if (!line) return void (looping = false);
  const seconds = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  const voice = voiceOf(line.speaker);
  if (line.typing.step(seconds) && voice) {
    const sound = worldOutput();
    if (sound) speakSyllable(sound.audio, sound.out, voice);
  }
  if (line.typing.done && !line.heard) {
    line.heard = true;
    announce(line.typing.text);
  }
  if (line.typing.done) looping = false;
  else requestAnimationFrame(frame);
}

/** The keeper of `kind` says their next line for the moment, if they have one. */
export function keeperSays(kind: KeeperKind, moment: Moment): void {
  const { speaker } = KEEPERS[kind];
  const line = turns.next(speaker, moment);
  if (!line) return;
  said = { speaker, typing: new Typing(line.say, voiceOf(speaker)?.syllableS ?? 0.1), heard: false };
  last = performance.now();
  if (looping) return;
  looping = true;
  requestAnimationFrame(frame);
}

/** Stops the line, as the screen closes. */
export function hush(): void {
  said = null;
}

/** The band this frame: the keeper's name in `glow` over the line being said, its untyped rest keeping its room, or
 *  an empty band while none is. */
export function speechBand(kind: KeeperKind, glow: string, size: number, width: number): Node {
  const { speaker } = KEEPERS[kind];
  if (said?.speaker !== speaker) said = null;
  return {
    role: 'well',
    width,
    minHeight: 44,
    padding: [4, 11],
    direction: 'column',
    gap: 4,
    children: [
      { text: { words: nameOf(speaker), size, colour: glow, tracking: 2, wrap: false } },
      said && {
        width: 'grow',
        text: {
          words: [
            { words: said.typing.visible, colour: INK.word },
            { words: said.typing.hidden, colour: 'rgba(0,0,0,0)' },
          ],
          size,
        },
      },
    ],
  };
}
