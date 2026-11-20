//! Handcrafted modules: playspaces built in Blender (tools/modules), each placed whole by a layout. What the rules
//! read of one is in content/modules/modules.json: its size, its parts (the boxes a body stands on and runs into, in
//! its own frame: x across, y along, z up from the middle of its foot), its sockets (where a way meets it) and its
//! surface groups, one solid each, which the browser draws from R2.

use crate::solids::{Material, Shape, Solid};
use serde::Deserialize;
use std::sync::OnceLock;

/// One module as the manifest gives it.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Module {
    pub name: String,
    pub size: [f64; 3],
    pub parts: Vec<[f64; 6]>,
    pub sockets: Vec<Socket>,
    pub groups: Vec<Group>,
    /// Ground levelled under it (`[x0, y0, x1, y1, level]` in its frame, the level over its foot), so land that
    /// would stand through a floor is held under it.
    #[serde(default)]
    pub pads: Vec<[f64; 5]>,
}

/// Where a way or a floor meets a module: its point in the module's frame, and the way it faces out.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Socket {
    pub name: String,
    pub at: [f64; 3],
    pub facing: [f64; 2],
}

/// A module's surfaces in one material.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Group {
    pub material: Material,
}

#[derive(Deserialize)]
struct Manifest {
    modules: Vec<Module>,
}

/// Every module, in the manifest's order: a solid names its module by its place here.
#[must_use]
pub fn all() -> &'static [Module] {
    static MODULES: OnceLock<Vec<Module>> = OnceLock::new();
    MODULES.get_or_init(|| {
        let text = include_str!("../../../content/modules/modules.json");
        serde_json::from_str::<Manifest>(text).map(|manifest| manifest.modules).unwrap_or_default()
    })
}

/// A module's place in `all` by its name.
#[must_use]
pub fn number_of(name: &str) -> Option<u32> {
    all().iter().position(|module| module.name == name).and_then(|at| u32::try_from(at).ok())
}

/// The solids a module stands as, its foot's middle at `at` turned `turn` radians clockwise from north: one a surface
/// group, the first carrying its parts.
#[must_use]
pub fn solids(module: u32, at: [f64; 3], turn: f64) -> Vec<Solid> {
    let Some(found) = all().get(module as usize) else { return Vec::new() };
    (0..found.groups.len())
        .map(|group| {
            let shape = Shape::Module { module, group: group as u32 };
            Solid::upright(shape, at, found.size, found.groups[group].material).turned(turn)
        })
        .collect()
}

/// The ground a module's first group's solid levels, as the land's pads; none for any other solid.
#[must_use]
pub fn pads(solid: &Solid) -> Vec<land::pads::Pad> {
    let Shape::Module { module, group: 0 } = solid.shape else { return Vec::new() };
    let Some(found) = all().get(module as usize) else { return Vec::new() };
    found
        .pads
        .iter()
        .map(|&[x0, y0, x1, y1, level]| {
            let [west, north, east, south, ..] = solid.bounds_of([x0, y0, 0.0, x1, y1, 0.0]);
            land::pads::Pad { bounds: [west, north, east, south], level: solid.at[2] + level }
        })
        .collect()
}

/// A module's parts, for its first group's solid; none for its others.
#[must_use]
pub fn parts(module: u32, group: u32) -> Vec<[f64; 6]> {
    match all().get(module as usize) {
        Some(found) if group == 0 => found.parts.clone(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_module_reads_with_its_parts_inside_its_size() {
        assert!(!all().is_empty(), "the manifest reads");
        for module in all() {
            let [width, depth, height] = module.size;
            assert!(!module.parts.is_empty() && !module.groups.is_empty(), "{}", module.name);
            for &[x0, y0, z0, x1, y1, z1] in &module.parts {
                assert!(x0 < x1 && y0 < y1 && z0 < z1, "{}: a part with no room", module.name);
                let inside = x0 >= -width / 2.0 - 0.01 && x1 <= width / 2.0 + 0.01 && y0 >= -depth / 2.0 - 0.01;
                assert!(
                    inside && y1 <= depth / 2.0 + 0.01 && z1 <= height + 0.01,
                    "{}: a part past its size",
                    module.name
                );
            }
        }
    }

    #[test]
    fn a_module_stands_one_solid_a_group_and_only_its_first_runs_into_a_body() {
        let number = number_of("old-stones").expect("the Old Stones are a module");
        let standing = solids(number, [10.0, 20.0, 3.0], 0.0);
        assert_eq!(standing.len(), all()[number as usize].groups.len());
        assert!(!parts(number, 0).is_empty() && parts(number, 1).is_empty());
        assert!(standing.iter().all(|solid| solid.at == [10.0, 20.0, 3.0]));
    }
}
