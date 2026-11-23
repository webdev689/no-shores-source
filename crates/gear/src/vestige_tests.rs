use crate::catalogue::{Catalogue, TraitColumn, catalogue};
use crate::character::{Character, VESTIGES_MOST, Vestige};
use crate::dice::Dice;
use crate::item::NAMED_LEVEL;
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::rewards::{Foe, worth};
use crate::source::Source;
use crate::vestige::{
    ATHERIC_FROM, LEGENDARY_FROM, OPENS, chance, colours, dropped, gated, item_chance, make, of_colours, opens_to,
};
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
        "no word for a Sword",
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
fn every_rank_drops_as_the_owner_set_and_each_colour_is_half_or_less_of_the_one_below() {
    assert_eq!([1, 2, 3, 4, 5].map(chance), [0.02, 0.04, 0.10, 0.35, 1.0], "the owner's chances by rank");
    assert_eq!([1, 2, 3, 4, 5].map(item_chance), [0.0, 0.0, 0.0, 0.35, 1.0], "items from a Miniboss and a Boss");
    for rank in 1..=5 {
        let weights = colours(rank);
        assert_eq!(weights.iter().sum::<u32>(), 1_000);
        assert!(weights.windows(2).all(|pair| pair[1] * 2 <= pair[0]), "rank {rank}: far rarer each: {weights:?}");
    }
    for rank in 1..5 {
        let (lower, higher) = (colours(rank), colours(rank + 1));
        for better in 1..5 {
            let share = |weights: [u32; 5]| weights[better..].iter().sum::<u32>();
            assert!(share(higher) > share(lower), "rank {} drops colour {better} or better more often", rank + 1);
        }
    }
}

/// The share of each colour the items from a foe of `rank` come out in, at `level`: its drop's colours as the level
/// allows them, each opened as a Vestige of that colour would be.
fn opened(rank: u8, level: u8) -> [f64; 5] {
    let dropped = gated(colours(rank), level);
    let total = f64::from(dropped.iter().sum::<u32>());
    let mut out = [0.0; 5];
    for (from, weight) in dropped.iter().enumerate() {
        let opens = gated(OPENS[from], level);
        let opens_total = f64::from(opens.iter().sum::<u32>());
        for (to, share) in opens.iter().enumerate() {
            out[to] += f64::from(*weight) / total * f64::from(*share) / opens_total;
        }
    }
    out
}

#[test]
fn opened_each_colour_stays_rarer_than_the_last_and_each_rank_better_than_the_one_below_at_every_level() {
    for level in [1, 10, 17, 18, 19, 20, 30] {
        for rank in 1..=5 {
            let shares = opened(rank, level);
            assert!(shares.windows(2).all(|pair| pair[1] < pair[0] || pair[1] == 0.0), "{rank} at {level}: {shares:?}");
            assert!(level >= LEGENDARY_FROM || shares[3] == 0.0, "no Legendary below 18");
            assert!(level >= ATHERIC_FROM || shares[4] == 0.0, "no Atheric below 20");
        }
        for rank in 1..5 {
            let or_better = |shares: [f64; 5], from: usize| shares[from..].iter().sum::<f64>();
            let (lower, higher) = (opened(rank, level), opened(rank + 1, level));
            for from in 1..5 {
                let rises = or_better(higher, from) > or_better(lower, from) || or_better(higher, from) == 0.0;
                assert!(rises, "rank {} at {level}, colour {from} or better: {higher:?} over {lower:?}", rank + 1);
            }
        }
    }
}

#[test]
fn a_boss_always_leaves_a_vestige_and_the_best_colours_wait_on_the_foes_level() {
    let colours = |rank: u8, level: u8, seeds: u64| {
        let mut seen = [0_u32; 5];
        for seed in 0..seeds {
            for (rarity, _, item_level) in dropped(chance(rank), rank, level, &dice(seed)) {
                seen[rarity as usize] += 1;
                assert_eq!(item_level, level.min(NAMED_LEVEL));
            }
        }
        seen
    };
    let low_boss = colours(5, 10, 4_000);
    assert_eq!(low_boss.iter().sum::<u32>(), 4_000, "a boss always leaves one");
    assert_eq!((low_boss[3], low_boss[4]), (0, 0), "nothing past Rare at 10");
    assert!(low_boss[0] > low_boss[1] && low_boss[1] > low_boss[2], "the level's gate keeps the order: {low_boss:?}");
    let high_boss = colours(5, 25, 4_000);
    assert!(high_boss[4] > 80 && high_boss[4] < 200, "about 32 in 1,000 Atheric: {high_boss:?}");
    let minors = colours(1, 30, 20_000);
    let dropped_count: u32 = minors.iter().sum();
    assert!((340..460).contains(&dropped_count), "2 in 100 from a Minor: {dropped_count}");
    assert!(minors[4] <= 5, "a Minor all but never leaves an Atheric: {minors:?}");
}

#[test]
fn a_chance_past_one_leaves_one_sure_and_another_by_what_is_over() {
    let count = |chance: f64| (0..4_000).map(|seed| dropped(chance, 5, 20, &dice(seed)).len()).sum::<usize>();
    assert_eq!(count(1.0), 4_000);
    assert_eq!(count(2.0), 8_000);
    assert!((5_800..6_200).contains(&count(1.5)), "one and a half on average: {}", count(1.5));
    assert_eq!(count(0.0), 0);
}

#[test]
fn a_vestige_opens_to_its_own_colour_most_often_now_and_then_below_and_rarely_above() {
    let opened = |colour: Rarity| {
        let mut seen = [0_u32; 5];
        for seed in 0..10_000 {
            seen[opens_to(colour, NAMED_LEVEL, &dice(seed)) as usize] += 1;
        }
        seen
    };
    for colour in [Rarity::Magic, Rarity::Rare, Rarity::Legendary] {
        let seen = opened(colour);
        let own = colour as usize;
        assert!((7_200..7_800).contains(&seen[own]), "three in four open {colour:?}: {seen:?}");
        assert!((1_700..2_300).contains(&seen[own - 1]), "one in five open below {colour:?}: {seen:?}");
        assert!((300..700).contains(&seen[own + 1]), "one in twenty open above {colour:?}: {seen:?}");
        assert_eq!(seen.iter().sum::<u32>(), seen[own - 1] + seen[own] + seen[own + 1], "one colour away at most");
    }
    let atheric = opened(Rarity::Atheric);
    assert!(atheric[3] > 1_500 && atheric[3] < 2_500, "even an Atheric can open below its colour: {atheric:?}");
    let normal = opened(Rarity::Normal);
    assert!(normal[0] > 9_000 && normal[1] > 0, "a Normal opens Normal, now and then Magic: {normal:?}");
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
                let item = make(9, rarity, slot, 12, Source::World, &dice(seed))
                    .expect("every slot and rarity makes something");
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
                if rarity == Rarity::Atheric {
                    assert_eq!(item.level, NAMED_LEVEL);
                    let named = catalogue().named(item.named.as_deref().expect("a named item")).expect("in it");
                    assert!(!named.breach, "Breach items come from Breaches alone");
                } else {
                    assert_eq!(item.level, if rarity == Rarity::Legendary { NAMED_LEVEL } else { 12 });
                    assert!(item.named.is_none() && item.name < 3, "a rolled look: {}", item.name);
                    let pooled = |id: &String| {
                        catalogue().trait_def(id).is_some_and(|found| found.column != TraitColumn::Signature)
                    };
                    assert!(item.layout.iter().flatten().all(pooled));
                }
            }
        }
    }
    assert_eq!(
        make(1, Rarity::Rare, Slot::Arms, 5, Source::World, &dice(4)),
        make(1, Rarity::Rare, Slot::Arms, 5, Source::World, &dice(4))
    );
}

#[test]
fn a_kill_pays_every_player_who_struck_by_the_foes_kind_rank_and_level() {
    let mut character = Character::starting();
    let reward = character.reward_kill(Foe::Swordsman, 2, 5, Some(Slot::Melee), Difficulty::Normal);
    assert_eq!((reward.xp, reward.aurem), (95, 7), "a Major swordsman's worth at level 5");
    let boss = character.reward_kill(Foe::Captain, 5, 15, None, Difficulty::Normal);
    assert_eq!(
        (boss.xp, boss.aurem),
        (1_680, 112),
        "a Boss captain's at level 15: a Major's 120 and 8, times 7, twice"
    );
    assert_eq!(character.xp, 1_775);
    assert_eq!(character.materials.aurem, 119);
}

#[test]
fn a_higher_rank_always_pays_more_than_the_rank_below_whatever_their_kinds_levels_and_tiers() {
    let kinds = [Foe::Skirmisher, Foe::Archer, Foe::Swordsman, Foe::Brute, Foe::Captain];
    let paid = |kind: Foe, rank: u8, level: u8, difficulty: Difficulty| {
        let reward = Character::starting().reward_kill(kind, rank, level, None, difficulty);
        (reward.xp, reward.aurem)
    };
    for (rank, level, difficulty) in
        (1..5).flat_map(|rank| (0..=32).flat_map(move |level| Difficulty::ALL.map(|tier| (rank, level, tier))))
    {
        let below = kinds.map(|kind| paid(kind, rank, level, difficulty));
        let above = kinds.map(|kind| paid(kind, rank + 1, level, difficulty));
        let (xp_below, aurem_below) = (below.map(|pay| pay.0), below.map(|pay| pay.1));
        let (xp_above, aurem_above) = (above.map(|pay| pay.0), above.map(|pay| pay.1));
        let fits = xp_above.iter().min() > xp_below.iter().max() && aurem_above.iter().min() > aurem_below.iter().max();
        assert!(fits, "rank {} at level {level} {difficulty:?}: {above:?} over {below:?}", rank + 1);
        assert!(kinds.iter().all(|kind| worth(*kind, rank + 1).vestige > worth(*kind, rank).vestige));
    }
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
    let paid = normal.reward_kill(Foe::Swordsman, 2, 5, None, Difficulty::Normal);
    let harder = abyss.reward_kill(Foe::Swordsman, 2, 5, None, Difficulty::Abyss);
    assert_eq!((harder.xp, harder.aurem), (paid.xp * 2, paid.aurem * 2));
    let drops = |difficulty: Difficulty| {
        (0..2_000)
            .filter(|seed| !Character::starting().loot_kill(3, 10, difficulty, Source::World, &dice(*seed)).is_empty())
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
