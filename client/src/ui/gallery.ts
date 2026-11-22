// Every kind of node the interface draws, in one tree, for checking the renderer headless (`tools/uiShot.mjs`) and as
// a worked example for building screens: a window with a header, presses in each state, words in a span's colour and
// at each size, a field, a scrolled list, pictures from SVG, pixels and 2D drawing, a turned arrow and a float.
import { keysFor, screenKeysNode } from './screenKeys.ts';
import { TONES } from '../plus/tones.ts';
import type { Node } from './node.ts';
import type { Interface } from './ui.ts';

const ARROW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M5 0 10 10 5 7 0 10Z" fill="#f3cf6a"/></svg>`;

/** A 4 by 4 picture of pixels, checkered brass and stone. */
const checks = () => {
  const pixels = new Uint8Array(4 * 4 * 4);
  for (let index = 0; index < 16; index++) {
    const lit = (index + Math.floor(index / 4)) % 2 === 0;
    pixels.set(lit ? [243, 207, 106, 255] : [60, 58, 52, 255], index * 4);
  }
  return pixels;
};

export function gallery(ui: Interface): Node {
  const press = (id: string, words: string, role: 'button' | 'primary' | 'warn', disabled = false): Node => ({
    id,
    press: true,
    disabled,
    role,
    padding: [4, 10],
    label: words,
    children: [{ text: { words } }],
  });
  const rows = Array.from({ length: 12 }, (_unused, index): Node => ({
    id: `row${index}`,
    press: true,
    role: 'tile',
    width: 'grow',
    padding: [3, 6],
    children: [{ text: { words: `Row ${index + 1}` } }],
  }));
  return {
    width: 'grow',
    height: 'grow',
    padding: 16,
    gap: 16,
    children: [
      {
        role: 'window',
        direction: 'column',
        padding: 12,
        gap: 8,
        width: 300,
        children: [
          { role: 'panel', padding: [4, 8], width: 'grow', children: [{ text: { words: 'The Interface', size: 2 } }] },
          {
            text: {
              words: [
                { words: 'Words wrap to their room, and a span keeps ' },
                { words: 'its own colour', colour: TONES.brassHi },
                { words: ' across the break.' },
              ],
            },
          },
          {
            gap: 6,
            wrap: true,
            children: [
              press('rest', 'Rest', 'button'),
              press('primary', 'Primary', 'primary'),
              press('warn', 'Warn', 'warn'),
              press('off', 'Off', 'button', true),
            ],
          },
          { role: 'chip', padding: [2, 6], children: [{ text: { words: 'A chip' } }] },
          {
            id: 'name',
            role: 'well',
            width: 'grow',
            height: 22,
            padding: [0, 6],
            field: { placeholder: 'Your name' },
          },
          { text: { words: `Typed: ${ui.fieldText('name')}`, colour: TONES.wordDim } },
        ],
      },
      {
        direction: 'column',
        gap: 8,
        children: [
          { text: { words: 'Halo over the world', size: 2, edge: 'halo' } },
          { text: { words: 'A hard shadow', edge: 'shadow' } },
          {
            gap: 8,
            alignY: 'center',
            children: [
              { width: 24, height: 24, picture: { key: 'arrow', source: { svg: ARROW } } },
              { width: 24, height: 24, picture: { key: 'arrow', source: { svg: ARROW }, turn: 90 } },
              {
                width: 32,
                height: 32,
                picture: { key: 'checks', source: { pixels: checks }, pixel: { width: 4, height: 4 } },
              },
              {
                width: 24,
                height: 24,
                picture: {
                  key: 'ring',
                  source: {
                    draw: (context, width, height) => {
                      context.strokeStyle = TONES.brassHi;
                      context.lineWidth = 3;
                      context.beginPath();
                      context.arc(width / 2, height / 2, width / 2 - 2, 0, Math.PI * 2);
                      context.stroke();
                    },
                  },
                },
              },
            ],
          },
          {
            id: 'list',
            role: 'well',
            direction: 'column',
            scroll: true,
            width: 160,
            height: 120,
            padding: 4,
            gap: 2,
            children: rows,
          },
        ],
      },
      {
        role: 'panel',
        padding: 6,
        float: { to: 'screen', at: [1, 1], anchor: [1, 1], x: -12, y: -12 },
        children: [{ text: { words: 'A float on the screen' } }],
      },
    ],
  };
}

/** The keys the game draws, open on a field over the gallery, Shift on and the pad's cross on G. */
export function screenKeysShot(ui: Interface): Node {
  const field: Node = { id: 'typed', field: { placeholder: 'Username' }, width: 240, height: 22, role: 'well' };
  const keys = { ...keysFor('typed'), shift: true, row: 2, column: 4 };
  return { children: [gallery(ui), screenKeysNode(keys, { x: 0, y: 0, ...ui.size }, null, true), field] };
}

/** The face's punctuation at each size, for checking what it reads of each. */
export function punctuationShot(): Node {
  const words = '@ = ~ # & ! ? _ - + * / \\ | < > ( ) [ ] { } % $ ^ ; : , . \' " `';
  return {
    direction: 'column',
    padding: 10,
    gap: 6,
    fill: '#1c1f26',
    children: [1, 2, 3].map((size) => ({ text: { words, size, colour: '#fbf8f0', wrap: false } })),
  };
}
