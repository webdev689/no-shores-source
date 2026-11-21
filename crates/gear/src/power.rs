//! A player's level and what power does in a fight, as Destiny 1 had it at launch: levels 1 to 20 from XP, then from
//! the Prestige the armour carries; a blow's damage rising with the weapon's Attack up to the foe's level and falling
//! away when the player is below the foe; a foe's blows falling short of the player's Defense. Foes' health rises
//! with their level, so a player matched in level and power fells a foe in the blows combat is tuned for.

/// The highest level XP alone reaches.
pub const XP_LEVEL_MOST: u8 = 20;
/// The highest level.
pub const LEVEL_MOST: u8 = 30;
/// The Prestige each level past 20 needs: 21, then 11 more each.
pub const PRESTIGE_FOR: [u32; 10] = [21, 32, 43, 54, 65, 76, 87, 98, 109, 120];
/// The XP each level past the first asks for, times the level reached from.
pub const XP_STEP: u64 = 1_000;
/// How much harder each level makes a foe's health, or a weapon's blow up to its Attack's reach.
const PER_LEVEL: f64 = 1.07;
/// The Attack, or the Defense, that reaches one level.
pub const ATTACK_PER_LEVEL: f64 = 15.0;
pub const DEFENSE_PER_LEVEL: f64 = 45.0;
/// The share of a blow a player strikes with when below a foe: one, two or three levels; four or more strikes none.
const BELOW: [f64; 4] = [1.0, 0.67, 0.56, 0.47];
/// How much harder a foe's blow strikes for each level the player is below it, up to four.
const ABOVE_EACH: f64 = 0.25;
const ABOVE_MOST: u8 = 4;

/// The XP that reaches a level from the first: 1,000 for level 2, 3,000 for 3, 190,000 for 20.
#[must_use]
pub fn xp_for_level(level: u8) -> u64 {
    let level = u64::from(level.clamp(1, XP_LEVEL_MOST));
    XP_STEP * (level - 1) * level / 2
}

/// The level XP reaches, 1 to 20.
#[must_use]
pub fn xp_level(xp: u64) -> u8 {
    (1..XP_LEVEL_MOST).take_while(|level| xp >= xp_for_level(level + 1)).last().map_or(1, |level| level + 1)
}

/// The player's level: XP's to 20, then one more for each step of Prestige reached, to 30.
#[must_use]
pub fn level(xp: u64, prestige: u32) -> u8 {
    let by_xp = xp_level(xp);
    if by_xp < XP_LEVEL_MOST {
        return by_xp;
    }
    XP_LEVEL_MOST + PRESTIGE_FOR.iter().filter(|needed| prestige >= **needed).count() as u8
}

/// How far XP and Prestige are to the next level they reach, 0 to 1, and what it still takes: XP below level 20,
/// Prestige past it; at the highest, full and nothing.
#[must_use]
pub fn to_next(xp: u64, prestige: u32) -> (f64, u32) {
    let reached = level(xp, prestige);
    if reached < XP_LEVEL_MOST {
        let (from, to) = (xp_for_level(reached), xp_for_level(reached + 1));
        let share = xp.saturating_sub(from) as f64 / (to - from) as f64;
        return (share.min(1.0), u32::try_from(to.saturating_sub(xp)).unwrap_or(u32::MAX));
    }
    let Some(needed) = PRESTIGE_FOR.get(usize::from(reached - XP_LEVEL_MOST)) else { return (1.0, 0) };
    (f64::from(prestige) / f64::from(*needed), needed.saturating_sub(prestige))
}

/// What a foe's health is times at its level.
#[must_use]
pub fn foe_health_times(foe_level: u8) -> f64 {
    libm::pow(PER_LEVEL, f64::from(foe_level))
}

/// What a player's blow with a weapon of this Attack is times against a foe of this level: 1.07 for each of the foe's
/// levels the Attack reaches, its reach lengthened by each level the player has past 20 by Prestige, and the share
/// the level gap leaves. So a player matched to a foe at any level fells it in the blows combat is tuned for.
#[must_use]
pub fn by_player(attack: u32, player_level: u8, foe_level: u8) -> f64 {
    let past_xp = f64::from(player_level.saturating_sub(XP_LEVEL_MOST));
    let reached = (f64::from(attack) / ATTACK_PER_LEVEL + past_xp).min(f64::from(foe_level));
    libm::pow(PER_LEVEL, reached) * gap(player_level, foe_level)
}

/// The share of a blow a player strikes with against a foe: all of it level with or above the foe, less for each level
/// below, none from four below.
#[must_use]
pub fn gap(player_level: u8, foe_level: u8) -> f64 {
    BELOW.get(usize::from(foe_level.saturating_sub(player_level))).copied().unwrap_or(0.0)
}

/// What a foe's blow on a player is times: 1.07 for each of its levels the player's Defense does not reach, and a
/// quarter more for each level the player is below it.
#[must_use]
pub fn on_player(defense: u32, player_level: u8, foe_level: u8) -> f64 {
    let defended = (f64::from(defense) / DEFENSE_PER_LEVEL).min(f64::from(foe_level));
    let below = foe_level.saturating_sub(player_level).min(ABOVE_MOST);
    libm::pow(PER_LEVEL, f64::from(foe_level) - defended) * (1.0 + ABOVE_EACH * f64::from(below))
}
