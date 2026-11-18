//! What a player asks of their gear, and the rules each ask must pass: wearing and taking off, buying and choosing
//! nodes, dismantling, identifying a Vestige and feeding an item a Fruit of Dagon anywhere; the vault and identifying
//! only in a social space. An ask refused changes nothing.

use crate::character::{At, CARRIED_MOST, Character, Stuff, VAULT_MOST, VESTIGES_MOST};
use crate::dice::{Dice, Purpose};
use crate::item::{Item, NAMED_LEVEL, NONE_CHOSEN};
use crate::kinds::{Slot, Stock};
use crate::rarity::Rarity;
use crate::vendor::{self, Vendor};
use crate::vestige;

/// The XP a Fruit of Dagon gives an item.
pub const FRUIT_ITEM_XP: u32 = 5_000;

/// One ask.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ask {
    Wear {
        item: u32,
        slot: Slot,
    },
    TakeOff {
        slot: Slot,
    },
    Buy {
        item: u32,
        column: u8,
        node: u8,
    },
    Choose {
        item: u32,
        column: u8,
        node: u8,
    },
    Dismantle {
        item: u32,
    },
    Identify {
        vestige: u32,
    },
    Feed {
        item: u32,
    },
    Store {
        item: u32,
    },
    Withdraw {
        item: u32,
    },
    StoreVestige {
        vestige: u32,
    },
    WithdrawVestige {
        vestige: u32,
    },
    /// Buys one of a vendor's wares of the day, by its place among them.
    Vend {
        vendor: Vendor,
        ware: u8,
    },
}

/// Why an ask was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refusal {
    NoSuchItem,
    NoSuchVestige,
    /// The item does not go in that slot, or the main hand's weapon takes both hands.
    DoesNotFit,
    /// The player's level is below the item's.
    TooLow,
    /// An Atheric is already worn in the hands, or in the armour.
    OneAtheric,
    /// The slot it would be carried in already holds nine.
    CarriedFull,
    VaultFull,
    VestigesFull,
    /// Only in a social space.
    NotHere,
    /// Where the item is does not allow it: worn, or in the vault.
    WrongPlace,
    /// The item's XP has not reached the column.
    Locked,
    NoSuchNode,
    AlreadyBought,
    NotBought,
    /// Not enough of what it costs.
    Short,
    NoFruit,
    FullOfXp,
}

/// What an ask did, when it did more than its ask says.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Done {
    Done,
    /// A Vestige opened to this item.
    Identified(u32),
}

/// Where the player is when they ask, and the day, whose wares the vendors show.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Here {
    pub social: bool,
    pub day: u64,
}

impl Character {
    /// Carries out an ask, or says why not. `dice` decides what a Vestige opens to and what dismantling returns.
    ///
    /// # Errors
    ///
    /// The ask's refusal, having changed nothing.
    pub fn ask(&mut self, ask: Ask, here: Here, dice: &Dice) -> Result<Done, Refusal> {
        match ask {
            Ask::Wear { item, slot } => self.wear(item, slot),
            Ask::TakeOff { slot } => self.take_off(slot),
            Ask::Buy { item, column, node } => self.buy(item, usize::from(column), node),
            Ask::Choose { item, column, node } => self.choose(item, usize::from(column), node),
            Ask::Dismantle { item } => self.dismantle(item, dice),
            Ask::Identify { vestige } => self.identify(vestige, here, dice),
            Ask::Feed { item } => self.feed(item),
            Ask::Store { item } => self.move_item(item, here, At::Carried, At::Vault),
            Ask::Withdraw { item } => self.move_item(item, here, At::Vault, At::Carried),
            Ask::StoreVestige { vestige } => self.move_vestige(vestige, here, true),
            Ask::WithdrawVestige { vestige } => self.move_vestige(vestige, here, false),
            Ask::Vend { vendor, ware } => self.vend(vendor, ware, here),
        }
        .map(|done| done.unwrap_or(Done::Done))
    }

    fn wear(&mut self, id: u32, slot: Slot) -> Result<Option<Done>, Refusal> {
        let (item, at) = self.items.get(&id).ok_or(Refusal::NoSuchItem)?;
        if !matches!(at, At::Carried | At::Worn(_)) {
            return Err(Refusal::WrongPlace);
        }
        if !item.kind.fits(slot)
            || slot == Slot::OffHand && self.worn(Slot::MainHand).is_some_and(|main| main.kind.two_handed())
        {
            return Err(Refusal::DoesNotFit);
        }
        if item.level > self.level() {
            return Err(Refusal::TooLow);
        }
        let hands = |slot: Slot| matches!(slot, Slot::MainHand | Slot::OffHand);
        if item.rarity == Rarity::Atheric
            && self.all_worn().any(|(worn_slot, worn)| {
                worn.rarity == Rarity::Atheric && worn.id != id && worn_slot != slot && hands(worn_slot) == hands(slot)
            })
        {
            return Err(Refusal::OneAtheric);
        }
        let mut moves = vec![(id, At::Worn(slot))];
        if let Some(previous) = self.worn(slot).filter(|previous| previous.id != id) {
            moves.push((previous.id, At::Carried));
        }
        if slot == Slot::MainHand
            && item.kind.two_handed()
            && let Some(off) = self.worn(Slot::OffHand).filter(|off| off.id != id)
        {
            moves.push((off.id, At::Carried));
        }
        self.settle_moves(&moves)?;
        Ok(None)
    }

    /// Buys a vendor's ware of the day, at the buyer's own level, carried with its slot's: only in a social space.
    fn vend(&mut self, vendor: Vendor, ware: u8, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let wares = vendor::wares(vendor, here.day, self.level());
        let mut item = wares.into_iter().nth(usize::from(ware)).ok_or(Refusal::NoSuchItem)?;
        let cost = vendor::price(item.rarity);
        if self.materials.aurem < cost {
            return Err(Refusal::Short);
        }
        if self.carried_in(item.bucket) >= CARRIED_MOST {
            return Err(Refusal::CarriedFull);
        }
        item.id = self.take_id();
        self.materials.aurem -= cost;
        self.items.insert(item.id, (item, At::Carried));
        Ok(None)
    }

    fn take_off(&mut self, slot: Slot) -> Result<Option<Done>, Refusal> {
        let worn = self.worn(slot).ok_or(Refusal::NoSuchItem)?.id;
        self.settle_moves(&[(worn, At::Carried)])?;
        Ok(None)
    }

    /// Moves items at once, if every slot still carries nine at most afterwards.
    fn settle_moves(&mut self, moves: &[(u32, At)]) -> Result<(), Refusal> {
        let mut after = self.clone();
        for (id, at) in moves {
            if let Some(entry) = after.items.get_mut(id) {
                entry.1 = *at;
            }
        }
        if Slot::ALL.into_iter().any(|bucket| after.carried_in(bucket) > CARRIED_MOST) {
            return Err(Refusal::CarriedFull);
        }
        *self = after;
        Ok(())
    }

    fn held_mut(&mut self, id: u32) -> Result<&mut Item, Refusal> {
        match self.items.get_mut(&id) {
            Some((item, At::Carried | At::Worn(_))) => Ok(item),
            Some(_) => Err(Refusal::WrongPlace),
            None => Err(Refusal::NoSuchItem),
        }
    }

    fn buy(&mut self, id: u32, column: usize, node: u8) -> Result<Option<Done>, Refusal> {
        let item = self.held_mut(id)?.clone();
        let bit = item.node_bit(column, node).ok_or(Refusal::NoSuchNode)?;
        if !item.unlocked(column) {
            return Err(Refusal::Locked);
        }
        if item.bought & bit != 0 {
            return Err(Refusal::AlreadyBought);
        }
        let cost = item.cost_of(column);
        let stock = item.kind.stock();
        let resource = usize::from(item.resource.unwrap_or_default());
        let held = &self.materials;
        if held.aurem < cost.aurem
            || held.fragments(stock) < cost.fragments
            || held.essence(stock) < cost.essence
            || cost.resource > 0 && (item.resource.is_none() || held.resource(resource) < cost.resource)
        {
            return Err(Refusal::Short);
        }
        let materials = &mut self.materials;
        materials.aurem -= cost.aurem;
        match stock {
            Stock::Weapon => {
                materials.weapon_fragments -= cost.fragments;
                materials.weapon_essence -= cost.essence;
            }
            Stock::Armor => {
                materials.armor_fragments -= cost.fragments;
                materials.armor_essence -= cost.essence;
            }
        }
        if cost.resource > 0 {
            materials.resources[resource] -= cost.resource;
        }
        let item = self.held_mut(id)?;
        item.bought |= bit;
        if let Some(chosen) = item.chosen.get_mut(column).filter(|chosen| **chosen == NONE_CHOSEN) {
            *chosen = node;
        }
        Ok(None)
    }

    fn choose(&mut self, id: u32, column: usize, node: u8) -> Result<Option<Done>, Refusal> {
        let item = self.held_mut(id)?;
        if !item.columns().get(column).is_some_and(|kind| kind.traits()) || item.node_bit(column, node).is_none() {
            return Err(Refusal::NoSuchNode);
        }
        if !item.has(column, node) {
            return Err(Refusal::NotBought);
        }
        let chosen = item.chosen.get_mut(column).ok_or(Refusal::NoSuchNode)?;
        *chosen = node;
        Ok(None)
    }

    fn dismantle(&mut self, id: u32, dice: &Dice) -> Result<Option<Done>, Refusal> {
        let item = match self.items.get(&id) {
            Some((item, At::Carried)) => item.clone(),
            Some(_) => return Err(Refusal::WrongPlace),
            None => return Err(Refusal::NoSuchItem),
        };
        let stock = item.kind.stock();
        let back = u16::try_from(item.essence_spent() / 3).unwrap_or(u16::MAX);
        let (aurem, fragments, essence) = match item.rarity {
            Rarity::Normal => (20, 0, 0),
            Rarity::Magic => (50, 1, 0),
            Rarity::Rare => (100, if item.level >= NAMED_LEVEL { 3 } else { 2 }, 0),
            Rarity::Legendary => (200, 3, 2 + u16::from(dice.roll(Purpose::Essence, 0) < 0.5) + back),
            Rarity::Atheric => (300, 5, 2 + back),
        };
        self.items.remove(&id);
        self.materials.add_aurem(aurem);
        self.materials.add(Stuff::Fragments(stock), fragments);
        self.materials.add(Stuff::Essence(stock), essence);
        Ok(None)
    }

    fn identify(&mut self, id: u32, here: Here, dice: &Dice) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let (vestige, vaulted) = *self.vestiges.get(&id).ok_or(Refusal::NoSuchVestige)?;
        if vaulted {
            return Err(Refusal::WrongPlace);
        }
        if self.carried_in(vestige.slot) >= CARRIED_MOST {
            return Err(Refusal::CarriedFull);
        }
        let rarity = vestige::opens_to(vestige.rarity, vestige.level, dice);
        let item_id = self.next_id;
        let item = vestige::make(item_id, rarity, vestige.slot, vestige.level, dice).ok_or(Refusal::NoSuchItem)?;
        self.take_id();
        self.vestiges.remove(&id);
        self.items.insert(item_id, (item, At::Carried));
        Ok(Some(Done::Identified(item_id)))
    }

    fn feed(&mut self, id: u32) -> Result<Option<Done>, Refusal> {
        if self.materials.fruit == 0 {
            return Err(Refusal::NoFruit);
        }
        let item = self.held_mut(id)?;
        if item.xp >= item.xp_most() {
            return Err(Refusal::FullOfXp);
        }
        item.xp = item.xp.saturating_add(FRUIT_ITEM_XP).min(item.xp_most());
        self.materials.fruit -= 1;
        Ok(None)
    }

    fn move_item(&mut self, id: u32, here: Here, from: At, to: At) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let (item, at) = self.items.get(&id).ok_or(Refusal::NoSuchItem)?;
        if *at != from {
            return Err(Refusal::WrongPlace);
        }
        if to == At::Vault && self.vaulted(item.kind.stock()) >= VAULT_MOST {
            return Err(Refusal::VaultFull);
        }
        self.settle_moves(&[(id, to)])?;
        Ok(None)
    }

    fn move_vestige(&mut self, id: u32, here: Here, into_vault: bool) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let (_, vaulted) = *self.vestiges.get(&id).ok_or(Refusal::NoSuchVestige)?;
        if vaulted == into_vault {
            return Err(Refusal::WrongPlace);
        }
        let room = if into_vault { VAULT_MOST } else { VESTIGES_MOST };
        if self.vestiges_held(into_vault) >= room {
            return Err(if into_vault { Refusal::VaultFull } else { Refusal::VestigesFull });
        }
        if let Some(entry) = self.vestiges.get_mut(&id) {
            entry.1 = into_vault;
        }
        Ok(None)
    }
}
