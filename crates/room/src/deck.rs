//! A player off the helm, aboard their own ship: their body walks its deck in its own frame (x to its starboard, y to
//! its stern, the origin amidships), by the movement crate's law on the deck's grid of heights, so its way and the
//! swell never move it. Their inputs are numbered and taken in order, as a land room takes them: never faster than
//! the clock and its slack allow, and a few a tick to catch up after a stall.

use crate::players::{CATCH_UP, SLACK_TICKS, VIEW_LAG, WAITING_LIMIT, resumed};
use movement::{Body, Controls, Heights, Mode, TICK_SECONDS, step_body};
use std::collections::VecDeque;

/// How near the spot behind a ship's wheel a body stands to take the helm, metres.
pub const WHEEL_REACH_M: f64 = 0.8;

/// A ship's deck: its grid of heights, the spot behind its wheel (x, y in its frame) where the helm is kept, and the
/// grid's bounds (its north-west and south-east corners in its frame).
#[derive(Clone, Debug, PartialEq)]
pub struct Deck {
    pub heights: Heights,
    pub helm: [f64; 2],
    pub bounds: [[f64; 2]; 2],
}

/// Why a step on deck was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WalkRefused {
    /// The player is at the helm, or not at sea.
    NotAboard,
    /// Steps are numbered 1, 2, 3… from the helm left, and must arrive in that order.
    OutOfOrder { expected: u32, got: u32 },
    /// Controls that are not numbers, or ask for more than a body's whole pace.
    BadControls,
}

/// A player's body on deck, the number of their last step taken, the steps waiting, the room's tick they left the
/// helm at with how many ticks have been theirs since, which together bound how fast steps are taken, whether they
/// were stood out since their last step taken (or have taken none), and the way they last looked.
#[derive(Clone, Debug)]
pub struct Aboard {
    pub body: Body,
    pub acknowledged: u32,
    waiting: VecDeque<(u32, Controls)>,
    since: u64,
    taken: u64,
    stalled: bool,
    yaw: f64,
}

impl Aboard {
    /// A player who has just left the helm at the room's tick `clock`: standing behind the wheel, facing the bow.
    #[must_use]
    pub fn left_helm(deck: &Deck, clock: u64) -> Self {
        let [x, y] = deck.helm;
        let body = deck.heights.standing(x, y);
        Self { body, acknowledged: 0, waiting: VecDeque::new(), since: clock, taken: 0, stalled: true, yaw: 0.0 }
    }

    /// Keeps a step's controls for the ticks to come, in order. Past `WAITING_LIMIT` waiting, the oldest is let go
    /// as taken, so a flood never refuses one and never breaks the order. A body aboard rides nothing.
    pub fn walk(&mut self, sequence: u32, controls: Controls) -> Result<(), WalkRefused> {
        let numbers = [controls.forward, controls.sideways, controls.yaw];
        if numbers.iter().any(|number| !number.is_finite())
            || controls.forward.abs() > 1.0
            || controls.sideways.abs() > 1.0
        {
            return Err(WalkRefused::BadControls);
        }
        let expected = self.acknowledged + self.waiting.len() as u32 + 1;
        if sequence != expected {
            return Err(WalkRefused::OutOfOrder { expected, got: sequence });
        }
        if self.waiting.len() >= WAITING_LIMIT
            && let Some((dropped, _)) = self.waiting.pop_front()
        {
            self.acknowledged = dropped;
        }
        self.waiting.push_back((sequence, Controls { mounted: false, ..controls }));
        Ok(())
    }

    /// One room tick, the room's clock now `clock`: the steps due are taken in order, no more than `CATCH_UP`, and no
    /// more since the helm was left than the ticks since and their slack. A tick with none to take, a view's lag behind
    /// the clock, is stood out where the body is, as a land room stands out a player, so time away is never banked;
    /// and as there, the steps coming again count from then (`resumed`).
    pub fn tick(&mut self, deck: &Deck, clock: u64) {
        let due = self.waiting.len().min(CATCH_UP).min(self.allowed(clock));
        for _ in 0..due {
            let Some((sequence, controls)) = self.waiting.pop_front() else { break };
            self.body = step_body(&self.body, &controls, &[], &deck.heights, TICK_SECONDS);
            (self.acknowledged, self.yaw) = (sequence, controls.yaw);
            self.taken += 1;
            if std::mem::take(&mut self.stalled) {
                self.taken = resumed(self.taken, clock.saturating_sub(self.since), self.waiting.len());
            }
        }
        if due == 0 && clock.saturating_sub(self.since) > self.taken + VIEW_LAG {
            let still = Controls { yaw: self.yaw, ..Controls::default() };
            self.body = step_body(&self.body, &still, &[], &deck.heights, TICK_SECONDS);
            (self.taken, self.stalled) = (self.taken + 1, true);
        }
    }

    /// How many steps the clock allows taken by `clock`: the ticks since the helm was left and their slack, less those
    /// taken.
    fn allowed(&self, clock: u64) -> usize {
        let allowed = (clock.saturating_sub(self.since) + SLACK_TICKS).saturating_sub(self.taken);
        usize::try_from(allowed).unwrap_or(usize::MAX)
    }

    /// Whether the body stands at the wheel, near enough the helm's spot to take it, once the steps waiting that the
    /// clock allows by `clock` are taken: where the player's own screen has them when they ask for the helm.
    #[must_use]
    pub fn at_wheel(&self, deck: &Deck, clock: u64) -> bool {
        let body = self
            .waiting
            .iter()
            .take(self.allowed(clock))
            .fold(self.body, |body, (_, controls)| step_body(&body, controls, &[], &deck.heights, TICK_SECONDS));
        let [x, y] = deck.helm;
        let (east, south) = (body.x - x, body.y - y);
        body.mode == Mode::Ground && (east * east + south * south).sqrt() <= WHEEL_REACH_M
    }
}

/// A deck for tests: 2 m across and 7 m long in cells of 0.1 m, level 0.8 m over its waterline, its mast a cell
/// amidships, and its helm 2.7 m aft.
#[cfg(test)]
#[must_use]
pub fn test_deck() -> Deck {
    let (columns, rows) = (20, 70);
    let mut heights = vec![Some(0.8); columns * rows];
    heights[35 * columns + 10] = None;
    let heights = Heights::new(-1.0, -3.5, 0.1, columns, rows, heights).unwrap_or_else(|| unreachable!());
    Deck { heights, helm: [0.0, 2.7], bounds: [[-1.0, -3.5], [1.0, 3.5]] }
}

#[cfg(test)]
#[path = "deck_tests.rs"]
mod tests;
