//! What a worn piece may show others, as the room's word: the armour sets and the weapon and shield layers the page
//! could draw it in. A look is its content's (`content/gear/looks.json`, by the item's `Source`), the one written on a
//! named piece, or its faction's; where the forge does not draw it for the body (`content/forge/drawn.json`), the
//! page's fallback, the nearest of its own content's and then the nearest by worth, which the room lets stand. The page
//! chooses one of these by the piece's level, name and number (`gearLooks.ts`, `gear.ts`); the room keeps any of them.

use crate::catalogue::{NamedDef, catalogue};
use crate::character::Character;
use crate::factions::{FactionDef, factions};
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;
use crate::source::Source;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::sync::OnceLock;

/// One content's looks, lightest first.
#[derive(Deserialize)]
struct ContentLooks {
    armour: Vec<String>,
    metals: Vec<String>,
}

#[derive(Deserialize)]
struct LooksFile {
    sources: Vec<ContentLooks>,
}

/// What the forge draws for one body: each armour piece's sets, and the layers each hand may hold, in the page's order.
#[derive(Deserialize)]
struct Drawn {
    sets: BTreeMap<String, Vec<String>>,
    right: Vec<String>,
    left: Vec<String>,
}

/// The forge's armour sets by worth, as the page falls along them (`gearLooks.ts` `SETS`).
const SETS: [&str; 14] = [
    "leather",
    "thieves",
    "chain",
    "iron",
    "steel",
    "knights",
    "silver",
    "elven",
    "dwarven",
    "orcish",
    "mithril",
    "adamantium",
    "ebony",
    "daedric",
];
/// The forge's weapon metals by worth (`gear.ts` `WORTH`).
const WORTH: [&str; 10] =
    ["iron", "steel", "silver", "elven", "dwarven", "orcish", "mithril", "adamantium", "ebony", "daedric"];
/// Where a world Rare piece starts on the world's sets: past its Magic leather and the thieves'.
const WORLD_RARE_FROM: usize = 2;

fn content(source: Source) -> &'static ContentLooks {
    static READ: OnceLock<LooksFile> = OnceLock::new();
    let looks = READ.get_or_init(|| {
        serde_json::from_str(include_str!("../../../content/gear/looks.json"))
            .expect("content/gear/looks.json reads: its test says so")
    });
    looks.sources.get(source as usize).unwrap_or(&looks.sources[0])
}

fn drawn(body: &str) -> Option<&'static Drawn> {
    static READ: OnceLock<BTreeMap<String, Drawn>> = OnceLock::new();
    READ.get_or_init(|| {
        serde_json::from_str(include_str!("../../../content/forge/drawn.json"))
            .expect("content/forge/drawn.json reads: its test says so")
    })
    .get(body)
}

/// Each armour slot's pieces of a set.
#[must_use]
pub fn pieces(slot: Slot) -> &'static [&'static str] {
    match slot {
        Slot::Head => &["helm"],
        Slot::Torso => &["cuirass", "pauldrons"],
        Slot::Arms => &["gauntlets"],
        Slot::Legs => &["greaves", "boots"],
        _ => &[],
    }
}

/// What a character's worn gear may show others on `body`: each armour piece with a set it may be drawn in, and each
/// weapon or shield layer its hands may hold.
#[derive(Debug)]
pub struct Shown {
    pub armour: Vec<(&'static str, &'static str)>,
    pub held: Vec<String>,
}

/// What `character` may show others on `body` (`Shown`).
#[must_use]
pub fn shown(character: &Character, body: &str) -> Shown {
    let body = drawn(body);
    let mut shown = Shown { armour: Vec::new(), held: Vec::new() };
    for (slot, item) in character.all_worn() {
        for set in armour_sets(item, slot, body) {
            shown.armour.extend(pieces(slot).iter().map(|piece| (*piece, set)));
        }
        if let Some(body) = body {
            shown.held.extend(held_layers(item, body));
        }
    }
    shown
}

fn named(item: &Item) -> Option<&'static NamedDef> {
    catalogue().named(item.named.as_deref()?)
}

fn faction(item: &Item) -> Option<&'static FactionDef> {
    let key = named(item)?.faction.as_ref()?;
    factions().factions.iter().find(|faction| &faction.key == key)
}

/// A rolled item's rung on a ladder of looks, as the page counts it (`gear.ts` `rung`).
fn rung(item: &Item, start: usize, climb: usize, spread: usize) -> usize {
    let level = usize::from(item.level.clamp(1, 20)) - 1;
    start + (level * climb * 2 + 19) / 38 + usize::from(item.name) % spread
}

/// `ladder` nearest first from rung `from`, the lesser first at one distance.
fn nearest<'a>(ladder: &[&'a str], from: usize) -> Vec<&'a str> {
    let mut sorted = ladder.to_vec();
    sorted.sort_by_key(|each| ladder.iter().position(|one| one == each).unwrap_or(0).abs_diff(from));
    sorted
}

/// `ladder` nearest first from `look`, or from its first rung when it holds no such look.
fn nearest_to<'a>(ladder: &[&'a str], look: &str) -> Vec<&'a str> {
    nearest(ladder, ladder.iter().position(|each| *each == look).unwrap_or(0))
}

/// The sets an armour piece worn in `slot` may be drawn in: its faction's, the look written on it, or its content's
/// by its rarity (none for a Normal piece's clothes); and for each the forge does not draw on `body`, the one the page
/// falls to.
fn armour_sets(item: &Item, slot: Slot, body: Option<&'static Drawn>) -> Vec<&'static str> {
    if pieces(slot).is_empty() || item.rarity == Rarity::Normal {
        return Vec::new();
    }
    let own: Vec<&'static str> = content(item.source).armour.iter().map(String::as_str).collect();
    let world = item.source == Source::World;
    let faction = faction(item);
    let looks: Vec<&'static str> = if let Some(faction) = faction {
        vec![&faction.gear.armour]
    } else if let Some(look) = named(item).and_then(|named| named.look.as_deref()) {
        vec![look]
    } else if item.rarity == Rarity::Magic {
        own[..own.len().min(if world { WORLD_RARE_FROM } else { 1 })].to_vec()
    } else {
        own[if world { WORLD_RARE_FROM.min(own.len()) } else { 0 }..].to_vec()
    };
    // The page sets a torso by its cuirass alone, its pauldrons only where drawn.
    let needed = if slot == Slot::Torso { &["cuirass"][..] } else { pieces(slot) };
    let is_drawn = |set: &str| {
        body.is_some_and(|body| {
            needed.iter().all(|piece| body.sets.get(*piece).is_some_and(|sets| sets.iter().any(|s| s == set)))
        })
    };
    let mut sets = looks.clone();
    for look in looks.into_iter().filter(|look| !is_drawn(look)) {
        let fallen = if faction.is_some() {
            nearest(&SETS, rung(item, 2, 9, 3))
        } else {
            let mine = nearest_to(&own, look);
            let rest = nearest_to(&SETS, look).into_iter().filter(|each| !mine.contains(each));
            mine.iter().copied().chain(rest).collect()
        };
        sets.extend(fallen.into_iter().find(|set| is_drawn(set)));
    }
    sets
}

/// What a hand holds of a weapon kind: its weapon's word, and in the left hand its pair, its shield, or nothing.
#[derive(PartialEq)]
enum Left {
    Pair,
    Shield,
    Empty,
}

fn held_of(kind: Kind) -> Option<(&'static str, Left)> {
    Some(match kind {
        Kind::SwordAndShield => ("sword", Left::Shield),
        Kind::DaggerAndShield => ("dagger", Left::Shield),
        Kind::MaceAndShield => ("mace", Left::Shield),
        Kind::DoubleDaggers => ("dagger", Left::Pair),
        Kind::DoubleSwords => ("sword", Left::Pair),
        Kind::DoubleMace => ("mace", Left::Pair),
        Kind::DoublePistolet => ("pistolet", Left::Pair),
        Kind::Sword | Kind::Greatsword => ("sword", Left::Empty),
        Kind::Mace => ("mace", Left::Empty),
        Kind::GreatAxe => ("axe", Left::Empty),
        Kind::Flail => ("flail", Left::Empty),
        Kind::Warhammer => ("warhammer", Left::Empty),
        Kind::Staff => ("staff", Left::Empty),
        Kind::Bow => ("bow", Left::Empty),
        Kind::Crossbow => ("crossbow", Left::Empty),
        Kind::Pistolet => ("pistolet", Left::Empty),
        Kind::Thunderlock => ("thunderlock", Left::Empty),
        _ => return None,
    })
}

/// The shield kinds a rolled weapon carries, one by its number (`gear.ts` `SHIELDS`).
fn shields(kind: Kind) -> &'static [&'static str] {
    match kind {
        Kind::SwordAndShield => &["kite", "round", "tower"],
        Kind::DaggerAndShield => &["buckler", "round", "kite"],
        Kind::MaceAndShield => &["round", "kite", "tower"],
        _ => &[],
    }
}

/// The weapon and shield layers a weapon may be held as on `body`: each metal and make the page could give it
/// (`gear.ts` `weaponLook`), each in the layer the forge draws or the one the page falls to (`layer_for`).
fn held_layers(item: &Item, body: &Drawn) -> Vec<String> {
    let Some((word, left)) = held_of(item.kind) else { return Vec::new() };
    let named = named(item);
    let faction = faction(item).map(|faction| faction.gear.metal.as_str());
    let written = named.and_then(|named| named.look.as_deref());
    let gun = matches!(item.kind, Kind::Pistolet | Kind::DoublePistolet | Kind::Thunderlock);
    let normal = item.rarity == Rarity::Normal;
    let metals: Vec<&str> = match faction.or(written) {
        Some(metal) => vec![metal],
        None if gun => vec![if item.rarity >= Rarity::Legendary { "gilded" } else { "plain" }],
        None if normal => vec![WORTH[rung(item, 0, 1, 1)]],
        None => content(item.source).metals.iter().map(String::as_str).collect(),
    };
    let makes: Vec<Option<&str>> = match named.and_then(|named| named.make.as_deref()) {
        Some(make) => vec![Some(make)],
        None if !shields(item.kind).is_empty() => shields(item.kind).iter().map(|make| Some(*make)).collect(),
        None if item.kind == Kind::Bow => vec![Some("long"), Some("short")],
        None => vec![None],
    };
    // A faction's metal and a Normal weapon's plain iron or steel fall along the ladder; any other first to its content's.
    let own: Vec<&str> = if faction.is_some() || normal {
        Vec::new()
    } else {
        content(item.source).metals.iter().map(String::as_str).collect()
    };
    let mut layers = Vec::new();
    for metal in &metals {
        let drawn = if *metal == "plain" { "" } else { metal };
        for make in &makes {
            let hand_make = if left == Left::Shield { None } else { *make };
            layers.extend(layer_for(&body.right, word, hand_make, drawn, false, &own));
            match left {
                Left::Pair => layers.extend(layer_for(&body.left, word, hand_make, drawn, true, &own)),
                Left::Shield => {
                    // A Normal shield is plain or iron to level 10, its weapon's metal past it.
                    let shield_metals: &[&str] = if normal && item.level <= 10 { &["plain", "iron"] } else { &[metal] };
                    for shield in shield_metals {
                        layers.extend(layer_for(&body.left, "shield", *make, shield, false, &own));
                    }
                }
                Left::Empty => {}
            }
        }
    }
    layers
}

/// The layer the page draws a hand's `kind` of `make` and `metal` as among `choices` (`gear.ts` `layerFor`): its own
/// metal, else its content's (`own`) nearest first, else any other's, else the first of its kind the forge draws.
fn layer_for(
    choices: &[String],
    kind: &str,
    make: Option<&str>,
    metal: &str,
    left: bool,
    own: &[&str],
) -> Option<String> {
    let ladder = if WORTH.contains(&metal) { nearest_to(&WORTH, metal) } else { vec![metal] };
    let (first, rest) = ladder.split_first()?;
    let metals = std::iter::once(*first)
        .chain(rest.iter().copied().filter(|each| own.contains(each)))
        .chain(rest.iter().copied().filter(|each| !own.contains(each)));
    let end = if left { "_l" } else { "" };
    for each in metals {
        // The forge names a short sword after its metal (`sword_orcish_short`), a bow's or a shield's make before it.
        let parts = if kind == "sword" { [Some(kind), Some(each), make] } else { [Some(kind), make, Some(each)] };
        let layer = parts.into_iter().flatten().filter(|part| !part.is_empty()).collect::<Vec<_>>().join("_") + end;
        if choices.contains(&layer) {
            return Some(layer);
        }
    }
    choices.iter().find(|layer| layer.starts_with(&format!("{kind}_")) && layer.ends_with("_l") == left).cloned()
}
