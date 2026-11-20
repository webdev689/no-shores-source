//! The sea room's snapshot: every ship at sea, every hostile ship, each player's fight, each player off the helm on
//! their ship's deck, and what the sea keeps after its fights (what floats, each ship's kept hurts, what each player is
//! told, and each deck boarded), and the islands each player sees or has found.

use crate::{PlayerId, finish_snapshot, messages};
use movement::Body;
use naval::ranks::Commission;
use room::pirates::Pirate;
use room::sea::Ship;

/// Everything at sea after the sea room's tick `tick`: every ship, every captain's with its faction, rank and hull,
/// each player's fight as the naval crate's numbers (`naval::wire::view_numbers`, its other captains parted off into a
/// field of their own) with its captain's commission and hull, and each player off the helm with the number of their
/// last step taken and their body on deck.
#[must_use]
pub fn sea_snapshot_bytes(
    tick: u64,
    ships: &[(PlayerId, Ship)],
    pirates: &[Pirate],
    fights: &[room::battle::FightSeen],
    aboard: &[(PlayerId, u32, Body)],
    harbour: &SeaHarbour,
) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let each: Vec<_> = aboard
        .iter()
        .map(|&(player, acknowledged, body)| {
            let fighter = Some(builder.create_vector(&body.to_floats()));
            let anim = Some(builder.create_string(""));
            let args =
                messages::SeenArgs { player, acknowledged, anim, facing: body.facing, fighter, ..Default::default() };
            messages::Seen::create(&mut builder, &args)
        })
        .collect();
    let players = Some(builder.create_vector(&each));
    let each: Vec<_> = ships
        .iter()
        .map(|&(player, Ship { x, y, heading, rate, .. })| {
            messages::Ship::create(&mut builder, &messages::ShipArgs { player, x, y, heading, pace: rate })
        })
        .collect();
    let ships = Some(builder.create_vector(&each));
    let each: Vec<_> = pirates
        .iter()
        .map(|pirate| {
            let Pirate { id, x, y, heading, level, sight_m: sight, commission: Commission { faction, rank }, .. } =
                *pirate;
            let hull = rank.hull().number();
            let way = room::sighting::way_of(rank);
            let args =
                messages::PirateArgs { id, x, y, heading, faction, rank: rank.number(), hull, level, sight, way };
            messages::Pirate::create(&mut builder, &args)
        })
        .collect();
    let pirates = Some(builder.create_vector(&each));
    let each: Vec<_> = fights
        .iter()
        .map(|room::battle::FightSeen { player, numbers, captain: commission, may_board }| {
            let (view, others) = naval::wire::parted(numbers);
            let (view, faction, rank) =
                (Some(builder.create_vector(&view)), commission.faction, commission.rank.number());
            let others = (!others.is_empty()).then(|| builder.create_vector(&others));
            let hull = commission.hull().number();
            messages::SeaFight::create(
                &mut builder,
                &messages::SeaFightArgs { player: *player, view, faction, rank, others, hull, may_board: *may_board },
            )
        })
        .collect();
    let fights = Some(builder.create_vector(&each));
    let each: Vec<_> = harbour
        .flotsam
        .iter()
        .map(|&(player, id, [x, y], kind)| {
            messages::Flotsam::create(&mut builder, &messages::FlotsamArgs { player, id, x, y, kind })
        })
        .collect();
    let flotsam = Some(builder.create_vector(&each));
    let each: Vec<_> = harbour
        .kept
        .iter()
        .map(|&(player, [hull, sail, crew], repair_left)| {
            messages::Kept::create(&mut builder, &messages::KeptArgs { player, hull, sail, crew, repair_left })
        })
        .collect();
    let kept = Some(builder.create_vector(&each));
    let each: Vec<_> = harbour
        .told
        .iter()
        .map(|(player, numbers)| {
            let numbers = Some(builder.create_vector(numbers));
            messages::Told::create(&mut builder, &messages::ToldArgs { player: *player, numbers })
        })
        .collect();
    let told = Some(builder.create_vector(&each));
    let each: Vec<_> = harbour
        .decks
        .iter()
        .map(|(aboard, hull, snapshot, hold_left)| {
            let players: Vec<PlayerId> = aboard.iter().map(|(player, _)| *player).collect();
            let boarders: Vec<PlayerId> = aboard.iter().map(|(_, boarder)| *boarder).collect();
            let (players, boarders) = (Some(builder.create_vector(&players)), Some(builder.create_vector(&boarders)));
            let snapshot = Some(builder.create_vector(snapshot));
            let hold_left = hold_left.map_or(-1, |ticks| i16::try_from(ticks).unwrap_or(i16::MAX));
            let args = messages::DeckArgs { players, boarders, hull: *hull, snapshot, hold_left };
            messages::Deck::create(&mut builder, &args)
        })
        .collect();
    let decks = Some(builder.create_vector(&each));
    let each: Vec<_> = harbour
        .islands
        .iter()
        .map(|&IsleSeen { id, seed, at: [x, y], kind, continent, found }| {
            messages::Isle::create(&mut builder, &messages::IsleArgs { id, seed, x, y, kind, continent, found })
        })
        .collect();
    // None when there are none, so a sea without islands sends the bytes it always did.
    let islands = (!each.is_empty()).then(|| builder.create_vector(&each));
    let args = messages::SnapshotArgs {
        tick,
        players,
        ships,
        pirates,
        fights,
        flotsam,
        kept,
        told,
        decks,
        islands,
        ..messages::SnapshotArgs::default()
    };
    finish_snapshot(builder, &args)
}

/// What the sea's snapshot carries beside its ships and fights: each piece of what floats (its player, its number,
/// where it floats and its kind, 0 a crate, 1 a barrel, 2 a chest), each player's ship's kept hurts with the seconds
/// its repair has left, what each player is told this tick, and each deck boarded (each boarder's number at sea with
/// theirs on its deck, its hull, and its deck room's snapshot), and the islands the player sees or has found.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SeaHarbour {
    pub flotsam: Vec<(PlayerId, u32, [f64; 2], u8)>,
    pub kept: Vec<(PlayerId, [f64; 3], f64)>,
    pub told: Vec<(PlayerId, Vec<f64>)>,
    pub decks: Vec<SeaDeck>,
    pub islands: Vec<IsleSeen>,
}

/// A sea island as a player is told of it: its number and seed, where its middle is, its kind's number, its water's
/// continent's index, and whether they have found it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct IsleSeen {
    pub id: u32,
    pub seed: u64,
    pub at: [f64; 2],
    pub kind: u8,
    pub continent: u8,
    pub found: bool,
}

/// A deck boarded as the snapshot carries it: each boarder's number at sea with theirs on its deck, its hull, its deck
/// room's snapshot, and the sea's ticks its won deck holds its boarders yet (none while its crew still fights).
pub type SeaDeck = (Vec<(PlayerId, PlayerId)>, u8, Vec<u8>, Option<u64>);
