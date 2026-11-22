---
type: system
status: live
code:
  - content/lore/lore.json
  - crates/gear/src/lore.rs#LoreDef
  - crates/gear/src/lore.rs#find_lore_due
  - crates/room/src/lore.rs#lore_lying
  - crates/room/src/lore.rs#find_lore
  - client/src/game/compendium/loreBook.ts#shelfOf
  - client/src/game/compendium/lore.ts#Lore
  - client/src/game/compendium/compendiumPage.ts#Compendium
  - client/src/game/compendium/loreArt.ts#coverSvg
---
# Lore

The lore books, after Destiny's ([[The Compendium Holds the Lore Books, After Destiny's]]): books in categories, each
of several chapters, each chapter found once, through the world, through a quest or through the story, and read in the
menu's Compendium ([[Interface]], "Compendium"). The rules keep what each player has found; the page shows it, and keeps
what they have read.

## The file

`content/lore/lore.json` holds:

- **Categories**, each a tile on the Compendium's front: an id, a name and a motif (one of the emblems' signs,
  `emblemMotifs.ts`).
- **Books**, each in a category: an id, a name, a cover (its cloth's colour, `#rrggbb`, and a motif) and its chapters
  in reading order.
- **Chapters**: an id, a title, the words (paragraphs apart by a blank line) and where it is found (`found`):
  - `story`: as the story ends.
  - `quest`: as a quest's task is done, the quest's id and the task's ([[Quests]]).
  - `place`: lying in the world, at a place of a node as its layout names it (as a quest's goals name them), `at`
    metres from its middle at `bearing` degrees clockwise from north, as a puzzle's point stands.

It starts with none: the books are the owner's to write.

## In the rules

- **Kept by id.** A character keeps each chapter found by its book's id and its own (`book/chapter`), in the order
  found, each once; one the file no longer holds is kept as read, so it comes back with its chapter. Never change an
  id once a chapter is played.
- **The story's and the quests'.** A chapter is the player's as the story ends and as its task is done; and, as every
  ask ends and as a character is read, every chapter of the story played or of a task done is theirs, so one the file
  gives to the story or a task later reaches those who passed it.
- **Lying in the world.** A node's room lays each chapter its file places there, at the bearing and distance from its
  place's middle; one at a place the node does not hold lies nowhere. Each player who has not found it is shown it.
  A player alive within 2.5 m of it finds it (ask 73); out of reach, dead, already found or in another node, it is
  refused. Found in a room before the player's kept character comes back, it is carried into it, as the story is.
- **Checked.** The file's ids are unique and hold no `/`, each book's category is one of its own, each quest and task
  named is one, each place is named; a chapter laid in the first landmass lies at a place its node holds, inside its
  ring, as the bake lays it.

## On the wire

The gear message carries the chapters found by their numbers (each its place in the file, book by book) and, in a
node, those lying there not yet found, each its number and its x and y. Ask 73 finds a chapter lying there, its
number in `item`.

## In the browser

- **In the world**, a chapter lying for the player floats as a closed book in a brass binding, its clasp lit, 0.9 m
  over where it lies under a mark's foot, laid among the marks over what a player can use ([[Game]], "Over what a
  player can use"); E within its reach says "Read" and the book's name.
- **Found**, a toast says "Lore found:", the book and the chapter. What a character already held when its first word
  on an account came is not toasted, nor a room's own starting character's.
- **Read** is kept in the browser for the account (`overlook.lore.read.<account>`); a chapter is read as the
  Compendium shows it. A chapter found and unread wears Destiny's small diamond, as do its book, its category's tile
  and the Compendium's tab.
- **The Compendium** shows it all ([[Interface]], "Compendium").

## Limits

- **Online only.** A page playing alone keeps no character, so it finds no lore, as it walks no road ([[Quests]]).
- **Read in one browser.** Another browser, or a cleared one, shows every chapter found as new again.
- **The first landmass checked.** Only its nodes are baked for the check of where a chapter lies; one laid further
  afield is checked once its continent is baked there.
