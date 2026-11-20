use crate::activity::Activity;
use crate::bounties::{board, bounty_pay};
use crate::objectives::{Feat, Objective};
use crate::quests::{Quest, Quests, quests};
use crate::story::Story;
use crate::{Character, Difficulty};
use std::collections::{BTreeMap, BTreeSet};

/// A Grey Tithe Minor felled on Saltmere.
const TITHE_FOE: Feat<'static> = Feat::Felled { faction: 1, rank: 1, island: Some("continent-1") };

#[test]
fn an_objective_counts_only_the_feats_it_names() {
    let tithe = Objective::Fell { faction: Some(1), rank: None, island: None };
    assert!(tithe.counts(&TITHE_FOE));
    assert!(!tithe.counts(&Feat::Felled { faction: 2, rank: 5, island: None }));
    let elite_here = Objective::Fell { faction: None, rank: Some(3), island: Some("continent-1".into()) };
    assert!(elite_here.counts(&Feat::Felled { faction: 1, rank: 4, island: Some("continent-1") }), "or higher");
    assert!(!elite_here.counts(&Feat::Felled { faction: 1, rank: 2, island: Some("continent-1") }));
    assert!(!elite_here.counts(&Feat::Felled { faction: 1, rank: 3, island: Some("continent-2") }));
    assert!(!elite_here.counts(&Feat::Felled { faction: 1, rank: 3, island: None }), "an island it cannot tell");
    assert!(Objective::Gather { resource: None }.counts(&Feat::Gathered { resource: 4 }));
    assert!(!Objective::Gather { resource: Some(0) }.counts(&Feat::Gathered { resource: 4 }));
    let fourth = Objective::Sink { water: Some("continent-4".into()), rank: None };
    assert!(fourth.counts(&Feat::Sunk { water: Some("continent-4"), rank: 1 }));
    assert!(!fourth.counts(&Feat::Sunk { water: None, rank: 5 }), "off every water");
    let hard = Objective::Clear { island: None, tier: Some(Difficulty::Elite) };
    assert!(hard.counts(&Feat::Cleared { island: Some("continent-3"), tier: Difficulty::Abyss }));
    assert!(!hard.counts(&Feat::Cleared { island: Some("continent-3"), tier: Difficulty::Normal }));
    assert!(!tithe.counts(&Feat::Gathered { resource: 1 }), "a feat of another kind");
}

#[test]
fn the_board_offers_six_bounties_a_day_two_each_on_land_at_sea_and_in_dungeons() {
    let words = |day| board(day).map(|bounty| bounty.words);
    assert_eq!(
        words(20_778),
        [
            "Defeat 30 Grey Tithe foes.",
            "Defeat 2 foes of Miniboss rank or higher.",
            "Sink or take 3 ships.",
            "Sink or take a ship of Elite rank or higher.",
            "Clear 2 dungeons.",
            "Clear 3 dungeons.",
        ]
    );
    assert_eq!(
        words(20_777),
        [
            "Gather 6 resource nodes.",
            "Defeat 2 foes of Miniboss rank or higher.",
            "Sink or take 3 ships.",
            "Sink or take a ship of Elite rank or higher.",
            "Clear a dungeon.",
            "Clear 3 dungeons.",
        ]
    );
    let mut seen = BTreeSet::new();
    for day in 20_000..22_000 {
        let on = board(day);
        for pair in on.chunks(2) {
            assert_ne!(pair[0], pair[1], "day {day}");
        }
        let on_land = |bounty: &crate::bounties::Bounty| {
            matches!(bounty.objective, Objective::Fell { .. } | Objective::Gather { .. })
        };
        assert!(on[..2].iter().all(on_land));
        assert!(on[2..4].iter().all(|bounty| matches!(bounty.objective, Objective::Sink { .. })));
        assert!(on[4..].iter().all(|bounty| matches!(bounty.objective, Objective::Clear { .. })));
        seen.extend(on.map(|bounty| bounty.words));
    }
    assert_eq!(seen.len(), 10, "every bounty comes up");
    assert_eq!([bounty_pay(1), bounty_pay(5), bounty_pay(30)], [(600, 36), (1_000, 60), (3_500, 210)]);
}

#[test]
fn a_held_bounty_counts_each_feat_it_names_up_to_its_target_on_its_own_day_alone() {
    let mut character = Character::starting();
    character.activity.today(20_778).bounties.extend([(0, 0), (2, 0)]);
    for _ in 0..31 {
        character.saw(&TITHE_FOE, 20_778);
    }
    assert_eq!(character.activity.today.bounties, BTreeMap::from([(0, 30), (2, 0)]), "no further than its target");
    assert!(!character.saw(&TITHE_FOE, 20_778), "nothing moves past it");
    let ship = Feat::Sunk { water: None, rank: 2 };
    assert!(character.saw(&ship, 20_778));
    assert!(!character.saw(&ship, 20_777), "a room whose day is behind: yesterday's place 2 would have counted it too");
    assert!(!character.saw(&ship, 20_779), "nor one past it: those bounties ended at the reset");
    assert_eq!(character.activity.today.bounties[&2], 1);
}

#[test]
fn a_side_quest_counts_until_its_target_and_pays_once_when_finished() {
    let quest = Quest {
        id: "a-test-of-the-tithe".into(),
        words: "Defeat 2 Grey Tithe foes on Saltmere.".into(),
        objective: Objective::Fell { faction: Some(1), rank: None, island: Some("continent-1".into()) },
        target: 2,
        xp: 500,
        aurem: 40,
    };
    let written = [quest.clone()];
    let mut character = Character::starting();
    assert!(character.take_quest(&quest));
    assert!(!character.take_quest(&quest), "held already");
    assert!(!character.finish_quest(&quest), "not done");
    for day in [20_778, 20_779, 20_780] {
        character.saw_with(&TITHE_FOE, day, &written);
    }
    assert_eq!(character.story.quests[&quest.id], 2, "kept across days, to its target");
    let (xp, aurem) = (character.xp, character.materials.aurem);
    assert!(character.finish_quest(&quest));
    assert_eq!((character.xp, character.materials.aurem), (xp + 500, aurem + 40));
    assert_eq!((character.story.quests.len(), character.story.finished.len()), (0, 1));
    assert!(!character.finish_quest(&quest) && !character.take_quest(&quest), "once");
    assert!(!character.saw_with(&TITHE_FOE, 20_781, &written));
}

#[test]
fn every_side_quest_written_reads_each_its_own_id_and_a_target_to_reach() {
    let read: Quests = serde_json::from_str(
        r#"{ "quests": [{ "id": "x", "words": "Clear a dungeon on Saltmere.",
        "objective": { "clear": { "island": "continent-1" } }, "target": 1, "xp": 100, "aurem": 10 }] }"#,
    )
    .expect("a quest as the missions write one");
    assert_eq!(read.quests[0].objective, Objective::Clear { island: Some("continent-1".into()), tier: None });
    let ids: BTreeSet<&str> = quests().quests.iter().map(|quest| quest.id.as_str()).collect();
    assert_eq!(ids.len(), quests().quests.len());
    assert!(quests().quests.iter().all(|quest| quest.target > 0));
}

#[test]
fn a_kept_record_reads_without_the_new_keys_keeps_a_later_builds_and_drops_what_the_board_cannot_hold() {
    let old = r#"{ "today": { "day": 20778, "cleared": [], "bounties": { "2": 3 } }, "this_week": { "week": 2968 } }"#;
    let activity: Activity = serde_json::from_str(old).expect("kept before this");
    assert!(activity.today.turned_in.is_empty());
    assert_eq!(activity.today.bounties, BTreeMap::from([(2, 3)]));
    let later: Story = serde_json::from_str(r#"{ "prologue": true, "missions": [1] }"#).expect("a later build's story");
    assert_eq!(
        serde_json::to_value(&later).expect("written"),
        serde_json::json!({ "prologue": true, "missions": [1] })
    );
    let mut character = Character::starting();
    character.activity.today(20_778).turned_in.extend([2, 9]);
    character.activity.today.bounties.insert(2, 3);
    character.activity.today.unknown.insert("streak".into(), serde_json::json!(4));
    character.story.quests.insert("no-longer-written".into(), 4);
    let mut read = Character::from_json(&character.to_json()).expect("a character");
    assert_eq!(read.activity.today.turned_in, BTreeSet::from([2]));
    assert_eq!(read.activity.today.bounties, BTreeMap::from([(2, 3)]), "read through the kept keys");
    assert_eq!(read.activity.today.unknown["streak"], 4, "a later build's key kept");
    assert!(!read.saw(&TITHE_FOE, 20_778), "a quest the content no longer has counts nothing");
    assert_eq!(read.story.quests["no-longer-written"], 4);
    assert_eq!(
        serde_json::to_value(&Character::starting().story).expect("written"),
        serde_json::json!({ "prologue": false })
    );
    assert_eq!(Story::kept_before(), Story { prologue: true, ..Story::default() });
}
