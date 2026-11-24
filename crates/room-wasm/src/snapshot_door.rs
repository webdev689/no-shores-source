//! The room's snapshot after its tick: every player and foe on land, every ship at sea, a fleet's ships. Taken once
//! a tick (`prepare`), then sent to each player as theirs (`snapshot_for`): on land what changed since the snapshot
//! their screen last showed (`sent.rs`); at sea what floats, each ship's kept hurts, what the sea tells and each deck
//! boarded go only to the player they are for, and a deck's own snapshot only to its boarders, each their own; and
//! each player is sent only the ships near them: the hostile ships their ship keeps at sea (within `KEEP_SHARE` times
//! its sight, as it reckons it), the other players' within `PLAYERS_SEEN_M`, and every player in their fight; and
//! only those walking the decks of the ships they are sent.

use crate::{Opened, with_open};
use combat::shots::Line;
use room::{FoeSeen, PlayerId, Room, Seen};
use std::cell::RefCell;

/// A snapshot taken: a room on land's, cut for each player by what their screen showed; a fleet's bytes for
/// everyone; or the sea's parts, to be cut for each player.
enum Prepared {
    Land,
    Everyone(Vec<u8>),
    Sea(Box<SeaParts>),
}

/// How far off a player is sent the other players' ships, metres: the page's farthest view at sea
/// (`client/src/game/sea.ts`, its horizon's `farM`).
pub const PLAYERS_SEEN_M: f64 = 60_000.0;

struct SeaParts {
    tick: u64,
    ships: Vec<(PlayerId, room::sea::Ship)>,
    hostiles: Vec<room::hostiles::Hostile>,
    fights: Vec<room::battle::FightSeen>,
    /// The players in each fight.
    crews: Vec<Vec<PlayerId>>,
    aboard: Vec<(PlayerId, u32, movement::Body)>,
    /// Its decks boarded, each with no snapshot of its own: each boarder's is in `deck_views`.
    harbour: protocol::SeaHarbour,
    /// Each deck's own snapshot as each of its boarders is sent it, by their number at sea, in `harbour`'s order.
    deck_views: Vec<Vec<(PlayerId, Vec<u8>)>>,
    /// Every standing island, each with the players who have found it.
    islands: Vec<(protocol::IsleSeen, Vec<PlayerId>)>,
    /// How much farther each player's Lookout sights ships, 1 for none.
    lookouts: Vec<(PlayerId, f64)>,
}

impl SeaParts {
    fn bytes(
        &self,
        (ships, hostiles): (&[(PlayerId, room::sea::Ship)], &[room::hostiles::Hostile]),
        fights: &[room::battle::FightSeen],
        harbour: &protocol::SeaHarbour,
    ) -> Vec<u8> {
        // Those walking a deck are seen as their ship is: on a ship this player is sent.
        let aboard: Vec<_> = self
            .aboard
            .iter()
            .filter(|(walker, _, _)| ships.iter().any(|(owner, _)| owner == walker))
            .copied()
            .collect();
        protocol::sea_snapshot_bytes(self.tick, ships, hostiles, fights, &aboard, harbour)
    }

    /// The ships and hostile ships `player` is sent: none but their own before their ship is at sea.
    fn near(&self, player: PlayerId) -> (Vec<(PlayerId, room::sea::Ship)>, Vec<room::hostiles::Hostile>) {
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
        // A Lookout sights each ship from farther off: its sight, as this player is sent it, is that much longer.
        let lookout = self.lookouts.iter().find(|(each, _)| *each == player).map_or(1.0, |(_, times)| *times);
        let sighted = self
            .hostiles
            .iter()
            .map(|hostile| room::hostiles::Hostile { sight_m: hostile.sight_m * lookout, ..*hostile });
        let hostiles = sighted.filter(|hostile| own.is_some_and(|at| hostile.kept_by(at))).collect();
        (ships, hostiles)
    }

    /// Where `player`'s ship lies, once it is at sea.
    fn own(&self, player: PlayerId) -> Option<[f64; 2]> {
        self.ships.iter().find(|(each, _)| *each == player).map(|(_, ship)| [ship.x, ship.y])
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
        Opened::Land { room, sent, .. } => {
            sent.take(room);
            Prepared::Land
        }
        Opened::Sea(sea) => {
            let fights = sea.fight_views();
            sea.fights_sent();
            let aboard = sea.aboard().map(|(player, walking)| (player, walking.acknowledged, walking.body)).collect();
            let kind = |piece: naval::fight::Piece| piece as u8;
            let flotsam = sea.flotsam().iter().map(|piece| (piece.player, piece.id, piece.at, kind(piece.kind)));
            let kept = sea.ships().filter_map(|(player, _)| sea.kept(player).map(|(kept, left)| (player, kept, left)));
            let (flotsam, kept, told) = (flotsam.collect(), kept.collect(), sea.take_told());
            let holds: Vec<Option<u64>> = sea.decks().iter().map(|deck| sea.hold_left(deck)).collect();
            let (decks, deck_views) = sea
                .decks_mut()
                .iter_mut()
                .zip(holds)
                .map(|(deck, hold)| {
                    let aboard: Vec<_> = deck.aboard.iter().map(|(player, boarder)| (*player, *boarder)).collect();
                    let views = whole_for_each(&mut deck.room, &aboard);
                    ((aboard, deck.hostile.commission.hull().number(), Vec::new(), hold), views)
                })
                .unzip();
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
                hostiles: sea.hostiles(),
                fights,
                crews,
                aboard,
                harbour: protocol::SeaHarbour {
                    flotsam,
                    kept,
                    told,
                    decks,
                    islands: Vec::new(),
                    taken: sea.taken(),
                    friendlies: sea.friendlies(),
                },
                deck_views,
                islands,
                lookouts: sea.ships().map(|(player, _)| (player, sea.lookout(player))).collect(),
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
        Some(Prepared::Land) => with_open(|opened| match opened {
            Opened::Land { room, sent, .. } => sent.snapshot_for(room, player),
            Opened::Sea(_) | Opened::Fleet(_) => Vec::new(),
        })
        .unwrap_or_default(),
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
                    .zip(&parts.deck_views)
                    .filter_map(|((aboard, hull, _, hold), views)| {
                        let (_, bytes) = views.iter().find(|(at_sea, _)| *at_sea == player)?;
                        Some((aboard.clone(), *hull, bytes.clone(), *hold))
                    })
                    .collect(),
                islands: parts.islands(player),
                taken: all.taken.clone(),
                friendlies: friendlies_seen(parts.own(player), &all.friendlies),
            };
            // Each player's fight view is theirs alone too.
            let fights: Vec<_> = parts.fights.iter().filter(|fight| fight.player == player).cloned().collect();
            let (ships, hostiles) = parts.near(player);
            parts.bytes((&ships, &hostiles), &fights, &harbour)
        }
    })
}

/// The snapshot after the room's last tick as `player` is sent it (`prepare`, then `snapshot_for`). Empty with no
/// room open.
#[must_use]
pub fn snapshot(player: PlayerId) -> Vec<u8> {
    prepare();
    snapshot_for(player)
}

/// A room on land's snapshot after its last tick for each boarder, by their number at sea, each whole (built on none)
/// with their own fighter whole and the rest packed, taking the dresses changed, what happened and its lines since the
/// last: a deck boarded at sea, whose snapshot rides in the sea's own, so each goes once.
fn whole_for_each(room: &mut Room, aboard: &[(PlayerId, PlayerId)]) -> Vec<(PlayerId, Vec<u8>)> {
    let changed = room.take_dress_changes();
    let dressed: Vec<(PlayerId, &str)> = changed.iter().map(|(player, dress)| (*player, dress.as_str())).collect();
    let (tick, events) = (room.clock(), room.take_events());
    let lines: Vec<(u64, Line)> = room.take_lines().into_iter().map(|line| (tick, line)).collect();
    let players: Vec<Seen> = room.seen().collect();
    let foes: Vec<FoeSeen> = room.foes_seen().collect();
    let shots: Vec<combat::Shot> = room.shots().copied().collect();
    let spells: Vec<room::SpellSeen> = room.spells_seen().collect();
    let public = room.public_seen();
    let reviving = room.reviving_seen();
    aboard
        .iter()
        .map(|&(at_sea, viewer)| {
            let snapshot = protocol::Snapshot {
                tick,
                viewer,
                middle: [0.0, 0.0],
                base: 0,
                gone_players: &[],
                gone_foes: &[],
                own_base: None,
                base_players: None,
                base_foes: None,
                players: &players,
                dressed: &dressed,
                // A deck draws no plates: the sea names no one.
                plates: &[],
                foes: &foes,
                events: &events,
                shots: &shots,
                lines: &lines,
                spells: &spells,
                cache: &[],
                revives: None,
                public: public.as_ref(),
                encounter: None,
                darkness: room.darkness_for(viewer),
                reviving: &reviving,
            };
            (at_sea, protocol::snapshot_bytes(&snapshot))
        })
        .collect()
}

/// The friendly ships the room keeps that a player's ship at `own` keeps in sight, as a hostile ship is kept; none before
/// it is at sea.
fn friendlies_seen(own: Option<[f64; 2]>, all: &[room::friendlies::Friendly]) -> Vec<room::friendlies::Friendly> {
    all.iter().filter(|friend| own.is_some_and(|at| friend.kept_by(at))).copied().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_player_is_sent_only_the_friendly_ships_their_ship_keeps_in_sight() {
        let friend = |traffic, x| room::friendlies::Friendly {
            traffic,
            hull: sailing::HullKind::Sloop,
            seed: 0,
            level: 0,
            sight_m: 5_000.0,
            x,
            y: 0.0,
            heading: 0.0,
            to: [0.0; 2],
            lane: None,
        };
        let all = [friend(1, 4_000.0), friend(2, 40_000.0)];
        let seen = |own| friendlies_seen(own, &all).iter().map(|ship| ship.traffic).collect::<Vec<_>>();
        assert_eq!(seen(Some([0.0, 0.0])), [1], "within 1.1 times its sight");
        assert!(seen(None).is_empty(), "none before their ship is at sea");
    }
}
