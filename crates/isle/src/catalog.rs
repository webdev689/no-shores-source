//! The islands' modules as content/islands/kits.json names them, the contract the Blender pipeline builds to
//! (tools/islands): every module's role, size and solids, and each climate's kit and dressing.

use serde::Deserialize;
use std::collections::BTreeMap;
use std::sync::OnceLock;

/// What a module is to the dressing: where it goes and how it is laid.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    Shore,
    Drift,
    Cliff,
    Stack,
    Boulder,
    Outcrop,
    Tree,
    Shrub,
    Grass,
    Wreck,
    WreckBit,
    Ruin,
    Door,
    Landmark,
    Camp,
}

/// A module: its role, its size (across x, along y, height, metres, from the middle of its base, its front to the
/// north), and the discs no body walks through, as tall as it is.
#[derive(Clone, Debug, Deserialize)]
pub struct Module {
    pub role: Role,
    pub size: [f64; 3],
    pub solids: Vec<[f64; 3]>,
}

/// How a climate's islands are dressed: its kit of modules, how high its land stands against the others' (`relief`),
/// how much of its coast is cliff, the trees, shrubs and boulders a square metre holds, and the trees it grows.
#[derive(Clone, Debug, Deserialize)]
pub struct Dressing {
    pub kit: String,
    pub relief: f64,
    pub cliffs: f64,
    pub trees: f64,
    pub shrubs: f64,
    pub boulders: f64,
    pub tree: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct Kits {
    parts: Vec<String>,
    kits: Vec<String>,
    modules: BTreeMap<String, Module>,
    climates: BTreeMap<String, Dressing>,
}

/// The contract read once: the modules in name order, which is the number each placement names.
#[derive(Debug)]
pub struct Catalog {
    pub parts: Vec<String>,
    pub kits: Vec<String>,
    pub names: Vec<String>,
    pub modules: Vec<Module>,
    pub climates: BTreeMap<String, Dressing>,
}

impl Catalog {
    /// A module's number by its name.
    #[must_use]
    pub fn number(&self, name: &str) -> Option<u16> {
        self.names.binary_search_by(|held| held.as_str().cmp(name)).ok().and_then(|at| u16::try_from(at).ok())
    }

    /// A module by its number.
    #[must_use]
    pub fn module(&self, number: u16) -> &Module {
        &self.modules[usize::from(number)]
    }

    /// The numbers of a kit's modules of a role, in name order.
    #[must_use]
    pub fn of(&self, kit: &str, role: Role) -> Vec<u16> {
        let prefix = format!("{kit}.");
        let numbered = self.names.iter().zip(&self.modules).enumerate();
        let wanted = numbered.filter(|(_, (name, module))| module.role == role && name.starts_with(&prefix));
        wanted.filter_map(|(number, _)| u16::try_from(number).ok()).collect()
    }
}

/// The catalog, read from the contract compiled in.
///
/// # Panics
/// Only if the contract in the repository is not the shape this reads, which the crate's tests catch first.
#[must_use]
pub fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let kits: Kits = serde_json::from_str(include_str!("../../../content/islands/kits.json"))
            .unwrap_or_else(|error| panic!("content/islands/kits.json does not read: {error}"));
        let (names, modules) = kits.modules.into_iter().unzip();
        Catalog { parts: kits.parts, kits: kits.kits, names, modules, climates: kits.climates }
    })
}
