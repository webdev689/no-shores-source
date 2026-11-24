//! A won event's chests: one for each player who took part, at the event's ground, seen and opened by them alone. E
//! within CHEST_REACH opens it (`Asked::OpenChest`), its Vestige poured out of it; one not opened is opened for its
//! player as it goes, or as they leave the room, so none is ever lost; and none pays twice, since opening it takes it
//! off the ground.

use crate::asks::OUT_OF_REACH;
use crate::{Dropped, EventKind, PlayerId, Room};
use combat::sight::{apart, bearing};

/// How near a player stands to their chest to open it, across and up, metres.
pub const CHEST_REACH: f64 = 2.5;
const CHEST_HEIGHT: f64 = 2.0;
/// How far from the ground's middle each chest stands, toward its player.
const CHEST_OUT: f64 = 3.0;

impl Room {
    /// Lays a chest of `tier` for a player at the ground round `middle`, on their side of it, of an event at `level`.
    pub(crate) fn lay_chest(&mut self, player: PlayerId, tier: u8, middle: [f64; 2], level: u8) {
        let Some(found) = self.players.get(&player) else { return };
        let toward = bearing(middle, [found.fighter.body.x, found.fighter.body.y]);
        let place = [middle[0] + libm::sin(toward) * CHEST_OUT, middle[1] - libm::cos(toward) * CHEST_OUT];
        let at = self.on_ground(place);
        let at = self.nav.nearest_point(at).unwrap_or(at);
        self.lay_drop(player, Dropped::Chest { tier, level }, at);
    }

    /// A player opens their chest by its number: paid at once, the answer 0; out of reach (too far, dead, or no such
    /// chest of theirs) otherwise.
    pub(crate) fn open_chest(&mut self, player: PlayerId, chest: u32) -> u8 {
        let Some(found) = self.players.get(&player).filter(|found| found.living()) else { return OUT_OF_REACH };
        let body = found.fighter.body;
        let theirs = |drop: &crate::Drop| {
            drop.player == player && drop.id == chest && matches!(drop.what, Dropped::Chest { .. })
        };
        let Some(at) = self.drops.iter().position(theirs) else { return OUT_OF_REACH };
        let drop = &self.drops[at];
        if apart([body.x, body.y], [drop.at[0], drop.at[1]]) > CHEST_REACH || (body.z - drop.at[2]).abs() > CHEST_HEIGHT
        {
            return OUT_OF_REACH;
        }
        let drop = self.drops.remove(at);
        if let Dropped::Chest { tier, level } = drop.what {
            self.pay_chest(player, (tier, level), drop.at, Paid::Opened);
        }
        0
    }

    /// Pays a chest to its player: what it holds goes to their gear; its Vestige, poured out of it when they opened
    /// it, else to their ten, else to their vault, else onto the ground where the chest stood when both are full; a
    /// leaver's into their vault however full. A Normal roll holds no Vestige: its item is kept as a found item is, in
    /// its slot's nine, else the vault, else the mail.
    pub(crate) fn pay_chest(&mut self, player: PlayerId, (tier, level): (u8, u8), at: [f64; 3], paid_as: Paid) {
        let dice = self.dice(player);
        let resource = self.resource_nodes.first().map(|node| usize::from(node.resource));
        let (difficulty, day) = (self.difficulty, self.day());
        let Some(found) = self.players.get_mut(&player) else { return };
        let Some(paid) = found.character.open_chest(tier, (level, difficulty, day), resource, &dice) else { return };
        found.gear_changed = true;
        if paid_as == Paid::Opened {
            self.pour(player, paid.vestige.into_iter().collect(), at, None);
            self.tell(EventKind::ChestOpened, None, player, player, f64::from(tier));
            return;
        }
        let character = &mut found.character;
        // A leaver's chest is paid as they go, so the vault keeps what the ten cannot, over its limit if it must: the
        // ground they leave would lose it.
        let vaulted = paid_as == Paid::Leaving || character.vestiges_held(true) < gear::character::VAULT_MOST;
        // A Normal roll held no Vestige: its item is kept already, as a found item is.
        if let Some(vestige) = paid.vestige.filter(|vestige| !character.pick_up(vestige.clone())) {
            if vaulted {
                character.vestiges.insert(vestige.id, (vestige, true));
            } else {
                self.lay_drop(player, Dropped::Vestige(vestige), at);
            }
        }
        self.tell(EventKind::ChestOpened, None, player, player, f64::from(tier));
    }

    /// Every chest lying for a player, opened for them: as they leave the room, before the host keeps their character.
    pub fn open_chests_of(&mut self, player: PlayerId) {
        let (theirs, rest): (Vec<crate::Drop>, Vec<crate::Drop>) = std::mem::take(&mut self.drops)
            .into_iter()
            .partition(|drop| drop.player == player && matches!(drop.what, Dropped::Chest { .. }));
        self.drops = rest;
        for drop in theirs {
            if let Dropped::Chest { tier, level } = drop.what {
                self.pay_chest(player, (tier, level), drop.at, Paid::Leaving);
            }
        }
    }
}

/// How a chest comes to be paid: opened by its player, its two minutes run out unopened, or its player leaving.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Paid {
    Opened,
    Lapsed,
    Leaving,
}
