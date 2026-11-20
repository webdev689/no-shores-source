//! How a layout carves its land (the land crate's sculpt): each area a basin shaped by its kind (basins.rs), each path
//! a canyon as wide as its tier wants, a gorge out of the claim at each gate and toward the sea from the landing, and
//! outcrops standing up in its open ground for cover and to break the long views, the rest raised into a massif
//! whose stepped cliffs are the layout's bounds. How high the massif stands is the biome's: tall in the highland and
//! the desert, low in the swamp; and its outcrops' shape is its brief's, or its climate's.

use crate::areas::Area;
use crate::basins::{Basin, basin};
use crate::brief::{AreaKind, Brief};
use crate::field::{Field, distance};
use crate::paths::{Path, Tier, off_line, rect_off_line, segments_apart, simplified};
use crate::seat::Seating;
use land::exact::rand01;
use land::sculpts::{Outcrop, Sculpt, Sculpts, Shape};

/// A canyon's half-width along each tier of path, metres.
const TRACK_HALF_M: f64 = 15.0;
const FOOTPATH_HALF_M: f64 = 11.0;
/// A slot's half-width, metres, along a way that runs long between places; a bay's, at a bend or a crossing. Each stays
/// wider than the way's walked half (its road bed, 4.5 m across a track) plus 3 m.
const TRACK_SLOT_M: f64 = 11.0;
const FOOTPATH_SLOT_M: f64 = 7.0;
const TRACK_BAY_M: f64 = 22.0;
const FOOTPATH_BAY_M: f64 = 18.0;
/// How far from every area a segment lies to be in a slot (past the area's reach), and how long the run of such
/// segments must be, metres.
const SLOT_FROM_AREAS_M: f64 = 60.0;
const SLOT_RUN_M: f64 = 80.0;
/// The cosine of a bend's turn at which it opens to a bay (0.5 rad), so no trigonometry is asked.
const BEND_COSINE: f64 = 0.877_582_561_890_372_7;
/// How near a river crossing's dry point a segment must pass to open to a bay, metres.
const CROSSING_REACH_M: f64 = 12.0;
/// How far a gate's gorge runs on past the claim's edge, metres.
const EXIT_M: f64 = 60.0;

/// The massif's height a biome stands, metres.
#[must_use]
pub fn rise_of(biome: Option<&str>) -> f64 {
    match biome {
        Some("highland") => 38.0,
        Some("desert") => 34.0,
        Some("tundra") => 30.0,
        Some("temperate-coast") => 28.0,
        Some("steppe" | "savanna") => 22.0,
        Some("woodland" | "rainforest") => 24.0,
        Some("swamp") => 12.0,
        _ => 26.0,
    }
}

/// The shape a layout's outcrops stand in: its brief's, or else its biome's.
#[must_use]
pub fn shape_of(brief: &Brief, biome: Option<&str>) -> Shape {
    brief.rock.unwrap_or(match biome {
        Some("desert" | "steppe" | "savanna") => Shape::Mesa,
        Some("highland" | "tundra") => Shape::Crag,
        Some("rainforest") => Shape::Knoll,
        Some("swamp") => Shape::Hummock,
        _ => Shape::Tor,
    })
}

/// Whether a way turns sharper than a bend at one of its points.
fn bends(points: &[[f64; 2]], at: usize) -> bool {
    if at == 0 || at + 1 >= points.len() {
        return false;
    }
    let (before, after) = (
        [points[at][0] - points[at - 1][0], points[at][1] - points[at - 1][1]],
        [points[at + 1][0] - points[at][0], points[at + 1][1] - points[at][1]],
    );
    let lengths = distance([0.0, 0.0], before) * distance([0.0, 0.0], after);
    lengths > 0.0 && (before[0] * after[0] + before[1] * after[1]) < BEND_COSINE * lengths
}

/// The half-width of a path's canyon along its segment `index` (from `points[index]` to the next, the path as
/// simplified): a bay at a bend or where it crosses water, a slot where it runs on between places, else its tier's.
#[must_use]
pub fn canyon_half(path: &Path, index: usize, points: &[[f64; 2]], areas: &[Area]) -> f64 {
    let (plain, slot, bay) = match path.tier {
        Tier::Track => (TRACK_HALF_M, TRACK_SLOT_M, TRACK_BAY_M),
        Tier::Footpath => (FOOTPATH_HALF_M, FOOTPATH_SLOT_M, FOOTPATH_BAY_M),
    };
    let (from, to) = (points[index], points[index + 1]);
    let wet = path.crossings.iter().flatten().any(|&dry| off_line(dry, from, to) < CROSSING_REACH_M);
    if bends(points, index) || bends(points, index + 1) || wet {
        return bay;
    }
    let far = |at: usize| {
        areas.iter().all(|area| off_line(area.at, points[at], points[at + 1]) - area.radius > SLOT_FROM_AREAS_M)
    };
    let span = |at: usize| distance(points[at], points[at + 1]);
    if !far(index) {
        return plain;
    }
    let mut run = span(index);
    let mut back = index;
    while back > 0 && far(back - 1) {
        back -= 1;
        run += span(back);
    }
    let mut ahead = index + 1;
    while ahead + 1 < points.len() && far(ahead) {
        run += span(ahead);
        ahead += 1;
    }
    if run >= SLOT_RUN_M { slot } else { plain }
}

/// The half-width of a path's canyon where a point of it lies (the nearest segment's).
#[must_use]
pub fn canyon_half_at(path: &Path, at: [f64; 2], areas: &[Area]) -> f64 {
    let points = simplified(&path.points, 3.0);
    let nearest = (0..points.len().saturating_sub(1)).min_by(|&first, &second| {
        off_line(at, points[first], points[first + 1]).total_cmp(&off_line(at, points[second], points[second + 1]))
    });
    nearest.map_or(if path.tier == Tier::Track { TRACK_HALF_M } else { FOOTPATH_HALF_M }, |index| {
        canyon_half(path, index, &points, areas)
    })
}

/// The capsule from a point to the claim's edge along a way, and on past it.
pub(crate) fn gorge(field: &Field, from: [f64; 2], way: [f64; 2], half: f64) -> [f64; 5] {
    let mut reach = 0.0;
    while reach < 2000.0 {
        let at = [from[0] + way[0] * reach, from[1] + way[1] * reach];
        if field.cell_of(at[0], at[1]).is_none_or(|(column, row)| !field.claimed[field.index(column, row)]) {
            break;
        }
        reach += 8.0;
    }
    let end = [from[0] + way[0] * (reach + EXIT_M), from[1] + way[1] * (reach + EXIT_M)];
    [from[0], from[1], end[0], end[1], half]
}

/// What a layout's floor is carved round: its areas, its paths, the gorges out of it (each a start and a way), the
/// pockets off its paths where its resources lie, the water meadows along a river its brief names, each area's level
/// (`heights`, all the land's own where the brief asks for none), and the two areas each path was laid between.
#[derive(Debug, Clone, Copy)]
pub struct Network<'layout> {
    pub areas: &'layout [Area],
    pub paths: &'layout [Path],
    pub exits: &'layout [([f64; 2], [f64; 2])],
    pub pockets: &'layout [[f64; 2]],
    pub meadows: &'layout [[f64; 5]],
    pub levels: &'layout [f64],
    pub joined: &'layout [[usize; 2]],
    /// Which areas stand a module (`modules`), which brings its own platforms: their basins take none.
    pub moduled: &'layout [bool],
}

/// How far apart two areas' reaches stand at most for the way between them to open out into one floor, metres.
const MERGE_GAP_M: f64 = 120.0;
/// A gate's cleft's reach where the brief asks for heights, metres: its arch and palisade's, with a little to spare.
const GATE_CLEFT_M: f64 = 14.0;
/// A pocket's half-width, metres: room round a resource and a way into it from the path.
const POCKET_HALF_M: f64 = 9.0;

/// The point of the paths nearest a point.
fn nearest_on(paths: &[Path], at: [f64; 2]) -> Option<[f64; 2]> {
    paths
        .iter()
        .flat_map(|path| path.points.windows(2))
        .map(|pair| {
            let (span_x, span_y) = (pair[1][0] - pair[0][0], pair[1][1] - pair[0][1]);
            let length = span_x * span_x + span_y * span_y;
            let along = if length > 0.0 {
                (((at[0] - pair[0][0]) * span_x + (at[1] - pair[0][1]) * span_y) / length).clamp(0.0, 1.0)
            } else {
                0.0
            };
            [pair[0][0] + span_x * along, pair[0][1] + span_y * along]
        })
        .min_by(|first, second| distance(*first, at).total_cmp(&distance(*second, at)))
}

/// The way the water runs past a point: square to the way the fresh water's distance falls, or None where no water
/// is near enough to lean it.
fn along_water(field: &Field, at: [f64; 2]) -> Option<[f64; 2]> {
    let (column, row) = field.cell_of(at[0], at[1])?;
    let to_fresh = |column: usize, row: usize| field.to_fresh[field.index(column, row)];
    let (west, east) = (column.checked_sub(2)?, (column + 2).min(field.columns - 1));
    let (north, south) = (row.checked_sub(2)?, (row + 2).min(field.rows - 1));
    let falls = [to_fresh(east, row) - to_fresh(west, row), to_fresh(column, south) - to_fresh(column, north)];
    let steep = (falls[0] * falls[0] + falls[1] * falls[1]).sqrt();
    (steep > 1.0).then(|| [-falls[1] / steep, falls[0] / steep])
}

/// The climbs that run up to the massif's top to a lookout, each with its lookout: those `carve` finds first, before
/// the basins' terraces and ramps, which stand lower.
pub fn lookouts(climbs: &[[f64; 7]]) -> impl Iterator<Item = &[[f64; 7]]> {
    climbs.chunks_exact(2).take_while(|pair| pair[1][5] >= 1.0)
}

/// A layout's sculpt (its claim, its floors, its outcrops of a shape, its climbs, its massif's height and seed), each of
/// its areas' basins, and the caverns cut beside them.
#[must_use]
pub fn carve(
    field: &Field,
    claim: Vec<[f64; 2]>,
    network: Network,
    seating: &Seating,
    shape: Shape,
    rise: f64,
    seed: u32,
) -> (Sculpt, Vec<Basin>, Vec<crate::caverns::Cavern>) {
    let Network { areas, paths, exits, pockets, meadows, levels, joined, moduled } = network;
    let mut drawn = 0_i64;
    let mut draw = || {
        drawn += 1;
        rand01(seed ^ 0xBA51, &[drawn])
    };
    let heights = levels.iter().any(|&level| level > 0.0);
    let basins: Vec<Basin> = areas
        .iter()
        .map(|area| {
            // With heights, a gate stands in a cleft of the rock its palisade runs across, not a bowl it stands in.
            if heights && area.kind == AreaKind::Gate {
                return Basin {
                    floors: vec![[area.at[0], area.at[1], area.at[0], area.at[1], GATE_CLEFT_M]],
                    terraces: Vec::new(),
                };
            }
            let water = (area.kind == AreaKind::Mill).then(|| along_water(field, area.at)).flatten();
            let basin = basin(area, seating, paths, water, &mut draw);
            // With heights, a hamlet's blocks step up its hillside on terraces of their own.
            if heights && area.kind == AreaKind::Hamlet {
                return Basin { terraces: crate::basins::hamlet_steps(area, seating, paths), ..basin };
            }
            basin
        })
        .zip(moduled.iter().chain(std::iter::repeat(&false)))
        .map(|(basin, &module)| if module { Basin { terraces: Vec::new(), ..basin } } else { basin })
        .collect();
    // A raised area's floor is a flat at its level, its terraces that much higher; one at the land's own level stays
    // floor, as does every way graded to it.
    let mut floors: Vec<[f64; 5]> = Vec::new();
    let (mut terraces, mut raised): (Vec<[f64; 7]>, Vec<[f64; 7]>) = (Vec::new(), Vec::new());
    // With heights, a ruin's spokes rise or fall from its middle to tiers of their own; a hamlet's blocks stand on
    // terraces of their own (its basin's), on its floor at its level.
    let held = crate::heights::floors_of(&basins, areas, (levels, rise, heights), (&mut floors, &mut raised));

    let grades = if levels.iter().any(|&level| level > 0.0) {
        crate::heights::graded(paths, joined, &|at| crate::heights::on_capsules(&held, at), (levels, rise))
    } else {
        Vec::new()
    };
    let graded = |number: usize, point: [f64; 2]| {
        let found = paths[number].points.iter().position(|&each| each == point);
        found.and_then(|index| grades.get(number).map(|levels| levels[index])).unwrap_or(0.0)
    };
    for (number, path) in paths.iter().enumerate() {
        // Its points kept wherever it bends on the ground or in height, so each capsule runs one stretch of its grade.
        let levels = grades.get(number);
        let metres: Option<Vec<f64>> = levels.map(|levels| levels.iter().map(|level| level * rise).collect());
        let kept = crate::paths::kept(&path.points, metres.as_deref(), 3.0);
        let points: Vec<[f64; 2]> = kept.iter().map(|&at| path.points[at]).collect();
        // With heights, a way between two areas near each other opens out into one wide floor, so they read as one
        // large place rather than two bowls and a lane.
        let open = joined.get(number).filter(|_| heights).and_then(|&[from, to]| {
            let (first, second) = (&areas[from], &areas[to]);
            let near = distance(first.at, second.at) < first.radius + second.radius + MERGE_GAP_M;
            near.then(|| first.radius.min(second.radius) * 0.7)
        });
        for (index, pair) in points.windows(2).enumerate() {
            let half = canyon_half(path, index, &points, areas).max(open.unwrap_or(0.0));
            let (from, to) = levels.map_or((0.0, 0.0), |levels| (levels[kept[index]], levels[kept[index + 1]]));
            if from > 0.0 || to > 0.0 {
                raised.push([pair[0][0], pair[0][1], pair[1][0], pair[1][1], half, from, to]);
            } else {
                floors.push([pair[0][0], pair[0][1], pair[1][0], pair[1][1], half]);
            }
        }
    }
    floors.extend_from_slice(meadows);
    for &(from, way) in exits {
        floors.push(gorge(field, from, way, FOOTPATH_HALF_M + 3.0));
    }
    // A pocket opens off its way at the way's level there.
    for &pocket in pockets {
        let mouth = nearest_on(paths, pocket).unwrap_or(pocket);
        let level = (0..paths.len())
            .flat_map(|number| paths[number].points.iter().map(move |&point| (number, point)))
            .min_by(|first, second| distance(first.1, mouth).total_cmp(&distance(second.1, mouth)))
            .map_or(0.0, |(number, point)| graded(number, point));
        if level > 0.0 {
            raised.push([mouth[0], mouth[1], pocket[0], pocket[1], POCKET_HALF_M, level, level]);
        } else {
            floors.push([mouth[0], mouth[1], pocket[0], pocket[1], POCKET_HALF_M]);
        }
    }
    // Each terrace stands its area's level higher; a ramp's foot (a terrace's level 0 end) meets the land under it,
    // which may be a way graded to another level.
    for (basin, &level) in basins.iter().zip(levels) {
        let lifted = |share: f64| (share + level).min(1.0);
        terraces.extend(basin.terraces.iter().map(|&[x1, y1, x2, y2, half, from, to]| {
            let foot = if from == 0.0 { crate::heights::share_at(&floors, &raised, [x1, y1]) } else { lifted(from) };
            [x1, y1, x2, y2, half, foot, lifted(to)]
        }));
    }
    // A coven's or a cave's cavern is cut into the rock beside its floor, before the climbs, runs and dead rock are found.
    let caverns = if grades.is_empty() {
        Vec::new()
    } else {
        crate::caverns::find(field, areas, levels, (&claim, &floors, &terraces, &raised), (rise, seed))
    };
    floors.extend(caverns.iter().flat_map(crate::caverns::Cavern::floors));
    let bare = Sculpts::from(vec![Sculpt {
        claim: claim.clone(),
        floors: floors.clone(),
        outcrops: Vec::new(),
        rise,
        seed,
        climbs: terraces.clone(),
        runs: Vec::new(),
        wings: Vec::new(),
        levels: raised.clone(),
        terraced: heights,
        roofed: Vec::new(),
    }]);
    let mut climbs = crate::climbs::climbs(field, areas, &bare, rise, seed);
    climbs.extend(terraces);
    let outcrops = outcrops(areas, Ways { paths, climbs: &climbs }, seating, (shape, rise), seed);
    let (runs, wings, levels, terraced) = (Vec::new(), Vec::new(), raised, heights);
    let roofed = caverns.iter().flat_map(crate::caverns::Cavern::floors).collect();
    let sculpt = Sculpt { claim, floors, outcrops, rise, seed, climbs, runs, wings, levels, terraced, roofed };
    (sculpt, basins, caverns)
}

/// How an outcrop of a shape is sized: its radius at least and at most, metres, and its tall, a share of its radius
/// at least and at most. A mesa is broad, wide enough at its largest for two faces and their ledge; a tor, a crag
/// and a knoll are as wide as they are tall or wider; a whaleback is low, and about seven times its radius long; a
/// hummock is low and wide. None is so small that its band is narrower than `BAND_M`.
const fn size_of(shape: Shape) -> (f64, f64, f64, f64) {
    match shape {
        Shape::Mesa => (18.0, 52.0, 0.45, 0.7),
        Shape::Tor => (11.0, 26.0, 0.6, 1.0),
        Shape::Whaleback => (8.0, 12.0, 0.45, 0.7),
        Shape::Crag => (14.0, 34.0, 0.6, 1.0),
        Shape::Knoll => (12.0, 26.0, 0.55, 0.9),
        Shape::Hummock => (10.0, 22.0, 0.25, 0.4),
    }
}

/// How tall an outcrop stands at most, a share of the massif's height: under the cliffs round it.
const UNDER_RISE: f64 = 0.8;

/// What a layout's outcrops keep off: its paths, and its climbs and their lookouts.
#[derive(Clone, Copy)]
struct Ways<'layout> {
    paths: &'layout [Path],
    climbs: &'layout [[f64; 7]],
}

/// The outcrops of a layout's open ground, of its shape and sized to it: three to five in each wilds and arena, a pair
/// at the rim of each other wide basin, each turned across the view from its area's middle (the way a whaleback runs
/// and a tor leans), its footprint never on a way, a building, a prop, a solid or another outcrop. Each later try is
/// smaller, so an outcrop is as large as the room left round it lets it be.
fn outcrops(areas: &[Area], ways: Ways, seating: &Seating, (shape, rise): (Shape, f64), seed: u32) -> Vec<Outcrop> {
    let Ways { paths, climbs } = ways;
    let (least, most, low, high) = size_of(shape);
    let mut found: Vec<Outcrop> = Vec::new();
    let mut draw = 0_i64;
    let mut next = || {
        draw += 1;
        rand01(seed ^ 0x0C2A, &[draw])
    };
    for area in areas {
        let (count, inner, outer) = match area.kind {
            AreaKind::Wilds | AreaKind::Arena => (5, 0.35, 0.85),
            AreaKind::Gate | AreaKind::Entrance | AreaKind::Landing | AreaKind::Tower | AreaKind::Lighthouse => {
                (0, 0.0, 0.0)
            }
            _ if area.radius >= 60.0 => (2, 1.05, 1.25),
            _ => (0, 0.0, 0.0),
        };
        let mut tries = 0;
        let mut placed = 0;
        while placed < count && tries < 40 {
            let room = 1.0 - f64::from(tries) / 40.0;
            tries += 1;
            let bearing = next() * std::f64::consts::TAU;
            let (sine, cosine) = land::exact::sin_cos(bearing);
            let out = area.radius * (inner + next() * (outer - inner));
            let at = [area.at[0] + sine * out, area.at[1] - cosine * out];
            let radius = least + (most - least) * room * (0.8 + 0.2 * next());
            let tall = (radius * (low + (high - low) * next())).min(rise * UNDER_RISE);
            let angle = bearing + std::f64::consts::FRAC_PI_2 + (next() - 0.5) * 0.6;
            let outcrop = Outcrop { at, radius, tall, shape, angle };
            let ([first, last], reach) = outcrop.footprint();
            let clear_of_paths = paths.iter().all(|path| {
                let half = if path.tier == Tier::Track { TRACK_HALF_M } else { FOOTPATH_HALF_M };
                path.points
                    .windows(2)
                    .all(|pair| segments_apart([first, last], [pair[0], pair[1]]) > half * 0.5 + reach + 3.0)
            });
            let clear_of_climbs = climbs.iter().all(|climb| {
                segments_apart([first, last], [[climb[0], climb[1]], [climb[2], climb[3]]]) > climb[4] + reach + 3.0
            });
            let clear_of_buildings = seating
                .buildings
                .iter()
                .chain(seating.props.iter())
                .all(|seated| rect_off_line(seated.footprint, first, last) > reach + 3.0);
            // A solid by the distance its corners reach from its middle, however it is turned.
            let clear_of_solids = seating.solids.iter().all(|solid| {
                let corner = 0.5 * (solid.size[0] * solid.size[0] + solid.size[1] * solid.size[1]).sqrt();
                off_line([solid.at[0], solid.at[1]], first, last) > reach + corner + 3.0
            });
            let clear_of_others = found.iter().all(|other| {
                let ([other_first, other_last], other_reach) = other.footprint();
                segments_apart([first, last], [other_first, other_last]) > (reach + other_reach) * 1.1 + 6.0
            });
            let clear_of_middle = off_line(area.at, first, last) > reach + 10.0;
            let clear = clear_of_paths && clear_of_climbs && clear_of_buildings && clear_of_solids;
            if clear && clear_of_others && clear_of_middle {
                found.push(outcrop);
                placed += 1;
            }
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_resource_off_a_path_is_reached_from_the_path_point_nearest_it() {
        let path = Path {
            tier: Tier::Track,
            points: vec![[0.0, 0.0], [100.0, 0.0], [100.0, 100.0]],
            crossings: Vec::new(),
            heights: Vec::new(),
        };
        assert_eq!(nearest_on(std::slice::from_ref(&path), [40.0, 35.0]), Some([40.0, 0.0]));
        assert_eq!(nearest_on(&[path], [130.0, 80.0]), Some([100.0, 80.0]));
    }

    fn area_at(at: [f64; 2]) -> Area {
        Area { kind: AreaKind::Wilds, name: String::new(), at, radius: 30.0, leads_to: None }
    }

    fn way(tier: Tier, points: Vec<[f64; 2]>) -> Path {
        Path { tier, points, crossings: Vec::new(), heights: Vec::new() }
    }

    #[test]
    fn a_long_way_between_areas_closes_to_a_slot() {
        let areas = [area_at([0.0, 0.0]), area_at([600.0, 0.0])];
        for (tier, slot, plain) in [(Tier::Track, 11.0, 15.0), (Tier::Footpath, 7.0, 11.0)] {
            let path =
                way(tier, vec![[0.0, 0.0], [100.0, 0.0], [200.0, 0.0], [300.0, 0.0], [400.0, 0.0], [600.0, 0.0]]);
            let halves: Vec<f64> = (0..5).map(|index| canyon_half(&path, index, &path.points, &areas)).collect();
            assert_eq!(halves, [plain, slot, slot, slot, plain], "{tier:?}: near an area stays plain");
            assert!(slot > tier.width() + 3.0, "{tier:?}: a slot is wider than the way's walked width and 3 m");
        }
        let short = way(Tier::Track, vec![[0.0, 0.0], [100.0, 0.0]]);
        assert_eq!(canyon_half(&short, 0, &short.points, &areas), 15.0, "a short way is no slot");
    }

    #[test]
    fn a_bend_opens_to_a_bay() {
        let areas = [area_at([0.0, 0.0])];
        let path = way(Tier::Footpath, vec![[200.0, 0.0], [300.0, 0.0], [300.0, 100.0], [300.0, 200.0]]);
        let halves: Vec<f64> = (0..3).map(|index| canyon_half(&path, index, &path.points, &areas)).collect();
        assert_eq!(halves, [18.0, 18.0, 7.0], "the bend opens its two legs; the straight run on closes to a slot");
        let mut wet = way(Tier::Track, vec![[200.0, 0.0], [300.0, 0.0], [400.0, 0.0], [500.0, 0.0]]);
        wet.crossings.push([[300.0, 0.0], [305.0, 0.0]]);
        let halves: Vec<f64> = (0..3).map(|index| canyon_half(&wet, index, &wet.points, &areas)).collect();
        assert_eq!(halves, [22.0, 22.0, 11.0], "a crossing opens the segments by it");
    }

    #[test]
    fn the_brief_names_a_zones_rock_and_the_climate_the_rest() {
        let briefs = crate::brief::Briefs::parse(
            r#"{ "downs": { "theme": "", "areas": [], "rock": "whaleback", "stone": "chalk" },
                 "vale": { "theme": "", "areas": [], "river": true } }"#,
        )
        .unwrap();
        let (downs, vale) = (&briefs.0["downs"], &briefs.0["vale"]);
        assert_eq!((downs.stone.as_deref(), downs.river, vale.river), (Some("chalk"), false, true));
        assert_eq!(shape_of(downs, Some("desert")), Shape::Whaleback, "the brief's rock over its climate's");
        let climates = [
            ("desert", Shape::Mesa),
            ("steppe", Shape::Mesa),
            ("savanna", Shape::Mesa),
            ("temperate-coast", Shape::Tor),
            ("woodland", Shape::Tor),
            ("highland", Shape::Crag),
            ("tundra", Shape::Crag),
            ("rainforest", Shape::Knoll),
            ("swamp", Shape::Hummock),
        ];
        for (biome, shape) in climates {
            assert_eq!(shape_of(vale, Some(biome)), shape, "{biome}");
        }
        assert_eq!(shape_of(vale, None), Shape::Tor);
    }

    #[test]
    fn the_massif_stands_tallest_in_the_highland_and_lowest_in_the_swamp() {
        assert!(rise_of(Some("highland")) > rise_of(Some("temperate-coast")));
        assert!(rise_of(Some("swamp")) < rise_of(Some("steppe")));
        assert!(rise_of(None) > 0.0);
    }
}
