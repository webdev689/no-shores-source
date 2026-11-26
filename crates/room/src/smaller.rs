//! The smaller groups a patrol stands beside its bands, after the owner's "enemies should come in varied groups in
//! patrol ... The largest groups being what we have now, and then smaller varied groups": a sentry, a scout, a
//! Collector and his Runner, a shield and a bow, two bows on watch, and a Collector's round. A patrol's square stands
//! two or three of them beside its bands. A site's group is a band: a smaller one up a run's ledge, facing away, is
//! not met by a player walking the run.

use super::{Group, draws_of, index};
use crate::NodeKind;
use ::foes::Rank::{self, Major, Minor};
use ::foes::roster::{COLLECTOR, CROSSBOWMAN, RUNNER};
use naval::random::Mulberry32;

/// Each smaller group: its foes, the first leading, and whether it holds its post, a watch facing the landing, rather
/// than walking a beat.
pub(crate) const SMALLER: [(&[(u8, Rank)], bool); 6] = [
    (&[(CROSSBOWMAN, Major)], true),
    (&[(RUNNER, Major)], false),
    (&[(COLLECTOR, Major), (RUNNER, Minor)], false),
    (&[(COLLECTOR, Major), (CROSSBOWMAN, Minor)], false),
    (&[(CROSSBOWMAN, Major), (CROSSBOWMAN, Minor)], true),
    (&[(COLLECTOR, Major), (RUNNER, Minor), (RUNNER, Minor)], false),
];
/// A patrol's square stands at most this many as its room opens, its bands and the smaller groups beside them, so
/// the room keeps room for its territories and its quests.
pub(crate) const SQUARE_MOST: usize = 16;
/// The smaller groups beside a patrol's bands are drawn from a stream of their own, leaving the bands' draws untouched.
const SMALL_STREAM: u64 = 0x736d_616c_6c65_7273;

/// One of the smaller groups, drawn.
fn smaller(draws: &mut Mulberry32) -> Group {
    let (members, holds) = SMALLER[index(draws, SMALLER.len())];
    Group { members: members.to_vec(), leads: holds, farthest: false, holds }
}

/// Beside a patrol's bands of `stood` foes, two or three of the smaller groups, those that keep its square within
/// SQUARE_MOST; none beside any other kind of node's.
pub(super) fn beside_bands(kind: NodeKind, seed: u64, mut stood: usize) -> Vec<Group> {
    if !matches!(kind, NodeKind::Patrol) {
        return Vec::new();
    }
    let mut draws = draws_of(seed ^ SMALL_STREAM);
    let drawn: Vec<Group> = (0..2 + usize::from(draws.draw() < 0.5)).map(|_| smaller(&mut draws)).collect();
    drawn
        .into_iter()
        .filter(|group| {
            let fits = stood + group.members.len() <= SQUARE_MOST;
            stood += if fits { group.members.len() } else { 0 };
            fits
        })
        .collect()
}
