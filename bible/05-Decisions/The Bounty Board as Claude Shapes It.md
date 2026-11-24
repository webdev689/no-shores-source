---
type: decision
date: 2026-11-24
status: in force
---
# The Bounty Board as Claude Shapes It

> "Im going to have you take autonomy and focus on overhauling the bounty menu and bounty design."

The owner asked for the bounty menu and the bounties' design overhauled after Destiny 1's Bounty Tracker, standard
bounties wearing one standard design and faction bounties one of their own, the icons smaller
([[Standard and Faction Bounties Each Wear One Design, on a Board After the Bounty Tracker]]). There were no faction
bounties, so they are built too. Where the owner has not chosen, the choice is Claude's, with its reason; the owner
can change any. These replace the calls on the tiles, their states, the card, the board and the Journal's bounties in
[[The Journal Holds the Quests, the Bounties at Its Side and the Timers at Its Top]].

## What it settles

| Call | Chosen | Why |
|---|---|---|
| Who posts bounties | The town (Overlook), whose six are the board's as before, and each faction, whose bounties are its own | The Tracker's two rows are Destiny's two posters, the Vanguard and the Crucible; here the town and the faction pledged |
| A faction's bounties | Three a day for each faction, the same for everyone, drawn by the day from four of its own, one left out | As the town's are drawn; four to choose from keeps a faction's day varied without new kinds of task |
| What they count | The town's own kinds: foes felled by rank or faction, nodes gathered, ships sunk or taken, dungeons cleared. The Stormcallers fight (Storm Front, Thunderhead, Squall Line, Eye of the Storm); the Lamplighters keep the lamps and the sea lanes (Lamp Oil, Calm Waters, Light the Way, Harbour Light); the Veiled work quietly against the strong (Quiet Knives, Below Stairs, Night Work, No Witnesses) | The bounties' engine counts these already; each faction's set follows its words in `factions.json`. Short and catchy names, as the owner asked of the town's |
| Who takes them | Only a player pledged to the faction, at the board; refused otherwise with "Pledge to them first." | A faction's work is for its own |
| When they count | Only while the player is pledged to the faction and wears its cape | As its reputation is earned in the world; the card shows it as the Tracker shows what a bounty needs, ticked while met |
| What they pay | XP as a town bounty of its tier, and the faction's reputation in place of Aurem: 2,500 at the first tier, 3,750 at the second and 5,000 at the third, whatever the level (`bountyReputation` in `factions.json`) | The Tracker's Crucible bounty pays reputation and XP. Destiny 1's bounties paid 50 reputation against ranks some 2,000 to 2,500 apart; a faction's day here pays about a tenth of a rank (8,750 to 12,500 of 100,000), held by a test |
| A switch of pledge | A faction's bounty held still turns in, to the faction that posted it; it counts no more | Nothing earned is lost, and none is earned for a faction not served |
| Their places | The town's 0 to 5, then the Stormcallers' 6 to 8, the Lamplighters' 9 to 11 and the Veiled's 12 to 14 | Each faction's count keeps its meaning through a switch of pledge; the record keeps them as it kept the six |
| The standard design | Every town bounty wears one face: a pinned writ under a red wax seal with two ribbons, 16 cells, on slate lit along its top, framed as an emblem's sign | The Journal's bounty icon was already a writ under a red seal; the writ reads as a bounty at a glance, the slate as the Tracker's Vanguard row |
| A faction's design | Every faction bounty wears its faction's emblem as its sign: the Stormcallers' bolt, the Lamplighters' lantern, the Veiled's moon, on their grounds | The emblem is the faction's mark everywhere (its cape, its keepers' marks); one design for all three, its colours its faction's |
| The face's size | Both faces are 24 cells square; a tile is the face at twice its cells (48 pixels) in a 2 pixel edge, 52 in all, and three times (76) where the menu is wide and tall | Smaller, as asked: they were 80 and 112, each glyph 64 and 96 pixels |
| The per-bounty glyphs | Retired, the ten drawings gone | Every bounty of a kind wears one design, as the owner asked |
| A tile's states | Open in a stone edge; taken in brass with a gauge of its count along its foot; done in gilt, the gauge full and green; turned in dimmed with a gold tick; before the prologue greyed; pointed at or holding the keys, ringed in white just outside its edge | Read from the tile with no words on it, as before; the ring as the Tracker's cursor marks a tile |
| The card | Floated by the menu beside the tile pointed at or holding the keys: its name in capitals and its kind by where it counts ("Land bounty", or "Lamplighters bounty") on a band of its poster's colour; its task; its count once taken; "Rewards" with XP and Aurem or reputation by their marks; for a faction's, "Counts while you wear their cape" ticked while met; and along its foot E's press, or "Turned in" | The Tracker's card. No line of tale is written: the owner's earlier "Not text bloat" stands until the owner asks for one |
| The screen | Laid as a keeper's: the board itself drawn at the left on a floor lit in its gold under its "!" mark and title, where a keeper stands; at the right "When Overlook needs a hand, it posts a bounty here. The factions post their own.", Aurem and the pledged faction's rank by its emblem, "Available bounties" ruled under, the town's six in a row and the faction's three under them, and "New bounties" with the time to the next board at the foot | The Tracker's own layout, which the keepers' screens already follow; the board has no keeper, so the board stands in its place |
| The board drawn | 44 cells by 42 after the city's board (`board.rs`): two posts, a planked face, a shingled gable, its lamp, six notices in two rows of three, the top row's under red seals and the bottom row's in the three factions' colours; laid at the largest whole step that fits, two to twelve | The stage needs a figure; the board's own six notices in two rows say what the two rows of tiles are |
| Pledged to none | The faction's row is three locked wells whose card says "Pledge to a faction at its counter in Overlook to take its bounties." | The row is there to be opened, as the Tracker always shows its rows |
| Keys | A click, Enter or E on a tile takes or turns it in; E takes the one whose card shows; the arrows move between tiles and rows; the footer reads "Click / E Take or turn in", the Character key "Open Character" and "Esc Dismiss" | As before, and the keepers' footer |
| The Journal's column | A slot for each bounty shown (six, or nine pledged), three to a row at the board's tile size; each taken a tile with no press; its card floated beside it by the menu, with its state along its foot | The board's tiles and card; the card no longer under the tiles, so the column is narrow and the quests have the room |
| The timers' bounty row | "Posted each day on the board in Overlook’s plaza: six for the town, two on land, two at sea and two in dungeons, and three from your faction." | Says what the board now holds |

Links: [[Activities]], [[Interface]], [[Factions]], [[Gear]].
