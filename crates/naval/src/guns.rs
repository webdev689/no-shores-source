//! A gun as it fires: DFO's swivel, the bore of the Sloop's six cannons, and the loads it takes.

/// A gun: its muzzle speed (m/s), its carriage's lowest and highest elevation (degrees), its reload (seconds, a full
/// crew's), its scatter left and right and up and down (degrees), its ball's radius (metres), the harm one ball
/// does to a hull, a canvas and a crew before the zone, the load and the ship's toughness weigh it, and the share of
/// that harm and of each ball's chances a ball of hers takes (1 for the Sloop's; her side's guns split her broadside).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Gun {
    pub speed: f64,
    pub min_el_deg: f64,
    pub max_el_deg: f64,
    pub reload_s: f64,
    pub yaw_spread_deg: f64,
    pub pitch_spread_deg: f64,
    pub radius_m: f64,
    pub hull: f64,
    pub sail: f64,
    pub crew: f64,
    pub share: f64,
}

/// DFO's swivel, the small boats' gun. Its carriage depresses to -10 degrees, so a ship alongside is still under fire.
pub const SWIVEL: Gun = Gun {
    speed: 55.0,
    min_el_deg: -10.0,
    max_el_deg: 14.0,
    reload_s: 4.0,
    yaw_spread_deg: 1.3,
    pitch_spread_deg: 0.8,
    radius_m: 0.07,
    hull: 5.0,
    sail: 2.0,
    crew: 2.0,
    share: 1.0,
};

/// The chance a ball into a hull sets her alight, unless its load says otherwise.
pub const FIRE_CHANCE: f64 = 0.06;
/// Grapeshot's reach: its men whole to this flight (seconds), half by the next and after.
pub const GRAPE_FULL_S: f64 = 1.2;
pub const GRAPE_SPENT_S: f64 = 2.6;
/// A loaded battery drawn for a new load takes this share of the new load's reload.
pub const SHOT_SWITCH: f64 = 0.5;

/// What a gun is loaded with.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Shot {
    Round,
    Grape,
    Chain,
    Heated,
}

/// A load's factors over round shot: muzzle speed, scatter, the metres its sweep widens a hit, the harm to hull,
/// canvas and men, its reload, its own chance of fire, and whether a pass through canvas sets it burning.
struct Load {
    speed: f64,
    spread: f64,
    sweep: f64,
    hull: f64,
    sail: f64,
    crew: f64,
    reload: f64,
    fire: Option<f64>,
    rig_fire: bool,
}

const fn load(shot: Shot) -> Load {
    match shot {
        Shot::Round => Load {
            speed: 1.0,
            spread: 1.0,
            sweep: 0.0,
            hull: 1.0,
            sail: 1.0,
            crew: 1.0,
            reload: 1.0,
            fire: None,
            rig_fire: false,
        },
        Shot::Grape => Load {
            speed: 0.82,
            spread: 2.4,
            sweep: 0.45,
            hull: 0.2,
            sail: 0.6,
            crew: 4.0,
            reload: 0.9,
            fire: None,
            rig_fire: false,
        },
        Shot::Chain => Load {
            speed: 0.9,
            spread: 1.6,
            sweep: 0.3,
            hull: 0.22,
            sail: 4.0,
            crew: 0.6,
            reload: 1.15,
            fire: None,
            rig_fire: false,
        },
        Shot::Heated => Load {
            speed: 1.0,
            spread: 1.1,
            sweep: 0.0,
            hull: 0.85,
            sail: 0.8,
            crew: 1.0,
            reload: 1.6,
            fire: Some(0.45),
            rig_fire: true,
        },
    }
}

impl Shot {
    /// The loads in the order a gunner steps through them.
    pub const CYCLE: [Shot; 4] = [Shot::Round, Shot::Grape, Shot::Chain, Shot::Heated];

    /// The next load in the cycle, or the one before for a `step` below 0.
    #[must_use]
    pub fn next(self, step: i8) -> Shot {
        let at = Self::CYCLE.iter().position(|shot| *shot == self).unwrap_or(0);
        let moved = if step < 0 { at + Self::CYCLE.len() - 1 } else { at + 1 };
        Self::CYCLE[moved % Self::CYCLE.len()]
    }

    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Shot::Round => "round",
            Shot::Grape => "grape",
            Shot::Chain => "chain",
            Shot::Heated => "heated",
        }
    }

    #[must_use]
    pub fn named(name: &str) -> Option<Shot> {
        Self::CYCLE.into_iter().find(|shot| shot.name() == name)
    }
}

/// The gun as it fires `shot`: its row with the load's factors over round shot, the swivel's own load.
#[must_use]
pub fn loaded(gun: &Gun, shot: Shot) -> Gun {
    if shot == Shot::Round {
        return *gun;
    }
    let (with, own) = (load(shot), load(Shot::Round));
    Gun {
        speed: gun.speed * with.speed / own.speed,
        yaw_spread_deg: gun.yaw_spread_deg * with.spread / own.spread,
        pitch_spread_deg: gun.pitch_spread_deg * with.spread / own.spread,
        radius_m: gun.radius_m + (with.sweep - own.sweep).max(0.0),
        reload_s: gun.reload_s * with.reload / own.reload,
        hull: gun.hull * with.hull / own.hull,
        sail: gun.sail * with.sail / own.sail,
        crew: gun.crew * with.crew / own.crew,
        ..*gun
    }
}

/// The chance a ball of `shot` into a hull sets her alight.
#[must_use]
pub fn fire_chance(shot: Shot) -> f64 {
    load(shot).fire.unwrap_or(FIRE_CHANCE)
}

/// Whether a pass through canvas with `shot` sets it burning.
#[must_use]
pub fn rig_fire(shot: Shot) -> bool {
    load(shot).rig_fire
}

/// Grapeshot's share of its men by its flight (seconds): whole to `GRAPE_FULL_S`, half by `GRAPE_SPENT_S`; every
/// other load whole.
#[must_use]
pub fn shot_reach(shot: Shot, flight: f64) -> f64 {
    if shot != Shot::Grape || flight <= GRAPE_FULL_S {
        return 1.0;
    }
    1.0 - 0.5 * ((flight - GRAPE_FULL_S) / (GRAPE_SPENT_S - GRAPE_FULL_S)).min(1.0)
}

#[cfg(test)]
#[path = "guns_tests.rs"]
mod tests;
