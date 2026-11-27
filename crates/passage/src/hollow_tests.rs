use super::{ARRIVAL_CLEAR_M, Form, PI};
use crate::plan::{Ground as Laid, Plan};
use crate::web::Web;

/// Whether a point lies inside a ring (crossings counted along a line east of it).
fn within(ring: &[[f64; 2]], [x, y]: [f64; 2]) -> bool {
    let mut inside = false;
    for (at, &[x1, y1]) in ring.iter().enumerate() {
        let [x2, y2] = ring[(at + 1) % ring.len()];
        if (y1 > y) != (y2 > y) && x < x1 + (y - y1) * (x2 - x1) / (y2 - y1) {
            inside = !inside;
        }
    }
    inside
}

/// The hollows of a run of weeks' webs, laid whole.
fn hollows(weeks: core::ops::Range<u64>) -> impl Iterator<Item = (u64, Plan)> {
    let island = crate::island("continent-1").expect("Saltmere's passages");
    weeks.flat_map(move |week| {
        let web = Web::of(island, week);
        let open = web.zones.iter().filter(|zone| matches!(zone.ground, crate::Ground::Open { .. }));
        let numbers: Vec<u16> = open.map(|zone| zone.number).collect();
        numbers.into_iter().filter_map(move |number| Plan::of(&web, number)).map(move |plan| (week, plan))
    })
}

/// The hollows of a run of weeks' webs a sweep checks, laid whole: every one on a full sweep, otherwise the first of
/// each kind.
fn swept_hollows(weeks: core::ops::Range<u64>) -> impl Iterator<Item = (u64, Plan)> {
    let island = crate::island("continent-1").expect("Saltmere's passages");
    let open = crate::tests::swept(weeks, |zone| matches!(zone.ground, crate::Ground::Open { .. }));
    open.into_iter().filter_map(move |(week, number)| Plan::of(&Web::of(island, week), number).map(|plan| (week, plan)))
}

/// How far past the floor's ring a body may stand at most: the ring's half metre in, the wall's run and its lip,
/// and the diagonal of the cell the ground ends at.
const LIP_REACH_M: f64 = 0.5 + 5.0 + 2.0 + 2.0 * core::f64::consts::SQRT_2;

/// How far a point lies from a ring's nearest edge.
fn off(ring: &[[f64; 2]], at: [f64; 2]) -> f64 {
    let edge = |from: [f64; 2], to: [f64; 2]| {
        let (east, south) = (to[0] - from[0], to[1] - from[1]);
        let share = (((at[0] - from[0]) * east + (at[1] - from[1]) * south) / (east * east + south * south).max(1e-12))
            .clamp(0.0, 1.0);
        libm::hypot(at[0] - from[0] - east * share, at[1] - from[1] - south * share)
    };
    (0..ring.len()).map(|at| edge(ring[at], ring[(at + 1) % ring.len()])).fold(f64::MAX, f64::min)
}

/// How long a body is driven at the wall, ticks: 10 s, up any wall aslant to its lip and on.
const DRIVEN_TICKS: u32 = 600;

#[test]
fn a_body_driven_at_a_hollows_wall_is_held_inside_its_bounds_by_the_ground() {
    let mut escaped = Vec::new();
    for (week, plan) in swept_hollows(2_900..2_916) {
        let Laid::Open(hollow) = &plan.ground else { continue };
        // From the floor nearest every fourth point of the floor's ring, toward it and aslant, walking, running and
        // jumping: a body slides up a wall aslant, so only the ground's end holds it.
        let targets: Vec<[f64; 2]> = hollow.ring.iter().step_by(4).copied().collect();
        let ways = plan.walk().ways(plan.sites.arrive, &targets);
        for (way, target) in ways.iter().zip(&targets) {
            let Some(&start) = way.last() else { continue };
            let toward = libm::atan2(target[0] - start[0], -(target[1] - start[1]));
            let drives =
                [(0.0, false, false), (0.0, true, true), (1.0, true, false), (-1.0, true, false), (1.4, true, true)];
            for (aslant, run, jump) in drives {
                let controls = movement::Controls { yaw: toward + aslant, forward: 1.0, run, ..Default::default() };
                let mut body = hollow.ground.standing(start[0], start[1]);
                for tick in 0..DRIVEN_TICKS {
                    let controls = movement::Controls { jump: jump && tick % 40 == 0, ..controls };
                    body =
                        movement::step_body(&body, &controls, &hollow.blocks, &hollow.ground, movement::TICK_SECONDS);
                    let past_floor =
                        if within(&hollow.ring, [body.x, body.y]) { 0.0 } else { off(&hollow.ring, [body.x, body.y]) };
                    let held = within(&hollow.bounds, [body.x, body.y]) && hollow.ground.stands_at(body.x, body.y);
                    if !held || past_floor > LIP_REACH_M {
                        escaped.push(format!(
                            "week {week} zone {} {:?} {:?}: from {start:.1?} aslant {aslant} run {run} jump {jump}, \
                             out at {:.1?}",
                            plan.zone.number,
                            plan.zone.ground,
                            plan.zone.size,
                            [body.x, body.y]
                        ));
                        break;
                    }
                }
            }
        }
    }
    assert!(
        escaped.is_empty(),
        "{} bodies left the ground, the first: {:#?}",
        escaped.len(),
        &escaped[..escaped.len().min(12)]
    );
}

/// What the web and its hollows give over a year of weeks, printed: run with `--ignored --nocapture` to measure.
#[test]
#[ignore = "a measure, printed"]
fn measure_the_hollows_dressing() {
    use isle::catalog::{Role, catalog};
    let book = catalog();
    let mut counts: std::collections::BTreeMap<(String, &str), [usize; 5]> = Default::default();
    for (_, plan) in hollows(2_900..2_952) {
        let Laid::Open(hollow) = &plan.ground else { continue };
        let crate::Ground::Open { form } = plan.zone.ground else { continue };
        let row = counts.entry((form.key().to_owned(), plan.zone.size.key())).or_default();
        row[0] += 1;
        for placement in &hollow.placements {
            match book.module(placement.module).role {
                Role::Tree => row[1] += 1,
                Role::Ruin => row[2] += 1,
                Role::Wreck => row[3] += 1,
                _ => {}
            }
        }
        row[4] += plan.sites.posts.len();
    }
    for ((form, size), [zones, trees, ruins, wrecks, posts]) in counts {
        let mean = |count: usize| count as f64 / zones as f64;
        eprintln!(
            "{form:8} {size:6} {zones:4} zones: trees {:5.1} ruins {:4.1} hulls {:4.1} posts {:4.1}",
            mean(trees),
            mean(ruins),
            mean(wrecks),
            mean(posts)
        );
    }
}

#[test]
fn a_hollow_keeps_its_dressing_clear_of_its_arrival_by_its_footprint_and_stands_only_the_posts_its_room_stands() {
    use isle::catalog::{Role, catalog};
    let book = catalog();
    let mut too_near = Vec::new();
    // Each form's own dressing laid, against the most it lays, by form.
    let mut own: std::collections::BTreeMap<&str, (usize, usize)> = Default::default();
    for (week, plan) in hollows(2_900..2_916) {
        let Laid::Open(hollow) = &plan.ground else { continue };
        let crate::Ground::Open { form } = plan.zone.ground else { continue };
        assert_eq!(plan.sites.posts.len(), plan.zone.size.posts(), "week {week} zone {}: its posts", plan.zone.number);
        let mut laid = 0;
        for placement in &hollow.placements {
            let module = book.module(placement.module);
            if module.role == Role::Cliff {
                continue;
            }
            let reach = libm::hypot(module.size[0], module.size[1]) / 2.0 * placement.scale;
            let at = [placement.at[0], placement.at[1]];
            if crate::sites::apart(at, plan.sites.arrive) - reach < ARRIVAL_CLEAR_M - 1e-9 {
                too_near.push(format!("week {week} zone {} {form:?}: {:?} at {at:.1?}", plan.zone.number, module.role));
            }
            let mine = match form {
                Form::Grove => module.role == Role::Tree,
                Form::Court => module.role == Role::Ruin,
                Form::Strand => matches!(module.role, Role::Wreck | Role::WreckBit),
                _ => false,
            };
            laid += usize::from(mine);
        }
        let reach = plan.zone.size.across() / 2.0;
        let most = match form {
            Form::Grove => (PI * reach * reach * 0.010) as usize,
            Form::Court => 15,
            Form::Strand => 5,
            _ => continue,
        };
        let row = own.entry(form.key()).or_default();
        *row = (row.0 + laid, row.1 + most);
    }
    assert!(
        too_near.is_empty(),
        "{} near the arrival, the first: {:#?}",
        too_near.len(),
        &too_near[..too_near.len().min(12)]
    );
    for (form, (laid, most)) in own {
        assert!(laid as f64 >= 0.8 * most as f64, "{form}: {laid} of its {most} laid");
    }
}

#[test]
fn a_lamp_is_come_to_between_two_stones_and_a_holds_ring_and_the_plants_keep_off_the_pieces() {
    use crate::plan::{Kind, RING_M};
    use crate::sites::apart;
    use isle::catalog::{Role, catalog};
    let book = catalog();
    let (mut lamps, mut rings, mut strands, mut bare) = (0, 0, 0, Vec::new());
    for (week, plan) in hollows(2_900..2_916) {
        let Laid::Open(hollow) = &plan.ground else { continue };
        let zone = plan.zone.number;
        for piece in &plan.pieces {
            let middle = [piece.at[0], piece.at[1]];
            if piece.kind == Kind::Lamp {
                lamps += 1;
                // Every stone stands clear of the straight way in from the arrival to the plinth.
                let way = plan.sites.arrive;
                for stone in Kind::Lamp.solids_at(piece.at, piece.facing).into_iter().skip(1) {
                    let stone_middle = [(stone[0] + stone[2]) / 2.0, (stone[1] + stone[3]) / 2.0];
                    let (east, south) = (way[0] - middle[0], way[1] - middle[1]);
                    let along = ((stone_middle[0] - middle[0]) * east + (stone_middle[1] - middle[1]) * south)
                        / (east * east + south * south);
                    let near = [middle[0] + east * along.clamp(0.0, 1.0), middle[1] + south * along.clamp(0.0, 1.0)];
                    assert!(apart(near, stone_middle) > 1.5, "week {week} zone {zone}: a stone in the way in");
                }
                // No plant the page draws reaches the stones.
                for placement in hollow.placements.iter().filter(|placement| super::grows(placement.module)) {
                    let reach = super::reach_of(placement.module, placement.scale);
                    let at = [placement.at[0], placement.at[1]];
                    assert!(apart(at, middle) - reach >= 4.0, "week {week} zone {zone}: a plant in the lamp's ring");
                }
            }
            if piece.kind == Kind::Ring {
                rings += 1;
                for door in plan.sites.onward.iter().chain([&plan.sites.way_in]) {
                    assert!(apart(door.at, middle) - RING_M >= 2.5, "week {week} zone {zone}: the ring by a mouth");
                }
            }
        }
        let hulls = hollow.placements.iter().filter(|placement| book.module(placement.module).role == Role::Wreck);
        if matches!(plan.zone.ground, crate::Ground::Open { form: Form::Strand }) {
            strands += 1;
            if hulls.count() == 0 {
                bare.push(format!("week {week} zone {zone} {:?}", plan.zone.size));
            }
        }
    }
    assert!(lamps > 10 && rings > 10, "{lamps} lamps and {rings} rings above ground");
    assert!(bare.is_empty(), "{} of {strands} strands with no hull: {bare:?}", bare.len());
}
