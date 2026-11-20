//! Foes waiting their turn on a ring round a player who stands by a block: at a wall's face and its end, in a gap
//! between two blocks, beside a pillar and a crate, and in a corner. A waiting foe's place moves round its ring as the
//! ring crowds, and it steps there with no route, so these watch for it taking hold of a block, standing on one, or
//! standing pressed into a face, and for places a block hides from its target.

use super::*;
use ::foes::Role;
use ::foes::brain::Plan;
use ::foes::roster::{COLLECTOR, CROSSBOWMAN, ENFORCER, MARKSMAN, REEVE, RUNNER};
use combat::Intent;
use combat::sight::{bearing, clear_line, off};
use core::f64::consts::{FRAC_PI_2, PI, TAU};
use movement::blocks::ground_at;
use movement::step::{CLIMB_SQUARE, square_into};
use movement::{Block, Mode, TUNING};

const MELEE: [u8; 4] = [COLLECTOR, RUNNER, ENFORCER, REEVE];
const MIXED: [u8; 4] = [COLLECTOR, CROSSBOWMAN, ENFORCER, MARKSMAN];

/// What a run measured.
#[derive(Default, Debug, Clone, Copy)]
struct Measured {
    /// Times a foe took hold of a block: hung from, climbed, mantled or vaulted it.
    grabs: u32,
    /// Foe-ticks on a block, stood on its top or held to its side.
    on_block: u32,
    /// Waiting foe-ticks touching a block's face too high to step onto.
    touching: u32,
    /// Of those, ticks it went nowhere, its last step bearing near square into the face: pressed into it.
    pressed: u32,
    /// Waiting foe-ticks with a block between its chest and its target's.
    hidden: u32,
    /// Waiting foe-ticks in all.
    waiting: u32,
    /// Blows and other events the foes landed on the player.
    blows: u32,
}

/// A case: its blocks, where the player stands, the arc the foes come from, their types, how many, and the seed.
type Case = (Vec<Block>, (f64, f64), (f64, f64), &'static [u8], u32, u32);

/// A block 4 m tall, too tall for any foe to grab from the ground.
fn wall(min_x: f64, min_y: f64, max_x: f64, max_y: f64) -> Block {
    Block { min_x, min_y, max_x, max_y, top: 4.0, bottom: 0.0 }
}

/// Whether a body in this mode has hold of a block: hangs from it, climbs it, or goes over it.
fn holding(mode: Mode) -> bool {
    matches!(mode, Mode::Hang | Mode::Climb | Mode::Mantle | Mode::Vault)
}

/// A player standing still at `player` among `blocks`, beset for 30 s by `count` foes of `types` coming in from an arc
/// round them (its middle as a bearing from the player, 0 toward -y, and its width), each foe placed within its share
/// of the arc by the seed.
fn run(blocks: Vec<Block>, player: (f64, f64), from: (f64, f64), types: &[u8], count: u32, seed: u32) -> Measured {
    let mut room = Room::new(blocks, player);
    room.world_seed ^= u64::from(seed).wrapping_mul(0x9e37_79b9_7f4a_7c15);
    let player_id = room.join().expect("a room with space");
    let foes: Vec<FighterId> = (0..count)
        .map(|index| {
            let share = (f64::from(index) + 0.2 + 0.3 * f64::from(seed % 3)) / f64::from(count) - 0.5;
            let turn = from.0 + from.1 * share;
            let far = 10.0 + 2.0 * f64::from(index % 3);
            let (x, y) = (player.0 + far * libm::sin(turn), player.1 - far * libm::cos(turn));
            let at = room.nav.nearest_point([x, y, 0.0]).unwrap_or([x, y, 0.0]);
            let found = ::foes::foe_type(types[index as usize % types.len()]).expect("a type");
            room.stand_foe(found, ::foes::Rank::Major, at, bearing([at[0], at[1]], [player.0, player.1]), None)
        })
        .collect();
    let (mut measured, mut was) = (Measured::default(), BTreeMap::new());
    for sequence in 1..=60 * 30 {
        room.input(player_id, Input { sequence, intent: Intent::default(), seen: room.clock(), ..Input::default() })
            .expect("an input");
        let before: BTreeMap<FighterId, (f64, f64)> =
            room.foes.iter().map(|(id, foe)| (*id, (foe.fighter.body.x, foe.fighter.body.y))).collect();
        room.tick();
        let landed = room.take_events().into_iter().filter(|event| foes.contains(&event.striker));
        measured.blows += landed.filter(|event| event.defender == player_id).count() as u32;
        let target = room.players.get_mut(&player_id).expect("the player");
        target.fighter.health = target.fighter.health_max;
        let chest = target.fighter.chest();
        for id in &foes {
            let Some(foe) = room.foes.get(id) else { continue };
            let body = foe.fighter.body;
            let held = holding(body.mode);
            measured.grabs += u32::from(held && !was.insert(*id, body.mode).is_some_and(holding));
            // A charge's leap lifts a foe off the ground with no block under it.
            let over = ground_at(&room.blocks, &room.floor, body.x, body.y, body.z) > 0.05;
            measured.on_block += u32::from(held || (over && body.z > 0.05));
            // Waiting its turn on a ring round the player: a foe yet to notice them waits on none, and a shooter
            // stands off or hides against its cover instead.
            let brain = &foe.brain;
            let waiting =
                brain.plan() == Plan::Wait && brain.target() == Some(player_id) && brain.role() != Role::Archer;
            if !waiting || body.mode != Mode::Ground {
                continue;
            }
            measured.waiting += 1;
            measured.hidden += u32::from(!clear_line(&room.blocks, foe.fighter.chest(), chest));
            let touching = room.blocks.iter().find(|block| {
                let out_x = (block.min_x - body.x).max(body.x - block.max_x).max(0.0);
                let out_y = (block.min_y - body.y).max(body.y - block.max_y).max(0.0);
                block.top > body.z + TUNING.step && libm::hypot(out_x, out_y) < TUNING.radius + 0.02
            });
            if let Some(block) = touching {
                measured.touching += 1;
                let (x, y) = before.get(id).copied().unwrap_or((body.x, body.y));
                let into = off(body.facing, square_into(block, &body)) <= CLIMB_SQUARE;
                measured.pressed += u32::from(into && libm::hypot(body.x - x, body.y - y) < 1e-6);
            }
        }
    }
    measured
}

#[test]
fn foes_waiting_round_a_player_by_a_block_never_take_hold_of_it_nor_press_into_it() {
    // A flanker's place drifting round a wall's end onto its far face; places drifting behind a pillar and into a
    // gap's sides; a captain's charge landing it against a crate; places in a corner too near a face to stand on.
    let long = wall(-20.0, -1.0, 20.0, 1.0);
    let gap = vec![wall(-12.0, -1.0, -1.2, 1.0), wall(1.2, -1.0, 12.0, 1.0)];
    let corner = vec![wall(-10.0, -1.0, 10.0, 1.0), wall(-1.0, 1.0, 1.0, 12.0)];
    let crate_block = Block { min_x: -1.0, min_y: -1.0, max_x: 1.0, max_y: 1.0, top: 1.1, bottom: 0.0 };
    let cases: [Case; 8] = [
        (vec![long], (0.0, 1.6), (PI, PI), &MIXED, 12, 0),
        (vec![long], (0.0, 1.6), (PI, PI), &MELEE, 6, 2),
        (vec![long], (20.6, 1.6), (FRAC_PI_2, PI * 1.5), &MELEE, 6, 1),
        (gap, (0.0, 0.0), (0.0, TAU), &MELEE, 16, 0),
        (vec![wall(-0.5, -0.5, 0.5, 0.5)], (0.0, 1.2), (0.0, TAU), &MELEE, 16, 0),
        (vec![crate_block], (0.0, 1.6), (0.0, TAU), &MELEE, 12, 0),
        (corner.clone(), (1.6, 1.6), (PI * 0.75, FRAC_PI_2), &MELEE, 6, 0),
        (corner, (1.6, 1.6), (PI * 0.75, FRAC_PI_2), &MELEE, 16, 0),
    ];
    let mut all = Measured::default();
    for (blocks, player, from, types, count, seed) in cases {
        let one = run(blocks, player, from, types, count, seed);
        assert!(one.grabs == 0 && one.on_block == 0, "at {player:?}, {count} foes, seed {seed}: {one:?}");
        all.touching += one.touching;
        all.pressed += one.pressed;
        all.hidden += one.hidden;
        all.waiting += one.waiting;
        all.blows += one.blows;
    }
    // A foe may touch a face for a tick as it comes round; held pressed into one, it would stand there for seconds.
    assert!(all.pressed <= 30, "waiting foes stood pressed into a face: {all:?}");
    // Hidden from their target only on their way round a block to an open place: under 8 in 100 of their ticks.
    assert!(all.hidden * 100 <= all.waiting * 8, "waiting foes stood hidden from their target too long: {all:?}");
    // And they fight on: eight runs of 30 s land over 170 blows.
    assert!(all.blows >= 170, "foes struck {} times", all.blows);
}
