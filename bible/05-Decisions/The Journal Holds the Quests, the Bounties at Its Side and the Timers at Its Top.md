---
type: decision
date: 2026-11-20
status: in force
---
# The Journal Holds the Quests, the Bounties at Its Side and the Timers at Its Top

Shown Destiny 1's Quests screen (a grid of quest cards, each a banner with its name, a line of its tale and its step;
the page and a count; and a column of bounties at the right), the owner wrote:

> "So the journal page.
>
> We might as well and go ahead. Flesh it out. The main section will be utilized for story missions, side quests,
> future quests. The right side for bounties. And the top for a detailed timer drop down (utilize the timer hourglass
> for dfo to replace the account portrait when on the tab)"

Then, sending Destiny 1's Bounty Tracker (a grid of square icon tiles, a row to each kind of bounty, a stock refresh
bar under it, and a card on the tile under the pointer):

> "This is what bounties should look like. Not text bloat"

Asked whether bounties should carry names, as Destiny's do:

> "Yeah come up with catchy short names"

Looking over the pictures of the built Journal, the owner wrote:

> "I want you to really go deep and make this as detailed as possible. The timers themselves need to utilize more
> icons and less text.
>
> Everything needs to be beautiful. Dont come back until this is perfection"

Looking over the next pictures, the owner wrote:

> "Its much better. But keep pushing those better and more.varied quest banners, better bounty glyphs, etc"

Where the Journal met the houses' roads ([[Quests]]), an engine of quests as named steps over one count, which held
no quests, stood beside the roads. Asked "How should they come together?", the owner chose
"Journal shows main's (Recommended)":

> "Drop #97's empty quest engine; the Journal's quest cards show main's quests (the opening and the houses' roads) as
> story missions. #97's bounties keep their own engine."

## What it settles

- **The Journal is built in full now.**
- **Its main section holds the quests**: story missions, side quests and quests of kinds to come. The quests there are
  the houses' roads, the opening among them, shown as story missions; no engine of quests stands beside them.
- **The bounties keep their own engine** (`gear::objectives`).
- **Its right side holds the bounties.**
- **Its top holds a detailed timer drop-down.**
- **On the Journal tab, DFO's timer hourglass stands in the account portrait's place.**
- **Bounties look like Destiny's Bounty Tracker**: icon tiles and one card, not lines of text.
- **Each bounty has a catchy short name.**
- **The timers lead with icons and say less in words.**

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| The quest grid | Two columns of three cards a page, how many are held beside the title and the page between its drawn arrows at the right; one column of cards under 900 px, the bounties staying beside it down to 600 px | Destiny's grid, folded where two columns do not fit |
| A card | Its banner, its name, a line of its tale, and its step's number in a brass badge and its name; a brass tick once every step is done | What Destiny's card shows, and no more; the face has no italic of its own, so the tale is set apart by its colour |
| The roads on the cards | A card for the road walked (the opening until the pledge, then the pledged house's) and one for each road done, in the roads' file's order; none from a word not on the player's own character | The page knows those from the gear (`quest`, `quests_done`); a road left by a change of pledge keeps its place in the rules and shows again once walked or done |
| A road's step | Its task now, by its number from 1 and its tracker words; a road done stands at its last task with the tick | A road's tasks are its steps, as the tracker shows them |
| A road's tale | The first line its opening scene says (its `begin` in the story's scenes) | The roads write no tale line of their own, and that line says what the road is about in the roads' own words |
| A road's banner | A story mission's pennant, chosen by its id | Every road is a story mission; none names a banner |
| The banners | A story mission's swallowtail in blood and brass, a side quest's shield (a kind to come wears a side quest's), each of six charges, the shields each of six fields; a quest wears the banner it names, else one of its kind's chosen by its id | Two kinds told apart at a glance, and quests side by side apart: "better and more.varied quest banners" |
| The order | Story missions first, then side quests, then kinds to come | The story leads |
| The empty line | "No quests held. Quests you take up are kept here.", before any room's word or on a word not the player's own | The page says plainly why it is empty |
| The tiles | A square tile a bounty, bearing its bounty's own glyph (a bounty not drawn, the mark of where it counts) on its kind's ground: stone for land, deep water for the sea (a tone the kit gains), blood for dungeons | Destiny's rows of colour, in the kit's tones; each bounty its own glyph, as each of Destiny's wears its own: "better bounty glyphs" |
| The tiles' states | Open, plain; taken, a gauge of its count along its foot; done, a gold edge; turned in, dimmed with a check | A state read from the tile, with no words on it |
| The card | The bounty's name, its kind in small type under it, its words, a gauge with its count, its rewards, and at the board its press | Destiny's card on the tile under the pointer |
| The names | Tithe Collector, A Cut Above, Honest Work, Big Game, Broadside, Bigger Fish, Sea Wolf, Into the Dark, Deeper Still and Deep Delver, each at most 16 letters | Short and catchy, at the owner's ask |
| The board | Its title, one line, the tiles in three rows of two, the rising sun and the time to the daily reset over a bar, and the card beside them; arrows move between tiles, and E or a click takes or turns one in | The Bounty Tracker's right half |
| The Journal's bounties | Six slots three to a row under "Bounties" with how many are taken, the same tiles and card with no press | Bounties are taken and turned in at the board alone; three to a row as Destiny's tracker, from one left edge with the column's head |
| The timers | Under Today, This week and Later, each head carrying its reset's icon and its one countdown, so no row repeats a clock and none says Now; no bar of groups | DFO's timers window with our own rows, and few enough of them to need no filter; every row runs to its group's reset, so one clock says it once |
| The timers' icons | Each row its icon in a well, its marks drawn: the seas of each tier with a tick, a ring or a padlock; each modifier its own icon alone, Burn's flame in its Art's colours; the isles' level band the character is in lit; the pay by the gear's own glyphs and a chest; the Abyss's revives a heart and its wipe a skull | More icons and less text, at the owner's word, in the gear glyphs' style so the screens share one hand |
| The timers' words | Said at the panel's foot for whatever is pointed at or focused, and read to a screen reader, never written on the rows; the arrows step between the rows | The words stay one look away, and no mark is a sign without a meaning |
| The page under the timers | Dimmed as DFO's stage is, the panel on its own bevelled ground ruled in brass, dropping from under the hourglass, which stays turned and lit while it is down | So the panel reads as over the page and as opened by the hourglass |
| The key | T drops the timers, with its keycap in the footer | T was free on foot, at sea and in the menu |
| The panel | It lies over the page, which rests under it, and goes up as the Journal is left | So the timers never stand over another tab |
| This Week | Its title goes, its rows becoming the timers' | The owner's drop-down holds them |

Links: [[Interface]], [[Activities]], [[Pick - Enhanced Plus UI]],
[[The HUD Drops Its Room Line, and the Account Mark Comes From DFO]],
[[The Story Is Nine Missions, With Side Quests Between Them]],
[[Dailies and Weeklies Follow Destiny 1, With One Abyss Dungeon a Week]].
