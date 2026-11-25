//! The Test Ground's grants: gear handed out to try (a Vestige, a named piece, an item of any kind and rarity it may
//! roll, a loadout worn), statuses laid on a player or the foes, and the Arts made ready.

use crate::asks::answer_code;
use crate::{Grant, PlayerId, Room};
use gear::dice::Dice;
use gear::{Ask, Here, Item, Kind, Rarity, Refusal, Slot};

impl Room {
    pub(crate) fn grant(&mut self, player: PlayerId, grant: Grant) -> u8 {
        if let Grant::Status { status, on_foes, ticks } = grant {
            self.grant_status(player, status, on_foes, ticks);
            return 0;
        }
        if grant == Grant::ArtsReady {
            self.ready_arts(player);
            return 0;
        }
        let dice = self.dice(player);
        let Some(found) = self.players.get_mut(&player) else { return 0 };
        let character = &mut found.character;
        match grant {
            Grant::Vestige { rarity, slot, level } => {
                // A Normal one comes as its item, as every Normal drop does, kept as a found item is.
                let rolled = (rarity, slot, level.clamp(1, gear::item::ITEM_LEVEL_MOST));
                let unsealed = character.unsealed(rolled, gear::Source::World, &dice);
                if unsealed.is_some_and(|vestige| !character.pick_up(vestige)) {
                    return answer_code(Err(Refusal::VestigesFull));
                }
            }
            Grant::Named(named) => {
                let Some(def) = gear::catalogue::catalogue().named(&named) else {
                    return answer_code(Err(Refusal::NoSuchItem));
                };
                let item = gear::vestige::made_named(character.take_id(), def, def.kind.slot(), &dice);
                return carry(character, item);
            }
            Grant::Item { kind, rarity, level } => {
                // A horse is bought at the Tack, Normal and of its coat (`gear::horses`), never handed out.
                if rarity == Rarity::Atheric
                    || kind == Kind::Cloak
                    || kind == Kind::Horse
                    || (kind.module() && rarity == Rarity::Legendary)
                {
                    return answer_code(Err(Refusal::NoSuchItem));
                }
                let mut item = gear::vestige::rolled(character.take_id(), kind, rarity, kind.slot(), level, &dice);
                item.element = gear::element::rolled(kind, rarity, &dice);
                return carry(character, item);
            }
            Grant::Worn(kind) => return wear_kind(character, kind, &dice),
            Grant::Materials(count) => {
                use gear::character::Stuff;
                use gear::kinds::Stock;
                character.materials.add_aurem(u32::from(count) * 100);
                for stuff in [
                    Stuff::Fragments(Stock::Weapon),
                    Stuff::Fragments(Stock::Armor),
                    Stuff::Essence(Stock::Weapon),
                    Stuff::Essence(Stock::Armor),
                    Stuff::Fruit,
                ] {
                    character.materials.add(stuff, count);
                }
                for resource in 0..gear::catalogue::catalogue().resources.len() {
                    character.materials.add(Stuff::Resource(resource), count);
                }
            }
            Grant::Xp(xp) => character.earn_xp(xp, None),
            Grant::Ammo(share) => character.ammo = share.min(gear::ammo::AMMO_FULL),
            Grant::Crates(count) => {
                for _ in 0..count.min(gear::ammo::CRATES_MOST) {
                    character.take_crate();
                }
            }
            Grant::Officers(level) => {
                use gear::crew::{ASHORE_MOST, Duty, Officer, Post};
                for post in [Post::FirstMate, Post::Bosun] {
                    let mut officer = Officer::new(0, post, gear::Rarity::Magic, level);
                    (officer.given, officer.family) = (post as u8 * 5, post as u8 * 3);
                    let ashore = character.crew.ashore().count() < ASHORE_MOST;
                    let signed = character.sign_on(officer).and_then(|id| character.crew.officers.get_mut(&id));
                    if let Some(signed) = signed.filter(|_| ashore) {
                        signed.duty = Duty::Ashore;
                    }
                }
            }
            Grant::ArtLevel { art, level } => {
                use gear::arts::{FRAGMENTS, LEVEL_MOST, arts};
                let Some(at) = arts().arts.iter().position(|found| found.id == art) else {
                    return gear::arts::ArtRefusal::NoSuchArt as u8;
                };
                character.arts = std::mem::take(&mut character.arts).kept();
                character.arts.levels[at] = level.clamp(1, LEVEL_MOST);
                character.arts.xp[at] = 0;
                if let Some(owned) = character.arts.owned.as_mut() {
                    owned[at] = (1 << FRAGMENTS) - 1;
                }
            }
            Grant::Status { .. } | Grant::ArtsReady => {}
        }
        0
    }
}

/// Wears a loadout of `kind`: the one worn already, else the first carried that the wear ask takes, else a Normal one
/// of the character's level handed out; refused for anything but a Melee or a Ranged kind.
fn wear_kind(character: &mut gear::Character, kind: Kind, dice: &Dice) -> u8 {
    let slot = kind.slot();
    if !matches!(slot, Slot::Melee | Slot::Ranged) {
        return answer_code(Err(Refusal::NoSuchItem));
    }
    if character.worn(slot).is_some_and(|item| item.kind == kind) {
        return 0;
    }
    // The wear ask judges each one carried by its own rules (its level, one Atheric) and changes nothing if it refuses.
    let wear = |character: &mut gear::Character, item| character.ask(Ask::Wear { item, slot }, Here::default(), dice);
    let carried: Vec<u32> = character
        .items
        .values()
        .filter(|(item, at)| item.kind == kind && *at == gear::At::Carried)
        .map(|(item, _)| item.id)
        .collect();
    if carried.into_iter().any(|id| wear(character, id).is_ok()) {
        return 0;
    }
    let mut item = gear::vestige::rolled(character.take_id(), kind, Rarity::Normal, slot, character.level(), dice);
    item.element = gear::element::rolled(kind, Rarity::Normal, dice);
    let id = item.id;
    let code = carry(character, item);
    if code != 0 {
        return code;
    }
    answer_code(wear(character, id).map(|_| ()))
}

/// Carries a granted item, if its slot has room.
fn carry(character: &mut gear::Character, item: Item) -> u8 {
    if character.carried_in(item.bucket) >= gear::character::CARRIED_MOST {
        return answer_code(Err(Refusal::CarriedFull));
    }
    character.items.insert(item.id, (item, gear::At::Carried));
    0
}
