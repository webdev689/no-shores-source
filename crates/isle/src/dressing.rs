//! An island's dressing: the modules its climate's kit and the common kit give it, set by its seed. Cliff faces line
//! its cliffs, stacks stand off them and rocks line the rest of its coast; boulders, trees, shrubs and grass fill its
//! land where it is not too steep, the trees in clumps; an isle's ruins ring its landmark, and each wreck's hull lies
//! on the strand with its spilt cargo by it. Each module stands on the ground as bodies do, sunk a little so it never
//! floats, and none overlaps another or a place kept clear.

use crate::catalog::{Catalog, Dressing, Role, catalog};
use crate::draws::{Draws, Noise, mix};
use crate::shape::{Shape, bearing_of, way};
use crate::sites::Sites;
use crate::{Kind, Placement};

use core::f64::consts::{FRAC_PI_2, PI, TAU};
use movement::{Block, Heights, Terrain};

/// The underside of a block standing from an island's ground, metres: under the sea's floor round any island.
const ISLE_BLOCK_BOTTOM_M: f64 = -100.0;

/// Placements are kept in buckets this many metres square, to find a neighbour quickly.
const BUCKET_M: f64 = 8.0;

struct Laying<'plan> {
    catalog: &'static Catalog,
    shape: &'plan Shape,
    ground: &'plan Heights,
    clear: Vec<([f64; 2], f64)>,
    placed: Vec<(Placement, f64)>,
    buckets: std::collections::BTreeMap<(i64, i64), Vec<usize>>,
}

fn bucket_of([x, y]: [f64; 2]) -> (i64, i64) {
    ((x / BUCKET_M).floor() as i64, (y / BUCKET_M).floor() as i64)
}

fn apart(one: [f64; 2], other: [f64; 2]) -> f64 {
    let (along_x, along_y) = (one[0] - other[0], one[1] - other[1]);
    (along_x * along_x + along_y * along_y).sqrt()
}

impl Laying<'_> {
    /// How far round its middle a module reaches at a scale.
    fn reach(&self, module: u16, scale: f64) -> f64 {
        let [across, along, _] = self.catalog.module(module).size;
        across.max(along) * 0.5 * scale
    }

    /// Whether a module of that reach may stand at a point: wholly out of every place kept clear, and `spacing` of its
    /// reach and each neighbour's from them.
    fn open(&self, at: [f64; 2], reach: f64, spacing: f64) -> bool {
        let kept = self.clear.iter().all(|&(point, radius)| apart(at, point) >= radius + reach);
        if !kept {
            return false;
        }
        let (column, row) = bucket_of(at);
        let near = (column - 2..=column + 2).flat_map(|column| (row - 2..=row + 2).map(move |row| (column, row)));
        near.filter_map(|key| self.buckets.get(&key)).flatten().all(|&index| {
            let (other, other_reach) = self.placed[index];
            apart(at, [other.at[0], other.at[1]]) >= (reach + other_reach) * spacing
        })
    }

    /// The lowest ground under a module's middle and the four corners of its footprint, less a sink, so it sits in
    /// the ground on any slope.
    fn base(&self, at: [f64; 2], reach: f64, sink: f64) -> f64 {
        let corners = [[0.0, 0.0], [reach, 0.0], [-reach, 0.0], [0.0, reach], [0.0, -reach]];
        let lowest = corners.iter().map(|[x, y]| self.ground.height_at(at[0] + x * 0.7, at[1] + y * 0.7));
        lowest.fold(f64::INFINITY, f64::min) - sink
    }

    /// The ground's steepness at a point: its rise over a metre, the greater of across and down.
    fn steepness(&self, [x, y]: [f64; 2]) -> f64 {
        let across = (self.ground.height_at(x + 1.0, y) - self.ground.height_at(x - 1.0, y)) * 0.5;
        let down = (self.ground.height_at(x, y + 1.0) - self.ground.height_at(x, y - 1.0)) * 0.5;
        across.abs().max(down.abs())
    }

    fn put(&mut self, placement: Placement) {
        let reach = self.reach(placement.module, placement.scale);
        self.buckets.entry(bucket_of([placement.at[0], placement.at[1]])).or_default().push(self.placed.len());
        self.placed.push((placement, reach));
    }

    /// Sets a module at a point on the ground, sunk by `sink`.
    fn set(&mut self, module: u16, at: [f64; 2], (turn, scale, sink): (f64, f64, f64)) {
        let base = self.base(at, self.reach(module, scale), sink);
        self.put(Placement { module, at: [at[0], at[1], base], turn: turn.rem_euclid(TAU), scale, lift: 1.0 });
    }

    /// Sets up to `count` of the modules over the land, each tried at points drawn evenly over the ground where
    /// `wanted` takes it, each pick of the modules drawn evenly.
    fn scatter(&mut self, modules: &[u16], count: usize, draws: &mut Draws, wanted: &dyn Fn(&Self, [f64; 2]) -> bool) {
        if modules.is_empty() {
            return;
        }
        let half = self.shape.reach();
        let mut laid = 0;
        for _ in 0..count * 12 {
            if laid >= count {
                break;
            }
            let at = [draws.between(-half, half), draws.between(-half, half)];
            let module = modules[draws.index(modules.len())];
            let scale = draws.between(0.75, 1.3);
            let reach = self.reach(module, scale);
            if wanted(self, at) && self.open(at, reach, 0.8) {
                self.set(module, at, (draws.between(0.0, TAU), scale, 0.15 * scale));
                laid += 1;
            }
        }
    }
}

/// A point on a bearing `off` metres from the island's middle.
fn on(bearing: f64, off: f64) -> [f64; 2] {
    let [x, y] = way(bearing);
    [x * off, y * off]
}

/// The cliff faces round every stretch of cliff, one every 8.5 m of its coast, each raised to the land above it and
/// set at the waterline facing out; the sea stacks off them.
fn cliffs(laying: &mut Laying, kit: &str, dressing: &Dressing, draws: &mut Draws) {
    let faces = laying.catalog.of(kit, Role::Cliff);
    let stacks = laying.catalog.of(kit, Role::Stack);
    let coast = laying.shape.radius * TAU;
    let steps = (coast / 8.5).floor().max(8.0) as usize;
    for step in 0..steps {
        let bearing = step as f64 * TAU / steps as f64;
        if laying.shape.cliffness(bearing, dressing.cliffs) < 0.45 {
            continue;
        }
        let edge = laying.shape.edge(bearing);
        let top = laying.ground.height_at(on(bearing, edge - 6.0)[0], on(bearing, edge - 6.0)[1]);
        let Some(&face) = draws.pick(&faces) else { return };
        let at = on(bearing, edge - 1.0);
        let scale = draws.between(0.95, 1.12);
        let lift = ((top + 1.5) / (laying.catalog.module(face).size[2] * scale)).max(0.4);
        let turn = (bearing + draws.between(-0.08, 0.08)).rem_euclid(TAU);
        // A wreck, the door or the camp at the cliff's foot breaks it there: no face stands on them.
        if !laying.open(at, laying.reach(face, scale), 0.5) {
            continue;
        }
        laying.put(Placement { module: face, at: [at[0], at[1], -1.5], turn, scale, lift });
        if draws.unit() < 0.06
            && let Some(&stack) = draws.pick(&stacks)
        {
            let off = on(bearing + draws.between(-0.05, 0.05), edge * draws.between(1.07, 1.16));
            let scale = draws.between(0.7, 1.2);
            if laying.open(off, laying.reach(stack, scale), 1.0) {
                laying.set(stack, off, (draws.between(0.0, TAU), scale, 0.5));
            }
        }
    }
}

/// Rocks along the coast that is neither cliff nor beach, and driftwood on the beach.
fn shore(laying: &mut Laying, kit: &str, dressing: &Dressing, draws: &mut Draws) {
    let rocks = laying.catalog.of(kit, Role::Shore);
    let drift = laying.catalog.of(kit, Role::Drift);
    let steps = (laying.shape.radius * TAU / 4.5).floor() as usize;
    for step in 0..steps {
        let bearing = step as f64 * TAU / steps as f64 + draws.between(-0.02, 0.02);
        let bay = laying.shape.bayness(bearing);
        let cliff = laying.shape.cliffness(bearing, dressing.cliffs);
        let edge = laying.shape.edge(bearing);
        let Some(&rock) = draws.pick(&rocks) else { return };
        if cliff < 0.45 && bay < 0.35 && draws.unit() < 0.55 {
            let at = on(bearing, edge + draws.between(-3.0, 4.0));
            let scale = draws.between(0.7, 1.45);
            if laying.open(at, laying.reach(rock, scale), 0.7) {
                laying.set(rock, at, (draws.between(0.0, TAU), scale, 0.3 * scale));
            }
        } else if bay >= 0.35
            && draws.unit() < 0.06
            && let Some(&log) = draws.pick(&drift)
        {
            let at = on(bearing, edge * draws.between(0.9, 0.97));
            if laying.open(at, laying.reach(log, 1.0), 0.8) {
                laying.set(log, at, (bearing + FRAC_PI_2 + draws.between(-0.6, 0.6), draws.between(0.8, 1.2), 0.1));
            }
        }
    }
}

/// How much land an island holds, square metres, for its densities.
fn area(shape: &Shape) -> f64 {
    shape.radius * shape.radius * PI
}

/// Whether a point is on the island's land, past its beach, and gentle enough to grow on.
fn growing(laying: &Laying, at: [f64; 2], beach: f64, steepest: f64) -> bool {
    let bearing = bearing_of(at);
    let inside = apart(at, [0.0, 0.0]) < laying.shape.edge(bearing) * (1.0 - beach);
    inside && laying.ground.height_at(at[0], at[1]) > 0.8 && laying.steepness(at) < steepest
}

/// Boulders and outcrops, trees in clumps where the noise is high, then shrubs and grass under and between them.
fn growth(laying: &mut Laying, kit: &str, dressing: &Dressing, seed: u64, draws: &mut Draws) {
    let land = area(laying.shape);
    let boulders = laying.catalog.of(kit, Role::Boulder);
    let outcrops = laying.catalog.of(kit, Role::Outcrop);
    let count = |density: f64| (land * density).round() as usize;
    laying.scatter(&outcrops, count(dressing.boulders / 5.0), draws, &|laying, at| growing(laying, at, 0.12, 1.2));
    laying.scatter(&boulders, count(dressing.boulders), draws, &|laying, at| growing(laying, at, 0.05, 1.4));
    let trees: Vec<u16> = dressing.tree.iter().filter_map(|name| laying.catalog.number(name)).collect();
    let clumps = Noise::new(mix(seed, 5));
    let clumped = move |laying: &Laying, at: [f64; 2]| {
        clumps.fractal(at[0] / 28.0, at[1] / 28.0, 2) > -0.1 && growing(laying, at, 0.16, 0.7)
    };
    laying.scatter(&trees, count(dressing.trees), draws, &clumped);
    let mut low = laying.catalog.of(kit, Role::Shrub);
    low.extend(laying.catalog.of(kit, Role::Grass));
    laying.scatter(&low, count(dressing.shrubs), draws, &|laying, at| growing(laying, at, 0.08, 0.9));
}

/// One wreck's heap: its hull's piece lying along the shore, and two to four of its bits spilt inland of it.
fn wreck(laying: &mut Laying, at: [f64; 2], lies: f64, draws: &mut Draws) {
    let catalog = laying.catalog;
    let hulls = catalog.of("common", Role::Wreck);
    let bits = catalog.of("common", Role::WreckBit);
    if let Some(&hull) = draws.pick(&hulls) {
        laying.set(hull, at, (lies, draws.between(0.85, 1.1), 0.9));
    }
    let inland = bearing_of([-at[0], -at[1]]);
    for _ in 0..2 + draws.index(3) {
        let Some(&bit) = draws.pick(&bits) else { return };
        let [x, y] = way(inland + draws.between(-1.2, 1.2));
        let off = draws.between(4.0, 8.0);
        let spot = [at[0] + x * off, at[1] + y * off];
        if laying.open(spot, laying.reach(bit, 1.0), 0.6) {
            laying.set(bit, spot, (draws.between(0.0, TAU), draws.between(0.9, 1.1), 0.1));
        }
    }
}

/// A ruin isle's columns, walls, arches, fallen drums and statues in a ring round its landmark; a cove now and then
/// keeps a broken column and a run of wall of its own.
fn ruins(laying: &mut Laying, sites: &Sites, kind: Kind, draws: &mut Draws) {
    let catalog = laying.catalog;
    let pieces = catalog.of("common", Role::Ruin);
    let (middle, count, from, to) = match (kind, sites.landmark) {
        (Kind::Ruin, Some((point, _))) => (point, 12 + draws.index(8), 20.0, 42.0),
        (Kind::Cove, _) if draws.unit() < 0.35 => {
            let bearing = draws.between(0.0, TAU);
            (on(bearing, laying.shape.edge(bearing) * 0.45), 2 + draws.index(2), 0.0, 9.0)
        }
        _ => return,
    };
    for _ in 0..count * 8 {
        if laying.placed.iter().filter(|(placement, _)| pieces.contains(&placement.module)).count() >= count {
            break;
        }
        let Some(&piece) = draws.pick(&pieces) else { return };
        let bearing = draws.between(0.0, TAU);
        let [x, y] = way(bearing);
        let off = draws.between(from, to);
        let at = [middle[0] + x * off, middle[1] + y * off];
        // Walls and arches stand across the way to the middle, as the ring of a building would.
        let turn = bearing + if draws.unit() < 0.7 { 0.0 } else { draws.between(0.0, TAU) };
        let scale = draws.between(0.9, 1.15);
        if laying.ground.height_at(at[0], at[1]) > 0.5 && laying.open(at, laying.reach(piece, scale), 0.7) {
            laying.set(piece, at, (turn, scale, 0.3));
        }
    }
}

/// An isle's camp: two or three tents and a palisade round a fire.
fn camp(laying: &mut Laying, at: [f64; 2], draws: &mut Draws) {
    let module = |name: &str| laying.catalog.number(&format!("common.camp.{name}"));
    let (Some(fire), Some(tent), Some(palisade)) = (module("fire"), module("tent"), module("palisade")) else { return };
    laying.set(fire, at, (0.0, 1.0, 0.1));
    let start = draws.between(0.0, TAU);
    for nth in 0..2 + draws.index(2) {
        let bearing = start + nth as f64 * TAU / 3.0;
        laying.set(tent, [at[0] + way(bearing)[0] * 5.0, at[1] + way(bearing)[1] * 5.0], (bearing + PI, 1.0, 0.2));
    }
    let behind = bearing_of(at);
    let [x, y] = way(behind);
    laying.set(palisade, [at[0] + x * 8.0, at[1] + y * 8.0], (behind, 1.0, 0.3));
}

/// Every module an island of `kind` is dressed with, in the order they were laid.
#[must_use]
pub fn dress(
    shape: &Shape,
    ground: &Heights,
    sites: &Sites,
    (kind, dressing): (Kind, &Dressing),
    seed: u64,
) -> Vec<Placement> {
    let catalog = catalog();
    let mut laying = Laying {
        catalog,
        shape,
        ground,
        clear: Vec::new(),
        placed: Vec::new(),
        buckets: std::collections::BTreeMap::new(),
    };
    let mut draws = Draws::of(seed, 4);
    let module = |name: String| catalog.number(&name);
    if let Some(door) = module(format!("common.door.{}", kind.dungeon())) {
        laying.set(door, sites.door.at, (sites.door.facing, 1.0, 0.6));
    }
    let landmark = match kind {
        Kind::Cove => None,
        Kind::Ruin => module(format!("common.landmark.{}", if draws.unit() < 0.5 { "tower" } else { "temple" })),
        Kind::Quarry => module("common.landmark.quarry".to_owned()),
    };
    if let (Some(landmark), Some((at, facing))) = (landmark, sites.landmark) {
        laying.set(landmark, at, (facing, 1.0, 0.5));
    }
    for each in &sites.wrecks {
        wreck(&mut laying, each.at, each.lies, &mut draws);
    }
    if let Some(at) = sites.camp {
        camp(&mut laying, at, &mut draws);
    }
    laying.clear = sites.clear(shape);
    let kit = dressing.kit.as_str();
    cliffs(&mut laying, kit, dressing, &mut draws);
    ruins(&mut laying, sites, kind, &mut draws);
    shore(&mut laying, kit, dressing, &mut draws);
    growth(&mut laying, kit, dressing, seed, &mut draws);
    laying.placed.into_iter().map(|(placement, _)| placement).collect()
}

/// The blocks a body cannot walk through: each solid of each placement, turned and scaled with it, as the square
/// round its disc, as tall as the module stands.
#[must_use]
pub fn blocks(placements: &[Placement]) -> Vec<Block> {
    let catalog = catalog();
    let mut blocks = Vec::new();
    for placement in placements {
        let module = catalog.module(placement.module);
        let top = placement.at[2] + module.size[2] * placement.scale * placement.lift;
        let (sine, cosine) = (libm::sin(placement.turn), libm::cos(placement.turn));
        for &[x, y, radius] in &module.solids {
            // Turned clockwise from north: x east and y south turn as a heading does.
            let (east, south) = (x * cosine - y * sine, x * sine + y * cosine);
            let (middle_x, middle_y) =
                (placement.at[0] + east * placement.scale, placement.at[1] + south * placement.scale);
            let half = radius * placement.scale;
            blocks.push(Block {
                min_x: middle_x - half,
                min_y: middle_y - half,
                max_x: middle_x + half,
                max_y: middle_y + half,
                top,
                // From the ground up: an island's ground stands over the sea, so this is under it everywhere.
                bottom: ISLE_BLOCK_BOTTOM_M,
            });
        }
    }
    blocks
}
