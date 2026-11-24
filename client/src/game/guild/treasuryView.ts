// The Guild tab's Treasury page: what the guild holds, the ledger's latest lines (who moved what, and the balance after),
// and, for a member standing at one of the guild's outposts, a field to put their own Aurem in. The treasury is spent
// only on outposts and never paid out to a player (`server/accounts/treasury.ts`).

import type { LedgerLine, OutpostsFace } from '../../network/accounts.ts';
import { ASKS, type GearAsk } from '../../network/gearMessages.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, label, pressNode, words } from '../gearNodes.ts';
import { hintNode } from '../menuPages.ts';
import { counted } from './guildHome.ts';
import { TREASURY_MOST, kindOf, pieceOf } from './outpostLaw.ts';
import { headNode, partNode } from './outpostRows.ts';

export const DEPOSIT_FIELD = 'treasury-deposit';
export const DEPOSIT_ID = 'treasury-deposit-press';
const HOUR_MS = 3_600_000;

/** How long ago a time was, in the ledger's plain words. */
export function agoWords(now: number, then: number): string {
  const hours = Math.floor(Math.max(0, now - then) / HOUR_MS);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** What a ledger line's kind says, in the world's verbs: `begin counting` is "Began the Counting House" (its
 *  scaffold), `build counting` "Built the Counting House" (standing at once), `take down well` "Took up the Well" (a
 *  piece of decoration) and `decorate well` "Placed the Well". */
export function ledgerWords(kind: string): string {
  const [what = '', ...rest] = kind.split(' ');
  const thing = rest.join(' ').replace(/^down /, '');
  const named = kindOf(thing)?.name ?? pieceOf(thing)?.name ?? thing;
  switch (what) {
    case 'deposit':
      return 'Put Aurem in';
    case 'strongbox':
      return 'Emptied a strongbox';
    case 'abandon':
      return 'Abandoned an outpost';
    case 'raise':
      return thing === '' ? 'Raised an outpost' : `Began the ${named}'s next tier`;
    case 'begin':
      return `Began the ${named}`;
    case 'build':
      return `Built the ${named}`;
    case 'take':
      return kindOf(thing) ? `Took down the ${named}` : `Took up the ${named}`;
    case 'decorate':
      return `Placed the ${named}`;
    default:
      return kind;
  }
}

/** The ledger's columns: when, who and what, the amount moved and the balance after. */
function columnsNode(cells: readonly [Node, Node, Node, Node]): Node {
  const [when, what, amount, balance] = cells;
  return {
    width: 'grow',
    gap: 14,
    alignY: 'center',
    children: [
      { width: 110, children: [when] },
      { width: 'grow', children: [what] },
      { width: 90, alignX: 'end', children: [amount] },
      { width: 110, alignX: 'end', children: [balance] },
    ],
  };
}

/** One line of the ledger, its words at `size`. */
function lineNode(line: LedgerLine, now: number, size: number): Node {
  const gain = line.amount >= 0;
  return columnsNode([
    words(agoWords(now, line.at), size, INK.faint),
    words(`${line.name ?? 'The outpost'}: ${ledgerWords(line.kind)}`, size, INK.word, { ellipsis: true }),
    words(`${gain ? '+' : '−'}${counted(Math.abs(line.amount))}`, size, gain ? INK.gain : INK.loss),
    words(counted(line.balance), size, INK.faint),
  ]);
}

/** The page; `room` asks the room the player stands in, which takes the Aurem from them. */
export function treasuryNode(
  ui: Interface,
  outposts: OutpostsFace,
  now: number,
  size: number,
  room: (ask: GearAsk) => void,
): Node {
  const amount = Math.floor(Number(ui.fieldText(DEPOSIT_FIELD).replaceAll(',', '').trim()));
  const space = Math.max(0, TREASURY_MOST - outposts.treasury);
  const typed = Number.isInteger(amount) && amount > 0;
  const fits = typed && amount <= space;
  if (outposts.at !== null && fits && (ui.clicked(DEPOSIT_ID) || ui.submitted(DEPOSIT_FIELD))) {
    room({ kind: ASKS.outpostDeposit, count: amount });
    ui.setFieldText(DEPOSIT_FIELD, '');
  }
  const lines: Child[] = outposts.ledger.map((line) => lineNode(line, now, size));
  const over =
    typed && !fits
      ? `The treasury holds at most ${counted(TREASURY_MOST)} Aurem: put in ${counted(space)} or less.`
      : null;
  return {
    width: 'grow',
    direction: 'column',
    gap: 12,
    padding: [6, 4, 0, 4],
    maxWidth: 900,
    children: [
      headNode('Treasury', null, words(`At most ${counted(TREASURY_MOST)} Aurem`, 1, INK.faint)),
      partNode([
        words(`${counted(outposts.treasury)} Aurem`, size + 1, INK.brassLit),
        words(
          "Members put Aurem in at the guild's outposts, and the outposts' strongboxes empty into it. It is spent only on outposts.",
          1,
          INK.faint,
          { wrap: true },
        ),
        outposts.at === null
          ? hintNode("Put your own Aurem in at any of your guild's outposts.")
          : {
              width: 'grow',
              gap: 10,
              alignY: 'center',
              wrap: true,
              children: [
                {
                  id: DEPOSIT_FIELD,
                  role: 'well',
                  width: 200,
                  height: 26,
                  padding: [0, 8],
                  alignY: 'center',
                  label: 'Aurem to put in',
                  field: { most: 7, placeholder: 'Aurem' },
                },
                pressNode(DEPOSIT_ID, 'Put in', 'primary', '', 1, { disabled: !fits }),
                over !== null && words(over, 1, INK.loss, { wrap: true }),
              ],
            },
      ]),
      partNode([
        headNode('Ledger', outposts.ledger.length > 0 ? String(outposts.ledger.length) : null),
        lines.length > 0 && columnsNode([label('When'), label('Who and what'), label('Aurem'), label('Balance')]),
        ...(lines.length > 0 ? lines : [hintNode('Nothing has moved yet.')]),
      ]),
    ],
  };
}
