//! A dungeon's run for its host, and what is on for a page. A run's room opens from a JSON ask naming its dungeon (a
//! patrol's by its number, an Elite Dungeon by its place, or a sea island's by its seed, style and continent), its
//! tier and the minute it opens (`room::RunOf`, `Room::dungeon_run`). What is on is `gear::activities`' draws at a
//! minute, as JSON.

use crate::{Opened, hand_over, keep};
use gear::Difficulty;
use gear::activities::{Modifier, Weekly, dungeon_of_the_day, modifier_of_the_day, of_the_week, week_modifiers};
use gear::clock::{day_of, minutes_to_next_day, minutes_to_next_week, week_of};
use room::{Room, RunOf};
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

/// The week's Elite or Abyss Dungeon and its modifiers' keys.
fn of_week(week: u64, weekly: Weekly) -> Value {
    let modifiers: Vec<String> = week_modifiers(week, weekly).into_iter().map(Modifier::key).collect();
    json!({ "place": of_the_week(week, weekly).id, "modifiers": modifiers })
}

/// What is on at a Unix minute, as JSON: the day's and the week's numbers, the minutes to the next of each, each
/// island's dungeon of the day, the day's modifier, and the week's two with their modifiers.
#[must_use]
pub fn activities_json(minute: u64) -> String {
    let (day, week) = (day_of(minute), week_of(minute));
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
    })
    .to_string()
}

/// What is on at a Unix minute, as JSON (`activities_json`).
#[unsafe(no_mangle)]
pub extern "C" fn room_activities(minute: u32) -> u64 {
    hand_over(activities_json(u64::from(minute)).into_bytes())
}

#[cfg(test)]
mod tests {
    use super::{activities_json, open_run};
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
        assert_eq!(on["weekElite"], json!({ "place": "forsaken-cistern", "modifiers": ["brawler"] }));
        let abyss = json!({ "place": "saltworm-warrens", "modifiers": ["lightswitch", "burn-divine", "juggler"] });
        assert_eq!(on["weekAbyss"], abyss);
    }
}
