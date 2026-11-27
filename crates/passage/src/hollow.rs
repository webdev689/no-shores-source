//! A zone above ground: a hollow of the island's own ground walled by rock, its floor's outline of its form (a round
//! basin, a long winding ravine, terraced shelves, a court squared by old walls, a long dry strand, a grove), its
//! heights on a grid 2 m apart, its walls rising steeply out of its floor 12 to 25 m (a body walks up them only
//! aslant, and its ground ends a little past their top, a wall of the ground no body climbs), its dressing of the
//! islands' modules (cliffs along its walls, boulders at their feet, and its form's own growth, ruins or wrecks), its
//! section and its sites, all from its seed. Its frame is its own: metres from the middle of its floor, x east, y
//! south.

use crate::sites::{Door, SPOT_APART_M, Sites, apart, posts_off_arrival, spots_of};
use crate::zone::{Deal, Form, Mission, Zone};
use core::f64::consts::{FRAC_PI_2, PI, TAU};
use isle::Placement;
use isle::catalog::{Role, catalog};
use isle::draws::{Draws, Noise};
use isle::shape::smooth;
use movement::{Block, Heights};

/// How far apart the ground's heights are, and how far past the floor's farthest reach their grid is laid, metres:
/// past the wall's lip, where its ground ends for a body and the page draws its rim.
pub const CELL_M: f64 = 2.0;
const PAST_M: f64 = 24.0;
/// The floor's height, and how far its ground rolls round it, metres.
pub const FLOOR_M: f64 = 20.0;
const ROLL_M: f64 = 0.7;
/// How far out from the floor's edge its wall rises, metres, and how high it rises, least and most.
const WALL_RUN_M: f64 = 5.0;
const WALL_RISE_M: (f64, f64) = (12.0, 25.0);
/// How far past its full rise a wall's ground runs before it ends, metres. The movement rules let a body walk up any
/// slope if it goes aslant enough, so no steepness holds it; where the ground ends, a wall of the ground does. A body
/// that scrambles up a wall aslant is held on its lip, inside the zone's bounds.
const LIP_M: f64 = 2.0;
/// A shelf's drop and how many a hollow of shelves has, and how wide the bank between two shelves runs: 8 m, so its
/// steepest (half again its mean, 0.45) is walked up as the navmesh's 0.7 allows, and no shelf stands cut off.
const SHELF_DROP_M: f64 = 2.4;
const SHELVES: f64 = 3.0;
const BANK_M: f64 = 8.0;
/// How far inside the floor's edge its floor's ring stands, and how many points round it has.
const RING_IN_M: f64 = 0.5;
const RING_POINTS: usize = 64;
/// How far inside the floor's edge a mouth's middle stands, its back to the rock: twice the ring's, so a body reaches
/// its front inside the floor's ring wherever the ring's points fall.
const MOUTH_IN_M: f64 = 1.0;
/// How far inside the edge a spot or a post keeps, and the lattice they are drawn from, metres.
const SPOT_IN_M: f64 = 3.5;
const LATTICE_M: f64 = 3.0;
/// How far inside the floor's ring a Hold's ring's edge lies at least; how far past it its levelled floor reaches,
/// and how far that floor eases into the floor round it, metres.
const RING_CLEAR_M: f64 = 0.25;
const LEVEL_PAST_M: f64 = 1.0;
const LEVEL_BANK_M: f64 = 4.0;
/// How far a piece of dressing's footprint keeps from the arrival, from a mouth's middle or a spot (a body's reach of
/// it), from the lamp's middle (past its ring of stones) and past a band's spread round its post (a body's room),
/// metres.
const ARRIVAL_CLEAR_M: f64 = 5.0;
const MOUTH_CLEAR_M: f64 = 2.5;
const LAMP_CLEAR_M: f64 = 4.5;
const BAND_CLEAR_M: f64 = 1.0;
/// How far a growing module's plant spreads at least, metres: the page draws it as a plant of its climate's low layer
/// (`isleNature.ts`), whose 4 m slots are wider than a grass module's footprint.
const GROWN_REACH_M: f64 = 2.0;
/// How many places a piece of dressing is tried at before it is left out.
const PLACE_TRIES: usize = 8;
/// The scales a strand's wreck is tried at in turn, so a small strand still stands a hull.
const WRECK_SCALES: [f64; 3] = [1.0, 0.7, 0.5];
/// How far apart a hollow's posts keep at least, metres.
const POST_APART_M: f64 = 9.0;

/// A zone laid above ground.
#[derive(Clone, Debug)]
pub struct Hollow {
    pub ground: Heights,
    pub placements: Vec<Placement>,
    pub blocks: Vec<Block>,
    /// The floor's ring, a little inside its edge.
    pub ring: Vec<[f64; 2]>,
    /// The section's ring: the square its ground is laid in, which holds every place a body stands.
    pub bounds: Vec<[f64; 2]>,
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

    /// The floor's ring: the edge a little inside, round it.
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
    /// A Hold's ring's middle, where the floor is levelled round it, and its floor's height there.
    level: Option<([f64; 2], f64)>,
}

impl Laying {
    /// The floor's height at a point: its own, but levelled round a Hold's ring, a cleared circle whose stones lie in
    /// it, eased into the floor round it over LEVEL_BANK_M.
    fn floor(&self, at: [f64; 2]) -> f64 {
        let own = self.own_floor(at);
        let Some((middle, height)) = self.level else { return own };
        let past = apart(at, middle) - crate::plan::RING_M - LEVEL_PAST_M;
        let into = (past / LEVEL_BANK_M).clamp(0.0, 1.0);
        height + (own - height) * into * into * (3.0 - 2.0 * into)
    }

    /// The floor's own height at a point: rolling, and stepping down in shelves.
    fn own_floor(&self, [x, y]: [f64; 2]) -> f64 {
        let roll = self.noise.fractal(x / 18.0, y / 18.0, 3) * ROLL_M;
        let shelves = if self.outline.form == Form::Shelves {
            let along = x * libm::cos(self.shelf_turn) + y * libm::sin(self.shelf_turn);
            let shelf = ((along / self.outline.reach + 1.0) / 2.0 * SHELVES).clamp(0.0, SHELVES - 1.0);
            let whole = shelf.floor();
            // The bank's share of a shelf, eased into the next shelf down over its last stretch.
            let bank = (BANK_M * SHELVES / (2.0 * self.outline.reach)).min(0.5);
            let into = (((shelf - whole) - (1.0 - bank)) / bank).clamp(0.0, 1.0);
            -(whole + into * into * (3.0 - 2.0 * into)) * SHELF_DROP_M
        } else {
            0.0
        };
        FLOOR_M + roll + shelves
    }

    /// The ground's height at a point: the floor inside, its wall rising steeply past the edge, rough on its face, and
    /// none LIP_M past its full rise.
    fn height(&self, at: [f64; 2]) -> Option<f64> {
        let inside = self.outline.inside(at);
        if inside >= 0.0 {
            return Some(self.floor(at));
        }
        if -inside > WALL_RUN_M + LIP_M {
            return None;
        }
        let face = self.noise.fractal(at[0] / 6.0 + 40.0, at[1] / 6.0, 2) * 1.5;
        Some(self.floor(at) + self.rise * smooth(0.0, WALL_RUN_M, -inside) + face * smooth(0.0, 2.0, -inside))
    }

    /// The ground's heights, and its bounds: the square they are laid in.
    fn ground(&self) -> (Heights, Vec<[f64; 2]>) {
        let half = ((self.outline.farthest() + PAST_M) / CELL_M).ceil() * CELL_M;
        let cells = (2.0 * half / CELL_M) as usize;
        let mut heights = Vec::with_capacity(cells * cells);
        for row in 0..cells {
            for column in 0..cells {
                heights
                    .push(self.height([-half + (column as f64 + 0.5) * CELL_M, -half + (row as f64 + 0.5) * CELL_M]));
            }
        }
        let ground = Heights::new(-half, -half, CELL_M, cells, cells, heights);
        let bounds = vec![[-half, -half], [half, -half], [half, half], [-half, half]];
        (ground.unwrap_or_else(|| unreachable!("a grid of its own")), bounds)
    }
}

/// The sites of a hollow: its way in at one end, its onward mouths round the far end, its lamp toward the far end,
/// and its posts (as many as `posts_wanted`, none nearer the arrival than `posts_off`) and spots on its floor, a Hold's `ring` first where it lies whole.
fn sites(
    outline: &Outline,
    (onward_count, lamp, ring, wanted, (posts_wanted, posts_off)): (usize, bool, bool, usize, (usize, f64)),
    draws: &mut Draws,
) -> Sites {
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
    let off_way_in: Vec<[f64; 2]> = floor.iter().copied().filter(|at| apart(*at, arrive) >= posts_off).collect();
    let posts = posts_of(&off_way_in, arrive, posts_wanted);
    floor.reverse();
    // A Hold's ring, the first spot's, stands the farthest from the way in where it lies whole on the floor clear of
    // the mouths, else where most of it does.
    if ring {
        // How far inside the floor's ring the ring's edge lies at its shallowest, sampled every 10 degrees.
        let shallowest = |middle: [f64; 2]| {
            let radius = crate::plan::RING_M;
            let edge = (0..36_u32).map(|step| f64::from(step) * TAU / 36.0);
            let edge = edge.map(|turn| [middle[0] + radius * libm::sin(turn), middle[1] - radius * libm::cos(turn)]);
            edge.map(|at| outline.inside(at) - RING_IN_M).fold(f64::INFINITY, f64::min)
        };
        // Its stones kept as far from a mouth's doorway as the dressing is, so none seems to touch.
        let clear_of_pieces = |middle: &[f64; 2]| {
            onward.iter().chain([&way_in]).all(|door| apart(door.at, *middle) >= crate::plan::RING_M + MOUTH_CLEAR_M)
        };
        let whole = floor.iter().position(|at| shallowest(*at) >= RING_CLEAR_M && clear_of_pieces(at));
        let deepest_of = |clear: bool| {
            let held = (0..floor.len()).filter(|at| !clear || clear_of_pieces(&floor[*at]));
            held.max_by(|one, other| shallowest(floor[*one]).total_cmp(&shallowest(floor[*other])))
        };
        if let Some(best) = whole.or_else(|| deepest_of(true)).or_else(|| deepest_of(false)) {
            let middle = floor.remove(best);
            floor.insert(0, middle);
        }
    }
    let spots = spots_of(&floor, wanted);
    Sites { arrive, facing: toward, way_in, onward, lamp, posts, spots }
}

/// `count` of `places` (the nearest the arrival first) spread over the floor: the nearest, then each the farthest
/// from those taken and from the arrival, none nearer another than POST_APART_M; the nearest the way in first.
fn posts_of(places: &[[f64; 2]], arrive: [f64; 2], count: usize) -> Vec<[f64; 2]> {
    let mut posts: Vec<[f64; 2]> = places.first().copied().into_iter().take(count).collect();
    while posts.len() < count {
        let room = |at: &[f64; 2]| posts.iter().chain([&arrive]).map(|post| apart(*post, *at)).fold(f64::MAX, f64::min);
        let Some(&next) = places.iter().max_by(|one, other| room(one).total_cmp(&room(other))) else { break };
        if room(&next) < POST_APART_M {
            break;
        }
        posts.push(next);
    }
    posts.sort_by(|one, other| apart(*one, arrive).total_cmp(&apart(*other, arrive)));
    posts
}

/// A placement of a module by its name, where the contract holds it.
fn placed(name: &str, at: [f64; 3], turn: f64, scale: f64, lift: f64) -> Option<Placement> {
    catalog().number(name).map(|module| Placement { module, at, turn, scale, lift })
}

/// The hollow's dressing: cliffs along its wall facing in, clear of its mouths; boulders at the wall's foot; and its
/// form's own: a grove's trees, a court's ruins, a strand's wrecks and drift, a hollow's grass and shrubs.
fn dress(laying: &Laying, (sites, wanted): (&Sites, usize), kit: &str, draws: &mut Draws) -> Vec<Placement> {
    let outline = &laying.outline;
    let book = catalog();
    let mut placements = Vec::new();
    let mouths: Vec<[f64; 2]> = sites.onward.iter().chain([&sites.way_in]).map(|door| door.at).collect();
    let clear_of_mouths = |at: [f64; 2], off: f64| mouths.iter().all(|mouth| apart(*mouth, at) >= off);
    // A module's footprint, the round its turned base fills, kept clear of the arrival, the mouths, the `wanted`
    // spots the deal stands its things on, the lamp, where each band stands round its post and a Hold's levelled
    // ring, so a body walks in, sees the zone and reaches every mouth, thing and foe.
    let clear = |at: [f64; 2], module: u16, scale: f64| {
        let reach = reach_of(module, scale);
        apart(sites.arrive, at) - reach >= ARRIVAL_CLEAR_M
            && clear_of_mouths(at, reach + MOUTH_CLEAR_M)
            && sites.spots.iter().take(wanted).all(|spot| apart(*spot, at) - reach >= MOUTH_CLEAR_M)
            && sites.lamp.is_none_or(|lamp| apart(lamp, at) - reach >= LAMP_CLEAR_M)
            && sites.posts.iter().all(|post| apart(*post, at) - reach >= crate::walk::BAND_SPREAD_M + BAND_CLEAR_M)
            && laying.level.is_none_or(|(ring, _)| apart(ring, at) - reach >= crate::plan::RING_M + LEVEL_PAST_M)
    };
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
        // Out along the wall's own normal, the side the floor falls away on: a ravine's bends turn a bearing from
        // its middle back over its floor.
        let along = bearing(pair[0], pair[1]);
        let side = |turn: f64| [middle[0] + libm::sin(turn), middle[1] - libm::cos(turn)];
        let (left, right) = (along - FRAC_PI_2, along + FRAC_PI_2);
        let out = if outline.inside(side(left)) < outline.inside(side(right)) { left } else { right };
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
            // The small boulder is stacked blocks, which at a wall's foot read as boxes left there: only the round
            // and the split ones stand in a hollow.
            let mut modules = book.of(kit, role);
            modules.retain(|&module| !book.names[usize::from(module)].ends_with(".boulder.c"));
            let laid = placements.len();
            for _ in 0..count * PLACE_TRIES {
                if placements.len() >= laid + count {
                    return;
                }
                let Some(&module) = draws.pick(&modules) else { return };
                let angle = draws.between(0.0, TAU);
                let at = if outline.form == Form::Ravine {
                    let line = &outline.line;
                    let point = line[draws.index(line.len())];
                    [point[0], point[1] + draws.between(-1.0, 1.0) * (outline.half_width - inward.0)]
                } else {
                    outline.at_edge(angle, draws.between(inward.0, inward.1))
                };
                let scale = draws.between(0.8, 1.2);
                if outline.inside(at) > 0.5 && clear(at, module, scale) {
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
            let (count, laid) = (2 + draws.index(3), placements.len());
            for _ in 0..count * PLACE_TRIES {
                let at = outline.at_edge(draws.between(0.0, TAU), draws.between(2.0, reach * 0.8));
                if placements.len() >= laid + count {
                    break;
                }
                if outline.inside(at) > 1.0 && book.number(name).is_some_and(|module| clear(at, module, 1.0)) {
                    let turn = draws.between(0.0, TAU);
                    placements.extend(placed(name, [at[0], at[1], laying.floor(at)], turn, 1.0, 1.0));
                }
            }
        }
    }
    if outline.form == Form::Strand {
        for name in
            ["common.wreck.bow", "common.wreck.stern", "common.wreck.ribs", "common.wreck.mast", "common.wreck.planks"]
        {
            // Tried whole, then smaller, between the strand's mouths and spots.
            let tries = WRECK_SCALES.into_iter().flat_map(|scale| core::iter::repeat_n(scale, PLACE_TRIES * 2));
            for scale in tries {
                let at = outline.at_edge(draws.between(0.0, TAU), draws.between(4.0, reach * 0.7));
                if outline.inside(at) > 2.0 && book.number(name).is_some_and(|module| clear(at, module, scale)) {
                    let turn = draws.between(0.0, TAU);
                    placements.extend(placed(name, [at[0], at[1], laying.floor(at) - 0.3], turn, scale, 1.0));
                    break;
                }
            }
        }
        lay_many(Role::Drift, 6, (1.0, reach * 0.8), draws, &mut placements);
    }
    // No plant grows through a ruin or a wreck: each laid before them is pulled up where their footprints meet.
    let built: Vec<Placement> = placements
        .iter()
        .filter(|placement| matches!(book.module(placement.module).role, Role::Ruin | Role::Wreck | Role::WreckBit))
        .copied()
        .collect();
    placements.retain(|plant| {
        !grows(plant.module)
            || built.iter().all(|other| {
                apart([plant.at[0], plant.at[1]], [other.at[0], other.at[1]])
                    >= reach_of(plant.module, plant.scale) + reach_of(other.module, other.scale)
            })
    });
    placements
}

/// Whether a module stands as a plant: the page draws a tree, a shrub or grass as a plant of its climate.
fn grows(module: u16) -> bool {
    matches!(catalog().module(module).role, Role::Tree | Role::Shrub | Role::Grass)
}

/// How far a module's footprint reaches from its middle at `scale`: the round its turned base fills, and for a plant
/// at least as far as the plant the page draws for it spreads.
fn reach_of(module: u16, scale: f64) -> f64 {
    let size = catalog().module(module).size;
    let reach = libm::hypot(size[0], size[1]) / 2.0 * scale;
    if grows(module) { reach.max(GROWN_REACH_M) } else { reach }
}

/// The zone's layings above ground in its form, dressed from the islands' kit of `climate`: its outline, ground and
/// sites laid once, each laying dressed anew, the first on the draws its sites left, each after on draws of its own.
pub(crate) fn layings(
    zone: &Zone,
    form: Form,
    climate: &str,
    onward_count: usize,
) -> impl Iterator<Item = (Hollow, Sites)> + use<> {
    let mut draws = Draws::of(zone.seed, 0x401);
    let outline = Outline::new(form, zone.size.across(), &mut draws);
    let rise = draws.between(WALL_RISE_M.0, WALL_RISE_M.1);
    let mut laying = Laying {
        outline,
        noise: Noise::new(isle::draws::mix(zone.seed, 0x402)),
        rise,
        shelf_turn: draws.between(0.0, TAU),
        level: None,
    };
    let wanted = crate::plan::spots_wanted(zone.deal);
    let ring = zone.deal == Deal::Mission(Mission::Hold);
    let asked = (onward_count, zone.has_lamp(), ring, wanted, (zone.size.posts(), posts_off_arrival(zone)));
    let sites = sites(&laying.outline, asked, &mut draws);
    laying.level = sites.spots.first().filter(|_| ring).map(|&middle| (middle, laying.own_floor(middle)));
    let kit = catalog().climates.get(climate).map_or("temperate", |dressing| dressing.kit.as_str()).to_owned();
    let ((ground, bounds), ring, seed) = (laying.ground(), laying.outline.ring(), zone.seed);
    (0..).map(move |attempt: u64| {
        let mut dressing = if attempt == 0 { draws.clone() } else { Draws::of(seed, 0x500 + attempt) };
        let placements = dress(&laying, (&sites, wanted), &kit, &mut dressing);
        let blocks = isle::dressing::blocks(&placements);
        let hollow = Hollow { ground: ground.clone(), placements, blocks, ring: ring.clone(), bounds: bounds.clone() };
        (hollow, sites.clone())
    })
}

/// The height of a hollow's floor at a point, for what stands on it.
#[must_use]
pub fn floor_at(hollow: &Hollow, at: [f64; 2]) -> f64 {
    movement::terrain::Terrain::height_at(&hollow.ground, at[0], at[1])
}

#[cfg(test)]
#[path = "hollow_tests.rs"]
mod tests;
