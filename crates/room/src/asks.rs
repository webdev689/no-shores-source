//! A player's asks of their gear, answered in turn with their inputs: the gear crate's own asks, judged where the
//! player stands (at the counter that serves the ask in a social space, or within reach of the Test Ground's stall,
//! which serves them all); gathering a resource node within reach;
//! and, in the Test Ground alone, grants of gear and of statuses to try them with. Each answer is kept to send the
//! player with their gear.

use crate::{PlayerId, Room, Standing};
use gear::dice::Dice;
use gear::vendor::Vendor;
use gear::{Ask, Here, Item, Kind, Rarity, Refusal, Slot, Vestige};

/// How near the stall a player must stand for a social space's asks, a counter for its own, and a resource node for
/// gathering, in metres. A counter's is a metre past where the browser offers it, for a body still walking up.
pub const STALL_REACH: f64 = 4.0;
pub const COUNTER_REACH: f64 = 4.0;
pub const NODE_REACH: f64 = 2.5;
/// How long a node takes to gather, ticks (two seconds), and how far the body may stir meanwhile, metres.
pub const GATHER_TICKS: u64 = 120;
pub const GATHER_STIR_M: f64 = 0.3;
/// How near its end a gather let go of, or stepped off, is gathered all the same, ticks: the room counts from its
/// answer and the page from the press, a crossing of the wire apart.
pub const GATHER_GRACE_TICKS: u64 = 15;
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
/// A puzzle takes no use for a while after a wrong one (`steps.rs`).
pub const NOT_YET: u8 = 103;
/// A node is not gathered on horseback.
pub const MOUNTED: u8 = 104;
/// The player has fallen and waits to stand again: they return to their ship only once standing.
pub const FALLEN: u8 = 105;
/// A foe's blow landed on the player within the last ten seconds: they return to their ship only once it is past.
pub const FIGHTING: u8 = 106;
/// The player may return to their ship: a yes no other ask gives, so the page never takes another's done for it.
pub const TO_SHIP: u8 = 107;
/// A player let through a Breach's gate into its run (`Room::ask_enter_breach`): its own yes, as `TO_SHIP` is.
pub const INTO_BREACH: u8 = 108;
/// How long past a foe's blow a player waits to return to their ship: ten seconds.
pub const TO_SHIP_AFTER_TICKS: u64 = 10 * 60;

/// What a player asks of their gear.
#[derive(Clone, Debug, PartialEq)]
pub enum Asked {
    Gear(Ask),
    /// Begins to gather the room's resource node by its place in the room's list, E held; and lets go of it.
    Gather {
        node: u8,
    },
    StopGather,
    /// Scavenges a sea island's wreck by its place in the island's list.
    Scavenge {
        wreck: u8,
    },
    Grant(Grant),
    /// Wears an Art, or sets a fragment in a slot of one's Core.
    Art(gear::arts::ArtAsk),
    /// Uses a puzzle's point, by its place among the goal's points (`steps.rs`).
    UsePoint {
        point: u8,
    },
    /// Finds a chapter of the lore lying in the node, by its number (`lore.rs`).
    FindLore {
        chapter: u16,
    },
    /// Asks to return to their ship: refused while fallen or within ten seconds of a foe's blow, as the owner chose
    /// ([[The Audit's Leftovers Are Fixed as Claude Suggested]]); the page leaves for the sea only on the room's word.
    ToShip,
    /// Opens one's chest from a public event, by its number among one's drops, within `public::CHEST_REACH`.
    OpenChest {
        chest: u32,
    },
    /// In a Breach, begins to raise a fallen player of the company by holding Use beside their body, and lets go
    /// (`breach/fallen.rs`); takes the Lodestone up and sets it down (`breach/lodestone.rs`); and at a Breach's gate,
    /// asks whether it is open to the player's company (`breach/gate.rs`).
    Raise {
        player: PlayerId,
    },
    StopRaise,
    TakeLodestone,
    DropLodestone,
    EnterBreach,
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
    /// A loadout of this kind worn: the first one carried that the player may wear, or else a Normal one of their level
    /// handed out. The Test Ground's hands take up a weapon this way, so the room fights with what the figure holds.
    Worn(Kind),
    /// This many of every material, and as much again of Aurem a hundred times over.
    Materials(u16),
    Xp(u32),
    /// A status on the player, or on every foe, for this many ticks or its own time: to see and tune it.
    Status {
        status: combat::Status,
        on_foes: bool,
        ticks: Option<u32>,
    },
    /// The player's Anima full and their Tenets ready, to try every spell at once.
    ArtsReady,
    /// The Ranged loadout's ammunition set to this share, in `gear::ammo::AMMO_FULL` parts: full, or none to run dry.
    Ammo(u16),
    /// This many Ammo crates more, up to the five carried.
    Crates(u16),
    /// A First Mate and a Bosun of this level signed on and sent ashore, as far as the crew has room: to see
    /// companions fight.
    Officers(u8),
    /// An Art, by its number, at this level (1 to `gear::arts::LEVEL_MOST`) with no XP toward the next, owning all
    /// its fragments: to try its spells at every level.
    ArtLevel {
        art: u8,
        level: u8,
    },
}

/// A resource node in a room: where it stands, and which island's resource it gives (its place in the catalogue's
/// list).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ResourceNode {
    pub x: f64,
    pub y: f64,
    pub resource: u8,
}

/// A gather under way: its node, the tick it began, where the body stood, its health last tick, and whether E was let
/// go of. Being hurt, falling, mounting or the node's turn passing stops it, as does stirring or letting go before its
/// last `GATHER_GRACE_TICKS`; `GATHER_TICKS` on, the node is gathered.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Gathering {
    pub node: u8,
    pub since: u64,
    pub at: [f64; 2],
    pub health: f64,
    pub let_go: bool,
}

/// A social space's counter that serves a player's gear: the Mage's identifies Vestiges, a vault's keeps gear, a
/// smith's sells its own wares, the Tailor's emblems and dyes, the Tack's the horse's pieces, a faction's its pledge,
/// cape, packages and Art, Shape's, wherever he stands that week, his wares, and the mail's hands over its letters;
/// and the bounty board takes and turns in bounties.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CounterKind {
    Mage,
    Vault,
    Vendor(Vendor),
    Tailor,
    Tack,
    /// A faction's, by its number.
    Faction(u8),
    Shape,
    Mail,
    /// The bounty board, which takes and turns in bounties: no keeper stands at it.
    Board,
}

/// A counter and its middle.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Counter {
    pub kind: CounterKind,
    pub at: [f64; 2],
}

/// The counter that serves an ask, or none for one answered anywhere.
#[must_use]
pub fn counter_for(ask: &Ask) -> Option<CounterKind> {
    use gear::cosmetics::{Seller, cosmetics};
    let art_faction = |art: u8| gear::factions::factions().of_art(art).map(|faction| CounterKind::Faction(faction.id));
    match ask {
        Ask::Identify { .. } => Some(CounterKind::Mage),
        Ask::Store { .. } | Ask::Withdraw { .. } | Ask::StoreVestige { .. } | Ask::WithdrawVestige { .. } => {
            Some(CounterKind::Vault)
        }
        Ask::Vend { vendor, .. } => Some(CounterKind::Vendor(*vendor)),
        Ask::BuyCrate => Some(CounterKind::Vendor(Vendor::Weaponsmith)),
        Ask::BuyEmblem { .. } => Some(CounterKind::Tailor),
        Ask::BuyCosmetic { cosmetic } => {
            cosmetics().get(usize::from(*cosmetic)).map(|found| match found.kind.seller() {
                Seller::Tailor => CounterKind::Tailor,
                Seller::Tack => CounterKind::Tack,
            })
        }
        Ask::Pledge { faction }
        | Ask::BuyFactionWare { faction, .. }
        | Ask::CollectPackage { faction }
        | Ask::Recruit { faction, .. } => Some(CounterKind::Faction(*faction)),
        Ask::RiseArt { art, .. } | Ask::BuyFragment { art, .. } => art_faction(*art),
        Ask::BuyFromShape { .. } => Some(CounterKind::Shape),
        Ask::Speak { keeper } => keeper_counter(*keeper),
        Ask::TakeBounty { .. } | Ask::TurnInBounty { .. } => Some(CounterKind::Board),
        Ask::TakeLetter { .. } | Ask::TakeAllLetters => Some(CounterKind::Mail),
        _ => None,
    }
}

/// The counter a keeper stands at, by the number ask 64 sends: a house's by its faction's, else the Mage's (10), the
/// vault's, the Armorsmith's, the Weaponsmith's, the Tailor's, the Tack's and the Harbourmaster's (16).
fn keeper_counter(keeper: u8) -> Option<CounterKind> {
    Some(match keeper {
        10 => CounterKind::Mage,
        11 => CounterKind::Vault,
        12 => CounterKind::Vendor(Vendor::Armorsmith),
        13 => CounterKind::Vendor(Vendor::Weaponsmith),
        14 => CounterKind::Tailor,
        15 => CounterKind::Tack,
        16 => CounterKind::Vendor(Vendor::Shipwright),
        house => CounterKind::Faction(gear::factions::factions().faction(house)?.id),
    })
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

    /// Where a player stands as the gear crate judges an ask: where it is served if they stand at its counter in a
    /// social space, or within reach of the Test Ground's stall, which serves every ask; with the day and the week.
    pub(crate) fn here(&self, player: PlayerId, ask: &Ask) -> Here {
        let near = |at: [f64; 2], reach: f64| {
            self.fighter(player)
                .is_some_and(|fighter| libm::hypot(fighter.body.x - at[0], fighter.body.y - at[1]) <= reach)
        };
        let at_counter = counter_for(ask).is_some_and(|wanted| {
            let shape = self.shape_at().map(|at| Counter { kind: CounterKind::Shape, at });
            let counters = self.counters.iter().flatten().copied().chain(shape);
            counters.into_iter().any(|counter| counter.kind == wanted && near(counter.at, COUNTER_REACH))
        });
        let social = at_counter || self.stall.is_some_and(|stall| near(stall, STALL_REACH));
        let (pledge, rank) = self.player(player).map_or((0, 0), |found| crate::crew::pledge_of(&found.character));
        Here { social, day: self.day(), pledge, rank, week: gear::clock::week_of(self.minute) }
    }

    /// Where Shape stands, while he is in this social space: his place of the week among its spots.
    #[must_use]
    pub fn shape_at(&self) -> Option<[f64; 2]> {
        let week = gear::clock::week_of(self.minute);
        let present = self.counters.is_some() && gear::shape::present(self.minute);
        present.then(|| self.shape_spots.get(gear::shape::place(week)).copied()).flatten()
    }

    /// Whether a player stands in a social space, or within reach of the stall: where the vendors' wares are shown.
    /// A ruin's plaza has no counters, and nothing is sold there.
    #[must_use]
    pub fn in_social_space(&self, player: PlayerId) -> bool {
        self.counters.as_ref().is_some_and(|counters| !counters.is_empty())
            || self.here(player, &Ask::Vend { vendor: Vendor::Armorsmith, ware: 0, day: 0 }).social
    }

    /// Whether a player stands where a Vestige opens: at the Mage's counter, or the stall.
    #[must_use]
    pub fn at_mage(&self, player: PlayerId) -> bool {
        self.here(player, &Ask::Identify { vestige: 0 }).social
    }

    /// Whether a player may return to their ship now: `TO_SHIP`, or why not (`FALLEN`, `FIGHTING`).
    fn to_ship(&self, player: PlayerId) -> u8 {
        let Some(found) = self.players.get(&player) else { return TO_SHIP };
        if found.fighter.dead() || matches!(found.standing, Standing::Dead { .. }) {
            return FALLEN;
        }
        if found.struck_at.is_some_and(|struck| self.clock <= struck + TO_SHIP_AFTER_TICKS) {
            return FIGHTING;
        }
        TO_SHIP
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
        // E let go of is heard at once, and lets go of every gather asked before it, so none outlives the key.
        if asked == Asked::StopGather {
            found.asks.retain(|held| !matches!(held, Asked::Gather { .. }));
            if let Some(gathering) = found.gathering.as_mut() {
                gathering.let_go = true;
            }
            return;
        }
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
        let dice = self.dice(player);
        let code = match asked {
            Asked::Gear(ask) => {
                let here = self.here(player, &ask);
                let deck = matches!(self.floor, crate::Floor::Deck(_));
                let Some(found) = self.players.get_mut(&player) else { return };
                let ship_ask = crate::crew::of_the_ship(&ask, &found.character);
                match if deck && ship_ask { Err(Refusal::NotHere) } else { found.character.ask(ask, here, &dice) } {
                    Ok(gear::Done::Identified(item)) => {
                        found.identified = item;
                        0
                    }
                    Ok(gear::Done::Done) => 0,
                    Err(refusal) => answer_code(Err(refusal)),
                }
            }
            Asked::Gather { node } => self.gather(player, node),
            Asked::StopGather => {
                if let Some(gathering) = self.players.get_mut(&player).and_then(|found| found.gathering.as_mut()) {
                    gathering.let_go = true;
                }
                0
            }
            Asked::Scavenge { wreck } => self.scavenge(player, wreck),
            Asked::Grant(grant) if self.is_test_ground() => self.grant(player, grant),
            Asked::Grant(_) => NOT_THE_TEST_GROUND,
            Asked::Art(ask) => self.ask_art(player, ask),
            Asked::UsePoint { point } => self.use_point(player, point),
            Asked::FindLore { chapter } => self.find_lore(player, chapter),
            Asked::ToShip => self.to_ship(player),
            Asked::OpenChest { chest } => self.open_chest(player, chest),
            Asked::Raise { player: whom } => self.ask_raise(player, whom),
            Asked::StopRaise => self.stop_raising(player),
            Asked::TakeLodestone => {
                if self.take_lodestone(player) {
                    0
                } else {
                    OUT_OF_REACH
                }
            }
            Asked::DropLodestone => {
                if self.drop_lodestone(player) {
                    0
                } else {
                    OUT_OF_REACH
                }
            }
            Asked::EnterBreach => self.ask_enter_breach(player),
        };
        if let Some(found) = self.players.get_mut(&player) {
            found.answer = code;
            found.answered = found.answered.wrapping_add(1);
            found.gear_changed = true;
        }
        self.retrim(player);
        if let Some(found) = self.players.get_mut(&player) {
            found.gear_urgent |= before != (found.trim, crate::power::arms_allowed(&found.character));
            // The shots an ask gave or took are the fighter's at once, so the next snapshot tells its browser.
            found.fighter = found.armed(found.fighter);
        }
    }

    fn gather(&mut self, player: PlayerId, node: u8) -> u8 {
        if let Some(refused) = self.gather_refused(player, node) {
            return refused;
        }
        let (Some(spot), Some(fighter)) = (self.resource_nodes.get(usize::from(node)), self.fighter(player)) else {
            return OUT_OF_REACH;
        };
        if libm::hypot(fighter.body.x - spot.x, fighter.body.y - spot.y) > NODE_REACH {
            return OUT_OF_REACH;
        }
        let (since, at, health) = (self.clock, [fighter.body.x, fighter.body.y], fighter.health);
        let Some(found) = self.players.get_mut(&player) else { return OUT_OF_REACH };
        found.gathering = Some(Gathering { node, since, at, health, let_go: false });
        0
    }

    /// Why `player` may not gather `node` now, as its answer's code, wherever they stand: it does not stand for them
    /// (its turn has not come, or they gathered it), they are down, on horseback, or full of its resource.
    pub(crate) fn gather_refused(&self, player: PlayerId, node: u8) -> Option<u8> {
        let spot = self.resource_nodes.get(usize::from(node))?;
        let (Some(fighter), Some(found)) = (self.fighter(player), self.players.get(&player)) else {
            return Some(OUT_OF_REACH);
        };
        let dead = fighter.dead() || matches!(found.standing, Standing::Dead { .. });
        // On a sea island, only an account the sea says is landed there gathers, as only one scavenges.
        let landed = self
            .isle
            .as_ref()
            .and_then(|isle| isle.landed.as_ref())
            .is_none_or(|landed| found.owner.as_ref().is_some_and(|owner| landed.contains_key(owner)));
        if found.spent.contains(&node) || !self.node_standing(usize::from(node)) || dead || !landed {
            Some(OUT_OF_REACH)
        } else if found.mounted {
            Some(MOUNTED)
        } else if found.character.materials.resource(usize::from(spot.resource)) >= gear::character::STOCK_MOST {
            Some(STOCK_FULL)
        } else {
            None
        }
    }

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
                let id = character.take_id();
                let vestige = Vestige::new(id, rarity, slot, level.clamp(1, gear::item::ITEM_LEVEL_MOST));
                if !character.pick_up(vestige) {
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
                if rarity == Rarity::Atheric || kind == Kind::Cloak || (kind.module() && rarity == Rarity::Legendary) {
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

#[cfg(test)]
#[path = "standing_tests.rs"]
mod standing_tests;

/// Carries a granted item, if its slot has room.
fn carry(character: &mut gear::Character, item: Item) -> u8 {
    if character.carried_in(item.bucket) >= gear::character::CARRIED_MOST {
        return answer_code(Err(Refusal::CarriedFull));
    }
    character.items.insert(item.id, (item, gear::At::Carried));
    0
}
