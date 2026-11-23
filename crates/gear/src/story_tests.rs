use crate::arts::{ALL_EARNED, STORM};
use crate::dice::Dice;
use crate::story::story_item;
use crate::{Ask, At, Character, Here, Item, Kind, Rarity, Slot};

const DICE: Dice = Dice { seed: 3, tick: 1, player: 1 };

/// A character in the prologue: the story's armour worn, its sword and shield carried, its bow in the vault, a
/// piece of their own beside them, and the Storm worn and earned.
fn in_the_prologue() -> (Character, u32) {
    let mut character = Character::starting();
    character.story.prologue = false;
    for (kind, at) in
        [(Kind::Torso, At::Worn(Slot::Torso)), (Kind::SwordAndShield, At::Carried), (Kind::Bow, At::Vault)]
    {
        let id = character.take_id();
        character.items.insert(id, (story_item(id, kind), at));
    }
    let own = character.take_id();
    character.items.insert(own, (Item::new(own, Kind::Mace, Rarity::Normal, 1, Slot::Melee), At::Carried));
    character.arts.worn = STORM;
    character.arts.earned.get_or_insert_with(Vec::new).resize(usize::from(STORM), 0);
    if let Some(bits) = character.arts.earned.as_mut().and_then(|earned| earned.get_mut(usize::from(STORM) - 1)) {
        *bits = ALL_EARNED;
    }
    (character, own)
}

#[test]
fn a_story_item_is_normal_of_level_one_and_marked_the_story_s() {
    let item = story_item(4, Kind::Legs);
    assert_eq!(
        (item.id, item.kind, item.rarity, item.level, item.bucket),
        (4, Kind::Legs, Rarity::Normal, 1, Slot::Legs)
    );
    assert!(item.story);
    assert!(!Item::new(5, Kind::Legs, Rarity::Normal, 1, Slot::Legs).story, "a plain item is not");
}

#[test]
fn the_prologue_s_end_takes_back_every_story_item_wherever_it_lies_and_the_storm_and_nothing_else() {
    let (mut character, own) = in_the_prologue();
    let others: Vec<u32> = character.items.iter().filter(|(_, (item, _))| !item.story).map(|(id, _)| *id).collect();
    character.ask(Ask::FinishPrologue, Here::default(), &DICE).expect("asked");
    assert!(character.items.values().all(|(item, _)| !item.story), "worn, carried and vaulted alike");
    let left: Vec<u32> = character.items.keys().copied().collect();
    assert_eq!(left, others, "their own kept");
    assert!(character.items.contains_key(&own));
    assert_eq!(character.earned(STORM), 0, "the Storm unearned");
    assert!(character.worn_art().is_none(), "and unworn");
}

#[test]
fn a_character_that_finished_the_prologue_before_keeps_what_it_has() {
    let (mut character, _) = in_the_prologue();
    character.story.prologue = true;
    let before = character.clone();
    character.ask(Ask::FinishPrologue, Here::default(), &DICE).expect("asked");
    assert_eq!(character, before);
}
