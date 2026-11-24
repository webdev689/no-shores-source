---
type: decision
date: 2026-11-23
status: in force
---
# The Prologue, Horses and the Welcome to Overlook as Claude Builds Them

> "I want you to take some autonomy and tackle all of my asks head on with precision, no half assed works or band
> aids, this is your baby. Be as detailed as possible. Only return to me when this is 100%"

## What it settles

Claude's choices in building [[The Prologue Is Reworked With Real Armour, a Bow, the Storm and No Elites]],
[[Horses Are Items Worn in a Mount Slot]] and
[[The Stranger Welcomes the Player, and a Quest Walks Them Round Overlook]]. The owner can change any of them.

**Horses in the Mount slot**

| Choice | Chosen | Why |
|---|---|---|
| A horse | An item of its own kind, one to each coat (the coat its hide), Normal, no level, stats or perks; never upgraded, dismantled or sold back; carried in the Mount slot's nine and stored in the vault among the armour | "Horses become an item you can equip" |
| The Mount slot | Its own tile at the top of the Character page's right column, beside the Art's diamond; a grey horse's head when empty; the barding chosen in its flyout, beside the horses, every flyout kept whole on the screen, drawn on the horse worn (the bay's hide with none) | "Mount icon slot in inventory"; it did not fit under the cloak at 720 lines |
| The Appearance screen | The figure alone, Emblem and Dye | "Remove horse from appearance tab" |
| Riding | Only with a horse worn, by the room's word; with none the key says "You have no horse." once a press, where it was pressed; the prologue says nothing | The room is the authority; the page and the room agree |
| A new player's first horse (replaced in part: the stranger gives the Bay as the welcome tour begins, [[Other Ships Wear Their Players' Marks, the Sea Map Has No Fog, and New Players Ride a Bay That Bursts]]) | None at the start; the Tack always sells the Bay Horse, first on its screen, at 1,500 Aurem (the cheapest coat's price), beside its day's four | "Later, not in the tutorial" |
| Characters kept before | Each coat kept becomes a horse in the pack, the coat worn the horse worn; a save from before cosmetics keeps its Bay; a room rolled back and forward gives no Bay to a character with none | No one loses a horse, and no one gains one |
| Others' view | A player the room has on foot is shown on foot, whatever the page sends | The room decides what others see |
| The Test Ground | Hands out no horse; its help says so | Its grant made horses of any rarity |

**The prologue**

| Choice | Chosen | Why |
|---|---|---|
| The armour worn on waking | The story's own Normal level 1 steel, worn in the Torso, Arms and Legs slots (no helm), named "Steel Cuirass", "Steel Gauntlets", "Steel Greaves", drawn from the gear; given once however often the story is told | "it needs to actually be loot equpped in your inventory" |
| The parry window | 15 ticks (a quarter of a second) for a player's parry, everywhere; a foe's stays 9 | "dialed back slighty"; the owner chose a longer window everywhere |
| The wreck's Elites | Each Tithe-Mate stays a Tithe-Mate, fought as a Major; the Bosuns written as the Majors they already were; the hold of Elites to a Major's strength gone | "only minors and majors": the rank changes and nothing else |
| The bow | A story short bow, Normal level 1, dropped by the boarder brought down once the parry and dodge are both met, lying where it fell as the sword and shield do; taken by walking over it | "the killed enemy should drop a bow" |
| The bow's lesson | "Arm yourself with the bow": Take up the bow, Equip it, Switch to the bow, Loose an arrow, Back to your sword, each with its key as bound (the pad's fire trigger as a drawn bow binds it); the step shown at the open page's foot while it is open | "prompts you to equip and switch between" |
| The wisp | One of the "hounds" of the Stormcallers' lore, never named: a white-hot core in a soft white-blue halo, trailing motes, arcs crackling off it, a trembling hum; in from over the sea (2.6 s), about the quiet deck's mast (4.8 s), then rings closing round the player's chest (3.4 s), the engulfing (1.4 s: arcs round the figure, a flash, a ring of Volt to 7 m, a thunderclap), then a cut back over the shoulder | "a detauled mysterious wisp ... flies around for a bit and then encircles and englufs the player" |
| The wisp's tie to the lore | Arlo Kestrel, introducing the Stormcallers to every player before the pledge: "You've met one of its hounds already, I think. Pledge here, and climb."; the Stormcallers' book tells "The Six Hounds" on their road | "linking somehow to lore", for every house's player, shown and not explained |
| The wisp's light | A pool of white-blue a few metres across on the deck and the figures, brighter as the rings close; the flash lights the deck near white | The "mysterious energy" is seen on what it touches |
| The crew at the wisp | The Lookout: "What is that? It's coming aboard!"; the Bosun: "Captain, don't touch it!", in the dialogue box | No one names it |
| Cutscene shots | The camera follows the wisp near, then watches the rings low and near (the player a third of the frame), keeping out of the fires' smoke where it can; the HUD's bars, compass and key strip hidden in the story's cutscenes, the dialogue box kept; every figure, the player's own too, drawn for a cutscene's own eye whatever the player's view, with no first-person hands over it | A cutscene, not a map |
| The Storm | Given at the flash: the Art worn, its Anima and both Tenets earned and charged full once, then its own recharge; waves held until it is given | "granting the player the volt art for the remainder of the prolouge" |
| The Storm's lesson | The next zone's wave: "Call the Storm": Cast Arc Lash (frozen when a foe stands in its cone and reach), Cast Quicken, Release Tempest (a foe within 12 m), in that order, each asked again until its cast lands | "teaching the player how to use each ability" |
| After the throw | The sea takes the story's steel and arms: from the deep on the player is drawn in the plain clothes a player with nothing wears in Overlook | The stranger's "The sea kept your steel" and the owner's "absolutely nothing" |
| The prologue's end | At its finish the room takes every story item wherever it lies and the Storm with all it earned; a character that finished the prologue before keeps what it has | The player arrives in Overlook with nothing |
| Smoke and fire light | Smoke fades softly near the eye (the story and the sea fight); a fire's light warms the timber orange, falling off softly | The cutscene's camera passed through smoke; the glow was stepped and lime |

Left for the owner: tools/wreck/wreck_level.py's waves (it publishes to R2) still list the Elite Tithe-Mates; to match
wreck.json, each `(11, 1, ...)` becomes `(11, 2, ...)` and each `(10, 1, ...)` `(10, 2, ...)`, and export_wreck.py
writes the quiet deck's `masts`.

**The welcome to Overlook**

| Choice | Chosen | Why |
|---|---|---|
| Who speaks | The stranger who found the player on the shore, where she waits after it, as soon as the veil lifts | "the noc who found you should begin talking to you as soon as you arrive" |
| Her history | The Grey Tithe and its tenth, Overlook that pays none, three ports standing and the rest ruins, "and nobody agrees how they fell" | "a little history pertaining to lore"; the crystal only hinted |
| The places, in order | The smiths' arcade, held on the Armorsmith's stall and then the Weaponsmith's, the Mage, the Vault, the Tailor, the Tack, the Postmaster, the harbour and its Shipwright, the Hall of the Arts from inside, turning to each house's chapel as she names it; then back to the player | "the places to visit in overlook ... the camera should navigate to each" |
| The keepers | Each answers her in their own voice as the camera holds on them | The dialogue's rule: no speaker more than two lines in a row |
| The tour's camera | Eased flights of 2.4 s; each place seen from where clear lines reach its keepers; her first lines and her farewell seen from the pair's side; at the end the view eases back over the player's shoulder, turned the way she walks off | A cutscene that shows each place and keeper whole |
| While she speaks | The HUD's bars, compass, tracker, marks, key strip, use prompt, toasts and a gate's offer hidden; no key acts but Space (her next line) and the menu (her words wait under it); townsfolk (never the player or her) not drawn within 4 m of the eye; at night a soft warm lamp over the pair, put out when the welcome ends or is left | It is a cutscene, readable at any hour |
| Her gift | 400 Aurem, the reward of the opening's first task ("Hear the stranger out"), once a character; a character still owed it (a reload mid-welcome) is given it on arriving in a social space with no welcome playing | "handing you some aurem to get started"; given by the room, never twice |
| The player's start | No weapon, no armour, no horse | "You start with no armor, no weapon, no mount, absolutely nothing" |
| Simple starting gear | Each smith always sells, after the day's six, Normal pieces at the buyer's level for 50 Aurem, shown first under "To start": the Armorsmith a head, a torso, arms and legs; the Weaponsmith a sword and shield and a bow | "leads to buy simple start gear" |
| The opening quest | "A House of Your Own": Hear the stranger out; Find your way round Overlook (the Weaponsmith, the Armorsmith, the Mage, the Vault, the Tailor, the Tack, the Postmaster, the Harbourmaster for the Shipwright, each saying what their counter is for); Arm yourself (a Melee weapon and the four armour pieces bought from the smiths); Put them on; Hear the three houses (Arlo Kestrel, Elder Maren Hale, Sable); Choose a house. The Weaponsmith calls the player over to begin the round | "guides you to each vendor, explains their functions, leads to buy simple start gear, and eventually ends with introducing you to each faction" |
| Characters made before | Read on "Hear the three houses", with no gift, keeping their gear | Not walked through it again |
| The round's buys and wears | Told of the pieces held after every answered ask until nothing more counts, so pieces bought and worn during the round meet "Arm yourself" and "Put them on" at once; a buy or wear goal names a weapon's or armour's slot, a count of 1 | No player stranded on a task already met |
| A task a room does not know | Read at the quest's kept task (the opening's "Hear the three houses"), else its first; a renamed task keeps its old id | The gift, before it, is never paid twice |
| Elder Maren Hale | Her welcome walk is gone; she keeps the Lamplighters' counter and introduces her house in the quest | The stranger's welcome replaces hers |
| The Test Ground and the public events' scripted players | Keep a plain sword and armour, no horse; the Test Ground's opening shows no task it cannot do | So they stay fightable, and the events' fingerprints hold |
| An old page | The protocol's version covers the smiths' stock and the quests, so a page left open across a deploy reloads | Its ware and task numbers would be wrong |

Replaced in part by [[The Key Strip Is a Compact Panel, a Held Key Leaves, and Settings Has Tabs]]: while she speaks
the game's menu no longer opens (it is gone); Escape opens Settings, and the leave held waits until she is done.
