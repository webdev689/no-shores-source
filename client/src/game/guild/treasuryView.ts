// The Guild tab's Treasury page: what the guild holds, the ledger's latest lines (who moved what, and the balance after),
// and, for a member standing at one of the guild's outposts, a field to put their own Aurem in. The treasury is spent
// only on outposts and never paid out to a player (`server/accounts/treasury.ts`).

import type { LedgerLine, OutpostsFace } from '../../network/accounts.ts';
import { ASKS, type GearAsk } from '../../network/gearMessages.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, label, pressNode, words } from '../gearNodes.ts';
import { headingNode, hintNode } from '../menuPages.ts';
import { counted } from './guildHome.ts';
import { TREASURY_MOST, kindOf, pieceOf } from './outpostLaw.ts';

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

/** What a ledger line's kind says: `build counting` is "Built the Counting House". */
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
      return thing === '' ? 'Raised an outpost' : `Raised the ${named} a tier`;
    case 'build':
      return `Built the ${named}`;
    case 'take':
      return `Took down the ${named}`;
    case 'decorate':
      return `Set a ${named}`;
    default:
      return kind;
  }
}

/** One line of the ledger. */
function lineNode(line: LedgerLine, now: number): Node {
  const gain = line.amount >= 0;
  return {
    width: 'grow',
    gap: 14,
    alignY: 'center',
    children: [
      { width: 110, children: [words(agoWords(now, line.at), 1, INK.faint)] },
      { width: 'grow', children: [words(`${line.name ?? 'The outpost'}: ${ledgerWords(line.kind)}`, 1, INK.word)] },
      words(`${gain ? '+' : '−'}${counted(Math.abs(line.amount))}`, 1, gain ? INK.gain : INK.loss),
      { width: 110, alignX: 'end', children: [words(counted(line.balance), 1, INK.faint)] },
    ],
  };
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
  const fits = Number.isInteger(amount) && amount > 0 && outposts.treasury + amount <= TREASURY_MOST;
  if (outposts.at !== null && fits && (ui.clicked(DEPOSIT_ID) || ui.submitted(DEPOSIT_FIELD))) {
    room({ kind: ASKS.outpostDeposit, count: amount });
    ui.setFieldText(DEPOSIT_FIELD, '');
  }
  const lines: Child[] = outposts.ledger.map((line) => lineNode(line, now));
  return {
    width: 'grow',
    direction: 'column',
    gap: 12,
    padding: [6, 4, 0, 4],
    maxWidth: 900,
    children: [
      headingNode('Treasury', words(`At most ${counted(TREASURY_MOST)} Aurem`, size, INK.faint), size),
      words(`${counted(outposts.treasury)} Aurem`, size + 1, INK.brassLit),
      words(
        "Members put Aurem in at the guild's outposts, and their strongboxes empty into it. It is spent only on outposts.",
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
            ],
          },
      label('Ledger', size),
      ...(lines.length > 0 ? lines : [hintNode('Nothing has moved yet.')]),
    ],
  };
}
