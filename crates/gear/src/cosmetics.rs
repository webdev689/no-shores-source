//! Cosmetics after Destiny's shaders and Sparrows, kept and worn as emblems are: a dye that colours the armour worn,
//! a coat for the horse and a barding worn over it. Each comes from the start, a faction's rank, or a vendor who sells
//! a few each day: the Tailor the dyes, the Tack the coats and bardings. What each looks like is the page's; here are
//! what they are and how they are had (`content/gear/cosmetics.json`).

use crate::asks::{Done, Here, Refusal};
use crate::character::Character;
use crate::dice::{Dice, Purpose};
use crate::emblems::Source;
use crate::rarity::Rarity;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// How many of its cosmetics each seller shows a day.
pub const SOLD_A_DAY: usize = 4;

/// What a cosmetic dresses.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CosmeticKind {
    Dye,
    Coat,
    Barding,
}

/// Who sells a kind of cosmetic.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Seller {
    Tailor,
    Tack,
}

impl CosmeticKind {
    #[must_use]
    pub fn seller(self) -> Seller {
        match self {
            CosmeticKind::Dye => Seller::Tailor,
            CosmeticKind::Coat | CosmeticKind::Barding => Seller::Tack,
        }
    }
}

/// A cosmetic as the catalogue holds it.
#[derive(Clone, Debug, Deserialize)]
pub struct CosmeticDef {
    pub id: String,
    pub kind: CosmeticKind,
    pub name: String,
    pub rarity: Rarity,
    pub source: Source,
}

#[derive(Deserialize)]
struct CosmeticsFile {
    cosmetics: Vec<CosmeticDef>,
}

/// Every cosmetic, in `content/gear/cosmetics.json`'s order, which the wire numbers them by.
///
/// # Panics
/// Never for the file in the repository: its test reads it.
#[must_use]
pub fn cosmetics() -> &'static [CosmeticDef] {
    static READ: OnceLock<Vec<CosmeticDef>> = OnceLock::new();
    READ.get_or_init(|| {
        let file: CosmeticsFile = serde_json::from_str(include_str!("../../../content/gear/cosmetics.json"))
            .expect("content/gear/cosmetics.json reads: its test says so");
        file.cosmetics
    })
}

/// A cosmetic's number, from its id.
#[must_use]
pub fn number_of(id: &str) -> Option<u16> {
    cosmetics().iter().position(|found| found.id == id).and_then(|at| u16::try_from(at).ok())
}

/// The cosmetic of a kind every player starts with and wears.
#[must_use]
pub fn starting(kind: CosmeticKind) -> String {
    let start = cosmetics().iter().find(|found| found.kind == kind && found.source == Source::Start);
    start.map(|found| found.id.clone()).unwrap_or_default()
}

/// The cosmetics a seller shows on a day, by number: a few of those they sell, the same for everyone that day.
#[must_use]
pub fn sold_on(seller: Seller, day: u64) -> Vec<u16> {
    let mut sold: Vec<u16> = (0..cosmetics().len())
        .filter(|&at| {
            let found = &cosmetics()[at];
            found.kind.seller() == seller && matches!(found.source, Source::Sold { .. })
        })
        .filter_map(|at| u16::try_from(at).ok())
        .collect();
    // A tick of their own, so no day's cosmetics share a roll with its emblems (`emblems::sold_on`, tick 0).
    let dice = Dice { seed: day, tick: 1 + seller as u64, player: 0 };
    for at in (1..sold.len()).rev() {
        let nth = u32::try_from(at).unwrap_or_default();
        sold.swap(at, dice.pick(Purpose::Cosmetic, nth, at + 1));
    }
    sold.truncate(SOLD_A_DAY);
    sold.sort_unstable();
    sold
}

/// The colours a character may show others among its dress's own dyes: each faction's own colour, by its key, whose
/// armour or weapon it wears, and a faction's dye, by its id, whose cape it wears.
#[must_use]
pub fn colours_shown(character: &crate::character::Character) -> Vec<String> {
    let numbers = crate::factions::factions();
    let mut shown: Vec<String> = crate::kinds::Slot::ALL
        .into_iter()
        .filter_map(|slot| character.worn(slot))
        .filter_map(|item| crate::catalogue::catalogue().named(item.named.as_deref()?))
        .filter_map(|named| {
            let faction = numbers.factions.iter().find(|faction| Some(&faction.key) == named.faction.as_ref())?;
            Some(if named.kind == crate::kinds::Kind::Cloak { faction.dye.clone() } else { faction.key.clone() })
        })
        .collect();
    shown.sort();
    shown.dedup();
    shown
}

/// A dress as a browser wrote it, with the dye, coat and barding worn put in its outfit, and none of a start piece,
/// and its own dyes keeping no faction's colour and no cosmetic dye but those `shown` allows (`colours_shown`): the
/// room's word on what others see, not the browser's. A dress that is not an object with an outfit is given back as
/// sent, for other pages to refuse.
#[must_use]
pub fn dressed(sent: &str, worn: &Cosmetics, shown: &[String]) -> String {
    let Ok(serde_json::Value::Object(mut dress)) = serde_json::from_str(sent) else { return sent.to_owned() };
    let Some(serde_json::Value::Object(outfit)) = dress.get_mut("outfit") else { return sent.to_owned() };
    if let Some(serde_json::Value::Object(dyes)) = outfit.get_mut("dyes") {
        let earned = |colour: &str| {
            let factions = &crate::factions::factions().factions;
            let named = factions.iter().any(|faction| faction.key == colour) || number_of(colour).is_some();
            !named || shown.iter().any(|allowed| allowed == colour)
        };
        dyes.retain(|_, colour| colour.as_str().is_none_or(earned));
    }
    for (key, kind) in [("dye", CosmeticKind::Dye), ("coat", CosmeticKind::Coat), ("barding", CosmeticKind::Barding)] {
        let piece = worn.worn(kind);
        if piece == starting(kind) {
            outfit.remove(key);
        } else {
            outfit.insert(key.to_owned(), serde_json::Value::String(piece.to_owned()));
        }
    }
    serde_json::Value::Object(dress).to_string()
}

/// The cosmetics a player keeps, by id, and the one of each kind they wear.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Cosmetics {
    pub kept: Vec<String>,
    pub dye: String,
    pub coat: String,
    pub barding: String,
    /// Keys this room does not know, from a later room's save, written back as read so a rollback loses nothing.
    #[serde(flatten)]
    pub unknown: crate::character::UnknownKeys,
}

impl Default for Cosmetics {
    fn default() -> Self {
        Cosmetics {
            kept: Vec::new(),
            dye: starting(CosmeticKind::Dye),
            coat: starting(CosmeticKind::Coat),
            barding: starting(CosmeticKind::Barding),
            unknown: crate::character::UnknownKeys::new(),
        }
    }
}

impl Cosmetics {
    /// The one of a kind worn.
    #[must_use]
    pub fn worn(&self, kind: CosmeticKind) -> &str {
        match kind {
            CosmeticKind::Dye => &self.dye,
            CosmeticKind::Coat => &self.coat,
            CosmeticKind::Barding => &self.barding,
        }
    }

    fn worn_mut(&mut self, kind: CosmeticKind) -> &mut String {
        match kind {
            CosmeticKind::Dye => &mut self.dye,
            CosmeticKind::Coat => &mut self.coat,
            CosmeticKind::Barding => &mut self.barding,
        }
    }
}

impl Character {
    /// Whether the player keeps a cosmetic.
    #[must_use]
    pub fn keeps_cosmetic(&self, id: &str) -> bool {
        self.cosmetics.kept.iter().any(|kept| kept == id)
    }

    /// Keeps a cosmetic, once.
    pub fn keep_cosmetic(&mut self, id: &str) {
        if !self.keeps_cosmetic(id) && number_of(id).is_some() {
            self.cosmetics.kept.push(id.to_owned());
            self.cosmetics.kept.sort_unstable();
        }
    }

    /// Keeps every cosmetic had from the start or a faction's rank reached, and wears the start's of a kind whose worn
    /// one is not kept.
    pub(crate) fn earn_cosmetics_due(&mut self) {
        let due: Vec<String> = cosmetics()
            .iter()
            .filter(|found| match found.source {
                Source::Start => true,
                Source::Faction { faction, rank } => self.rank(faction) >= rank,
                _ => false,
            })
            .map(|found| found.id.clone())
            .collect();
        for id in due {
            self.keep_cosmetic(&id);
        }
        for kind in [CosmeticKind::Dye, CosmeticKind::Coat, CosmeticKind::Barding] {
            let worn = self.cosmetics.worn(kind).to_owned();
            let fits = cosmetics().iter().any(|found| found.id == worn && found.kind == kind);
            if !fits || !self.keeps_cosmetic(&worn) {
                *self.cosmetics.worn_mut(kind) = starting(kind);
            }
        }
    }

    /// Wears a cosmetic the player keeps, in place of the one of its kind.
    pub(crate) fn wear_cosmetic(&mut self, number: u16) -> Result<Option<Done>, Refusal> {
        let found = cosmetics().get(usize::from(number)).ok_or(Refusal::NoSuchCosmetic)?;
        if !self.keeps_cosmetic(&found.id) {
            return Err(Refusal::NotKept);
        }
        self.cosmetics.worn_mut(found.kind).clone_from(&found.id);
        Ok(None)
    }

    /// Buys a cosmetic its seller shows today, at its price in Aurem, from the level it is sold at.
    pub(crate) fn buy_cosmetic(&mut self, number: u16, here: Here) -> Result<Option<Done>, Refusal> {
        let found = cosmetics().get(usize::from(number)).ok_or(Refusal::NoSuchCosmetic)?;
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let Source::Sold { aurem, level } = found.source else { return Err(Refusal::NotSold) };
        if !sold_on(found.kind.seller(), here.day).contains(&number) {
            return Err(Refusal::NotSold);
        }
        if self.keeps_cosmetic(&found.id) {
            return Err(Refusal::Kept);
        }
        if self.level() < level {
            return Err(Refusal::TooLow);
        }
        if self.materials.aurem < aurem {
            return Err(Refusal::Short);
        }
        self.materials.aurem -= aurem;
        self.keep_cosmetic(&found.id);
        Ok(None)
    }
}
