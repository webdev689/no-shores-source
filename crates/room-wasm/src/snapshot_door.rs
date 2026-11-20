//! The room's snapshot after its tick: every player and foe on land, every ship at sea, a fleet's ships. Taken once
//! a tick (`prepare`), then sent to each player as theirs (`snapshot_for`): at sea what floats, each ship's kept hurts,
//! what the sea tells and each deck boarded go only to the player they are for, and a deck's own snapshot only to its
//! boarders; and each player is sent only the ships near them: the hostile ships their ship keeps at sea (within
//! `KEEP_SHARE` times her sight, as she reckons it), the other players' within `PLAYERS_SEEN_M`, and every player in
//! their fight.

use crate::{Opened, with_open};
use room::{FoeSeen, PlayerId, Room, Seen};
use std::cell::RefCell;

/// A snapshot taken: a room's bytes for everyone, or the sea's parts, to be cut for each player.
enum Prepared {
    Everyone(Vec<u8>),
    Sea(Box<SeaParts>),
}

/// How far off a player is sent the other players' ships, metres: the page's farthest view at sea
/// (`client/src/game/sea.ts`, its horizon's `farM`).
pub const PLAYERS_SEEN_M: f64 = 60_000.0;

struct SeaParts {
    tick: u64,
    ships: Vec<(PlayerId, room::sea::Ship)>,
    pirates: Vec<room::pirates::Pirate>,
    fights: Vec<room::battle::FightSeen>,
    /// The players in each fight.
    crews: Vec<Vec<PlayerId>>,
    aboard: Vec<(PlayerId, u32, movement::Body)>,
    harbour: protocol::SeaHarbour,
    /// Every standing island, each with the players who have found it.
    islands: Vec<(protocol::IsleSeen, Vec<PlayerId>)>,
}

impl SeaParts {
    fn bytes(
        &self,
        (ships, pirates): (&[(PlayerId, room::sea::Ship)], &[room::pirates::Pirate]),
        fights: &[room::battle::FightSeen],
        harbour: &protocol::SeaHarbour,
    ) -> Vec<u8> {
        protocol::sea_snapshot_bytes(self.tick, ships, pirates, fights, &self.aboard, harbour)
    }

    /// The ships and hostile ships `player` is sent: none but their own before their ship is at sea.
    fn near(&self, player: PlayerId) -> (Vec<(PlayerId, room::sea::Ship)>, Vec<room::pirates::Pirate>) {
        let own = self.ships.iter().find(|(each, _)| *each == player).map(|(_, ship)| [ship.x, ship.y]);
        let crew = self.crews.iter().find(|crew| crew.contains(&player));
        let seen = |(other, ship): &&(PlayerId, room::sea::Ship)| {
            *other == player
                || crew.is_some_and(|crew| crew.contains(other))
                || own.is_some_and(|[x, y]| {
                    let (east, south) = (ship.x - x, ship.y - y);
                    east * east + south * south <= PLAYERS_SEEN_M * PLAYERS_SEEN_M
                })
        };
        let ships = self.ships.iter().filter(seen).copied().collect();
        let pirates = self.pirates.iter().filter(|pirate| own.is_some_and(|at| pirate.kept_by(at))).copied().collect();
        (ships, pirates)
    }

    /// The islands `player` is told of: those in sight of their ship, and those they have found, wherever they lie.
    fn islands(&self, player: PlayerId) -> Vec<protocol::IsleSeen> {
        let own = self.ships.iter().find(|(each, _)| *each == player).map(|(_, ship)| [ship.x, ship.y]);
        let in_sight = |at: [f64; 2]| {
            own.is_some_and(|[x, y]| {
                let (east, south) = (at[0] - x, at[1] - y);
                east * east + south * south <= room::sea::islands::SIGHT_M * room::sea::islands::SIGHT_M
            })
        };
        let told = self.islands.iter().filter(|(island, finders)| finders.contains(&player) || in_sight(island.at));
        told.map(|(island, finders)| protocol::IsleSeen { found: finders.contains(&player), ..*island }).collect()
    }
}

thread_local! {
    static PREPARED: RefCell<Option<Prepared>> = const { RefCell::new(None) };
}

/// Takes the room's snapshot after its last tick: what happened since the last is taken with it.
pub fn prepare() {
    // One that fails to take leaves none, never the last tick's again.
    PREPARED.with(|kept| *kept.borrow_mut() = None);
    let prepared = with_open(|opened| match opened {
        Opened::Land { room, .. } => Prepared::Everyone(land_snapshot(room)),
        Opened::Sea(sea) => {
            let fights = sea.fight_views();
            let aboard = sea.aboard().map(|(player, walking)| (player, walking.acknowledged, walking.body)).collect();
            let kind = |piece: naval::fight::Piece| piece as u8;
            let flotsam = sea.flotsam().iter().map(|piece| (piece.player, piece.id, piece.at, kind(piece.kind)));
            let kept = sea.ships().filter_map(|(player, _)| sea.kept(player).map(|(kept, left)| (player, kept, left)));
            let (flotsam, kept, told) = (flotsam.collect(), kept.collect(), sea.take_told());
            let holds: Vec<Option<u64>> = sea.decks().iter().map(|deck| sea.hold_left(deck)).collect();
            let decks = sea
                .decks_mut()
                .iter_mut()
                .zip(holds)
                .map(|(deck, hold)| {
                    let aboard = deck.aboard.iter().map(|(player, boarder)| (*player, *boarder)).collect();
                    (aboard, deck.pirate.commission.hull().number(), land_snapshot(&mut deck.room), hold)
                })
                .collect();
            let crews = sea.fights().map(|(_, fought)| fought.crews.keys().copied().collect()).collect();
            let players: Vec<PlayerId> = sea.ships().map(|(player, _)| player).collect();
            let islands = sea
                .islands()
                .standing()
                .map(|island| {
                    let seen = protocol::IsleSeen {
                        id: island.id,
                        seed: island.seed,
                        at: island.at,
                        kind: island.kind.number(),
                        continent: u8::try_from(island.continent).unwrap_or(u8::MAX),
                        found: false,
                    };
                    let finders = players.iter().copied().filter(|&player| sea.islands().found(player, island.id));
                    (seen, finders.collect())
                })
                .collect();
            Prepared::Sea(Box::new(SeaParts {
                tick: sea.clock(),
                ships: sea.ships().collect(),
                pirates: sea.pirates(),
                fights,
                crews,
                aboard,
                harbour: protocol::SeaHarbour { flotsam, kept, told, decks, islands: Vec::new() },
                islands,
            }))
        }
        Opened::Fleet(fleet) => {
            let happened = fleet.take_events();
            let acknowledged = |ship| fleet.acknowledged(ship);
            let at = (fleet.clock(), fleet.world_start());
            Prepared::Everyone(protocol::fleet::fleet_snapshot_bytes(at, fleet.fight(), &acknowledged, &happened))
        }
    });
    PREPARED.with(|kept| *kept.borrow_mut() = prepared);
}

/// The prepared snapshot as `player` is sent it; empty with none prepared.
#[must_use]
pub fn snapshot_for(player: PlayerId) -> Vec<u8> {
    PREPARED.with(|kept| match kept.borrow().as_ref() {
        None => Vec::new(),
        Some(Prepared::Everyone(bytes)) => bytes.clone(),
        Some(Prepared::Sea(parts)) => {
            let all = &parts.harbour;
            let harbour = protocol::SeaHarbour {
                flotsam: all.flotsam.iter().filter(|piece| piece.0 == player).copied().collect(),
                kept: all.kept.iter().filter(|kept| kept.0 == player).copied().collect(),
                told: all.told.iter().filter(|told| told.0 == player).cloned().collect(),
                decks: all
                    .decks
                    .iter()
                    .filter(|deck| deck.0.iter().any(|(at_sea, _)| *at_sea == player))
                    .cloned()
                    .collect(),
                islands: parts.islands(player),
            };
            // Each player's fight view is theirs alone too.
            let fights: Vec<_> = parts.fights.iter().filter(|fight| fight.player == player).cloned().collect();
            let (ships, pirates) = parts.near(player);
            parts.bytes((&ships, &pirates), &fights, &harbour)
        }
    })
}

/// Every player and foe after the room's last tick, the dresses changed and what happened in the fight since the last
/// snapshot, and the shots in flight with the balls just fired, as a snapshot's bytes; at sea, every ship, with every
/// player's part of the sea's own. Empty with no room open.
#[must_use]
pub fn snapshot() -> Vec<u8> {
    prepare();
    PREPARED.with(|kept| match kept.borrow().as_ref() {
        None => Vec::new(),
        Some(Prepared::Everyone(bytes)) => bytes.clone(),
        Some(Prepared::Sea(parts)) => parts.bytes((&parts.ships, &parts.pirates), &parts.fights, &parts.harbour),
    })
}

/// A room on land's snapshot after its last tick, taking the dresses changed, what happened and its lines since the
/// last: a deck boarded at sea sends its own the same way.
pub(crate) fn land_snapshot(room: &mut Room) -> Vec<u8> {
    let changed = room.take_dress_changes();
    let events = room.take_events();
    let dressed: Vec<(PlayerId, &str)> = changed.iter().map(|(player, dress)| (*player, dress.as_str())).collect();
    let players: Vec<Seen> = room.seen().collect();
    let foes: Vec<FoeSeen> = room.foes_seen().collect();
    let tick = room.clock();
    let lines = room.take_lines();
    let shots: Vec<combat::Shot> = room.shots().copied().collect();
    let spells: Vec<room::SpellSeen> = room.spells_seen().collect();
    let snapshot = protocol::Snapshot {
        tick,
        players: &players,
        dressed: &dressed,
        foes: &foes,
        events: &events,
        shots: &shots,
        lines: &lines,
        spells: &spells,
    };
    protocol::snapshot_bytes(&snapshot)
}
