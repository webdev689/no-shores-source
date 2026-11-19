//! The helm's laws: Come Sail Away's handling and sail curves, under DFO's responsive helm (its way and turn eased at
//! rates a fifth again, her sails drawing on every heading by the point of sail, her steerage read off her way).
//! Degrees where the mod keeps degrees.

use crate::{Hull, SLOOP, SailKind, SailSize};

/// Come Sail Away's handling: way (m/s) and its rate (m/s²), turn (degrees a second) and its rate, under oars and sail.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Handling {
    pub move_speed_oar: f64,
    pub move_speed_sail: f64,
    pub move_accel_oar: f64,
    pub move_accel_sail: f64,
    pub turn_speed_oar: f64,
    pub turn_speed_sail: f64,
    pub turn_accel_oar: f64,
    pub turn_accel_sail: f64,
}

pub const HANDLING: Handling = Handling {
    move_speed_oar: 2.0,
    move_speed_sail: 2.0,
    move_accel_oar: 1.0,
    move_accel_sail: 0.2,
    turn_speed_oar: 20.0,
    turn_speed_sail: 10.0,
    turn_accel_oar: 10.0,
    turn_accel_sail: 5.0,
};

/// The responsive helm's rates: her way under sail and her coast, and her swing under sail, each times the mod's.
pub const SAIL_ACCEL: f64 = 3.5;
pub const COAST: f64 = 3.0;
pub const TURN_ACCEL_SAIL: f64 = 2.4;
/// Her steerage, degrees a second: its floor at no way, its peak and the way it peaks at (m/s).
pub const STEER_FLOOR: f64 = 3.0;
pub const STEER_PEAK: f64 = 14.0;
pub const STEER_PEAK_WAY: f64 = 4.5;
/// Her way under sail a fifth again: the mod's speeds were set for a time dial the online game does not have.
pub const PACE: f64 = 1.2;
/// The point of sail's share of her best way: running dead before the wind, on the quarter, in the wind's eye.
pub const RUN: f64 = 0.9;
pub const QUARTER_DEG: f64 = 45.0;
pub const HEAD: f64 = 0.55;
/// The wind a ship is rated for (m/s), and the shares of it the sea's wind is held between.
pub const WIND_RATED: f64 = 1.5;
pub const WIND_SHARE: [f64; 2] = [0.3, 2.0];
/// The degrees between the wind and a lateen, gaff or staysail at which it pulls its most.
pub const SAIL_CREST_DEG: f64 = 135.0;

/// The point of sail's share of her best way, `off_run` degrees between her heading and where the wind blows to.
#[must_use]
pub fn point_of_sail(off_run_deg: f64) -> f64 {
    let off = off_run_deg.abs().min(180.0);
    if off <= QUARTER_DEG {
        return RUN + (1.0 - RUN) * (1.0 - libm::cos(std::f64::consts::PI * off / QUARTER_DEG)) / 2.0;
    }
    HEAD + (1.0 - HEAD) * (1.0 + libm::cos(std::f64::consts::PI * (off - QUARTER_DEG) / (180.0 - QUARTER_DEG))) / 2.0
}

/// How fast her rudder can swing her at `way` m/s, degrees a second: a little at none, most at a brisk way.
#[must_use]
pub fn steerage(way: f64) -> f64 {
    let share = way.max(0.0) / STEER_PEAK_WAY;
    STEER_FLOOR + (STEER_PEAK - STEER_FLOOR) * share * libm::exp(1.0 - share)
}

/// The wind she sails in: none in a calm, else her rated wind's share, held between its bounds.
#[must_use]
pub fn sea_wind(wind: f64) -> f64 {
    if wind > 0.0 { WIND_RATED * (wind / WIND_RATED).clamp(WIND_SHARE[0], WIND_SHARE[1]) } else { 0.0 }
}

/// Unity's unclamped lerp, and its clamped one.
fn lerp(from: f64, to: f64, share: f64) -> f64 {
    from + (to - from) * share
}

fn lerp_clamped(from: f64, to: f64, share: f64) -> f64 {
    lerp(from, to, share.clamp(0.0, 1.0))
}

/// One sail's pull at `angle_deg` degrees between the wind and the sail's forward (GetSailPower): a lateen best off
/// the wind, a gaff and a staysail on to 150 degrees, a square sail running before it; a small or large one scaled.
#[must_use]
pub fn sail_power(kind: SailKind, size: SailSize, angle_deg: f64) -> f64 {
    let pull = match kind {
        SailKind::Lateen if angle_deg <= 135.0 => lerp_clamped(50.0, 100.0, angle_deg / 135.0) / 100.0,
        SailKind::Lateen if angle_deg <= 165.0 => lerp_clamped(100.0, 50.0, (angle_deg - 135.0) / 30.0) / 100.0,
        SailKind::Lateen => 0.0,
        SailKind::Gaff if angle_deg <= 135.0 => lerp(50.0, 100.0, angle_deg / 135.0) / 100.0,
        SailKind::Gaff => lerp(100.0, 0.0, (angle_deg - 135.0) / 15.0) / 100.0,
        SailKind::Stay if angle_deg <= 135.0 => lerp(20.0, 80.0, angle_deg / 135.0) / 100.0,
        SailKind::Stay => lerp(80.0, 0.0, (angle_deg - 135.0) / 15.0) / 100.0,
        SailKind::Square => lerp(100.0, 0.0, angle_deg / 90.0) / 100.0,
    };
    // A sail laid aback pulls backward, by the mod's share for its kind.
    let pull = match kind {
        _ if pull >= 0.0 => pull,
        SailKind::Lateen => pull * 0.5,
        SailKind::Gaff | SailKind::Stay => pull * 0.25,
        SailKind::Square => pull * 2.0,
    };
    match (size, kind) {
        (SailSize::Normal, _) => pull,
        (SailSize::Large, _) => pull * 1.5,
        (SailSize::Small, SailKind::Gaff) => pull * 0.5,
        (SailSize::Small, SailKind::Stay) => pull * 0.3,
        (SailSize::Small, _) => pull * 0.4,
    }
}

/// Her canvas: every sail she carries asked at the crest of its own curve, as the responsive helm sails her.
#[must_use]
pub fn canvas(hull: &Hull) -> f64 {
    hull.sails
        .iter()
        .map(|sail| {
            let crest = if sail.kind == SailKind::Square { 0.0 } else { SAIL_CREST_DEG };
            sail_power(sail.kind, sail.size, crest)
        })
        .sum()
}

/// Her canvas as it drives her: the Sloop's, whatever her rig, so no hull sails faster than the Sloop (her rank's
/// way, not her hull, sets her speed); 0 with no sails. Under the responsive helm each sail draws at its crest and the
/// point of sail alone takes her heading, so her sails' kinds shape only how they are drawn and trimmed; her gain still
/// sets how her way comes and goes.
#[must_use]
pub fn canvas_drive(hull: &Hull) -> f64 {
    if hull.sails.is_empty() { 0.0 } else { canvas(&SLOOP) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SailKind, SailSize};

    #[test]
    fn the_point_of_sail_is_best_on_the_quarter_and_about_half_in_the_winds_eye() {
        assert_eq!(point_of_sail(0.0), 0.9);
        assert_eq!(point_of_sail(45.0), 1.0);
        assert_eq!(point_of_sail(180.0), 0.55);
        assert_eq!(point_of_sail(-45.0), 1.0);
        assert!((point_of_sail(90.0) - 0.8875).abs() < 1e-12);
    }

    #[test]
    fn steerage_rises_from_its_floor_to_its_peak_and_eases_off_past_it() {
        assert_eq!(steerage(0.0), 3.0);
        assert!((steerage(4.5) - 14.0).abs() < 1e-12);
        assert!((steerage(9.0) - (3.0 + 22.0 * libm::exp(-1.0))).abs() < 1e-12);
        assert_eq!(steerage(-2.0), 3.0);
    }

    #[test]
    fn the_sea_wind_is_held_between_a_share_of_its_rating() {
        assert_eq!([sea_wind(0.0), sea_wind(0.1), sea_wind(1.5), sea_wind(10.0)], [0.0, 1.5 * 0.3, 1.5, 3.0]);
    }

    #[test]
    fn each_kind_of_sail_pulls_along_come_sail_aways_curve() {
        let normal = SailSize::Normal;
        assert_eq!(sail_power(SailKind::Lateen, normal, 0.0), 0.5);
        assert_eq!(sail_power(SailKind::Lateen, normal, 135.0), 1.0);
        assert_eq!(sail_power(SailKind::Lateen, normal, 150.0), 0.75);
        assert_eq!(sail_power(SailKind::Lateen, normal, 170.0), 0.0);
        assert_eq!(sail_power(SailKind::Gaff, normal, 135.0), 1.0);
        assert_eq!(sail_power(SailKind::Gaff, normal, 0.0), 0.5);
        assert_eq!(sail_power(SailKind::Gaff, normal, 165.0), -0.25);
        assert_eq!(sail_power(SailKind::Stay, normal, 135.0), 0.8);
        assert_eq!(sail_power(SailKind::Stay, normal, 150.0), 0.0);
        assert_eq!(sail_power(SailKind::Square, normal, 0.0), 1.0);
        assert_eq!(sail_power(SailKind::Square, normal, 90.0), 0.0);
        assert_eq!(sail_power(SailKind::Square, normal, 135.0), -1.0);
    }

    #[test]
    fn a_sails_size_scales_its_pull() {
        assert_eq!(sail_power(SailKind::Gaff, SailSize::Small, 135.0), 0.5);
        assert_eq!(sail_power(SailKind::Stay, SailSize::Small, 135.0), 0.8 * 0.3);
        assert_eq!(sail_power(SailKind::Square, SailSize::Small, 0.0), 0.4);
        assert_eq!(sail_power(SailKind::Square, SailSize::Large, 0.0), 1.5);
    }

    #[test]
    fn the_sloops_canvas_is_her_small_gaff_and_small_staysail_at_their_crests() {
        assert!((canvas(&SLOOP) - 0.74).abs() < 1e-12);
    }
}
