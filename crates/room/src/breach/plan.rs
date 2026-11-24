//! A Breach's plan as its run's room reads it (`content/dungeon/breach-*.json`): each space a module of the manifest
//! stood at a point of the run's frame and turned whole quarters, its parts the blocks a body stands on and its
//! sockets where the encounters' pieces stand; the seals across its ways on, each a module of its own that opens as an
//! encounter wins; and the Broken Stair's slabs that come and go. Quarter turns are made by swapping and signing, never
//! by sines, so every machine lays each block to the bit. The plan and its modules are the build's tables (build.rs).

use movement::Block;
use std::collections::BTreeMap;
use std::sync::OnceLock;

/// A module as the build wrote it from the manifest: its name, size, parts (west, north, bottom, east, south, top in
/// its own frame) and sockets.
#[derive(Debug)]
pub struct ModuleTable {
    pub name: &'static str,
    pub size: [f64; 3],
    pub parts: &'static [[f64; 6]],
    pub sockets: &'static [ModuleSocket],
}

/// A socket of a module: its name, where it stands in the module's frame and the way it faces out.
#[derive(Debug)]
pub struct ModuleSocket {
    pub name: &'static str,
    pub at: [f64; 3],
    pub facing: [f64; 2],
}

pub(crate) struct SpaceTable {
    key: &'static str,
    module: &'static str,
    at: [f64; 3],
    turn: u8,
}

pub(crate) struct SealTable {
    space: &'static str,
    socket: &'static str,
    opens: &'static str,
    turn: u8,
}

pub(crate) struct SlabTable {
    space: &'static str,
    socket: &'static str,
    phase: u64,
}

include!(concat!(env!("OUT_DIR"), "/breach_tables.rs"));

/// A module the Breaches stand by its name; none for one no plan names.
#[must_use]
pub fn module(name: &str) -> Option<&'static ModuleTable> {
    MODULES.iter().find(|module| module.name == name)
}

/// How long one slab's cycle runs, ticks, and how long of it it stands: 11 s, 7 of them standing (it forms for one
/// second, stands six and fades over the last), as the Broken Stair's measure.
pub const SLAB_CYCLE: u64 = 11 * 60;
pub const SLAB_STANDS: u64 = 7 * 60;

/// One space: the key the plan names it by, its module, its foot's middle and its quarter turns clockwise.
#[derive(Clone, Debug, PartialEq)]
pub struct Space {
    pub key: String,
    pub module: String,
    pub at: [f64; 3],
    pub turn: u8,
}

/// A seal across a way on: the space and socket it stands at, the encounter whose win opens it, and its quarter turns.
#[derive(Clone, Debug, PartialEq)]
pub struct Seal {
    pub space: String,
    pub socket: String,
    pub opens: String,
    pub turn: u8,
}

/// A slab that comes and goes: the space and socket it stands at, and the tick of its cycle at the run's first.
#[derive(Clone, Debug, PartialEq)]
pub struct Slab {
    pub space: String,
    pub socket: String,
    pub phase: u64,
}

/// A Breach's plan.
#[derive(Clone, Debug, PartialEq)]
pub struct Plan {
    pub id: String,
    pub spaces: Vec<Space>,
    pub seals: Vec<Seal>,
    pub slabs: Vec<Slab>,
    /// Which space each encounter is fought in, by the encounter's key.
    pub encounters: BTreeMap<String, String>,
    /// The shores each encounter that takes players away takes them to, in order: what was, then what is.
    pub shores: BTreeMap<String, Vec<String>>,
}

/// The Drowned Vale's plan.
#[must_use]
pub fn drowned_vale() -> &'static Plan {
    static PLAN: OnceLock<Plan> = OnceLock::new();
    PLAN.get_or_init(|| Plan {
        id: PLAN_ID.to_owned(),
        spaces: SPACES
            .iter()
            .map(|space| Space { key: space.key.into(), module: space.module.into(), at: space.at, turn: space.turn })
            .collect(),
        seals: SEALS
            .iter()
            .map(|seal| Seal {
                space: seal.space.into(),
                socket: seal.socket.into(),
                opens: seal.opens.into(),
                turn: seal.turn,
            })
            .collect(),
        slabs: SLABS
            .iter()
            .map(|slab| Slab { space: slab.space.into(), socket: slab.socket.into(), phase: slab.phase })
            .collect(),
        encounters: ENCOUNTERS.iter().map(|(key, space)| ((*key).to_owned(), space[0].to_owned())).collect(),
        shores: SHORES
            .iter()
            .map(|(key, shores)| ((*key).to_owned(), shores.iter().map(|shore| (*shore).to_owned()).collect()))
            .collect(),
    })
}

/// A point of a module's own frame (x east, y south, z up) turned `quarters` clockwise.
#[must_use]
pub const fn turned([x, y, z]: [f64; 3], quarters: u8) -> [f64; 3] {
    match quarters % 4 {
        0 => [x, y, z],
        1 => [-y, x, z],
        2 => [-x, -y, z],
        _ => [y, -x, z],
    }
}

/// A box of a module's frame (west, north, bottom, east, south, top) turned and stood at `at`, as a block.
fn placed_block([x0, y0, z0, x1, y1, z1]: [f64; 6], at: [f64; 3], quarters: u8) -> Block {
    let [a, b] = [turned([x0, y0, z0], quarters), turned([x1, y1, z1], quarters)];
    Block {
        min_x: at[0] + a[0].min(b[0]),
        min_y: at[1] + a[1].min(b[1]),
        max_x: at[0] + a[0].max(b[0]),
        max_y: at[1] + a[1].max(b[1]),
        bottom: at[2] + z0,
        top: at[2] + z1,
    }
}

impl Plan {
    /// A space by its key.
    #[must_use]
    pub fn space(&self, key: &str) -> Option<&Space> {
        self.spaces.iter().find(|space| space.key == key)
    }

    /// The module a space stands.
    fn module_of(&self, space: &Space) -> Option<&'static ModuleTable> {
        module(&space.module)
    }

    /// A socket of a space in the run's frame, and the way it faces out; none for a space or socket the plan lacks.
    #[must_use]
    pub fn socket(&self, space: &str, socket: &str) -> Option<([f64; 3], [f64; 2])> {
        let space = self.space(space)?;
        let found = self.module_of(space)?.sockets.iter().find(|each| each.name == socket)?;
        let at = turned(found.at, space.turn);
        let [x, y, _] = turned([found.facing[0], found.facing[1], 0.0], space.turn);
        Some(([space.at[0] + at[0], space.at[1] + at[1], space.at[2] + at[2]], [x, y]))
    }

    /// The sockets of a space whose names start `prefix`, numbered from 1 and in order: `bell-1`, `bell-2` and on.
    #[must_use]
    pub fn numbered(&self, space: &str, prefix: &str) -> Vec<([f64; 3], [f64; 2])> {
        (1..).map_while(|number| self.socket(space, &format!("{prefix}-{number}"))).collect()
    }

    /// Every space's parts as blocks: what stands whatever the run does.
    #[must_use]
    pub fn standing(&self) -> Vec<Block> {
        self.spaces
            .iter()
            .filter_map(|space| Some((space, self.module_of(space)?)))
            .flat_map(|(space, module)| module.parts.iter().map(|&part| placed_block(part, space.at, space.turn)))
            .collect()
    }

    /// A seal's blocks, its module's parts at its socket.
    #[must_use]
    pub fn seal_blocks(&self, seal: &Seal) -> Vec<Block> {
        let (Some((at, _)), Some(module)) = (self.socket(&seal.space, &seal.socket), module("breach-seal")) else {
            return Vec::new();
        };
        module.parts.iter().map(|&part| placed_block(part, at, seal.turn)).collect()
    }

    /// A slab's block, its module's part at its socket.
    #[must_use]
    pub fn slab_block(&self, slab: &Slab) -> Option<Block> {
        let (at, _) = self.socket(&slab.space, &slab.socket)?;
        module("breach-slab")?.parts.first().map(|&part| placed_block(part, at, 0))
    }

    /// The blocks standing at `tick` with the seals `open` (a bit each, as a snapshot carries them): every space's,
    /// each seal still shut, and each slab standing in its cycle. The room stands these, and the page predicts on them.
    #[must_use]
    pub fn blocks_at(&self, open: u8, tick: u64) -> Vec<Block> {
        let mut blocks = self.standing();
        for (number, seal) in self.seals.iter().enumerate() {
            if open & (1 << number) == 0 {
                blocks.extend(self.seal_blocks(seal));
            }
        }
        blocks
            .extend(self.slabs.iter().filter(|slab| slab_stands(slab, tick)).filter_map(|slab| self.slab_block(slab)));
        blocks
    }

    /// The run's bounds on the ground, round every space's module, `margin` metres more each way: west, north, east,
    /// south.
    #[must_use]
    pub fn bounds(&self, margin: f64) -> [f64; 4] {
        let mut bounds = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
        for space in &self.spaces {
            let Some(module) = self.module_of(space) else { continue };
            let half = turned([module.size[0] / 2.0, module.size[1] / 2.0, 0.0], space.turn);
            let (half_x, half_y) = (half[0].abs(), half[1].abs());
            bounds[0] = bounds[0].min(space.at[0] - half_x - margin);
            bounds[1] = bounds[1].min(space.at[1] - half_y - margin);
            bounds[2] = bounds[2].max(space.at[0] + half_x + margin);
            bounds[3] = bounds[3].max(space.at[1] + half_y + margin);
        }
        bounds
    }

    /// A space's ground bounds, `margin` metres more each way, as the navmesh is baked over it.
    #[must_use]
    pub fn space_bounds(&self, key: &str, margin: f64) -> Option<navmesh::Bounds> {
        let space = self.space(key)?;
        let module = self.module_of(space)?;
        let half = turned([module.size[0] / 2.0, module.size[1] / 2.0, 0.0], space.turn);
        let (half_x, half_y) = (half[0].abs() + margin, half[1].abs() + margin);
        Some(navmesh::Bounds {
            min_x: space.at[0] - half_x,
            min_y: space.at[1] - half_y,
            max_x: space.at[0] + half_x,
            max_y: space.at[1] + half_y,
        })
    }
}

/// Whether a slab stands at `tick`: from the start of its cycle for SLAB_STANDS ticks of every SLAB_CYCLE.
#[must_use]
pub const fn slab_stands(slab: &Slab, tick: u64) -> bool {
    (tick + slab.phase) % SLAB_CYCLE < SLAB_STANDS
}

#[cfg(test)]
#[path = "plan_tests.rs"]
mod plan_tests;
