//! The ships gone down at sea, sunk or taken, as the bounties and quests count them. No one holds a character at sea,
//! so the room keeps each ship that went down in its tick for the host, which claims each fighter's kept character
//! from the accounts, counts the ship by the rules (`count_kept`) and lets it go at once.

use super::hand_over;
use gear::objectives::Feat;
use room::sea::Sea;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;

/// A hostile ship gone down at sea, sunk or taken, as the bounties and quests count her: the water she went down in,
/// by its continent's id (none off every water), her rank, and the accounts of the players who fought her.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SeaDown {
    pub water: Option<&'static str>,
    pub rank: u8,
    pub players: Vec<String>,
}

/// The adapter: a ship down from the sea's word, its water a layout index as the sea numbers waters.
#[must_use]
pub fn ship_down(water: Option<usize>, rank: u8, players: Vec<String>) -> SeaDown {
    let water = water.and_then(|index| gear::world::ISLANDS.get(index)).map(|(id, ..)| *id);
    SeaDown { water, rank, players }
}

/// The most kept for a host that never reads them (a browser at sea alone).
const DOWNS_KEPT: usize = 64;

thread_local! {
    static DOWNS: RefCell<Vec<SeaDown>> = const { RefCell::new(Vec::new()) };
}

/// Ticks the sea and keeps the ships that went down in it, for the host to count.
pub(crate) fn tick(sea: &mut Sea) {
    sea.tick();
    // No ship goes down on the sea's word on this stack: once it keeps them, this line reads `Sea::take_ship_downs`.
    let downs: Vec<SeaDown> = Vec::new();
    DOWNS.with(|kept| {
        let mut kept = kept.borrow_mut();
        let room = DOWNS_KEPT.saturating_sub(kept.len());
        kept.extend(downs.into_iter().take(room));
    });
}

/// The ships kept since the host last asked, as JSON, and forgotten: `[{"water","rank","players"}]`.
#[must_use]
pub fn ship_downs_json() -> String {
    let taken = DOWNS.with(|kept| std::mem::take(&mut *kept.borrow_mut()));
    serde_json::to_string(&taken).unwrap_or_else(|_| "[]".to_owned())
}

/// The ships kept since the host last asked, as `ship_downs_json`'s bytes, packed as `hand_over` packs.
#[unsafe(no_mangle)]
pub extern "C" fn room_ship_downs() -> u64 {
    hand_over(ship_downs_json().into_bytes())
}

/// A ship down to count toward a kept character, as the host asks it.
#[derive(Deserialize)]
struct CountAsk {
    kept: Option<String>,
    water: Option<String>,
    rank: u8,
    minute: u64,
}

/// A kept character with a ship down counted toward its bounties and quests, from
/// `{"kept": <character JSON or null>, "water", "rank", "minute"}`: its JSON again, or empty when nothing moved, there
/// is no character, or the ask does not read.
#[must_use]
pub fn count_kept(text: &[u8]) -> String {
    let Ok(ask) = serde_json::from_slice::<CountAsk>(text) else { return String::new() };
    let Some(mut character) = ask.kept.as_deref().and_then(gear::Character::from_json) else { return String::new() };
    let sunk = Feat::Sunk { water: ask.water.as_deref(), rank: ask.rank };
    if character.saw(&sunk, gear::clock::day_of(ask.minute)) { character.to_json() } else { String::new() }
}

/// A kept character written at `address` with a ship down counted (`count_kept`), packed as `hand_over` packs.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_count_kept(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    hand_over(count_kept(unsafe { std::slice::from_raw_parts(address, length) }).into_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_seas_waters_are_numbered_as_the_islands_are() {
        let layout: serde_json::Value =
            serde_json::from_str(include_str!("../../../content/world/layout.json")).expect("the layout");
        let waters: Vec<&str> = layout["continents"]
            .as_array()
            .expect("continents")
            .iter()
            .map(|each| each["id"].as_str().expect("an id"))
            .collect();
        assert_eq!(waters, gear::world::ISLANDS.map(|(id, ..)| id), "a layout index names the same island");
        assert_eq!(ship_down(Some(3), 3, vec!["ada".into()]).water, Some("continent-4"));
        assert_eq!((ship_down(Some(9), 1, vec![]).water, ship_down(None, 1, vec![]).water), (None, None));
        assert_eq!(
            serde_json::to_value([ship_down(Some(0), 2, vec!["ada".into()])]).expect("written"),
            serde_json::json!([{ "water": "continent-1", "rank": 2, "players": ["ada"] }])
        );
    }

    #[test]
    fn a_kept_character_at_sea_counts_a_ship_down_toward_its_bounty_and_says_when_nothing_moved() {
        let mut character = gear::Character::starting();
        character.activity.today(20_778).bounties.extend([(2, 0), (3, 0)]);
        let ask = |kept: serde_json::Value, rank: u8| {
            let minute = 29_919_420_u64;
            serde_json::json!({ "kept": kept, "water": "continent-4", "rank": rank, "minute": minute }).to_string()
        };
        let counted = count_kept(ask(character.to_json().into(), 1).as_bytes());
        let read = gear::Character::from_json(&counted).expect("a character");
        assert_eq!(read.activity.today.bounties, std::collections::BTreeMap::from([(2, 1), (3, 0)]), "a Minor");
        let mut idle = gear::Character::starting();
        idle.story.prologue = true;
        assert_eq!(count_kept(ask(idle.to_json().into(), 5).as_bytes()), "", "nothing held: nothing moved");
        assert_eq!(count_kept(ask(serde_json::Value::Null, 5).as_bytes()), "", "a character never kept");
        assert_eq!(count_kept(b"not an ask"), "");
    }

    #[test]
    fn a_tick_at_sea_keeps_no_ship_down_until_the_sea_tells_them() {
        let layout = world::layout::parse(include_str!("../../../content/world/layout.json")).expect("the layout");
        let mut sea = Sea::new(&layout, crate::deck_door::sloop_deck().clone(), 1);
        tick(&mut sea);
        assert_eq!(ship_downs_json(), "[]");
    }
}
