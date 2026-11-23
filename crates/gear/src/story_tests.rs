use crate::arts::{ALL_EARNED, STORM};
use crate::dice::Dice;
use crate::horses::FIRST_HORSE;
use crate::story::story_item;
use crate::vendor::{self, Vendor};
use crate::{Ask, At, Character, Here, Item, Kind, Rarity, Slot};

const DICE: Dice = Dice { seed: 3, tick: 1, player: 1 };

/// A character in the prologue: the story's armour worn, its sword and shield carried, its bow in the vault; beside
/// them pieces of their own (one carried, one in the vault, a starter piece bought), a horse worn and one carried,
/// Aurem, and the Storm worn and earned.
fn in_the_prologue() -> (Character, u32) {
    let mut character = Character::starting();
    character.story.prologue = false;
    character.materials.aurem = 450;
    let ware = vendor::stock(Vendor::Armorsmith, 4, character.level())
        .iter()
        .position(|item| item.kind == Kind::Head && item.rarity == Rarity::Normal);
    let ware = u8::try_from(ware.expect("a starter helm")).expect("a ware number");
    let social = Here { social: true, day: 4, ..Here::default() };
    character.ask(Ask::Vend { vendor: Vendor::Armorsmith, ware, day: 4 }, social, &DICE).expect("bought");
    character.give_horse(FIRST_HORSE, true);
    character.give_horse(FIRST_HORSE, false);
    for (kind, at) in
        [(Kind::Torso, At::Worn(Slot::Torso)), (Kind::SwordAndShield, At::Carried), (Kind::Bow, At::Vault)]
    {
        let id = character.take_id();
        character.items.insert(id, (story_item(id, kind), at));
    }
    let own = character.take_id();
    character.items.insert(own, (Item::new(own, Kind::Mace, Rarity::Normal, 1, Slot::Melee), At::Carried));
    let vaulted = character.take_id();
    character.items.insert(vaulted, (Item::new(vaulted, Kind::Legs, Rarity::Magic, 1, Slot::Legs), At::Vault));
    character.arts.worn = STORM;
    let at = usize::from(STORM) - 1;
    (character.arts.levels[at], character.arts.xp[at], character.arts.cores[at][0]) = (2, 40, Some(1));
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
    let mut others = character.items.clone();
    others.retain(|_, (item, _)| !item.story);
    assert_eq!(
        others.len(),
        Character::starting().items.len() + 5,
        "the helm bought, two horses, the mace and the vaulted legs"
    );
    character.ask(Ask::FinishPrologue, Here::default(), &DICE).expect("asked");
    assert!(character.items.values().all(|(item, _)| !item.story), "worn, carried and vaulted alike");
    assert_eq!(character.items, others, "their own kept, each where it lay");
    assert!(character.items.contains_key(&own));
    assert!(character.may_ride() && character.keeps_horse(FIRST_HORSE), "the horses kept");
    assert_eq!(character.materials.aurem, 400, "the Aurem kept");
    assert_eq!(character.earned(STORM), 0, "the Storm unearned");
    assert!(character.worn_art().is_none(), "and unworn");
    let at = usize::from(STORM) - 1;
    assert_eq!((character.arts.levels[at], character.arts.xp[at]), (1, 0), "nothing it grew kept");
    assert!(character.arts.cores[at].iter().all(Option::is_none));
}

#[test]
fn a_character_that_finished_the_prologue_before_keeps_what_it_has() {
    let (mut character, _) = in_the_prologue();
    character.story.prologue = true;
    let before = character.clone();
    character.ask(Ask::FinishPrologue, Here::default(), &DICE).expect("asked");
    assert_eq!(character, before);
}
