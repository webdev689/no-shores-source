//! The Compendium's lore, after Destiny's lore books: books of chapters in categories, each chapter found once, as the
//! story ends, as a quest's task is done, or lying at a place in the world, and kept on the character by its book's id
//! and its own (`book/chapter`). Their words and covers are the page's; here is where each is found and who has it.

use crate::character::Character;
use crate::quests::quests;
use serde::Deserialize;
use std::sync::OnceLock;

/// Where a chapter is found.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Found {
    /// As the story ends.
    Story,
    /// As a quest's task is done: the quest's id and the task's.
    Quest { quest: String, task: String },
    /// Lying at a place in a node of the world: the node's id, the place's name as its layout names it, and how far
    /// from the place's middle it lies, metres, at a bearing in degrees clockwise from north, as a puzzle's point does.
    Place {
        node: String,
        place: String,
        #[serde(default)]
        bearing: f64,
        #[serde(default)]
        at: f64,
    },
    /// As the character lights their first lamp in the passages.
    Lamp,
    /// As a Breach's encounter is first won, or its hidden chest first opened: the Breach's id and the find's key
    /// (`crate::breach`).
    Breach { breach: String, find: String },
}

/// A chapter as the rules read it: its id within its book, and where it is found.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct ChapterDef {
    pub id: String,
    pub found: Found,
}

/// A book as the rules read it: its id, its category's, and its chapters in order.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct BookDef {
    pub id: String,
    pub category: String,
    pub chapters: Vec<ChapterDef>,
}

/// A category as the rules read it: its id.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct CategoryDef {
    pub id: String,
}

/// Everything in `content/lore/lore.json` the rules read.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct LoreDef {
    pub categories: Vec<CategoryDef>,
    pub books: Vec<BookDef>,
}

/// The most chapters the wire numbers.
pub const CHAPTERS_MOST: usize = u16::MAX as usize;

/// A chapter's key as a character keeps it: its book's id and its own.
#[must_use]
pub fn key_of(book: &str, chapter: &str) -> String {
    format!("{book}/{chapter}")
}

impl LoreDef {
    /// Every chapter, book by book in the file's order, which the wire numbers them by: its key and where it is found.
    pub fn chapters(&self) -> impl Iterator<Item = (String, &Found)> {
        self.books
            .iter()
            .flat_map(|book| book.chapters.iter().map(|chapter| (key_of(&book.id, &chapter.id), &chapter.found)))
    }

    /// A chapter's number, from its key: found without making a key for every chapter, as it is asked for each chapter
    /// a player holds whenever their gear is sent.
    #[must_use]
    pub fn number_of(&self, key: &str) -> Option<u16> {
        let (book, chapter) = key.split_once('/')?;
        let mut numbers = self.books.iter().flat_map(|it| it.chapters.iter().map(move |each| (&it.id, &each.id)));
        numbers.position(|(at, id)| at == book && id == chapter).and_then(|at| u16::try_from(at).ok())
    }

    /// A chapter's key, from its number.
    #[must_use]
    pub fn key_at(&self, number: u16) -> Option<String> {
        self.chapters().nth(usize::from(number)).map(|(key, _)| key)
    }

    /// What in the file the rules cannot keep, each said in a line; none when all is well.
    #[must_use]
    pub fn problems(&self) -> Vec<String> {
        let mut problems = Vec::new();
        let unique = |ids: &[&String]| {
            ids.iter().enumerate().all(|(at, id)| !id.is_empty() && !id.contains('/') && !ids[..at].contains(id))
        };
        if !unique(&self.categories.iter().map(|category| &category.id).collect::<Vec<_>>()) {
            problems.push("a category's id is empty, holds a /, or is another's".to_owned());
        }
        if !unique(&self.books.iter().map(|book| &book.id).collect::<Vec<_>>()) {
            problems.push("a book's id is empty, holds a /, or is another's".to_owned());
        }
        if self.chapters().count() > CHAPTERS_MOST {
            problems.push(format!("more than {CHAPTERS_MOST} chapters"));
        }
        for category in &self.categories {
            if !self.books.iter().any(|book| book.category == category.id) {
                problems.push(format!("{} has no book", category.id));
            }
        }
        for book in &self.books {
            if !self.categories.iter().any(|category| category.id == book.category) {
                problems.push(format!("{}: its category {} is none", book.id, book.category));
            }
            if book.chapters.is_empty() {
                problems.push(format!("{} has no chapter", book.id));
            }
            if !unique(&book.chapters.iter().map(|chapter| &chapter.id).collect::<Vec<_>>()) {
                problems.push(format!("{}: a chapter's id is empty, holds a /, or is another's", book.id));
            }
            for chapter in &book.chapters {
                let said = match &chapter.found {
                    Found::Story | Found::Lamp => None,
                    Found::Quest { quest, task } => {
                        let def = quests().quests.iter().find(|def| def.id == *quest);
                        let there = def.is_some_and(|def| def.tasks.iter().any(|it| it.id == *task));
                        (!there).then(|| format!("found in {quest}'s {task}, no task"))
                    }
                    Found::Place { node, place, bearing, at } => {
                        let placed = !node.is_empty() && !place.is_empty() && bearing.is_finite() && at.is_finite();
                        (!placed || *at < 0.0).then(|| "found at no place".to_owned())
                    }
                    Found::Breach { breach, find } => {
                        let found = crate::breach::breach(breach).is_some_and(|breach| {
                            (0..breach.encounters.len() + breach.chests.len())
                                .any(|nth| crate::breach::find_key(breach, nth) == Some(find.as_str()))
                        });
                        (!found).then(|| format!("found in {breach}'s {find}, no find"))
                    }
                };
                problems.extend(said.map(|said| format!("{}/{}: {said}", book.id, chapter.id)));
            }
        }
        problems
    }
}

/// The lore, as `content/lore/lore.json` holds it.
///
/// # Panics
/// Never for the file in the repository: its test reads it.
#[must_use]
pub fn lore() -> &'static LoreDef {
    static LORE: OnceLock<LoreDef> = OnceLock::new();
    LORE.get_or_init(|| {
        serde_json::from_str(include_str!("../../../content/lore/lore.json"))
            .expect("content/lore/lore.json reads: its test says so")
    })
}

impl Character {
    /// Whether the player has found a chapter, by its key.
    #[must_use]
    pub fn finds_lore(&self, key: &str) -> bool {
        self.lore.iter().any(|kept| kept == key)
    }

    /// Keeps a chapter found, once; answers whether it is new.
    pub fn keep_lore(&mut self, key: &str) -> bool {
        if self.finds_lore(key) {
            return false;
        }
        self.lore.push(key.to_owned());
        true
    }

    /// Takes forward what `other` has come to that this has not, never putting any of it back: the story played, and
    /// each chapter found, in the order `other` found them.
    pub fn carry_forward(&mut self, other: &Self) {
        self.story = std::mem::take(&mut self.story).merged(&other.story);
        for key in &other.lore {
            self.keep_lore(key);
        }
    }

    /// Keeps every chapter of `defs` the player has come to without lying in the world: the story's once it is
    /// played, each quest task's once it is done, and the passages' once a lamp is lit (as the week's record holds).
    /// So a chapter given to a task or the story after a player passed it is theirs as their character is next read.
    pub fn find_lore_due(&mut self, defs: &LoreDef) {
        let due: Vec<String> = defs
            .chapters()
            .filter(|(_, found)| match found {
                Found::Story => self.story.prologue,
                Found::Quest { quest, task } => self.task_done(quest, task),
                Found::Lamp => !self.activity.this_week.passage_lamps.is_empty(),
                Found::Place { .. } | Found::Breach { .. } => false,
            })
            .map(|(key, _)| key)
            .collect();
        for key in due {
            self.keep_lore(&key);
        }
    }

    /// Whether a quest's task, by their ids, is done: its road is done, or walked past it.
    fn task_done(&self, quest: &str, task: &str) -> bool {
        let Some(road) = self.quests.roads.get(quest) else { return false };
        let Some(def) = quests().quests.iter().find(|def| def.id == quest) else { return false };
        let at = |id: &str| def.tasks.iter().position(|it| it.id == id || it.was.iter().any(|was| was == id));
        road.done || at(task).zip(at(&road.task)).is_some_and(|(task, walked)| task < walked)
    }
}
