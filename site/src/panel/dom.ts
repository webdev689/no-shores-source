// The panel's one way to make an element: a tag, its attributes and its children, every child set as a node or as
// text, never as markup, so nothing Discord or the bot sends can become part of the page.

export function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  attributes: Readonly<Record<string, string>> = {},
  children: ReadonlyArray<Node | string> = [],
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  for (const child of children) node.append(child);
  return node;
}

/** A small button that does one thing when pressed. */
export function button(label: string, act: () => void, className = 'button'): HTMLButtonElement {
  const node = element('button', { type: 'button', class: className }, [label]);
  node.addEventListener('click', act);
  return node;
}

/** One of the panel's framed windows: a heading and what it holds. */
export const windowOf = (title: string, children: ReadonlyArray<Node | string>): HTMLElement =>
  element('section', { class: 'card panel-window' }, [element('h2', {}, [title]), ...children]);
export const para = (text: string): HTMLElement => element('p', {}, [text]);
export const linkButton = (label: string, href: string, className = 'button'): HTMLAnchorElement =>
  element('a', { class: className, href }, [label]);
/** A time the bot gives in seconds, as the reader's clock shows it. */
export const when = (seconds: number): string => (seconds ? new Date(seconds * 1000).toLocaleString() : 'never');

/** What a refusal from the bot says, or the bare status when it says nothing. */
export const answerWords = (answer: { status: number; body: { message?: unknown } | null }): string =>
  typeof answer.body?.message === 'string' ? answer.body.message : `The bot answered ${answer.status}.`;
