// The band a keeper speaks in on their screen, under their words: their name over a line typed and voiced as Speech
// types and voices every line (speech/typing.ts, speech/voice.ts). The line outlives the page drawn under it, which
// the menu builds anew as the gear changes, so each build's band takes up the line where it stands.
import { make } from '../../editor/dom.ts';
import { ROLES } from '../../plus/kit.ts';
import { Typing } from '../../speech/typing.ts';
import { speakSyllable } from '../../speech/voice.ts';
import { worldOutput } from '../uiSounds.ts';
import { KEEPERS, type KeeperKind } from '../keepers.ts';
import { KEEPER_LINES, LineTurns, type Moment, nameOf, voiceOf } from './npcLines.ts';

const turns = new LineTurns(KEEPER_LINES);

/** The line being said: by whom, its typing, and the band's words that show it on the page built last. */
let said: { readonly speaker: string; readonly typing: Typing } | null = null;
let shown: { readonly typed: Text; readonly unseen: HTMLElement } | null = null;
let looping = false;
let last = 0;

function frame(now: number): void {
  // Once the screen has closed, its keeper falls silent.
  if (said && !shown?.typed.isConnected) said = null;
  const line = said;
  if (!line) return void (looping = false);
  const seconds = Math.min(0.1, (now - last) / 1000);
  last = now;
  const voice = voiceOf(line.speaker);
  if (line.typing.step(seconds) && voice) {
    const sound = worldOutput();
    if (sound) speakSyllable(sound.audio, sound.out, voice);
  }
  show();
  if (line.typing.done) looping = false;
  else requestAnimationFrame(frame);
}

function show(): void {
  if (!said || !shown) return;
  shown.typed.data = said.typing.visible;
  shown.unseen.textContent = said.typing.hidden;
}

/** The keeper of `kind` says their next line for the moment, if they have one. */
export function keeperSays(kind: KeeperKind, moment: Moment): void {
  const { speaker } = KEEPERS[kind];
  const line = turns.next(speaker, moment);
  if (!line) return;
  said = { speaker, typing: new Typing(line.say, voiceOf(speaker)?.syllableS ?? 0.1) };
  show();
  if (looping) return;
  looping = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

/** Stops the line, as the screen closes. */
export function hush(): void {
  said = null;
}

/** The band for a page built now: the keeper's name over the line being said, or an empty band while none is. */
export function speechBand(kind: KeeperKind): HTMLElement {
  const band = make('div', '', `npc-speech ${ROLES.well}`);
  const name = make('div', nameOf(KEEPERS[kind].speaker), 'npc-speech-name');
  const words = make('p', '', 'npc-speech-words');
  const typed = document.createTextNode('');
  const unseen = make('span', '', 'speech-unseen');
  words.append(typed, unseen);
  // Read aloud once whole, not letter by letter as it types.
  words.setAttribute('aria-live', 'off');
  band.append(name, words);
  shown = { typed, unseen };
  if (said?.speaker !== KEEPERS[kind].speaker) said = null;
  show();
  return band;
}
