// What only the page can do for the interface the game draws: hand the player a file to save, open one they choose,
// and ask them a yes or no in the browser's own dialog. Nothing here builds interface; each borrows the browser's
// own file chooser, download or dialog for a moment.

/** Hands the player `text` as a file named `name` to save. */
export function saveFile(text: string, name: string, type = 'application/json'): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Opens the browser's file chooser for files of `accept` (as an input's `accept` writes it); answers the chosen
 *  file's text, or null when none was chosen. */
export function openFile(accept: string): Promise<string | null> {
  const chooser = document.createElement('input');
  chooser.type = 'file';
  chooser.accept = accept;
  return new Promise((resolve) => {
    chooser.addEventListener('change', () => {
      const file = chooser.files?.[0];
      resolve(file ? file.text() : null);
    });
    chooser.addEventListener('cancel', () => resolve(null));
    chooser.click();
  });
}

/** Asks the player `question` in the browser's dialog: whether they said yes. */
export function ask(question: string): boolean {
  return window.confirm(question);
}
