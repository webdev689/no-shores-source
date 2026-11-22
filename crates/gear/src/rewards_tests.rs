use crate::character::{At, CARRIED_MOST, Character, VAULT_MOST};
use crate::dice::Dice;
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;
use crate::rewards::{Clear, Foe, worth};
use crate::source::Source;
use crate::world::Difficulty;

fn dice(seed: u64) -> Dice {
    Dice { seed, tick: 5, player: 4 }
}

fn found(character: &Character) -> usize {
    character.items.len() - Character::starting().items.len()
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
        assert_eq!((found(&character), vestiges.len()), (most, most), "{difficulty:?}");
    }
    let (mut items, mut vestiges) = (0, 0);
    for seed in 0..2_000 {
        let mut character = Character::starting();
        vestiges += character.loot_kill(5, 20, Difficulty::Elite, Source::World, &dice(seed)).len();
        items += found(&character);
    }
    assert!((2_800..3_200).contains(&items) && (2_800..3_200).contains(&vestiges), "one and a half each at Elite");
}

#[test]
fn a_miniboss_leaves_an_item_and_a_vestige_each_about_a_third_of_the_time_and_a_lesser_foe_no_item() {
    let (mut items, mut vestiges, mut both) = (0, 0, 0);
    for seed in 0..4_000 {
        let mut character = Character::starting();
        let left = character.loot_kill(4, 20, Difficulty::Normal, Source::World, &dice(seed)).len();
        let kept = found(&character);
        (items, vestiges, both) = (items + kept, vestiges + left, both + usize::from(kept > 0 && left > 0));
    }
    assert!((1_250..1_550).contains(&items) && (1_250..1_550).contains(&vestiges), "{items} {vestiges}");
    assert!((380..620).contains(&both), "rolled apart, both about one time in eight: {both}");
    for rank in 1..=3 {
        let mut character = Character::starting();
        for seed in 0..500 {
            character.loot_kill(rank, 20, Difficulty::Abyss, Source::World, &dice(seed));
        }
        assert_eq!(found(&character), 0, "rank {rank} leaves no item as itself");
    }
}

#[test]
fn an_item_found_is_carried_then_vaulted_then_left_as_a_vestige_of_its_colour() {
    let mut character = Character::starting();
    let make = |id| Item::new(id, Kind::Head, Rarity::Rare, 12, Slot::Head);
    let start = character.carried_in(Slot::Head);
    for id in 0..(CARRIED_MOST - start + VAULT_MOST) as u32 {
        assert_eq!(character.keep_found(make(id)), None);
    }
    assert_eq!(character.carried_in(Slot::Head), CARRIED_MOST);
    assert_eq!(character.items.values().filter(|(_, at)| *at == At::Vault).count(), VAULT_MOST);
    let left = character.keep_found(make(99)).expect("no room left");
    assert_eq!((left.rarity, left.slot, left.level), (Rarity::Rare, Slot::Head, 12));
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
        vestiges += character.reward_clear(Clear::Dungeon, 20, Difficulty::Normal, Source::World, &dice(seed)).len();
        assert_eq!(found(&character), 1, "one item, sure");
    }
    assert!((600..800).contains(&vestiges), "a Miniboss's 35 in 100: {vestiges}");
    for clear in [Clear::Mission, Clear::WorldBoss] {
        let mut character = Character::starting();
        assert!(character.reward_clear(clear, 20, Difficulty::Abyss, Source::World, &dice(1)).is_empty());
        assert_eq!(found(&character), 0, "{clear:?}: its pay alone; its Boss's kill leaves the loot");
    }
}
