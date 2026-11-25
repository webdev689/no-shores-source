// Every picture a page may name, drawn once per build and written as PNG, with a short mark of its bytes that a page
// puts on the address so a browser fetches it again only when it changed.
import { createHash } from 'node:crypto';
import { iconSheet, logoSheet } from './logo.ts';
import { SCENES } from './scenes.ts';
import { pngOf, type Sheet } from './sheet.ts';

/** The folder of the built site that holds the pictures (`/art/overlook.png`). */
export const ART_DIR = 'art';

export const PICTURES: Readonly<Record<string, () => Sheet>> = { ...SCENES, logo: logoSheet, icon: iconSheet };

export interface Picture {
  readonly png: Buffer;
  readonly width: number;
  readonly height: number;
  readonly mark: string;
}

const drawn = new Map<string, Picture>();

/** A picture by its name, or null when no picture has that name. */
export function pictureOf(name: string): Picture | null {
  const draw = PICTURES[name];
  if (!draw) return null;
  let picture = drawn.get(name);
  if (!picture) {
    const sheet = draw();
    const png = pngOf(sheet);
    const mark = createHash('sha256').update(png).digest('hex').slice(0, 8);
    picture = { png, width: sheet.width, height: sheet.height, mark };
    drawn.set(name, picture);
  }
  return picture;
}

/** Where a page finds a picture: its address with its mark. */
export const pictureAddress = (name: string, picture: Picture): string => `/${ART_DIR}/${name}.png?v=${picture.mark}`;
