//! What a fighter's gear trims of the fight's numbers: what its swings, dodges and guards cost, how fast its stamina
//! comes back, how its ranged weapon reloads, draws and aims, what its blows do to whom they strike, and how blows on
//! it land. Each is a factor of combat's own number, one where gear trims nothing; a foe's is always plain. The host
//! sets a player's from the traits their worn gear gives.

/// A fighter's trims. Each `f64` multiplies combat's own number (1 trims nothing); the stamina given back is added.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Trim {
    /// What a swing costs in stamina; a dodge; a dodge while its weapon is drawn, on top; and a guard's blow.
    pub swing_stamina: f64,
    pub dodge_stamina: f64,
    pub drawn_dodge_stamina: f64,
    pub guard_stamina: f64,
    /// How fast stamina comes back, and again below half its health.
    pub regen: f64,
    pub regen_low: f64,
    /// The share of a reload's time it takes; of a bow's draw to full power; and the pace it keeps while aiming.
    pub reload: f64,
    pub draw: f64,
    pub aim_pace: f64,
    /// Its blows' damage; an aimed shot's; a riposte's; a counter's; on a staggered foe; on a foe below half its
    /// health; a shot within 5 m; a shot past 20 m.
    pub damage: f64,
    pub aimed: f64,
    pub riposte: f64,
    pub counter: f64,
    pub on_staggered: f64,
    pub on_low: f64,
    pub point_blank: f64,
    pub long_shot: f64,
    /// The poise its blows fill; what a guard lets through of them and pays for them; how long a stagger it causes
    /// lasts.
    pub poise_given: f64,
    pub guard_through: f64,
    pub guard_wear: f64,
    pub stagger_given: f64,
    /// Blows on it: the poise they fill, and again while its weapon is drawn; from behind; telegraphed.
    pub poise_taken: f64,
    pub drawn_poise_taken: f64,
    pub behind_taken: f64,
    pub telegraph_taken: f64,
    /// Stamina given back by a kill, a parry and a block; and whether a kill reloads its weapon at once.
    pub kill_stamina: f64,
    pub parry_stamina: f64,
    pub block_stamina: f64,
    pub kill_reload: bool,
}

/// How many numbers a trim crosses as.
pub const TRIM_FLOATS: usize = 29;

impl Default for Trim {
    fn default() -> Self {
        Trim::PLAIN
    }
}

impl Trim {
    /// Nothing trimmed: combat's own numbers.
    pub const PLAIN: Trim = Trim {
        swing_stamina: 1.0,
        dodge_stamina: 1.0,
        drawn_dodge_stamina: 1.0,
        guard_stamina: 1.0,
        regen: 1.0,
        regen_low: 1.0,
        reload: 1.0,
        draw: 1.0,
        aim_pace: 1.0,
        damage: 1.0,
        aimed: 1.0,
        riposte: 1.0,
        counter: 1.0,
        on_staggered: 1.0,
        on_low: 1.0,
        point_blank: 1.0,
        long_shot: 1.0,
        poise_given: 1.0,
        guard_through: 1.0,
        guard_wear: 1.0,
        stagger_given: 1.0,
        poise_taken: 1.0,
        drawn_poise_taken: 1.0,
        behind_taken: 1.0,
        telegraph_taken: 1.0,
        kill_stamina: 0.0,
        parry_stamina: 0.0,
        block_stamina: 0.0,
        kill_reload: false,
    };

    /// Its numbers, in order, for the wire and a browser's door.
    #[must_use]
    pub fn to_floats(&self) -> [f64; TRIM_FLOATS] {
        [
            self.swing_stamina,
            self.dodge_stamina,
            self.drawn_dodge_stamina,
            self.guard_stamina,
            self.regen,
            self.regen_low,
            self.reload,
            self.draw,
            self.aim_pace,
            self.damage,
            self.aimed,
            self.riposte,
            self.counter,
            self.on_staggered,
            self.on_low,
            self.point_blank,
            self.long_shot,
            self.poise_given,
            self.guard_through,
            self.guard_wear,
            self.stagger_given,
            self.poise_taken,
            self.drawn_poise_taken,
            self.behind_taken,
            self.telegraph_taken,
            self.kill_stamina,
            self.parry_stamina,
            self.block_stamina,
            if self.kill_reload { 1.0 } else { 0.0 },
        ]
    }

    /// A trim from its numbers; a factor that is not a positive number reads as none, a stamina given back that is not
    /// a number as nothing.
    #[must_use]
    pub fn from_floats(numbers: &[f64; TRIM_FLOATS]) -> Trim {
        let factor = |at: usize| Some(numbers[at]).filter(|number| number.is_finite() && *number > 0.0).unwrap_or(1.0);
        let given = |at: usize| Some(numbers[at]).filter(|number| number.is_finite()).unwrap_or(0.0);
        Trim {
            swing_stamina: factor(0),
            dodge_stamina: factor(1),
            drawn_dodge_stamina: factor(2),
            guard_stamina: factor(3),
            regen: factor(4),
            regen_low: factor(5),
            reload: factor(6),
            draw: factor(7),
            aim_pace: factor(8),
            damage: factor(9),
            aimed: factor(10),
            riposte: factor(11),
            counter: factor(12),
            on_staggered: factor(13),
            on_low: factor(14),
            point_blank: factor(15),
            long_shot: factor(16),
            poise_given: factor(17),
            guard_through: factor(18),
            guard_wear: factor(19),
            stagger_given: factor(20),
            poise_taken: factor(21),
            drawn_poise_taken: factor(22),
            behind_taken: factor(23),
            telegraph_taken: factor(24),
            kill_stamina: given(25),
            parry_stamina: given(26),
            block_stamina: given(27),
            kill_reload: numbers[28] == 1.0,
        }
    }
}
