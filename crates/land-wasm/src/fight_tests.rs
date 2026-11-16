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
    assert_eq!(begun["player"]["max_hull"], 240.0);
    assert_eq!(begun["over"], Value::Null);
}

#[test]
fn a_step_answers_the_lay_its_look_holds_and_the_refusals_of_its_fire() {
    begun(7);
    let looked = answer(&fight_step_json(step_request([0.0, 0.0, 90.0, 80.0, 1.0, 0.0, 0.0, 1.0], 1000.0).as_bytes()));
    assert_eq!(looked["lay"]["side"], "starboard");
    assert_eq!(looked["lay"]["launches"].as_array().map(Vec::len), Some(3));
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
    // Each leg's: the balls aloft at a leg's end are in it.
    assert_eq!(
        prints.join(" "),
        "a5c0d39eeb17893c 74506578b683e8a2 aeaf36b6ca60c8cc 9aff61ffcc9e671a 8cb013d3ab3702b7 7b58f4772709c29e 5615a0179dc1b60e 53b0562d4c9edb37 567b4bddda81f749"
    );
}
