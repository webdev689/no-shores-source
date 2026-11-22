use crate::catalogue::{Catalogue, TraitColumn, catalogue};
use crate::character::{Character, VESTIGES_MOST, Vestige};
use crate::dice::Dice;
use crate::item::NAMED_LEVEL;
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::rewards::Foe;
use crate::vestige::{dropped, make, of_colours, opens_to};
use crate::world::Difficulty;

fn dice(seed: u64) -> Dice {
    Dice { seed, tick: 3, player: 2 }
}

#[test]
fn the_catalogue_reads_and_keeps_every_rule() {
    assert_eq!(catalogue().problems(), Vec::<String>::new());
    assert_eq!(catalogue().resources.len(), 9, "one resource for each continent");
}

#[test]
fn a_rolled_weapon_may_be_offered_the_verbs_in_pools_grown_alike() {
    use crate::grid::Column;
    use crate::kinds::Kind;
    let pool = |column: Column, kind: Kind| -> Vec<String> {
        catalogue().pool(column, kind).into_iter().map(|found| found.id.clone()).collect()
    };
    let sizes = |kind: Kind| [Column::Handling(2), Column::Finish(2), Column::Perk(2)].map(|at| pool(at, kind).len());
    assert_eq!(sizes(Kind::Greatsword), [6, 7, 8], "handling, finish, perks");
    assert_eq!(sizes(Kind::MaceAndShield), [6, 7, 9], "and Bulwark");
    assert_eq!(sizes(Kind::Thunderlock), [6, 7, 6]);
    assert_eq!(pool(Column::Perk(2), Kind::Head).len(), 6);
    let offered =
        |kind: Kind| [Column::Handling(2), Column::Finish(2), Column::Perk(2)].map(|at| pool(at, kind)).concat();
    for verb in ["exposing_strikes", "thunderclap", "exploit", "keen_eye", "attuned", "spellfeed"] {
        assert!(offered(Kind::Greatsword).iter().any(|id| id == verb), "{verb} for Melee");
    }
    for verb in ["marked_shot", "shocking_rounds", "keen_eye", "attuned", "spellfeed"] {
        assert!(offered(Kind::Bow).iter().any(|id| id == verb), "{verb} for Ranged");
    }
    assert!(!offered(Kind::Bow).iter().any(|id| id == "exploit"), "a Melee perk is not a Ranged one");
}

#[test]
fn a_catalogue_that_breaks_a_rule_says_which() {
    let traits = r#"{"traits": [
        {"id": "light_grip", "name": "Light Grip", "column": "handling", "fits": "melee", "words": "w"},
        {"id": "own", "name": "Own", "column": "signature", "fits": "someone_else", "words": "w"},
        {"id": "typo", "name": "Typo", "column": "handling", "fits": "mele", "words": "w"},
        {"id": "worn", "name": "Worn", "column": "intrinsic", "fits": "mantle", "words": "w"}]}"#;
    let items = r#"{"items": [{"id": "odd", "name": "Odd", "kind": "sword", "rarity": "legendary",
        "resource": "nowhere", "words": "w", "layout": [["light_grip", "light_grip", "own"], ["missing"]]},
        {"id": "guild_blade", "name": "Guild Blade", "kind": "greatsword", "rarity": "legendary", "faction": "nobody",
        "resource": "nowhere", "words": "w", "layout": []},
        {"id": "bare_atheric", "name": "Bare", "kind": "sword", "rarity": "atheric", "resource": "nowhere", "words": "w",
        "layout": []},
        {"id": "mantle", "name": "Mantle", "kind": "cloak", "rarity": "legendary", "words": "w", "layout": [],
        "intrinsic": "worn"}]}"#;
    let resources = r#"{"resources": []}"#;
    let rolled = r#"{"names": {}}"#;
    let problems = Catalogue::parse(traits, items, resources, rolled).expect("well formed").problems();
    for expected in [
        "odd: its resource is none the catalogue holds",
        "odd: 2 trait columns, its rarity has 4",
        "signature own must be carried by someone_else alone",
        "no names for a Normal Sword",
        "guild_blade: its faction is none the factions' file holds",
        "no Legendary Greatsword",
        "bare_atheric: an Atheric weapon or module has an intrinsic",
        "trait typo fits mele, which is nothing it may fit",
        "cloak mantle has no nodes, no intrinsic and asks for no resource",
    ] {
        assert!(problems.iter().any(|problem| problem == expected), "{expected} in {problems:#?}");
    }
    assert!(Catalogue::parse("{}", items, resources, rolled).is_err_and(|error| error.contains("traits.json")));
}

#[test]
fn bosses_always_leave_a_vestige_and_the_best_colours_wait_on_the_foes_level() {
    let colours = |boss: bool, level: u8| {
        let mut seen = [0_u32; 5];
        for seed in 0..4_000 {
            if let Some((rarity, _, item_level)) = dropped(0.05, boss, level, &dice(seed)) {
                seen[rarity as usize] += 1;
                assert_eq!(item_level, level.min(NAMED_LEVEL));
            }
        }
        seen
    };
    let low_boss = colours(true, 10);
    assert_eq!(low_boss.iter().sum::<u32>(), 4_000, "a boss always leaves one");
    assert_eq!((low_boss[0], low_boss[3], low_boss[4]), (0, 0, 0), "no Normal from a boss; nothing past Rare at 10");
    let high_boss = colours(true, 25);
    assert!(high_boss[4] > 60 && high_boss[4] < 200, "about 3 in 100 Atheric: {high_boss:?}");
    let foes = colours(false, 30);
    let dropped_count: u32 = foes.iter().sum();
    assert!((150..250).contains(&dropped_count), "about 5 in 100 from a skirmisher: {dropped_count}");
    assert_eq!(foes[4], 0, "most foes never leave an Atheric");
}

#[test]
fn a_vestige_opens_at_below_or_now_and_then_above_its_colour() {
    let opened = |colour: Rarity| {
        let mut seen = [0_u32; 5];
        for seed in 0..10_000 {
            seen[opens_to(colour, NAMED_LEVEL, &dice(seed)) as usize] += 1;
        }
        seen
    };
    let legendary = opened(Rarity::Legendary);
    assert!((5_700..6_300).contains(&legendary[2]), "six in ten open Rare: {legendary:?}");
    assert!((3_200..3_800).contains(&legendary[3]), "about a third open Legendary, as at Destiny 1's launch");
    assert!(legendary[4] > 300 && legendary[0] + legendary[1] == 0);
    let atheric = opened(Rarity::Atheric);
    assert!(atheric[3] > 1_500 && atheric[3] < 2_500, "even an Atheric can open below its colour: {atheric:?}");
}

#[test]
fn a_low_vestige_never_opens_to_what_its_foe_could_not_have_dropped() {
    for seed in 0..5_000 {
        assert!(opens_to(Rarity::Rare, 17, &dice(seed)) <= Rarity::Rare, "no Legendary below level 18");
        assert!(opens_to(Rarity::Legendary, 19, &dice(seed)) <= Rarity::Legendary, "no Atheric below level 20");
    }
}

#[test]
fn what_a_vestige_makes_belongs_to_its_slot_and_never_offers_a_trait_twice() {
    for seed in 0..300 {
        for slot in Slot::VESTIGE {
            for rarity in Rarity::ALL {
                let item = make(9, rarity, slot, 12, &dice(seed)).expect("every slot and rarity makes something");
                assert!(item.kind.fits(slot), "{:?} in {slot:?}", item.kind);
                assert_eq!(item.bucket, slot);
                let offered: Vec<&String> = item.layout.iter().flatten().collect();
                let mut distinct = offered.clone();
                distinct.sort();
                distinct.dedup();
                assert_eq!(distinct.len(), offered.len(), "{:?}", item.layout);
                for (column, traits) in item.columns().iter().filter(|column| column.traits()).zip(&item.layout) {
                    assert_eq!(traits.len(), usize::from(column.nodes()));
                }
                if rarity.named() {
                    assert_eq!(item.level, NAMED_LEVEL);
                    let named = catalogue().named(item.named.as_deref().expect("a named item")).expect("in it");
                    assert!(!named.breach, "Breach items come from Breaches alone");
                } else {
                    assert_eq!(item.level, 12);
                    assert!(usize::from(item.name) < catalogue().names_of(item.kind, rarity).len());
                    let pooled = |id: &String| {
                        catalogue().trait_def(id).is_some_and(|found| found.column != TraitColumn::Signature)
                    };
                    assert!(item.layout.iter().flatten().all(pooled));
                }
            }
        }
    }
    assert_eq!(make(1, Rarity::Rare, Slot::Arms, 5, &dice(4)), make(1, Rarity::Rare, Slot::Arms, 5, &dice(4)));
}

#[test]
fn a_kill_pays_every_player_who_struck_by_the_foes_kind_and_level() {
    let mut character = Character::starting();
    let reward = character.reward_kill(Foe::Swordsman, 5, Some(Slot::Melee), Difficulty::Normal, &dice(1));
    assert_eq!((reward.xp, reward.aurem), (90, 8), "a swordsman's worth at level 5");
    let captain = character.reward_kill(Foe::Captain, 15, None, Difficulty::Normal, &dice(1));
    assert_eq!((captain.xp, captain.aurem), (4_000, 240));
    assert!(captain.vestige.is_some(), "a captain always leaves a Vestige");
    assert_eq!(character.xp, 4_090);
    assert_eq!(character.materials.aurem, 248);
}

#[test]
fn a_player_carries_ten_vestiges_and_gathers_three_of_a_resource() {
    let mut character = Character::starting();
    for id in 0..VESTIGES_MOST as u32 {
        assert!(character.pick_up(Vestige::new(id, Rarity::Normal, Slot::Legs, 1)));
    }
    assert!(!character.pick_up(Vestige::new(99, Rarity::Rare, Slot::Legs, 1)));
    assert_eq!(character.gather(0), 3);
    assert_eq!(character.materials.resource(0), 3);
}

#[test]
fn a_vestige_a_clear_pays_is_kept_in_the_carried_ten_then_the_vault_and_refused_only_with_both_full() {
    let mut character = Character::starting();
    let paid = || Vestige::new(0, Rarity::Legendary, Slot::Head, 26);
    for _ in 0..VESTIGES_MOST + crate::character::VAULT_MOST {
        assert!(character.keep_paid(paid()));
    }
    assert_eq!((character.vestiges_held(false), character.vestiges_held(true)), (VESTIGES_MOST, 20));
    assert!(!character.keep_paid(paid()), "both full: kept nowhere");
    assert_eq!(character.vestiges.len(), VESTIGES_MOST + 20, "each numbered as it is kept, none overwritten");
}

#[test]
fn a_harder_voyage_raises_foes_and_pays_more() {
    use crate::world::{FOE_LEVEL_MOST, ISLANDS, island_levels};
    assert_eq!(island_levels("continent-1"), Some((1, 4)));
    assert_eq!(island_levels("nowhere"), None);
    assert!(ISLANDS.windows(2).all(|pair| pair[0].2 <= pair[1].1), "each island picks up where the last left off");
    assert_eq!(ISLANDS.last().map(|island| island.2), Some(30), "the last island reaches the highest player");
    let names = Difficulty::ALL.map(Difficulty::name);
    assert_eq!(names, ["normal", "elite", "abyss"]);
    assert_eq!(names.map(Difficulty::from_name), Difficulty::ALL.map(Some));
    assert_eq!(Difficulty::default(), Difficulty::Normal);
    assert_eq!(Difficulty::from_name("gale"), None);
    assert_eq!(Difficulty::from_name("storm"), None, "the old names are gone");
    // Each harder voyage raises a foe more than the one before, and none past the highest level.
    let raised = Difficulty::ALL.map(|difficulty| difficulty.raise(10));
    assert!(raised[0] == 10 && raised[0] < raised[1] && raised[1] < raised[2], "{raised:?}");
    assert_eq!(Difficulty::Abyss.raise(30), FOE_LEVEL_MOST);
    assert!(Difficulty::ALL.iter().all(|difficulty| difficulty.raise(FOE_LEVEL_MOST) == FOE_LEVEL_MOST));
    let mut normal = Character::starting();
    let mut abyss = Character::starting();
    let paid = normal.reward_kill(Foe::Swordsman, 5, None, Difficulty::Normal, &dice(1));
    let harder = abyss.reward_kill(Foe::Swordsman, 5, None, Difficulty::Abyss, &dice(1));
    assert_eq!((harder.xp, harder.aurem), (paid.xp * 2, paid.aurem * 2));
    let drops = |difficulty: Difficulty| {
        (0..2_000)
            .filter(|seed| {
                Character::starting().reward_kill(Foe::Skirmisher, 10, None, difficulty, &dice(*seed)).vestige.is_some()
            })
            .count()
    };
    let (normal_drops, abyss_drops) = (drops(Difficulty::Normal), drops(Difficulty::Abyss));
    assert!(
        abyss_drops > normal_drops * 3 / 2,
        "Abyss drops about twice as often: {normal_drops} against {abyss_drops}"
    );
}

#[test]
fn a_vestige_of_chosen_colours_keeps_the_gate_every_drop_keeps() {
    let dice = Dice { seed: 3, tick: 0, player: 1 };
    assert_eq!(of_colours([0, 0, 0, 1, 0], 26, &dice).0, Rarity::Legendary);
    assert_eq!(of_colours([0, 0, 0, 1, 0], 12, &dice).0, Rarity::Rare, "no Legendary below 18");
    assert_eq!(of_colours([0, 0, 0, 0, 1], 19, &dice).0, Rarity::Legendary, "no Atheric below 20");
    assert_eq!(of_colours([0, 0, 0, 1, 0], 26, &dice).2, 20, "its item at the named level");
}
