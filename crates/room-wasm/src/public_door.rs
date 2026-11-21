//! A zone's public events at the room's door: the grounds a node's file carries, read into the room's, and a leaving
//! player's chests opened for them before the host keeps their character.

use crate::{Opened, with_open};
use room::PlayerId;
use room::public::{FissureGround, Grounds, RaidGround};
use serde::Deserialize;

/// A node's grounds as the bake writes them (`bake::Grounds`).
#[derive(Debug, Default, Deserialize)]
pub(crate) struct NodeGrounds {
    #[serde(default)]
    fissure: Option<NodeFissure>,
    #[serde(default)]
    raid: Option<NodeRaid>,
}

#[derive(Debug, Deserialize)]
struct NodeFissure {
    at: [f64; 2],
    radius: f64,
    growth: [f64; 2],
}

#[derive(Debug, Deserialize)]
struct NodeRaid {
    at: [f64; 2],
    radius: f64,
    stores: Vec<[f64; 2]>,
    approach: [f64; 2],
    banners: Vec<[f64; 2]>,
}

impl From<NodeGrounds> for Grounds {
    fn from(read: NodeGrounds) -> Self {
        Grounds {
            fissure: read.fissure.map(|ground| FissureGround {
                at: ground.at,
                radius: ground.radius,
                growth: ground.growth,
            }),
            raid: read.raid.map(|ground| RaidGround {
                at: ground.at,
                radius: ground.radius,
                stores: ground.stores,
                approach: ground.approach,
                banners: ground.banners,
            }),
        }
    }
}

/// Opens every chest lying for a player about to leave, so the character the host keeps holds what they held.
pub fn parting(player: PlayerId) {
    with_open(|opened| {
        if let Opened::Land { room, .. } = opened {
            room.open_chests_of(player);
        }
    });
}

/// `parting`, for the host to call before it keeps a leaving player's character.
#[unsafe(no_mangle)]
pub extern "C" fn room_parting(player: PlayerId) {
    parting(player);
}
