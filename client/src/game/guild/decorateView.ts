// The Outposts page's Decorate part, for a founder or admin standing at the outpost: every piece of decoration with
// its price and how many the hall holds. Choosing one closes the menu and stands its ghost a metre past its own reach
// before the player in the world (`decorPlacing.ts`), placed with the use key, turned with its keys, let go with Escape.

import type { OutpostFace } from '../../network/accounts.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, label, pressNode, words } from '../gearNodes.ts';
import { openGearWindow } from '../gearScreen.ts';
import { hintNode } from '../menuPages.ts';
import { counted } from './guildHome.ts';
import { startPlacing } from './decorPlacing.ts';
import { PIECES, decorCap, decorPrice, hallTier } from './outpostLaw.ts';

/** A piece's press. */
export const decorId = (piece: string) => `outpost-decor-${piece}`;

/** The Decorate part of an outpost. */
export function decorateNode(ui: Interface, outpost: OutpostFace): Node {
  const cap = decorCap(hallTier(outpost.plot));
  const full = outpost.plot.decor.length >= cap;
  for (const piece of PIECES) {
    if (full || !ui.clicked(decorId(piece.piece))) continue;
    startPlacing(outpost.site, piece.piece);
    openGearWindow({ view: 'guild', toggle: true });
  }
  return {
    width: 'grow',
    direction: 'column',
    gap: 8,
    children: [
      label('Decorate'),
      words(`${outpost.plot.decor.length} of ${cap} pieces the hall holds`, 1, INK.faint),
      {
        gap: 6,
        wrap: true,
        children: PIECES.map((piece) =>
          pressNode(
            decorId(piece.piece),
            `${piece.name} · ${counted(decorPrice(piece.piece))} Aurem`,
            'button',
            '',
            1,
            {
              disabled: full,
            },
          ),
        ),
      },
      hintNode(full ? 'Raise the hall to hold more decoration.' : 'Choose a piece, then stand it just before you.'),
    ],
  };
}
