---
type: decision
date: 2026-11-25
status: in force
---
# The Tack Gives the First Horse, the Prologue Ends in Plain Clothes, and Each Speaker Is Named in a Colour

> "1. I want to pick a new freesound for the city chatter ambience
>
> 2. The player out of the tutorial starts off completely naked. Should at least be wearing clothes with no stats
>
> 3. The horse is auto granted when arriving when it should be given by the tack
>
> 4. The camera isnt positioned properly when the stranger is talking to the player in the city. It sits too low
>
> 5. Speakers need to have different colored names in the UI to distinguish them"

Asked how a player with nothing worn should be clothed, the owner chose "Statless clothing items", the option that
read: "At the prologue's end the room gives plain clothing pieces (a shirt in Torso, breeches and boots in Legs), worn,
with no Defense or perks. They show on the Character page and go to the pack when bought armour replaces them. Taking
everything off would show the bare body again."

Asked which city sound is the chatter, the market crowd or the city hum, the owner chose "Both".

## What it settles

- **The city's crowd and its hum each get a new Freesound pick**, judged on the sound sheet
  ([[Sounds Come From Freesound, Judged on a Test Sheet]], [[Ambience]]).
- **The prologue's end dresses the player in plain clothes with no stats**: a shirt in the Torso slot, breeches and
  boots in the Legs slot, worn, shown on the Character page, to the pack when armour replaces them ([[Gear]]).
- **The Tack gives the first horse**, not the stranger on arrival ([[Gear]], [[Quests]]).
- **The camera stands higher while the stranger speaks to the player** in Overlook ([[Prologue]]).
- **Each speaker's name is shown in a colour of their own** ([[Speech]]).

Replaces in part [[Other Ships Wear Their Players' Marks, the Sea Map Has No Fog, and New Players Ride a Bay That Bursts]]
(the stranger giving the Bay), [[The Stranger Welcomes the Player, and a Quest Walks Them Round Overlook]] (the player
arriving with nothing: they arrive in plain clothes) and
[[The Prologue, Horses and the Welcome to Overlook as Claude Builds Them]] (the player's start, the prologue's end).

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| How the Tack gives the Bay | As the reward of her own goal in the opening's round of the counters (`"reward": { "horse": true }` on "The Tack"), paid by the room the moment she is spoken with at her counter, for nothing, worn where no horse is | "given by the tack"; the free horse of the earlier decision, from her |
| A goal's own reward | Any goal may carry one, of Aurem or the first horse, given as it is met; a house's Art, Tenets and fragments stay with its tasks, in their order | The round's eight talks are one task, whose reward comes only when all eight are heard |
| The stranger's gift | Her 400 Aurem alone | "auto granted when arriving" |
| One already given the Bay by the stranger | Keeps it; the Tack gives no second | One horse of each coat, as before |
| One who pledged before the round reached the Tack | She gives the Bay at her counter for nothing, worn where no horse is, once (a horse is never dismantled); her counter shows it "Free" (`buy_cosmetic`, `horse_goal_left`) | A pledge moves the road to the house's quest, so her goal is never met; the Bay is every new player's, as the Harbourmaster's Sloop is to one who pledged before its task |
| The Tack's words on the round | "First horse is on me. This Bay's never thrown anyone." in place of "Looking for a horse? I've a Bay here that's never thrown anyone." | She gives it now; [[Dialogue]] |
| The plain pieces | A Plain Shirt (Torso) and Plain Breeches (Legs, the boots drawn with them), Normal, marked plain: no Defense, Prestige, nodes, perks or XP, and no level or power shown, as a horse's; words "A shirt to stand up in. It turns no blade." and "Breeches and boots to walk in. They turn no blade." | The option the owner chose |
| When and where they are given | At the prologue's end, as the room takes back the story's steel, worn in each of the two slots left bare; a slot worn with a piece of the player's own gets none; once | So no new player arrives bare |
| Their look | The shore's own: the shirt white, the breeches and boots dark brown, one list for both (`PLAIN_CLOTHES`) | The figure that comes ashore is the one that arrives |
| Dismantled | Allowed, for nothing back | They are worth nothing; the pack can still be cleared |
| The opening's "Put them on" | Not met by plain clothes | It asks for the armour bought |
| A character past the prologue before this | Given nothing | The owner's option gives them at the prologue's end |
| The face-to-face shot (her first lines and her farewell) | From the pair's side and over their heads: 2.8 m over their feet (3.4 m, then 2.4 m, where a solid blocks the first), about 9.4 m off, looking 24 degrees down, so their crowns stand 14% and their feet 36% down the view, whole above the dialogue box; the distance and tilt solved for the player's own lens | The eye stood at 1.7 m, level with their faces, tilted 23 degrees down to keep their feet above the box: through the game's 50 degree lens their crowns stood at the frame's very top edge and two thirds of it was pavement |
| Where a speaker's colour shows | The dialogue box's name; a keeper's own screen names its one speaker in that screen's colour | The box is where speakers take turns |
| The palette | One colour a named speaker, soft and light (OKLCH lightness 0.72 to 0.90) beside the kit's stone and brass; the house leaders in their house's hue (Arlo Kestrel storm blue, Elder Maren Hale lamp amber, Sable violet), the stranger alone in sea-glass teal, Captain Thule red, the Grey Tithe's in greys | Meaning where it helps; no colour shared |
| How far apart | Two who speak in one scene at least 0.1 apart in OKLab (0.11 at the nearest), any two at least 0.03; each name at 4.5 to 1 or better on the box over a white sky, 7 to 1 over a dark one | Told apart at a glance and read anywhere; held by `cast.test.ts` |
| Where the colours are kept | `content/story/cast.json`, `"colour"` beside each speaker's name and voice; a speaker with none is named in the kit's brass | Everything about a speaker in one place |
| The city's new searches | The crowd for "crowd chatter", the hum for "town ambience distant", each current pick skipped; the current recordings play until the owner picks | Four new candidates each for the sheet |
