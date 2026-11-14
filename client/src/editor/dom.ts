/** An element of the panel with its text and class. */
export function make<K extends keyof HTMLElementTagNameMap>(
  name: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(name);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** A button that does `onClick`. */
export function button(text: string, onClick: () => void): HTMLButtonElement {
  const node = make('button', text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** Hands the viewer a JSON file to save. */
export function downloadJson(text: string, fileName: string): void {
  const link = make('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}
