//! The room's snapshot after its tick: every player and foe on land, every ship at sea, a fleet's ships. Taken once
//! a tick (`prepare`), then sent to each player as theirs (`snapshot_for`): at sea what floats, each ship's kept hurts,
//! what the sea tells and each deck boarded go only to the player they are for, and a deck's own snapshot only to its
//! boarders.

use crate::{Opened, with_open};
use room::{FoeSeen, PlayerId, Room, Seen};
use std::cell::RefCell;

/// A snapshot taken: a room's bytes for everyone, or the sea's parts, to be cut for each player.
enum Prepared {
    Everyone(Vec<u8>),
    Sea(Box<SeaParts>),
}

struct SeaParts {
    tick: u64,
    ships: Vec<(PlayerId, room::sea::Ship)>,
    pirates: Vec<room::pirates::Pirate>,
    fights: Vec<(PlayerId, Vec<f64>, naval::ranks::Commission)>,
    aboard: Vec<(PlayerId, u32, movement::Body)>,
    harbour: protocol::SeaHarbour,
}

impl SeaParts {
    fn bytes(
        &self,
        fights: &[(PlayerId, Vec<f64>, naval::ranks::Commission)],
        harbour: &protocol::SeaHarbour,
    ) -> Vec<u8> {
        protocol::sea_snapshot_bytes(self.tick, &self.ships, &self.pirates, fights, &self.aboard, harbour)
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
            let decks = sea
                .decks_mut()
                .iter_mut()
                .map(|deck| {
                    let aboard = deck.aboard.iter().map(|(player, boarder)| (*player, *boarder)).collect();
                    (aboard, deck.pirate.commission.hull().number(), land_snapshot(&mut deck.room))
                })
                .collect();
            Prepared::Sea(Box::new(SeaParts {
                tick: sea.clock(),
                ships: sea.ships().collect(),
                pirates: sea.pirates(),
                fights,
                aboard,
                harbour: protocol::SeaHarbour { flotsam, kept, told, decks },
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
            };
            // Each player's fight view is theirs alone too.
            let fights: Vec<_> = parts.fights.iter().filter(|fight| fight.0 == player).cloned().collect();
            parts.bytes(&fights, &harbour)
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
        Some(Prepared::Sea(parts)) => parts.bytes(&parts.fights, &parts.harbour),
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
