//! A passage zone as the web draws it: its depth and place, its ground (under ground in a style and a number of the
//! Forge's blocks, or a hollow above ground of a form and a size), its deal, its currents, its seed and its name.

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

    #[must_use]
    pub fn of_key(key: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|form| form.key() == key)
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

/// A current's share of foes' health, damage, shields and so on at strength 1.
pub const HARDENED: f64 = 0.10;
pub const SHARPENED: f64 = 0.10;
pub const SHIELDED: f64 = 0.15;
pub const VETERAN: f64 = 0.25;
pub const FRAIL: f64 = 0.15;
pub const SPENT: f64 = 0.15;
pub const KINDLED: f64 = 0.08;
pub const BOUNTIFUL: f64 = 0.20;

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
            Current::Crowded => "Every band has more foes in it.".to_owned(),
            Current::Veteran => format!("{}% of the weakest foes stand as stronger ones.", share(VETERAN)),
            Current::Gloom => "It is dark here.".to_owned(),
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

    /// A zone's currents, three in four a bane, never one twice, and a rich seam only where there are nodes.
    pub(crate) fn draw(depth: u8, deal: Deal, draws: &mut Draws) -> Vec<Current> {
        let mut currents = Vec::new();
        while currents.len() < Self::count_at(depth) {
            let pool: &[Current] = if draws.unit() < 0.75 { &Self::BANES } else { &Self::BOONS };
            let Some(&current) = draws.pick(pool) else { break };
            let fits = current != Current::RichSeam || deal == Deal::Vein;
            if fits && !currents.contains(&current) {
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

/// The descriptive names a zone is called by, by its style under ground or its form above.
pub(crate) fn names_of(ground: &Ground) -> &'static [&'static str] {
    match ground {
        Ground::Under { style } => match style.as_str() {
            "chalk" => &["A chalk cut", "A flint seam", "A chalk working"],
            "barrow" => &["A stone-lined way", "A barrow way", "A lintelled passage"],
            "caverns" => &["A dripping cave", "A low cave"],
            "mines" => &["An old working", "A propped adit"],
            "cells" => &["A row of cells", "A cell block"],
            "crypt" => &["A crypt", "A burial way"],
            "halls" => &["A pillared hall", "A long hall"],
            _ => &["A sanctum", "A quiet chapel"],
        },
        Ground::Open { form } => match form {
            Form::Hollow => &["A grassy hollow", "A chalk hollow"],
            Form::Ravine => &["A narrow cut", "A winding cleft"],
            Form::Shelves => &["A stepped hollow", "A shelf of rock"],
            Form::Court => &["A ruined court", "A walled court"],
            Form::Strand => &["A dry strand", "A shell bed"],
            Form::Grove => &["A thicket", "A hidden grove"],
        },
    }
}
