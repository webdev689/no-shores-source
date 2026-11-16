// The materials every thing may ask for, and the dimmed turns of its own.
import { materials, type Materials } from '../materials.ts';

/** The materials every thing may ask for. */
const NAMES = [
  'black',
  'mortar',
  'iron',
  'rust',
  'glassDark',
  'glassBlue',
  'gold',
  'bronze',
  'stone',
  'stoneDark',
  'wood',
  'woodDark',
  'woodPale',
  'snow',
  'fire',
  'clothRed',
  'clothBlue',
  'clothGreen',
  'clothYellow',
  'parchment',
  'leafDark',
  'leaf',
];
export function kitMats(...more: string[]): Materials {
  const list = [...new Set([...NAMES, ...more])];
  return materials([...list, ...more.map((name) => `${name}:dim`)]);
}
