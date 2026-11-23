//! The runs that break off a zone: one-way linear combat areas, each from a mouth at a basin's edge through three to
//! five beats (small arenas) joined by bent passages to an end arena and a sealed door, cut into the zone's rock or
//! carried out past its edge into the land beyond.

use crate::areas::Area;
use crate::brief::{RunBrief, RunKind, RunPlace};
use crate::field::{Field, distance};
use land::sculpts::Sculpts;
use serde::Serialize;

/// One beat of a run: its middle, its reach and its level (a share of the massif's height).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Beat {
    pub at: [f64; 2],
    pub radius: f64,
    pub level: f64,
}

/// A run as found: its name, kind and place from its brief, the area it breaks off (its place among the layout's
/// areas), its mouth, its line (beat middles and the bends of the passages between them, with each point's level), its
/// beats (the last its end arena) and its door, facing on.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Run {
    pub name: String,
    pub kind: RunKind,
    pub place: RunPlace,
    pub area: usize,
    pub mouth: [f64; 2],
    pub line: Vec<[f64; 2]>,
    pub levels: Vec<f64>,
    pub beats: Vec<Beat>,
    pub door: [f64; 2],
    pub facing: [f64; 2],
    /// A building run's ramp down from the raised floor it breaks off to its mouth, at the land's own level: a capsule
    /// of the sculpt (`[x1, y1, x2, y2, half, from, to]`, its levels shares of the massif's height).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ramp: Option<[f64; 7]>,
}

impl Run {
    /// The way a body walks: the run's line from its mouth to its end beat's middle, then on to its door.
    #[must_use]
    pub fn way(&self) -> Vec<[f64; 2]> {
        self.line.iter().copied().chain(std::iter::once(self.door)).collect()
    }
}

/// What a zone's runs are found in: its land, its claim, its areas, its floors as carved before the runs, the climbs
/// and runs already cut (`taken`, as the sculpt's capsules) and the other nodes' claims to keep clear of.
#[derive(Debug, Clone, Copy)]
pub struct Setting<'a> {
    pub field: &'a Field,
    pub claim: &'a [[f64; 2]],
    pub areas: &'a [Area],
    pub bare: &'a Sculpts,
    pub taken: &'a [[f64; 7]],
    pub avoid: &'a [Vec<[f64; 2]>],
    /// The massif's height, metres.
    pub rise: f64,
}

/// How far either side of its line a run of a kind is cut, metres: a gorge widest, a ledge and a gallery narrowest.
#[must_use]
pub const fn half_of(kind: RunKind) -> f64 {
    match kind {
        RunKind::Gorge => 3.5,
        RunKind::Keep => 3.0,
        RunKind::Ledge | RunKind::Rampart | RunKind::Mine | RunKind::Undercroft => 2.5,
    }
}

/// Whether a run of a kind climbs onto the rock's top, where out of bounds holds a body that climbs off it.
#[must_use]
pub const fn on_top(kind: RunKind) -> bool {
    matches!(kind, RunKind::Rampart | RunKind::Ledge)
}

/// A run's length from mouth to door, metres, at the least and the most.
pub const SHORTEST_M: f64 = 200.0;
pub const LONGEST_M: f64 = 400.0;
/// How far the first passage runs in from the mouth before the first beat, metres.
const ENTRY_M: [f64; 2] = [22.0, 34.0];
/// The least a ledge climbs from the floor it leaves to its end, a share of the massif's height: a fifth.
const LEDGE_CLIMBS: f64 = 0.2;
/// A passage between two beats, metres from one's edge to the next's.
const PASSAGE_M: [f64; 2] = [10.0, 40.0];
/// How far a passage turns at its bend, radians (about 26 to 49 degrees): enough that one beat never sees the next.
const BEND: [f64; 2] = [0.45, 0.85];
/// The end arena's reach, metres.
const END_M: [f64; 2] = [21.0, 27.0];
/// A passage's half-width for the checks, metres: the widest any kind cuts.
const HALF_M: f64 = 4.0;
/// How far from the mouth the line may still be near the floor it leaves, metres.
const MOUTH_M: f64 = 40.0;
/// How far a run in the rock keeps inside its claim, and how far a run past the edge carries its door out of it.
const INSIDE_M: f64 = 30.0;
const OUT_PAST_M: f64 = 80.0;
/// How far a run past the edge keeps from the sea, metres: the strand and more.
const SEA_CLEAR_M: f64 = 50.0;
/// How far past the end arena's rim a run's door stands, metres: where the rock's face rises (the land crate's face
/// stays level for about the first quarter of its run).
const DOOR_OUT_M: f64 = 4.0;
/// How much rock stands behind a run's door, metres.
const BACKED_M: f64 = 40.0;
/// The headings tried from each area.
const HEADINGS: u32 = 24;

/// The runs a brief asks for, each where its line first fits and its door leads into rock the section does not close
/// round; one no line fits is left out.
#[must_use]
pub fn find(setting: &Setting, wanted: &[RunBrief], seed: u32) -> Vec<Run> {
    let mut taken: Vec<[f64; 7]> = setting.taken.to_vec();
    let islands = crate::masses::Islands::of(setting.field, setting.bare);
    let mut used = vec![0_u32; setting.areas.len()];
    let mut found = Vec::new();
    for (number, brief) in wanted.iter().enumerate() {
        let draw = |key: &[i64]| {
            let mut keys = vec![number as i64];
            keys.extend_from_slice(key);
            land::exact::rand01(seed ^ 0x2A17, &keys)
        };
        let mut starts: Vec<usize> = (0..setting.areas.len()).filter(|&at| opens(&setting.areas[at])).collect();
        starts.sort_by(|&first, &second| {
            used[first].cmp(&used[second]).then(draw(&[first as i64]).total_cmp(&draw(&[second as i64])))
        });
        let fits = starts.iter().find_map(|&start| {
            (0..HEADINGS).find_map(|heading| {
                let turn =
                    std::f64::consts::TAU * (f64::from(heading) / f64::from(HEADINGS) + draw(&[start as i64, -1]));
                let (sine, cosine) = land::exact::sin_cos(turn);
                let mouth = mouth_of(setting, &setting.areas[start], [sine, -cosine])?;
                (0..3).find_map(|variant| {
                    // An open run leaves its area at the level its floor stands at, raised or not; a building run
                    // keeps to the land's own level, its entry (a keep's gate, an undercroft's chapel and stair, a
                    // mine's mouth) built for it, and a ramp is cut down to its mouth through a raised floor. A
                    // ledge climbs most of the massif from where it starts.
                    let base = setting.bare.floor_share(mouth[0], mouth[1]);
                    if brief.kind == RunKind::Ledge && end_level(setting.rise) - base < LEDGE_CLIMBS {
                        return None;
                    }
                    let run = shaped(brief, (start, mouth, base), [sine, -cosine], setting.rise, &|key| {
                        draw(&[start as i64, i64::from(heading), variant, key])
                    });
                    let open = (1..=4)
                        .all(|step| !islands.hold(ahead(run.door, run.facing, BACKED_M * f64::from(step) / 4.0)));
                    (open && fits(setting, &run, &taken)).then_some((start, run))
                })
            })
        });
        if let Some((start, run)) = fits {
            used[start] += 1;
            taken.extend(capsules(&run, HALF_M));
            found.push(run);
        }
    }
    found
}

/// Whether a run may break off an area: any place a body goes about in, not a gate's or landing's way out.
fn opens(area: &Area) -> bool {
    use crate::brief::AreaKind;
    !matches!(area.kind, AreaKind::Gate | AreaKind::Landing | AreaKind::Entrance | AreaKind::Dock)
        && area.radius >= 30.0
}

/// Where an area's floor ends walking out from its middle along `way`, as carved: the run's mouth.
fn mouth_of(setting: &Setting, area: &Area, way: [f64; 2]) -> Option<[f64; 2]> {
    let mut out = area.radius * 0.5;
    while out < area.radius * 4.0 {
        let at = [area.at[0] + way[0] * out, area.at[1] + way[1] * out];
        if setting.bare.floor_distance(at[0], at[1]) > 0.0 {
            return Some(at);
        }
        out += 2.0;
    }
    None
}

fn turned(way: [f64; 2], angle: f64) -> [f64; 2] {
    let (sine, cosine) = land::exact::sin_cos(angle);
    [way[0] * cosine - way[1] * sine, way[0] * sine + way[1] * cosine]
}

fn ahead(from: [f64; 2], way: [f64; 2], out: f64) -> [f64; 2] {
    [from[0] + way[0] * out, from[1] + way[1] * out]
}

/// A run's shape from its mouth along `way`: three to five beats, each passage bent at its middle and turned back,
/// so the line wanders either side of its heading; the passages' lengths chosen so the whole is 200 to 400 m.
fn shaped(
    brief: &RunBrief,
    (area, mouth, base): (usize, [f64; 2], f64),
    way: [f64; 2],
    rise: f64,
    draw: &dyn Fn(i64) -> f64,
) -> Run {
    let between = |range: [f64; 2], key: i64| range[0] + (range[1] - range[0]) * draw(key);
    let count = 3 + (draw(1) * 3.0).floor().min(2.0) as usize;
    // Fewer beats are larger, so a run of three is still long enough.
    let beat_m: [f64; 2] = match count {
        3 => [20.0, 28.0],
        4 => [15.0, 22.0],
        _ => [13.0, 18.0],
    };
    let radii: Vec<f64> = (0..count)
        .map(|at| if at + 1 == count { between(END_M, 10 + at as i64) } else { between(beat_m, 10 + at as i64) })
        .collect();
    // A gorge's long enough for its ramp from the floor it leaves down to its own, no steeper than a rampart climbs.
    let down = if brief.kind == RunKind::Gorge { base * rise / RAMPART_STEEPEST } else { 0.0 };
    let entry = between(ENTRY_M, 2).max(down);
    let fixed: f64 = entry + radii[0] + radii.windows(2).map(|pair| pair[0] + pair[1]).sum::<f64>();
    let gaps = (count - 1) as f64;
    let wanted_m = between([SHORTEST_M + 20.0, LONGEST_M - 40.0], 3);
    let passage = ((wanted_m - fixed) / gaps).clamp(PASSAGE_M[0], PASSAGE_M[1]);
    let side = if draw(4) < 0.5 { 1.0 } else { -1.0 };
    // The line runs to each beat's rim, through its middle and out of its rim, so a beat stays flat and only the
    // passages between rims climb.
    let mut at = ahead(mouth, way, entry + radii[0]);
    let mut line = vec![mouth, ahead(mouth, way, entry), at];
    let mut flat = vec![false, false, true];
    let mut beats = vec![Beat { at, radius: radii[0], level: 0.0 }];
    for (gap, pair) in radii.windows(2).enumerate() {
        let bend = between(BEND, 20 + gap as i64) * if gap % 2 == 0 { side } else { -side };
        let share = 0.35 + 0.3 * draw(30 + gap as i64);
        let bent = turned(way, bend);
        let rim = ahead(at, bent, pair[0]);
        let elbow = ahead(rim, bent, passage * share);
        let next_rim = ahead(elbow, way, passage * (1.0 - share));
        at = ahead(next_rim, way, pair[1]);
        line.extend([rim, elbow, next_rim, at]);
        flat.extend([true, false, false, true]);
        beats.push(Beat { at, radius: pair[1], level: 0.0 });
    }
    let levels = levels_of(brief.kind, &line, &flat, (rise, base));
    for beat in &mut beats {
        beat.level = line.iter().position(|point| *point == beat.at).map_or(0.0, |at| levels[at]);
    }
    let end = radii[count - 1];
    // Cut back into the raised floor it leaves, no steeper than a rampart climbs.
    let ramp = (brief.kind.building() && base > 0.0).then(|| {
        let top = ahead(mouth, way, -base * rise / RAMPART_STEEPEST);
        [top[0], top[1], mouth[0], mouth[1], half_of(brief.kind) + 1.0, base, 0.0]
    });
    Run {
        name: brief.name.clone(),
        kind: brief.kind,
        place: brief.place,
        area,
        mouth,
        levels,
        line,
        beats,
        // At the foot of the face behind the end arena, past the flat its floor's edge leaves before the rock rises.
        door: ahead(at, way, end + DOOR_OUT_M),
        facing: way,
        ramp,
    }
}

/// The level a climbing run's end arena is cut at, as a share of the massif's height, at the most: far enough below
/// the massif's top that the face behind its door rises in ledges too steep to climb (a lower face's ledges can be
/// walked up).
const END_LEVEL: f64 = 0.55;
/// The least height of the face behind a climbing run's door, metres: on a low massif the end arena is cut lower,
/// down to its floor.
const DOOR_FACE_M: f64 = 12.0;
/// The steepest a rampart climbs to the massif's top, rise a metre along its passages: well inside what a body walks.
const RAMPART_STEEPEST: f64 = 0.6;

/// Each line point's level, a share of the massif's height (`rise` metres), by how far along the passages (not the
/// beats, which are flat: `flat` marks a segment ending in a beat) it lies: a ledge climbs the whole way to its end
/// level, a rampart climbs to the top no steeper than `RAMPART_STEEPEST` (in its first two fifths at the least),
/// keeps to it and drops into a cut at its end; the rest keep to the floor. Each starts at `base`, the level of the
/// floor it leaves: a ledge and a rampart climb from it, and a gorge's entry ramps down from it to the floor.
fn levels_of(kind: RunKind, line: &[[f64; 2]], flat: &[bool], (rise, base): (f64, f64)) -> Vec<f64> {
    let mut climbed = vec![0.0];
    for (pair, &level) in line.windows(2).zip(&flat[1..]) {
        let length = if level { 0.0 } else { crate::field::distance(pair[0], pair[1]) };
        climbed.push(climbed.last().copied().unwrap_or(0.0) + length);
    }
    let whole = climbed.last().copied().unwrap_or(0.0).max(1e-9);
    let end = end_level(rise);
    // The massif's top stands up to 1.15 of its height (the land crate's sculpts).
    let up = (rise * 1.15 / RAMPART_STEEPEST).clamp(0.4 * whole, 0.75 * whole);
    climbed
        .iter()
        .map(|along| match kind {
            RunKind::Ledge => base + (end - base).max(0.0) * along / whole,
            RunKind::Rampart => {
                let down = ((along / whole - 0.8) / 0.2).clamp(0.0, 1.0);
                base + (1.0 - base) * (along / up).min(1.0) - (1.0 - end) * down
            }
            _ => 0.0,
        })
        .enumerate()
        .map(|(at, level)| if at == 0 && kind == RunKind::Gorge { base } else { level })
        .collect()
}

/// The level a ledge climbs to and a rampart drops to at its end: under the massif's top by a door's face.
fn end_level(rise: f64) -> f64 {
    END_LEVEL.min(1.0 - DOOR_FACE_M / rise.max(1e-9)).max(0.0)
}

/// The steepest a run's line climbs, rise a metre along it, on a massif `rise` metres high.
fn steepest_climb(run: &Run, rise: f64) -> f64 {
    run.line
        .windows(2)
        .zip(run.levels.windows(2))
        .map(|(pair, levels)| (levels[1] - levels[0]) * rise / distance(pair[0], pair[1]).max(1e-9))
        .fold(0.0, f64::max)
}

/// How far a point lies outside a ring, metres (negative inside).
fn off_ring(ring: &[[f64; 2]], at: [f64; 2]) -> f64 {
    let edge = (0..ring.len())
        .map(|edge| crate::paths::off_line(at, ring[edge], ring[(edge + 1) % ring.len()]))
        .fold(f64::INFINITY, f64::min);
    if crate::field::ring_holds(ring, at[0], at[1]) { -edge } else { edge }
}

/// Whether a run fits where it was shaped: as long as a run is, clear of the other runs and climbs, its rock standing
/// round it, inside the claim (a run in the rock) or out past it on dry land clear of every other claim and the sea
/// (a run past the edge).
fn fits(setting: &Setting, run: &Run, taken: &[[f64; 7]]) -> bool {
    let long: f64 = run.line.windows(2).map(|pair| crate::field::distance(pair[0], pair[1])).sum();
    if !(SHORTEST_M..=LONGEST_M).contains(&long) || steepest_climb(run, setting.rise) > RAMPART_STEEPEST {
        return false;
    }
    let beyond = run.place == RunPlace::Beyond;
    if beyond && off_ring(setting.claim, run.door) < OUT_PAST_M {
        return false;
    }
    // A door leads on into the massif: rock stands behind it, no floor, climb or other run within its reach.
    let backed = (1..=10).all(|step| {
        let at = ahead(run.door, run.facing, BACKED_M * f64::from(step) / 10.0);
        let clear = taken.iter().all(|capsule| {
            crate::paths::off_line(at, [capsule[0], capsule[1]], [capsule[2], capsule[3]]) - capsule[4]
                > land::sculpts::CLIFF_RUN_M
        });
        clear && setting.bare.floor_distance(at[0], at[1]) > land::sculpts::CLIFF_RUN_M
    });
    if !backed {
        return false;
    }
    let mut points: Vec<([f64; 2], f64, f64)> =
        run.beats.iter().map(|beat| (beat.at, beat.radius, f64::INFINITY)).collect();
    let mut along = 0.0;
    for pair in run.line.windows(2) {
        let length = crate::field::distance(pair[0], pair[1]);
        let steps = (length / 4.0).ceil().max(1.0);
        for step in 0..=steps as usize {
            let share = step as f64 / steps;
            points.push((
                ahead(
                    pair[0],
                    [(pair[1][0] - pair[0][0]) / length.max(1e-9), (pair[1][1] - pair[0][1]) / length.max(1e-9)],
                    length * share,
                ),
                HALF_M,
                along + length * share,
            ));
        }
        along += length;
    }
    let field = setting.field;
    // Every beat's floor and the wing's rock past the claim stand on dry land, not only the line's points.
    let wet = |at: [f64; 2]| {
        field
            .cell_of(at[0], at[1])
            .is_some_and(|(column, row)| field.water[field.index(column, row)] != crate::field::Water::Dry)
    };
    let beat_wet = run.beats.iter().any(|beat| {
        let reach = (beat.radius / 4.0).ceil() as i32;
        (-reach..=reach).flat_map(|east| (-reach..=reach).map(move |south| (east, south))).any(|(east, south)| {
            let at = [beat.at[0] + f64::from(east) * 4.0, beat.at[1] + f64::from(south) * 4.0];
            distance(at, beat.at) <= beat.radius && wet(at)
        })
    });
    let wing_wet = wing(run, setting.claim).is_some_and(|[x1, y1, x2, y2, half]| {
        let length = distance([x1, y1], [x2, y2]).max(1e-9);
        let across = [-(y2 - y1) / length * half, (x2 - x1) / length * half];
        (0..=40).flat_map(|along| (-8..=8).map(move |out| (along, out))).any(|(along, out)| {
            let (share, side) = (f64::from(along) / 40.0, f64::from(out) / 8.0);
            wet([x1 + (x2 - x1) * share + across[0] * side, y1 + (y2 - y1) * share + across[1] * side])
        })
    });
    if beat_wet || wing_wet {
        return false;
    }
    points.iter().all(|&(at, half, along)| {
        let Some((column, row)) = field.cell_of(at[0], at[1]) else { return false };
        let cell = field.index(column, row);
        if field.water[cell] != crate::field::Water::Dry {
            return false;
        }
        let clear_of_taken = taken.iter().all(|capsule| {
            crate::paths::off_line(at, [capsule[0], capsule[1]], [capsule[2], capsule[3]]) - capsule[4] - half
                > 2.0 * land::sculpts::CLIFF_RUN_M
        });
        let floor = setting.bare.floor_distance(at[0], at[1]);
        let in_rock =
            if along <= MOUTH_M { floor >= along * 0.5 - 6.0 } else { floor >= half + land::sculpts::CLIFF_RUN_M };
        let placed = if field.claimed[cell] {
            beyond || field.inside[cell] >= INSIDE_M + half
        } else {
            beyond
                && field.to_sea[cell] >= SEA_CLEAR_M + half
                && setting.avoid.iter().all(|ring| off_ring(ring, at) > land::sculpts::FADE_M + half)
        };
        clear_of_taken && in_rock && placed
    })
}

/// A run's capsules for the sculpt: its passages `half` metres either side of its line, and its beats.
#[must_use]
pub fn capsules(run: &Run, half: f64) -> Vec<[f64; 7]> {
    let passages = run
        .line
        .windows(2)
        .zip(run.levels.windows(2))
        .map(|(pair, levels)| [pair[0][0], pair[0][1], pair[1][0], pair[1][1], half, levels[0], levels[1]]);
    let beats = run
        .beats
        .iter()
        .map(|beat| [beat.at[0], beat.at[1], beat.at[0], beat.at[1], beat.radius, beat.level, beat.level]);
    passages.chain(beats).chain(run.ramp).collect()
}

/// For a run past the edge, the wing that carries the claim out round it: from the last of its line inside the claim
/// to past its door, wide enough to hold its line and the rock either side.
#[must_use]
pub fn wing(run: &Run, claim: &[[f64; 2]]) -> Option<[f64; 5]> {
    if run.place != RunPlace::Beyond {
        return None;
    }
    let from = run.line.iter().rev().find(|at| off_ring(claim, **at) < 0.0).copied().unwrap_or(run.mouth);
    let to = ahead(run.door, run.facing, 20.0);
    let widest = run.beats.iter().map(|beat| beat.radius).fold(0.0, f64::max);
    // How far the line strays from the wing's axis past the claim: inside the ring the claim holds it already.
    let spread = run
        .line
        .iter()
        .filter(|at| off_ring(claim, **at) >= 0.0)
        .map(|at| crate::paths::off_line(*at, from, to))
        .fold(0.0, f64::max);
    Some([from[0], from[1], to[0], to[1], spread + widest + 30.0])
}

#[cfg(test)]
#[path = "runs_tests.rs"]
mod tests;
