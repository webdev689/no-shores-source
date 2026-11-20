//! The hub's townsfolk: the ways they walk through every court, passage and walk and into the Hall, and the posts
//! where they work, play or stay a while: smiths at the anvil, a band at the bandstand with dancers, a juggler before
//! the arrivals, a snake charmer on the Beacon Walk, sweepers on their rounds, talkers, a pilgrim at prayer, keepers of
//! the market stalls, and walkers who look out to sea, browse the stalls and watch the performers.

use super::Laid;
use crate::courtyard::Frame;
use crate::life::{Keep, Post, Task, Ways};
use crate::stations::Station;

/// The ways' points: an id the links name, what the point is ("" for a plain turn), and where it stands, metres
/// across the plaza and seaward of its middle.
const POINTS: &[(&str, &str, f64, f64)] = &[
    // The seaward walk, its views over the city to the sea.
    ("sw-124", "view:seaward-1", -124.0, 54.0),
    ("sw-98", "", -98.0, 54.0),
    ("sw-72", "view:seaward-2", -72.0, 54.0),
    ("sw-50", "", -50.0, 54.0),
    ("sw-25", "view:seaward-3", -25.0, 54.0),
    ("sw0", "", 0.0, 54.0),
    ("sw25", "view:seaward-4", 25.0, 54.0),
    ("sw50", "", 50.0, 54.0),
    ("sw72", "view:seaward-5", 72.0, 54.0),
    ("sw98", "", 98.0, 54.0),
    ("sw124", "view:seaward-6", 124.0, 54.0),
    // The Watch Court: round the obelisk's plinth, to the board, the Mage and the vaults, and to the passages.
    ("wc-nw", "", -30.0, 36.0),
    ("wc-n", "", 0.0, 36.0),
    ("wc-ne", "", 30.0, 36.0),
    ("ob-n", "", 0.0, 21.0),
    ("ob-w", "", -13.0, 8.0),
    ("ob-e", "", 13.0, 8.0),
    ("ob-s", "", 0.0, -5.0),
    ("wc-w", "", -30.0, 8.0),
    ("wc-e", "", 30.0, 8.0),
    ("board", "board", -44.0, 0.0),
    ("mage", "counter:mage", 40.0, 0.0),
    ("wc-sw", "", -36.0, -16.0),
    ("wc-se", "", 36.0, -16.0),
    ("vault-w", "counter:vault", -24.0, -21.0),
    ("vault-e", "counter:vault", 24.0, -21.0),
    ("wc-s", "", 0.0, -30.0),
    ("wc-s2", "", 0.0, -52.0),
    // The ranges' passages, each end.
    ("gw1-in", "", -50.0, 18.0),
    ("gw1-out", "", -70.0, 18.0),
    ("gw2-in", "", -50.0, -18.0),
    ("gw2-out", "", -70.0, -18.0),
    ("ge1-in", "", 50.0, 18.0),
    ("ge1-out", "", 70.0, 18.0),
    ("ge2-in", "", 50.0, -18.0),
    ("ge2-out", "", 70.0, -18.0),
    // The West Court: the Tailor, round the fountain, before the bandstand.
    ("wt-n", "", -98.0, 36.0),
    ("wt-nw", "", -116.0, 36.0),
    ("tailor", "counter:tailor", -114.0, 22.0),
    ("wt-e", "", -80.0, 8.0),
    ("fo-n", "view:fountain", -98.0, 5.0),
    ("fo-w", "", -107.0, -6.0),
    ("fo-e", "", -89.0, -6.0),
    ("fo-s", "", -98.0, -17.0),
    ("band", "view:band", -98.0, -28.0),
    ("wt-sw", "", -118.0, -30.0),
    ("wt-se", "", -78.0, -30.0),
    ("wt-s", "", -112.0, -54.0),
    // The Forge Yard: the forge, the anvil, the armoury.
    ("fy-n", "", 98.0, 36.0),
    ("forge", "counter:weaponsmith", 112.0, 26.0),
    ("fy-w", "", 84.0, 8.0),
    ("anvil", "view:anvil", 88.0, -4.0),
    ("fy-sw", "", 84.0, -30.0),
    ("armoury", "counter:armorsmith", 113.0, -12.0),
    ("fy-s", "", 104.0, -34.0),
    ("fy-se", "", 122.0, -42.0),
    // The Beacon Walk, the portico and the door.
    ("bw-145", "", -145.0, -80.0),
    ("bw-120", "", -120.0, -80.0),
    ("bw-95", "", -95.0, -80.0),
    ("bw-70", "", -70.0, -80.0),
    ("bw-40", "", -40.0, -80.0),
    ("bw0", "", 0.0, -80.0),
    ("bw40", "", 40.0, -80.0),
    ("bw70", "", 70.0, -80.0),
    ("bw95", "", 95.0, -80.0),
    ("bw120", "", 120.0, -80.0),
    ("bw145", "", 145.0, -80.0),
    ("fish", "stall:fish", -58.0, -95.0),
    ("fruit", "stall:fruit", 58.0, -95.0),
    ("pots", "stall:pots", -136.0, -97.0),
    ("gate-w", "view:sealed-west", -115.0, -96.0),
    ("gate-e", "view:sealed-east", 115.0, -96.0),
    ("ww", "view:west-walk", -142.0, -40.0),
    ("ew", "", 140.0, -40.0),
    ("tack", "counter:tack", 135.0, -62.0),
    ("po-front", "", 0.0, -84.0),
    ("po-door", "", 0.0, -100.0),
    // The Hall: in by the door, down the aisles either side of the war table, through the columns' gaps.
    ("h-in", "", 0.0, -115.0),
    ("h-nw", "", -8.0, -121.0),
    ("h-ne", "", 8.0, -121.0),
    ("h-w1", "", -8.0, -132.0),
    ("h-e1", "", 8.0, -132.0),
    ("h-w2", "", -8.0, -148.0),
    ("h-e2", "", 8.0, -148.0),
    ("h-s", "counter:lamplighters", 0.0, -155.0),
    ("h-wg", "", -21.0, -132.0),
    ("h-eg", "", 21.0, -132.0),
    ("storm", "counter:stormcallers", -21.0, -140.0),
    ("veiled", "counter:veiled", 21.0, -140.0),
    ("table", "view:war-table", -5.0, -140.0),
];

/// The links between the points, by id, each walked either way.
const LINKS: &[(&str, &str)] = &[
    ("sw-124", "sw-98"),
    ("sw-98", "sw-72"),
    ("sw-72", "sw-50"),
    ("sw-50", "sw-25"),
    ("sw-25", "sw0"),
    ("sw0", "sw25"),
    ("sw25", "sw50"),
    ("sw50", "sw72"),
    ("sw72", "sw98"),
    ("sw98", "sw124"),
    ("sw-25", "wc-nw"),
    ("sw0", "wc-n"),
    ("sw25", "wc-ne"),
    ("wc-nw", "wc-n"),
    ("wc-n", "wc-ne"),
    ("wc-n", "ob-n"),
    ("ob-n", "ob-w"),
    ("ob-w", "ob-s"),
    ("ob-s", "ob-e"),
    ("ob-e", "ob-n"),
    ("wc-nw", "wc-w"),
    ("wc-ne", "wc-e"),
    ("wc-w", "ob-w"),
    ("wc-e", "ob-e"),
    ("wc-w", "board"),
    ("wc-e", "mage"),
    ("wc-w", "gw1-in"),
    ("wc-e", "ge1-in"),
    ("gw1-in", "gw1-out"),
    ("ge1-in", "ge1-out"),
    ("wc-w", "wc-sw"),
    ("wc-e", "wc-se"),
    ("wc-sw", "gw2-in"),
    ("wc-se", "ge2-in"),
    ("gw2-in", "gw2-out"),
    ("ge2-in", "ge2-out"),
    ("wc-sw", "vault-w"),
    ("wc-se", "vault-e"),
    ("vault-w", "wc-s"),
    ("vault-e", "wc-s"),
    ("ob-s", "wc-s"),
    ("wc-s", "wc-s2"),
    ("wc-s2", "bw0"),
    ("sw-98", "wt-n"),
    ("sw-124", "wt-nw"),
    ("wt-nw", "wt-n"),
    ("wt-nw", "tailor"),
    ("wt-n", "fo-n"),
    ("gw1-out", "wt-e"),
    ("wt-e", "fo-n"),
    ("wt-e", "fo-e"),
    ("gw2-out", "wt-se"),
    ("fo-n", "fo-w"),
    ("fo-w", "fo-s"),
    ("fo-s", "fo-e"),
    ("fo-e", "fo-n"),
    ("fo-s", "band"),
    ("fo-w", "wt-sw"),
    ("band", "wt-sw"),
    ("band", "wt-se"),
    ("wt-sw", "wt-s"),
    ("wt-s", "bw-120"),
    ("wt-se", "bw-70"),
    ("sw98", "fy-n"),
    ("fy-n", "forge"),
    ("fy-n", "fy-w"),
    ("ge1-out", "fy-w"),
    ("fy-w", "anvil"),
    ("ge2-out", "fy-sw"),
    ("anvil", "fy-sw"),
    ("fy-sw", "fy-s"),
    ("fy-s", "armoury"),
    ("fy-s", "fy-se"),
    ("fy-se", "ew"),
    ("fy-sw", "bw70"),
    ("ew", "tack"),
    ("tack", "bw145"),
    ("bw-145", "bw-120"),
    ("bw-120", "bw-95"),
    ("bw-95", "bw-70"),
    ("bw-70", "bw-40"),
    ("bw-40", "bw0"),
    ("bw0", "bw40"),
    ("bw40", "bw70"),
    ("bw70", "bw95"),
    ("bw95", "bw120"),
    ("bw120", "bw145"),
    ("bw-145", "ww"),
    ("bw-145", "pots"),
    ("bw-70", "fish"),
    ("bw70", "fruit"),
    ("bw-120", "gate-w"),
    ("bw120", "gate-e"),
    ("bw0", "po-front"),
    ("po-front", "po-door"),
    ("po-door", "h-in"),
    ("h-in", "h-nw"),
    ("h-in", "h-ne"),
    ("h-nw", "h-w1"),
    ("h-ne", "h-e1"),
    ("h-w1", "h-w2"),
    ("h-e1", "h-e2"),
    ("h-w2", "h-s"),
    ("h-e2", "h-s"),
    ("h-w1", "h-wg"),
    ("h-e1", "h-eg"),
    ("h-wg", "storm"),
    ("h-eg", "veiled"),
    ("h-w1", "table"),
];

/// Posts by a way point: what is done, where (across, seaward), facing (degrees clockwise from north), who keeps it.
const POSTS: &[(Task, f64, f64, f64, Keep, &str)] = &[
    (Task::Juggle, -18.0, 28.0, 0.0, Keep::Kept, "wc-nw"),
    (Task::Idle, -18.0, 33.0, 180.0, Keep::Visited, "wc-nw"),
    (Task::Idle, -15.0, 33.0, 200.0, Keep::Visited, "wc-nw"),
    (Task::Sweep, -20.0, 30.0, 90.0, Keep::Round(0), "wc-nw"),
    (Task::Sweep, 20.0, 30.0, 180.0, Keep::Round(0), "wc-ne"),
    (Task::Sweep, 22.0, -8.0, 270.0, Keep::Round(0), "wc-e"),
    (Task::Sweep, -22.0, -8.0, 0.0, Keep::Round(0), "wc-w"),
    (Task::Sweep, -80.0, -72.0, 90.0, Keep::Round(1), "bw-70"),
    (Task::Sweep, -20.0, -74.0, 90.0, Keep::Round(1), "bw-40"),
    (Task::Sweep, 30.0, -74.0, 90.0, Keep::Round(1), "bw40"),
    (Task::Sweep, 88.0, -72.0, 270.0, Keep::Round(1), "bw95"),
    (Task::Gesture, -61.0, 50.0, 90.0, Keep::Kept, "sw-50"),
    (Task::Gesture, -59.0, 50.0, 270.0, Keep::Kept, "sw-50"),
    (Task::Drink, 60.0, 50.0, 90.0, Keep::Kept, "sw50"),
    (Task::Gesture, 62.0, 50.0, 270.0, Keep::Kept, "sw50"),
    (Task::Gesture, 81.0, -70.0, 90.0, Keep::Kept, "bw70"),
    (Task::Gesture, 83.0, -70.0, 270.0, Keep::Kept, "bw95"),
    (Task::Charm, -95.0, -73.0, 0.0, Keep::Kept, "bw-95"),
    (Task::Idle, -95.0, -68.0, 180.0, Keep::Visited, "bw-95"),
    (Task::Dance, -101.0, -31.0, 180.0, Keep::Kept, "band"),
    (Task::Dance, -95.0, -31.0, 180.0, Keep::Kept, "band"),
    (Task::Idle, -104.0, -26.0, 180.0, Keep::Visited, "band"),
    (Task::Idle, -92.0, -26.0, 180.0, Keep::Visited, "band"),
    (Task::Idle, -98.0, 2.0, 180.0, Keep::Visited, "fo-n"),
    (Task::Idle, 88.0, -1.0, 90.0, Keep::Visited, "anvil"),
    (Task::Carry, 113.0, 39.0, 90.0, Keep::Kept, "fy-n"),
    (Task::Sweep, 137.0, -55.0, 0.0, Keep::Kept, "tack"),
    (Task::Pray, -4.0, -156.0, 180.0, Keep::Kept, "h-s"),
    (Task::Gesture, 12.0, -126.0, 90.0, Keep::Kept, "h-ne"),
    (Task::Gesture, 14.0, -126.0, 270.0, Keep::Kept, "h-ne"),
    (Task::Idle, -5.0, -137.0, 90.0, Keep::Visited, "table"),
    (Task::Idle, -142.0, -36.0, 270.0, Keep::Visited, "ww"),
    (Task::Idle, -115.0, -99.0, 180.0, Keep::Visited, "gate-w"),
    (Task::Idle, 115.0, -99.0, 180.0, Keep::Visited, "gate-e"),
];

/// A direction's bearing, radians clockwise from north: what a post's facing is.
fn bearing_of(direction: [f64; 2]) -> f64 {
    libm::atan2(direction[0], -direction[1])
}

/// The ways and posts: the authored network, the posts above, each stall's customer before its counter and each
/// market stall's keeper, the views over the parapet, and the smiths and the band at their modules' sockets.
#[must_use]
pub(crate) fn life(frame: &Frame, laid: &Laid) -> (Ways, Vec<Post>) {
    let mut ways = Ways::default();
    let mut ids: Vec<&str> = Vec::with_capacity(POINTS.len());
    for &(id, name, across, toward) in POINTS {
        ways.point(frame.at(toward, across), name);
        ids.push(id);
    }
    let index = |id: &str| u32::try_from(ids.iter().position(|own| *own == id).unwrap_or(0)).unwrap_or(0);
    ways.links.extend(LINKS.iter().map(|&(one, two)| [index(one), index(two)]));
    let bearing = |degrees: f64| degrees.to_radians();
    let mut posts: Vec<Post> = POSTS
        .iter()
        .map(|&(task, across, toward, facing, keep, from)| Post {
            task,
            at: frame.at(toward, across),
            facing: bearing(facing),
            keep,
            reached_from: index(from),
        })
        .collect();
    for (number, (_, name, _, _)) in POINTS.iter().enumerate() {
        if name.starts_with("view:seaward") {
            let [x, y] = ways.points[number].at;
            let at = [x + frame.seaward[0] * 4.2, y + frame.seaward[1] * 4.2];
            let reached_from = u32::try_from(number).unwrap_or(0);
            posts.push(Post { task: Task::Idle, at, facing: bearing_of(frame.seaward), keep: Keep::Visited, reached_from });
        }
    }
    posts.extend(customers(&laid.stations, &ways));
    let worked = [("anvil-yard", "smith-", Task::Smith, "anvil")];
    for (module, socket, task, from) in worked {
        for nth in 1..=2 {
            for (at, facing) in laid.sockets_of(module, &format!("{socket}{nth}")) {
                posts.push(Post { task, at: [at[0], at[1]], facing: bearing_of(facing), keep: Keep::Kept, reached_from: index(from) });
            }
        }
    }
    let band = [Task::PlayLute, Task::PlayFlute, Task::PlayRecorder, Task::PlayTambourine];
    for (nth, task) in band.into_iter().enumerate() {
        for (at, facing) in laid.sockets_of("bandstand", &format!("player-{}", nth + 1)) {
            posts.push(Post { task, at: [at[0], at[1]], facing: bearing_of(facing), keep: Keep::Kept, reached_from: index("band") });
        }
    }
    for (module, from) in [("market-stall-fish", "fish"), ("market-stall-fruit", "fruit"), ("market-stall-pots", "pots")] {
        for (at, facing) in laid.sockets_of(module, "keeper") {
            posts.push(Post { task: Task::Gesture, at: [at[0], at[1]], facing: bearing_of(facing), keep: Keep::Kept, reached_from: index(from) });
        }
    }
    (ways, posts)
}

/// A walker browsing each keeper's counter: standing 1.2 m before it, facing it, reached from the way point named for
/// the counter's kind nearest it. A station's facing is the turn that points out of its counter (`turn_toward`), so
/// out is (-sin, cos) and a customer facing in faces that same angle as a bearing.
fn customers(stations: &[Station], ways: &Ways) -> Vec<Post> {
    stations
        .iter()
        .filter_map(|station| {
            let kind = serde_json::to_value(station.kind).ok()?;
            let name = format!("counter:{}", kind.as_str()?);
            let (from, _) = ways
                .points
                .iter()
                .enumerate()
                .filter(|(_, point)| point.name == name)
                .map(|(at, point)| (at, (point.at[0] - station.counter[0]).hypot(point.at[1] - station.counter[1])))
                .min_by(|one, two| one.1.total_cmp(&two.1))?;
            let out = [-libm::sin(station.facing), libm::cos(station.facing)];
            let at = [station.counter[0] + out[0] * 1.2, station.counter[1] + out[1] * 1.2];
            let facing = station.facing;
            Some(Post { task: Task::Hold, at, facing, keep: Keep::Visited, reached_from: u32::try_from(from).ok()? })
        })
        .collect()
}
