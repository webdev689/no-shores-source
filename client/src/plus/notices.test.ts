import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NoticeStack } from './notices.ts';

/** The least of a page the stack touches: elements that keep their children in order. */
class Node {
  className = '';
  textContent = '';
  id = '';
  hidden = false;
  parent: Node | null = null;
  readonly children: Node[] = [];
  readonly ownerDocument: Page;
  constructor(page: Page) {
    this.ownerDocument = page;
  }
  setAttribute(): void {}
  append(...nodes: Node[]): void {
    for (const node of nodes) {
      node.remove();
      node.parent = this;
      this.children.push(node);
    }
  }
  remove(): void {
    const siblings = this.parent?.children;
    if (siblings) siblings.splice(siblings.indexOf(this), 1);
    this.parent = null;
  }
}
class Page {
  readonly head = new Node(this);
  createElement(): Node {
    return new Node(this);
  }
  getElementById(): null {
    return null;
  }
}

const words = (stack: NoticeStack) => (stack.root as unknown as Node).children.map((row) => row.textContent);

test('the notices stand newest last, three at most, and one said again moves to the foot', () => {
  const page = new Page();
  const stack = new NoticeStack(page.createElement() as unknown as HTMLElement);
  stack.show(['No guns bear there.', 'The Pirate Brig surrenders!']);
  assert.deepEqual(words(stack), ['No guns bear there.', 'The Pirate Brig surrenders!']);
  stack.show(['The Pirate Brig surrenders!', 'No guns bear there.']);
  assert.deepEqual(words(stack), ['The Pirate Brig surrenders!', 'No guns bear there.'], 'said again, it is newest');
  stack.show(['a', 'b', 'c', 'd']);
  assert.deepEqual(words(stack), ['b', 'c', 'd']);
  stack.show([]);
  assert.equal(stack.root.hidden, true, 'none hides the stack');
});
