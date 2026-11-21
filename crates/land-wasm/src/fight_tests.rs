use super::*;
use crate::open_view;

/// The square continent the sail door's voyages open, as the browser's tests write it.
const SQUARE: &str = r#"{ "id": "square", "keep": true, "edits": null, "layout": { "continents": [{ "id": "square", "outline": [[200000, 300000], [320000, 300000], [320000, 420000], [200000, 420000]] }], "isles": [] } }"#;

fn answer(text: &str) -> Value {
    serde_json::from_str(text).unwrap_or(Value::Null)
}

fn opened() {
    let bytes = open_view(SQUARE.as_bytes());
    let length = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    let header: Value = serde_json::from_slice(&bytes[4..4 + length]).unwrap_or(Value::Null);
    assert!(header.get("error").is_none(), "{header}");
}

fn begun(seed: u32) -> Value {
    opened();
    answer(&fight_begin_json(
        format!(r#"{{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0], "seed": {seed}, "time": 1000 }}"#).as_bytes(),
    ))
}

/// A step's request from a leg: the helm's steer and climb, the look's bearing and range (none for a range of 0), the
/// fire and the brace (1 or 0), the load (0 none, 2 grape, 9 one there is not) and the ticks.
fn step_request(leg: [f64; 8], time: f64) -> String {
    let [steer, climb, bearing, range, fire, brace, load, ticks] = leg;
    let aim = if range > 0.0 { format!(r#"{{ "bearing": {bearing}, "range": {range} }}"#) } else { "null".into() };
    let load = match load as u8 {
        2 => r#""grape""#,
        9 => r#""canister""#,
        _ => "null",
    };
    let (fire, brace) = (fire == 1.0, brace == 1.0);
    format!(
        r#"{{ "time": {time}, "ticks": {ticks}, "world": 0, "helm": {{ "steer": {steer}, "crab": false, "climb": {climb} }}, "aim": {aim}, "fire": {fire}, "brace": {brace}, "load": {load} }}"#
    )
}

#[test]
fn a_fight_begins_with_a_captain_on_the_ring_round_the_sloop() {
    let begun = begun(7);
    assert!(begun.get("error").is_none(), "{begun}");
    let captain = &begun["captain"]["ship"];
    let (x, y) = (captain[0].as_f64().unwrap_or(0.0) - 180_000.0, captain[1].as_f64().unwrap_or(0.0) - 360_000.0);
    assert!((650.0..=1000.0).contains(&(x * x + y * y).sqrt()));
    assert_eq!(begun["captain"]["name"], "Pirate Sloop");
    assert_eq!(begun["captain"]["faction"], 2, "the pirates");
    assert_eq!(begun["captain"]["rank"], 2, "a Major");
    assert_eq!(begun["player"]["max_hull"], 240.0);
    assert_eq!(begun["over"], Value::Null);
}

/// Each arc of a lay, flown from its launch for its end's time, comes down on its end.
fn arcs_end_on_their_stops(lay: &Value) {
    let (launches, ends) = (lay["launches"].as_array().cloned(), lay["ends"].as_array().cloned());
    let (launches, ends) = (launches.unwrap_or_default(), ends.unwrap_or_default());
    assert!(!launches.is_empty() && launches.len() == ends.len());
    let number = |value: &Value, index: usize| value[index].as_f64().unwrap_or(f64::NAN);
    for (launch, end) in launches.iter().zip(&ends) {
        let (start, velocity) =
            ([0, 1, 2].map(|axis| number(launch, axis)), [3, 4, 5].map(|axis| number(launch, axis)));
        let came = naval::ballistics::flight(start, velocity, end["time"].as_f64().unwrap_or(0.0));
        let point = [0, 1, 2].map(|axis| number(&end["point"], axis));
        let off = (0..3).map(|axis| (came[axis] - point[axis]) * (came[axis] - point[axis])).sum::<f64>().sqrt();
        assert!(off < 0.01, "an arc ends {off} m from its stop");
    }
}

#[test]
fn under_way_each_guns_arc_starts_where_its_ball_leaves_a_ripple_later_and_ends_on_its_stop() {
    opened();
    let begun = answer(&fight_begin_json(
        r#"{ "ship": [180000, 360000, 0, 5, 0, 0, 5, 2], "seed": 7, "time": 1000 }"#.as_bytes(),
    ));
    assert!(begun.get("error").is_none(), "{begun}");
    let looked = answer(&fight_step_json(step_request([0.0, 0.0, 90.0, 80.0, 0.0, 0.0, 0.0, 1.0], 1000.0).as_bytes()));
    arcs_end_on_their_stops(&looked["lay"]);
}

#[test]
fn a_step_answers_the_lay_its_look_holds_and_the_refusals_of_its_fire() {
    begun(7);
    let looked = answer(&fight_step_json(step_request([0.0, 0.0, 90.0, 80.0, 1.0, 0.0, 0.0, 1.0], 1000.0).as_bytes()));
    assert_eq!(looked["lay"]["side"], "starboard");
    assert_eq!(looked["lay"]["launches"].as_array().map(Vec::len), Some(3));
    let ends = looked["lay"]["ends"].as_array().cloned().unwrap_or_default();
    assert_eq!(ends.len(), 3, "each gun's end");
    assert!(ends.iter().all(|end| end["time"].as_f64().is_some_and(|time| time > 0.0) && end["water"] == true));
    arcs_end_on_their_stops(&looked["lay"]);
    assert!(looked["lay"]["radius"].as_f64().is_some_and(|radius| radius >= 1.6));
    let again = answer(&fight_step_json(step_request([0.0, 0.0, 90.0, 80.0, 1.0, 0.0, 0.0, 1.0], 1000.0).as_bytes()));
    let refused: Vec<&Value> =
        again["events"].as_array().into_iter().flatten().filter(|event| event["kind"] == "refused").collect();
    assert_eq!(refused.first().map(|event| &event["why"]), Some(&json!("reloading")));
    let ahead = answer(&fight_step_json(step_request([0.0, 0.0, 0.0, 80.0, 0.0, 0.0, 0.0, 1.0], 1000.0).as_bytes()));
    assert_eq!(ahead["lay"], Value::Null, "no guns bear dead ahead");
}

#[test]
fn bad_orders_and_a_step_with_no_fight_are_refused() {
    begun(7);
    let refused = |text: String| answer(&fight_step_json(text.as_bytes())).get("error").is_some();
    assert!(refused(step_request([0.0, 0.0, 90.0, 1e9, 0.0, 0.0, 0.0, 1.0], 1000.0)), "a look past 100 km");
    assert!(refused(step_request([0.0, 0.0, 270.0, 80.0, 0.0, 0.0, 0.0, 1.0], 1000.0)), "a bearing past 180");
    assert!(refused(step_request([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 9.0, 1.0], 1000.0)), "no such load");
    assert!(refused(step_request([2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0], 1000.0)), "a rudder past its throw");
    assert!(refused(step_request([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 61.0], 1000.0)), "more than a second");
    assert!(refused(r#"{ "time": NaN }"#.to_string()), "not JSON");
    assert!(
        answer(&fight_begin_json(br#"{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 9], "seed": 1, "time": 0 }"#))
            .get("error")
            .is_some(),
        "rung 9"
    );
    end_fight();
    assert!(refused(step_request([0.0; 8], 1000.0)), "no fight is on");
}

/// A fight the browser's test fights too (client/src/rules/fightRules.test.ts): each leg's steer, climb, look's
/// bearing and range (a range of 0 for none), fire, brace, load (0 none, 2 grape) and ticks.
pub const FIGHT_LEGS: [[f64; 8]; 9] = [
    [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 60.0],
    [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 60.0],
    [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 60.0],
    [0.0, 0.0, 90.0, 120.0, 1.0, 0.0, 0.0, 60.0],
    [0.0, 0.0, -90.0, 60.0, 1.0, 0.0, 0.0, 60.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 2.0, 60.0],
    [-1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 60.0],
    [0.0, 0.0, 90.0, 40.0, 1.0, 0.0, 0.0, 60.0],
    [0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 60.0],
];

#[test]
fn a_fight_steps_to_its_pinned_fingerprint() {
    let mut last = begun(7);
    let mut time = 1000.0;
    let (mut kinds, mut prints) = (Vec::new(), Vec::new());
    for leg in FIGHT_LEGS {
        last = answer(&fight_step_json(step_request(leg, time).as_bytes()));
        assert!(last.get("error").is_none(), "{last}");
        kinds.extend(
            last["events"].as_array().into_iter().flatten().map(|event| format!("{}{}", event["kind"], event["ship"])),
        );
        prints.push(last["fingerprint"].as_str().unwrap_or("").to_string());
        time += leg[7] / 60.0;
    }
    let fired = kinds.iter().filter(|kind| kind.as_str() == r#""muzzle"0"#).count();
    assert_eq!(fired, 6, "two broadsides of three, the third refused braced or loading: {kinds:?}");
    assert_eq!(last["player"]["guns"]["load"], "grape");
    // Each leg's: the balls aloft at a leg's end are in it, and the captain's commission and strike share.
    assert_eq!(
        prints.join(" "),
        "c260ed1b87a55f96 3e3cf79d73048acd d77ebd53e675a37a 5d80724e7b68e606 0b9380a89816d944 1e892a0e43435ea8 e4a860157548a71e a2b9868bfa198cc6 5c2f8c2cb43c1f94"
    );
}

#[test]
fn a_begin_whose_ship_holds_anything_but_numbers_is_refused() {
    opened();
    let junk =
        answer(&fight_begin_json(br#"{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0, "junk"], "seed": 1, "time": 0 }"#));
    assert!(junk.get("error").is_some(), "{junk}");
    let null = answer(&fight_begin_json(br#"{ "ship": [180000, 360000, 0, 0, 0, 0, null, 0], "seed": 1, "time": 0 }"#));
    assert!(null.get("error").is_some(), "{null}");
}

#[test]
fn a_look_whose_ray_is_not_six_finite_numbers_is_refused() {
    begun(7);
    let with_ray = |ray: &str| {
        let request = step_request([0.0, 0.0, 90.0, 80.0, 0.0, 0.0, 0.0, 1.0], 1000.0)
            .replace(r#""range": 80 }"#, &format!(r#""range": 80, "ray": {ray} }}"#));
        answer(&fight_step_json(request.as_bytes()))
    };
    assert_eq!(with_ray("[5, 3, 6, 1, 0, -0.1]")["lay"]["side"], "starboard", "{}", with_ray("[5, 3, 6, 1, 0, -0.1]"));
    for bad in [r#"[5, 3, 6, 1, 0, "down"]"#, "[5, 3, 6, 1, 0, null]", "[5, 3, 6, 1, 0]", r#""up""#] {
        assert!(with_ray(bad).get("error").is_some(), "{bad}");
    }
}

/// The fight `FIGHT_LEGS` fights against a pirate captain of `rank`, in its rank's hull: each leg's fingerprint.
fn fought_with(rank: u8) -> Vec<String> {
    opened();
    let begin = format!(r#"{{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0], "seed": 7, "time": 1000, "rank": {rank} }}"#);
    let begun = answer(&fight_begin_json(begin.as_bytes()));
    assert!(begun.get("error").is_none(), "{begun}");
    assert_eq!(begun["captain"]["rank"], rank);
    let mut time = 1000.0;
    let mut prints = Vec::new();
    for leg in FIGHT_LEGS {
        let last = answer(&fight_step_json(step_request(leg, time).as_bytes()));
        assert!(last.get("error").is_none(), "{last}");
        prints.push(last["fingerprint"].as_str().unwrap_or("").to_string());
        time += leg[7] / 60.0;
    }
    prints
}

/// Each hull's fight (a Major's Sloop, an Elite's Schooner, a Miniboss's Brig and a Boss's Frigate): its last leg's
/// fingerprint, which the browser's test (client/src/rules/fightRules.test.ts) fights to through WebAssembly.
pub const HULL_FIGHTS: [(u8, u8, &str); 4] =
    [(2, 0, "5c2f8c2cb43c1f94"), (3, 1, "f93b527b95c4c488"), (4, 2, "8c047ef2efba39b2"), (5, 3, "dd52327febd0d01d")];

#[test]
fn a_fight_against_each_hull_steps_to_its_pinned_fingerprint() {
    for (rank, hull, print) in HULL_FIGHTS {
        let prints = fought_with(rank);
        let begun = answer(&fight_begin_json(
            format!(r#"{{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0], "seed": 7, "time": 1000, "rank": {rank} }}"#)
                .as_bytes(),
        ));
        assert_eq!(begun["captain"]["hull_kind"], hull, "a captain of rank {rank} sails its rank's hull");
        assert_eq!(begun["player"]["hull_kind"], 0, "the player sails their Sloop");
        assert_eq!(prints.last().map(String::as_str), Some(print), "rank {rank}: {prints:?}");
    }
    let refused = |rank: &str| {
        let begin =
            format!(r#"{{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0], "seed": 7, "time": 1000, "rank": {rank} }}"#);
        answer(&fight_begin_json(begin.as_bytes())).get("error").is_some()
    };
    assert!(refused("0") && refused("6") && refused("2.5") && refused("\"boss\""));
}

#[test]
fn a_balls_hit_tells_where_on_the_ship_it_struck_and_the_sea_fights_own_events_are_told() {
    use naval::damage::Zone;
    use naval::fight::{Part, Piece};
    let gun = naval::guns::SWIVEL;
    let shot = naval::guns::Shot::Round;
    let hit = ShotEvent::Hit {
        shooter: 0,
        target: 1,
        zone: Zone::Hull,
        point: [1.0, 2.0, 3.0],
        flight: 0.5,
        gun,
        shot,
        sail: None,
    };
    let events = [
        Event::Hit { ship: 1, at: [4.0, -1.0, 2.0], part: Part::Hull },
        Event::SailLost { ship: 1, sail: 0 },
        Event::Struck { ship: 1 },
        Event::Shot(hit),
        Event::Flotsam { id: 7, at: [5.0, 6.0], kind: Piece::Chest },
    ];
    let told = events_json(&events);
    assert_eq!(told.len(), 4, "its new hit is told with the shot's");
    // As the fight tells them: its torn sail and its colours between the hit and its ball's.
    assert_eq!(told[0]["kind"], "SailLost");
    assert_eq!(told[1]["kind"], "Struck");
    assert_eq!((told[2]["kind"].as_str(), told[2]["part"].as_str()), (Some("hit"), Some("hull")));
    assert_eq!(told[2]["at"], serde_json::json!([4.0, -1.0, 2.0]));
    assert_eq!((told[3]["kind"].as_str(), told[3]["kind_of"].as_str()), (Some("Flotsam"), Some("chest")));
}

#[test]
fn a_fight_begun_with_captains_sets_each_where_it_is_given_and_shows_the_rest_in_others() {
    opened();
    let begun = answer(&fight_begin_json(
        br#"{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0], "seed": 4, "time": 1000, "captains": [
            { "x": 180400, "y": 360000, "heading": 4.7, "faction": 2, "rank": 1 },
            { "x": 179600, "y": 360100, "heading": 1.5, "faction": 2, "rank": 3 },
            { "x": 180000, "y": 359500, "heading": 3.1, "faction": 1, "rank": 2 } ] }"#,
    ));
    assert!(begun.get("error").is_none(), "{begun}");
    assert_eq!(begun["captain"]["ship"][0], 180_400.0);
    assert_eq!(begun["captain"]["rank"], 1);
    let others = begun["others"].as_array().cloned().unwrap_or_default();
    assert_eq!(others.len(), 2, "every captain after the first");
    assert_eq!(others[0]["ship"][0], 179_600.0);
    assert_eq!(others[0]["rank"], 3);
    assert_eq!(others[1]["faction"], 1, "the Grey Tithe");
    assert_eq!(others[1]["name"], "Tithe Sloop");
}

#[test]
fn a_fight_begun_without_captains_has_no_others_and_bad_captains_are_refused() {
    assert_eq!(begun(7)["others"], serde_json::json!([]));
    let refused = |captains: &str| {
        let request = format!(
            r#"{{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0], "seed": 4, "time": 1000, "captains": {captains} }}"#
        );
        answer(&fight_begin_json(request.as_bytes()))["error"].as_str().map(str::to_owned)
    };
    assert!(refused("[]").is_some(), "no captains in the list");
    assert!(refused(r#"[{ "x": 1, "y": 1, "heading": 0, "faction": 2, "rank": 9 }]"#).is_some(), "no such rank");
    assert!(refused(r#"[{ "x": 1, "y": 1, "heading": 0, "faction": 0, "rank": 1 }]"#).is_some(), "no such faction");
    assert!(refused(r#"[{ "x": "a", "y": 1, "heading": 0, "faction": 2, "rank": 1 }]"#).is_some(), "not a number");
}

#[test]
fn a_captain_set_aground_is_refused() {
    opened();
    let refused = answer(&fight_begin_json(
        br#"{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0], "seed": 4, "time": 1000, "captains": [
            { "x": 260000, "y": 360000, "heading": 0, "faction": 2, "rank": 1 } ] }"#,
    ));
    assert!(refused["error"].as_str().is_some_and(|error| error.contains("does not float")), "{refused}");
}

#[test]
fn every_captain_shows_how_far_her_hurts_have_settled_her() {
    opened();
    let begun = answer(&fight_begin_json(
        br#"{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0], "seed": 4, "time": 1000, "captains": [
            { "x": 180400, "y": 360000, "heading": 4.7, "faction": 2, "rank": 2 },
            { "x": 179600, "y": 360100, "heading": 1.5, "faction": 2, "rank": 2 } ] }"#,
    ));
    for captain in [&begun["captain"], &begun["others"][0]] {
        assert_eq!(captain["founder"], serde_json::json!([0.0, 0.0, 0.0]), "a sound ship is not settled: {captain}");
    }
}

/// Deep, still water everywhere.
struct Deep;

impl Waters for Deep {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> sailing::waters::Spot {
        sailing::waters::Spot { bed: -50.0, surface: Some(0.0) }
    }
}

#[test]
fn an_ambush_whose_captains_have_all_struck_or_sunk_is_over_beaten() {
    let at = |x: f64| Ship { x, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let major = Commission::of(2, Rank::Major).unwrap_or_else(|| panic!("pirates sail Majors"));
    let mut fight = Fight::ambush(at(0.0), &[(at(500.0), major, 1), (at(-500.0), major, 2)], 3, &Deep, 0.0)
        .unwrap_or_else(|error| panic!("{error}"));
    assert_eq!(over_name(&fight), None);
    for (state, id) in [State::Struck, State::Sunk].into_iter().zip(CAPTAIN..) {
        fight.ships.get_mut(&id).unwrap_or_else(|| panic!("{id}")).damage.state = state;
    }
    assert_eq!(over_name(&fight), Some("beaten"));
}

#[test]
fn a_captain_going_down_shows_how_far_she_has_settled_and_her_trim_and_list() {
    let at = |x: f64| Ship { x, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let major = Commission::of(2, Rank::Major).unwrap_or_else(|| panic!("pirates sail Majors"));
    let mut fight =
        Fight::ambush(at(0.0), &[(at(500.0), major, 1)], 3, &Deep, 0.0).unwrap_or_else(|error| panic!("{error}"));
    let damage = &mut fight.ships.get_mut(&CAPTAIN).unwrap_or_else(|| panic!("the captain")).damage;
    (damage.state, damage.sink_t) = (State::Sinking, 20.0);
    let shown = view(&fight, &[], None, &Deep, 0.0);
    let founder: Vec<f64> = shown["captain"]["founder"]
        .as_array()
        .map(|all| all.iter().filter_map(Value::as_f64).collect())
        .unwrap_or_default();
    assert_eq!(founder.len(), 3, "{shown}");
    assert!(founder[0] > 0.5, "settled under: {founder:?}");
    assert!(founder[1].abs() > 0.01 && founder[2].abs() > 0.01, "trimmed and listing: {founder:?}");
}

#[test]
fn a_captain_going_down_shows_how_it_will_lie_once_sunk_and_how_soon() {
    let at = |x: f64| Ship { x, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let major = Commission::of(2, Rank::Major).unwrap_or_else(|| panic!("pirates sail Majors"));
    let mut fight =
        Fight::ambush(at(0.0), &[(at(500.0), major, 1)], 3, &Deep, 0.0).unwrap_or_else(|error| panic!("{error}"));
    assert!(view(&fight, &[], None, &Deep, 0.0)["captain"].get("sunk_founder").is_none(), "afloat, it is not going");
    let damage = &mut fight.ships.get_mut(&CAPTAIN).unwrap_or_else(|| panic!("the captain")).damage;
    (damage.state, damage.sink_t) = (State::Sinking, 5.0);
    let shown = view(&fight, &[], None, &Deep, 0.0);
    let triple = |name: &str| -> Vec<f64> {
        shown["captain"][name].as_array().map(|all| all.iter().filter_map(Value::as_f64).collect()).unwrap_or_default()
    };
    let (now, sunk) = (triple("founder"), triple("sunk_founder"));
    assert_eq!(sunk.len(), 3, "{shown}");
    assert!(sunk[0] > now[0] && sunk[1].abs() > now[1].abs(), "deeper and trimmed further: {now:?} {sunk:?}");
    assert_eq!(sunk[2].signum(), now[2].signum(), "listing the side it lists to now");
    assert_eq!(shown["captain"]["sinks_in"], SINK_SECONDS - 5.0);
}

#[test]
fn a_captain_given_its_way_comes_on_under_sail_and_one_without_lies_at_rest() {
    opened();
    let begun = answer(&fight_begin_json(
        br#"{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0], "seed": 4, "time": 1000, "captains": [
            { "x": 180400, "y": 360000, "heading": 4.7, "faction": 2, "rank": 2, "way": 5 },
            { "x": 179600, "y": 360100, "heading": 1.5, "faction": 2, "rank": 2 } ] }"#,
    ));
    assert!(begun.get("error").is_none(), "{begun}");
    let (coming, resting) = (&begun["captain"]["ship"], &begun["others"][0]["ship"]);
    assert_eq!((coming[3].as_f64(), coming[7].as_f64()), (Some(5.0), Some(f64::from(SAILS_SET))), "{coming}");
    assert_eq!((resting[3].as_f64(), resting[7].as_f64()), (Some(0.0), Some(0.0)), "{resting}");
    let refused = answer(&fight_begin_json(
        br#"{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0], "seed": 4, "time": 1000, "captains": [
            { "x": 180400, "y": 360000, "heading": 4.7, "faction": 2, "rank": 2, "way": 99 } ] }"#,
    ));
    assert!(refused["error"].as_str().is_some(), "{refused}");
}

/// How far the ship sails in 10 s, sails set from the start, told `wind` (none for the world's) at the world's `world`.
fn sailed(wind: &str, world: f64) -> f64 {
    opened();
    let begun =
        answer(&fight_begin_json(br#"{ "ship": [180000, 360000, 0, 3, 0, 0, 3, 2], "seed": 7, "time": 1000 }"#));
    assert!(begun.get("error").is_none(), "{begun}");
    let mut time = 1000.0;
    let mut last = begun;
    for _ in 0..10 {
        let request = format!(
            r#"{{ "time": {time}, "ticks": 60, "world": {world}, "wind": {wind}, "helm": {{ "steer": 0, "crab": false, "climb": 0 }}, "aim": null, "fire": false, "brace": false, "load": null }}"#
        );
        last = answer(&fight_step_json(request.as_bytes()));
        assert!(last.get("error").is_none(), "{last}");
        time += 1.0;
    }
    let ship = |at: usize| last["player"]["ship"][at].as_f64().unwrap_or(f64::NAN);
    let (east, south) = (ship(0) - 180_000.0, ship(1) - 360_000.0);
    (east * east + south * south).sqrt()
}

#[test]
fn a_told_wind_is_the_wind_sailed_whatever_the_worlds() {
    let gale = sailed("[14, 6]", 0.0);
    assert!((sailed("[14, 6]", 5_000.0) - gale).abs() < 1e-9, "the world's wind plays no part");
    let air = sailed("[1, 0]", 0.0);
    assert!(gale > air * 2.0, "a gale drives it harder than a breath of air: {gale} against {air}");
    let worlds = [sailed("null", 0.0), sailed("null", 5_000.0)];
    assert!((worlds[0] - worlds[1]).abs() > 1e-6, "untold, it sails in the world's wind, which changes: {worlds:?}");
}

#[test]
fn a_told_wind_past_a_hurricane_or_not_two_numbers_is_refused() {
    for wind in ["[61, 0]", "[1]", r#"["east", 0]"#, "3"] {
        opened();
        let _ = begun(7);
        let request = format!(
            r#"{{ "time": 1000, "ticks": 1, "world": 0, "wind": {wind}, "helm": {{ "steer": 0, "crab": false, "climb": 0 }}, "aim": null, "fire": false, "brace": false, "load": null }}"#
        );
        let refused = answer(&fight_step_json(request.as_bytes()));
        assert!(refused["error"].as_str().is_some_and(|error| error.contains("told wind")), "{wind}: {refused}");
    }
}
