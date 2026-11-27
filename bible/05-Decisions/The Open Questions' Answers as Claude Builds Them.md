---
type: claude-calls
date: 2026-11-27
status: in force
---
# The Open Questions' Answers as Claude Builds Them

The owner's answers to the [[Open Questions]], walked through one at a time, are recorded in their own notes, listed
in [[Decisions]] after [[Magic and Rare House Pieces Drop in the World, for the Pledged House]]. The owner then asked:
"Let's tackle all of this, and ensure some of these haven't already been changed". These are Claude's choices in
building them, each the owner's to change. Each was checked against the code first; what was already so is said in
its decision.

## At sea

From [[Friendly Ships Fly the Three Houses' Colours, and Travel Keeps the Hostile Clock]].

| Call | Chosen | Why |
|---|---|---|
| Which house a friendly ship sails for | One of the three by its traffic id (`1 + id % 3`), the same on every page | Fixed for a ship's life, and ships leaving a port take turns |
| A house's colours | Its flag, as a player's ship flies it; the hull and canvas stay the friendly side's | Colours are a flag |
| How a Sloop escapes a Boss | A captain gives up a chase after 150 s in which it fired no volley and, out of its fighting range, closed no tenth of the gap; a blow from a ship it spared ends the spare. The Boss's way stays 1.3 times a Sloop's | Slowed to a Sloop's way, a Boss lost most fights to a Sloop standing off; the chase rule leaves the stand-up fight as it was |
| The seas at Normal | Every sailing goes to the one sea; the voyage card's Elite and Abyss set the tier of the places landed at | "The seas only": the patrol zones keep their tiers |
| Docked at a port | The ship kept within 5 km of a living port city's centre, for the week's run alone, a company member's join into it too | A port's pier and roadstead lie inside it |
| Who may be boarded | Any member of the player's company whose ship is at sea, named by username | The smallest way aboard |
| A passenger | Sees their captain's view, takes no helm, their own ship left where it lay; let off as the captain leaves the sea | The captain sails |
| A run opening in the wake's last instant | Eased to over at least 1 s, control waiting for it | The camera never jumps |
| Ships taken off their routes, seen from land | The sea's answer to a land room names them, and every land snapshot carries them | A few numbers each time |
| A ruin's crystal by its plaza | Kept off the plaza itself; the works keep the 110 m window; the near view's budget 1.7 million triangles | A body walks only on the plaza |

## Foes and fighting

From [[Bosses Stand Larger, Shields Regrow on More Foes, and Land Hides Plates]] and
[[Volt's Boost Lights the Character, House Pieces Drop in Dungeons, and a Lip Hangs as Caught]].

| Call | Chosen | Why |
|---|---|---|
| How large | A Miniboss drawn 1.25 times, a Boss 1.5 times, a Lattice foe's own size times that; the rules' body stays 1.8 m | Larger at a glance, a Boss more than a Miniboss; the hit box is a rule, the owner's to change |
| What grows with it | The plate, the sight line to the head, the parry ring and the marks over the head | What stands over or round the head |
| Others' words | Every word of a fight where neither side is the player, said only within 60 m and in sight, as a plate shows | "And such" read whole |
| One death look | Every death greys at once; a fall keeps its held camera and tumble | Keeps the common death as it was |
| Volt's boost | Read as Quicken's Haste: a steady Volt rim on the figure, the streaks behind it gone | The boost the Volt Tenet gives |
| A shield's regrowth | Whole once its foe has gone 10 s with no blow landing; a worn shield does not regrow; the Lodestone's strip stays | 10 s is how long a blow shares a kill |
| A Breach's shields | Its waves, walkers and the Waking's foes, one in five; never a Boss, a Miniboss, a bell or a Watcher | As any foe; the encounters' pieces stay as made |
| The Court at Normal | No darkness: the fallen stand again by their own ask at the Court's checkpoint | The fall-back belongs to the darkness |
| Going over from an angled hang | Square to the lip's face | Lands as from a square hold |
| An old save's Ranged weapon | Owed free at the Weaponsmith's counter, once | As her gift is given |
| House pieces | May drop from every source but a faction's | "Dungeons too", all four kinds |

## The patrol zones' folk and the arrivals' sounds

From [[Bosses Stand Larger, Shields Regrow on More Foes, and Land Hides Plates]].

| Call | Chosen | Why |
|---|---|---|
| Which places hold only civilians | Hamlets, farms and mills; Saltmere then holds 12 Tithe territories | Where folk live and work the land |
| Who stands there | Up to six townsfolk walking the place's paths and one guard in an iron helm and chain with a sword, drawn by the page alone; they keep their rounds in a raid | The townsfolk's own figures and walks |
| The arrivals' sound sheet | Four Freesound candidates each for the airship's engines and hatch and the crown's forming; the borrowed sounds play until the owner picks | As the earlier sound sheets were made |

## The Drowned Vale

From [[A Breach Run Follows Its Company From Checkpoint to Checkpoint, and Forged Weapons Climb]].

| Call | Chosen | Why |
|---|---|---|
| A checkpoint | The run's stages (the Descent's top, each encounter's start, the Broken Stair's), kept with the hidden chests its attempt earned | Each encounter's start was a stage already |
| The reset | In the Playlist, by the company's leader or a player alone, pressed twice; the next Launch is a new run from the Waking | Destiny lets the fireteam leader's checkpoint stand |
| How long it is kept | A day after the checkpoint last moved; a shut run two days | Storage stays bounded |
| A Forged weapon's climb | 263 to 315 Attack, a level's more at each end than Normal's | As Hard's armour reaches the level past Normal's |

## The page

From [[The Story's Mark Stays With the Character, the Page Plays Online, and a Join Reaches Any Landmass]].

| Call | Chosen | Why |
|---|---|---|
| Graphics | Grass (Full, Half or Off) and Shadows (On or Off) | Each spares real work on the graphics card |
| The pad's chat | View and Start together, shown in the key strip at rest and riding | Every single button is taken on foot |
| Playing alone | `?offline`; the Test Ground and the World Editor as before | No offline word existed |
| The garments the room keeps | Any its player's worn pieces could be drawn in, from one clothes table in content | As the room keeps armour sets |

## The repo

From [[Sign-In Is Rate-Limited, Three Checks Join the Repo, and Comments Stop Saying Who Chose]].

| Call | Chosen | Why |
|---|---|---|
| The sign-in limit | 10 a minute from one address (IPv6 by its /64), at each Cloudflare location; registering not limited | Above a person's own retries; a name as the key would let one address lock it |
| The hold's word | The room's `Taken`, every 30th message; the page holds at 150 untaken | A few frames a second |
| The Lattice's publish | In no concurrency group | Its uploads are named by their hash |
| `forge.yml`'s paths | The sprite forge's Python, whole | A list of its modules would go stale |
| `site.yml` by hand | Waits on CI's `site / build` | It follows the rooms' own decision |
| A foe falling back where it cannot reach | Fights on where it stands | No timer needed |
| A shot loosed inside the ground | Stops where it is loosed | It is inside rock |
| The city's pictures | At most 504 layers kept, the least recently used let go | The open city and the last one whole |
| The plain text check | The content's strings but its lore books, the world's briefs and data and a file's `about`; a name may hold a padding word | Pages are pages; "Delve Gate" is a name |

## The lore

From [[The Prologue Shows the Chart That Disagrees, and the Grey Tithe Sail Under Their Colours]] and
[[The Mystery Is Called the Axis, the Keepers Are Named, and Each Bounty Carries a Line of Its Tale]].

| Call | Chosen | Why |
|---|---|---|
| The chart | Held over the storm's run 0.5 to 5.5 s after the leap: the coast inked, an older chart's coast faint beside it, falling short beyond the town, the course pencilled; no words | Shown, not told |
| Why the opening's ships are unknown | "Three! No lights!": they run dark through the storm | Their flag cannot be seen |
| Where the Axis is named | Once, in *Soundings*, "The Green", by a man it takes | A name given by those who witnessed it; the prologue names nothing |
| The bounties' tales | In each bounty's template, sent with it, 80 characters at most | A bounty's name is never kept or matched |
| The Pearl Tomb's way in | "Dune Path" becomes "Cliff Path" | Cliffs win |
