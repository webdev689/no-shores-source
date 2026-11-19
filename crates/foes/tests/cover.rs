//! Cover and flanking: a shooter with a wall near fights from behind it, drawing in cover and stepping out to shoot;
//! it picks again when its target moves behind a block; two shooters never share a post; each weapon has its own
//! distance; waiting foes on the ring stand to their target's sides more than its front; and with no cover near,
//! a shooter fights as it always has.

mod common;

use combat::Happening;
use combat::fighter::Action;
use combat::sight::{clear_line, off};
use common::{Room, SWORDSMAN, standing_still, still, watching};
use core::f64::consts::{FRAC_PI_2, PI};
use foes::Rank::{Elite, Major};
use movement::Block;

const PLAYER: u32 = 1;
const CROSSBOWMAN: u8 = 3;
const MARKSMAN: u8 = 5;
const PISTOLEER: u8 = 9;

/// A wall 4 m long and higher than a head, 13 m north of the player and west of the line to the foe.
fn wall() -> Block {
    Block { min_x: -6.0, min_y: -13.5, max_x: -2.0, max_y: -13.0, top: 2.5, bottom: 0.0 }
}

/// Whether nothing stands between two fighters' chests.
fn line(room: &Room, from: u32, to: u32) -> bool {
    clear_line(&room.blocks, room.fighter(from).chest(), room.fighter(to).chest())
}

fn loosed(room: &Room, id: u32) -> Vec<u64> {
    let shots =
        room.happenings.iter().filter(|(_, by, happening)| *by == id && matches!(happening, Happening::Loosed(_)));
    shots.map(|(tick, _, _)| *tick).collect()
}

fn hits(room: &Room, id: u32) -> usize {
    room.verdicts.iter().filter(|(_, by, on, _)| *by == id && *on == PLAYER).count()
}

/// How far a point stands from a block's footprint.
fn from_block(block: &Block, x: f64, y: f64) -> f64 {
    let east = (block.min_x - x).max(x - block.max_x).max(0.0);
    let south = (block.min_y - y).max(y - block.max_y).max(0.0);
    (east * east + south * south).sqrt()
}

fn crossbowman_by_the_wall(seed: u64) -> Room {
    Room::new(seed).course(vec![wall()]).player(PLAYER, 0.0, 0.0, 0.0).foe(10, CROSSBOWMAN, Major, 0.0, -15.0, PI)
}

#[test]
fn a_crossbowman_with_a_wall_near_takes_the_covered_spot_with_a_line_not_the_open_one() {
    let mut open = Room::new(5).player(PLAYER, 0.0, 0.0, 0.0).foe(10, CROSSBOWMAN, Major, 0.0, -15.0, PI);
    open.blocks = vec![wall()];
    open.run(900, &mut watching(10));
    // Noticing the player, it walks a step or so toward it before it is alert; then it shoots from there.
    assert!(open.distance(PLAYER, 10) > 13.5, "with no spots it shoots from where it stands, in the open");
    let mut room = crossbowman_by_the_wall(5);
    let (mut hidden, mut far_from_wall) = (0, 0.0_f64);
    for tick in 0..900 {
        room.step(&mut watching(10));
        let body = room.fighter(10).body;
        if tick >= 300 {
            far_from_wall = far_from_wall.max(from_block(&wall(), body.x, body.y));
            hidden += usize::from(!line(&room, 10, PLAYER));
        }
    }
    assert!(far_from_wall < 2.4, "from the wall's end it fights, within its cover's reach: {far_from_wall}");
    assert!(hidden > 200, "and much of the time hidden behind it: {hidden} of 600 ticks");
    assert!(loosed(&room, 10).len() >= 4 && hits(&room, 10) >= 3, "and its bolts find the player");
}

#[test]
fn it_draws_behind_its_cover_and_steps_out_to_shoot_then_falls_back_to_reload() {
    let mut room = crossbowman_by_the_wall(6);
    let (mut raised_hidden, mut raised_open, mut loosed_open) = (0, 0, 0);
    let mut aiming = true;
    let mut lines = Vec::new();
    for _ in 0..1500 {
        let seen = line(&room, 10, PLAYER);
        lines.push(seen);
        let tick = room.tick;
        room.step(&mut watching(10));
        let aim = room.foe_intents(10).last().expect("it thought").1.combat.aim;
        if aim && !aiming && tick > 120 {
            if seen { raised_open += 1 } else { raised_hidden += 1 }
        }
        aiming = aim;
        if loosed(&room, 10).last() == Some(&tick) {
            loosed_open += usize::from(seen);
        }
    }
    let shots = loosed(&room, 10);
    assert!(
        raised_hidden >= 4 && raised_open == 0,
        "it raises its crossbow behind cover: {raised_hidden}, {raised_open}"
    );
    assert!(shots.len() >= 5 && loosed_open == shots.len(), "and looses only out on the line: {shots:?}");
    let back = |shot: &u64| lines.get(*shot as usize + 60).is_some_and(|seen| !seen);
    assert!(shots.iter().filter(|shot| back(shot)).count() >= shots.len() - 1, "a second on, it is back behind cover");
}

/// A pillar that hides the player at 6 m east of the start from the crossbowman's first post.
fn pillar() -> Block {
    Block { min_x: 2.5, min_y: -5.5, max_x: 4.5, max_y: -4.5, top: 2.5, bottom: 0.0 }
}

#[test]
fn it_picks_again_when_its_target_moves_behind_a_block() {
    let mut room = Room::new(5).course(vec![wall(), pillar()]).player(PLAYER, 0.0, 0.0, 0.0).foe(
        10,
        CROSSBOWMAN,
        Major,
        0.0,
        -15.0,
        PI,
    );
    room.run(400, &mut watching(10));
    let first = room.fighter(10).body;
    let mut walk_east = |room: &Room, me: u32| {
        let mut intent = standing_still(room.toward(me, 10));
        if room.fighter(me).body.x < 6.0 {
            intent.controls.yaw = FRAC_PI_2;
            intent.controls.forward = 1.0;
        }
        intent
    };
    room.run(100, &mut walk_east);
    let (hits_before, mut hidden) = (hits(&room, 10), 0);
    for _ in 0..1300 {
        room.step(&mut walk_east);
        hidden += usize::from(!line(&room, 10, PLAYER));
    }
    let now = room.fighter(10).body;
    let moved = combat::sight::apart([now.x, now.y], [first.x, first.y]);
    assert!(moved > 3.0, "it left its first post: {moved}");
    assert!(from_block(&wall(), now.x, now.y) < 2.4, "for another behind the wall");
    assert!(hits(&room, 10) >= hits_before + 4, "and shoots the player behind the pillar from it");
    assert!(hidden > 500, "hiding between shots: {hidden}");
}

#[test]
fn shooters_of_a_room_pick_their_posts_one_a_tick() {
    let long = Block { min_x: -4.0, min_y: -13.5, max_x: 4.0, max_y: -13.0, top: 2.5, bottom: 0.0 };
    let mut room = Room::new(7)
        .course(vec![long])
        .player(PLAYER, 0.0, 0.0, 0.0)
        .foe(10, CROSSBOWMAN, Major, 6.0, -16.0, PI)
        .foe(11, CROSSBOWMAN, Major, -6.0, -16.0, PI)
        .alert(10, PLAYER)
        .alert(11, PLAYER);
    let mut held = vec![room.board.posts_but(0).count()];
    for _ in 0..120 {
        room.step(&mut still(0.0));
        held.push(room.board.posts_but(0).count());
    }
    assert_eq!(held.last(), Some(&2), "both take a post: {held:?}");
    assert!(held.windows(2).all(|pair| pair[1] <= pair[0] + 1), "one a tick: {held:?}");
}

#[test]
fn two_shooters_never_share_a_post() {
    // A wall 8 m long squarely before the player: either end hides a post, the east end nearer both shooters.
    let long = Block { min_x: -4.0, min_y: -13.5, max_x: 4.0, max_y: -13.0, top: 2.5, bottom: 0.0 };
    let mut room = Room::new(7)
        .course(vec![long])
        .player(PLAYER, 0.0, 0.0, 0.0)
        .foe(10, CROSSBOWMAN, Major, 6.0, -16.0, PI)
        .foe(11, CROSSBOWMAN, Major, 7.0, -16.5, PI);
    let mut nearest = f64::MAX;
    let mut hidden = [0, 0];
    for tick in 0..1200 {
        room.step(&mut still(0.0));
        if tick >= 400 {
            nearest = nearest.min(room.distance(10, 11));
            for (index, id) in [10, 11].into_iter().enumerate() {
                hidden[index] += usize::from(!line(&room, id, PLAYER));
            }
        }
    }
    assert!(nearest > 2.0, "they keep apart: {nearest}");
    assert!(hidden.iter().all(|hidden| *hidden > 250), "and each fights from cover: {hidden:?}");
    assert!(hits(&room, 10) >= 3 && hits(&room, 11) >= 3, "and shoots");
}

/// Walls 4 m long 9, 15 and 22 m north of the player, west, east and west of the line to it: posts behind them stand
/// about 11, 17 and 24 m from the player.
fn walls_north() -> Vec<Block> {
    [(-6.0, 9.0), (2.0, 15.0), (-6.0, 22.0)]
        .into_iter()
        .map(|(west, north)| Block {
            min_x: west,
            min_y: -north - 0.5,
            max_x: west + 4.0,
            max_y: -north,
            top: 2.5,
            bottom: 0.0,
        })
        .collect()
}

/// How far from the player a shooter of a type fights, on average, among walls. It starts 16.5 m north of the player
/// and, suspicious, walks a step or so toward it before it is alert, so it picks its post from about 15 m.
fn stands_at(number: u8, rank: foes::Rank) -> f64 {
    let mut room =
        Room::new(4).course(walls_north()).player(PLAYER, 0.0, 0.0, 0.0).foe(10, number, rank, 0.0, -16.5, PI);
    let mut sum = 0.0;
    for tick in 0..1200 {
        room.step(&mut watching(10));
        if tick >= 600 {
            sum += room.distance(PLAYER, 10);
        }
    }
    assert!(hits(&room, 10) >= 2, "type {number} shoots the player from cover");
    sum / 600.0
}

#[test]
fn the_marksman_stands_farther_than_a_crossbowman_and_a_pistoleer_nearer() {
    let (pistoleer, crossbowman, marksman) =
        (stands_at(PISTOLEER, Major), stands_at(CROSSBOWMAN, Major), stands_at(MARKSMAN, Elite));
    assert!(pistoleer < 12.5, "a pistoleer near, within its 8 to 12 m: {pistoleer}");
    assert!((15.0..=19.0).contains(&crossbowman), "a crossbowman within its 12 to 20 m: {crossbowman}");
    assert!(marksman > 21.0 && marksman > crossbowman + 4.0, "the marksman farther, past 21 m: {marksman}");
}

/// The shares of ticks, over a long fight, that the waiting stand within 45 degrees of a still player's face and more
/// than 60 degrees off it: four swordsmen who start before its face, two waiting their turn at any time.
fn ring_shares(seed: u64) -> (f64, f64) {
    let mut room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0);
    let foes = [10, 11, 12, 13];
    for (id, degrees) in foes.into_iter().zip([-30.0_f64, -10.0, 10.0, 30.0]) {
        let bearing = degrees.to_radians();
        room = room.foe(id, SWORDSMAN, Major, 6.0 * libm::sin(bearing), -6.0 * libm::cos(bearing), PI);
    }
    let (mut front, mut sides, mut waiting) = (0_u32, 0_u32, 0_u32);
    for tick in 0..3600 {
        room.step(&mut still(0.0));
        for id in foes.into_iter().filter(|_| tick >= 600) {
            let fighting = matches!(room.fighter(id).action, Action::Attack(_) | Action::Telegraph(_));
            if fighting || !(2.2..=4.2).contains(&room.distance(PLAYER, id)) {
                continue;
            }
            let off_face = off(room.toward(PLAYER, id), 0.0).to_degrees();
            waiting += 1;
            front += u32::from(off_face < 45.0);
            sides += u32::from(off_face > 60.0);
        }
    }
    (f64::from(front) / f64::from(waiting), f64::from(sides) / f64::from(waiting))
}

#[test]
fn waiting_foes_stand_on_the_ring_to_their_target_s_sides_more_than_before_its_face() {
    for seed in [3, 8] {
        let (front, sides) = ring_shares(seed);
        assert!(front < 0.1 && sides > 0.75, "seed {seed}: {front} before its face, {sides} to its sides");
    }
}

/// A crossbowman's whole fight with a player who comes close and stands, on a course or with no spots at all.
fn open_fight(course: bool) -> Vec<(u64, u32, combat::Intent)> {
    let room = Room::new(9);
    let mut room = if course { room.course(Vec::new()) } else { room };
    room = room.player(PLAYER, 0.0, 0.0, 0.0).foe(10, CROSSBOWMAN, Major, 0.0, -12.0, PI);
    room.run(300, &mut watching(10));
    room.set(PLAYER, |player| player.body.y = -8.0);
    room.run(900, &mut watching(10));
    room.intents
}

#[test]
fn on_open_ground_with_no_cover_a_shooter_fights_as_with_no_spots() {
    let (baked, bare) = (open_fight(true), open_fight(false));
    assert_eq!(baked, bare);
    assert!(baked.iter().any(|(_, _, intent)| intent.combat.shoot), "a fight, not a standoff");
}

fn two_shooters(seed: u64) -> Vec<(u64, u32, combat::Intent)> {
    let mut room = crossbowman_by_the_wall(seed).foe(11, CROSSBOWMAN, Major, -1.0, -16.0, PI);
    room.run(900, &mut watching(10));
    room.intents
}

#[test]
fn the_same_seed_plays_the_same_fight_from_cover() {
    assert_eq!(two_shooters(21), two_shooters(21));
    assert_ne!(two_shooters(21), two_shooters(22));
}

#[test]
fn a_shooter_on_the_near_side_of_its_cover_goes_round_it_rather_than_into_it() {
    let mut room = Room::new(5)
        .course(vec![wall()])
        .player(PLAYER, 0.0, 0.0, 0.0)
        .foe(10, CROSSBOWMAN, Major, -4.0, -12.2, PI)
        .alert(10, PLAYER);
    let mut behind = 0;
    for tick in 0..600 {
        room.step(&mut watching(10));
        if tick >= 200 && room.fighter(10).body.y < wall().min_y {
            behind += 1;
        }
    }
    assert!(behind > 150, "behind its wall for much of the fight, not pressed to its near face: {behind}");
}

#[test]
fn a_shooter_backs_off_from_each_bad_hurt_not_only_the_first() {
    use foes::brain::Plan;
    let mut room = Room::new(5)
        .course(vec![wall()])
        .player(PLAYER, 0.0, 0.0, 0.0)
        .foe(10, CROSSBOWMAN, foes::Rank::Minor, 0.0, -16.5, PI)
        .alert(10, PLAYER);
    room.run(400, &mut watching(10));
    for hurt in 1..=2 {
        assert_ne!(room.brain(10).plan(), Plan::Backoff, "its last back-off has run out before hurt {hurt}");
        room.set(10, |crossbowman| crossbowman.health -= 0.3 * crossbowman.health_max);
        let mut backed_off = false;
        for _ in 0..180 {
            room.step(&mut watching(10));
            backed_off |= room.brain(10).plan() == Plan::Backoff;
        }
        assert!(backed_off, "it backs off from bad hurt {hurt}");
        room.run(900, &mut watching(10));
    }
}

#[test]
fn a_shooter_caught_and_fighting_close_gives_its_post_up() {
    let mut room = crossbowman_by_the_wall(5);
    room.run(400, &mut watching(10));
    assert_eq!(room.board.posts_but(0).count(), 1, "it holds a post");
    // The player keeps a step from it, on its open side: it cannot outwalk them.
    for _ in 0..600 {
        let at = room.fighter(10).body;
        let east = if at.x < -4.0 { -1.0 } else { 1.0 };
        room.set(PLAYER, |player| (player.body.x, player.body.y) = (at.x + east, at.y));
        room.step(&mut watching(10));
    }
    assert!(!room.swings(10).is_empty(), "caught, it fights close");
    assert_eq!(room.board.posts_but(0).count(), 0, "and its post is free for another");
}

/// Routes as the room's, but any way to a place west of x = 0 walks four times as far, as round a fence.
struct WestIsFar(Box<dyn foes::Routes>);

impl foes::Routes for WestIsFar {
    fn next_point(&self, from: [f64; 3], to: [f64; 3]) -> Option<[f64; 3]> {
        self.0.next_point(from, to)
    }

    fn length(&self, from: [f64; 3], to: [f64; 3]) -> Option<f64> {
        self.0.length(from, to).map(|walk| if to[0] < 0.0 { walk * 4.0 } else { walk })
    }
}

/// The side of the line to the player a crossbowman fights from, between walls either side, starting nearer the west
/// one: the mean of its x over its fight.
fn side_it_takes(west_is_far: bool) -> f64 {
    let east = Block { min_x: 2.0, max_x: 6.0, ..wall() };
    let mut room = Room::new(5).course(vec![wall(), east]).player(PLAYER, 0.0, 0.0, 0.0).foe(
        10,
        CROSSBOWMAN,
        Major,
        -1.0,
        -15.0,
        PI,
    );
    if west_is_far {
        let routes = std::mem::replace(&mut room.routes, Box::new(foes::Straight));
        room.routes = Box::new(WestIsFar(routes));
    }
    room.run(300, &mut watching(10));
    let mut sum = 0.0;
    for _ in 0..600 {
        room.step(&mut watching(10));
        sum += room.fighter(10).body.x;
    }
    sum / 600.0
}

#[test]
fn a_post_s_walk_is_costed_by_the_route_there_not_a_straight_line() {
    assert!(side_it_takes(false) < -1.0, "the west wall is nearer");
    assert!(side_it_takes(true) > 1.0, "but not when the way round to it is long");
}

#[test]
fn a_shooter_at_its_post_steps_out_to_aim_whenever_its_turn_is_an_aimed_shot() {
    let mut room = crossbowman_by_the_wall(6);
    let mut aimed_out = 0;
    for _ in 0..3600 {
        let seen = line(&room, 10, PLAYER);
        room.step(&mut watching(10));
        let intent = room.foe_intents(10).last().expect("it thought").1;
        if intent.combat.telegraph.is_some_and(|order| order.shape == combat::shapes::Shape::Aimed) {
            assert!(seen, "it aims out on the line");
            aimed_out += 1;
        }
    }
    assert!(aimed_out >= 3, "a third of its turns are aimed shots from its post: {aimed_out} in a minute");
}
