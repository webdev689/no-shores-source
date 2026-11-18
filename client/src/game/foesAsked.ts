import type { FoeAsk } from '../network/messages.ts';

/** The most a type's or a rank's number may be, as an input carries it in a byte. */
const BYTE_MOST = 255;

/** The foes a page playing alone asks its node's room for, from `?spawn=` in its address: types by their numbers, each
 *  with a rank after a colon (`?spawn=2,4:3,12`); a rank left out takes the type's first. A part that is not a type
 *  asks for nothing. */
export function foesAsked(search: string): FoeAsk[] {
  const given = new URLSearchParams(search).get('spawn');
  if (!given) return [];
  const byte = (value: number) => Number.isInteger(value) && value >= 0 && value <= BYTE_MOST;
  return given.split(',').flatMap((part) => {
    const [type = Number.NaN, rank = 0, ...rest] = part.split(':').map(Number);
    return rest.length === 0 && type > 0 && byte(type) && byte(rank) ? [{ type, rank }] : [];
  });
}
