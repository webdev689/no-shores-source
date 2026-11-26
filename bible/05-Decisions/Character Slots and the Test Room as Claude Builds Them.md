---
type: decision
date: 2026-11-26
status: in force
---
# Character Slots and the Test Room as Claude Builds Them

The calls Claude made building [[Each Account Keeps Four Characters, Chosen on a Screen After Destiny 1's]] and
[[Developers Launch Activities From a Test Room, in Max Gear]], where the owner's words left them open. The owner can
change any of them.

## The four characters

| Call | Claude's choice | Why |
|---|---|---|
| One in play | An account plays one of its characters at a time, the one last chosen; the other three wait | One account is one player in a room already; the Roster, the bot, Find a Company and the guild read "the account's character" unchanged |
| Switching | Waits until the character in play has left its room (asked again for a few seconds as the page leaves) | No room ever saves over a character that is no longer the one in play |
| The vault and Aurem | Kept on the account apart from every character; the room joins them to the character it holds and parts them on each save, by the rules (`gear`) | Shared by all four without moving anything when a character is switched or deleted |
| An empty slot | Choosing it makes a new character, who plays the prologue | As a new account's first character does |
| Deleting | A held press, on the screen; the character in play can be deleted, and its slot is then empty | What cannot be undone is held ([[Interface]]); the vault and Aurem are the account's, so nothing else is lost |
| The look | Kept with each character on the accounts, as well as in the browser | Each slot shows its own figure on any browser |
| Switch character | A held press in Settings beside Exit to Menu, leaving straight for the character screen | Leaving the world is a reload, as Exit to Menu is |
| A number taken twice | A vaulted item or Vestige joining a character that already holds its number takes a new one; nothing is dropped, however full the vault | Each character numbers its own things; the vault is never lost to a clash |
| A character kept before the four | Keeps its own vault and Aurem until a room next saves it, which parts them into the account's; switched away from or deleted before that, the accounts part them first | Nothing is lost or doubled |
| The look kept on the accounts | Checked for its shape alone (a body, a race, a tone from 0 to 1, hair or none; at most 512 characters); which races, styles and colours there are is the page's to judge | The page draws them and may add more; the accounts never load the page's figures |
| A slot with a look and no body | Shows as a character: one made on the screen and never yet played | The figure chosen stands in its slot until it plays |
| How often | 120 reads and changes an hour an account, as the binds | The screen asks a few times a visit |

## The test room

| Call | Claude's choice | Why |
|---|---|---|
| Who sees it | Developers alone, asked again of the bot each time the character screen opens; each test room asks again as a developer joins | The server is the authority; the page's word is never taken |
| The Test Room | A screen of its own reached from the character screen, listing what the Playlist offers: the Elite and Abyss Playlists, the week's Elite and Abyss Dungeons, and the Breach at Normal and at Hard, each with Launch | What the owner named, launched from the character menu |
| The test character | Made by each test room as a developer joins and kept nowhere: level 30, Prestige 120 in Hard Breach armour with its upgrades bought, a Forged weapon in each weapon slot at the most Attack, every Art mastered | Max gear, as the rules have it; nothing a test run gives can reach a real character |
| A test run | Its own room, named `--test-<instance>` where a run is `--run-<instance>`, for developers alone; a Playlist's at its top band's foes | Kept apart from every real run, its company and its gates |
| The Breach's test | Begins at the Sunken Gate in a copy of the Gullwing Vale of its own, so the Waking is tested too, then into the run | One player counts as the whole company there as inside |
| Leaving a test run | Back to the Test Room on the character screen | Where it was launched from |

## Test runs' rules

| Call | Claude's choice | Why |
|---|---|---|
| The names | A playlist's, the week's and the Breach's test run named as the real run with `--test-<instance>` last; the Breach's gate in `node-gullwing-vale--test-<instance>`, the run's own instance; no test of a patrol's dungeon, a run at Normal, a guild's or one marked `--sea` | What the Test Room launches, and nothing more |
| Making a room a test room | One door call (`makeTest`) after the room opens as its run or node does, for all three, rather than a word in each open's ask | One way in for the run, the Breach and the zone copy |
| The test character's pieces | Rolled from one fixed seed: the same weapon kinds and perks for every tester, the first perk chosen in each column | Max gear is the same for everyone; a developer who wants another weapon changes it in the room |
| The gate in a test room | Lets the tester in whatever it would ask: Hard without Normal won and any playlist's band, not Hard alone | A level 30 tester is outside the lower bands, which the Test Room launches too |
| Cannot fall | Health never below 1 from any blow, the Unwriting's and a seal's among them; a fall into the dark stands them again at once, even at Hard inside an encounter | Falling into the dark is not a blow; waiting on a revive no one can give strands a solo tester |
| What unwrites the company | In a test room it harms but loses no attempt: the Mending's and the Seam's fusions, the Steward's last taking, the Lodestone left lying, being Seen in the Ways at Hard | Each is what a company holds off together; one player cannot be at every seam or bell at once |
| A rift held open | Once open, a Two Shores rift stays open in a test room | The decision's "a mooring holds while any one is held", where one player cannot hold a mooring and cross |
| A developer's second socket | Sends the first away, as a run does | One account, one player, as everywhere |
| The zone copy's life | Forgotten a minute after it empties, as a run's room is; the test run takes its gate's word once and keeps it while the run lives, so a tester who rejoins is let in; a run itself forgotten and opened again asks anew | The copy is a run's room in all but name; keeping it alive would need the run to hold it |
