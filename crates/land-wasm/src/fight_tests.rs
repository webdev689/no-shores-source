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
        r#"{{ "time": {time}, "ticks": {ticks}, "helm": {{ "steer": {steer}, "crab": false, "climb": {climb} }}, "aim": {aim}, "fire": {fire}, "brace": {brace}, "load": {load} }}"#
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
    // Each leg's: the balls aloft at a leg's end are in it, and her captain's commission and strike share.
    assert_eq!(
        prints.join(" "),
        "2ccc2fc797da7cbe eae574b66b61049b dd9bdf721f315bcf 078f737c5ae0dd3b e5f57d8b5b8ace5e 05539b67502dea89 2147140665442c40 0e9a4dfe4da17d75 f9c5191fadbd711f"
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

/// The fight `FIGHT_LEGS` fights against a pirate captain of `rank`, in her rank's hull: each leg's fingerprint.
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
    [(2, 0, "f9c5191fadbd711f"), (3, 1, "a6a3918566c1aee2"), (4, 2, "d728a4c9a6ebc25f"), (5, 3, "ead19c39dfa3345b")];

#[test]
fn a_fight_against_each_hull_steps_to_its_pinned_fingerprint() {
    for (rank, hull, print) in HULL_FIGHTS {
        let prints = fought_with(rank);
        let begun = answer(&fight_begin_json(
            format!(r#"{{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0], "seed": 7, "time": 1000, "rank": {rank} }}"#)
                .as_bytes(),
        ));
        assert_eq!(begun["captain"]["hull_kind"], hull, "a captain of rank {rank} sails her rank's hull");
        assert_eq!(begun["player"]["hull_kind"], 0, "the player sails her Sloop");
        assert_eq!(prints.last().map(String::as_str), Some(print), "rank {rank}: {prints:?}");
    }
    let refused = |rank: &str| {
        let begin =
            format!(r#"{{ "ship": [180000, 360000, 0, 0, 0, 0, 0, 0], "seed": 7, "time": 1000, "rank": {rank} }}"#);
        answer(&fight_begin_json(begin.as_bytes())).get("error").is_some()
    };
    assert!(refused("0") && refused("6") && refused("2.5") && refused("\"boss\""));
}
