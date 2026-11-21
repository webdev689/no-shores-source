//! Standing a handcrafted module in the hub: turned so a named socket (its `front`, or a stall's `counter`) faces the
//! way asked, its back against a line, and its sockets read out where they land in the world.

use crate::landmarks::turn_toward;
use crate::modules::{Module, all, number_of, solids};
use crate::solids::{Shape, Solid};

/// A module stood in the world: its name, its solids, and each of its sockets' point and the way it faces out.
#[derive(Debug, Clone, PartialEq)]
pub struct Stood {
    pub name: String,
    pub solids: Vec<Solid>,
    pub sockets: Vec<(String, [f64; 3], [f64; 2])>,
}

impl Stood {
    /// A socket's point and facing by its name.
    #[must_use]
    pub fn socket(&self, name: &str) -> Option<([f64; 3], [f64; 2])> {
        self.sockets.iter().find(|(own, _, _)| own == name).map(|(_, at, facing)| (*at, *facing))
    }

    /// Every socket whose name starts with `start`, in the module's order.
    #[must_use]
    pub fn sockets_named(&self, start: &str) -> Vec<([f64; 3], [f64; 2])> {
        self.sockets.iter().filter(|(own, _, _)| own.starts_with(start)).map(|(_, at, facing)| (*at, *facing)).collect()
    }
}

fn module_named(name: &str) -> Option<(u32, &'static Module)> {
    let number = number_of(name)?;
    Some((number, &all()[number as usize]))
}

/// How deep a module runs along the way its socket faces, metres: its size across that way.
fn depth_along(module: &Module, facing: [f64; 2]) -> f64 {
    facing[0].abs() * module.size[0] + facing[1].abs() * module.size[1]
}

/// A point turned with a solid's turn about its foot, without moving it.
fn turned(turn: f64, point: [f64; 3]) -> [f64; 3] {
    Solid::upright(Shape::Block, [0.0; 3], [1.0; 3], crate::solids::Material::Stone).turned(turn).place(point)
}

/// Stands module `name` with its `socket` facing `facing` (a unit vector square to the world) and the back of its
/// foot on the line through `back` square to that way, at `level`. None for a module the manifest lacks or a socket
/// it does not have.
#[must_use]
pub fn stand_against(name: &str, socket: &str, back: [f64; 2], level: f64, facing: [f64; 2]) -> Option<Stood> {
    let (_, module) = module_named(name)?;
    let own = module.sockets.iter().find(|found| found.name == socket)?;
    let depth = depth_along(module, own.facing);
    stand_at(name, socket, [back[0] + facing[0] * depth / 2.0, back[1] + facing[1] * depth / 2.0], level, facing)
}

/// Stands module `name` with the middle of its foot at `at` (on `level`) and its `socket` facing `facing`.
#[must_use]
pub fn stand_at(name: &str, socket: &str, at: [f64; 2], level: f64, facing: [f64; 2]) -> Option<Stood> {
    let (number, module) = module_named(name)?;
    let own = module.sockets.iter().find(|found| found.name == socket)?;
    let turn = turn_toward(facing) - turn_toward(own.facing);
    let foot = [at[0], at[1], level];
    let sockets = module
        .sockets
        .iter()
        .map(|each| {
            let point = turned(turn, each.at);
            let out = turned(turn, [each.facing[0], each.facing[1], 0.0]);
            (each.name.clone(), [foot[0] + point[0], foot[1] + point[1], level + point[2]], [out[0], out[1]])
        })
        .collect();
    Some(Stood { name: name.to_owned(), solids: solids(number, foot, turn), sockets })
}

/// Stands module `name` so that its `socket` lands on `point` (east, south, height) facing `facing`: a banner by the
/// bracket it hangs from, a sign by its fixing.
#[must_use]
pub fn stand_by_socket(name: &str, socket: &str, point: [f64; 3], facing: [f64; 2]) -> Option<Stood> {
    let probe = stand_at(name, socket, [0.0, 0.0], 0.0, facing)?;
    let (at, _) = probe.socket(socket)?;
    stand_at(name, socket, [point[0] - at[0], point[1] - at[1]], point[2] - at[2], facing)
}
