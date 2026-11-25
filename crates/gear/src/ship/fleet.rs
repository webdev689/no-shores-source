//! The ships a player keeps and the one they sail: each hull by its number (sailing's, 0 the Sloop to 3 the Frigate),
//! its name and its dress, a dress kept for each of its four parts (its hull's paint, the stripe along its gunports,
//! its canvas, its flag). A new player keeps none until the Harbourmaster hands over the Sloop in the welcome; a save
//! from before fleets keeps the Sloop. What each hull costs and the words a ship is named from are
//! `content/gear/shipyard.json`'s, the dresses `content/gear/ship_dress.json`'s.

use crate::character::{Character, UnknownKeys};
use crate::emblems::Source;
use crate::rarity::Rarity;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// The Sloop's number, the first ship, which the Harbourmaster hands over.
pub const SLOOP: u8 = 0;

/// A hull as the shipyard sells it: its key in the ships manifest, whether it is given rather than sold, its price in
/// Aurem and the ship's own materials (Timber, Canvas, Iron, Heartwood), and the ship level it is sold from.
#[derive(Clone, Debug, Deserialize)]
pub struct HullDef {
    pub hull: String,
    pub given: bool,
    pub aurem: u32,
    pub level: u8,
    pub timber: u16,
    pub canvas: u16,
    pub iron: u16,
    pub heartwood: u16,
}

/// The shipyard: its hulls in sailing's order, what a name after the first costs, and the two lists a ship's name is
/// made from.
#[derive(Clone, Debug, Deserialize)]
pub struct Shipyard {
    pub hulls: Vec<HullDef>,
    pub renaming: u32,
    pub first: Vec<String>,
    pub second: Vec<String>,
}

/// The shipyard as `content/gear/shipyard.json` has it.
///
/// # Panics
/// Never for the file in the repository: its test reads it.
#[must_use]
pub fn shipyard() -> &'static Shipyard {
    static READ: OnceLock<Shipyard> = OnceLock::new();
    READ.get_or_init(|| {
        serde_json::from_str(include_str!("../../../../content/gear/shipyard.json"))
            .expect("content/gear/shipyard.json reads: its test says so")
    })
}

/// Which part of a ship a dress is laid on.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Part {
    Paint,
    Stripe,
    Canvas,
    Flag,
}

impl Part {
    pub const ALL: [Part; 4] = [Part::Paint, Part::Stripe, Part::Canvas, Part::Flag];
}

/// A dress as the catalogue holds it: what the page draws of it is the page's.
#[derive(Clone, Debug, Deserialize)]
pub struct DressDef {
    pub id: String,
    pub part: Part,
    pub name: String,
    pub rarity: Rarity,
    pub source: Source,
}

#[derive(Deserialize)]
struct DressFile {
    dress: Vec<DressDef>,
}

/// Every dress, in `content/gear/ship_dress.json`'s order, which the wire numbers them by.
///
/// # Panics
/// Never for the file in the repository: its test reads it.
#[must_use]
pub fn dresses() -> &'static [DressDef] {
    static READ: OnceLock<Vec<DressDef>> = OnceLock::new();
    READ.get_or_init(|| {
        let file: DressFile = serde_json::from_str(include_str!("../../../../content/gear/ship_dress.json"))
            .expect("content/gear/ship_dress.json reads: its test says so");
        file.dress
    })
}

/// A dress's number, from its id.
#[must_use]
pub fn dress_number(id: &str) -> Option<u16> {
    dresses().iter().position(|found| found.id == id).and_then(|at| u16::try_from(at).ok())
}

/// The dress every ship is built in for a part: its start entry.
#[must_use]
pub fn built(part: Part) -> &'static str {
    let start = dresses().iter().find(|found| found.part == part && found.source == Source::Start);
    start.map_or("", |found| found.id.as_str())
}

/// A ship's dress, a dress's id for each part.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Dress {
    pub paint: String,
    pub stripe: String,
    pub canvas: String,
    pub flag: String,
    #[serde(flatten)]
    pub unknown: UnknownKeys,
}

impl Default for Dress {
    fn default() -> Self {
        Dress {
            paint: built(Part::Paint).to_owned(),
            stripe: built(Part::Stripe).to_owned(),
            canvas: built(Part::Canvas).to_owned(),
            flag: built(Part::Flag).to_owned(),
            unknown: UnknownKeys::new(),
        }
    }
}

impl Dress {
    /// The dress laid on a part.
    #[must_use]
    pub fn on(&self, part: Part) -> &str {
        match part {
            Part::Paint => &self.paint,
            Part::Stripe => &self.stripe,
            Part::Canvas => &self.canvas,
            Part::Flag => &self.flag,
        }
    }

    pub(crate) fn on_mut(&mut self, part: Part) -> &mut String {
        match part {
            Part::Paint => &mut self.paint,
            Part::Stripe => &mut self.stripe,
            Part::Canvas => &mut self.canvas,
            Part::Flag => &mut self.flag,
        }
    }

    /// Each part's dress by its number, in `Part::ALL`'s order; a part whose dress no longer reads is drawn as built.
    #[must_use]
    pub fn numbers(&self) -> [u16; 4] {
        Part::ALL.map(|part| dress_number(self.on(part)).or_else(|| dress_number(built(part))).unwrap_or_default())
    }
}

/// A ship kept: its hull's number, its name's two words (the first empty for none; both empty before it is named),
/// whether it has been named once (the first name is free), and its dress.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct KeptShip {
    pub hull: u8,
    #[serde(default)]
    pub name: [String; 2],
    #[serde(default)]
    pub named: bool,
    #[serde(default)]
    pub dress: Dress,
    #[serde(flatten)]
    pub unknown: UnknownKeys,
}

impl KeptShip {
    /// A ship of `hull` as the yard builds it: unnamed, dressed as built.
    #[must_use]
    pub fn new(hull: u8) -> Self {
        KeptShip { hull, name: Default::default(), named: false, dress: Dress::default(), unknown: UnknownKeys::new() }
    }

    /// Its name as a reader sees it, "the Grey Gull"; none before it is named.
    #[must_use]
    pub fn called(&self) -> Option<String> {
        let words: Vec<&str> = self.name.iter().map(String::as_str).filter(|word| !word.is_empty()).collect();
        (!words.is_empty()).then(|| format!("the {}", words.join(" ")))
    }

    /// Its name's two words by their places in the shipyard's lists, `NO_WORD` for none.
    #[must_use]
    pub fn name_numbers(&self) -> [u8; 2] {
        let place = |list: &[String], word: &str| {
            list.iter().position(|found| found == word).and_then(|at| u8::try_from(at).ok()).unwrap_or(NO_WORD)
        };
        [place(&shipyard().first, &self.name[0]), place(&shipyard().second, &self.name[1])]
    }
}

/// A word's place for none, in a ship's name.
pub const NO_WORD: u8 = u8::MAX;

/// A character's fleet as kept, read leniently: one of a shape this room cannot read keeps no ship, holding what was
/// kept (`unread`) so it is written back as it was, and the character is still read; its quests then say whether the
/// Sloop is due (`give_ship_due`).
///
/// # Errors
///
/// None the deserializer gives: any value is read.
pub fn lenient<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Fleet, D::Error> {
    let kept = serde_json::Value::deserialize(deserializer)?;
    Ok(Fleet::deserialize(&kept).unwrap_or_else(|_| {
        let mut unread = UnknownKeys::new();
        unread.insert("unread".to_owned(), kept);
        Fleet { unknown: unread, ..Fleet::none() }
    }))
}

/// The ships a player keeps, by hull, the one they sail, and the dresses they bought (each part's start entry and a
/// faction's dress at its rank are kept without being bought).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct Fleet {
    #[serde(default)]
    pub ships: Vec<KeptShip>,
    #[serde(default)]
    pub sailed: u8,
    #[serde(default)]
    pub dress: Vec<String>,
    #[serde(flatten)]
    pub unknown: UnknownKeys,
}

impl Fleet {
    /// A new player's: no ship.
    #[must_use]
    pub fn none() -> Self {
        Fleet { ships: Vec::new(), sailed: SLOOP, dress: Vec::new(), unknown: UnknownKeys::new() }
    }

    /// A save's from before fleets: the Sloop, sailed.
    #[must_use]
    pub fn kept_before() -> Self {
        Fleet { ships: vec![KeptShip::new(SLOOP)], ..Fleet::none() }
    }

    /// The ship of a hull kept, if any.
    #[must_use]
    pub fn kept(&self, hull: u8) -> Option<&KeptShip> {
        self.ships.iter().find(|ship| ship.hull == hull)
    }

    pub(crate) fn kept_mut(&mut self, hull: u8) -> Option<&mut KeptShip> {
        self.ships.iter_mut().find(|ship| ship.hull == hull)
    }

    /// The ship sailed: none for a player who keeps none.
    #[must_use]
    pub fn sailing(&self) -> Option<&KeptShip> {
        self.kept(self.sailed).or_else(|| self.ships.first())
    }

    /// As read from a save: each hull kept once and only those the shipyard has, in hull order, and a sailed hull
    /// that is kept (the first kept, for one that is not).
    pub fn keep_whole(&mut self) {
        let hulls = shipyard().hulls.len();
        self.ships.retain(|ship| usize::from(ship.hull) < hulls);
        self.ships.sort_by_key(|ship| ship.hull);
        self.ships.dedup_by_key(|ship| ship.hull);
        if self.kept(self.sailed).is_none() {
            self.sailed = self.ships.first().map_or(SLOOP, |ship| ship.hull);
        }
    }
}

impl Character {
    /// Each ship's dress as kept: a dress laid that the player does not keep, or laid on a part it is not for, is the
    /// part's start entry again.
    pub(crate) fn dress_kept(&mut self) {
        let unkept: Vec<(usize, Part)> = (self.fleet.ships.iter().enumerate())
            .flat_map(|(at, ship)| Part::ALL.into_iter().map(move |part| (at, part, ship.dress.on(part))))
            .filter(|(_, part, id)| {
                let fits = dresses().iter().any(|found| found.id == *id && found.part == *part);
                !fits || !self.keeps_dress(id)
            })
            .map(|(at, part, _)| (at, part))
            .collect();
        for (at, part) in unkept {
            if let Some(ship) = self.fleet.ships.get_mut(at) {
                built(part).clone_into(ship.dress.on_mut(part));
            }
        }
    }

    /// Whether the player keeps a ship at all.
    #[must_use]
    pub fn has_ship(&self) -> bool {
        !self.fleet.ships.is_empty()
    }

    /// The hull they sail, by its number; none before the Harbourmaster hands over their first.
    #[must_use]
    pub fn sailed_hull(&self) -> Option<u8> {
        self.fleet.sailing().map(|ship| ship.hull)
    }

    /// Whether the player keeps a dress: a part's start entry and a faction's at its rank always, the rest once bought.
    #[must_use]
    pub fn keeps_dress(&self, id: &str) -> bool {
        let Some(found) = dresses().iter().find(|found| found.id == id) else { return false };
        match found.source {
            Source::Start => true,
            Source::Faction { faction, rank } => self.rank(faction) >= rank,
            _ => self.fleet.dress.iter().any(|kept| kept == id),
        }
    }

    /// Hands a player who keeps no ship the Sloop, sailed and fitted with its first modules; one who keeps a ship is
    /// given nothing. Whether a ship was given.
    pub fn give_first_ship(&mut self) -> bool {
        if self.has_ship() {
            return false;
        }
        self.fleet.ships.push(KeptShip::new(SLOOP));
        self.fleet.sailed = SLOOP;
        self.fit_first_modules();
        true
    }
}
