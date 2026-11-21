//! What a room on land's snapshots held, kept a short while: each tick's players and foes as the others see them,
//! and what happened (the fight's events, dresses changed, balls stopped) with the tick it happened. A player's
//! snapshot then holds only the players and foes that changed since the one their screen last showed, and what
//! happened since; so a snapshot lost on the way costs nothing the next does not carry again.

use combat::fighter::FighterId;
use combat::shots::Line;
use protocol::land::foe_numbers;
use protocol::pack::quantized;
use protocol::{Snapshot, UNTRIMMED_FLOATS, snapshot_bytes, standing_parts};
use room::{Event, FoeSeen, PlayerId, Room, Seen, SpellSeen};
use std::collections::{BTreeMap, VecDeque};

/// How many ticks of snapshots are kept to build on: two seconds; a screen further behind is sent everything.
const KEPT_TICKS: usize = 120;

/// One tick's players and foes, each's numbers as they cross to others (`pack::quantized`) and each player's look, and
/// each player's own fighter whole (less its trim) as it crosses to them.
#[derive(Debug, Default)]
struct Held {
    tick: u64,
    players: BTreeMap<PlayerId, Vec<u64>>,
    looks: BTreeMap<PlayerId, Vec<u8>>,
    foes: BTreeMap<FighterId, Vec<u64>>,
    own: BTreeMap<PlayerId, Vec<f64>>,
}

/// The tick being sent: everyone and everything as the room stands after it.
#[derive(Debug, Default)]
struct Now {
    tick: u64,
    players: Vec<Seen>,
    foes: Vec<FoeSeen>,
    shots: Vec<combat::Shot>,
    spells: Vec<SpellSeen>,
}

#[derive(Debug, Default)]
pub struct Sent {
    held: VecDeque<Held>,
    now: Option<Now>,
    events: VecDeque<Event>,
    dresses: VecDeque<(u64, PlayerId, String)>,
    lines: VecDeque<(u64, Line)>,
}

/// What a player's figure shows and where they stand, as bytes to tell whether it changed.
fn look_bytes(seen: &Seen) -> Vec<u8> {
    let mut bytes = seen.shown.anim.as_bytes().to_vec();
    bytes.extend(seen.shown.frame.to_le_bytes());
    bytes.extend(seen.shown.facing.to_le_bytes());
    let (standing, ticks) = standing_parts(seen.standing);
    bytes.push(standing);
    bytes.extend(ticks.to_le_bytes());
    bytes
}

impl Sent {
    /// The room's tick taken in, once whatever asks first: what happened since is kept, and how everyone stands.
    fn take(&mut self, room: &mut Room, middle: [f64; 2]) {
        let tick = room.clock();
        if self.now.as_ref().is_some_and(|now| now.tick == tick) {
            return;
        }
        self.events.extend(room.take_events());
        self.dresses.extend(room.take_dress_changes().into_iter().map(|(player, dress)| (tick, player, dress)));
        self.lines.extend(room.take_lines().into_iter().map(|line| (tick, line)));
        let now = Now {
            tick,
            players: room.seen().collect(),
            foes: room.foes_seen().collect(),
            shots: room.shots().copied().collect(),
            spells: room.spells_seen().collect(),
        };
        let own: BTreeMap<_, _> = now
            .players
            .iter()
            .map(|seen| (seen.player, seen.fighter.to_floats()[..UNTRIMMED_FLOATS].to_vec()))
            .collect();
        let players = own.iter().map(|(player, floats)| (*player, quantized(floats, middle))).collect();
        let looks = now.players.iter().map(|seen| (seen.player, look_bytes(seen))).collect();
        let foes = now.foes.iter().map(|foe| (foe.foe, quantized(&foe_numbers(foe), middle))).collect();
        self.held.push_back(Held { tick, players, looks, foes, own });
        while self.held.len() > KEPT_TICKS {
            self.held.pop_front();
        }
        let oldest = self.held.front().map_or(tick, |held| held.tick);
        self.events.retain(|event| event.tick >= oldest);
        self.dresses.retain(|(at, ..)| *at >= oldest);
        self.lines.retain(|(at, _)| *at >= oldest);
        self.now = Some(now);
    }

    /// `viewer`'s snapshot after the room's last tick: everything changed since the tick their screen last showed, or
    /// everything when that tick is no longer kept; and what happened since it, or since they joined.
    pub fn snapshot_for(&mut self, room: &mut Room, viewer: PlayerId, middle: [f64; 2]) -> Vec<u8> {
        self.take(room, middle);
        let (Some(now), Some(latest)) = (self.now.as_ref(), self.held.back()) else { return Vec::new() };
        let (shown, joined) = room.heard(viewer).map_or((0, now.tick), |(_, shown, joined)| (shown, joined));
        let base = self.held.iter().find(|held| held.tick == shown && shown < now.tick);
        let changed = |was: Option<&Vec<u64>>, is: Option<&Vec<u64>>| base.is_none() || was != is;
        let looked = |id: &PlayerId| base.is_none_or(|held| held.looks.get(id) != latest.looks.get(id));
        let players: Vec<Seen> = now
            .players
            .iter()
            .filter(|seen| {
                seen.player == viewer
                    || looked(&seen.player)
                    || changed(base.and_then(|held| held.players.get(&seen.player)), latest.players.get(&seen.player))
            })
            .cloned()
            .collect();
        let foes: Vec<FoeSeen> = now
            .foes
            .iter()
            .filter(|foe| changed(base.and_then(|held| held.foes.get(&foe.foe)), latest.foes.get(&foe.foe)))
            .copied()
            .collect();
        let gone_players: Vec<PlayerId> = base
            .map(|held| held.players.keys().filter(|id| !latest.players.contains_key(id)).copied().collect())
            .unwrap_or_default();
        let gone_foes: Vec<FighterId> = base
            .map(|held| held.foes.keys().filter(|id| !latest.foes.contains_key(id)).copied().collect())
            .unwrap_or_default();
        let since = shown.max(joined);
        let events: Vec<Event> = self.events.iter().filter(|event| event.tick > since).copied().collect();
        let dressed: Vec<(PlayerId, &str)> = self
            .dresses
            .iter()
            .filter(|(at, ..)| *at > since)
            .map(|(_, player, dress)| (*player, dress.as_str()))
            .collect();
        let lines: Vec<(u64, Line)> = self.lines.iter().filter(|(at, _)| *at > since).copied().collect();
        snapshot_bytes(&Snapshot {
            tick: now.tick,
            viewer,
            middle,
            base: base.map_or(0, |held| held.tick),
            gone_players: &gone_players,
            gone_foes: &gone_foes,
            own_base: base.and_then(|held| held.own.get(&viewer)).map(Vec::as_slice),
            base_players: base.map(|held| &held.players),
            base_foes: base.map(|held| &held.foes),
            players: &players,
            dressed: &dressed,
            foes: &foes,
            events: &events,
            shots: &now.shots,
            lines: &lines,
            spells: &now.spells,
        })
    }
}
