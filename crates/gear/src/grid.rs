//! An item's nodes: columns, left to right, each unlocked once the item's XP reaches it; and what each node costs.
//! An upgrade column holds one node that raises the item's power; a handling, finish, perk or signature column holds
//! traits, of which one is chosen.

use crate::rarity::Rarity;

/// What one column of nodes holds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Column {
    /// One node raising Attack, or Defense with Prestige.
    Upgrade,
    /// Handling traits, how a weapon is gripped and fired: this many to choose among.
    Handling(u8),
    /// Finishing traits, how any weapon is balanced: this many to choose among.
    Finish(u8),
    /// Perks: this many to choose among.
    Perk(u8),
    /// An Atheric's own trait.
    Signature,
}

use Column::{Finish, Handling, Perk, Signature, Upgrade};

const WEAPON_NORMAL: &[Column] = &[Upgrade];
const WEAPON_MAGIC: &[Column] = &[Handling(2), Upgrade, Perk(1), Upgrade];
const WEAPON_RARE: &[Column] = &[Handling(2), Upgrade, Perk(2), Upgrade, Finish(2), Upgrade];
const WEAPON_LEGENDARY: &[Column] =
    &[Handling(3), Upgrade, Perk(2), Upgrade, Finish(2), Perk(2), Upgrade, Upgrade, Upgrade];
const WEAPON_ATHERIC: &[Column] =
    &[Handling(3), Upgrade, Signature, Upgrade, Finish(2), Perk(2), Upgrade, Upgrade, Upgrade];
const ARMOUR_NORMAL: &[Column] = &[Upgrade];
const ARMOUR_MAGIC: &[Column] = &[Perk(1), Upgrade, Upgrade];
const ARMOUR_RARE: &[Column] = &[Perk(2), Upgrade, Perk(2), Upgrade];
const ARMOUR_LEGENDARY: &[Column] = &[Perk(2), Upgrade, Perk(2), Upgrade, Perk(2), Upgrade];
const ARMOUR_ATHERIC: &[Column] = &[Perk(2), Upgrade, Signature, Upgrade, Perk(2), Upgrade];

/// The columns of an item of this rarity: a weapon's, or armour's (a shield's too).
#[must_use]
pub fn columns(rarity: Rarity, weapon: bool) -> &'static [Column] {
    match (weapon, rarity) {
        (true, Rarity::Normal) => WEAPON_NORMAL,
        (true, Rarity::Magic) => WEAPON_MAGIC,
        (true, Rarity::Rare) => WEAPON_RARE,
        (true, Rarity::Legendary) => WEAPON_LEGENDARY,
        (true, Rarity::Atheric) => WEAPON_ATHERIC,
        (false, Rarity::Normal) => ARMOUR_NORMAL,
        (false, Rarity::Magic) => ARMOUR_MAGIC,
        (false, Rarity::Rare) => ARMOUR_RARE,
        (false, Rarity::Legendary) => ARMOUR_LEGENDARY,
        (false, Rarity::Atheric) => ARMOUR_ATHERIC,
    }
}

impl Column {
    /// How many nodes it holds.
    #[must_use]
    pub fn nodes(self) -> u8 {
        match self {
            Upgrade | Signature => 1,
            Handling(count) | Finish(count) | Perk(count) => count,
        }
    }

    /// Whether its nodes are traits, which the catalogue or a roll names.
    #[must_use]
    pub fn traits(self) -> bool {
        self != Upgrade
    }
}

/// What a node costs: Aurem, the item's own fragments and Essence, and its island's resource.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Cost {
    pub aurem: u32,
    pub fragments: u16,
    pub essence: u16,
    pub resource: u16,
}

/// The Essence each of a Legendary's last three upgrades asks, an Atheric's, and a Breach's Legendary armour's: as
/// Destiny 1's legendary, exotic and raid gear asked 6, 8 and 7 Ascendant materials a node.
pub const LAST_ESSENCE: u16 = 6;
pub const ATHERIC_LAST_ESSENCE: u16 = 8;
pub const BREACH_LAST_ESSENCE: u16 = 7;

/// What the node of `column` costs among `layout`, an item's columns: lesser items' nodes cost Aurem and their
/// upgrades fragments; a Legendary's or Atheric's ask for its island's resource, and its last three upgrades for
/// Essence, as Destiny 1's last three nodes asked for Ascendant materials. An Atheric's own node asks for all four,
/// so an Atheric never costs less of anything to finish than a Legendary of its kind.
#[must_use]
pub fn cost(rarity: Rarity, layout: &[Column], column: usize) -> Cost {
    let Some(&kind) = layout.get(column) else { return Cost::default() };
    let aurem = |aurem| Cost { aurem, ..Cost::default() };
    match (rarity, kind) {
        (Rarity::Normal, _) => aurem(100),
        (Rarity::Magic, Upgrade) => Cost { fragments: 1, ..aurem(300) },
        (Rarity::Magic, _) => aurem(200),
        (Rarity::Rare, Upgrade) => Cost { fragments: 3, ..aurem(600) },
        (Rarity::Rare, _) => Cost { fragments: 1, ..aurem(400) },
        (_, Signature) => Cost { fragments: 4, essence: 1, resource: 10, ..aurem(2_500) },
        (_, Upgrade) => {
            let later = layout[column + 1..].iter().filter(|later| **later == Upgrade).count();
            if later >= 3 {
                Cost { fragments: 5, resource: 10, ..aurem(1_000) }
            } else if rarity == Rarity::Atheric {
                Cost { essence: ATHERIC_LAST_ESSENCE, ..aurem(1_500) }
            } else {
                Cost { essence: LAST_ESSENCE, ..aurem(1_500) }
            }
        }
        (_, Handling(_) | Finish(_) | Perk(_)) => Cost { fragments: 2, resource: 5, ..aurem(800) },
    }
}

/// The XP an item needs before the nodes of `column` (0 the first) can be bought.
#[must_use]
pub fn column_xp(rarity: Rarity, column: usize) -> u32 {
    rarity.column_xp().saturating_mul(u32::try_from(column + 1).unwrap_or(u32::MAX))
}

/// Where each column's nodes start in the item's run of node bits, and the count of all of them.
#[must_use]
pub fn node_offsets(layout: &[Column]) -> (Vec<u8>, u8) {
    let mut offsets = Vec::with_capacity(layout.len());
    let mut next = 0;
    for column in layout {
        offsets.push(next);
        next += column.nodes();
    }
    (offsets, next)
}
