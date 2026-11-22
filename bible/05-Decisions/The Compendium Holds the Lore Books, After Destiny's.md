---
type: decision
date: 2026-11-22
status: in force
---
# The Compendium Holds the Lore Books, After Destiny's

With Destiny's Collections screen (a grid of categories, each its icon, its name and how many of it are found) and its
Lore screen (a grid of books, the chosen book's cover with its name and how much of it is found, the entry's title and
words, and the chapters numbered under them) shown, the owner wrote:

> "3. Introduce a new tab called compendium. The compendium will be home to a new feature for lore books. We will
> craft the lore books later but the screenshots attached are for how they should look and function. Each lore book
> should contain multiple chapters, and will be obtained through the world, through qursts,.story, etc"

Asked whether the Compendium's front should hold the lore alone, its categories as Collections' tiles, or item
collections beside it, the lore alone recommended, the owner wrote:

> "Youre on point. Build this to 100%, be eztremely detailed and only come back when this is finished. It needs to be
> perfect"

## What it settles

- The menu has a Compendium tab, home to the lore books ([[Interface]], "Compendium"; [[Lore]]).
- Its front is laid as Destiny's Collections, for the lore alone; a category opened is laid as Destiny's Lore screen.
- Each lore book holds several chapters, each found through the world, through quests or through the story.
- The books themselves are the owner's to write later.

## Claude's calls

Under "Youre on point", the owner's to change:

- The lore is one file, `content/lore/lore.json`: its categories (a name and a motif), its books (a name, a category,
  a cover of a cloth colour and a motif, and chapters in reading order), and each chapter's title, words and where it
  is found: as the story ends, as a named quest's task is done, or lying at a named place of a node, a bearing and
  distance from its middle, as a puzzle's point stands. It starts with none.
- A chapter is kept on the character by its book's id and its own, kept on every room's word as the story is; one the
  file gives to a task or the story after a player passed it is theirs as their character is next read. A chapter
  lying in the world floats as a closed book at a crown's height over where it lies, for each player who has not
  found it, and E within 2.5 m finds it, as a resource node's reach.
- What is read is kept in the browser for the account, as the roads' opening lines said are; Destiny's small diamond
  marks a chapter found and unread, its book, its category's tile and the Compendium's tab. A chapter found is toasted
  ("Lore found: the book, the chapter").
- Books and chapters not yet found show as plain stone covers and dim numbers, with nothing of their names or words.
