// A server's uploaded pictures on the panel: each shown small with its size, a button to copy its address for any
// picture link, and, for managers, uploading another and removing one. The bot keeps them and decides who may.
import { answerWords, button, element } from './dom.ts';
import type { PanelApi } from './panelApi.ts';

interface Upload {
  readonly id: string;
  readonly url: string;
  readonly bytes: number;
  readonly at: number;
}
interface Uploads {
  readonly files: readonly Upload[];
  readonly filesMax: number;
  readonly bytesMax: number;
}

/** Bytes as people read them. */
export const sizeWords = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** The pictures section: it loads itself, and loads again after each change. */
export function picturesSection(api: PanelApi, guildId: string, canEdit: boolean): HTMLElement {
  const status = element('p', { class: 'status', role: 'status' });
  const usage = element('p', { class: 'small' });
  const grid = element('div', { class: 'pictures' });
  const say = (words: string): void => {
    status.textContent = words;
  };
  const small = (label: string, act: () => void): HTMLButtonElement => button(label, act, 'button button-small');
  const copyLink = (url: string): void => {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip) return say(url);
    clip.writeText(url).then(
      () => say('Copied. Paste it into any picture link.'),
      () => say(url),
    );
  };

  async function load(): Promise<void> {
    const answer = await api.call<Uploads>('GET', `/v1/panel/g/${guildId}/media`);
    if (!answer.ok) return say(answerWords(answer));
    const files = answer.body.files ?? [];
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    usage.textContent = `${files.length} of ${answer.body.filesMax} pictures, ${sizeWords(total)} of ${sizeWords(answer.body.bytesMax)}.`;
    const remove = (file: Upload): HTMLButtonElement =>
      small('Remove', async () => {
        const done = await api.call('DELETE', `/v1/panel/g/${guildId}/media/${file.id}`);
        say(answerWords(done));
        await load();
      });
    const shown = files.map((file) =>
      element('figure', { class: 'picture' }, [
        element('img', { src: file.url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
        element('figcaption', { class: 'small' }, [
          `${sizeWords(file.bytes)}, ${new Date(file.at * 1000).toLocaleDateString()}`,
        ]),
        element('div', { class: 'acts' }, [
          small('Copy link', () => copyLink(file.url)),
          ...(canEdit ? [remove(file)] : []),
        ]),
      ]),
    );
    grid.replaceChildren(...(shown.length ? shown : [element('p', {}, ['No pictures yet.'])]));
  }

  const parts: HTMLElement[] = [usage];
  if (canEdit) {
    const accept = 'image/png,image/jpeg,image/gif,image/webp';
    const picker = element('input', { id: 'picture-file', type: 'file', accept, class: 'visually-hidden' });
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (!file) return;
      say('Uploading...');
      const done = await api.call('POST', `/v1/panel/g/${guildId}/media`, file);
      say(answerWords(done));
      await load();
    });
    parts.push(
      element('p', { class: 'small' }, ['PNG, JPEG, GIF or WebP, up to 8 MB. Anyone with a link can see the picture.']),
      element('div', { class: 'acts' }, [small('Upload a picture', () => picker.click()), picker]),
    );
  }
  void load();
  return element('div', {}, [...parts, status, grid]);
}
