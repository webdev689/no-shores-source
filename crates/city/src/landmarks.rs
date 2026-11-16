//! Stage H: each port city's landmark, the motif it is known by from the sea, as DFO's Imperial City is known by its
//! tower (see the bible's decision The World as Claude Shapes It). Each is solids, built from the landmark's site, its
//! ground, and the way to the sea.

use crate::landmarks_inland::{granary_ring, great_hall, stepped_temple, sun_dome, windwall};
use crate::solids::{Material, Shape, Solid};
use land::ground::Ground;

/// A landmark: its solids, and how far its base reaches from its middle, metres, so the city builds round it.
#[derive(Debug, Clone, PartialEq)]
pub struct Landmark {
    pub solids: Vec<Solid>,
    pub reach: f64,
}

/// Where a landmark stands: its middle and level, the way to the sea and the way along the coast (both unit vectors,
/// east and south), and how far the shore is along the seaward way.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Site {
    pub centre: [f64; 2],
    pub level: f64,
    pub seaward: [f64; 2],
    pub along: [f64; 2],
    pub shore: f64,
}

/// The turn, clockwise from north, that points a solid's own +y along a direction (east, south).
#[must_use]
pub fn turn_toward(direction: [f64; 2]) -> f64 {
    libm::atan2(-direction[0], direction[1])
}

/// A point `distance` metres from `from` along a direction.
#[must_use]
pub fn ahead(from: [f64; 2], direction: [f64; 2], distance: f64) -> [f64; 2] {
    [from[0] + direction[0] * distance, from[1] + direction[1] * distance]
}

/// A point on a circle round a centre, at a share of the way round clockwise from north.
#[must_use]
pub fn round_point(centre: [f64; 2], radius: f64, share: f64) -> [f64; 2] {
    let angle = std::f64::consts::TAU * share;
    ahead(centre, [libm::sin(angle), -libm::cos(angle)], radius)
}

/// An upright column of `sides` faces.
#[must_use]
pub fn column(at: [f64; 2], base: f64, width: f64, height: f64, top: f64, material: Material) -> Solid {
    Solid::upright(Shape::Column { sides: 24, top }, [at[0], at[1], base], [width, width, height], material)
}

/// A box square to the world.
#[must_use]
pub fn block(at: [f64; 2], base: f64, size: [f64; 3], material: Material) -> Solid {
    Solid::upright(Shape::Block, [at[0], at[1], base], size, material)
}

/// The landmark a motif names, or None for a motif the city does not know.
#[must_use]
pub fn landmark(motif: &str, site: &Site, ground: &Ground) -> Option<Landmark> {
    Some(match motif {
        "beacon" => beacon(site),
        "span" => span(site, ground),
        "great-hall" => great_hall(site),
        "sun-dome" => sun_dome(site),
        "granary-ring" => granary_ring(site, ground),
        "stepped-temple" => stepped_temple(site),
        "windwall" => windwall(site, ground),
        "drowned-bell" => drowned_bell(site),
        "whalebone-gate" => whalebone_gate(site, ground),
        _ => return None,
    })
}

/// Overlook's Beacon: a round lighthouse-citadel on a stepped base, its fire 300 m over the headland.
fn beacon(site: &Site) -> Landmark {
    let (centre, level) = (site.centre, site.level);
    let mut solids = vec![
        block(centre, level, [150.0, 150.0, 18.0], Material::Stone),
        block(centre, level + 18.0, [116.0, 116.0, 16.0], Material::Stone),
        block(centre, level + 34.0, [86.0, 86.0, 14.0], Material::Stone),
    ];
    for corner in [[-1.0, -1.0], [1.0, -1.0], [1.0, 1.0], [-1.0, 1.0]] {
        let at = [centre[0] + corner[0] * 68.0, centre[1] + corner[1] * 68.0];
        solids.push(column(at, level, 16.0, 30.0, 1.0, Material::Stone));
        solids.push(column(at, level + 30.0, 19.0, 12.0, 0.0, Material::Roof));
    }
    let (shaft_base, shaft_height, shaft_width, taper) = (level + 48.0, 220.0, 44.0, 0.72);
    solids.push(column(centre, shaft_base, shaft_width, shaft_height, taper, Material::Stone));
    for band in 1..=4 {
        let height = 44.0 * f64::from(band);
        let width = shaft_width * (1.0 - (1.0 - taper) * height / shaft_height) + 2.5;
        solids.push(column(centre, shaft_base + height, width, 2.4, 1.0, Material::Trim));
    }
    let top = shaft_base + shaft_height;
    solids.extend([
        column(centre, top, 40.0, 5.0, 1.0, Material::Trim),
        column(centre, top + 5.0, 22.0, 24.0, 1.0, Material::Glow),
        column(centre, top + 29.0, 24.0, 2.0, 1.0, Material::Iron),
        Solid::upright(
            Shape::Dome { sides: 24 },
            [centre[0], centre[1], top + 31.0],
            [24.0, 24.0, 12.0],
            Material::Gold,
        ),
        column(centre, top + 43.0, 4.0, 40.0, 0.0, Material::Gold),
    ]);
    Landmark { solids, reach: 110.0 }
}

/// Cairnwatch's Span: an aqueduct straight through the city along the coast, its arches 60 m over the highest ground
/// they cross, and a cistern keep at its head.
fn span(site: &Site, ground: &Ground) -> Landmark {
    const BAY_M: f64 = 48.0;
    const BAYS: i32 = 50;
    let turn = turn_toward(site.along);
    let at = |bay: f64| ahead(site.centre, site.along, (bay - f64::from(BAYS) / 2.0) * BAY_M);
    let heights: Vec<f64> =
        (0..=BAYS).map(|pier| ground.height_at(at(f64::from(pier))[0], at(f64::from(pier))[1])).collect();
    let deck = heights.iter().copied().fold(site.level, f64::max) + 60.0;
    let mut solids = Vec::new();
    for pier in 0..=BAYS {
        let foot = heights[pier as usize];
        solids.push(block(at(f64::from(pier)), foot, [10.0, 8.0, deck - foot], Material::Stone).turned(turn));
    }
    for bay in 0..BAYS {
        let middle = at(f64::from(bay) + 0.5);
        let foot = heights[bay as usize].min(heights[bay as usize + 1]);
        let arch = Solid::upright(
            Shape::Arch { opening: 0.86 },
            [middle[0], middle[1], foot],
            [BAY_M - 10.0, 8.0, deck - foot],
            Material::Stone,
        );
        solids.push(arch.turned(turn + std::f64::consts::FRAC_PI_2));
        solids.push(block(middle, deck, [12.0, BAY_M, 4.0], Material::Trim).turned(turn));
    }
    let head = ahead(at(0.0), site.along, -50.0);
    let head_ground = ground.height_at(head[0], head[1]);
    solids.push(block(head, head_ground, [72.0, 72.0, deck - head_ground + 8.0], Material::Stone).turned(turn));
    for corner in 0..4 {
        let point = round_point(head, 50.0, 0.125 + f64::from(corner) / 4.0);
        solids.push(column(point, head_ground, 18.0, deck - head_ground + 24.0, 1.0, Material::Stone));
        solids.push(column(point, deck + 24.0, 21.0, 14.0, 0.0, Material::Roof));
    }
    Landmark { solids, reach: 60.0 }
}

/// Fenhallow's Drowned Bell: a bell tower leaning five degrees toward the sea from a stone plinth.
fn drowned_bell(site: &Site) -> Landmark {
    let lean = 5.0_f64.to_radians();
    let turn = turn_toward(site.seaward);
    let (shaft, belfry) = (190.0, 24.0);
    let leaning = |base: f64, size: [f64; 3], shape: Shape, material: Material| {
        let along = libm::sin(lean) * base;
        let foot = ahead(site.centre, site.seaward, along);
        Solid {
            lean,
            ..Solid::upright(shape, [foot[0], foot[1], site.level + 6.0 + libm::cos(lean) * base], size, material)
                .turned(turn)
        }
    };
    let solids = vec![
        block(site.centre, site.level, [64.0, 64.0, 6.0], Material::Stone),
        leaning(0.0, [26.0, 26.0, shaft], Shape::Block, Material::Stone),
        leaning(shaft, [30.0, 30.0, 2.0], Shape::Block, Material::Trim),
        leaning(shaft + 2.0, [28.0, 28.0, belfry], Shape::Arch { opening: 0.75 }, Material::Plaster),
        leaning(shaft + 2.0 + belfry, [32.0, 32.0, 26.0], Shape::Pyramid { top: 0.0 }, Material::Roof),
    ];
    Landmark { solids, reach: 40.0 }
}

/// Rimeholt's Whalebone Gate: two curved tusks rising from a sea wall at the harbour mouth to meet 250 m up, with a
/// longhall at the landmark's own site.
fn whalebone_gate(site: &Site, ground: &Ground) -> Landmark {
    const SEGMENTS: usize = 16;
    let (rise, spread) = (250.0, 90.0);
    let mouth = ahead(site.centre, site.seaward, site.shore);
    let wall_top = 0.0_f64.max(ground.height_at(mouth[0], mouth[1])) + 16.0;
    let turn = turn_toward(site.along);
    let mut solids = vec![
        block(mouth, wall_top - 22.0, [14.0, 640.0, 22.0], Material::Stone).turned(turn),
        block(site.centre, site.level, [70.0, 30.0, 14.0], Material::Timber).turned(turn),
        Solid::upright(
            Shape::Gable,
            [site.centre[0], site.centre[1], site.level + 14.0],
            [74.0, 34.0, 16.0],
            Material::Roof,
        )
        .turned(turn + std::f64::consts::FRAC_PI_2),
    ];
    for side in [-1.0, 1.0] {
        let foot = ahead(mouth, site.along, side * spread);
        let point = |share: f64| {
            let quarter = share * std::f64::consts::FRAC_PI_2;
            let inward = spread * (1.0 - libm::cos(quarter));
            (ahead(foot, site.along, -side * inward), wall_top + rise * libm::sin(quarter))
        };
        for segment in 0..SEGMENTS {
            let ((from, low), (to, high)) =
                (point(segment as f64 / SEGMENTS as f64), point((segment + 1) as f64 / SEGMENTS as f64));
            let (east, south, up) = (to[0] - from[0], to[1] - from[1], high - low);
            let run = (east * east + south * south).sqrt();
            let width = 22.0 - 14.0 * segment as f64 / SEGMENTS as f64;
            let length = (run * run + up * up).sqrt() + width * 0.3;
            let shape = Shape::Column { sides: 12, top: 0.9 };
            let solid = Solid::upright(shape, [from[0], from[1], low], [width, width, length], Material::Bone);
            solids.push(Solid {
                lean: libm::atan2(run, up),
                ..solid.turned(turn_toward([east / run.max(1e-9), south / run.max(1e-9)]))
            });
        }
    }
    Landmark { solids, reach: 50.0 }
}
