//! The content an item or a Vestige came from: the world, a faction, a dungeon, an Elite Dungeon, an Abyss Dungeon, a
//! sea dungeon or a Breach. Each armour set and weapon metal belongs to one of them, as the owner chose, so a look
//! seen on a player says where it was earned; the page reads which in `content/gear/looks.json`.

use serde::{Deserialize, Serialize};

/// Where an item or a Vestige came from, numbered as on the wire.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
#[repr(u8)]
pub enum Source {
    /// Patrols, missions, public events, the sea's fights, the smiths, a faction's packages: everything outside a
    /// dungeon.
    #[default]
    World = 0,
    /// A faction's own wares, bought at its counter.
    Faction = 1,
    /// A patrol's dungeon, at any tier.
    Dungeon = 2,
    /// An Elite Dungeon at Normal or Elite: the 18, the Elite Dungeon of the week and the Elite Playlist.
    Elite = 3,
    /// An Elite Dungeon at Abyss: the Abyss Dungeon of the week and the Abyss Playlist.
    Abyss = 4,
    /// A sea island's dungeon, at any tier.
    Sea = 5,
    /// A Breach, the raids.
    Breach = 6,
}

impl Source {
    /// Every source, by its number.
    pub const ALL: [Source; 7] =
        [Source::World, Source::Faction, Source::Dungeon, Source::Elite, Source::Abyss, Source::Sea, Source::Breach];

    /// Whether it is the world's, which a save leaves unwritten: a save from before sources reads as the world's.
    #[must_use]
    pub fn is_world(&self) -> bool {
        *self == Source::World
    }

    /// An Elite Dungeon's run at `tier`: the Abyss Dungeons' at Abyss, else the Elite Dungeons'.
    #[must_use]
    pub fn elite_at(tier: crate::Difficulty) -> Self {
        if tier == crate::Difficulty::Abyss { Source::Abyss } else { Source::Elite }
    }
}

/// A kept source as read: one a later build names reads as the world's, so a room rolled back keeps the piece whole.
pub(crate) fn known_source<'de, D: serde::Deserializer<'de>>(reader: D) -> Result<Source, D::Error> {
    Ok(serde_json::from_value(serde_json::Value::deserialize(reader)?).unwrap_or_default())
}
