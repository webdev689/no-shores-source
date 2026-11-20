//! Overlook's social space, planned as a hub of its own after Destiny 1's Tower, where the generic courtyard serves
//! the cities still locked: a landing court on the seaward walk (the Tower's Watch), two side courts through arched
//! passages in stone ranges (Tower North, and the yard toward the Hangar), a walk before the Beacon whose portico
//! opens into the Hall of the Arts inside its base (the Hall of Guardians), sealed gates where the platform runs on,
//! and the harbour way down the platform's wall and the ramped avenue to the quay. Each keeper stands in a stall of
//! their own, a handcrafted module (`tools/modules`).
//!
//! Places are given in the hub's frame: metres seaward of the plaza's middle and metres across it (`Frame::at`).

mod adorn;
mod courts;
mod folk;
mod hall;
mod harbour;
mod placing;
mod ring;
mod walks;

use crate::courtyard::{Frame, PARAPET_TOP_M};
use crate::landmarks::ahead;
use crate::social::Social;
use crate::solids::{Material, Shape, Solid};
use crate::stations::{Station, StationKind};
pub use courts::BOARD_LANDING_M;
pub use harbour::{Harboured, harbour};
use land::ground::Ground;
pub use placing::{Stood, stand_against, stand_at};

/// The city whose social space is this hub.
pub const HUB_CITY: &str = "overlook";
/// Where the arrivals stand: on the seaward walk, 4 m inside the parapet, across the landing court's middle.
const SPAWNS_ACROSS_M: [f64; 4] = [-30.0, -10.0, 10.0, 30.0];
const SPAWN_TOWARD_M: f64 = 56.0;
/// The parapet's thickness, metres.
const PARAPET_THICK_M: f64 = 0.8;

/// Everything the hub stands, gathered as its parts are laid: solids, stations, Shape's places, and every stood
/// module's sockets by its name, where the townsfolk's posts are laid (`folk`).
#[derive(Debug, Default)]
pub(crate) struct Laid {
    pub solids: Vec<Solid>,
    pub stations: Vec<Station>,
    pub spots: Vec<[f64; 2]>,
    pub sockets: Vec<(String, String, [f64; 3], [f64; 2])>,
}

impl Laid {
    /// Takes a stood module's solids, and if it is a keeper's stall, its station: the keeper at its `keeper` socket
    /// facing out of its `counter`, which is where a player comes to it.
    pub fn stall(&mut self, kind: StationKind, stood: Option<Stood>) {
        let Some(stood) = stood else { return };
        self.keep_sockets(&stood);
        if let (Some((keeper, _)), Some((counter, facing))) = (stood.socket("keeper"), stood.socket("counter")) {
            let facing = crate::landmarks::turn_toward(facing);
            self.stations.push(Station {
                kind,
                keeper: [keeper[0], keeper[1]],
                facing,
                counter: [counter[0], counter[1]],
            });
        }
        self.solids.extend(stood.solids);
    }

    /// Takes a stood module's solids.
    pub fn piece(&mut self, stood: Option<Stood>) {
        if let Some(stood) = stood {
            self.keep_sockets(&stood);
            self.solids.extend(stood.solids);
        }
    }

    fn keep_sockets(&mut self, stood: &Stood) {
        for (socket, at, facing) in &stood.sockets {
            self.sockets.push((stood.name.clone(), socket.clone(), *at, *facing));
        }
    }

    /// Every socket of the stood modules called `module` named `socket`, in the order they were laid.
    pub fn sockets_of(&self, module: &str, socket: &str) -> Vec<([f64; 3], [f64; 2])> {
        self.sockets
            .iter()
            .filter(|(name, own, _, _)| name == module && own == socket)
            .map(|(_, _, at, facing)| (*at, *facing))
            .collect()
    }
}

/// A parapet along a straight edge of the platform, from `from` to `to` (points square to the world), its foot 2 m
/// under the ground 4 m beyond it so it reads as the platform's wall, its top `PARAPET_TOP_M` over the floor.
pub(crate) fn parapet(ground: &Ground, from: [f64; 2], to: [f64; 2], outward: [f64; 2], level: f64) -> Solid {
    let middle = [(from[0] + to[0]) / 2.0, (from[1] + to[1]) / 2.0];
    let out = ahead(middle, outward, 4.0);
    let foot = ground.height_at(out[0], out[1]).min(level) - 2.0;
    let size = [
        (to[0] - from[0]).abs().max(PARAPET_THICK_M),
        (to[1] - from[1]).abs().max(PARAPET_THICK_M),
        level + PARAPET_TOP_M - foot,
    ];
    Solid::upright(Shape::Block, [middle[0], middle[1], foot], size, Material::Stone)
}

/// Overlook's hub on its platform, beside the Beacon reaching `reach` from its middle.
#[must_use]
pub fn overlook(ground: &Ground, frame: &Frame, bounds: [f64; 4]) -> Social {
    let mut laid = Laid::default();
    courts::seaward_walk(ground, frame, &mut laid);
    courts::watch_court(frame, &mut laid);
    courts::west_court(frame, &mut laid);
    courts::forge_yard(frame, &mut laid);
    courts::ranges(frame, &mut laid);
    walks::beacon_walk(ground, frame, &mut laid);
    hall::hall(frame, &mut laid);
    adorn::adorn(frame, &mut laid);
    let spawns = SPAWNS_ACROSS_M.iter().map(|&across| frame.at(SPAWN_TOWARD_M, across)).collect();
    let (ways, posts) = folk::life(frame, &laid);
    Social {
        bounds,
        level: frame.level,
        ring: ring::ring(frame),
        spawns,
        solids: laid.solids,
        stations: laid.stations,
        visitor_spots: laid.spots,
        ways,
        posts,
    }
}

#[cfg(test)]
mod tests;
