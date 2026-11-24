//! A Normal piece drops as itself, never sealed: wherever a Vestige of Normal colour would come, its item comes
//! instead, at the same chance, kept as a found item is; and a Normal Vestige a save already holds still opens.

use crate::activities::Weekly;
use crate::asks::{Ask, Done, Here};
use crate::character::{At, CARRIED_MOST, Character, VAULT_MOST, Vestige};
use crate::dice::Dice;
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::mail::Source as MailSource;
use crate::playlist::Playlist;
use crate::rarity::Rarity;
use crate::source::Source;
use crate::vestige;
use crate::world::Difficulty;

fn dice(seed: u64) -> Dice {
    Dice { seed, tick: 5, player: 4 }
}

/// The items a character holds that `Character::starting` does not, by rarity.
fn new_items(character: &Character) -> Vec<&Item> {
    let starting = Character::starting();
    character.items.iter().filter(|(id, _)| !starting.items.contains_key(id)).map(|(_, (item, _))| item).collect()
}

/// What a reward paid between `before` and `after`: the Vestiges it returned and the items it kept, each as its
/// colour, slot and level, so a test reads a Normal roll's item where its Vestige would have been.
pub(crate) fn paid(before: &Character, after: &Character, vestiges: &[Vestige]) -> Vec<(Rarity, Slot, u8)> {
    let sealed = vestiges.iter().map(|vestige| (vestige.rarity, vestige.slot, vestige.level));
    let kept = after.items.iter().filter(|(id, _)| !before.items.contains_key(id)).map(|(_, (item, _))| item);
    sealed.chain(kept.map(|item| (item.rarity, item.bucket, item.level))).collect()
}

fn no_normal_vestige(character: &Character, what: &str) {
    assert!(character.vestiges.values().all(|(vestige, _)| vestige.rarity > Rarity::Normal), "{what} kept a Normal");
}

#[test]
fn a_kill_gives_its_normal_vestiges_as_items_at_the_same_chance_and_seals_the_rest() {
    // Ranks below a Miniboss leave no item as itself, so each new item is a Vestige roll that came out Normal.
    let (mut normals, mut sealed) = (0, 0);
    for rank in 1..=3 {
        for seed in 0..3_000 {
            let mut character = Character::starting();
            let rolled = vestige::dropped(vestige::chance(rank), rank, 12, &dice(seed));
            let laid = character.loot_kill(rank, 12, Difficulty::Normal, Source::World, &dice(seed));
            let want: Vec<Rarity> =
                rolled.iter().map(|(rarity, ..)| *rarity).filter(|rarity| *rarity > Rarity::Normal).collect();
            assert_eq!(laid.iter().map(|vestige| vestige.rarity).collect::<Vec<_>>(), want, "rank {rank} seed {seed}");
            let items = new_items(&character);
            assert_eq!(items.len(), rolled.len() - want.len(), "rank {rank} seed {seed}");
            for item in items {
                assert_eq!((item.rarity, item.level, item.source), (Rarity::Normal, 12, Source::World));
            }
            normals += rolled.len() - want.len();
            sealed += want.len();
        }
    }
    assert!(normals > sealed, "Normal is the likeliest colour: {normals} items, {sealed} Vestiges");
}

#[test]
fn a_boss_never_lays_a_normal_vestige_and_its_normal_rolls_come_as_items() {
    for seed in 0..2_000 {
        let mut character = Character::starting();
        let laid = character.loot_kill(5, 20, Difficulty::Normal, Source::Dungeon, &dice(seed));
        assert!(laid.iter().all(|vestige| vestige.rarity > Rarity::Normal), "seed {seed}");
        no_normal_vestige(&character, "a Boss's kill");
    }
}

#[test]
fn a_normal_item_with_no_room_goes_to_the_mail_as_itself() {
    let mut character = Character::starting();
    let make = |id| Item::new(id, Kind::Head, Rarity::Normal, 12, Slot::Head);
    let start = character.carried_in(Slot::Head);
    for id in 0..(CARRIED_MOST - start + VAULT_MOST) as u32 {
        assert_eq!(character.keep_found(make(id), 12), None);
    }
    assert_eq!(character.keep_found(make(99), 12), None, "no Vestige is made of a common");
    let letter = character.mail.last().expect("posted");
    assert_eq!(letter.from, MailSource::Found as u8);
    assert_eq!(letter.item.as_ref().map(|item| item.rarity), Some(Rarity::Normal));
    assert!(letter.vestige.is_none());
    // A Vestige rolling Normal with no room comes the same way, as itself to the mail.
    let letters = character.mail.len();
    assert_eq!(character.unsealed((Rarity::Normal, Slot::Head, 12), Source::World, &dice(1)), None);
    assert_eq!(character.mail.len(), letters + 1);
    assert_eq!(
        character.mail.last().and_then(|letter| letter.item.as_ref()).map(|item| item.rarity),
        Some(Rarity::Normal)
    );
    // A Rare with no room is still laid as a Vestige of its colour.
    let rare = Item::new(100, Kind::Head, Rarity::Rare, 12, Slot::Head);
    assert_eq!(character.keep_found(rare, 12).map(|vestige| vestige.rarity), Some(Rarity::Rare));
}

#[test]
fn a_chest_holds_its_normal_roll_as_an_item_and_never_a_normal_vestige() {
    let (mut items, mut vestiges) = (0, 0);
    for tick in 0..400 {
        let mut character = Character::starting();
        let chest = character
            .open_chest(1, (12, Difficulty::Normal, 0), None, &Dice { tick, ..dice(7) })
            .expect("a chest of tier 1");
        no_normal_vestige(&character, "a chest");
        match chest.vestige {
            Some(vestige) => {
                assert!(vestige.rarity > Rarity::Normal);
                vestiges += 1;
            }
            None => {
                let found = new_items(&character);
                assert_eq!(found.len(), 1, "tick {tick}");
                assert_eq!((found[0].rarity, found[0].level), (Rarity::Normal, 12));
                items += 1;
            }
        }
    }
    assert!(items > 0 && vestiges > 0, "{items} items, {vestiges} Vestiges");
}

#[test]
fn a_first_clears_normal_roll_is_kept_as_an_item() {
    let (mut items, mut vestiges) = (0, 0);
    for seed in 0..400 {
        let mut day = Character::starting();
        let paid = day.clear_of_the_day(0, Difficulty::Normal, 12, &dice(seed)).expect("the day's first clear");
        let mut playlist = Character::starting();
        let played = playlist.playlist_of_the_day(0, Playlist::Elite, 12, &dice(seed)).expect("the day's first");
        for (character, paid) in [(&day, paid), (&playlist, played)] {
            no_normal_vestige(character, "a clear");
            match paid {
                Some(vestige) => {
                    assert!(vestige.rarity > Rarity::Normal);
                    vestiges += 1;
                }
                None => {
                    let found = new_items(character);
                    assert_eq!(found.iter().map(|item| item.rarity).collect::<Vec<_>>(), [Rarity::Normal]);
                    assert_eq!(found[0].level, 12);
                    items += 1;
                }
            }
        }
        let mut weekly = Character::starting();
        for _ in 0..crate::playlist::WEEK_CLEARS {
            for vestige in weekly.playlist_of_the_week(0, Playlist::Elite, 12, &dice(seed)) {
                assert!(vestige.rarity > Rarity::Normal);
            }
        }
        no_normal_vestige(&weekly, "a playlist's week");
        let mut abyss = Character::starting();
        let paid = abyss.clear_of_the_week(0, Weekly::Abyss, &dice(seed)).expect("the week's first clear");
        assert!(paid.rarity > Rarity::Normal);
    }
    assert!(items > 0 && vestiges > 0, "{items} items, {vestiges} Vestiges");
}

#[test]
fn a_normal_vestige_a_save_holds_still_opens() {
    let town = Here { social: true, ..Here::default() };
    let mut character = Character::starting();
    let id = character.take_id();
    character.vestiges.insert(id, (Vestige::new(id, Rarity::Normal, Slot::Head, 9), false));
    let Ok(Done::Identified(item)) = character.ask(Ask::Identify { vestige: id }, town, &dice(3)) else {
        panic!("a Normal Vestige opens");
    };
    let (item, at) = &character.items[&item];
    assert_eq!((item.bucket, item.level, *at), (Slot::Head, 9, At::Carried));
    assert!(item.rarity <= Rarity::Magic, "a Normal Vestige opens to Normal, or now and then Magic");
    assert!(!character.vestiges.contains_key(&id));
}
