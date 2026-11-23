---
type: decision
date: 2026-11-23
status: in force
---
# The Patrol Audit's Leftovers Are Fixed as the Owner Chose

After the patrol audit ([[Each Patrol Zone Has a Built Landing Site, Its Guards Beyond It]] among what it touched),
Claude listed what it had left: the owner's calls and the risks it had recorded.

> "Fix everything"

Each call was then put to the owner, with Claude's recommendation:

> Asked how officers ashore should work in a patrol's landing, where guards came in to fight them beside a player the
> landing protects: "Why are there enemies in the landing?"
>
> Told no foe stands there, foes coming in only chasing, and asked whether foes should never step into it: "Only
> chases you started"

> Asked what a patrol group that has lost half its foes, defending at its post for good, should do: "Whatever destiny
> does"

> Asked whether a player the foes leave be should be struck by a blow aimed at someone else, and whether a fight
> brought into the landing should draw in other foes: "Close both (Recommended)"

> Asked whether to stand foes in caverns and tunnels and along runs, which the layouts mark and no room reads: "Build
> both now (Recommended)"

> Asked whether an escort's ambush counts as a wave that drops nothing a second time: "Yes, drops nothing again
> (Recommended)"

> Asked whether the server should check that a player leaving a dungeon left by its exit door or portal before
> standing them at its door, a server-authority change: "Check it (Recommended)"

> Asked whether a patrol whose pass is not done should be refused when played alone, as online: "Refuse it offline
> too (Recommended)"

## What it settles

- **The landing** ([[Enemies]]): officers ashore standing in it are left alone and stir nothing; a foe already
  fighting a player may follow them in, and no other foe joins that fight there.
- **A player the foes leave be** (just stood again, or in the landing) is struck by no blow aimed at someone else.
- **A half-fallen patrol group** comes back as a Destiny patrol area does once no one is near.
- **Foes stand in caverns and tunnels and along runs** ([[Zones Rise and Fall, Above and Below Ground]],
  [[Patrol Zones Stay as Built and Gain Linear Combat Areas]]).
- **An escort's ambush** an account has fought drops nothing again, as a defence's wave does ([[Quests]]).
- **Leaving a dungeon**, a player stands before its door only if the dungeon's room saw them leave by its exit door
  or its open portal ([[Dungeons]], [[Server]]).
- **Played alone**, a locked patrol or mission is refused as the server refuses it
  ([[Patrol Zones and Missions Open as Their Pass Is Done]]).
- Every risk the audit recorded is fixed or measured; #170's description lists each.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| Whom a foe sees in the landing | A foe of the factions sees a landed player or officer only if it already fights them; a landed officer sees only the foes that brought a fight in (`Room::seen_by`) | "Only chases you started": an officer there starts nothing, a fight brought in goes on, and none joins it |
| Blows aimed at others | A sweep, a telegraph's shape and a shot pass a spared player by (`Room::spares`); a shot flies on through them | "Close both": a protected player is struck only by a foe that fights them |
| What Destiny does | A half-fallen group is made whole and walks its beat once no player has been within 40 m of its post for two minutes, as a cleared group stands again | A Destiny patrol area resets once no one is near; the room's own rule for a cleared group is the nearest it has |
| A way out | Within 3.5 m of the exit door's middle, or of the return portal's while it stands open, and alive, as the room last had the body (`gear::left`'s `out`) | The page offers "Leave" within 2.5 m; a metre more for the view it judged by |
| An ambush's wave | It is its escort's one wave, wave 0 of its goal (`fought_wave`) | The rule a defence's waves follow already |
| A locked patrol alone | The page's arrival goes to the first node, as for a locked social space | What the page already does where an arrival is refused |
