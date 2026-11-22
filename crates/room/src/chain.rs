//! The player's swings chain on the room's word, side cut, overhead and thrust (`client/src/combat/fighting.ts`'s
//! `chained`, the same rule): a stroke the page asks out of turn becomes the chain's next, so a page cannot swing its
//! strongest stroke over and over ([[The Audit's Leftovers Are Fixed as Claude Suggested]]). The page's own choice
//! stands where its view of the soft lock's target, within EDGE_M of a stroke's reach, could have made it.

use crate::FighterId;
use combat::Fighter;
use combat::arms::Stroke;
use combat::fighter::Action;
use combat::strike::stroke_reach;

/// The strokes in the order the swings chain, at the owner's word: the side cut, the overhead and the thrust.
pub(crate) const CHAIN: [Stroke; 3] = [Stroke::Left, Stroke::Down, Stroke::Up];
/// Ticks without a swing (a second) after which the chain starts over at its first.
pub(crate) const CHAIN_RESTS: u32 = 60;
/// Metres either side of a stroke's reach within which the page's view of its target stands for the room's.
const EDGE_M: f64 = 0.25;
const STROKES: [Stroke; 6] =
    [Stroke::Down, Stroke::DownLeft, Stroke::Left, Stroke::Right, Stroke::DownRight, Stroke::Up];

/// Where a player's chain stands: the stroke last swung, and the ticks rested since.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Chain {
    pub last: Option<Stroke>,
    pub rested: u32,
}

impl Default for Chain {
    fn default() -> Self {
        Chain { last: None, rested: CHAIN_RESTS }
    }
}

impl Chain {
    /// The chain a tick on: a swing under way is its last; any other tick rests it.
    #[must_use]
    pub(crate) fn after(self, fighter: &Fighter) -> Chain {
        match fighter.action {
            Action::Attack(attack) => Chain { last: Some(attack.stroke), rested: 0 },
            _ => Chain { rested: self.rested.saturating_add(1), ..self },
        }
    }
}

/// The stroke after `last` in the chain (from its first with none): the next that reaches, passing over those that do
/// not; else the first that reaches.
fn chained(last: Option<Stroke>, reaching: &[Stroke]) -> Stroke {
    let from = CHAIN.iter().position(|stroke| Some(*stroke) == last);
    let first = from.map_or(0, |at| at + 1);
    (0..CHAIN.len())
        .map(|step| CHAIN[(first + step) % CHAIN.len()])
        .find(|stroke| reaching.contains(stroke))
        .unwrap_or(reaching.first().copied().unwrap_or(CHAIN[0]))
}

/// The strokes whose reach takes in a target `apart` metres away; all six with no target, or when none reaches it.
fn reaching(apart: Option<f64>, reach: impl Fn(Stroke) -> f64) -> Vec<Stroke> {
    let reaching: Vec<Stroke> =
        apart.map(|apart| STROKES.into_iter().filter(|stroke| reach(*stroke) >= apart).collect()).unwrap_or_default();
    if reaching.is_empty() { STROKES.to_vec() } else { reaching }
}

/// The stroke a swing `asked` by the page takes: the chain's next from where `fighter` stands, as the room sees the
/// soft lock's target in `view`; the page's own where its view could have chosen it.
pub(crate) fn stroke(chain: Chain, asked: Stroke, fighter: &Fighter, view: &[(FighterId, Fighter)]) -> Stroke {
    let last = chain.last.filter(|_| chain.rested < CHAIN_RESTS);
    let target = fighter.target.and_then(|target| view.iter().find(|(id, _)| *id == target));
    let apart = target.map(|(_, them)| libm::hypot(them.body.x - fighter.body.x, them.body.y - fighter.body.y));
    let reach = |stroke| stroke_reach(fighter.arms.melee, stroke, true);
    let choice = |slack: f64| chained(last, &reaching(apart.map(|apart| apart + slack), reach));
    if [choice(-EDGE_M), choice(EDGE_M)].contains(&asked) { asked } else { choice(0.0) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_chain_passes_over_a_stroke_that_falls_short_and_starts_at_the_side_cut() {
        assert_eq!(chained(None, &STROKES), Stroke::Left);
        assert_eq!(chained(Some(Stroke::Left), &STROKES), Stroke::Down);
        assert_eq!(chained(Some(Stroke::Up), &STROKES), Stroke::Left);
        assert_eq!(chained(Some(Stroke::Left), &[Stroke::Up]), Stroke::Up, "the overhead falls short: the thrust");
        assert_eq!(chained(Some(Stroke::Left), &[Stroke::Right]), Stroke::Right, "none of the chain reaches");
    }
}
