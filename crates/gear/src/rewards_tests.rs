use crate::character::{At, CARRIED_MOST, Character, VAULT_MOST};
use crate::dice::Dice;
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;
use crate::rewards::{CLEAR_VESTIGE, Clear, Foe, worth};
use crate::source::Source;
use crate::vestige;
use crate::world::Difficulty;

fn dice(seed: u64) -> Dice {
    Dice { seed, tick: 5, player: 4 }
}

fn found(character: &Character) -> usize {
    character.items.len() - Character::starting().items.len()
}

/// How many Vestiges a kill of `rank` rolls at `chance` on `seed`, sealed or Normal: a Normal one comes as an item, so
/// what was found as itself is the rest of the items.
fn rolls(chance: f64, rank: u8, seed: u64) -> usize {
    vestige::dropped(chance, rank, 20, &dice(seed)).len()
}

#[test]
fn a_kill_pays_by_its_ranks_health_against_a_majors() {
    assert_eq!([1, 2, 3, 4, 5].map(|rank| worth(Foe::Brute, rank).xp), [66, 110, 242, 440, 770]);
    assert_eq!([1, 2, 3, 4, 5].map(|rank| worth(Foe::Brute, rank).aurem), [5, 8, 18, 32, 56]);
}

#[test]
fn a_boss_always_leaves_an_item_and_a_vestige_and_a_harder_voyage_more() {
    for (difficulty, most) in [(Difficulty::Normal, 1), (Difficulty::Abyss, 2)] {
        let mut character = Character::starting();
        let vestiges = character.loot_kill(5, 20, difficulty, Source::World, &dice(1));
        let commons = rolls(vestige::chance(5) * difficulty.reward(), 5, 1) - vestiges.len();
        assert_eq!((found(&character) - commons, vestiges.len() + commons), (most, most), "{difficulty:?}");
    }
    let (mut items, mut vestiges) = (0, 0);
    for seed in 0..2_000 {
        let mut character = Character::starting();
        let left = character.loot_kill(5, 20, Difficulty::Elite, Source::World, &dice(seed)).len();
        let rolled = rolls(vestige::chance(5) * Difficulty::Elite.reward(), 5, seed);
        (items, vestiges) = (items + found(&character) - (rolled - left), vestiges + rolled);
    }
    assert!((2_800..3_200).contains(&items) && (2_800..3_200).contains(&vestiges), "one and a half each at Elite");
}

#[test]
fn a_miniboss_leaves_an_item_about_a_third_of_the_time_and_a_vestige_half_of_it_and_a_lesser_foe_no_item() {
    let (mut items, mut vestiges, mut both) = (0, 0, 0);
    for seed in 0..4_000 {
        let mut character = Character::starting();
        let sealed = character.loot_kill(4, 20, Difficulty::Normal, Source::World, &dice(seed)).len();
        let left = rolls(vestige::chance(4), 4, seed);
        let kept = found(&character) - (left - sealed);
        (items, vestiges, both) = (items + kept, vestiges + left, both + usize::from(kept > 0 && left > 0));
    }
    assert!((1_250..1_550).contains(&items) && (1_850..2_150).contains(&vestiges), "{items} {vestiges}");
    assert!((580..820).contains(&both), "rolled apart, both about one time in six: {both}");
    for rank in 1..=3 {
        let (mut kept, mut commons) = (0, 0);
        for seed in 0..500 {
            // A character each kill, so the nine and the vault never fill and post a common.
            let mut character = Character::starting();
            let sealed = character.loot_kill(rank, 20, Difficulty::Abyss, Source::World, &dice(seed)).len();
            commons += rolls(vestige::chance(rank) * Difficulty::Abyss.reward(), rank, seed) - sealed;
            kept += found(&character);
        }
        assert_eq!(kept, commons, "rank {rank} leaves no item as itself, only its Normal Vestiges'");
    }
}

#[test]
fn an_item_found_is_carried_then_vaulted_then_left_as_a_vestige_of_its_colour() {
    let mut character = Character::starting();
    let make = |id| Item::new(id, Kind::Head, Rarity::Rare, 12, Slot::Head);
    let start = character.carried_in(Slot::Head);
    for id in 0..(CARRIED_MOST - start + VAULT_MOST) as u32 {
        assert_eq!(character.keep_found(make(id), 12), None);
    }
    assert_eq!(character.carried_in(Slot::Head), CARRIED_MOST);
    assert_eq!(character.items.values().filter(|(_, at)| *at == At::Vault).count(), VAULT_MOST);
    let left = character.keep_found(make(99), 12).expect("no room left");
    assert_eq!((left.rarity, left.slot, left.level), (Rarity::Rare, Slot::Head, 12));
    // A named item opens at 20 (a cloak at 1): left as a Vestige, it takes its foe's level, not its own.
    let named = Item::new(100, Kind::Head, Rarity::Legendary, 20, Slot::Head);
    assert_eq!(character.keep_found(named, 7).expect("no room left").level, 7);
}

#[test]
fn a_cleared_node_pays_a_mission_less_than_a_dungeon_and_a_dungeon_less_than_a_world_boss() {
    let paid = |clear: Clear, level: u8, difficulty: Difficulty| {
        let mut character = Character::starting();
        character.reward_clear(clear, level, difficulty, Source::World, &dice(2));
        (character.xp, u64::from(character.materials.aurem))
    };
    assert_eq!(paid(Clear::Mission, 20, Difficulty::Normal), (1_000, 75));
    assert_eq!(paid(Clear::Dungeon, 20, Difficulty::Normal), (2_000, 150));
    assert_eq!(paid(Clear::WorldBoss, 20, Difficulty::Normal), (4_000, 300));
    for (level, difficulty) in (0..=32).flat_map(|level| Difficulty::ALL.map(|tier| (level, tier))) {
        let [mission, dungeon, world_boss] =
            [Clear::Mission, Clear::Dungeon, Clear::WorldBoss].map(|clear| paid(clear, level, difficulty));
        assert!(mission < dungeon && dungeon < world_boss, "level {level} {difficulty:?}");
    }
}

#[test]
fn a_dungeons_clear_always_leaves_an_item_coloured_as_its_minibosss_and_now_and_then_a_vestige() {
    let mut vestiges = 0;
    for seed in 0..2_000 {
        let mut character = Character::starting();
        let sealed = character.reward_clear(Clear::Dungeon, 20, Difficulty::Normal, Source::World, &dice(seed)).len();
        let rolled = rolls(CLEAR_VESTIGE, 4, seed);
        assert_eq!(found(&character) - (rolled - sealed), 1, "one item, sure");
        vestiges += rolled;
    }
    assert!((600..800).contains(&vestiges), "the clear's 35 in 100, apart from its Miniboss's 50: {vestiges}");
    for clear in [Clear::Mission, Clear::WorldBoss] {
        let mut character = Character::starting();
        assert!(character.reward_clear(clear, 20, Difficulty::Abyss, Source::World, &dice(1)).is_empty());
        assert_eq!(found(&character), 0, "{clear:?}: its pay alone; its Boss's kill leaves the loot");
    }
}
