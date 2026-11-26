//! Every activity's hour kept in the band against a patrol zone's at the same level, and the table printed by hand:
//! `cargo test -p gear --release measure_the_band -- --ignored --nocapture`.

use crate::activities::Weekly;
use crate::band::{
    Hour, LEVELS, LOOT_BAND, PAY_BAND, deepest, depths, passage, patrol, patrol_dungeon, playlist, sea, week_dungeon,
};
use crate::playlist::Playlist;

/// Every activity open at `level` but the patrol zone, by name, its hour.
fn activities(level: u8) -> Vec<(String, Hour)> {
    let mut all = vec![("Patrol dungeon".to_owned(), patrol_dungeon(level)), ("Sea".to_owned(), sea(level))];
    for which in Playlist::ALL {
        all.extend(playlist(which, level).map(|hour| (which.name().to_owned(), hour)));
    }
    for (which, name) in [(Weekly::Elite, "Elite Dungeon of the week"), (Weekly::Abyss, "Abyss Dungeon of the week")] {
        all.extend(week_dungeon(which, level).map(|hour| (name.to_owned(), hour)));
    }
    for depth in depths(level) {
        all.extend(passage(depth, level).map(|hour| (format!("Passages, depth {depth}"), hour)));
    }
    all
}

/// XP, Aurem and loot against the patrol zone's.
fn against(hour: &Hour, floor: &Hour) -> [f64; 3] {
    [hour.xp / floor.xp, hour.aurem / floor.aurem, hour.loot() / floor.loot()]
}

#[test]
fn every_activitys_hour_falls_in_the_band_against_a_patrol_zones_at_its_level() {
    let mut outside = Vec::new();
    for level in LEVELS {
        let floor = patrol(level);
        for (name, hour) in activities(level) {
            let shares = against(&hour, &floor);
            let within = |share: f64, (least, most): (f64, f64)| (least..=most).contains(&share);
            if !(within(shares[0], PAY_BAND) && within(shares[1], PAY_BAND) && within(shares[2], LOOT_BAND)) {
                outside.push(format!(
                    "level {level}, {name}: XP {:.2}, Aurem {:.2}, loot {:.2}",
                    shares[0], shares[1], shares[2]
                ));
            }
        }
    }
    assert!(outside.is_empty(), "outside the band {PAY_BAND:?}, {LOOT_BAND:?}:\n{}", outside.join("\n"));
}

#[test]
fn the_passages_are_never_the_bands_top_at_every_level() {
    // The passages never drop the most loot at any level, and at some level another activity pays more XP than their
    // best depth, so they are never the go-to.
    let mut topped = 0;
    for level in LEVELS {
        let all = activities(level);
        let best = |passages: bool, pick: fn(&Hour) -> f64| {
            let picked = all.iter().filter(|(name, _)| name.starts_with("Passages") == passages);
            picked.map(|(_, hour)| pick(hour)).fold(if passages { 0.0 } else { pick(&patrol(level)) }, f64::max)
        };
        assert!(best(true, Hour::loot) < best(false, Hour::loot), "level {level}: the passages drop the most loot");
        topped += usize::from(best(true, |hour| hour.xp) > best(false, |hour| hour.xp));
    }
    assert!(topped < LEVELS.len(), "the passages pay the most XP at every level");
}

#[test]
fn a_player_reaches_deeper_as_they_rise_and_the_whole_web_at_thirty() {
    assert!(deepest(5) >= 5, "a level 5 player reaches the first lamp");
    assert!(LEVELS.windows(2).all(|pair| deepest(pair[0]) <= deepest(pair[1])));
    assert_eq!(deepest(30), 20);
}

/// The table, for the balance's record and `Activities`'s "The band".
#[test]
#[ignore = "a measurement, printed by hand in release"]
fn measure_the_band() {
    eprintln!(
        "| Level | Activity | XP | Aurem | Vestiges N/M/R/L/A | Items N/M/R/L/A | Materials | Essence | Against the patrol |"
    );
    for level in LEVELS {
        let floor = patrol(level);
        let mut rows = vec![("Patrol zone".to_owned(), floor)];
        rows.extend(activities(level));
        for (name, hour) in rows {
            let colours = |counts: [f64; 5]| counts.map(|count| format!("{count:.2}")).join("/");
            let [xp, aurem, loot] = against(&hour, &floor);
            eprintln!(
                "| {level} | {name} | {:.0} | {:.0} | {} | {} | {:.0} | {:.1} | {xp:.2}, {aurem:.2}, {loot:.2} |",
                hour.xp,
                hour.aurem,
                colours(hour.vestiges),
                colours(hour.items),
                hour.materials,
                hour.essence
            );
        }
    }
}
