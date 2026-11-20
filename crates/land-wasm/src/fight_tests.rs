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
    // Each leg's: the balls aloft at a leg's end are in it, and her captain's commission and strike share.
    assert_eq!(
        prints.join(" "),
        "d2fc521c1ce4f11a 4af906e5d52e9ad0 6452a0f544ca209f 993a0119722494ee 449a9a9543770d74 017389218c22b1b6 4e8c1f2fce5c4823 691d0a7dacdb1507 0c50c8eef94dfc05"
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
fn a_captain_going_down_shows_how_she_will_lie_once_sunk_and_how_soon() {
    let at = |x: f64| Ship { x, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let major = Commission::of(2, Rank::Major).unwrap_or_else(|| panic!("pirates sail Majors"));
    let mut fight =
        Fight::ambush(at(0.0), &[(at(500.0), major, 1)], 3, &Deep, 0.0).unwrap_or_else(|error| panic!("{error}"));
    assert!(view(&fight, &[], None, &Deep, 0.0)["captain"].get("sunk_founder").is_none(), "afloat, she is not going");
    let damage = &mut fight.ships.get_mut(&CAPTAIN).unwrap_or_else(|| panic!("the captain")).damage;
    (damage.state, damage.sink_t) = (State::Sinking, 5.0);
    let shown = view(&fight, &[], None, &Deep, 0.0);
    let triple = |name: &str| -> Vec<f64> {
        shown["captain"][name].as_array().map(|all| all.iter().filter_map(Value::as_f64).collect()).unwrap_or_default()
    };
    let (now, sunk) = (triple("founder"), triple("sunk_founder"));
    assert_eq!(sunk.len(), 3, "{shown}");
    assert!(sunk[0] > now[0] && sunk[1].abs() > now[1].abs(), "deeper and trimmed further: {now:?} {sunk:?}");
    assert_eq!(sunk[2].signum(), now[2].signum(), "listing the side she lists to now");
    assert_eq!(shown["captain"]["sinks_in"], SINK_SECONDS - 5.0);
}

#[test]
fn a_captain_given_her_way_comes_on_under_sail_and_one_without_lies_at_rest() {
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
