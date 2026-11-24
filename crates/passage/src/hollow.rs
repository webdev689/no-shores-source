//! A zone above ground: a hollow of the island's own ground walled by rock, its floor's outline of its form (a round
//! basin, a long winding ravine, terraced shelves, a court squared by old walls, a long dry strand, a grove), its
//! heights on a grid 2 m apart, its walls rising steeply out of its floor 12 to 25 m (too steep for a body), its
//! dressing of the islands' modules (cliffs along its walls, boulders at their feet, and its form's own growth,
//! ruins or wrecks), its section and its sites, all from its seed. Its frame is its own: metres from the middle of its
//! floor, x east, y south.

use crate::sites::{Door, POST_OFF_WAY_IN_M, SPOT_APART_M, Sites, apart, spread};
use crate::zone::{Form, Zone};
use core::f64::consts::{PI, TAU};
use isle::Placement;
use isle::catalog::{Role, catalog};
use isle::draws::{Draws, Noise};
use isle::shape::smooth;
use movement::{Block, Heights};

/// How far apart the ground's heights are, and how far past the floor's farthest reach the ground is laid, metres.
pub const CELL_M: f64 = 2.0;
const PAST_M: f64 = 24.0;
/// The floor's height, and how far its ground rolls round it, metres.
pub const FLOOR_M: f64 = 20.0;
const ROLL_M: f64 = 0.7;
/// How far out from the floor's edge its wall rises, metres, and how high it rises, least and most.
const WALL_RUN_M: f64 = 5.0;
const WALL_RISE_M: (f64, f64) = (12.0, 25.0);
/// A shelf's drop and how many a hollow of shelves has.
const SHELF_DROP_M: f64 = 2.4;
const SHELVES: f64 = 3.0;
/// How far inside the floor's edge its section's ring stands, and how many points round it has.
const RING_IN_M: f64 = 0.5;
const RING_POINTS: usize = 64;
/// How far inside the floor's edge a mouth's middle stands, its back to the rock: twice the ring's, so a body reaches
/// its front inside the section wherever the ring's points fall.
const MOUTH_IN_M: f64 = 1.0;
/// How far inside the edge a spot or a post keeps, and the lattice they are drawn from, metres.
const SPOT_IN_M: f64 = 3.5;
const LATTICE_M: f64 = 3.0;

/// A zone laid above ground.
#[derive(Clone, Debug)]
pub struct Hollow {
    pub ground: Heights,
    pub placements: Vec<Placement>,
    pub blocks: Vec<Block>,
    pub ring: Vec<[f64; 2]>,
}

/// The floor's outline: how far inside it a point lies (negative outside), by its form.
struct Outline {
    form: Form,
    reach: f64,
    /// The ripples of a round edge: each its count, its share of the reach and its turn.
    ripples: [(f64, f64, f64); 2],
    /// A ravine's line from its start to its far end, and its half width.
    line: Vec<[f64; 2]>,
    half_width: f64,
}

impl Outline {
    fn new(form: Form, across: f64, draws: &mut Draws) -> Self {
        let reach = across / 2.0;
        let ripples = [(3.0, 0.10, draws.between(0.0, TAU)), (5.0, 0.05, draws.between(0.0, TAU))];
        let (line, half_width) = if form == Form::Ravine {
            let length = across * 2.2;
            let (bends, sway) = (draws.between(1.5, 2.5), draws.between(0.12, 0.2) * across);
            let turn = draws.between(0.0, TAU);
            let points = (0..=24).map(|step| {
                let along = f64::from(step) / 24.0;
                [-length / 2.0 + length * along, sway * libm::sin(along * bends * PI + turn)]
            });
            (points.collect(), (across * 0.18).max(7.0))
        } else {
            (Vec::new(), 0.0)
        };
        Outline { form, reach, ripples, line, half_width }
    }

    /// The edge's reach at a bearing from the middle (atan2 of y over x), for a round form.
    fn edge(&self, angle: f64) -> f64 {
        let rippled =
            self.ripples.iter().map(|(count, share, turn)| share * libm::sin(count * angle + turn)).sum::<f64>();
        let reach = self.reach * (1.0 + rippled);
        match self.form {
            // A court is squared, an edge of a superellipse.
            Form::Court => {
                let (cosine, sine) = (libm::cos(angle).abs(), libm::sin(angle).abs());
                reach / libm::pow(libm::pow(cosine, 4.0) + libm::pow(sine, 4.0), 0.25)
            }
            // A strand is long: half as deep as it is wide.
            Form::Strand => {
                let (cosine, sine) = (libm::cos(angle), libm::sin(angle));
                reach / libm::sqrt(cosine * cosine + (sine / 0.55) * (sine / 0.55)) * 1.25
            }
            _ => reach,
        }
    }

    /// How far inside the floor a point lies.
    fn inside(&self, [x, y]: [f64; 2]) -> f64 {
        if self.form == Form::Ravine {
            let nearest =
                self.line.windows(2).map(|pair| along_segment([x, y], pair[0], pair[1])).fold(f64::MAX, f64::min);
            return self.half_width - nearest;
        }
        self.edge(libm::atan2(y, x)) - libm::hypot(x, y)
    }

    /// The farthest the floor reaches from its middle.
    fn farthest(&self) -> f64 {
        if self.form == Form::Ravine {
            return self.line.iter().map(|point| libm::hypot(point[0], point[1])).fold(0.0, f64::max) + self.half_width;
        }
        (0..RING_POINTS).map(|step| self.edge(TAU * step as f64 / RING_POINTS as f64)).fold(0.0, f64::max)
    }

    /// The point of the edge, `inward` metres inside it, at a bearing from the middle (a round form) or, for a
    /// ravine, at a share along its line and to a side.
    fn at_edge(&self, angle: f64, inward: f64) -> [f64; 2] {
        let reach = self.edge(angle) - inward;
        [reach * libm::cos(angle), reach * libm::sin(angle)]
    }

    /// The section's ring: the edge a little inside, round it.
    fn ring(&self) -> Vec<[f64; 2]> {
        if self.form != Form::Ravine {
            return (0..RING_POINTS)
                .map(|step| self.at_edge(TAU * step as f64 / RING_POINTS as f64, RING_IN_M))
                .collect();
        }
        let half = self.half_width - RING_IN_M;
        let line = &self.line;
        let side = |sign: f64| {
            (0..line.len()).map(move |at| {
                let (before, after) = (line[at.saturating_sub(1)], line[(at + 1).min(line.len() - 1)]);
                let (east, south) = (after[0] - before[0], after[1] - before[1]);
                let length = libm::hypot(east, south).max(1e-9);
                [line[at][0] - south / length * half * sign, line[at][1] + east / length * half * sign]
            })
        };
        // Each end is rounded: half a circle from one side to the other, round the way it runs out.
        let cap = |last: bool| {
            let (point, out) = self.end(last);
            // From the side the ring reaches the end on, round the way out, to the other.
            let across = [-out[1], out[0]];
            (1..12).map(move |step| {
                let turn = PI * f64::from(step) / 12.0;
                let (sine, cosine) = (libm::sin(turn), libm::cos(turn));
                [
                    point[0] + (across[0] * cosine + out[0] * sine) * half,
                    point[1] + (across[1] * cosine + out[1] * sine) * half,
                ]
            })
        };
        let mut ring: Vec<[f64; 2]> = side(1.0).collect();
        ring.extend(cap(true));
        ring.extend(side(-1.0).collect::<Vec<_>>().into_iter().rev());
        ring.extend(cap(false));
        ring
    }

    /// A ravine's end, its first or its last: the line's point there and the way out of it past the end.
    fn end(&self, last: bool) -> ([f64; 2], [f64; 2]) {
        let line = &self.line;
        let (point, inner) = if last { (line[line.len() - 1], line[line.len() - 2]) } else { (line[0], line[1]) };
        let length = apart(point, inner).max(1e-9);
        (point, [(point[0] - inner[0]) / length, (point[1] - inner[1]) / length])
    }
}

/// The distance from a point to a segment.
fn along_segment(point: [f64; 2], from: [f64; 2], to: [f64; 2]) -> f64 {
    let (east, south) = (to[0] - from[0], to[1] - from[1]);
    let length = east * east + south * south;
    let share = if length < 1e-12 {
        0.0
    } else {
        (((point[0] - from[0]) * east + (point[1] - from[1]) * south) / length).clamp(0.0, 1.0)
    };
    libm::hypot(point[0] - (from[0] + east * share), point[1] - (from[1] + south * share))
}

/// The bearing (clockwise from north) from one point toward another.
fn bearing(from: [f64; 2], to: [f64; 2]) -> f64 {
    libm::atan2(to[0] - from[0], -(to[1] - from[1]))
}

/// A hollow's ground and sites before its dressing.
struct Laying {
    outline: Outline,
    noise: Noise,
    rise: f64,
    shelf_turn: f64,
}

impl Laying {
    /// The floor's own height at a point: rolling, and stepping down in shelves.
    fn floor(&self, [x, y]: [f64; 2]) -> f64 {
        let roll = self.noise.fractal(x / 18.0, y / 18.0, 3) * ROLL_M;
        let shelves = if self.outline.form == Form::Shelves {
            let along = x * libm::cos(self.shelf_turn) + y * libm::sin(self.shelf_turn);
            let step = ((along / self.outline.reach + 1.0) / 2.0 * SHELVES).floor().clamp(0.0, SHELVES - 1.0);
            -step * SHELF_DROP_M
        } else {
            0.0
        };
        FLOOR_M + roll + shelves
    }

    /// The ground's height at a point: the floor inside, its wall rising steeply past the edge, rough on its face.
    fn height(&self, at: [f64; 2]) -> f64 {
        let inside = self.outline.inside(at);
        if inside >= 0.0 {
            return self.floor(at);
        }
        let face = self.noise.fractal(at[0] / 6.0 + 40.0, at[1] / 6.0, 2) * 1.5;
        self.floor(at) + self.rise * smooth(0.0, WALL_RUN_M, -inside) + face * smooth(0.0, 2.0, -inside)
    }

    fn ground(&self) -> Heights {
        let half = ((self.outline.farthest() + PAST_M) / CELL_M).ceil() * CELL_M;
        let cells = (2.0 * half / CELL_M) as usize;
        let mut heights = Vec::with_capacity(cells * cells);
        for row in 0..cells {
            for column in 0..cells {
                let at = [-half + (column as f64 + 0.5) * CELL_M, -half + (row as f64 + 0.5) * CELL_M];
                heights.push(Some(self.height(at)));
            }
        }
        Heights::new(-half, -half, CELL_M, cells, cells, heights).unwrap_or_else(|| unreachable!("a grid of its own"))
    }
}

/// The sites of a hollow: its way in at one end, its onward mouths round the far end, its lamp toward the far end,
/// and its posts and spots on its floor.
fn sites(outline: &Outline, onward_count: usize, lamp: bool, draws: &mut Draws) -> Sites {
    let (way_in_at, ends): ([f64; 2], Vec<[f64; 2]>) = if outline.form == Form::Ravine {
        let reach = outline.half_width - MOUTH_IN_M;
        let ((first, back), (last, out)) = (outline.end(false), outline.end(true));
        let start = [first[0] + back[0] * reach, first[1] + back[1] * reach];
        let across = [-out[1], out[0]];
        let ends = [0.0, 0.9, -0.9].map(|turn: f64| {
            let (sine, cosine) = (libm::sin(PI / 2.0 + turn), libm::cos(PI / 2.0 + turn));
            [
                last[0] + (across[0] * cosine + out[0] * sine) * reach,
                last[1] + (across[1] * cosine + out[1] * sine) * reach,
            ]
        });
        (start, ends.to_vec())
    } else {
        let way = draws.between(0.0, TAU);
        let far = way + PI;
        let spread_angle = if onward_count > 1 { 1.75 / (onward_count - 1) as f64 } else { 0.0 };
        let ends = (0..onward_count.max(1)).map(|number| {
            outline.at_edge(far + (number as f64 - (onward_count as f64 - 1.0) / 2.0) * spread_angle, MOUTH_IN_M)
        });
        (outline.at_edge(way, MOUTH_IN_M), ends.collect())
    };
    let middle = [0.0, 0.0];
    let way_in = Door { at: way_in_at, facing: bearing(way_in_at, middle) };
    let toward = bearing(way_in_at, middle);
    let arrive = [way_in_at[0] + 3.5 * libm::sin(toward), way_in_at[1] - 3.5 * libm::cos(toward)];
    let onward: Vec<Door> =
        ends.into_iter().take(onward_count).map(|at| Door { at, facing: bearing(at, middle) }).collect();
    let far_end = onward.iter().fold([0.0, 0.0], |sum, door| [sum[0] + door.at[0], sum[1] + door.at[1]]);
    let count = onward.len().max(1) as f64;
    let toward_far =
        if onward.is_empty() { [-way_in_at[0], -way_in_at[1]] } else { [far_end[0] / count, far_end[1] / count] };
    // A ravine's lamp stands on its line toward its far end, a round floor's between its middle and its far mouths.
    let lamp = lamp.then(|| {
        if outline.form == Form::Ravine {
            outline.line[outline.line.len() * 7 / 10]
        } else {
            [toward_far[0] * 0.35, toward_far[1] * 0.35]
        }
    });
    let reach = outline.farthest();
    let steps = (reach / LATTICE_M).ceil() as i32;
    let mut floor: Vec<[f64; 2]> = (-steps..=steps)
        .flat_map(|row| (-steps..=steps).map(move |column| [f64::from(column) * LATTICE_M, f64::from(row) * LATTICE_M]))
        .filter(|at| outline.inside(*at) >= SPOT_IN_M)
        .filter(|at| lamp.is_none_or(|lamp| apart(lamp, *at) >= 5.0))
        .filter(|at| onward.iter().chain([&way_in]).all(|door| apart(door.at, *at) >= SPOT_APART_M / 2.0))
        .collect();
    floor.sort_by(|one, other| apart(*one, arrive).total_cmp(&apart(*other, arrive)).then(one[0].total_cmp(&other[0])));
    let posts = spread(floor.iter().copied().filter(|at| apart(*at, arrive) >= POST_OFF_WAY_IN_M), 9.0);
    floor.reverse();
    let spots = spread(floor, SPOT_APART_M);
    Sites { arrive, facing: toward, way_in, onward, lamp, posts, spots }
}

/// A placement of a module by its name, where the contract holds it.
fn placed(name: &str, at: [f64; 3], turn: f64, scale: f64, lift: f64) -> Option<Placement> {
    catalog().number(name).map(|module| Placement { module, at, turn, scale, lift })
}

/// The hollow's dressing: cliffs along its wall facing in, clear of its mouths; boulders at the wall's foot; and its
/// form's own: a grove's trees, a court's ruins, a strand's wrecks and drift, a hollow's grass and shrubs.
fn dress(laying: &Laying, sites: &Sites, kit: &str, draws: &mut Draws) -> Vec<Placement> {
    let outline = &laying.outline;
    let book = catalog();
    let mut placements = Vec::new();
    let mouths: Vec<[f64; 2]> = sites.onward.iter().chain([&sites.way_in]).map(|door| door.at).collect();
    let clear_of_mouths = |at: [f64; 2], off: f64| mouths.iter().all(|mouth| apart(*mouth, at) >= off);
    let ring = outline.ring();
    let mut walked = 0.0;
    let cliffs = book.of(kit, Role::Cliff);
    for pair in ring.windows(2) {
        walked += apart(pair[0], pair[1]);
        if walked < 9.0 || cliffs.is_empty() {
            continue;
        }
        walked = 0.0;
        let middle = [(pair[0][0] + pair[1][0]) / 2.0, (pair[0][1] + pair[1][1]) / 2.0];
        let out = bearing([0.0, 0.0], middle);
        let at = [middle[0] + 3.0 * libm::sin(out), middle[1] - 3.0 * libm::cos(out)];
        if clear_of_mouths(at, 5.0) {
            let module = cliffs[draws.index(cliffs.len())];
            let lift = laying.rise / book.module(module).size[2].max(1.0);
            let base = laying.floor(at) - 1.0;
            placements.push(Placement { module, at: [at[0], at[1], base], turn: out + PI, scale: 1.0, lift });
        }
    }
    let lay_many =
        |role: Role, count: usize, inward: (f64, f64), draws: &mut Draws, placements: &mut Vec<Placement>| {
            let modules = book.of(kit, role);
            for _ in 0..count {
                let Some(&module) = draws.pick(&modules) else { return };
                let angle = draws.between(0.0, TAU);
                let at = if outline.form == Form::Ravine {
                    let line = &outline.line;
                    let point = line[draws.index(line.len())];
                    [point[0], point[1] + draws.between(-1.0, 1.0) * (outline.half_width - inward.0)]
                } else {
                    outline.at_edge(angle, draws.between(inward.0, inward.1))
                };
                if outline.inside(at) > 0.5
                    && clear_of_mouths(at, 4.0)
                    && sites.lamp.is_none_or(|lamp| apart(lamp, at) >= 6.0)
                {
                    let scale = draws.between(0.8, 1.2);
                    placements.push(Placement {
                        module,
                        at: [at[0], at[1], laying.floor(at)],
                        turn: draws.between(0.0, TAU),
                        scale,
                        lift: 1.0,
                    });
                }
            }
        };
    let area = PI * outline.reach * outline.reach;
    lay_many(Role::Boulder, (area * 0.004) as usize + 4, (1.0, 2.5), draws, &mut placements);
    let (trees, shrubs, grass) = match outline.form {
        Form::Grove => (0.010, 0.012, 0.010),
        Form::Hollow | Form::Shelves => (0.0015, 0.006, 0.014),
        Form::Ravine => (0.0008, 0.005, 0.006),
        Form::Court | Form::Strand => (0.0, 0.003, 0.004),
    };
    let reach = outline.reach;
    lay_many(Role::Tree, (area * trees) as usize, (3.0, reach * 0.9), draws, &mut placements);
    lay_many(Role::Shrub, (area * shrubs) as usize, (2.0, reach * 0.95), draws, &mut placements);
    lay_many(Role::Grass, (area * grass) as usize, (1.5, reach), draws, &mut placements);
    if outline.form == Form::Court {
        for name in
            ["common.ruin.wall", "common.ruin.column", "common.ruin.arch", "common.ruin.fallen", "common.ruin.statue"]
        {
            for _ in 0..2 + draws.index(3) {
                let at = outline.at_edge(draws.between(0.0, TAU), draws.between(2.0, reach * 0.8));
                if outline.inside(at) > 1.0
                    && clear_of_mouths(at, 5.0)
                    && sites.lamp.is_none_or(|lamp| apart(lamp, at) >= 6.0)
                {
                    placements.extend(placed(
                        name,
                        [at[0], at[1], laying.floor(at)],
                        draws.between(0.0, TAU),
                        1.0,
                        1.0,
                    ));
                }
            }
        }
    }
    if outline.form == Form::Strand {
        for name in
            ["common.wreck.bow", "common.wreck.stern", "common.wreck.ribs", "common.wreck.mast", "common.wreck.planks"]
        {
            let at = outline.at_edge(draws.between(0.0, TAU), draws.between(4.0, reach * 0.7));
            if outline.inside(at) > 2.0
                && clear_of_mouths(at, 6.0)
                && sites.lamp.is_none_or(|lamp| apart(lamp, at) >= 8.0)
            {
                placements.extend(placed(
                    name,
                    [at[0], at[1], laying.floor(at) - 0.3],
                    draws.between(0.0, TAU),
                    1.0,
                    1.0,
                ));
            }
        }
        lay_many(Role::Drift, 6, (1.0, reach * 0.8), draws, &mut placements);
    }
    placements
}

/// The zone laid above ground in its form, dressed from the islands' kit of `climate`.
pub(crate) fn lay(zone: &Zone, form: Form, climate: &str, onward_count: usize) -> (Hollow, Sites) {
    let mut draws = Draws::of(zone.seed, 0x401);
    let outline = Outline::new(form, zone.size.across(), &mut draws);
    let rise = draws.between(WALL_RISE_M.0, WALL_RISE_M.1);
    let laying = Laying {
        outline,
        noise: Noise::new(isle::draws::mix(zone.seed, 0x402)),
        rise,
        shelf_turn: draws.between(0.0, TAU),
    };
    let sites = sites(&laying.outline, onward_count, zone.has_lamp(), &mut draws);
    let kit = catalog().climates.get(climate).map_or("temperate", |dressing| dressing.kit.as_str());
    let placements = dress(&laying, &sites, kit, &mut draws);
    let blocks = isle::dressing::blocks(&placements);
    let ring = laying.outline.ring();
    (Hollow { ground: laying.ground(), placements, blocks, ring }, sites)
}

/// The height of a hollow's floor at a point, for what stands on it.
#[must_use]
pub fn floor_at(hollow: &Hollow, at: [f64; 2]) -> f64 {
    movement::terrain::Terrain::height_at(&hollow.ground, at[0], at[1])
}
