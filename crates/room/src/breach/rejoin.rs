//! What a Breach's run keeps of a player who leaves, by account, and gives back as they come in again: the share of
//! their health (none for one down, a fall into the dark among them), their Rewritten mark and when it was made, and
//! the shore they stood in, so that leaving never stands one up whole, cleanses them or brings them home.

use super::{Phase, SHORES};
use crate::{Player, PlayerId, Room};

/// What an account left a run with: the share of its health (0 down), whether it lay fallen into the dark, when it
/// was marked Rewritten, and the shore it stood in, where, and how many takings the Steward had made then.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Left {
    pub share: f64,
    pub fell: bool,
    pub marked: Option<u64>,
    pub shore: Option<(String, [f64; 3], u8)>,
}

impl Room {
    /// A kept player leaving a Breach's run, kept by account.
    pub(crate) fn keep_breach_body(&mut self, id: PlayerId, owner: String, share: f64, gone: &Player) {
        let Some(breach) = self.breach.as_mut() else { return };
        let body = gone.fighter.body;
        let plan = breach.plan;
        let shore = plan.shores.values().flatten().find(|space| {
            plan.space_bounds(space, 0.0).is_some_and(|ground| {
                body.x >= ground.min_x && body.x <= ground.max_x && body.y >= ground.min_y && body.y <= ground.max_y
            })
        });
        let takings = breach.fights.steward.takings;
        let shore = shore.filter(|_| gone.living()).map(|space| (space.clone(), [body.x, body.y, body.z], takings));
        let marked = breach.marked.get(&id).copied();
        let fell = matches!(gone.standing, crate::Standing::Dead { fell: true, .. });
        breach.left.insert(owner, Left { share, fell, marked, shore });
    }

    /// An account's body given back as it comes into the run again: in its shore while that still holds it (the
    /// Steward's taking it was in, or the Two Shores while they run), else lost as a shut shore loses those in it, so
    /// down at the furthest stage as one who left down lies; marked again as it left.
    pub(crate) fn give_breach_back(&mut self, player: PlayerId, owner: &str) {
        let Some(left) = self.breach.as_mut().and_then(|breach| breach.left.remove(owner)) else { return };
        let Some(breach) = self.breach.as_ref() else { return };
        let (plan, fight) = (breach.plan, &breach.fights.steward);
        let taken = fight.away.as_ref().filter(|_| left.shore.as_ref().is_some_and(|(_, _, at)| *at == fight.takings));
        let taken_to = taken.and_then(|away| plan.shores.get("steward")?.get(away.shore));
        let shores = plan.shores.get("shores").filter(|_| matches!(breach.phases[SHORES], Phase::Running(_)));
        let home = left
            .shore
            .as_ref()
            .filter(|(space, _, _)| taken_to == Some(space) || shores.is_some_and(|shores| shores.contains(space)));
        let home = home.map(|(space, at, _)| (taken_to == Some(space), *at));
        let share = if left.shore.is_some() && home.is_none() { 0.0 } else { left.share };
        let stage = self.stage_at(breach).0;
        let at = home.map(|(_, at)| at).or_else(|| (share <= 0.0).then_some(stage));
        self.give_share(player, share, at);
        // One who left fallen into the dark comes back so: no revive raises them, as none would have.
        if let Some(found) = self.players.get_mut(&player).filter(|_| share <= 0.0 && left.fell) {
            found.standing = crate::Standing::Dead { ticks: 0, fell: true };
        }
        let Some(breach) = self.breach.as_mut() else { return };
        if let Some(marked) = left.marked.filter(|_| share > 0.0) {
            breach.marked.insert(player, marked);
        }
        if home.is_some_and(|(steward, _)| steward)
            && let Some(away) = breach.fights.steward.away.as_mut()
        {
            away.taken.push(player);
        }
    }
}
