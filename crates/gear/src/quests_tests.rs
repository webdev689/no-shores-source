//! The houses' roads in the rules: the file read whole against the scenes, nodes, places and spells it names; every
//! goal's kind met by its event alone; the opening walked to a pledge; a road walked to its end with each reward given
//! as its task is done; the Arts earned and the locks they open; fragment choices; and the log kept between sessions.

use crate::arts::{ALL_EARNED, ArtAsk, ArtRefusal, EARNED_ART, EARNED_TENET_ONE, WornArts};
use crate::asks::{Ask, Here, Refusal};
use crate::character::Character;
use crate::dice::Dice;
use crate::quests::{Event, GoalDef, GoalKind, Kill, Place, quests};

const AT_COUNTER: Here = Here { social: true, day: 0, pledge: 0, rank: 0, week: 0 };
const AFIELD: Here = Here { social: false, day: 0, pledge: 0, rank: 0, week: 0 };
const DICE: Dice = Dice { seed: 3, tick: 1, player: 1 };

/// Reads a content file as JSON.
fn content(text: &str) -> serde_json::Value {
    serde_json::from_str(text).expect("the content file reads")
}

#[test]
fn the_quests_file_reads_whole_and_names_only_scenes_nodes_places_and_spells_that_are() {
    assert_eq!(quests().problems(), Vec::<String>::new());
    let scenes = content(include_str!("../../../content/story/houses.json"));
    let continent = content(include_str!("../../../content/world/land/continent-1.json"));
    let briefs = content(include_str!("../../../content/world/briefs.json"));
    let nodes: Vec<&str> =
        continent["nodes"].as_array().unwrap().iter().filter_map(|node| node["id"].as_str()).collect();
    let named = |node: &str, place: &str| {
        let brief = &briefs[node];
        ["areas", "runs"].iter().any(|list| {
            brief[*list].as_array().is_some_and(|found| found.iter().any(|each| each["name"].as_str() == Some(place)))
        })
    };
    for quest in &quests().quests {
        let mut said = vec![Some(&quest.begin)];
        for task in &quest.tasks {
            said.extend([task.start.as_ref(), task.end.as_ref()]);
            for goal in &task.goals {
                said.push(goal.scene.as_ref());
                if let Some(node) = &goal.node {
                    assert!(nodes.contains(&node.as_str()), "{node} is a node of continent-1");
                    let place = goal.place.as_deref();
                    assert!(place.is_none_or(|place| named(node, place)), "{place:?} is a place of {node}");
                }
            }
        }
        for scene in said.into_iter().flatten() {
            assert!(scenes["scenes"][scene].is_array(), "{scene} is a scene of houses.json");
        }
    }
}

/// A goal from JSON, for the problems a goal not well formed has.
fn goal(text: &str) -> GoalDef {
    serde_json::from_str(text).unwrap()
}

#[test]
fn a_goal_missing_a_field_its_kind_needs_or_naming_what_is_not_is_a_problem() {
    let with = |text: &str| {
        let mut file = quests().clone();
        file.quests[1].tasks[0].goals[0] = goal(text);
        file.problems()
    };
    assert!(with(r#"{ "kind": "reach", "node": "saltgrass-downs", "place": "Saltgrass", "text": "" }"#).is_empty());
    for broken in [
        r#"{ "kind": "reach", "node": "saltgrass-downs", "text": "" }"#,
        r#"{ "kind": "talk", "to": "nobody", "text": "" }"#,
        r#"{ "kind": "cast", "spell": "Fireball", "text": "" }"#,
        r#"{ "kind": "kill", "place": "Tithe Camp", "text": "" }"#,
        r#"{ "kind": "kill", "node": "saltgrass-downs", "rank": "Captain", "text": "" }"#,
        r#"{ "kind": "sea", "side": "tithe", "how": "ram", "text": "" }"#,
        r#"{ "kind": "land", "island": "isle", "spell": "Tempest", "text": "" }"#,
        r#"{ "kind": "gather", "count": 0, "text": "" }"#,
    ] {
        assert_eq!(with(broken).len(), 1, "{broken}");
    }
    assert!(serde_json::from_str::<GoalDef>(r#"{ "kind": "reach", "plac": "Saltgrass", "text": "" }"#).is_err());
    let mut file = quests().clone();
    file.quests[0].tasks[0].reward.art = true;
    assert_eq!(file.problems().len(), 1, "the opening gives no Art");
}

/// An event that meets a goal, its places at the world's middle.
fn meeting<'told>(goal: &'told GoalDef, places: &'told [Place]) -> Event<'told> {
    let text = |field: &'told Option<String>| field.as_deref().unwrap_or_default();
    match goal.kind {
        GoalKind::Talk => Event::Talk(text(&goal.to)),
        GoalKind::Pledge => Event::Pledge,
        GoalKind::Reach => Event::Reach { node: text(&goal.node), place: text(&goal.place) },
        GoalKind::Kill => Event::Kill(Kill {
            node: goal.node.as_deref(),
            at: [0.0, 0.0],
            places,
            foe: goal.types.first().map_or("Collector", String::as_str),
            rank: 5,
            island: goal.island.as_deref(),
        }),
        GoalKind::Gather => Event::Gather,
        GoalKind::Cast => Event::Cast(text(&goal.spell)),
        GoalKind::Sea => Event::Sea { side: text(&goal.side), how: goal.how.as_deref().unwrap_or("sink") },
        GoalKind::Land => Event::Land(text(&goal.island)),
        GoalKind::Scavenge => Event::Scavenge,
        GoalKind::Enter => Event::Enter(text(&goal.node)),
    }
}

/// Every place a quest's goals name, at the world's middle, as a node's file has it.
fn every_place() -> Vec<Place> {
    let named = quests().quests.iter().flat_map(|quest| &quest.tasks).flat_map(|task| &task.goals);
    let places = named.filter_map(|goal| goal.place.clone());
    places.map(|name| Place { name, at: [0.0, 0.0], radius: 10.0 }).collect()
}

/// Meets every goal of the task the player is on, each until its count.
fn meet_task(character: &mut Character, places: &[Place]) {
    let now = character.quest_now().expect("a task to meet");
    for (at, goal) in quests().quests[now.0].tasks[now.1].goals.iter().enumerate() {
        while character.quest_now() == Some(now) && character.quest_counts()[at] < goal.count {
            if goal.kind == GoalKind::Pledge {
                character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).unwrap();
            } else {
                assert!(character.tell(&meeting(goal, places)), "{} counts", goal.text);
            }
        }
    }
}

#[test]
fn each_kind_of_goal_is_met_by_its_own_event_alone() {
    let places = every_place();
    let goals: Vec<&GoalDef> =
        quests().quests.iter().flat_map(|quest| &quest.tasks).flat_map(|task| &task.goals).collect();
    for kind in [GoalKind::Talk, GoalKind::Reach, GoalKind::Kill, GoalKind::Cast, GoalKind::Sea, GoalKind::Land] {
        let of_kind: Vec<&&GoalDef> = goals.iter().filter(|goal| goal.kind == kind).collect();
        assert!(of_kind.len() >= 2, "{kind:?} has goals to tell apart");
        for goal in &of_kind {
            assert!(goal.met_by(&meeting(goal, &places)), "{} is met by its event", goal.text);
            let others = of_kind.iter().filter(|other| !other.met_by(&meeting(goal, &places)));
            assert!(others.count() > 0 || kind == GoalKind::Kill, "{}'s event meets not every {kind:?}", goal.text);
        }
    }
    for goal in &goals {
        let unlike = goals.iter().filter(|other| other.kind != goal.kind);
        assert!(unlike.into_iter().all(|other| !goal.met_by(&meeting(other, &places))), "{} alone", goal.text);
    }
}

/// A foe's fall at the world's middle, with no places.
fn kill<'told>(foe: &'told str, rank: u8, node: Option<&'told str>) -> Kill<'told> {
    Kill { node, at: [0.0, 0.0], places: &[], foe, rank, island: None }
}

#[test]
fn a_kill_counts_within_its_place_and_forty_metres_past_of_its_type_rank_node_and_island() {
    let road = &quests().quests[2];
    let tomb = &road.tasks[8].goals[2];
    assert_eq!((tomb.text.as_str(), tomb.rank.as_deref()), ("The Reeve of the Tomb", Some("Miniboss")));
    assert!(tomb.met_by(&Event::Kill(kill("Reeve", 4, Some("pearl-tomb")))));
    assert!(tomb.met_by(&Event::Kill(kill("Reeve", 5, Some("pearl-tomb")))), "a higher rank");
    assert!(!tomb.met_by(&Event::Kill(kill("Reeve", 3, Some("pearl-tomb")))), "a lower rank");
    assert!(!tomb.met_by(&Event::Kill(kill("Collector", 4, Some("pearl-tomb")))), "another type");
    assert!(!tomb.met_by(&Event::Kill(kill("Reeve", 4, Some("krakens-grotto")))), "another node");
    let graves = &road.tasks[1].goals[0];
    let places = [Place { name: "Drowned Men's Graves".to_owned(), at: [100.0, 0.0], radius: 50.0 }];
    let fell =
        |east: f64| Kill { node: Some("driftwood-moors"), at: [east, 0.0], places: &places, ..kill("Brute", 1, None) };
    assert!(graves.met_by(&Event::Kill(fell(10.0))), "50 m and 40 past it");
    assert!(!graves.met_by(&Event::Kill(fell(9.0))), "past them");
    let isle = &quests().quests[3].tasks[6].goals[1];
    let on = |island| Kill { island, ..kill("Captain", 3, None) };
    assert!(isle.met_by(&Event::Kill(on(Some("isle")))));
    assert!(!isle.met_by(&Event::Kill(on(Some("cove")))) && !isle.met_by(&Event::Kill(on(None))));
}

#[test]
fn a_sea_goal_takes_its_side_and_its_way_alone_where_it_names_one() {
    let (storm, veil) = (&quests().quests[1].tasks[5].goals[0], &quests().quests[3].tasks[5].goals[0]);
    for how in ["sink", "strike", "board"] {
        assert!(storm.met_by(&Event::Sea { side: "tithe", how }), "any way");
        assert!(!storm.met_by(&Event::Sea { side: "pirates", how }), "not the pirates");
        assert_eq!(veil.met_by(&Event::Sea { side: "tithe", how }), how == "board");
    }
}

#[test]
fn the_opening_is_walked_by_speaking_with_each_keeper_and_ends_in_a_pledge_that_begins_the_road() {
    let mut character = Character::starting();
    assert_eq!(character.quest_now(), Some((0, 0)), "a new player walks the opening");
    assert_eq!(character.ask(Ask::Speak { keeper: 2 }, AFIELD, &DICE), Err(Refusal::NotHere));
    assert_eq!(character.ask(Ask::Speak { keeper: 9 }, AT_COUNTER, &DICE), Err(Refusal::NoSuchKeeper));
    assert_eq!(character.ask(Ask::Speak { keeper: 10 }, AT_COUNTER, &DICE), Err(Refusal::NothingToSay), "the Mage");
    assert!(character.ask(Ask::Speak { keeper: 2 }, AT_COUNTER, &DICE).is_ok());
    assert_eq!(character.quest_counts(), [0, 1, 0]);
    let before = character.clone();
    assert_eq!(character.ask(Ask::Speak { keeper: 2 }, AT_COUNTER, &DICE), Err(Refusal::NothingToSay), "said");
    assert_eq!(character, before, "a refusal changes nothing");
    for keeper in [1, 3] {
        assert!(character.ask(Ask::Speak { keeper }, AT_COUNTER, &DICE).is_ok());
    }
    assert_eq!((character.quest_now(), character.quest_counts()), (Some((0, 1)), vec![0]), "the next task at once");
    assert!(character.ask(Ask::Pledge { faction: 3 }, AT_COUNTER, &DICE).is_ok());
    assert_eq!(character.quests_done(), [true, false, false, false]);
    assert_eq!((character.quest_now(), character.quest_counts()), (Some((3, 0)), vec![0]), "the Veiled's road");
}

#[test]
fn a_pledge_before_the_keepers_are_heard_leaves_the_opening_and_walks_the_road() {
    let mut character = Character::starting();
    assert!(character.ask(Ask::Pledge { faction: 2 }, AT_COUNTER, &DICE).is_ok());
    assert_eq!((character.quest_now(), character.quests_done()[0]), (Some((2, 0)), false));
}

#[test]
fn a_road_walked_to_its_end_gives_its_art_worn_at_once_then_each_tenet_then_three_fragment_choices() {
    let places = every_place();
    let mut character = Character::starting();
    assert!(character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok());
    let mut given = Vec::new();
    while let Some((quest, task)) = character.quest_now() {
        assert_eq!(quest, 1);
        let goal = &quests().quests[1].tasks[task].goals[0];
        if goal.count > 1 {
            character.tell(&meeting(goal, &places));
            assert_eq!(character.quest_now(), Some((1, task)), "a goal short of its count holds the task");
        }
        meet_task(&mut character, &places);
        given.push((task, character.earned(1), character.arts.worn, character.fragment_choices(1)));
    }
    let art = EARNED_ART;
    let both = art | EARNED_TENET_ONE;
    let expected = [(0, 0, 0, 0), (1, 0, 0, 0), (2, art, 1, 0), (3, both, 1, 0), (4, both, 1, 0), (5, both, 1, 0)];
    assert_eq!(given[..6], expected);
    assert_eq!(given[6], (6, both, 1, 1), "the isle's fragment");
    assert_eq!(given[7], (7, ALL_EARNED, 1, 1), "the second Tenet");
    assert_eq!(given[8..], [(8, ALL_EARNED, 1, 2), (9, ALL_EARNED, 1, 3)], "the instance's and the road's end");
    assert_eq!(character.quests_done(), [false, true, false, false]);
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
    assert_eq!(character.quest_now(), Some((2, 0)));
    meet_task(&mut character, &places);
    meet_task(&mut character, &places);
    assert!(character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok());
    assert_eq!(character.quest_now(), Some((1, 1)), "the Stormcallers' road where it was left");
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
fn a_character_kept_before_quests_reads_every_quest_unbegun_and_every_art_earned_its_art_still_worn() {
    let mut kept: serde_json::Value = serde_json::from_str(&Character::starting().to_json()).unwrap();
    let object = kept.as_object_mut().unwrap();
    object.remove("quests");
    object["arts"].as_object_mut().unwrap().remove("earned");
    object["arts"]["worn"] = 3.into();
    let back = Character::from_json(&kept.to_string()).unwrap();
    assert_eq!(back.quest_now(), Some((0, 0)));
    assert_eq!(back.quests.roads.len(), quests().quests.len());
    assert_eq!((back.arts.worn, back.earned(1), back.earned(3)), (3, ALL_EARNED, ALL_EARNED));
    let mut unearned = serde_json::from_str::<serde_json::Value>(&Character::starting().to_json()).unwrap();
    unearned["arts"]["worn"] = 2.into();
    assert_eq!(Character::from_json(&unearned.to_string()).unwrap().arts.worn, 0, "an Art not earned is not worn");
}

#[test]
fn the_quest_log_keeps_keys_it_does_not_know_and_is_made_whole_as_read() {
    let mut kept: serde_json::Value = serde_json::from_str(&Character::starting().to_json()).unwrap();
    kept["quests"]["later"] = "kept".into();
    kept["quests"]["roads"][1] = serde_json::json!({ "task": 40, "counts": [9, 9, 9], "seen": 1 });
    let back = Character::from_json(&kept.to_string()).unwrap();
    let written: serde_json::Value = serde_json::from_str(&back.to_json()).unwrap();
    assert_eq!(
        (written["quests"]["later"].as_str(), written["quests"]["roads"][1]["seen"].as_u64()),
        (Some("kept"), Some(1))
    );
    let road = &back.quests.roads[1];
    assert_eq!((road.task, road.counts.as_slice()), (9, &[1][..]), "the last task, its one goal within its count");
    assert_eq!(back.quests.choices, [0, 0, 0]);
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
    let mut character = Character::starting();
    assert!(character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok());
    character.quests.roads[1].task = 6;
    character.arts.owned = Some(vec![0b01_1111, 0, 0]);
    character.quests = std::mem::take(&mut character.quests).kept();
    meet_task(&mut character, &places);
    assert_eq!((character.fragment_choices(1), character.materials.aurem), (1, 0), "one left unowned: a choice");
    for task in 7..9 {
        assert_eq!(character.quest_now(), Some((1, task)));
        meet_task(&mut character, &places);
    }
    let price = crate::factions::factions().fragment_aurem;
    assert_eq!((character.fragment_choices(1), character.materials.aurem), (1, price), "none left beyond the choice");
    assert_eq!(price, 7_500);
}
