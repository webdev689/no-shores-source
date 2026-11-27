//! The keepers' gifts on the opening's round of Overlook: each keeper spoken with gives one, fitting what their
//! counter does, as their goal's reward (`"gift"` in `content/quests/quests.json`). The Weaponsmith's is a choice: one
//! Melee and one Ranged piece of her starter stock, free at her counter. The Armorsmith gives the four starter armour
//! pieces; the Mage a sealed Vestige to open; the Vault Keeper a cloak laid in the vault; the Tailor a dye; the
//! Postmaster a letter holding a sealed Vestige. Each is given once a character, kept by name in the quest log, so a
//! reload, a rejoin or a later round never gives it twice. One who pledges before the round reaches a keeper is given
//! that keeper's gift as they pledge, as the Tack gives the Bay; the house pledged to gives its own
//! (`give_house_piece`).

use crate::character::{At, CARRIED_MOST, Character, VAULT_MOST, Vestige};
use crate::dice::Dice;
use crate::item::{Item, NAMED_LEVEL};
use crate::kinds::{Kind, Slot};
use crate::mail::{Posted, Source};
use crate::quests::quests;
use crate::rarity::Rarity;
use crate::vendor::{self, Vendor};
use serde::Deserialize;

/// A keeper's gift, by its name in the quests' file.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Gift {
    /// The Weaponsmith's: one Melee and one Ranged piece of her starter stock, chosen at her counter, free.
    Weapons,
    /// The Armorsmith's: her starter stock's head, torso, arms and legs.
    Armour,
    /// The Mage's: a sealed Vestige, for her to open.
    Vestige,
    /// The Vault Keeper's: a cloak, laid in the vault to be taken out.
    Cloak,
    /// The Tailor's: a dye (`TAILORS_DYE`), kept to be worn.
    Dye,
    /// The Postmaster's: a letter in the mail holding a sealed Vestige.
    Letter,
}

impl Gift {
    /// Its name, as the file writes it and the quest log keeps it given.
    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            Gift::Weapons => "weapons",
            Gift::Armour => "armour",
            Gift::Vestige => "vestige",
            Gift::Cloak => "cloak",
            Gift::Dye => "dye",
            Gift::Letter => "letter",
        }
    }
}

/// The dye the Tailor gives: Harbour Blue, Overlook's own harbour.
pub const TAILORS_DYE: &str = "harbour_blue";
/// The rarity of the Mage's Vestige and the Postmaster's: Magic, the first a Vestige is sealed at.
pub const GIFT_VESTIGE: Rarity = Rarity::Magic;
/// The slots the Mage's Vestige and the Postmaster's open to: armour, so neither takes the place of the weapons chosen.
pub const MAGES_SLOT: Slot = Slot::Head;
pub const POSTMASTERS_SLOT: Slot = Slot::Legs;

impl Character {
    /// Whether a keeper's gift has been given.
    #[must_use]
    pub fn given(&self, gift: Gift) -> bool {
        self.quests.gifts.iter().any(|given| given == gift.key())
    }

    /// Gives a keeper's gift at the player's level, unless given before.
    pub(crate) fn give_gift(&mut self, gift: Gift) {
        if self.given(gift) {
            return;
        }
        self.quests.gifts.push(gift.key().to_owned());
        let level = self.level().clamp(1, NAMED_LEVEL);
        match gift {
            Gift::Weapons => {
                for slot in [Slot::Melee, Slot::Ranged] {
                    if !self.quests.free.contains(&slot) {
                        self.quests.free.push(slot);
                    }
                }
            }
            Gift::Armour => {
                for kind in Vendor::Armorsmith.starter_kinds() {
                    // Normal, so with its slot and the vault full it is posted as itself, never lost.
                    self.keep_found(Item::new(0, *kind, Rarity::Normal, level, kind.slot()), level);
                }
            }
            Gift::Vestige => {
                self.carry_or_post(Vestige::new(0, GIFT_VESTIGE, MAGES_SLOT, level), Source::Gift);
            }
            Gift::Cloak => {
                let cloak = Item::new(0, Kind::Cloak, Rarity::Normal, level, Slot::Cloak);
                if self.vaulted(cloak.kind.stock()) < VAULT_MOST {
                    let id = self.take_id();
                    self.items.insert(id, (Item { id, ..cloak }, At::Vault));
                } else {
                    self.keep_found(cloak, level);
                }
            }
            Gift::Dye => self.keep_cosmetic(TAILORS_DYE),
            Gift::Letter => {
                self.post(Source::Gift, Posted::Vestige(Vestige::new(0, GIFT_VESTIGE, POSTMASTERS_SLOT, level)));
            }
        }
    }

    /// Whether a smith's ware is the Weaponsmith's gift: a piece of her starter stock for a slot still owed free.
    #[must_use]
    pub fn ware_given(&self, vendor: Vendor, ware: &Item) -> bool {
        vendor == Vendor::Weaponsmith && ware.rarity == Rarity::Normal && self.quests.free.contains(&ware.kind.slot())
    }

    /// What a smith's ware costs this player, in Aurem: nothing while it is the Weaponsmith's gift, else its price.
    #[must_use]
    pub fn ware_price(&self, vendor: Vendor, ware: &Item) -> u32 {
        if self.ware_given(vendor, ware) { 0 } else { vendor::price(ware.rarity) }
    }

    /// Gives each gift of a goal met on the task the player is on and not yet given: a save kept partway round the
    /// counters before the keepers gave gifts is paid for the keepers it has heard. One past the round is owed none.
    pub(crate) fn give_gifts_due(&mut self) {
        let Some((quest, task)) = self.quest_now() else { return };
        let Some(def) = quests().quests[quest].tasks.get(task) else { return };
        let counts = self.quest_counts();
        let met = def.goals.iter().zip(counts).filter(|(goal, count)| *count >= goal.count);
        let due: Vec<Gift> = met.filter_map(|(goal, _)| goal.reward.gift).collect();
        for gift in due {
            self.give_gift(gift);
        }
    }

    /// Gives, as the player first pledges, every gift the opening still holds for them on its tasks from the one they
    /// are on, as the keepers the pledge leaves unheard would have given them.
    pub(crate) fn give_gifts_ahead(&mut self) {
        let Some((quest, task)) = self.quest_now() else { return };
        let def = &quests().quests[quest];
        if def.faction != 0 {
            return;
        }
        let ahead = def.tasks[task..].iter().flat_map(|task| task.goals.iter().map(|goal| goal.reward));
        let gifts: Vec<Gift> =
            ahead.chain(def.tasks[task..].iter().map(|task| task.reward)).filter_map(|it| it.gift).collect();
        for gift in gifts {
            self.give_gift(gift);
        }
    }

    /// Gives the house pledged to's own torso piece as the pledge is taken: its look and name (its catalogue entry,
    /// `named`), made at Magic at the player's level and rolled as any Magic torso is, once a character for each house,
    /// kept given by the entry's name beside the keepers' gifts. Carried, else laid in the vault, else posted as
    /// itself, never lost. The catalogue's entry stays the Legendary the house sells.
    pub(crate) fn give_house_piece(&mut self, faction: u8, dice: &Dice) {
        let Some(def) = crate::factions::factions().faction(faction) else { return };
        let wares = crate::factions::wares(faction);
        let Some(named) =
            wares.iter().find(|named| named.kind == Kind::Torso && named.faction.as_ref() == Some(&def.key))
        else {
            return;
        };
        if self.quests.gifts.contains(&named.id) {
            return;
        }
        let level = self.level().clamp(1, NAMED_LEVEL);
        let piece = crate::vestige::house_piece(0, named, Rarity::Magic, level, dice);
        self.quests.gifts.push(named.id.clone());
        let at = if self.carried_in(Slot::Torso) < CARRIED_MOST {
            At::Carried
        } else if self.vaulted(piece.kind.stock()) < VAULT_MOST {
            At::Vault
        } else {
            self.post(Source::Gift, Posted::Item(piece));
            return;
        };
        let id = self.take_id();
        self.items.insert(id, (Item { id, ..piece }, at));
    }
}
