//! The quests' file read and checked: every scene, node, place and spell it names is one; a goal's field missing, left
//! over or of the wrong kind named as it is read; a value none of its own; quests chained one after another, a house
//! with several; old task ids read as the task they became; its spells and rewards in their order; and each house's
//! horde after its Art.

use crate::quests::{Defend, Goal, GoalDef, QuestsDef, quests};

/// Reads a content file as JSON.
fn content(text: &str) -> serde_json::Value {
    serde_json::from_str(text).expect("the content file reads")
}

/// Every place of a node a goal names.
fn places_of(goal: &GoalDef) -> Vec<&str> {
    match &goal.goal {
        Goal::Escort(escort) => vec![escort.from.as_str(), escort.to.as_str()],
        Goal::Tail(tail) => vec![tail.from.as_str(), tail.to.as_str()],
        Goal::Race(race) => race.checkpoints.iter().map(String::as_str).collect(),
        Goal::Reach(_)
        | Goal::Kill(_)
        | Goal::Defend(_)
        | Goal::Puzzle(_)
        | Goal::Unseen(_)
        | Goal::Talk(_)
        | Goal::Pledge(_)
        | Goal::Gather(_)
        | Goal::Cast(_)
        | Goal::Sea(_)
        | Goal::Land(_)
        | Goal::Scavenge(_)
        | Goal::Enter(_)
        | Goal::Buy(_)
        | Goal::Wear(_)
        | Goal::Ride(_)
        | Goal::Sail(_)
        | Goal::Use(_) => goal.goal.place().into_iter().collect(),
    }
}

#[test]
fn the_quests_file_reads_whole_and_names_only_scenes_nodes_places_and_spells_that_are() {
    assert_eq!(quests().problems(), Vec::<String>::new());
    let scenes = content(include_str!("../../../content/story/houses.json"));
    let continent = content(include_str!("../../../content/world/land/continent-1.json"));
    let briefs = content(include_str!("../../../content/world/briefs.json"));
    let social = content(include_str!("../../../content/world/social.json"));
    let socials: Vec<String> = social["open"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|city| Some(format!("{}-social", city.as_str()?)))
        .collect();
    let drawn = continent["nodes"].as_array().unwrap().iter().filter_map(|node| node["id"].as_str());
    // A goal may name an open city's social space as a node: a player docking there enters it.
    let nodes: Vec<&str> = drawn.chain(socials.iter().map(String::as_str)).collect();
    let named = |node: &str, place: &str| {
        let brief = &briefs[node];
        ["areas", "runs"].iter().any(|list| {
            brief[*list].as_array().is_some_and(|found| found.iter().any(|each| each["name"].as_str() == Some(place)))
        })
    };
    for quest in &quests().quests {
        let mut said = vec![quest.begin.as_str()];
        for task in &quest.tasks {
            said.extend([task.start.as_deref(), task.end.as_deref()].into_iter().flatten());
            for goal in &task.goals {
                said.extend(goal.scene.as_deref().into_iter().chain(goal.goal.lines()));
                if let Some(node) = goal.goal.node() {
                    assert!(nodes.contains(&node), "{node} is a node of continent-1 or an open social space");
                    for place in places_of(goal) {
                        assert!(named(node, place), "{place} is a place of {node}");
                    }
                }
            }
        }
        for scene in said {
            assert!(scenes["scenes"][scene].is_array(), "{scene} is a scene of houses.json");
        }
    }
}

/// A goal from JSON.
fn goal(text: &str) -> Result<GoalDef, String> {
    serde_json::from_str(text).map_err(|error| error.to_string())
}

#[test]
fn a_figures_greeting_and_every_line_a_step_says_are_scenes_the_file_checks() {
    let lines = |text: &str| goal(text).expect(text).goal.lines().into_iter().map(str::to_owned).collect::<Vec<_>>();
    let escort = r#"{ "kind": "escort", "node": "n", "from": "a", "to": "b", "who": "tobin", "horse": "dun", "near": 30, "greet": "hello", "shout": "ambush", "mount": "up", "text": "t" }"#;
    assert_eq!(lines(escort), ["hello", "ambush", "up"]);
    let tail = r#"{ "kind": "tail", "node": "n", "from": "a", "to": "b", "foe": "Runner", "far": 10, "near": 40, "greet": "hello", "noticed": "seen", "text": "t" }"#;
    assert_eq!(lines(tail), ["hello", "seen"]);
    let scene =
        goal(r#"{ "kind": "reach", "node": "n", "place": "p", "scene": "there", "text": "t" }"#).expect("a reach");
    assert_eq!(scene.scene.as_deref(), Some("there"), "a scene said as any goal is met");
}

#[test]
fn a_goal_with_a_field_missing_left_over_or_of_another_kind_is_refused_as_read_naming_the_field() {
    let said = |text: &str| goal(text).expect_err(text);
    assert!(
        said(r#"{ "kind": "reach", "node": "n", "plac": "p", "text": "t" }"#).contains("plac"),
        "a field left over"
    );
    assert!(said(r#"{ "kind": "reach", "place": "p", "text": "t" }"#).contains("node"), "a field missing");
    assert!(said(r#"{ "kind": "gather", "count": "two", "text": "t" }"#).contains("count"), "a count of no number");
    assert!(
        said(r#"{ "kind": "gather", "spell": "Tempest", "text": "t" }"#).contains("spell"),
        "a field of another kind"
    );
    assert!(said(r#"{ "kind": "wander", "text": "t" }"#).contains("wander"), "a kind of none");
    assert!(said(r#"{ "kind": "gather" }"#).contains("text"), "its words");
    assert!(goal(r#"{ "kind": "gather", "text": "t", "scene": "s" }"#).is_ok(), "a scene on any goal");
}

#[test]
fn a_goal_holding_a_value_none_of_its_own_is_a_problem_naming_the_field() {
    for (text, field) in [
        (r#"{ "kind": "talk", "to": "nobody", "text": "t" }"#, "to"),
        (r#"{ "kind": "cast", "spell": "Fireball", "text": "t" }"#, "spell"),
        (r#"{ "kind": "kill", "place": "p", "text": "t" }"#, "node"),
        (r#"{ "kind": "kill", "node": "n", "rank": "Captain", "text": "t" }"#, "rank"),
        (r#"{ "kind": "sea", "side": "tithe", "how": "ram", "text": "t" }"#, "how"),
        (r#"{ "kind": "sea", "side": "hostiles", "text": "t" }"#, "side"),
        (r#"{ "kind": "land", "island": "rock", "text": "t" }"#, "island"),
        (
            r#"{ "kind": "escort", "node": "n", "from": "a", "to": "b", "who": "nobody", "horse": "dun", "near": 30, "text": "t" }"#,
            "who",
        ),
        (
            r#"{ "kind": "escort", "node": "n", "from": "a", "to": "b", "who": "tobin", "horse": "zebra", "near": 30, "text": "t" }"#,
            "horse",
        ),
        (
            r#"{ "kind": "tail", "node": "n", "from": "a", "to": "b", "who": "wren", "foe": "Runner", "far": 10, "near": 40, "text": "t" }"#,
            "who",
        ),
        (
            r#"{ "kind": "tail", "node": "n", "from": "a", "to": "b", "foe": "Runner", "far": 40, "near": 10, "text": "t" }"#,
            "near",
        ),
        (r#"{ "kind": "defend", "node": "n", "place": "p", "waves": [[]], "ward": "w", "text": "t" }"#, "waves"),
        (r#"{ "kind": "defend", "node": "n", "place": "p", "waves": [[["Runner", "Minor"]]], "text": "t" }"#, "ward"),
        (
            r#"{ "kind": "defend", "node": "n", "place": "p", "waves": [[["Runner", "Huge"]]], "ward": "w", "text": "t" }"#,
            "rank",
        ),
        (
            r#"{ "kind": "defend", "node": "n", "place": "p", "waves": [[["Runner", "Minor"]]], "ward": "w", "horde": true, "text": "t" }"#,
            "ward",
        ),
        (
            r#"{ "kind": "defend", "node": "n", "place": "p", "waves": [[["Runner", "Minor"], ["Runner", "Minor"], ["Runner", "Minor"], ["Runner", "Minor"], ["Runner", "Minor"], ["Runner", "Minor"], ["Runner", "Minor"], ["Runner", "Minor"], ["Runner", "Minor"]]], "horde": true, "text": "t" }"#,
            "waves",
        ),
        (
            r#"{ "kind": "puzzle", "node": "n", "place": "p", "points": [{ "name": "a", "bearing": 0, "at": 5 }], "order": [1], "text": "t" }"#,
            "order",
        ),
        (
            r#"{ "kind": "puzzle", "node": "n", "place": "p", "points": [{ "name": "a", "bearing": 45, "at": 50 }], "text": "t" }"#,
            "points",
        ),
        (r#"{ "kind": "race", "node": "n", "checkpoints": ["a"], "seconds": 60, "text": "t" }"#, "checkpoints"),
        (r#"{ "kind": "race", "node": "n", "checkpoints": ["a", "b"], "seconds": 0, "text": "t" }"#, "seconds"),
        (r#"{ "kind": "unseen", "node": "n", "place": "p", "count": 2, "text": "t" }"#, "count"),
        (r#"{ "kind": "unseen", "node": "n", "place": "p", "within": 0, "text": "t" }"#, "within"),
        (r#"{ "kind": "unseen", "node": "n", "place": "p", "within": 40, "text": "t" }"#, "within"),
        (r#"{ "kind": "gather", "count": 0, "text": "t" }"#, "count"),
        // Only a weapon's or armour's slot is ever told of a piece bought or worn.
        (r#"{ "kind": "wear", "slot": "mount", "text": "t" }"#, "slot"),
        (r#"{ "kind": "buy", "slot": "cloak", "text": "t" }"#, "slot"),
        // A piece held is told again on every ask, so one piece would meet a count above one.
        (r#"{ "kind": "wear", "slot": "head", "count": 2, "text": "t" }"#, "count"),
        (r#"{ "kind": "buy", "slot": "melee", "count": 3, "text": "t" }"#, "count"),
        // A lesson's step is done once; an arrival names a keeper's counter, and no other act names one.
        (r#"{ "kind": "ride", "act": "walk", "count": 2, "text": "t" }"#, "count"),
        (r#"{ "kind": "sail", "act": "steer", "count": 2, "text": "t" }"#, "count"),
        (r#"{ "kind": "ride", "act": "arrive", "text": "t" }"#, "to"),
        (r#"{ "kind": "ride", "act": "arrive", "to": "nobody", "text": "t" }"#, "to"),
        // The stranger keeps no counter to ride up to.
        (r#"{ "kind": "ride", "act": "arrive", "to": "stranger", "text": "t" }"#, "to"),
        (r#"{ "kind": "ride", "act": "mount", "to": "tack", "text": "t" }"#, "to"),
        // A gift's step names the counter its act is done at, and a dye, worn anywhere, none; each done once.
        (r#"{ "kind": "use", "act": "identify", "text": "t" }"#, "to"),
        (r#"{ "kind": "use", "act": "letter", "to": "vault", "text": "t" }"#, "to"),
        (r#"{ "kind": "use", "act": "dye", "to": "tailor", "text": "t" }"#, "to"),
        (r#"{ "kind": "use", "act": "withdraw", "to": "vault", "count": 2, "text": "t" }"#, "count"),
    ] {
        let problem = goal(text).expect(text).problem();
        assert!(problem.as_deref().is_some_and(|said| said.contains(field)), "{text}: {problem:?}");
    }
    let fine = r#"{ "kind": "puzzle", "node": "n", "place": "p", "points": [{ "name": "a", "bearing": 45, "at": 49 }], "text": "t" }"#;
    assert_eq!(goal(fine).expect(fine).problem(), None, "a point within its place's square, in any order");
    let horde = r#"{ "kind": "defend", "node": "n", "place": "p", "waves": [[["Runner", "Minor"]]], "horde": true, "text": "t" }"#;
    assert_eq!(goal(horde).expect(horde).problem(), None, "a horde has no ward");
}

#[test]
fn each_houses_art_is_given_by_a_task_followed_at_once_by_a_horde_at_its_roads_node() {
    for quest in quests().quests.iter().filter(|quest| quest.faction > 0) {
        let art = quest.tasks.iter().position(|task| task.reward.art).expect("its Art's task");
        let next = quest.tasks.get(art + 1).expect("a task after it");
        let hordes: Vec<&Defend> = quest
            .tasks
            .iter()
            .flat_map(|task| &task.goals)
            .filter_map(|goal| match &goal.goal {
                Goal::Defend(defend) if defend.horde => Some(defend),
                _ => None,
            })
            .collect();
        assert_eq!(hordes.len(), 1, "{}: one horde", quest.id);
        let first = next.goals.first().map(|goal| &goal.goal);
        assert!(matches!(first, Some(Goal::Defend(defend)) if defend.horde), "{}: the horde after its Art", quest.id);
        let foes: usize = hordes[0].waves.iter().map(Vec::len).sum();
        assert!((20..=40).contains(&foes), "{}: a horde of {foes}", quest.id);
    }
}

/// A small file of quests: the opening, and each house one quest giving its Art, its first Tenet and its second.
fn small() -> serde_json::Value {
    let gather = serde_json::json!([{ "kind": "gather", "text": "g" }]);
    let house = |id: &str, faction: u8| {
        serde_json::json!({ "id": id, "name": id, "faction": faction, "begin": "b", "tasks": [
            { "id": "art", "task": "a", "goals": gather, "reward": { "art": true } },
            { "id": "one", "task": "b", "goals": gather, "reward": { "tenet": 1 } },
            { "id": "two", "task": "c", "goals": gather, "reward": { "tenet": 2 } }
        ] })
    };
    serde_json::json!({ "quests": [
        { "id": "opening", "name": "o", "faction": 0, "begin": "b",
          "tasks": [{ "id": "pledge", "task": "p", "goals": [{ "kind": "pledge", "text": "p" }] }] },
        house("storm", 1), house("lamp", 2), house("veil", 3)
    ] })
}

fn read(file: serde_json::Value) -> QuestsDef {
    serde_json::from_value(file).expect("a file of quests")
}

#[test]
fn quests_come_after_others_and_a_house_walks_the_first_of_its_own_not_done_whose_quests_before_are() {
    let mut file = small();
    let next = |id: &str, after: &[&str]| {
        let mut quest = file["quests"][1].clone();
        (quest["id"], quest["after"]) = (id.into(), serde_json::json!(after));
        quest["tasks"] = serde_json::json!([{ "id": "go", "task": "g", "goals": [{ "kind": "gather", "text": "g" }] }]);
        quest
    };
    let (second, third) = (next("storm-2", &["storm"]), next("storm-3", &["storm-2", "lamp"]));
    file["quests"].as_array_mut().unwrap().extend([second, third]);
    let file = read(file);
    assert_eq!(file.problems(), Vec::<String>::new());
    let mut character = crate::character::Character::starting();
    character.allegiance.pledge = 1;
    character.quests = std::mem::take(&mut character.quests).kept_in(&file);
    let done = |character: &mut crate::character::Character, id: &str| {
        character.quests.roads.get_mut(id).expect("a road").done = true;
    };
    assert_eq!(character.quest_walked_in(&file), Some(1), "the house's first");
    done(&mut character, "storm");
    assert_eq!(character.quest_walked_in(&file), Some(4), "the next once it is done");
    done(&mut character, "storm-2");
    assert_eq!(character.quest_walked_in(&file), None, "one after another house's waits for it");
    done(&mut character, "lamp");
    assert_eq!(character.quest_walked_in(&file), Some(5));
    character.allegiance.pledge = 0;
    assert_eq!(character.quest_walked_in(&file), Some(0), "pledged to none, the opening");
}

#[test]
fn a_quest_after_none_after_itself_or_a_house_with_no_quest_is_a_problem() {
    let mut file = small();
    file["quests"][1]["after"] = serde_json::json!(["nowhere"]);
    assert_eq!(read(file).problems().len(), 1, "after names no quest");
    let mut file = small();
    file["quests"][1]["after"] = serde_json::json!(["lamp"]);
    file["quests"][2]["after"] = serde_json::json!(["storm"]);
    assert_eq!(read(file).problems().len(), 2, "each of two after the other");
    let mut file = small();
    file["quests"].as_array_mut().unwrap().remove(3);
    assert_eq!(read(file).problems(), ["faction 3 has no quest"]);
}

#[test]
fn a_task_kept_by_an_id_it_had_before_reads_as_the_task_it_became() {
    let mut file = small();
    file["quests"][1]["tasks"][1]["id"] = "first-tenet".into();
    file["quests"][1]["tasks"][1]["was"] = serde_json::json!(["one"]);
    let file = read(file);
    assert_eq!(file.problems(), Vec::<String>::new());
    let mut log = crate::quests::QuestLog::default();
    log.roads.insert(
        "storm".to_owned(),
        serde_json::from_value(serde_json::json!({ "task": "one", "counts": [1] })).unwrap(),
    );
    let road = &log.kept_in(&file).roads["storm"];
    assert_eq!((road.task.as_str(), road.counts.as_slice()), ("first-tenet", &[0][..]), "its place kept, afresh");
    let mut clash = small();
    clash["quests"][1]["tasks"][1]["was"] = serde_json::json!(["two"]);
    assert_eq!(read(clash).problems().len(), 1, "an old id another task has");
}

/// Every task id the file has had, by its quest: one gone from the file must be an old id (`was`) of a task there.
const TASK_IDS: &[(&str, &str)] = &[
    ("house", "hear-the-stranger"),
    ("house", "find-your-way"),
    ("house", "your-ship"),
    ("house", "arm-yourself"),
    ("house", "wear-them"),
    ("house", "use-your-gifts"),
    ("house", "hear-three-houses"),
    ("house", "choose-house"),
    ("stormcallers", "climb-old-beacon"),
    ("stormcallers", "take-back-storm"),
    ("stormcallers", "hold-glass-high"),
    ("stormcallers", "pell-trail"),
    ("stormcallers", "catch-tally-riders"),
    ("stormcallers", "catch-tithe-sea"),
    ("stormcallers", "search-hoard-isle"),
    ("stormcallers", "light-grey-point"),
    ("stormcallers", "ground-stolen-storm"),
    ("stormcallers", "face-high-assessor"),
    ("stormcallers", "bring-storm-home"),
    ("stormcallers", "run-down-moor-camp"),
    ("stormcallers", "race-river-road"),
    ("stormcallers", "break-tithe-downs"),
    ("lamplighters", "walk-strand"),
    ("lamplighters", "put-out-false"),
    ("lamplighters", "bring-tobin-moorend"),
    ("lamplighters", "mend-hamlet"),
    ("lamplighters", "hold-saltgrass"),
    ("lamplighters", "find-wreckers-ship"),
    ("lamplighters", "search-wreckers-cove"),
    ("lamplighters", "free-old-stones"),
    ("lamplighters", "light-old-stones"),
    ("lamplighters", "into-pearl-tomb"),
    ("lamplighters", "light-way-home"),
    ("lamplighters", "bring-tobin-fold"),
    ("lamplighters", "douse-false-lights"),
    ("lamplighters", "carry-light-vale"),
    ("lamplighters", "hold-gullwing"),
    ("lamplighters", "find-lens-buyer"),
    ("lamplighters", "set-grey-point"),
    ("lamplighters", "burn-barrow-wreckers"),
    ("house", "ride-the-bay"),
    ("house", "learn-the-helm"),
    ("house", "bring-it-home"),
    ("veiled", "meet-wren-follow"),
    ("veiled", "lift-collectors-tallies"),
    ("veiled", "wait-under-valeguard"),
    ("veiled", "tail-tally-chalk"),
    ("veiled", "empty-chalk-adit"),
    ("veiled", "board-tally-ship"),
    ("veiled", "reckoner-isle"),
    ("veiled", "climb-moorhold"),
    ("veiled", "reckoner-chest"),
    ("veiled", "keeper-grotto"),
    ("veiled", "burn-page"),
    ("veiled", "tail-collector"),
    ("veiled", "adit-unseen"),
    ("veiled", "follow-reckoner"),
    ("veiled", "empty-moorhold"),
    ("veiled", "follow-wren-coven"),
    ("veiled", "loose-dark-adit"),
];

#[test]
fn every_task_id_a_save_may_hold_is_a_task_of_its_quest_or_an_old_id_of_one() {
    for (quest, task) in TASK_IDS {
        let found = quests().quests.iter().find(|it| it.id == *quest);
        let held =
            found.is_some_and(|it| it.tasks.iter().any(|it| it.id == *task || it.was.iter().any(|was| was == task)));
        assert!(held, "{quest}: {task} is gone with no task that was it");
    }
    let listed = |quest: &str, task: &str| TASK_IDS.contains(&(quest, task));
    for quest in &quests().quests {
        for task in &quest.tasks {
            assert!(listed(&quest.id, &task.id), "{}: {} is new: add it to TASK_IDS", quest.id, task.id);
        }
    }
}

#[test]
fn a_house_gives_its_art_then_its_first_tenet_then_its_second_and_asks_only_spells_it_has_earned() {
    let mut early = small();
    early["quests"][1]["tasks"][0]["reward"] = serde_json::json!({ "tenet": 1 });
    early["quests"][1]["tasks"][1]["reward"] = serde_json::json!({ "art": true });
    assert_eq!(read(early).problems().len(), 1, "a Tenet before its Art");
    let mut twice = small();
    twice["quests"][1]["tasks"][2]["reward"] = serde_json::json!({ "tenet": 1 });
    assert_eq!(read(twice).problems().len(), 1, "a Tenet given twice");
    let cast = |spell: &str, task: usize| {
        let mut file = small();
        file["quests"][1]["tasks"][task]["goals"] =
            serde_json::json!([{ "kind": "cast", "spell": spell, "text": "c" }]);
        read(file).problems()
    };
    assert!(cast("Tempest", 1).is_empty(), "the Anima after the Art's task");
    assert_eq!(cast("Tempest", 0).len(), 1, "the Anima in the Art's own task");
    assert!(cast("Quicken", 2).is_empty(), "the first Tenet after its task");
    assert_eq!(cast("Arc Lash", 2).len(), 1, "the second Tenet in its own task");
    assert_eq!(cast("Sunwell", 2).len(), 1, "another house's Art");
}
