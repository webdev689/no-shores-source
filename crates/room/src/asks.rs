//! A player's asks of their gear, answered in turn with their inputs: the gear crate's own asks, judged where the
//! player stands (a social space, or within reach of the Test Ground's stall); gathering a resource node within reach;
//! and, in the Test Ground alone, grants of gear to try it with. Each answer is kept to send the player with their
//! gear.

use crate::{PlayerId, Room, Standing};
use gear::dice::Dice;
use gear::{Ask, Here, Item, Kind, Rarity, Refusal, Slot, Vestige};

/// How near the stall a player must stand for a social space's asks, and a resource node for gathering, in metres.
pub const STALL_REACH: f64 = 4.0;
pub const NODE_REACH: f64 = 2.5;
/// How often, in ticks, one player's asks are answered: five a second, no more often than their gear is sent, so each
/// answer reaches them before the next is made. How many asks are held for their turn; past those, they are let go.
pub const ASK_EVERY_TICKS: u64 = crate::players::GEAR_EVERY_TICKS;
pub const ASKS_HELD: usize = 4;
/// The answers the room gives beside the gear crate's refusals: a resource node out of reach or already spent, and a
/// grant asked outside the Test Ground.
pub const OUT_OF_REACH: u8 = 100;
pub const NOT_THE_TEST_GROUND: u8 = 101;
/// The resource a node gives is already at its most, so the node is left standing.
pub const STOCK_FULL: u8 = 102;

/// What a player asks of their gear.
#[derive(Clone, Debug, PartialEq)]
pub enum Asked {
    Gear(Ask),
    /// Gathers the room's resource node by its place in the room's list.
    Gather {
        node: u8,
    },
    Grant(Grant),
}

/// Gear the Test Ground hands out, to try the loop without playing it through.
#[derive(Clone, Debug, PartialEq)]
pub enum Grant {
    Vestige {
        rarity: Rarity,
        slot: Slot,
        level: u8,
    },
    /// A named item, by its id in the catalogue.
    Named(String),
    Item {
        kind: Kind,
        rarity: Rarity,
        level: u8,
    },
    /// This many of every material, and as much again of Aurem a hundred times over.
    Materials(u16),
    Xp(u32),
}

/// A resource node in a room: where it stands, and which island's resource it gives (its place in the catalogue's
/// list).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ResourceNode {
    pub x: f64,
    pub y: f64,
    pub resource: u8,
}

/// The number an answer sends: 0 done, else the refusal's.
#[must_use]
pub fn answer_code(answer: Result<(), Refusal>) -> u8 {
    answer.map_or_else(|refusal| refusal as u8 + 1, |()| 0)
}

impl Room {
    /// Lays out the Test Ground's stall, where a social space's asks are answered, and its resource nodes.
    pub fn furnish(&mut self, stall: Option<[f64; 2]>, nodes: Vec<ResourceNode>) {
        self.stall = stall;
        self.resource_nodes = nodes;
    }

    /// Whether a player stands where a social space's asks are answered: anywhere in a social space's room, or within
    /// reach of the stall.
    pub(crate) fn here(&self, player: PlayerId) -> Here {
        let near_stall = |stall: [f64; 2]| {
            self.fighter(player)
                .is_some_and(|fighter| libm::hypot(fighter.body.x - stall[0], fighter.body.y - stall[1]) <= STALL_REACH)
        };
        Here { social: self.social || self.stall.is_some_and(near_stall), day: self.day }
    }

    /// A player's dice for one roll: the room's seed, the tick, and the count of rolls made, so no two rolls share
    /// one and none can be foreseen without the seed, which a host keeps secret (`reseed`).
    pub(crate) fn dice(&mut self, player: PlayerId) -> Dice {
        self.rolls += 1;
        Dice { seed: self.seed, tick: self.clock ^ (self.rolls << 32), player }
    }

    /// Draws the room's chances from seeds of the host's own, kept from the players: a room on the default seed rolls
    /// what anyone with its code could foresee. The loot's seed is never the one the foes and camps are drawn from,
    /// which a player could work back from what they see.
    pub fn reseed(&mut self, loot: u64, world: u64) {
        self.seed = loot;
        self.world_seed = world;
    }

    /// Takes a player's ask: answered now if its turn has come, else held for it, in the order asked. A page that asks
    /// without end has all but its first few let go, and cannot make the room work faster for it.
    pub(crate) fn take_ask(&mut self, player: PlayerId, asked: Asked) {
        let Some(found) = self.players.get_mut(&player) else { return };
        if found.asks.len() < ASKS_HELD {
            found.asks.push_back(asked);
        }
        self.answer_due(player);
    }

    /// Answers a player's oldest held ask once `ASK_EVERY_TICKS` have passed since their last was answered.
    pub(crate) fn answer_due(&mut self, player: PlayerId) {
        let clock = self.clock;
        let Some(found) = self.players.get_mut(&player) else { return };
        if found.asked_at.is_some_and(|asked| clock < asked + ASK_EVERY_TICKS) {
            return;
        }
        let Some(asked) = found.asks.pop_front() else { return };
        self.answer(player, asked);
    }

    /// Answers a player's ask, keeping the answer to send them. One that changes the trim or the arms they fight with
    /// is sent at once, so their browser predicts them by it.
    pub(crate) fn answer(&mut self, player: PlayerId, asked: Asked) {
        let clock = self.clock;
        let Some(found) = self.players.get_mut(&player) else { return };
        let before = (found.trim, crate::power::arms_allowed(&found.character));
        found.asked_at = Some(clock);
        found.identified = 0;
        let here = self.here(player);
        let dice = self.dice(player);
        let code = match asked {
            Asked::Gear(ask) => {
                let Some(found) = self.players.get_mut(&player) else { return };
                match found.character.ask(ask, here, &dice) {
                    Ok(gear::Done::Identified(item)) => {
                        found.identified = item;
                        0
                    }
                    Ok(gear::Done::Done) => 0,
                    Err(refusal) => answer_code(Err(refusal)),
                }
            }
            Asked::Gather { node } => self.gather(player, node),
            Asked::Grant(grant) if self.section.is_none() => self.grant(player, grant),
            Asked::Grant(_) => NOT_THE_TEST_GROUND,
        };
        if let Some(found) = self.players.get_mut(&player) {
            found.answer = code;
            found.answered = found.answered.wrapping_add(1);
            found.gear_changed = true;
        }
        self.retrim(player);
        if let Some(found) = self.players.get_mut(&player) {
            found.gear_urgent |= before != (found.trim, crate::power::arms_allowed(&found.character));
        }
    }

    fn gather(&mut self, player: PlayerId, node: u8) -> u8 {
        let Some(spot) = self.resource_nodes.get(usize::from(node)).copied() else { return OUT_OF_REACH };
        let Some(fighter) = self.fighter(player).copied() else { return OUT_OF_REACH };
        let standing = self.node_standing(usize::from(node));
        let Some(found) = self.players.get_mut(&player) else { return OUT_OF_REACH };
        let far = libm::hypot(fighter.body.x - spot.x, fighter.body.y - spot.y) > NODE_REACH;
        let dead = fighter.dead() || matches!(found.standing, Standing::Dead { .. });
        if found.spent.contains(&node) || far || !standing || dead {
            return OUT_OF_REACH;
        }
        if found.character.materials.resource(usize::from(spot.resource)) >= gear::character::STOCK_MOST {
            return STOCK_FULL;
        }
        found.spent.push(node);
        if let (Some(owner), Some(patrol)) = (&found.owner, self.patrol.as_mut()) {
            patrol.gathered.entry(owner.clone()).or_default().push(node);
        }
        found.character.gather(usize::from(spot.resource));
        0
    }

    fn grant(&mut self, player: PlayerId, grant: Grant) -> u8 {
        let dice = self.dice(player);
        let Some(found) = self.players.get_mut(&player) else { return 0 };
        let character = &mut found.character;
        match grant {
            Grant::Vestige { rarity, slot, level } => {
                let id = character.take_id();
                let vestige = Vestige { id, rarity, slot, level: level.clamp(1, gear::item::ITEM_LEVEL_MOST) };
                if !character.pick_up(vestige) {
                    return answer_code(Err(Refusal::VestigesFull));
                }
            }
            Grant::Named(named) => {
                let Some(def) = gear::catalogue::catalogue().named(&named) else {
                    return answer_code(Err(Refusal::NoSuchItem));
                };
                let bucket = Slot::ALL.into_iter().find(|slot| def.kind.fits(*slot)).unwrap_or(Slot::MainHand);
                let mut item = gear::vestige::named_item(character.take_id(), def, bucket);
                item.element = gear::element::rolled(item.kind, item.rarity, &dice);
                return carry(character, item);
            }
            Grant::Item { kind, rarity, level } => {
                if rarity.named() || kind == Kind::Cloak {
                    return answer_code(Err(Refusal::NoSuchItem));
                }
                let bucket = Slot::ALL.into_iter().find(|slot| kind.fits(*slot)).unwrap_or(Slot::MainHand);
                let mut item = gear::vestige::rolled(character.take_id(), kind, rarity, bucket, level, &dice);
                item.element = gear::element::rolled(kind, rarity, &dice);
                return carry(character, item);
            }
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
        }
        0
    }
}

/// Carries a granted item, if its slot has room.
fn carry(character: &mut gear::Character, item: Item) -> u8 {
    if character.carried_in(item.bucket) >= gear::character::CARRIED_MOST {
        return answer_code(Err(Refusal::CarriedFull));
    }
    character.items.insert(item.id, (item, gear::At::Carried));
    0
}
