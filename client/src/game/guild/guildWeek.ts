// The guild's week as its tab shows it, after Destiny 2's clan screen: the player's weekly contribution, a meter and
// a square filled once it reaches the week's most; and the week's four guild bounties as a checklist, each with the
// guild's count, done or not, and a press to claim one done that the player has not.

import type { GuildBountyShown, GuildFace } from '../../network/accounts.ts';
import { TONES } from '../../plus/tones.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, pressNode, words } from '../gearNodes.ts';
import { CONTRIBUTION } from './guildLaw.ts';
import { checkNode } from './guildNodes.ts';
import { counted } from './guildHome.ts';

/** The press that claims the bounty in a slot. */
export const claimId = (slot: number) => `guild-claim-${slot}`;

/** The player's contribution this week, under the guild's level: its words, and the square filled at the week's most
 *  beside how much of it they gave. */
export function contributionNode(face: GuildFace, size: number): Node {
  const given = face.contribution ?? 0;
  const most = CONTRIBUTION.weekMost;
  const full = given >= most;
  return {
    width: 'grow',
    alignX: 'end',
    alignY: 'center',
    gap: 10,
    label: `Weekly personal contribution, ${counted(given)} of ${counted(most)}`,
    children: [
      words('Weekly Personal Contribution', size, INK.faint),
      {
        width: 10,
        height: 10,
        outline: { width: 1, colour: full ? '#74d9a0' : INK.faint },
        padding: 2,
        children: [full && { width: 'grow', height: 'grow', fill: '#74d9a0' }],
      },
      words(`${counted(given)} / ${counted(most)}`, size, full ? INK.word : INK.faint),
    ],
  };
}

/** One bounty's line: its box, name and words, the guild's count, and its claim. */
function bountyNode(
  ui: Interface,
  bounty: GuildBountyShown,
  slot: number,
  size: number,
  claim: (slot: number) => void,
) {
  const id = claimId(slot);
  const claimable = bounty.done && !bounty.claimed;
  if (claimable && ui.clicked(id)) claim(slot);
  const beside: Node = bounty.claimed
    ? words('Claimed', 1, INK.faint)
    : claimable
      ? pressNode(id, 'Claim', 'primary', '', 1, { padding: [5, 10] })
      : words(`${counted(bounty.count)} / ${counted(bounty.target)}`, 1, INK.faint);
  return {
    width: 'grow',
    direction: 'column',
    gap: 2,
    children: [
      checkNode(bounty.done, bounty.name, beside, size),
      {
        padding: [0, 0, 0, 20],
        children: [words(bounty.words, 1, bounty.together ? TONES.brassHi : INK.faint, { wrap: true })],
      },
    ],
  } satisfies Node;
}

/** The week's four guild bounties as a checklist. */
export function bountiesNode(ui: Interface, face: GuildFace, size: number, claim: (slot: number) => void): Node {
  return {
    width: 'grow',
    direction: 'column',
    gap: 8,
    children: (face.bounties ?? []).map((bounty, slot) => bountyNode(ui, bounty, slot, size, claim)),
  };
}
