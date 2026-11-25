//! The Two Shores at their edges: a Bulwark claims a rift's mooring only once the company has left it.

use super::breach_tests::{at, breach};
use super::fights_tests::{begin_at, kill, put_at, won_to};
use super::*;
use crate::encounters::encounters_tests::ticks;

#[test]
fn a_bulwark_on_a_held_mooring_shuts_no_rift_but_one_left_to_it_does() {
    let (mut room, players) = won_to(Tier::Normal, 2, SHORES);
    begin_at(&mut room, &players, "hall", "plinth");
    let warden = breach(&room).fights.shores.warden.expect("the Warden stands");
    kill(&mut room, warden);
    room.tick();
    put_at(&mut room, players[0], "hall", "mooring-was");
    ticks(&mut room, shores::OPENS_TICKS + 1);
    assert!(breach(&room).fights.shores.rifts[0].open, "held open");
    let mooring = at(&room, "hall", "mooring-was");
    let mut breach_box = room.breach.take().expect("run");
    let bulwark = room.stand_breach_foe(&mut breach_box, (::foes::roster::BULWARK, ::foes::Rank::Elite), mooring, None);
    room.breach = Some(breach_box);
    assert!(bulwark.is_some(), "a Bulwark on the mooring");
    room.tick();
    assert!(breach(&room).fights.shores.rifts[0].open, "held, the rift stays open");
    put_at(&mut room, players[0], "hall", "plinth");
    room.tick();
    assert!(!breach(&room).fights.shores.rifts[0].open, "left to the Bulwark, it shuts");
}
