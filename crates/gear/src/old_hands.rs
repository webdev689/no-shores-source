//! A character kept while players wore a main hand and an off hand, read once into the Melee and Ranged loadouts, so
//! nothing it held is lost. The main hand's piece takes its slot by kind: a sword, dagger or mace with a shield beside
//! it becomes its "& Shield", beside its twin their pair; a lone dagger becomes Double Daggers, an axe a Great axe. A
//! named weapon becomes its named kind's. An off-hand weapon left over is carried as its new kind. A shield is refunded as its dismantle materials, unless it is
//! a named one, which is made again as the named loadout it is now, with what its nodes cost given back. Carried and
//! vaulted pieces are read the same way, and a Vestige for either hand is one for Melee. A node bought on a piece whose
//! trait no longer fits it, as a shield's Bulwark on armour, is given back as it is read.

use crate::catalogue::catalogue;
use crate::character::{At, Character, Stuff};
use crate::dice::Dice;
use crate::grid::Cost;
use crate::item::{Item, NONE_CHOSEN};
use crate::kinds::Kind;
use crate::vestige::named_item;
use serde_json::{Map, Value};

const MAIN: &str = "main_hand";
const OFF: &str = "off_hand";

/// The shields an old character held, each read as the armour whose columns it had, and where it was.
#[derive(Debug, Default)]
pub(crate) struct Shields(Vec<(Item, At)>);

/// The kind an old piece becomes alone: a dagger Double Daggers, an axe a Great axe, a shield none; any other is as it
/// was.
fn alone(kind: &str) -> Option<&str> {
    match kind {
        "dagger" => Some("double_daggers"),
        "axe" => Some("great_axe"),
        "shield" => None,
        other => Some(other),
    }
}

/// The kind the main hand's piece becomes beside the off hand's.
fn beside<'kind>(main: &'kind str, off: Option<&str>) -> Option<&'kind str> {
    Some(match (main, off) {
        ("sword", Some("shield")) => "sword_and_shield",
        ("dagger", Some("shield")) => "dagger_and_shield",
        ("mace", Some("shield")) => "mace_and_shield",
        ("sword", Some("sword")) => "double_swords",
        ("dagger", Some("dagger")) => "double_daggers",
        ("mace", Some("mace")) => "double_mace",
        _ => return alone(main),
    })
}

fn text<'value>(value: &'value Value, pointer: &str) -> Option<&'value str> {
    value.pointer(pointer).and_then(Value::as_str)
}

/// Rewrites a kept character in the shape it is read in now, in place, taking out its shields; a character kept
/// since the loadouts reads as it was.
pub(crate) fn read(kept: &mut Value) -> Shields {
    let mut shields = Shields::default();
    if let Some(vestiges) = kept.get_mut("vestiges").and_then(Value::as_object_mut) {
        for slot in vestiges.values_mut().filter_map(|entry| entry.pointer_mut("/0/slot")) {
            if matches!(slot.as_str(), Some(MAIN | OFF)) {
                *slot = Value::from("melee");
            }
        }
    }
    let Some(items) = kept.get_mut("items").and_then(Value::as_object_mut) else { return shields };
    let worn = |hand: &str| items.iter().find(|(_, entry)| text(entry, "/1/Worn") == Some(hand));
    let off = worn(OFF).and_then(|(_, entry)| text(entry, "/0/kind")).map(str::to_owned);
    let main = worn(MAIN).and_then(|(_, entry)| text(entry, "/0/kind"));
    let main = main.and_then(|main| beside(main, off.as_deref())).map(str::to_owned);
    let main_key = worn(MAIN).map(|(key, _)| key.clone());
    let mut gone = Vec::new();
    for (key, entry) in items.iter_mut() {
        let Some([item, at]) = entry.as_array_mut().map(Vec::as_mut_slice) else { continue };
        let hand = text(at, "/Worn").filter(|hand| [MAIN, OFF].contains(hand)).map(str::to_owned);
        let kind = text(item, "/kind").unwrap_or_default().to_owned();
        let in_main = main_key.as_ref() == Some(key);
        // A named weapon takes its own kind now, whatever stood beside it: its name is one Legendary of that kind.
        let named = text(item, "/named").filter(|_| kind != "shield").and_then(|named| catalogue().named(named));
        let named =
            named.and_then(|def| serde_json::to_value(def.kind).ok()).and_then(|kind| kind.as_str().map(str::to_owned));
        let new = named.as_deref().or(if in_main { main.as_deref() } else { alone(&kind) });
        let Some(fields) = item.as_object_mut() else { continue };
        let Some(new) = new else {
            gone.push(key.clone());
            shields.take(fields, at);
            continue;
        };
        let Ok(slot) = serde_json::from_value::<Kind>(Value::from(new)).map(Kind::slot) else { continue };
        let slot = serde_json::to_value(slot).unwrap_or_default();
        fields.insert("kind".to_owned(), Value::from(new));
        fields.insert("bucket".to_owned(), slot.clone());
        if in_main {
            *at = Value::Object(Map::from_iter([("Worn".to_owned(), slot)]));
        } else if hand.is_some() {
            *at = Value::from("Carried");
        }
    }
    for key in gone {
        items.remove(&key);
    }
    shields
}

impl Shields {
    /// Keeps a shield as the armour whose columns and stock it had, to settle once the character is read.
    fn take(&mut self, fields: &mut Map<String, Value>, at: &Value) {
        fields.insert("kind".to_owned(), Value::from("torso"));
        fields.insert("bucket".to_owned(), Value::from("torso"));
        let at = if at.as_str() == Some("Vault") { At::Vault } else { At::Carried };
        if let Ok(item) = serde_json::from_value::<Item>(Value::Object(std::mem::take(fields))) {
            self.0.push((item, at));
        }
    }

    /// Settles the shields on the character read: a named one made again as its loadout, where it was (the vault, or
    /// carried), its XP kept and its nodes' cost given back; any other refunded as its dismantle materials.
    pub(crate) fn settle(self, character: &mut Character) {
        let resources = catalogue().resources.len();
        for (shield, at) in self.0 {
            let id = shield.id;
            let shield = shield.kept(id, resources);
            let named = shield.named.as_deref().and_then(|named| catalogue().named(named));
            let Some(def) = named.filter(|def| def.kind.weapon()) else {
                character.salvage(&shield, &Dice { seed: 0, tick: u64::from(shield.id), player: 0 });
                continue;
            };
            give_back(character, &shield, |_, _| true);
            let mut item = named_item(shield.id, def, def.kind.slot());
            item.xp = shield.xp.min(item.xp_most());
            character.items.insert(item.id, (item, at));
        }
    }
}

/// An item read with bought nodes whose traits no longer fit it, as armour kept with a shield's Bulwark from before
/// the loadouts: each such node given back once, for what it cost, and a choice of it cleared.
pub(crate) fn unfit(character: &mut Character, mut item: Item) -> Item {
    let content = catalogue();
    let fits = |id: &String| content.trait_fits(id, item.kind, item.named.as_deref());
    let misfits: Vec<(usize, u8)> = (item.columns().iter().enumerate())
        .flat_map(|(column, kind)| (0..kind.nodes()).map(move |node| (column, node)))
        .filter(|&(column, node)| item.has(column, node))
        .filter(|&(column, node)| item.traits_of(column).get(usize::from(node)).is_some_and(|id| !fits(id)))
        .collect();
    give_back(character, &item, |column, node| misfits.contains(&(column, node)));
    for (column, node) in misfits {
        item.bought &= !item.node_bit(column, node).unwrap_or(0);
        if item.chosen.get(column) == Some(&node) {
            item.chosen[column] = NONE_CHOSEN;
        }
    }
    item
}

/// Gives back what the nodes bought on an item cost, of those `which` picks by column and node.
fn give_back(character: &mut Character, item: &Item, which: impl Fn(usize, u8) -> bool) {
    let stock = item.kind.stock();
    let mut spent = Cost::default();
    for column in 0..item.columns().len() {
        let cost = item.cost_of(column);
        for _ in (0..item.columns()[column].nodes()).filter(|node| item.has(column, *node) && which(column, *node)) {
            spent.aurem = spent.aurem.saturating_add(cost.aurem);
            spent.fragments = spent.fragments.saturating_add(cost.fragments);
            spent.essence = spent.essence.saturating_add(cost.essence);
            spent.resource = spent.resource.saturating_add(cost.resource);
        }
    }
    let materials = &mut character.materials;
    materials.add_aurem(spent.aurem);
    if item.kind.module() {
        let price = crate::ship::materials::price_of(item.kind, spent);
        for (material, count) in price.0 {
            materials.ship.add(material, count);
        }
        return;
    }
    materials.add(Stuff::Fragments(stock), spent.fragments);
    materials.add(Stuff::Essence(stock), spent.essence);
    if let Some(resource) = item.resource {
        materials.add(Stuff::Resource(usize::from(resource)), spent.resource);
    }
}
