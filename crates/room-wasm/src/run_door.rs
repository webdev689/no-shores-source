//! A dungeon's run for its host, and what is on for a page. A run's room opens from a JSON ask naming its dungeon (a
//! patrol's by its number, an Elite Dungeon by its place, or a sea island's by its seed, style and continent), its
//! tier and the minute it opens (`room::RunOf`, `Room::dungeon_run`). What is on is `gear::activities`' draws at a
//! minute, as JSON.

use crate::{Opened, hand_over, keep};
use gear::Difficulty;
use gear::activities::{Modifier, Weekly, dungeon_of_the_day, modifier_of_the_day, of_the_week, week_modifiers};
use gear::clock::{day_of, minutes_to_next_day, minutes_to_next_week, week_of};
use gear::gate::{Place, shut_at};
use gear::world::ISLANDS;
use room::{REVIVES, Room, RunOf};
use serde::Deserialize;
use serde_json::{Value, json};

/// Which dungeon a run's ask names, tried in this order.
#[derive(Deserialize)]
#[serde(untagged)]
enum DungeonAsked {
    Patrol { patrol: String, number: usize },
    Place { place: String },
    Seed { seed: u32, style: String, continent: String },
}

/// A run's ask: its dungeon, its tier (0 Normal, 1 Elite, 2 Abyss) and the Unix minute it opens.
#[derive(Deserialize)]
struct RunAsked {
    dungeon: DungeonAsked,
    tier: usize,
    minute: u64,
}

/// Opens a run's room from its ask; answers whether the ask read and a rule lays its dungeon at its tier.
pub fn open_run(text: &[u8]) -> bool {
    let Ok(asked) = serde_json::from_slice::<RunAsked>(text) else { return false };
    let Some(&tier) = Difficulty::ALL.get(asked.tier) else { return false };
    let of = match asked.dungeon {
        DungeonAsked::Patrol { patrol, number } => RunOf::Patrol { patrol, number },
        DungeonAsked::Place { place } => RunOf::Elite { place },
        DungeonAsked::Seed { seed, style, continent } => RunOf::Sea { seed, style, continent },
    };
    let Some(room) = Room::dungeon_run(&of, tier, asked.minute) else { return false };
    keep(Opened::Land { room: Box::new(room), node: None });
    true
}

/// Opens a run's room from its ask written at `address`, `length` bytes long; 1 if it opened, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_open_run(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(open_run(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// The week's Elite or Abyss Dungeon, its modifiers' keys, the level its foes stand at and the level that opens it.
fn of_week(week: u64, weekly: Weekly) -> Value {
    let modifiers: Vec<String> = week_modifiers(week, weekly).into_iter().map(Modifier::key).collect();
    let place = of_the_week(week, weekly).id;
    json!({ "place": place, "modifiers": modifiers, "level": weekly.foes_at(), "opens": weekly.opens_at() })
}

/// What is on at a Unix minute, as JSON: the day's and the week's numbers, the minutes to the next of each, each
/// island's dungeon of the day, the day's modifier, the week's two with their modifiers and levels, each island's
/// band at each tier as its foes are raised, the revives an Abyss run's company shares, and the name and words of
/// each modifier on.
#[must_use]
pub fn activities_json(minute: u64) -> String {
    let (day, week) = (day_of(minute), week_of(minute));
    let bands: serde_json::Map<String, Value> = ISLANDS
        .iter()
        .map(|&(continent, low, high)| {
            let tiers = Difficulty::ALL.map(|tier| [tier.raise(low), tier.raise(high)]);
            (continent.to_owned(), json!(tiers))
        })
        .collect();
    let on = std::iter::once(modifier_of_the_day(day))
        .chain(week_modifiers(week, Weekly::Elite))
        .chain(week_modifiers(week, Weekly::Abyss));
    let modifiers: serde_json::Map<String, Value> =
        on.map(|modifier| (modifier.key(), json!({ "name": modifier.name(), "words": modifier.words() }))).collect();
    let of_the_day: Vec<Value> = gear::activities::ISLAND_PLACES
        .iter()
        .filter_map(|island| {
            let (patrol, number) = dungeon_of_the_day(day, island.continent)?;
            Some(json!({ "continent": island.continent, "patrol": patrol, "number": number }))
        })
        .collect();
    json!({
        "day": day,
        "week": week,
        "untilDay": minutes_to_next_day(minute),
        "untilWeek": minutes_to_next_week(minute),
        "ofTheDay": of_the_day,
        "dayModifier": modifier_of_the_day(day).key(),
        "weekElite": of_week(week, Weekly::Elite),
        "weekAbyss": of_week(week, Weekly::Abyss),
        "bands": bands,
        "revives": REVIVES,
        "modifiers": modifiers,
    })
    .to_string()
}

/// What is on at a Unix minute, as JSON (`activities_json`).
#[unsafe(no_mangle)]
pub extern "C" fn room_activities(minute: u32) -> u64 {
    hand_over(activities_json(u64::from(minute)).into_bytes())
}

/// What the gates shut to a character of `level`, past the prologue or not, each the reason or null where it is
/// open: the dungeon of the day at each tier, an Elite Dungeon at Normal, the week's two at their tiers, and the seas
/// at each tier, which ask the level alone.
#[must_use]
pub fn gates_json(level: u8, prologue: bool) -> String {
    let reason = |place, tier| shut_at(level, prologue, place, tier).map(|shut| shut.reason());
    json!({
        "day": Difficulty::ALL.map(|tier| reason(Place::PatrolDungeon, tier)),
        "eliteDungeon": reason(Place::EliteDungeon, Difficulty::Normal),
        "weekElite": reason(Place::Week(Weekly::Elite), Difficulty::Elite),
        "weekAbyss": reason(Place::Week(Weekly::Abyss), Difficulty::Abyss),
        "seas": Difficulty::ALL.map(|tier| reason(Place::Node, tier)),
    })
    .to_string()
}

/// What the gates shut to a character of `level`, past the prologue if `prologue` is not 0, as JSON (`gates_json`).
#[unsafe(no_mangle)]
pub extern "C" fn room_gates(level: u32, prologue: u32) -> u64 {
    hand_over(gates_json(u8::try_from(level).unwrap_or(u8::MAX), prologue != 0).into_bytes())
}

#[cfg(test)]
mod tests {
    use super::{activities_json, gates_json, open_run};
    use serde_json::{Value, json};

    fn ask(dungeon: Value, tier: u8) -> String {
        json!({ "dungeon": dungeon, "tier": tier, "minute": 29_919_420_u64 }).to_string()
    }

    /// The revives the open room's snapshot carries after a tick.
    fn revives() -> i8 {
        crate::room_tick();
        let bytes = crate::snapshot();
        protocol::wire::overlook::wire::root_as_from_room(&bytes)
            .expect("read")
            .snapshot()
            .expect("a snapshot")
            .revives()
    }

    #[test]
    fn a_run_opens_from_its_ask_at_its_tier_with_its_revives_and_refuses_what_no_rule_lays() {
        assert!(open_run(ask(json!({ "place": "saltworm-warrens" }), 2).as_bytes()));
        assert_ne!(crate::room_join(), 0);
        assert_eq!(revives(), 5);
        assert!(open_run(ask(json!({ "patrol": "gullwing-vale", "number": 0 }), 1).as_bytes()));
        assert_eq!(revives(), -1, "an Elite run counts none");
        assert!(open_run(ask(json!({ "seed": 4_242, "style": "caverns", "continent": "continent-4" }), 0).as_bytes()));
        assert!(!open_run(ask(json!({ "place": "krakens-grotto" }), 2).as_bytes()), "not this week's Abyss");
        let no_band = json!({ "seed": 4_242, "style": "caverns", "continent": "continent-0" });
        assert!(!open_run(ask(no_band, 0).as_bytes()));
        assert!(!open_run(ask(json!({ "place": "krakens-grotto" }), 3).as_bytes()), "no fourth tier");
        assert!(!open_run(b"not an ask"));
    }

    #[test]
    fn what_is_on_reads_as_the_rules_draw_it() {
        let on: Value = serde_json::from_str(&activities_json(29_919_420)).expect("JSON");
        assert_eq!([&on["day"], &on["week"], &on["untilDay"], &on["untilWeek"]], [20_778, 2_968, 1_440, 5_760]);
        assert_eq!(on["ofTheDay"].as_array().map(Vec::len), Some(9));
        assert_eq!(on["ofTheDay"][0], json!({ "continent": "continent-1", "patrol": "gullwing-vale", "number": 0 }));
        assert_eq!(on["dayModifier"], "burn-shadow");
        let elite = json!({ "place": "forsaken-cistern", "modifiers": ["brawler"], "level": 26, "opens": 24 });
        assert_eq!(on["weekElite"], elite);
        let modifiers = ["lightswitch", "burn-divine", "juggler"];
        let abyss = json!({ "place": "saltworm-warrens", "modifiers": modifiers, "level": 30, "opens": 28 });
        assert_eq!(on["weekAbyss"], abyss);
    }

    #[test]
    fn what_is_on_says_each_islands_levels_at_each_tier_the_weeks_levels_the_revives_and_each_modifiers_words() {
        let drawn: Value = serde_json::from_str(&activities_json(29_919_420)).expect("JSON");
        assert_eq!(drawn["bands"]["continent-1"], json!([[1, 4], [3, 6], [4, 7]]));
        assert_eq!(drawn["bands"]["continent-9"], json!([[26, 30], [28, 32], [29, 32]]), "never past 32");
        assert_eq!(drawn["bands"].as_object().map(serde_json::Map::len), Some(9));
        assert_eq!([&drawn["weekElite"]["level"], &drawn["weekElite"]["opens"]], [&json!(26), &json!(24)]);
        assert_eq!([&drawn["weekAbyss"]["level"], &drawn["weekAbyss"]["opens"]], [&json!(30), &json!(28)]);
        assert_eq!(drawn["revives"], json!(5));
        let burn = "Shadow spells deal double damage. Wearing Shadow, you take double.";
        assert_eq!(drawn["modifiers"]["burn-shadow"], json!({ "name": "Burn (Shadow)", "words": burn }));
        let keys: std::collections::BTreeSet<&str> =
            drawn["modifiers"].as_object().expect("an object").keys().map(String::as_str).collect();
        assert_eq!(keys, ["brawler", "burn-divine", "burn-shadow", "juggler", "lightswitch"].into_iter().collect());
    }

    #[test]
    fn the_gates_say_why_each_place_is_shut_to_a_level_and_its_story() {
        let gates = |level, prologue| serde_json::from_str::<Value>(&gates_json(level, prologue)).expect("JSON");
        let young = gates(9, true);
        assert_eq!(young["day"], json!([null, "Elite seas open at level 10.", "Abyss seas open at level 20."]));
        assert_eq!(young["seas"], young["day"]);
        assert_eq!(
            [&young["eliteDungeon"], &young["weekElite"], &young["weekAbyss"]],
            [&json!(null), &json!("This dungeon opens at level 24."), &json!("This dungeon opens at level 28.")]
        );
        let before = gates(30, false);
        let prologue = "This place opens after the prologue.";
        assert_eq!(before["day"], json!([prologue, prologue, prologue]));
        assert_eq!(before["eliteDungeon"], json!(prologue));
        assert_eq!(before["seas"], json!([null, null, null]), "the seas ask the level alone");
        assert_eq!([&gates(24, true)["weekElite"], &gates(28, true)["weekAbyss"]], [&json!(null), &json!(null)]);
    }
}
