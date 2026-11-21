//! The gear's content, authored in `content/gear/` and built into the rules, so the server and every browser read
//! the same: each trait and what it fits, the named Legendaries, Atherics and cloaks with their nodes' traits, each
//! island's resource, and the names a rolled item may take. `problems` lists anything in it the rules cannot keep.

use crate::grid::{Column, columns};
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

/// Which kind of column a trait is offered in.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TraitColumn {
    Handling,
    Finish,
    Perk,
    Signature,
    /// An Atheric's intrinsic: always on while it is worn, never a node.
    Intrinsic,
}

/// A trait a node may hold: its id, name and words, the column it is offered in, and what it fits: `melee`,
/// `ranged`, `weapon` (either loadout), `armour`, `shield` (a loadout with a shield, for a shield's block perks), `ship`
/// (any of a ship's modules) or one module's own (`guns`, `hull`, `sails`, `rigging`), or for a signature the one
/// named item that carries it, and an intrinsic the one Atheric that has it.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct TraitDef {
    pub id: String,
    pub name: String,
    pub column: TraitColumn,
    pub fits: String,
    pub words: String,
}

/// A named item: a Legendary, an Atheric or a cloak. Its layout is the traits each of its trait columns offers, in
/// order; its resource is the island's its nodes ask for. A Breach's armour climbs further in Prestige. An Atheric
/// weapon or module has an intrinsic, a trait always on while it is worn, beside its own node. Its look (`look`,
/// `make`) is the browser's alone.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct NamedDef {
    pub id: String,
    pub name: String,
    pub kind: Kind,
    pub rarity: Rarity,
    #[serde(default)]
    pub resource: Option<String>,
    pub words: String,
    pub layout: Vec<Vec<String>>,
    #[serde(default)]
    pub breach: bool,
    /// The faction that sells it, by the faction's key: its cape, armour and weapons, which nothing else gives.
    #[serde(default)]
    pub faction: Option<String>,
    #[serde(default)]
    pub intrinsic: Option<String>,
}

/// An island's resource, gathered in its patrol areas.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Resource {
    pub id: String,
    pub name: String,
    pub continent: String,
    pub words: String,
}

/// The names a rolled item of a kind may take, by rarity.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize)]
pub struct Names {
    pub normal: Vec<String>,
    pub magic: Vec<String>,
    pub rare: Vec<String>,
}

/// Everything in `content/gear/`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Catalogue {
    pub traits: Vec<TraitDef>,
    pub items: Vec<NamedDef>,
    pub resources: Vec<Resource>,
    pub names: BTreeMap<Kind, Names>,
}

#[derive(Deserialize)]
struct TraitsFile {
    traits: Vec<TraitDef>,
}

#[derive(Deserialize)]
struct ItemsFile {
    items: Vec<NamedDef>,
}

#[derive(Deserialize)]
struct ResourcesFile {
    resources: Vec<Resource>,
}

#[derive(Deserialize)]
struct RolledFile {
    names: BTreeMap<Kind, Names>,
}

/// The catalogue built into the rules, read once.
///
/// # Panics
///
/// Never for the content in the repository, which `the_catalogue_reads_and_keeps_every_rule` reads.
#[must_use]
pub fn catalogue() -> &'static Catalogue {
    static READ: OnceLock<Catalogue> = OnceLock::new();
    READ.get_or_init(|| {
        Catalogue::parse(
            include_str!("../../../content/gear/traits.json"),
            include_str!("../../../content/gear/items.json"),
            include_str!("../../../content/gear/resources.json"),
            include_str!("../../../content/gear/rolled.json"),
        )
        .expect("content/gear reads: its test says so")
    })
}

impl Catalogue {
    /// The catalogue from its four files' text.
    ///
    /// # Errors
    ///
    /// The first file that is not the shape the rules read, and why.
    pub fn parse(traits: &str, items: &str, resources: &str, rolled: &str) -> Result<Self, String> {
        let read = |file: &str, error: serde_json::Error| format!("content/gear/{file}: {error}");
        Ok(Self {
            traits: serde_json::from_str::<TraitsFile>(traits).map_err(|error| read("traits.json", error))?.traits,
            items: serde_json::from_str::<ItemsFile>(items).map_err(|error| read("items.json", error))?.items,
            resources: serde_json::from_str::<ResourcesFile>(resources)
                .map_err(|error| read("resources.json", error))?
                .resources,
            names: serde_json::from_str::<RolledFile>(rolled).map_err(|error| read("rolled.json", error))?.names,
        })
    }

    #[must_use]
    pub fn trait_def(&self, id: &str) -> Option<&TraitDef> {
        self.traits.iter().find(|found| found.id == id)
    }

    /// Whether a trait fits an item of this kind, the named one it is if any: what a roll offers it and what a worn
    /// piece gives by the same rule.
    #[must_use]
    pub fn trait_fits(&self, id: &str, kind: Kind, named: Option<&str>) -> bool {
        self.trait_def(id).is_some_and(|found| fits(found, kind, named))
    }

    #[must_use]
    pub fn named(&self, id: &str) -> Option<&NamedDef> {
        self.items.iter().find(|found| found.id == id)
    }

    /// A resource's place in the list, which is how a player's stock of it is kept.
    #[must_use]
    pub fn resource_index(&self, id: &str) -> Option<usize> {
        self.resources.iter().position(|found| found.id == id)
    }

    /// The names a rolled item of this kind and rarity may take; none for a named rarity.
    #[must_use]
    pub fn names_of(&self, kind: Kind, rarity: Rarity) -> &[String] {
        let Some(names) = self.names.get(&kind) else { return &[] };
        match rarity {
            Rarity::Normal => &names.normal,
            Rarity::Magic => &names.magic,
            Rarity::Rare => &names.rare,
            Rarity::Legendary | Rarity::Atheric => &[],
        }
    }

    /// The traits a rolled item of this kind may be offered in a column: those of the column's kind that fit it.
    #[must_use]
    pub fn pool(&self, column: Column, kind: Kind) -> Vec<&TraitDef> {
        let wanted = match column {
            Column::Handling(_) => TraitColumn::Handling,
            Column::Finish(_) => TraitColumn::Finish,
            Column::Perk(_) => TraitColumn::Perk,
            Column::Upgrade | Column::Signature => return Vec::new(),
        };
        self.traits.iter().filter(|found| found.column == wanted && fits(found, kind, None)).collect()
    }

    /// The named items a Vestige of this rarity may open to in this slot: Breach items come from Breaches alone, and a
    /// faction's from its counter alone.
    pub fn vestige_pool(&self, rarity: Rarity, slot: Slot) -> impl Iterator<Item = &NamedDef> {
        self.items.iter().filter(move |found| {
            found.rarity == rarity && !found.breach && found.faction.is_none() && found.kind.fits(slot)
        })
    }

    /// What in the catalogue the rules cannot keep, each said in a line; none when all is well.
    #[must_use]
    pub fn problems(&self) -> Vec<String> {
        let mut problems = Vec::new();
        duplicates("trait", self.traits.iter().map(|found| found.id.as_str()), &mut problems);
        duplicates("item", self.items.iter().map(|found| found.id.as_str()), &mut problems);
        duplicates("resource", self.resources.iter().map(|found| found.id.as_str()), &mut problems);
        for item in &self.items {
            self.item_problems(item, &mut problems);
        }
        for signature in self.traits.iter().filter(|found| found.column == TraitColumn::Signature) {
            let carried = self.items.iter().filter(|item| item.layout.iter().flatten().any(|id| *id == signature.id));
            if carried.map(|item| item.id.as_str()).ne([signature.fits.as_str()]) {
                problems.push(format!("signature {} must be carried by {} alone", signature.id, signature.fits));
            }
        }
        for intrinsic in self.traits.iter().filter(|found| found.column == TraitColumn::Intrinsic) {
            let carried = self.items.iter().filter(|item| item.intrinsic.as_deref() == Some(intrinsic.id.as_str()));
            if carried.map(|item| item.id.as_str()).ne([intrinsic.fits.as_str()]) {
                problems.push(format!("intrinsic {} must be carried by {} alone", intrinsic.id, intrinsic.fits));
            }
        }
        for kind in Kind::ALL.into_iter().filter(|kind| *kind != Kind::Cloak) {
            self.kind_problems(kind, &mut problems);
        }
        for kind in Kind::ALL.into_iter().filter(|kind| kind.weapon()) {
            // A faction's piece is sold at its counter alone, so it is no Legendary a Vestige, Shape or package gives.
            let found =
                |item: &&NamedDef| item.kind == kind && item.rarity == Rarity::Legendary && item.faction.is_none();
            if !self.items.iter().any(|item| found(&item)) {
                problems.push(format!("no Legendary {kind:?}"));
            }
        }
        for slot in Slot::VESTIGE.into_iter().chain(Slot::SHIP) {
            for rarity in [Rarity::Legendary, Rarity::Atheric] {
                if self.vestige_pool(rarity, slot).next().is_none() {
                    problems.push(format!("no {rarity:?} item found for {slot:?}"));
                }
            }
        }
        problems
    }

    fn item_problems(&self, item: &NamedDef, problems: &mut Vec<String>) {
        let id = &item.id;
        let known = |key: &str| crate::factions::factions().factions.iter().any(|faction| faction.key == key);
        if item.faction.as_deref().is_some_and(|key| !known(key)) {
            problems.push(format!("{id}: its faction is none the factions' file holds"));
        }
        if item.kind == Kind::Cloak {
            if !item.layout.is_empty() || item.resource.is_some() {
                problems.push(format!("cloak {id} has no nodes and asks for no resource"));
            }
            return;
        }
        if !item.rarity.named() {
            problems.push(format!("{id}: only Legendaries, Atherics and cloaks are named"));
        }
        if item.breach && !(item.kind.armour() && item.rarity == Rarity::Legendary) {
            problems.push(format!("{id}: only a Legendary's armour comes from a Breach"));
        }
        // A module's nodes ask for ship materials, never an island's resource.
        let resource = item.resource.as_deref().map(|resource| self.resource_index(resource).is_some());
        if item.kind.module() && resource.is_some() {
            problems.push(format!("{id}: a module asks for ship materials, not a resource"));
        } else if !item.kind.module() && resource != Some(true) {
            problems.push(format!("{id}: its resource is none the catalogue holds"));
        }
        let atheric = item.rarity == Rarity::Atheric && (item.kind.weapon() || item.kind.module());
        match item.intrinsic.as_deref().map(|found| self.trait_def(found)) {
            Some(_) if !atheric => problems.push(format!("{id}: only an Atheric weapon or module has an intrinsic")),
            Some(None) => problems.push(format!("{id}: no trait {}", item.intrinsic.as_deref().unwrap_or(""))),
            Some(Some(found)) if found.column != TraitColumn::Intrinsic || !fits(found, item.kind, Some(id)) => {
                problems.push(format!("{id}: {} is no intrinsic of its own", found.id));
            }
            _ => {}
        }
        if item.rarity == Rarity::Atheric && item.kind.weapon() && item.intrinsic.is_none() {
            problems.push(format!("{id}: an Atheric weapon has an intrinsic"));
        }
        let wanted: Vec<Column> =
            columns(item.rarity, item.kind.weapon_grid()).iter().copied().filter(|column| column.traits()).collect();
        if wanted.len() != item.layout.len() {
            problems.push(format!("{id}: {} trait columns, its rarity has {}", item.layout.len(), wanted.len()));
            return;
        }
        let mut seen = BTreeSet::new();
        for (column, offered) in wanted.into_iter().zip(&item.layout) {
            if offered.len() != usize::from(column.nodes()) {
                problems.push(format!("{id}: a {column:?} column offers {} traits", offered.len()));
            }
            for trait_id in offered {
                if !seen.insert(trait_id.as_str()) {
                    problems.push(format!("{id}: {trait_id} is offered twice"));
                }
                match self.trait_def(trait_id) {
                    Some(found) if column_kind(column) == Some(found.column) && fits(found, item.kind, Some(id)) => {}
                    Some(_) => problems.push(format!("{id}: {trait_id} does not belong in a {column:?} column")),
                    None => problems.push(format!("{id}: no trait {trait_id}")),
                }
            }
        }
    }

    fn kind_problems(&self, kind: Kind, problems: &mut Vec<String>) {
        for rarity in [Rarity::Normal, Rarity::Magic, Rarity::Rare] {
            if self.names_of(kind, rarity).is_empty() {
                problems.push(format!("no names for a {rarity:?} {kind:?}"));
            }
            // A rolled item never offers one trait twice, so each pool must hold its rarity's trait nodes.
            let mut needed: BTreeMap<TraitColumn, usize> = BTreeMap::new();
            for column in columns(rarity, kind.weapon_grid()) {
                if let Some(found) = column_kind(*column) {
                    *needed.entry(found).or_default() += usize::from(column.nodes());
                }
            }
            for (found, count) in needed {
                let pooled = self.traits.iter().filter(|each| each.column == found && fits(each, kind, None)).count();
                if pooled < count {
                    problems.push(format!("a {rarity:?} {kind:?} needs {count} {found:?} traits, there are {pooled}"));
                }
            }
        }
    }
}

fn column_kind(column: Column) -> Option<TraitColumn> {
    match column {
        Column::Upgrade => None,
        Column::Handling(_) => Some(TraitColumn::Handling),
        Column::Finish(_) => Some(TraitColumn::Finish),
        Column::Perk(_) => Some(TraitColumn::Perk),
        Column::Signature => Some(TraitColumn::Signature),
    }
}

/// Whether a trait fits an item of this kind; a signature or an intrinsic fits only the named item it belongs to.
fn fits(found: &TraitDef, kind: Kind, named: Option<&str>) -> bool {
    match found.fits.as_str() {
        "melee" => kind.weapon() && !kind.ranged(),
        "ranged" => kind.ranged(),
        "weapon" => kind.weapon(),
        "armour" => kind.armour(),
        "shield" => kind.shielded(),
        "ship" => kind.module(),
        "guns" => kind == Kind::Guns,
        "hull" => kind == Kind::Hull,
        "sails" => kind == Kind::Sails,
        "rigging" => kind == Kind::Rigging,
        item => named == Some(item),
    }
}

fn duplicates<'ids>(what: &str, ids: impl Iterator<Item = &'ids str>, problems: &mut Vec<String>) {
    let mut seen = BTreeSet::new();
    for id in ids {
        if !seen.insert(id) {
            problems.push(format!("{what} {id} is listed twice"));
        }
    }
}
