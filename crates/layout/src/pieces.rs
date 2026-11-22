//! The set pieces of the areas no RMB block stands: each made of the forged props (tents, carts, crates, rocks, ruins,
//! gate arches, cave mouths, boats) and the city's solids (stone, timber, glow), stood on the ground round the area's
//! middle and turned to face the way it is entered, so every area reads as a place with a story: a landing with its
//! jetty and lantern, a camp behind its palisade round a fire, a watchtower with a brazier on the heights.

use crate::areas::Area;
use crate::book::Book;
use crate::brief::AreaKind;
use crate::seat::{Seated, Seating};
use city::solids::{Material, Shape, Solid};
use land::exact::{rand01, sin_cos};
use land::ground::{Ground, WaterAt};

/// The forged props the pieces are dressed with, by model id.
pub mod model {
    pub const TENTS: [u32; 3] = [5103, 43601, 43602];
    pub const CAVE_MOUTHS: [u32; 3] = [42000, 43603, 43604];
    pub const CARTS: [u32; 3] = [41214, 41239, 41241];
    pub const CRATES: [u32; 4] = [41816, 41817, 41822, 41824];
    pub const ROCKS: [u32; 6] = [41704, 41705, 41706, 41708, 41710, 41712];
    pub const RUINS: [u32; 6] = [41720, 41721, 41724, 41725, 43400, 43403];
    pub const RUIN_ARCHES: [u32; 3] = [41726, 43512, 43514];
    pub const GATE_ARCHES: [u32; 2] = [43003, 43004];
    pub const SIGNPOSTS: [u32; 3] = [41739, 43720, 43721];
    pub const SHIP: u32 = 41508;
    pub const GREAT_SHIP: u32 = 41513;
    pub const OBELISK: u32 = 43071;
    pub const LOG: u32 = 41722;
    pub const POST: u32 = 41901;
    pub const SIEGE: u32 = 41402;
    pub const STATUE: u32 = 62324;
    pub const FENCES: [u32; 2] = [41206, 41207];
}

/// What a set piece stands with: the ground, the props' boxes, its own draws, and where it puts what it makes.
pub struct Kit<'a> {
    pub ground: &'a Ground,
    pub book: &'a Book,
    pub seed: u32,
    pub draws: i64,
    pub into: &'a mut Seating,
}

impl std::fmt::Debug for Kit<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.debug_struct("Kit").field("seed", &self.seed).finish_non_exhaustive()
    }
}

impl Kit<'_> {
    /// A fresh draw from 0 to 1.
    pub fn draw(&mut self) -> f64 {
        self.draws += 1;
        rand01(self.seed, &[self.draws])
    }

    /// One of a list, drawn.
    pub fn pick(&mut self, from: &[u32]) -> u32 {
        from[((self.draw() * from.len() as f64) as usize).min(from.len() - 1)]
    }

    /// The ground's height at a point.
    #[must_use]
    pub fn height(&self, at: [f64; 2]) -> f64 {
        self.ground.height_at(at[0], at[1])
    }

    /// Whether a point is dry land.
    #[must_use]
    pub fn dry(&self, at: [f64; 2]) -> bool {
        self.ground.water_at(at[0], at[1]) == WaterAt::Dry
    }

    /// Stands a prop on the ground at a point, its base on the ground, turned `yaw` degrees; left out on water.
    pub fn prop(&mut self, model: u32, at: [f64; 2], yaw: f64) {
        if !self.dry(at) {
            return;
        }
        let Some(measure) = self.book.measure(model, false) else { return };
        let (sine, cosine) = sin_cos(yaw.to_radians());
        let corners = [
            [measure.min[0], measure.min[2]],
            [measure.max[0], measure.max[2]],
            [measure.min[0], measure.max[2]],
            [measure.max[0], measure.min[2]],
        ];
        let start = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
        let footprint = corners.iter().fold(start, |[west, north, east, south], &[x, z]| {
            let (world_x, world_y) = (at[0] + x * cosine + z * sine, at[1] + x * sine - z * cosine);
            [west.min(world_x), north.min(world_y), east.max(world_x), south.max(world_y)]
        });
        let base = self.height(at) - measure.min[1] - 0.05;
        self.prop_at(model, [at[0], at[1], base], yaw, footprint);
        if let Some(seated) = self.into.props.last_mut() {
            seated.grounded = true;
        }
    }

    /// Stands a prop with its origin at a point, turned `yaw` degrees, covering `footprint`.
    pub fn prop_at(&mut self, model: u32, at: [f64; 3], yaw: f64, footprint: [f64; 4]) {
        let yaw = yaw.rem_euclid(360.0);
        let seated = Seated { model, at, yaw, building: false, footprint, purpose: 0, open: false, grounded: false };
        self.into.props.push(seated);
    }

    /// Adds a solid as it is.
    pub fn solid(&mut self, solid: Solid) {
        self.into.solids.push(solid);
    }

    /// A solid of `shape` and `size` whose base stands on the ground at a point, sunk `sink` metres, turned `turn`.
    pub fn stand(&mut self, shape: Shape, at: [f64; 2], size: [f64; 3], turn: f64, material: Material, sink: f64) {
        let base = self.height(at) - sink;
        self.solid(Solid::upright(shape, [at[0], at[1], base], size, material).turned(turn));
    }
}

/// A point `distance` metres from `from` along a bearing `toward` (a unit vector), turned `angle` radians clockwise.
#[must_use]
pub fn ahead(from: [f64; 2], toward: [f64; 2], distance: f64, angle: f64) -> [f64; 2] {
    let (sine, cosine) = sin_cos(angle);
    let turned = [toward[0] * cosine - toward[1] * sine, toward[0] * sine + toward[1] * cosine];
    [from[0] + turned[0] * distance, from[1] + turned[1] * distance]
}

/// The yaw in degrees that turns a model's front (+z) along a unit vector.
#[must_use]
pub fn yaw_toward(toward: [f64; 2]) -> f64 {
    libm::atan2(toward[0], -toward[1]).to_degrees()
}

/// A solid's turn (radians clockwise from north) that lays its own y along a unit vector.
#[must_use]
pub fn turn_along(toward: [f64; 2]) -> f64 {
    libm::atan2(-toward[0], toward[1])
}

/// Builds an area's set piece, facing `toward` (a unit vector): the way it is entered, or for a gate the way it
/// leads. Areas of RMB blocks and kinds with no piece of their own are left as they are.
pub fn build(kit: &mut Kit, area: &Area, toward: [f64; 2], seaward: [f64; 2]) {
    match area.kind {
        AreaKind::Landing => crate::pieces_coast::landing(kit, area, seaward),
        AreaKind::Dock => crate::pieces_coast::dock(kit, area, seaward),
        AreaKind::Wreck => crate::pieces_coast::wreck(kit, area, seaward),
        AreaKind::Lighthouse => crate::pieces_coast::lighthouse(kit, area),
        AreaKind::Gate | AreaKind::Entrance => gate(kit, area, toward),
        AreaKind::Tower => tower(kit, area),
        AreaKind::Camp => camp(kit, area, toward),
        AreaKind::Wilds | AreaKind::Arena => ground_of_battle(kit, area, area.kind == AreaKind::Arena),
        AreaKind::Mill => crate::pieces_land::mill(kit, area, toward),
        AreaKind::Quarry => crate::pieces_land::quarry(kit, area, toward),
        AreaKind::Bones => crate::pieces_land::bones(kit, area, toward),
        AreaKind::Causeway => crate::pieces_land::causeway(kit, area, toward),
        AreaKind::Cave => crate::pieces_land::cave(kit, area, toward),
        AreaKind::Hulks => crate::pieces_coast::hulks(kit, area, toward),
        _ => {}
    }
}

/// A gate: an arch of stone across the way, a timber palisade either side of it, lanterns at its posts and a
/// signpost before it, where a patrol area meets an instance (and the instance's own way in).
fn gate(kit: &mut Kit, area: &Area, toward: [f64; 2]) {
    let middle = area.at;
    let yaw = yaw_toward(toward);
    let arch = kit.pick(&model::GATE_ARCHES);
    kit.prop(arch, middle, yaw);
    let across = [-toward[1], toward[0]];
    let turn = turn_along(across);
    for side in [-1.0, 1.0] {
        for stake in 0..9 {
            let along = 3.4 + f64::from(stake) * 1.1;
            let at = [middle[0] + across[0] * along * side, middle[1] + across[1] * along * side];
            let height = 3.0 + kit.draw() * 0.9;
            kit.stand(Shape::Column { sides: 6, top: 0.55 }, at, [0.55, 0.55, height], turn, Material::Timber, 0.4);
        }
        let post = [middle[0] + across[0] * 3.0 * side, middle[1] + across[1] * 3.0 * side];
        lantern(kit, ahead(post, toward, -0.8, 0.0), 2.6);
    }
    let sign = kit.pick(&model::SIGNPOSTS);
    kit.prop(sign, ahead(middle, toward, -7.0, 0.35), yaw + 180.0);
}

/// A gate's palisade run on from its last stakes until each side meets the rock (`carved`), a stake every 1.1 m while
/// the floor lasts, 40 m out at the most, so it closes the cleft it stands in.
pub fn gate_to_rock(kit: &mut Kit, middle: [f64; 2], toward: [f64; 2], carved: &land::sculpts::Sculpts) {
    let across = [-toward[1], toward[0]];
    let turn = turn_along(across);
    for side in [-1.0, 1.0] {
        let mut along = 3.4 + 9.0 * 1.1;
        while along < 40.0 {
            let at = [middle[0] + across[0] * along * side, middle[1] + across[1] * along * side];
            if carved.floor_distance(at[0], at[1]) > 0.0 {
                break;
            }
            let height = 3.0 + kit.draw() * 0.9;
            let base = crate::skyline::carved_at(kit, carved, at) - 0.4;
            let stake = Solid::upright(
                Shape::Column { sides: 6, top: 0.55 },
                [at[0], at[1], base],
                [0.55, 0.55, height],
                Material::Timber,
            );
            kit.solid(stake.turned(turn));
            along += 1.1;
        }
    }
}

/// A lantern on a post: a timber post, an iron foot, a small flame-lit glass and an iron cap over it.
pub fn lantern(kit: &mut Kit, at: [f64; 2], height: f64) {
    kit.stand(Shape::Column { sides: 6, top: 1.0 }, at, [0.16, 0.16, height], 0.0, Material::Timber, 0.3);
    let top = kit.height(at) - 0.3 + height;
    kit.solid(Solid::upright(Shape::Block, [at[0], at[1], top], [0.3, 0.3, 0.05], Material::Iron));
    kit.solid(Solid::upright(
        Shape::Column { sides: 6, top: 0.9 },
        [at[0], at[1], top + 0.05],
        [0.2, 0.2, 0.26],
        Material::Glow,
    ));
    kit.solid(Solid::upright(
        Shape::Pyramid { top: 0.25 },
        [at[0], at[1], top + 0.31],
        [0.34, 0.34, 0.16],
        Material::Iron,
    ));
}

/// A watchtower on the heights: a round stone tower, battlemented, with a fire burning on its top, a stair of stones
/// up to its door and the rubble of an older wall round its foot.
fn tower(kit: &mut Kit, area: &Area) {
    let middle = area.at;
    let base = kit.height(middle) - 1.0;
    let height = 15.0 + kit.draw() * 5.0;
    kit.solid(Solid::upright(
        Shape::Column { sides: 16, top: 0.86 },
        [middle[0], middle[1], base],
        [7.0, 7.0, height],
        Material::Stone,
    ));
    let top = base + height;
    for merlon in 0..8 {
        let at = ahead(middle, [0.0, -1.0], 2.65, f64::from(merlon) * std::f64::consts::FRAC_PI_4);
        kit.solid(Solid::upright(Shape::Block, [at[0], at[1], top], [1.0, 1.0, 1.1], Material::Stone));
    }
    kit.solid(Solid::upright(
        Shape::Column { sides: 8, top: 0.7 },
        [middle[0], middle[1], top],
        [1.6, 1.6, 0.7],
        Material::Iron,
    ));
    kit.solid(Solid::upright(
        Shape::Pyramid { top: 0.0 },
        [middle[0], middle[1], top + 0.7],
        [1.2, 1.2, 1.4],
        Material::Glow,
    ));
    for stone in 0..7 {
        let angle = f64::from(stone) * 0.9 + kit.draw() * 0.4;
        let at = ahead(middle, [0.0, -1.0], 9.0 + kit.draw() * 6.0, angle);
        let rubble = kit.pick(&model::RUINS);
        let yaw = kit.draw() * 360.0;
        kit.prop(rubble, at, yaw);
    }
}

/// How far a camp's palisade stands from its middle, metres.
#[must_use]
pub fn palisade_radius(area: &Area) -> f64 {
    (area.radius * 0.55).clamp(16.0, 26.0)
}

/// A camp behind a palisade: sharpened stakes in a ring with a gap toward the way in, tents round a fire ringed with
/// stones, carts, crates and a siege engine under repair.
fn camp(kit: &mut Kit, area: &Area, toward: [f64; 2]) {
    let middle = area.at;
    let radius = palisade_radius(area);
    let stakes = (std::f64::consts::TAU * radius / 1.1) as u32;
    for stake in 0..stakes {
        let angle = std::f64::consts::TAU * f64::from(stake) / f64::from(stakes);
        let at = ahead(middle, toward, radius, angle);
        // The way in: a gap of a few stakes facing the path.
        if !(0.28..=std::f64::consts::TAU - 0.28).contains(&angle) {
            continue;
        }
        let height = 2.6 + kit.draw() * 1.0;
        kit.stand(Shape::Column { sides: 5, top: 0.15 }, at, [0.5, 0.5, height], angle, Material::Timber, 0.5);
    }
    fire(kit, middle, 1.6);
    for tent in 0..5 {
        let angle = 0.9 + f64::from(tent) * 1.05 + kit.draw() * 0.3;
        let at = ahead(middle, toward, radius * (0.5 + kit.draw() * 0.2), angle);
        let model = kit.pick(&model::TENTS);
        let facing = [middle[0] - at[0], middle[1] - at[1]];
        let length = (facing[0] * facing[0] + facing[1] * facing[1]).sqrt().max(1e-9);
        kit.prop(model, at, yaw_toward([facing[0] / length, facing[1] / length]));
    }
    for crate_number in 0..7 {
        let at = ahead(middle, toward, radius * 0.75, 2.2 + f64::from(crate_number) * 0.18);
        let model = kit.pick(&model::CRATES);
        let yaw = kit.draw() * 90.0;
        kit.prop(model, at, yaw);
    }
    let cart = kit.pick(&model::CARTS);
    kit.prop(cart, ahead(middle, toward, radius * 0.6, -0.9), yaw_toward(toward) + 20.0);
    let siege_yaw = kit.draw() * 360.0;
    kit.prop(model::SIEGE, ahead(middle, toward, radius * 0.55, 3.6), siege_yaw);
}

/// A fire: a ring of stones round glowing embers.
pub fn fire(kit: &mut Kit, at: [f64; 2], across: f64) {
    for stone in 0..9 {
        let spot = ahead(at, [0.0, -1.0], across / 2.0, f64::from(stone) * std::f64::consts::TAU / 9.0);
        kit.stand(Shape::Dome { sides: 6 }, spot, [0.45, 0.45, 0.3], 0.0, Material::Stone, 0.05);
    }
    kit.stand(Shape::Pyramid { top: 0.2 }, at, [across * 0.5, across * 0.5, 0.35], 0.0, Material::Glow, 0.05);
}

/// How far apart the wilds' cover is set round its ring, and an arena's, metres.
const COVER_APART_M: [f64; 2] = [10.0, 8.0];

/// Open ground where public events are fought, or the arena an instance ends in: outcrops and broken walls in a
/// loose ring for cover, set ten metres apart round it (eight in an arena) and a share left out, round a standing
/// stone that marks the middle. An arena's ring is closer and more whole.
fn ground_of_battle(kit: &mut Kit, area: &Area, arena: bool) {
    let middle = area.at;
    let focus_yaw = kit.draw() * 360.0;
    kit.prop(if arena { model::STATUE } else { model::OBELISK }, middle, focus_yaw);
    let round = std::f64::consts::TAU * area.radius * 0.58 / COVER_APART_M[usize::from(arena)];
    let (rings, gap) = ((round.ceil() as u32).max(10), if arena { 0.85 } else { 0.7 });
    for cover in 0..rings {
        if kit.draw() > gap {
            continue;
        }
        let angle = std::f64::consts::TAU * f64::from(cover) / f64::from(rings) + kit.draw() * 0.25;
        let distance = area.radius * (0.42 + kit.draw() * 0.32);
        let at = ahead(middle, [0.0, -1.0], distance, angle);
        let list: &[u32] = if kit.draw() < 0.5 { &model::ROCKS } else { &model::RUINS };
        let model = kit.pick(list);
        let yaw = angle.to_degrees() + 90.0;
        kit.prop(model, at, yaw);
    }
    for arch in 0..usize::from(arena) * 2 {
        let at = ahead(middle, [0.0, -1.0], area.radius * 0.7, 1.2 + arch as f64 * 3.1);
        let model = kit.pick(&model::RUIN_ARCHES);
        let yaw = kit.draw() * 360.0;
        kit.prop(model, at, yaw);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_point_ahead_is_turned_clockwise_from_its_bearing() {
        let north = [0.0, -1.0];
        let east = ahead([0.0, 0.0], north, 10.0, std::f64::consts::FRAC_PI_2);
        assert!((east[0] - 10.0).abs() < 1e-9 && east[1].abs() < 1e-9, "a quarter turn from north is east: {east:?}");
    }

    #[test]
    fn a_model_faces_the_way_it_is_turned_toward() {
        assert!(yaw_toward([0.0, -1.0]).abs() < 1e-9, "north is yaw 0");
        assert!((yaw_toward([1.0, 0.0]) - 90.0).abs() < 1e-9, "east is yaw 90");
        assert!((turn_along([0.0, 1.0])).abs() < 1e-9, "a solid's own y runs south at turn 0");
    }
}
