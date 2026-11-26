// What a keeper says on their screen, as Destiny's vendors speak on theirs: their name over a line typed and voiced as
// Speech types and voices every line (speech/typing.ts, speech/voice.ts). A line is their greeting, thanks or word for
// a price not met (`keeperSays`), or a line of a scene the roads hand the screen (`sayInScreen`): a scene the keeper
// says alone while their screen is open is said here, a line at a time, each held a while once typed. The line outlives
// the frames drawn under it: each frame's band shows it where it stands, until the screen closes (`hush`). A screen
// reader hears each line once, whole.
import type { Line } from '../../speech/cast.ts';
import { Typing } from '../../speech/typing.ts';
import { speakSyllable } from '../../speech/voice.ts';
import { announce } from '../../ui/announce.ts';
import type { Node } from '../../ui/node.ts';
import { INK } from '../gearNodes.ts';
import { worldOutput } from '../uiSounds.ts';
import { keeperOf } from '../keepers.ts';
import { KEEPER_LINES, LineTurns, type Moment, nameOf, voiceOf } from './npcLines.ts';

const turns = new LineTurns(KEEPER_LINES);
/** How long a scene's line stands once typed before the next, seconds: the dialogue box's in a cutscene. */
const HELD_S = 1.6;

/** The line being said: by whom, its typing, whether it has been heard whole, and how long it has stood since. */
let said: { readonly speaker: string; readonly typing: Typing; heard: boolean; stood: number } | null = null;
/** The scene being said here: its lines still to come, and what to tell once it ends. */
let scene: { readonly lines: Line[]; readonly done: () => void } | null = null;
/** The speaker of the screen open, none while none is. */
let open: string | null = null;
let looping = false;
let last = 0;

/** Begins `line` by `speaker`. */
function begin(speaker: string, words: string): void {
  said = { speaker, typing: new Typing(words, voiceOf(speaker)?.syllableS ?? 0.1), heard: false, stood: 0 };
  last = performance.now();
  if (looping) return;
  looping = true;
  requestAnimationFrame(frame);
}

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
  if (line.typing.done) line.stood += seconds;
  // A scene's next line once this one has stood its while; the scene told done after its last.
  if (scene && line.typing.done && line.stood >= HELD_S) {
    const next = scene.lines.shift();
    if (next) return void (begin(next.who, next.say), requestAnimationFrame(frame));
    const ended = scene;
    scene = null;
    ended.done();
  }
  if (line.typing.done && !scene) looping = false;
  else requestAnimationFrame(frame);
}

/** The screen of the keeper of station `kind` opens: their lines are said in it until it closes. */
export function screenOpened(kind: string): void {
  open = keeperOf(kind)?.speaker ?? null;
}

/** The keeper of `kind` says their next line for the moment, if they have one; never over a scene being said. */
export function keeperSays(kind: string, moment: Moment): void {
  const speaker = keeperOf(kind)?.speaker;
  const line = speaker && !scene ? turns.next(speaker, moment) : null;
  if (speaker && line) begin(speaker, line.say);
}

/** Says a scene in the open screen's band, when its keeper says every line of it: done once its last line has stood.
 *  Null where the screen cannot hold it (none open, another speaker, a scene being said), so the dialogue box says it
 *  once the screen closes. */
export function sayInScreen(lines: readonly Line[]): Promise<void> | null {
  const [first, ...rest] = lines;
  if (!first || open === null || scene || !lines.every((line) => line.who === open)) return null;
  return new Promise((done) => {
    scene = { lines: rest, done };
    begin(first.who, first.say);
  });
}

/** Stops the line, as the screen closes: a scene being said ends there. */
export function hush(): void {
  said = null;
  open = null;
  const ended = scene;
  scene = null;
  ended?.done();
}

/** The band this frame, `width` wide: the keeper's name in `glow` over the line being said, its untyped rest keeping
 *  its room, or the band's room alone while none is, so nothing under it moves as a line begins. */
export function speechBand(kind: string, glow: string, size: number, width: number): Node {
  const speaker = keeperOf(kind)?.speaker;
  if (said && said.speaker !== speaker) said = null;
  return {
    width,
    minHeight: size > 1 ? 66 : 40,
    direction: 'column',
    gap: 4,
    children: !said
      ? []
      : [
          { text: { words: nameOf(said.speaker).toUpperCase(), size, colour: glow, tracking: 2, wrap: false } },
          {
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
