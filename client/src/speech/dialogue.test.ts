import assert from 'node:assert/strict';
import { test } from 'node:test';
import cast from '../../../content/story/cast.json' with { type: 'json' };
import { castOf } from './cast.ts';
import { DialogueBox } from './dialogue.ts';

/** A stand-in element with only what the box reads and writes: children, classes, attributes, text. */
class Fake {
  readonly children: Fake[] = [];
  parent: Fake | null = null;
  readonly attributes = new Map<string, string>();
  className = '';
  id = '';
  hidden = false;
  data = '';
  private text = '';
  readonly ownerDocument: unknown;
  constructor(page: unknown) {
    this.ownerDocument = page;
  }
  get textContent(): string {
    return this.text + this.data + this.children.map((child) => child.textContent).join('');
  }
  set textContent(text: string) {
    this.children.length = 0;
    this.text = text;
  }
  get isConnected(): boolean {
    return this.parent !== null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  append(...more: Fake[]): void {
    for (const child of more) [child.parent, this.children[this.children.length]] = [this, child];
  }
  prepend(...more: Fake[]): void {
    for (const child of more) child.parent = this;
    this.children.unshift(...more);
  }
  remove(): void {
    const siblings = this.parent?.children ?? [];
    siblings.splice(siblings.indexOf(this), 1);
    this.parent = null;
  }
  all(): Fake[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }
}

function fakeRoot(): Fake {
  const page = {
    head: null as Fake | null,
    createElement: () => new Fake(page),
    createTextNode: (data: string) => Object.assign(new Fake(page), { data }),
    getElementById: () => null,
  };
  page.head = new Fake(page);
  const root = new Fake(page);
  root.parent = new Fake(page);
  return root;
}

test('a screen reader hears each line from a polite copy, whole and under its speaker’s name, never as it types', () => {
  const root = fakeRoot();
  const box = new DialogueBox(root as unknown as HTMLElement, () => null);
  const read = castOf(cast);
  void box.play([{ who: 'maren', say: 'There you are.' }], read, { auto: false });
  const heard = root.all().find((node) => node.getAttribute('aria-live') === 'polite');
  assert.ok(heard, 'a live copy');
  assert.equal(heard.hidden, false, 'never hidden, as the box is between lines');
  box.frame(0.05);
  assert.equal(heard.textContent, '', 'nothing while it types');
  for (let step = 0; step < 200; step++) box.frame(0.05);
  assert.equal(heard.textContent, `${read.speakers.maren?.name}: There you are.`);
  const typed = root.all().filter((node) => node.className.startsWith('speech-words'));
  assert.ok(
    typed.every((node) => node.getAttribute('aria-hidden') === 'true'),
    'the typing is not read',
  );
  box.remove();
  assert.equal(heard.isConnected, false);
});
