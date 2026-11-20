//! The sea room's snapshot: every ship at sea, every hostile ship, each player's fight, each player off the helm on her
//! deck, and what the sea keeps after its fights (what floats, each ship's kept hurts, what each player is told, and
//! each deck boarded).

use crate::{PlayerId, finish_snapshot, messages};
use movement::Body;
use naval::ranks::Commission;
use room::pirates::Pirate;
use room::sea::Ship;

/// Everything at sea after the sea room's tick `tick`: every ship, every captain's with her faction, rank and hull,
/// each player's fight as the naval crate's numbers (`naval::wire::view_numbers`, its other captains parted off into a
/// field of their own) with its captain's commission and hull, and each player off the helm with the number of their
/// last step taken and their body on deck.
#[must_use]
pub fn sea_snapshot_bytes(
    tick: u64,
    ships: &[(PlayerId, Ship)],
    pirates: &[Pirate],
    fights: &[(PlayerId, Vec<f64>, Commission)],
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
        .map(|(player, numbers, commission)| {
            let (view, others) = naval::wire::parted(numbers);
            let (view, faction, rank) =
                (Some(builder.create_vector(&view)), commission.faction, commission.rank.number());
            let others = (!others.is_empty()).then(|| builder.create_vector(&others));
            let hull = commission.hull().number();
            messages::SeaFight::create(
                &mut builder,
                &messages::SeaFightArgs { player: *player, view, faction, rank, others, hull },
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
        ..messages::SnapshotArgs::default()
    };
    finish_snapshot(builder, &args)
}

/// What the sea's snapshot carries beside its ships and fights: each piece of what floats (its player, its number,
/// where it floats and its kind, 0 a crate, 1 a barrel, 2 a chest), each player's ship's kept hurts with the seconds
/// her repair has left, what each player is told this tick, and each deck boarded (each boarder's number at sea with
/// theirs on her deck, her hull, and her deck room's snapshot).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SeaHarbour {
    pub flotsam: Vec<(PlayerId, u32, [f64; 2], u8)>,
    pub kept: Vec<(PlayerId, [f64; 3], f64)>,
    pub told: Vec<(PlayerId, Vec<f64>)>,
    pub decks: Vec<SeaDeck>,
}

/// A deck boarded as the snapshot carries it: each boarder's number at sea with theirs on her deck, her hull, her deck
/// room's snapshot, and the sea's ticks her won deck holds her boarders yet (none while her crew still fights).
pub type SeaDeck = (Vec<(PlayerId, PlayerId)>, u8, Vec<u8>, Option<u64>);
