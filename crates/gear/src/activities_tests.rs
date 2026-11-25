use crate::activities::*;
use crate::world::Difficulty;
use std::collections::BTreeSet;

const LAND: [&str; 9] = [
    include_str!("../../../content/world/land/continent-1.json"),
    include_str!("../../../content/world/land/continent-2.json"),
    include_str!("../../../content/world/land/continent-3.json"),
    include_str!("../../../content/world/land/continent-4.json"),
    include_str!("../../../content/world/land/continent-5.json"),
    include_str!("../../../content/world/land/continent-6.json"),
    include_str!("../../../content/world/land/continent-7.json"),
    include_str!("../../../content/world/land/continent-8.json"),
    include_str!("../../../content/world/land/continent-9.json"),
];

#[test]
fn the_places_are_each_islands_patrol_and_elite_dungeons_as_its_land_file_holds_them() {
    for (island, text) in ISLAND_PLACES.iter().zip(LAND) {
        let file: serde_json::Value = serde_json::from_str(text).expect("a land file");
        let ids = |kind: &str| -> Vec<String> {
            let nodes = file["nodes"].as_array().expect("nodes");
            let of_kind = nodes.iter().filter(|node| node["kind"] == kind);
            of_kind.map(|node| node["id"].as_str().expect("an id").to_owned()).collect()
        };
        assert_eq!(ids("patrol"), [island.patrol], "{}: its one patrol zone", island.continent);
        assert_eq!(ids("dungeon"), island.elite.iter().map(|elite| elite.id).collect::<Vec<_>>());
    }
    assert_eq!(ISLAND_PLACES.map(|island| island.continent), crate::world::ISLANDS.map(|(id, ..)| id));
    assert_eq!(elite_dungeons().count(), 18);
    assert_eq!(island_of("saltworm-warrens").map(|island| island.continent), Some("continent-7"));
    assert_eq!(island_of("saltgrass-downs").map(|island| island.continent), Some("continent-1"));
    assert_eq!(island_of("gullwing-vale"), None, "a patrol zone cut from its island");
    assert_eq!(elite_dungeon("saltgrass-downs"), None, "a patrol is no Elite Dungeon");
}

#[test]
fn each_island_draws_one_of_its_patrol_zones_three_dungeons_each_day_the_same_for_everyone() {
    let drawn: Vec<(&str, usize)> =
        ISLAND_PLACES.iter().map(|island| dungeon_of_the_day(20_778, island.continent).expect("an island")).collect();
    assert_eq!(
        drawn,
        [
            ("saltgrass-downs", 1),
            ("highwater-fells", 0),
            ("elder-thicket", 0),
            ("ochre-wastes", 1),
            ("lion-grasslands", 2),
            ("emerald-tangle", 0),
            ("kurgan-plateau", 2),
            ("bogmire-sloughs", 0),
            ("whitewind-tundra", 0),
        ]
    );
    assert_eq!(dungeon_of_the_day(20_775, "continent-1"), Some(("saltgrass-downs", 0)), "Tuesday's");
    assert_eq!(dungeon_of_the_day(20_778, "continent-0"), None);
    for island in &ISLAND_PLACES {
        let seen: BTreeSet<_> = (0..365).map(|day| dungeon_of_the_day(20_000 + day, island.continent)).collect();
        assert_eq!(seen.len(), 3, "{}: all three of its dungeons in a year", island.continent);
    }
}

#[test]
fn the_modifier_of_the_day_is_one_of_the_eight_and_burn_names_an_art() {
    assert_eq!(modifier_of_the_day(20_775), Modifier::Juggler);
    assert_eq!(modifier_of_the_day(20_777), Modifier::Trickle);
    assert_eq!(modifier_of_the_day(20_778), Modifier::Burn(3));
    assert_eq!(
        (Modifier::Burn(3).key(), Modifier::Burn(3).name()),
        ("burn-shadow".to_owned(), "Burn (Shadow)".to_owned())
    );
    assert_eq!(
        (Modifier::Lightswitch.key(), Modifier::Exposure.name()),
        ("lightswitch".to_owned(), "Exposure".to_owned())
    );
}

#[test]
fn the_weeks_two_are_two_of_the_eighteen_never_the_same_with_one_modifier_and_three() {
    let (elite, abyss) = week_dungeons(2_968);
    assert_eq!((elite.id, abyss.id), ("forsaken-cistern", "saltworm-warrens"));
    assert_eq!(of_the_week(2_968, Weekly::Abyss).id, "saltworm-warrens");
    assert_eq!(week_modifiers(2_968, Weekly::Elite), [Modifier::Brawler]);
    assert_eq!(week_modifiers(2_968, Weekly::Abyss), [Modifier::Lightswitch, Modifier::Burn(2), Modifier::Juggler]);
    assert_eq!((week_dungeons(2_969).0.id, week_dungeons(2_969).1.id), ("pearl-tomb", "coral-halls"));
    for week in 0..5_000 {
        let (elite, abyss) = week_dungeons(week);
        assert_ne!(elite.id, abyss.id, "week {week}");
        let kinds: BTreeSet<usize> = week_modifiers(week, Weekly::Abyss).into_iter().map(Modifier::kind).collect();
        assert_eq!(kinds.len(), 3, "week {week}: three apart");
    }
}

#[test]
fn the_weeks_two_stand_at_their_own_levels_and_open_two_below() {
    assert_eq!([Weekly::Elite, Weekly::Abyss].map(Weekly::foes_at), [26, 30]);
    assert_eq!([Weekly::Elite, Weekly::Abyss].map(Weekly::opens_at), [24, 28]);
    assert_eq!(Difficulty::ALL.map(Weekly::of), [None, Some(Weekly::Elite), Some(Weekly::Abyss)]);
    assert_eq!(Weekly::Abyss.name(), "Abyss Dungeon of the week");
}

#[test]
fn each_modifier_says_what_it_does_in_a_short_plain_line() {
    let kinds = [
        Modifier::Burn(3),
        Modifier::Brawler,
        Modifier::Marksman,
        Modifier::Lightswitch,
        Modifier::Ironclad,
        Modifier::Trickle,
        Modifier::Juggler,
        Modifier::Exposure,
    ];
    assert_eq!(
        kinds.map(Modifier::words),
        [
            "Shadow spells deal double damage. Wearing Shadow, you take double.",
            "Melee deals 50% more damage.",
            "Ranged deals 50% more damage.",
            "Foes' melee deals double damage.",
            "Half of all foes carry shields.",
            "Arts take 50% longer to recharge.",
            "No ammunition drops.",
            "Heals restore half as much.",
        ]
        .map(str::to_owned)
    );
    assert_eq!(Modifier::Burn(1).words(), "Storm spells deal double damage. Wearing Storm, you take double.");
}
