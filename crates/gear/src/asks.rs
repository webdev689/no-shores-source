//! What a player asks of their gear, and the rules each ask must pass: wearing and taking off, buying and choosing
//! nodes, dismantling, feeding an item a Fruit of Dagon, using an Ammo crate, wearing a cosmetic and marking the
//! prologue played anywhere; identifying a Vestige, the vault (`vault.rs`), the vendors, the factions, Shape and the
//! mail only at their counters in a social space; and taking and turning in a bounty at the bounty board. An ask
//! refused changes nothing.

use crate::character::{At, CARRIED_MOST, Character, Stuff};
use crate::dice::{Dice, Purpose};
use crate::emblems::Deed;
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
    /// Buys one of a vendor's wares of the day, by its place among them on the day they were shown (`day`, counted
    /// from the epoch).
    Vend {
        vendor: Vendor,
        ware: u8,
        day: u32,
    },
    /// Wears an emblem the player keeps, by its number in the catalogue.
    WearEmblem {
        emblem: u16,
    },
    /// Buys one of the emblems the Tailor sells that day: at the Tailor's counter only.
    BuyEmblem {
        emblem: u16,
    },
    /// Uses an Ammo crate, filling the Ranged loadout's ammunition: anywhere.
    UseCrate,
    /// Buys an Ammo crate: at the Weaponsmith's counter only.
    BuyCrate,
    /// Marks the prologue played: anywhere, and only that.
    FinishPrologue,
    /// Takes a bounty of the day's board, by its place on it and the day of the board shown: at the bounty board only,
    /// after the prologue.
    TakeBounty {
        place: u8,
        day: u64,
    },
    /// Turns in a bounty done, by its place and the day of the board shown: at the bounty board only, once.
    TurnInBounty {
        place: u8,
        day: u64,
    },
    /// Feeds a carried module into a kept one of its kind, raising it to the fed one's level (`ship::infuse`).
    Infuse {
        item: u32,
        fed: u32,
    },
    /// Signs on one of the officers of the day at the counter of the faction pledged to (`crew::recruit`).
    Recruit {
        faction: u8,
        offer: u8,
    },
    /// Puts an officer at their post, ashore or aboard.
    Station {
        officer: u32,
        duty: crate::crew::Duty,
    },
    Dismiss {
        officer: u32,
    },
    /// Buys an officer's node, and chooses one bought.
    Train {
        officer: u32,
        column: u8,
        node: u8,
    },
    ChooseOfficer {
        officer: u32,
        column: u8,
        node: u8,
    },
    /// Pledges to a faction, by its number: at its counter.
    Pledge {
        faction: u8,
    },
    /// Buys one of a faction's wares by its place among them (`factions::wares`): at its counter.
    BuyFactionWare {
        faction: u8,
        ware: u8,
    },
    /// Collects one of a faction's packages: at its counter.
    CollectPackage {
        faction: u8,
    },
    /// Raises an Art a level, owning one of its fragments by its place: at its faction's counter.
    RiseArt {
        art: u8,
        fragment: u8,
    },
    /// Buys one of an Art's fragments by its place: at its faction's counter.
    BuyFragment {
        art: u8,
        fragment: u8,
    },
    /// Wears a dye or barding the player keeps, by its number in the catalogue.
    WearCosmetic {
        cosmetic: u16,
    },
    /// Buys one of the day's cosmetics: at the Tailor's counter for a dye, the Tack's for the rest.
    BuyCosmetic {
        cosmetic: u16,
    },
    /// Buys one of Shape's pieces of the week, by its place among them and the named piece shown there (`shown`, its
    /// place in the catalogue's items): at his place, while he is here, and only while that piece stands there.
    BuyFromShape {
        ware: u8,
        shown: u32,
    },
    /// Speaks with a keeper, a house's by its faction's number or one of `quests::KEEPERS`: at their counter.
    Speak {
        keeper: u8,
    },
    /// Owns one of an Art's fragments by its place, for a choice a house's road gave: anywhere.
    ChooseFragment {
        art: u8,
        fragment: u8,
    },
    /// Takes a letter's Vestige or item by the letter's number, or every letter there is room for: at the mail counter.
    TakeLetter {
        letter: u32,
    },
    TakeAllLetters,
}

/// Why an ask was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refusal {
    NoSuchItem,
    NoSuchVestige,
    /// The item does not go in that slot.
    DoesNotFit,
    /// The player's level is below the item's.
    TooLow,
    /// An Atheric is already worn in a loadout, or in the armour.
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
    NoSuchEmblem,
    /// The player does not keep that emblem or cosmetic.
    NotKept,
    /// The player keeps that emblem, cosmetic or cape already.
    Kept,
    /// The Tailor or the Tack does not sell it that day.
    NotSold,
    NoCrate,
    /// The Ranged loadout's ammunition is full already.
    AmmoFull,
    /// Five Ammo crates are carried already.
    CratesFull,
    NoSuchFaction,
    /// The player is not pledged to the faction.
    NotPledged,
    /// The player is pledged to the faction already.
    Pledged,
    /// The player's rank with the faction is too low.
    RankTooLow,
    /// The faction holds no package for the player.
    NoPackage,
    /// The Art's bar is not full.
    NotReady,
    /// The Art is at its highest level.
    LevelMost,
    /// The player owns the fragment already.
    Owned,
    NoSuchCosmetic,
    /// An Art has no fragment at that place.
    NoSuchFragment,
    /// The bounty board opens after the prologue. The board's refusals are numbered apart, answered 81 to 85, so a list
    /// growing above them never moves them.
    BoardShut = 80,
    /// No such place, a board of another day than the room's, or a room whose day is behind the character's record.
    NoSuchBounty,
    BountyHeld,
    /// Not held, or its count short of its target.
    BountyNotDone,
    BountyPaid,
    /// No Ranged weapon is worn for an Ammo crate to fill: answered as 120, one past its number as every refusal is.
    NoRanged = 119,
    NoSuchOfficer = 130,
    /// The player is pledged to no faction, whose counter signs officers on.
    NoPledge = 131,
    /// Eight officers are kept already.
    CrewFull = 132,
    /// Two officers are ashore already.
    AshoreFull = 133,
    /// The officer offered is in the crew already.
    OfficerKept = 134,
    /// No keeper has that number.
    NoSuchKeeper = 135,
    /// No goal of the player's task asks a word with that keeper.
    NothingToSay = 136,
    /// No fragment choice waits for that Art.
    NoChoice = 137,
    /// No letter of that number waits in the mail, or none at all: answered as 141.
    NoSuchLetter = 140,
    /// The guild's asks: no such guild bounty this week, one the guild has not finished, one claimed already this
    /// week, a member who joined since the week turned, and a player in no guild (the room's).
    NoSuchGuildBounty = 150,
    GuildBountyNotDone = 151,
    GuildBountyClaimed = 152,
    JoinedThisWeek = 153,
    NotInGuild = 154,
    /// An outpost's asks (`room::outpost`): asked off one's guild's outpost; the treasury holds no more; no structure
    /// being built needs that; the stores hold none of it for the player today; the War Horn sounded this week, or
    /// not by them; the accounts did not answer; and the horn's foe still stands.
    NotAtOutpost = 155,
    TreasuryFull = 156,
    NothingNeeds = 157,
    StoresEmpty = 158,
    HornSounded = 159,
    OutpostTrouble = 160,
    HornFoeStands = 161,
}

/// What an ask did, when it did more than its ask says.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Done {
    Done,
    /// A Vestige opened to this item.
    Identified(u32),
}

/// Where the player is when they ask: whether at the counter that serves the ask; the day, whose wares the vendors
/// show, and the week, whose Shape shows; and the faction they are pledged to (0 none) and their rank with it, whose
/// counter signs officers on.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Here {
    pub social: bool,
    pub day: u64,
    pub pledge: u8,
    pub rank: u32,
    pub week: u64,
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
            Ask::Vend { vendor, ware, day } => self.vend(vendor, ware, day, here),
            Ask::WearEmblem { emblem } => self.wear_emblem(emblem),
            Ask::BuyEmblem { emblem } => self.buy_emblem(emblem, here),
            Ask::UseCrate => self.use_crate(),
            Ask::BuyCrate => self.buy_crate(here),
            Ask::FinishPrologue => self.finish_prologue(),
            Ask::TakeBounty { place, day } => self.take_bounty(place, day, here),
            Ask::TurnInBounty { place, day } => self.turn_in_bounty(place, day, here),
            Ask::Infuse { item, fed } => self.infuse(item, fed),
            Ask::Recruit { faction, offer } => self.recruit(faction, offer, here),
            Ask::Station { officer, duty } => self.station(officer, duty),
            Ask::Dismiss { officer } => self.dismiss(officer),
            Ask::Train { officer, column, node } => self.train(officer, usize::from(column), node),
            Ask::ChooseOfficer { officer, column, node } => self.choose_officer(officer, usize::from(column), node),
            Ask::Pledge { faction } => self.pledge(faction, here),
            Ask::BuyFactionWare { faction, ware } => self.buy_faction_ware(faction, ware, here, dice),
            Ask::CollectPackage { faction } => self.collect_package(faction, here, dice),
            Ask::RiseArt { art, fragment } => self.rise_art(art, fragment, here),
            Ask::BuyFragment { art, fragment } => self.buy_fragment(art, fragment, here),
            Ask::WearCosmetic { cosmetic } => self.wear_cosmetic(cosmetic),
            Ask::BuyCosmetic { cosmetic } => self.buy_cosmetic(cosmetic, here),
            Ask::BuyFromShape { ware, shown } => self.buy_from_shape(ware, shown, here),
            Ask::Speak { keeper } => self.speak(keeper, here),
            Ask::ChooseFragment { art, fragment } => self.choose_fragment(art, fragment),
            Ask::TakeLetter { letter } => self.take_letter(letter, here),
            Ask::TakeAllLetters => self.take_all_letters(here),
        }
        .map(|done| {
            // A level reached or a piece fully upgraded earns its emblem as it happens; a fragment choice left with
            // nothing to own is paid; a piece held or worn counts for the quest walked.
            self.earn_due();
            self.settle_choices();
            self.tell_held();
            done.unwrap_or(Done::Done)
        })
    }

    fn wear(&mut self, id: u32, slot: Slot) -> Result<Option<Done>, Refusal> {
        let (item, at) = self.items.get(&id).ok_or(Refusal::NoSuchItem)?;
        if !matches!(at, At::Carried | At::Worn(_)) {
            return Err(Refusal::WrongPlace);
        }
        if !item.kind.fits(slot) {
            return Err(Refusal::DoesNotFit);
        }
        let level = if slot.ship() { self.ship_level() } else { self.level() };
        if item.level > level {
            return Err(Refusal::TooLow);
        }
        if item.rarity == Rarity::Atheric
            && self.all_worn().any(|(worn_slot, worn)| {
                worn.rarity == Rarity::Atheric
                    && worn.id != id
                    && worn_slot != slot
                    && worn_slot.group() == slot.group()
            })
        {
            return Err(Refusal::OneAtheric);
        }
        let mut moves = vec![(id, At::Worn(slot))];
        if let Some(previous) = self.worn(slot).filter(|previous| previous.id != id) {
            moves.push((previous.id, At::Carried));
        }
        self.settle_moves(&moves)?;
        Ok(None)
    }

    /// Buys a vendor's ware of the day or of their starter stock, at the buyer's own level, carried with its slot's:
    /// only in a social space, and only as shown today, since the wares at each place change as the day turns. A
    /// smith's sale is kept by its slot for the quests (`tell_held`).
    fn vend(&mut self, vendor: Vendor, ware: u8, day: u32, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        if u64::from(day) != here.day {
            return Err(Refusal::NotSold);
        }
        let level = if vendor.for_ship() { self.ship_level() } else { self.level() };
        let wares = vendor::stock(vendor, here.day, level);
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
        let slot = item.kind.slot();
        self.items.insert(item.id, (item, At::Carried));
        if !vendor.for_ship() && !self.quests.bought.contains(&slot) {
            self.quests.bought.push(slot);
        }
        Ok(None)
    }

    fn take_off(&mut self, slot: Slot) -> Result<Option<Done>, Refusal> {
        let worn = self.worn(slot).ok_or(Refusal::NoSuchItem)?.id;
        self.settle_moves(&[(worn, At::Carried)])?;
        Ok(None)
    }

    /// Moves items at once, if every slot still carries nine at most afterwards, or no more than it did: a slot two
    /// hands' pieces were read into may carry past nine, and only empties.
    pub(crate) fn settle_moves(&mut self, moves: &[(u32, At)]) -> Result<(), Refusal> {
        let mut after = self.clone();
        for (id, at) in moves {
            if let Some(entry) = after.items.get_mut(id) {
                entry.1 = *at;
            }
        }
        if Slot::ALL.into_iter().any(|bucket| after.carried_in(bucket) > CARRIED_MOST.max(self.carried_in(bucket))) {
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
        if stock == Stock::Ship {
            let price = crate::ship::materials::price_of(item.kind, cost);
            if self.materials.aurem < cost.aurem || !self.materials.ship.pay(&price) {
                return Err(Refusal::Short);
            }
            self.materials.aurem -= cost.aurem;
            return self.bought(id, column, node, bit);
        }
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
            Stock::Ship => {}
        }
        if cost.resource > 0 {
            materials.resources[resource] -= cost.resource;
        }
        self.bought(id, column, node, bit)
    }

    /// Lights a node paid for, choosing it if its column had none.
    fn bought(&mut self, id: u32, column: usize, node: u8, bit: u32) -> Result<Option<Done>, Refusal> {
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
        if item.kind == crate::kinds::Kind::Horse {
            return Err(Refusal::DoesNotFit);
        }
        self.items.remove(&id);
        self.salvage(&item, dice);
        Ok(None)
    }

    /// Adds what an item dismantled gives back: Aurem, and its stock's fragments and, from a Legendary or Atheric,
    /// Essence with a third of what was spent on it. A faction's piece, sold for Aurem, gives back as a Normal one and
    /// the third of its Essence, so buying and dismantling faction gear makes no Essence.
    pub(crate) fn salvage(&mut self, item: &Item, dice: &Dice) {
        let stock = item.kind.stock();
        let back = u16::try_from(item.essence_spent() / 3).unwrap_or(u16::MAX);
        let bought = item.named.as_deref().is_some_and(crate::factions::sold_by_faction);
        let rarity = if bought { Rarity::Normal } else { item.rarity };
        let (aurem, fragments, essence) = match rarity {
            Rarity::Normal => (20, 0, if bought { back } else { 0 }),
            Rarity::Magic => (50, 1, 0),
            Rarity::Rare => (100, if item.level >= NAMED_LEVEL { 3 } else { 2 }, 0),
            Rarity::Legendary => (200, 3, 2 + u16::from(dice.roll(Purpose::Essence, 0) < 0.5) + back),
            Rarity::Atheric => (300, 5, 3 + back),
        };
        self.materials.add_aurem(aurem);
        if stock == Stock::Ship {
            let [first, _] = crate::ship::materials::made_of(item.kind);
            self.materials.ship.add(first, fragments * 2);
            self.materials.ship.add(crate::ship::materials::ShipMaterial::Heartwood, essence);
            return;
        }
        self.materials.add(Stuff::Fragments(stock), fragments);
        self.materials.add(Stuff::Essence(stock), essence);
    }

    fn identify(&mut self, id: u32, here: Here, dice: &Dice) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let (vestige, vaulted) = self.vestiges.get(&id).cloned().ok_or(Refusal::NoSuchVestige)?;
        if vaulted {
            return Err(Refusal::WrongPlace);
        }
        if self.carried_in(vestige.slot) >= CARRIED_MOST {
            return Err(Refusal::CarriedFull);
        }
        let rarity = vestige::opens_to(vestige.rarity, vestige.level, dice);
        let item_id = self.id_to_take();
        let item = vestige::make(item_id, rarity, vestige.slot, vestige.level, vestige.source, dice)
            .ok_or(Refusal::NoSuchItem)?;
        self.take_id();
        self.vestiges.remove(&id);
        let opened = item.rarity;
        self.items.insert(item_id, (item, At::Carried));
        match opened {
            Rarity::Legendary => self.earn(Deed::OpenedLegendary),
            Rarity::Atheric => self.earn(Deed::OpenedAtheric),
            _ => {}
        }
        Ok(Some(Done::Identified(item_id)))
    }

    fn feed(&mut self, id: u32) -> Result<Option<Done>, Refusal> {
        if self.materials.fruit == 0 {
            return Err(Refusal::NoFruit);
        }
        let item = self.held_mut(id)?;
        if item.kind.module() {
            return Err(Refusal::DoesNotFit);
        }
        if item.xp >= item.xp_most() {
            return Err(Refusal::FullOfXp);
        }
        item.xp = item.xp.saturating_add(FRUIT_ITEM_XP).min(item.xp_most());
        self.materials.fruit -= 1;
        Ok(None)
    }
}
