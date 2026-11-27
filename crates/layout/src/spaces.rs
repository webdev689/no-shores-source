//! A layout's map: the spaces a body stands in (its areas, the lookouts its climbs reach, its runs' beats, its
//! caverns) and the connections between them (its ways, its climbs, its ledges' stairs, its runs' passages, its tunnels). Each space's level and roof are read off the
//! land and the solids as laid, so the map says what a body finds there. Missions, events and raids place their
//! fights, checkpoints and bosses on it.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::field::distance;
use crate::paths::Path;
use crate::runs::{Run, half_of};
use city::solids::Solid;
use serde::Serialize;

/// The headroom over a floor under which a solid over it is not a roof but stands in the space, metres.
const HEADROOM_M: f64 = 1.8;

/// What a space is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SpaceKind {
    /// One of the layout's areas, by its kind.
    Area(AreaKind),
    /// The flat at a climb's top.
    Lookout,
    /// A fight of a run, the last its end arena.
    Beat,
    /// A hollow under the rock beside a coven or a cave.
    Cavern,
}

/// A place a body stands in: its middle and reach, its floor's level (a share of the massif's height: 0 the land's
/// own level, 1 the massif's top), and whether a roof stands over its middle.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Space {
    pub kind: SpaceKind,
    pub name: String,
    pub at: [f64; 2],
    pub reach: f64,
    pub level: f64,
    pub roofed: bool,
    /// For a gate, the node it leads to.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leads_to: Option<String>,
}

/// How a connection is walked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Joined {
    /// A track or a footpath between two areas.
    Way,
    /// A climb up the massif's face to a lookout.
    Climb,
    /// A ledge's cliff stair, cut through the rock from a low place up to a high one (`ledges`).
    Stair,
    /// A run's passage into its first beat or on to the next.
    Run,
    /// A roofed tunnel through the rock, into a cavern.
    Tunnel,
}

/// A connection between two spaces, by their places in the map: how it is walked, its walked width and its line.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Connection {
    pub from: usize,
    pub to: usize,
    pub joined: Joined,
    pub width: f64,
    pub points: Vec<[f64; 2]>,
}

/// A layout's spaces and the connections between them. Its first spaces are the layout's areas, in their order.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Map {
    pub spaces: Vec<Space>,
    pub connections: Vec<Connection>,
}

/// The land as a map reads it: the floor's height at a point (the ground and its carving), and the carving's share of
/// the massif's height there.
pub struct Land<'a> {
    pub floor: &'a dyn Fn([f64; 2]) -> f64,
    pub level: &'a dyn Fn([f64; 2]) -> f64,
}

impl std::fmt::Debug for Land<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.debug_struct("Land").finish_non_exhaustive()
    }
}

/// What a map is drawn from: the areas, each way with the two areas it joins, the climbs to lookouts (each a capsule
/// `[x1, y1, x2, y2, half, ..]` with its lookout's) and the area each climbs out of, the runs and the solids.
#[derive(Debug)]
pub struct Drawn<'a> {
    pub areas: &'a [Area],
    pub ways: &'a [(Path, [usize; 2])],
    pub climbs: &'a [&'a [[f64; 7]]],
    pub climbed_from: &'a [usize],
    pub runs: &'a [Run],
    pub caverns: &'a [crate::caverns::Cavern],
    pub ledges: &'a [crate::ledges::Ledge],
    pub solids: &'a [Solid],
}

/// A layout's map, read off what was laid.
#[must_use]
pub fn map(drawn: &Drawn, land: &Land) -> Map {
    let bounds: Vec<[f64; 6]> = drawn.solids.iter().map(Solid::bounds).collect();
    let covered = |at: [f64; 2]| {
        let floor = (land.floor)(at);
        bounds.iter().any(|&[west, north, east, south, bottom, _]| {
            at[0] >= west && at[0] <= east && at[1] >= north && at[1] <= south && bottom >= floor + HEADROOM_M
        })
    };
    // Roofed where most of its floor is: its middle and eight points half its reach out, five of them covered, so a
    // tower or a building standing on an open area's middle does not roof it.
    let roofed = |at: [f64; 2], reach: f64| {
        let round = (0..8).map(|step| {
            let (sine, cosine) = land::exact::sin_cos(f64::from(step) * std::f64::consts::FRAC_PI_4);
            [at[0] + cosine * reach / 2.0, at[1] + sine * reach / 2.0]
        });
        std::iter::once(at).chain(round).filter(|&point| covered(point)).count() >= 5
    };
    let space = |kind, name: &str, at: [f64; 2], reach| Space {
        kind,
        name: name.to_owned(),
        at,
        reach,
        level: (land.level)(at),
        roofed: roofed(at, reach),
        leads_to: None,
    };
    let mut map = Map::default();
    for area in drawn.areas {
        let mut each = space(SpaceKind::Area(area.kind), &area.name, area.at, area.radius);
        each.leads_to.clone_from(&area.leads_to);
        map.spaces.push(each);
    }
    for (path, [from, to]) in drawn.ways {
        let (from, to, points) = (*from, *to, path.points.clone());
        map.connections.push(Connection { from, to, joined: Joined::Way, width: path.tier.width(), points });
    }
    for (number, pair) in drawn.climbs.iter().enumerate() {
        let ([x1, y1, x2, y2, half, ..], lookout) = (pair[0], pair[1]);
        let from = drawn
            .climbed_from
            .get(number)
            .copied()
            .unwrap_or_else(|| nearest(&map.spaces[..drawn.areas.len()], [x1, y1]));
        map.spaces.push(space(SpaceKind::Lookout, "", [lookout[0], lookout[1]], lookout[4]));
        let to = map.spaces.len() - 1;
        let points = vec![[x1, y1], [x2, y2]];
        map.connections.push(Connection { from, to, joined: Joined::Climb, width: 2.0 * half, points });
    }
    // A ledge's stair joins its low place to its high one up the rock between them.
    for ledge in drawn.ledges {
        let points = vec![ledge.start, ledge.edge];
        map.connections.push(Connection { from: ledge.from, to: ledge.to, joined: Joined::Stair, width: 4.0, points });
    }
    // A run's passages: from the area it breaks off into its first beat, then beat to beat, each along its line.
    for run in drawn.runs {
        let width = 2.0 * half_of(run.kind);
        let (mut from, mut start) = (run.area, 0);
        for beat in &run.beats {
            map.spaces.push(space(SpaceKind::Beat, &run.name, beat.at, beat.radius));
            let to = map.spaces.len() - 1;
            let end = run.line.iter().skip(start).position(|at| *at == beat.at).map_or(start, |at| start + at);
            let points = run.line[start..=end].to_vec();
            map.connections.push(Connection { from, to, joined: Joined::Run, width, points });
            (from, start) = (to, end);
        }
        // A way across standing in its end arena, as far out as its door, is reached from the end arena.
        let Some(last) = run.beats.last() else { continue };
        let reach = distance(run.door, last.at);
        for (to, area) in drawn.areas.iter().enumerate() {
            if crate::crossings::is_crossing(area) && distance(area.at, last.at) <= reach {
                let points = vec![last.at, area.at];
                map.connections.push(Connection { from, to, joined: Joined::Run, width, points });
            }
        }
    }
    for cavern in drawn.caverns {
        map.spaces.push(space(SpaceKind::Cavern, &drawn.areas[cavern.area].name, cavern.middle, cavern.reach));
        let (to, points) = (map.spaces.len() - 1, vec![cavern.mouth, cavern.middle]);
        map.connections.push(Connection { from: cavern.area, to, joined: Joined::Tunnel, width: 12.0, points });
    }
    map
}

/// The place in `spaces` of the one whose middle lies nearest a point.
fn nearest(spaces: &[Space], at: [f64; 2]) -> usize {
    (0..spaces.len())
        .min_by(|&first, &second| distance(spaces[first].at, at).total_cmp(&distance(spaces[second].at, at)))
        .unwrap_or(0)
}
