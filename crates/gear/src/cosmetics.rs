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

/// The colours a character may show others among its dress's own dyes, each on its own layers: a faction's own
/// colour, by its key, on the layers of each piece of that faction worn; a faction's dye, by its id, on the cape of
/// that faction worn; and a dye the player keeps, anywhere.
#[must_use]
pub fn colours_shown(character: &crate::character::Character) -> Vec<ShownColour> {
    let numbers = crate::factions::factions();
    let mut shown: Vec<ShownColour> = crate::kinds::Slot::ALL
        .into_iter()
        .filter_map(|slot| Some((slot, character.worn(slot)?)))
        .filter_map(|(slot, item)| Some((slot, crate::catalogue::catalogue().named(item.named.as_deref()?)?)))
        .filter_map(|(slot, named)| {
            let faction = numbers.factions.iter().find(|faction| Some(&faction.key) == named.faction.as_ref())?;
            let colour = if slot == crate::kinds::Slot::Cloak { &faction.dye } else { &faction.key };
            Some(ShownColour { colour: colour.clone(), on: layers_of(slot, named.kind) })
        })
        .collect();
    shown.extend(
        character
            .cosmetics
            .kept
            .iter()
            .filter(|kept| number_of(kept).is_some_and(|at| cosmetics()[usize::from(at)].kind == CosmeticKind::Dye))
            .map(|kept| ShownColour { colour: kept.clone(), on: &[""] }),
    );
    shown
}

/// A colour a character may show others among its dress's own dyes, and the layers it may stand on, each by the start
/// of their names.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShownColour {
    pub colour: String,
    pub on: &'static [&'static str],
}

/// The layers the forge draws a piece worn in `slot` with, by the start of their names, as the page dresses it: an
/// armour slot's pieces in any set and the padding under a cuirass or greaves, a weapon's own files, and the formal
/// cloak a faction's cape is drawn as: the page's names (`gearLooks.ts` `PIECES`, `gear.ts` `HELD`), which a page test
/// holds them to (`dressLayers.test.ts`).
#[must_use]
pub fn layers_of(slot: crate::kinds::Slot, kind: crate::kinds::Kind) -> &'static [&'static str] {
    use crate::kinds::{Kind, Slot};
    match (slot, kind) {
        (Slot::Head, _) => &["helm_"],
        (Slot::Torso, _) => &["cuirass_", "pauldrons_", "under_"],
        (Slot::Arms, _) => &["gauntlets_"],
        (Slot::Legs, _) => &["greaves_", "boots_", "under_"],
        (Slot::Cloak, _) => &["formal_cloak"],
        (_, Kind::SwordAndShield) => &["sword_", "shield_"],
        (_, Kind::DaggerAndShield) => &["dagger_", "shield_"],
        (_, Kind::MaceAndShield) => &["mace_", "shield_"],
        (_, Kind::DoubleDaggers) => &["dagger_"],
        (_, Kind::Sword | Kind::DoubleSwords | Kind::Greatsword) => &["sword_"],
        (_, Kind::Mace | Kind::DoubleMace) => &["mace_"],
        (_, Kind::GreatAxe) => &["axe_"],
        (_, Kind::Flail) => &["flail_"],
        (_, Kind::Warhammer) => &["warhammer_"],
        (_, Kind::Staff) => &["staff_"],
        (_, Kind::Bow) => &["bow_"],
        (_, Kind::Crossbow) => &["crossbow_"],
        // A plain gun's layer is the bare word (`pistolet`), a finer one's the word and its finish.
        (_, Kind::Pistolet | Kind::DoublePistolet) => &["pistolet"],
        (_, Kind::Thunderlock) => &["thunderlock"],
        (_, Kind::Head | Kind::Torso | Kind::Arms | Kind::Legs | Kind::Cloak) => &[],
        // A ship's modules are never worn on a figure.
        (_, Kind::Guns | Kind::Hull | Kind::Sails | Kind::Rigging) => &[],
    }
}

/// The lights a left hand may carry whatever is worn (`dressing.ts` `LIGHTS`): a light is no piece of gear.
const LIGHTS: [&str; 2] = ["torch_l", "lantern"];

/// A dress as a browser wrote it, if it reads as one: an object with an outfit that is one.
#[must_use]
pub fn read_dress(sent: &str) -> Option<serde_json::Map<String, serde_json::Value>> {
    match serde_json::from_str(sent) {
        Ok(serde_json::Value::Object(dress)) if dress.get("outfit").is_some_and(serde_json::Value::is_object) => {
            Some(dress)
        }
        _ => None,
    }
}

/// A dress as a browser wrote it, made the room's word on what others see, not the browser's: the dye, coat and
/// barding worn put in its outfit, and none of a start piece; its armour and the things in its hands only looks the
/// page could draw the pieces worn in on the dress's body (`looks::shown`), a light in the left hand kept; and its own dyes keeping a faction's
/// colour or a cosmetic dye only on a layer the character may show it on (`colours_shown`). None for a dress that
/// does not read.
#[must_use]
pub fn dressed(sent: &str, character: &Character) -> Option<String> {
    let mut dress = read_dress(sent)?;
    let body = dress.get("body").and_then(serde_json::Value::as_str).unwrap_or_default();
    let looks = crate::looks::shown(character, body);
    let serde_json::Value::Object(outfit) = dress.get_mut("outfit")? else { return None };
    if let Some(serde_json::Value::Object(armour)) = outfit.get_mut("armour") {
        armour.retain(|piece, set| set.as_str().is_some_and(|set| looks.armour.contains(&(piece.as_str(), set))));
    }
    for hand in ["right", "left"] {
        let held = outfit.get(hand).and_then(serde_json::Value::as_str);
        let kept = |layer: &str| looks.held.iter().any(|each| each == layer);
        if held.is_some_and(|layer| !kept(layer) && !(hand == "left" && LIGHTS.contains(&layer))) {
            outfit.insert(hand.to_owned(), serde_json::Value::Null);
        }
    }
    let shown = colours_shown(character);
    if let Some(serde_json::Value::Object(dyes)) = outfit.get_mut("dyes") {
        let earned = |layer: &str, colour: &str| {
            let factions = &crate::factions::factions().factions;
            let named = factions.iter().any(|faction| faction.key == colour) || number_of(colour).is_some();
            !named
                || shown
                    .iter()
                    .any(|allowed| allowed.colour == colour && allowed.on.iter().any(|on| layer.starts_with(on)))
        };
        dyes.retain(|layer, colour| colour.as_str().is_none_or(|colour| earned(layer, colour)));
    }
    for (key, kind) in [("dye", CosmeticKind::Dye), ("coat", CosmeticKind::Coat), ("barding", CosmeticKind::Barding)] {
        let piece = character.cosmetics.worn(kind);
        if piece == starting(kind) {
            outfit.remove(key);
        } else {
            outfit.insert(key.to_owned(), serde_json::Value::String(piece.to_owned()));
        }
    }
    Some(serde_json::Value::Object(dress).to_string())
}

/// The cosmetics a player keeps, by id, and the one of each kind they wear.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Cosmetics {
    pub kept: Vec<String>,
    pub dye: String,
    pub coat: String,
    pub barding: String,
    /// Keys this room does not know, from a later room's save, written back as read, so a room rolled back to
    /// this one or later keeps them.
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

impl crate::Character {
    /// Whether the character has a horse to ride: a coat worn, which every rider starts with
    /// ([[The Audit's Leftovers Are Fixed as Claude Suggested]]).
    #[must_use]
    pub fn may_ride(&self) -> bool {
        !self.cosmetics.coat.is_empty()
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
