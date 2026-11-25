//! The houses' roads in the rules: every goal's kind met by its event alone; the opening walked to a pledge; a road
//! walked to its end with each reward given as its task is done; the Arts earned and the locks they open; fragment
//! choices, and their price once none is left to own; and the log kept between sessions, by id and read leniently.

use crate::arts::{ALL_EARNED, ArtAsk, ArtRefusal, EARNED_ART, EARNED_TENET_ONE, EARNED_TENET_TWO, WornArts};
use crate::asks::{Ask, Here, Refusal};
use crate::character::Character;
use crate::dice::Dice;
use crate::quests::{Event, Goal, GoalDef, GoalKind, Kill, Place, keeper_key, quests};
use crate::rewards::Clear;

const AT_COUNTER: Here = Here { social: true, day: 0, pledge: 0, rank: 0, week: 0 };
const AFIELD: Here = Here { social: false, day: 0, pledge: 0, rank: 0, week: 0 };
const DICE: Dice = Dice { seed: 3, tick: 1, player: 1 };

/// A goal from JSON.
fn goal(text: &str) -> GoalDef {
    serde_json::from_str(text).expect("a goal")
}

/// The first quest a house walks (the opening's, house 0), by its place in the file.
fn road_of(faction: u8) -> usize {
    let found = quests().quests.iter().position(|quest| quest.faction == faction && quest.after.is_empty());
    found.expect("every house has a quest")
}

/// The task a character kept before a house's first quest held any place in it reads at, by its place.
fn kept_task(faction: u8) -> usize {
    let quest = &quests().quests[road_of(faction)];
    let kept = quest.kept.as_ref().and_then(|kept| quest.tasks.iter().position(|task| task.id == *kept));
    kept.unwrap_or(0)
}

/// An event that meets a goal, its places at the world's middle.
fn meeting<'told>(goal: &'told GoalDef, places: &'told [Place]) -> Event<'told> {
    let stepped = |kind| Event::Stepped {
        kind,
        node: goal.goal.node().unwrap_or_default(),
        anchor: goal.goal.anchor().unwrap_or_default(),
    };
    match &goal.goal {
        Goal::Talk(talk) => Event::Talk(&talk.to),
        Goal::Pledge(_) => Event::Pledge,
        Goal::Reach(reach) => Event::Reach { node: &reach.node, place: &reach.place },
        Goal::Kill(slay) => Event::Kill(Kill {
            node: slay.node.as_deref(),
            at: [0.0, 0.0],
            places,
            foe: slay.types.first().map_or("Collector", String::as_str),
            rank: 5,
            island: slay.island.as_deref(),
        }),
        Goal::Gather(_) => Event::Gather,
        Goal::Cast(cast) => Event::Cast(&cast.spell),
        Goal::Sea(sea) => Event::Sea { side: &sea.side, how: sea.how.as_deref().unwrap_or("sink") },
        Goal::Land(land) => Event::Land(&land.island),
        Goal::Scavenge(_) => Event::Scavenge,
        Goal::Enter(enter) => Event::Enter(&enter.node),
        Goal::Escort(_) => stepped(GoalKind::Escort),
        Goal::Tail(_) => stepped(GoalKind::Tail),
        Goal::Defend(_) => stepped(GoalKind::Defend),
        Goal::Puzzle(_) => stepped(GoalKind::Puzzle),
        Goal::Unseen(_) => stepped(GoalKind::Unseen),
        Goal::Race(_) => stepped(GoalKind::Race),
        Goal::Buy(buy) => Event::Bought(buy.slot),
        Goal::Wear(wear) => Event::Worn(wear.slot),
    }
}

/// Every place a quest's goals name, at the world's middle, as a node's file has it.
fn every_place() -> Vec<Place> {
    let named = quests().quests.iter().flat_map(|quest| &quest.tasks).flat_map(|task| &task.goals);
    let places = named.filter_map(|goal| goal.goal.place().map(str::to_owned));
    places.map(|name| Place { name, at: [0.0, 0.0], radius: 10.0 }).collect()
}

/// Meets every goal of the task the player is on, each until its count.
fn meet_task(character: &mut Character, places: &[Place]) {
    let now = character.quest_now().expect("a task to meet");
    for (at, goal) in quests().quests[now.0].tasks[now.1].goals.iter().enumerate() {
        while character.quest_now() == Some(now) && character.quest_counts()[at] < goal.count {
            if goal.kind() == GoalKind::Pledge {
                character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).unwrap();
            } else {
                assert!(character.tell(&meeting(goal, places)), "{} counts", goal.text);
            }
        }
    }
}

#[test]
fn each_kind_of_goal_is_met_by_its_own_event_alone() {
    let places = [Place { name: "p".to_owned(), at: [0.0, 0.0], radius: 10.0 }];
    let goals = [
        r#"{ "kind": "talk", "to": "mage", "text": "t" }"#,
        r#"{ "kind": "pledge", "text": "t" }"#,
        r#"{ "kind": "reach", "node": "n", "place": "p", "text": "t" }"#,
        r#"{ "kind": "kill", "node": "n", "text": "t" }"#,
        r#"{ "kind": "gather", "text": "t" }"#,
        r#"{ "kind": "cast", "spell": "Tempest", "text": "t" }"#,
        r#"{ "kind": "sea", "side": "tithe", "text": "t" }"#,
        r#"{ "kind": "land", "island": "isle", "text": "t" }"#,
        r#"{ "kind": "scavenge", "text": "t" }"#,
        r#"{ "kind": "enter", "node": "n", "text": "t" }"#,
        r#"{ "kind": "escort", "node": "n", "from": "a", "to": "p", "who": "tobin", "near": 15, "text": "t" }"#,
        r#"{ "kind": "tail", "node": "n", "from": "a", "to": "p", "foe": "Runner", "far": 10, "near": 40, "text": "t" }"#,
        r#"{ "kind": "defend", "node": "n", "place": "p", "ward": "w", "waves": [[["Runner", "Minor"]]], "text": "t" }"#,
        r#"{ "kind": "puzzle", "node": "n", "place": "p", "points": [{ "name": "a", "bearing": 0, "at": 5 }], "text": "t" }"#,
        r#"{ "kind": "unseen", "node": "n", "place": "p", "text": "t" }"#,
        r#"{ "kind": "race", "node": "n", "checkpoints": ["a", "p"], "seconds": 60, "text": "t" }"#,
        r#"{ "kind": "buy", "slot": "melee", "text": "t" }"#,
        r#"{ "kind": "wear", "slot": "melee", "text": "t" }"#,
    ]
    .map(goal);
    for (at, one) in goals.iter().enumerate() {
        for (other, against) in goals.iter().enumerate() {
            assert_eq!(one.met_by(&meeting(against, &places)), at == other, "{:?} by {:?}", one.goal, against.goal);
        }
    }
    let race = &goals[15];
    let stepped = |kind, node, anchor| Event::Stepped { kind, node, anchor };
    assert!(race.met_by(&stepped(GoalKind::Race, "n", "p")), "a race at its last checkpoint");
    assert!(!race.met_by(&stepped(GoalKind::Race, "n", "a")) && !race.met_by(&stepped(GoalKind::Race, "m", "p")));
}

/// A foe's fall at the world's middle, with no places.
fn kill<'told>(foe: &'told str, rank: u8, node: Option<&'told str>) -> Kill<'told> {
    Kill { node, at: [0.0, 0.0], places: &[], foe, rank, island: None }
}

#[test]
fn a_kill_counts_within_its_place_and_forty_metres_past_of_its_type_rank_node_and_island() {
    let tomb = goal(r#"{ "kind": "kill", "node": "pearl-tomb", "types": ["Reeve"], "rank": "Miniboss", "text": "t" }"#);
    assert!(tomb.met_by(&Event::Kill(kill("Reeve", 4, Some("pearl-tomb")))));
    assert!(tomb.met_by(&Event::Kill(kill("Reeve", 5, Some("pearl-tomb")))), "a higher rank");
    assert!(!tomb.met_by(&Event::Kill(kill("Reeve", 3, Some("pearl-tomb")))), "a lower rank");
    assert!(!tomb.met_by(&Event::Kill(kill("Collector", 4, Some("pearl-tomb")))), "another type");
    assert!(!tomb.met_by(&Event::Kill(kill("Reeve", 4, Some("krakens-grotto")))), "another node");
    let graves = goal(r#"{ "kind": "kill", "node": "moors", "place": "Graves", "text": "t" }"#);
    let places = [Place { name: "Graves".to_owned(), at: [100.0, 0.0], radius: 50.0 }];
    let fell = |east: f64| Kill { node: Some("moors"), at: [east, 0.0], places: &places, ..kill("Brute", 1, None) };
    assert!(graves.met_by(&Event::Kill(fell(10.0))), "50 m and 40 past it");
    assert!(!graves.met_by(&Event::Kill(fell(9.0))), "past them");
    let isle =
        goal(r#"{ "kind": "kill", "types": ["Reeve", "Captain"], "rank": "Elite", "island": "isle", "text": "t" }"#);
    let on = |island| Kill { island, ..kill("Captain", 3, None) };
    assert!(isle.met_by(&Event::Kill(on(Some("isle")))));
    assert!(!isle.met_by(&Event::Kill(on(Some("cove")))) && !isle.met_by(&Event::Kill(on(None))));
}

#[test]
fn a_sea_goal_takes_its_side_and_its_way_alone_where_it_names_one() {
    let (any, board) = (
        goal(r#"{ "kind": "sea", "side": "tithe", "text": "t" }"#),
        goal(r#"{ "kind": "sea", "side": "tithe", "how": "board", "text": "t" }"#),
    );
    for how in ["sink", "strike", "board"] {
        assert!(any.met_by(&Event::Sea { side: "tithe", how }), "any way");
        assert_eq!(board.met_by(&Event::Sea { side: "tithe", how }), how == "board");
    }
}

/// The number ask 64 sends for a keeper's key.
fn keeper(key: &str) -> u8 {
    (1..=u8::MAX).find(|number| keeper_key(*number) == Some(key)).expect("a keeper")
}

#[test]
fn the_opening_is_walked_by_speaking_with_each_keeper_it_names_and_ends_in_a_pledge_that_begins_the_road() {
    let opening = road_of(0);
    let mut character = Character::starting();
    assert_eq!(character.quest_now(), Some((opening, 0)), "a new player walks the opening");
    let first = &quests().quests[opening].tasks[0];
    let keepers: Vec<u8> = first
        .goals
        .iter()
        .filter_map(|goal| if let Goal::Talk(talk) = &goal.goal { Some(keeper(&talk.to)) } else { None })
        .collect();
    assert!(!keepers.is_empty(), "the opening hears the keepers");
    assert_eq!(character.ask(Ask::Speak { keeper: keepers[0] }, AFIELD, &DICE), Err(Refusal::NotHere));
    assert_eq!(character.ask(Ask::Speak { keeper: 9 }, AT_COUNTER, &DICE), Err(Refusal::NoSuchKeeper));
    assert!(character.ask(Ask::Speak { keeper: keepers[0] }, AT_COUNTER, &DICE).is_ok());
    let before = character.clone();
    assert_eq!(character.ask(Ask::Speak { keeper: keepers[0] }, AT_COUNTER, &DICE), Err(Refusal::NothingToSay));
    assert_eq!(character, before, "a refusal changes nothing");
    for keeper in &keepers[1..] {
        assert!(character.ask(Ask::Speak { keeper: *keeper }, AT_COUNTER, &DICE).is_ok());
    }
    let places = every_place();
    while character.quest_now().is_some_and(|(quest, _)| quest == opening) {
        meet_task(&mut character, &places);
    }
    assert!(character.quests_done()[opening], "the opening done");
    assert_eq!(character.quest_now(), Some((road_of(1), 0)), "the pledged house's road begins");
}

#[test]
fn a_pledge_before_the_keepers_are_heard_leaves_the_opening_and_walks_the_road() {
    let mut character = Character::starting();
    assert!(character.ask(Ask::Pledge { faction: 2 }, AT_COUNTER, &DICE).is_ok());
    assert_eq!((character.quest_now(), character.quests_done()[road_of(0)]), (Some((road_of(2), 0)), false));
}

#[test]
fn a_road_walked_to_its_end_gives_its_art_worn_at_once_then_each_tenet_and_its_fragment_choices() {
    let places = every_place();
    let mut character = Character::starting();
    assert!(character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok());
    let (mut earned, mut choices, mut tasks) = (0, 0, 0);
    while let Some((quest, task)) = character.quest_now() {
        assert_eq!(quests().quests[quest].faction, 1, "the house's own quests, one after another");
        let reward = quests().quests[quest].tasks[task].reward;
        meet_task(&mut character, &places);
        earned |= if reward.art { EARNED_ART } else { 0 };
        earned |= [0, EARNED_TENET_ONE, EARNED_TENET_TWO][usize::from(reward.tenet)];
        choices += reward.fragments;
        tasks += 1;
        assert_eq!((character.earned(1), character.fragment_choices(1)), (earned, choices), "task {tasks}");
        assert_eq!(character.arts.worn, if earned & EARNED_ART == 0 { 0 } else { 1 }, "worn as it is given");
    }
    assert_eq!(earned, ALL_EARNED, "the Art and both its Tenets");
    let house = quests().quests.iter().enumerate().filter(|(_, quest)| quest.faction == 1);
    assert!(house.into_iter().all(|(at, _)| character.quests_done()[at]), "every quest of the house done");
    assert!(!character.tell(&Event::Gather), "a road done takes nothing");
    assert_eq!((character.earned(2), character.earned(3)), (0, 0), "the other houses' Arts");
}

#[test]
fn a_switch_walks_the_new_road_from_where_it_was_left_and_every_road_keeps_its_place() {
    let places = every_place();
    let mut character = Character::starting();
    character.materials.aurem = 100_000;
    assert!(character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok());
    meet_task(&mut character, &places);
    assert!(character.ask(Ask::Pledge { faction: 2 }, AT_COUNTER, &DICE).is_ok());
    assert_eq!(character.quest_now(), Some((road_of(2), 0)));
    meet_task(&mut character, &places);
    assert!(character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok());
    assert_eq!(character.quest_now(), Some((road_of(1), 1)), "the Stormcallers' road where it was left");
}

#[test]
fn a_new_player_earns_no_art_and_wears_none_and_an_art_not_earned_is_refused() {
    let mut character = Character::starting();
    assert_eq!((character.arts.worn, character.worn_art(), character.earned(1)), (0, None, 0));
    assert_eq!(character.fragment("pursuit"), None, "no Art's Core works");
    assert_eq!(character.ask_art(ArtAsk::Wear { art: 1 }), Err(ArtRefusal::NotEarned));
    assert!(!(0..3).any(|ability| character.ability_earned(1, ability)));
    character.arts.earned = Some(vec![EARNED_ART, 0, 0]);
    assert_eq!(character.ask_art(ArtAsk::Wear { art: 1 }), Ok(()));
    assert!(character.ability_earned(1, 0) && !character.ability_earned(1, 1));
    let mastered = WornArts::mastered();
    assert_eq!((mastered.worn, mastered.earned), (1, Some(vec![ALL_EARNED; 3])), "the Test Ground's earns all");
}

#[test]
fn a_character_kept_before_quests_reads_each_at_its_kept_task_and_every_art_earned_its_art_still_worn() {
    let mut kept: serde_json::Value = serde_json::from_str(&Character::starting().to_json()).unwrap();
    let object = kept.as_object_mut().unwrap();
    object.remove("quests");
    object["arts"].as_object_mut().unwrap().remove("earned");
    object["arts"]["worn"] = 3.into();
    let back = Character::from_json(&kept.to_string()).unwrap();
    assert_eq!(back.quest_now(), Some((road_of(0), kept_task(0))), "the opening where a kept character stood");
    assert_eq!(back.quests.roads.len(), quests().quests.len());
    assert_eq!((back.arts.worn, back.earned(1), back.earned(3)), (3, ALL_EARNED, ALL_EARNED));
    let mut unearned = serde_json::from_str::<serde_json::Value>(&Character::starting().to_json()).unwrap();
    unearned["arts"]["worn"] = 2.into();
    assert_eq!(Character::from_json(&unearned.to_string()).unwrap().arts.worn, 0, "an Art not earned is not worn");
}

#[test]
fn the_quest_log_keeps_keys_it_does_not_know_and_is_made_whole_as_read() {
    let storm = &quests().quests[road_of(1)];
    let second = &storm.tasks[1];
    let mut kept: serde_json::Value = serde_json::from_str(&Character::starting().to_json()).unwrap();
    kept["quests"]["later"] = "kept".into();
    kept["quests"]["roads"][&storm.id] = serde_json::json!({ "task": "gone", "counts": [9, 9], "seen": 1 });
    kept["quests"]["roads"]["a-later-road"] = serde_json::json!({ "task": "its-first", "counts": [2] });
    let back = Character::from_json(&kept.to_string()).unwrap();
    let written: serde_json::Value = serde_json::from_str(&back.to_json()).unwrap();
    let roads = &written["quests"]["roads"];
    let unknown = (roads[&storm.id]["seen"].as_u64(), roads["a-later-road"]["counts"][0].as_u64());
    assert_eq!((written["quests"]["later"].as_str(), unknown), (Some("kept"), (Some(1), Some(2))), "kept as read");
    let road = &back.quests.roads[&storm.id];
    assert_eq!((road.task.as_str(), road.counts.len()), (storm.tasks[0].id.as_str(), storm.tasks[0].goals.len()));
    let mut by_id = kept.clone();
    by_id["quests"]["roads"][&storm.id] = serde_json::json!({ "task": second.id, "counts": vec![9; 8] });
    let road = Character::from_json(&by_id.to_string()).unwrap().quests.roads[&storm.id].clone();
    let capped: Vec<u16> = second.goals.iter().map(|goal| goal.count).collect();
    assert_eq!((road.task, road.counts), (second.id.clone(), capped), "by id, each count within its goal's");
}

#[test]
fn a_quest_log_of_a_shape_this_room_cannot_read_reads_as_kept_before_and_is_written_back_as_it_was() {
    for unread in [
        serde_json::json!({ "roads": [{ "task": 3 }] }),
        serde_json::json!({ "roads": { "x": { "task": 3 } } }),
        serde_json::json!(7),
    ] {
        let mut kept: serde_json::Value = serde_json::from_str(&Character::starting().to_json()).unwrap();
        kept["quests"] = unread.clone();
        let back = Character::from_json(&kept.to_string()).expect("the character reads all the same");
        assert_eq!(back.quest_now(), Some((road_of(0), kept_task(0))), "{unread}: as one kept before");
        let written: serde_json::Value = serde_json::from_str(&back.to_json()).unwrap();
        assert_eq!(written["quests"]["unread"], unread, "kept as it was");
    }
}

#[test]
fn a_fragment_choice_owns_one_fragment_not_owned_anywhere_and_is_spent() {
    let mut character = Character::starting();
    let choose = |fragment| Ask::ChooseFragment { art: 2, fragment };
    assert_eq!(character.ask(choose(1), AFIELD, &DICE), Err(Refusal::NoChoice));
    character.quests.choices[1] = 1;
    assert_eq!(character.ask(Ask::ChooseFragment { art: 9, fragment: 1 }, AFIELD, &DICE), Err(Refusal::NoSuchFaction));
    assert_eq!(character.ask(choose(6), AFIELD, &DICE), Err(Refusal::NoSuchFragment));
    assert!(character.ask(choose(1), AFIELD, &DICE).is_ok(), "afield");
    assert!(character.owns_fragment(2, 1));
    assert_eq!((character.fragment_choices(2), character.quests.choices[1]), (0, 0));
    character.quests.choices[1] = 1;
    assert_eq!(character.ask(choose(1), AFIELD, &DICE), Err(Refusal::Owned));
}

#[test]
fn a_fragment_the_art_has_none_left_to_give_is_its_counters_price_in_aurem() {
    let places = every_place();
    let price = crate::factions::factions().fragment_aurem;
    assert_eq!(price, 7_500);
    let mut character = Character::starting();
    assert!(character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok());
    character.arts.owned = Some(vec![0b01_1111, 0, 0]);
    let (mut given, mut missions) = (0, 0);
    while let Some((quest, task)) = character.quest_now() {
        let task = &quests().quests[quest].tasks[task];
        given += task.reward.fragments;
        if !task.goals.iter().all(|goal| matches!(goal.goal.kind(), GoalKind::Talk | GoalKind::Pledge)) {
            missions += crate::rewards::at_level(Clear::Mission.worth().1, character.level());
        }
        meet_task(&mut character, &places);
    }
    assert!(given >= 2, "the road gives two fragments or more");
    let paid = u32::from(given - 1) * price + missions;
    assert_eq!((character.fragment_choices(1), character.materials.aurem), (1, paid), "one left to own: a choice");
}

#[test]
fn a_choice_waiting_for_an_art_whose_fragments_are_all_owned_is_paid_as_any_ask_is_answered() {
    let mut character = Character::kitted();
    character.quests.choices[0] = 2;
    character.arts.owned = Some(vec![0b11_1111, 0, 0]);
    assert!(character.ask(Ask::TakeOff { slot: crate::kinds::Slot::Head }, AFIELD, &DICE).is_ok());
    assert_eq!((character.fragment_choices(1), character.materials.aurem), (0, 15_000), "both, at 7,500 each");
}

#[test]
fn a_save_keeps_each_road_and_task_by_id_wherever_the_file_puts_them() {
    let veiled = road_of(3);
    let third = &quests().quests[veiled].tasks[2];
    let mut kept: serde_json::Value = serde_json::from_str(&Character::starting().to_json()).unwrap();
    kept["allegiance"]["pledge"] = 3.into();
    kept["quests"]["roads"][&quests().quests[veiled].id] = serde_json::json!({ "task": third.id, "counts": [0] });
    let back = Character::from_json(&kept.to_string()).unwrap();
    assert_eq!(back.quest_now(), Some((veiled, 2)));
    let mut character = back.clone();
    character.quests.set_task(veiled, 0);
    assert_eq!(character.quest_now(), Some((veiled, 0)));
}

#[test]
fn each_houses_road_gives_its_lore_book_a_chapter_a_task_the_whole_of_it_as_the_road_ends() {
    let places = every_place();
    for faction in [1, 2, 3] {
        let mut character = Character::starting();
        assert!(character.ask(Ask::Pledge { faction }, AT_COUNTER, &DICE).is_ok());
        let road = &quests().quests[road_of(faction)];
        let book = crate::lore::lore().books.iter().find(|book| {
            book.chapters
                .iter()
                .all(|it| matches!(&it.found, crate::lore::Found::Quest { quest, .. } if *quest == road.id))
        });
        let book = book.unwrap_or_else(|| panic!("{} gives no book", road.id));
        let mut done = 0;
        while character.quest_now().is_some_and(|(quest, _)| quest == road_of(faction)) {
            meet_task(&mut character, &places);
            done += 1;
            let kept: Vec<&str> = book.chapters[..done].iter().map(|chapter| chapter.id.as_str()).collect();
            let held: Vec<&str> =
                character.lore.iter().filter_map(|key| key.strip_prefix(&format!("{}/", book.id))).collect();
            assert_eq!(held, kept, "{}: after task {done}", road.id);
        }
        assert_eq!(done, book.chapters.len(), "{}: the book whole as the road ends", road.id);
    }
}

#[test]
fn a_task_kept_by_the_id_it_had_before_it_moved_reads_as_the_task_it_is_now() {
    let mut kept: serde_json::Value = serde_json::from_str(&Character::starting().to_json()).unwrap();
    kept["quests"]["roads"]["lamplighters"] =
        serde_json::json!({ "task": "hold-gullwing", "counts": [1, 0], "done": false });
    let back = Character::from_json(&kept.to_string()).expect("the character reads");
    let road = &back.quests.roads["lamplighters"];
    assert_eq!(road.task, "hold-saltgrass", "the Gullwing defence now held in Saltgrass");
    assert!(road.counts.iter().all(|count| *count == 0), "begun afresh at its new place");
}
