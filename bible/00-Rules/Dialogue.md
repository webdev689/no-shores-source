---
type: rule
---
# Dialogue

What a character says, aloud or on screen, in this mission and every one after it. [[Plain Text]] holds for every
line; dialogue holds to more, because a player hears it while they play.

1. **One breath a line.** A line holds at most 14 words. A bark, shouted over the noise, holds at most 4.
2. **Short turns.** A speaker says at most two lines before someone else speaks or the player acts.
3. **Short scenes.** A scene holds at most 8 lines. What it cannot say in 8 is shown.
4. **No em dashes.** No em dash, en dash or double hyphen, and no ellipsis: a pause is a full stop.
5. **Said as people say it.** No line explains the game's systems (no "XP", no "quest", no key names; a prompt names
   the key, a person never does), no stock phrase a player has heard in a hundred games, no line that only restates
   what the picture shows.
6. **Always heard.** Every line has a speaker with a voice ([[Speech]]): a line on screen is a line heard, and a
   voice is only ever heard with its words.
7. **Nothing the owner has not set.** No line names a place, a people or a past the owner has not named. A mystery
   stays one.

**Why.** The owner set it, with the first story mission ([[The Game Opens With a Story Mission at Sea]]): "Ensure
dialouge is not overbearing, bloated, has em dashes, and develop a rule standard for current and future dialouge."

**Checked by.** The dialogue check, on every scene in `content/story/` (rules 1 to 4 and 6), and on the quests'
(`content/quests/quests.json`: each scene they name is the story's, each speaker the cast's, and what they show on the
screen holds no dash or ellipsis, [[The Audit's Leftovers Are Fixed as Claude Suggested]]; and no speaker says more than
two lines in a row across a quest's seams, its `begin` into its first task's `start` and each task's `end` into the next
task's `start`, [[The Dialogue Check Holds Two Lines a Turn Across a Quest's Seams]]); review for the rest.
