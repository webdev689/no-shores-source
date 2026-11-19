// The dialogue box, bottom centre in the Enhanced Plus kit: the speaker's name over their words, typed as they are
// heard. A speaker with no name is a voice from nowhere, its words alone in the middle of the screen. The pacing is
// the conversation's (conversation.ts); this file only shows it and sounds it.
import { ROLES } from '../plus/kit.ts';
import type { Cast, Line } from './cast.ts';
import { Conversation } from './conversation.ts';
import { wearSpeech } from './sheet.ts';
import { speakSyllable } from './voice.ts';

/** Where speech is heard: the game's world sound, or null while sound sleeps or is silenced, when words still show. */
export type VoiceOut = () => { readonly audio: AudioContext; readonly out: AudioNode } | null;

/** A paragraph of typed words over the rest of the line laid out unseen, so the typed words never reflow. */
export function wordsNode(page: Document, className: string): { node: HTMLElement; typed: Text; unseen: HTMLElement } {
  const node = page.createElement('p');
  node.className = className;
  const typed = page.createTextNode('');
  const unseen = page.createElement('span');
  unseen.className = 'speech-unseen';
  node.append(typed, unseen);
  return { node, typed, unseen };
}

export class DialogueBox {
  private readonly box: HTMLElement;
  private readonly name: HTMLElement;
  private readonly words: ReturnType<typeof wordsNode>;
  private readonly nowhere: ReturnType<typeof wordsNode>;
  private readonly voiceOut: VoiceOut;
  private talk: Conversation | null = null;
  private cast: Cast | null = null;
  private shownIndex = -1;
  private onLine: ((line: Line, index: number) => void) | undefined;
  private resolve: (() => void) | null = null;

  constructor(root: HTMLElement, voiceOut: VoiceOut) {
    const page = root.ownerDocument;
    wearSpeech(page);
    this.voiceOut = voiceOut;
    this.box = page.createElement('div');
    this.box.className = `speech-box ${ROLES.window}`;
    this.name = page.createElement('div');
    this.name.className = `speech-name ${ROLES.header}`;
    this.words = wordsNode(page, 'speech-words');
    this.box.append(this.name, this.words.node);
    this.nowhere = wordsNode(page, 'speech-nowhere');
    this.box.hidden = this.nowhere.node.hidden = true;
    root.append(this.box, this.nowhere.node);
  }

  get open(): boolean {
    return this.talk !== null;
  }

  /** Plays the lines in turn; resolves once the last has been read. `auto` advances by itself after each line has
   *  been typed and held (for cutscenes); otherwise `advance()` moves on. A speaker whose name is "" is a voice from
   *  nowhere: no box, the words alone, centred, faint. */
  play(
    lines: readonly Line[],
    cast: Cast,
    options: { auto?: boolean; onLine?: (line: Line, index: number) => void } = {},
  ): Promise<void> {
    this.skip();
    this.talk = new Conversation(lines, cast, options.auto ?? false);
    this.cast = cast;
    this.onLine = options.onLine;
    this.shownIndex = -1;
    const done = new Promise<void>((resolve) => (this.resolve = resolve));
    this.show();
    return done;
  }

  /** A press: finishes the typing, or moves to the next line. */
  advance(): void {
    this.talk?.advance();
    this.show();
  }

  /** Ends at once, the promise resolved. */
  skip(): void {
    this.talk = null;
    this.box.hidden = this.nowhere.node.hidden = true;
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.();
  }

  /** The typewriter and its voice. */
  frame(seconds: number): void {
    const talk = this.talk;
    if (!talk) return;
    if (talk.step(seconds) && talk.voice) {
      const sound = this.voiceOut();
      if (sound) speakSyllable(sound.audio, sound.out, talk.voice, { emphasis: talk.emphasis });
    }
    this.show();
  }

  /** Brings the page up to the conversation: a new line's speaker, the typed words, or the end. */
  private show(): void {
    const talk = this.talk;
    if (!talk || !this.cast) return;
    const line = talk.line;
    if (!line) {
      this.skip();
      return;
    }
    const name = this.cast.speakers[line.who].name;
    const words = name === '' ? this.nowhere : this.words;
    if (talk.index !== this.shownIndex) {
      this.shownIndex = talk.index;
      this.name.textContent = name;
      this.box.hidden = name === '';
      this.nowhere.node.hidden = name !== '';
      this.onLine?.(line, talk.index);
      // The caller may have played or skipped from inside onLine: the page is then theirs, not this line's.
      if (this.talk !== talk) return;
    }
    words.typed.data = talk.typing.visible;
    words.unseen.textContent = talk.typing.hidden;
  }
}
