//! A passage zone as the web draws it: its depth and place, its ground (under ground in a style and a number of the
//! Forge's blocks, or a hollow above ground of a form and a size), its deal, its currents, its seed and its name.

use gear::activities::Modifier;
use isle::draws::Draws;

/// A hollow's form above ground.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Form {
    /// A round basin.
    Hollow,
    /// Long and winding.
    Ravine,
    /// Terraces stepping down.
    Shelves,
    /// A ruined court of the grey stone.
    Court,
    /// An old sea floor, dry, its wrecks inland.
    Strand,
    /// A thicket.
    Grove,
}

impl Form {
    pub const ALL: [Form; 6] = [Form::Hollow, Form::Ravine, Form::Shelves, Form::Court, Form::Strand, Form::Grove];

    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            Form::Hollow => "hollow",
            Form::Ravine => "ravine",
            Form::Shelves => "shelves",
            Form::Court => "court",
            Form::Strand => "strand",
            Form::Grove => "grove",
        }
    }
}

/// How large a zone is: small, medium or large.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Size {
    Small,
    Medium,
    Large,
}

impl Size {
    /// The Forge's blocks it is laid in under ground.
    #[must_use]
    pub fn blocks(self) -> usize {
        match self {
            Size::Small => 1,
            Size::Medium => 2,
            Size::Large => 3,
        }
    }

    /// How far across its floor is above ground, metres.
    #[must_use]
    pub fn across(self) -> f64 {
        match self {
            Size::Small => 38.0,
            Size::Medium => 55.0,
            Size::Large => 75.0,
        }
    }

    /// The most foes its room stands at once: 7, 9 and 12.
    #[must_use]
    pub fn foes_most(self) -> usize {
        match self {
            Size::Small => 7,
            Size::Medium => 9,
            Size::Large => 12,
        }
    }

    /// How many posts a hollow of it lays: as many bands of the fewest, two, as its most foes hold.
    #[must_use]
    pub fn posts(self) -> usize {
        self.foes_most() / 2
    }

    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            Size::Small => "small",
            Size::Medium => "medium",
            Size::Large => "large",
        }
    }
}

/// Where a zone stands: under ground, a style of the Forge's laid in its size's blocks, or a hollow above ground.
#[derive(Clone, Debug, PartialEq)]
pub enum Ground {
    Under { style: String },
    Open { form: Form },
}

/// The seven missions a zone may be dealt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mission {
    /// Three dead lamps lit while the Tithe come at them.
    Kindle,
    /// A ring held against waves.
    Hold,
    /// A marked Elite walking the zone with its band, brought down.
    Hunt,
    /// Three collectors with the zone's tallies, who run when found, brought down.
    Reckoning,
    /// The far mouth reached in time, foes on the way.
    Gauntlet,
    /// The mouths barred until three waves are beaten.
    Ambush,
    /// Three of the Tithe's tally posts broken, each guarded.
    Sever,
}

impl Mission {
    pub const ALL: [Mission; 7] = [
        Mission::Kindle,
        Mission::Hold,
        Mission::Hunt,
        Mission::Reckoning,
        Mission::Gauntlet,
        Mission::Ambush,
        Mission::Sever,
    ];

    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            Mission::Kindle => "kindle",
            Mission::Hold => "hold",
            Mission::Hunt => "hunt",
            Mission::Reckoning => "reckoning",
            Mission::Gauntlet => "gauntlet",
            Mission::Ambush => "ambush",
            Mission::Sever => "sever",
        }
    }
}

/// What a zone holds to be done.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Deal {
    /// Its garrison.
    Skirmish,
    Mission(Mission),
    /// A dungeon to its Miniboss.
    Vault,
    /// The island's resource in six nodes, guarded.
    Vein,
    /// A chest under guard.
    Reliquary,
    /// Its lamp, under guard.
    Lamp,
}

impl Deal {
    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            Deal::Skirmish => "skirmish",
            Deal::Mission(mission) => mission.key(),
            Deal::Vault => "vault",
            Deal::Vein => "vein",
            Deal::Reliquary => "reliquary",
            Deal::Lamp => "lamp",
        }
    }
}

/// A zone's own modifier, smaller than the week's, stronger with depth (`crate::strength`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Current {
    Hardened,
    Sharpened,
    Shielded,
    Crowded,
    Veteran,
    Gloom,
    Frail,
    Spent,
    Kindled,
    Bountiful,
    RichSeam,
}

/// A current's share of foes' health, damage, shields and so on at strength 1: a quarter or more for a bane, so it is
/// felt at the first depth it runs at, and at the deepest (strength 2) no more than the week's own modifier of its
/// kind.
pub const HARDENED: f64 = 0.25;
pub const SHARPENED: f64 = 0.25;
pub const SHIELDED: f64 = 0.25;
pub const VETERAN: f64 = 0.40;
pub const FRAIL: f64 = 0.25;
pub const SPENT: f64 = 0.25;
pub const KINDLED: f64 = 0.15;
pub const BOUNTIFUL: f64 = 0.40;

impl Current {
    pub const BANES: [Current; 8] = [
        Current::Hardened,
        Current::Sharpened,
        Current::Shielded,
        Current::Crowded,
        Current::Veteran,
        Current::Gloom,
        Current::Frail,
        Current::Spent,
    ];
    pub const BOONS: [Current; 3] = [Current::Kindled, Current::Bountiful, Current::RichSeam];

    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            Current::Hardened => "hardened",
            Current::Sharpened => "sharpened",
            Current::Shielded => "shielded",
            Current::Crowded => "crowded",
            Current::Veteran => "veteran",
            Current::Gloom => "gloom",
            Current::Frail => "frail",
            Current::Spent => "spent",
            Current::Kindled => "kindled",
            Current::Bountiful => "bountiful",
            Current::RichSeam => "rich-seam",
        }
    }

    #[must_use]
    pub fn is_boon(self) -> bool {
        Self::BOONS.contains(&self)
    }

    /// Its name, as the player reads it.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Current::Hardened => "Hardened",
            Current::Sharpened => "Sharpened",
            Current::Shielded => "Shielded",
            Current::Crowded => "Crowded",
            Current::Veteran => "Veteran",
            Current::Gloom => "Gloom",
            Current::Frail => "Frail",
            Current::Spent => "Spent",
            Current::Kindled => "Kindled",
            Current::Bountiful => "Bountiful",
            Current::RichSeam => "Rich Seam",
        }
    }

    /// What it does at a strength, in a short plain line for the player.
    #[must_use]
    pub fn words(self, strength: f64) -> String {
        let share = |base: f64| libm::round(base * strength * 100.0) as u32;
        match self {
            Current::Hardened => format!("Foes have {}% more health.", share(HARDENED)),
            Current::Sharpened => format!("Foes' blows deal {}% more damage.", share(SHARPENED)),
            Current::Shielded => format!("{}% more foes carry shields.", share(SHIELDED)),
            Current::Crowded => "Every band and wave has one more foe in it, two past depth 14.".to_owned(),
            Current::Veteran => format!("{}% of the weakest foes stand as stronger ones.", share(VETERAN)),
            Current::Gloom => {
                "Dark until the work is done: no one rises but by a revive, and a company all down falls back, \
                               its hauls lost."
                    .to_owned()
            }
            Current::Frail => format!("Heals give {}% less.", share(FRAIL)),
            Current::Spent => format!("Arts take {}% longer to recharge.", share(SPENT)),
            Current::Kindled => format!("Your blows deal {}% more damage.", share(KINDLED)),
            Current::Bountiful => format!("Vestiges drop {}% more often.", share(BOUNTIFUL)),
            Current::RichSeam => "Each node gives one more.".to_owned(),
        }
    }

    /// How many currents a zone at this depth runs: none at 1 to 3, one at 4 to 8, two at 9 to 14, three past that.
    #[must_use]
    pub fn count_at(depth: u8) -> usize {
        match depth {
            0..=3 => 0,
            4..=8 => 1,
            9..=14 => 2,
            _ => 3,
        }
    }

    /// Whether it says again what a week's modifier already does.
    #[must_use]
    pub fn restates(self, modifier: Modifier) -> bool {
        matches!(
            (self, modifier),
            (Current::Sharpened, Modifier::Lightswitch)
                | (Current::Shielded, Modifier::Ironclad)
                | (Current::Frail, Modifier::Exposure)
                | (Current::Spent, Modifier::Trickle)
                | (Current::Kindled, Modifier::Brawler | Modifier::Marksman)
        )
    }

    /// Whether a zone of this deal takes it: a rich seam only where there are nodes; Crowded only where bands or waves
    /// of the passages' own stand (not a vault's dungeon garrison, nor a lamp's Elite bands, held to three); Veteran
    /// only where such bands of Minors stand (not where foes come in waves alone).
    #[must_use]
    pub fn fits(self, deal: Deal) -> bool {
        match self {
            Current::RichSeam => deal == Deal::Vein,
            Current::Crowded => !matches!(deal, Deal::Vault | Deal::Lamp),
            Current::Veteran => !matches!(
                deal,
                Deal::Vault | Deal::Lamp | Deal::Mission(Mission::Kindle | Mission::Hold | Mission::Ambush)
            ),
            _ => true,
        }
    }

    /// A zone's currents, three in four a bane, never one twice, each one its deal takes and none saying again what
    /// the week's `modifiers` do.
    pub(crate) fn draw(depth: u8, deal: Deal, modifiers: &[Modifier], draws: &mut Draws) -> Vec<Current> {
        let mut currents = Vec::new();
        // Far more draws than a zone needs: a bane's pool keeps at least four that fit any deal and any week.
        for _ in 0..64 {
            if currents.len() >= Self::count_at(depth) {
                break;
            }
            let pool: &[Current] = if draws.unit() < 0.75 { &Self::BANES } else { &Self::BOONS };
            let Some(&current) = draws.pick(pool) else { break };
            let restated = modifiers.iter().any(|modifier| current.restates(*modifier));
            if current.fits(deal) && !restated && !currents.contains(&current) {
                currents.push(current);
            }
        }
        currents
    }
}

/// One zone of a week's web.
#[derive(Clone, Debug, PartialEq)]
pub struct Zone {
    /// Its number in the web, the shallowest first and each depth's from one side of the spine to the other.
    pub number: u16,
    pub depth: u8,
    /// Its place across its depth, 0 at one side of the spine.
    pub lane: u8,
    /// Where it lies on the island, (x, y) in the world, to show the way between zones.
    pub at: [f64; 2],
    pub ground: Ground,
    pub size: Size,
    pub deal: Deal,
    pub currents: Vec<Current>,
    /// The seed its ground and its foes are laid from.
    pub seed: u64,
    pub name: String,
    /// The zones of the next depth its onward mouths lead to, by number, in the order its mouths stand.
    pub onward: Vec<u16>,
    /// Whether it lies on the week's public way, one zone a depth, where players in public rooms meet.
    pub public: bool,
}

impl Zone {
    /// Whether it holds a lamp.
    #[must_use]
    pub fn has_lamp(&self) -> bool {
        crate::has_lamp(self.depth)
    }

    /// Its seed as the Forge takes one.
    #[must_use]
    pub fn forge_seed(&self) -> u32 {
        (self.seed ^ (self.seed >> 32)) as u32
    }
}
