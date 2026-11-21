//! A hull's own numbers: its waterline's size and draught, its rig, and the gain DFO measured for it; and the hulls
//! the game sails, each named by its key in the ships manifest (`content/ships/ships.json`).

/// A sail's kind, as Come Sail Away names them: each pulls along its own curve against the wind.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SailKind {
    Lateen,
    Gaff,
    Stay,
    Square,
}

/// A sail's size: a small or large one pulls a share of a normal one's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SailSize {
    Small,
    Normal,
    Large,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Sail {
    pub kind: SailKind,
    pub size: SailSize,
}

/// A hull: half its waterline's length and beam and its draught below it, metres; its gain (its way under the
/// responsive helm over the mod's own, which its handling's rates are read at); and its sails.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hull {
    pub name: &'static str,
    pub half_length_m: f64,
    pub half_beam_m: f64,
    pub draught_m: f64,
    pub gain: f64,
    pub sails: &'static [Sail],
}

/// The owner's Sloop, its waterline measured off its model by the ship export. It sails as Come Sail Away's
/// Large Boat II, whose rig is the Sloop's (a small staysail and a small gaff sail, as its manifest lists them): its
/// handling is the mod's own, unscaled, and its gain DFO's for that rig.
pub const SLOOP: Hull = Hull {
    name: "sloop",
    half_length_m: 18.6775 / 2.0,
    half_beam_m: 5.5684 / 2.0,
    draught_m: 1.7999,
    gain: 1.159,
    sails: &[small(SailKind::Stay), small(SailKind::Gaff)],
};

/// A sail of `kind`, small as every one of the Sloop's is.
const fn small(kind: SailKind) -> Sail {
    Sail { kind, size: SailSize::Small }
}

/// The Schooner, its waterline measured off its model by the ship export: a staysail and two gaff sails, as its
/// manifest has them. Its gain is DFO's for Come Sail Away's Large Boat V, its rig of a staysail and two gaffs.
pub const SCHOONER: Hull = Hull {
    name: "schooner",
    half_length_m: 25.1942 / 2.0,
    half_beam_m: 4.2756 / 2.0,
    draught_m: 2.0,
    gain: 1.233,
    sails: &[small(SailKind::Stay), small(SailKind::Gaff), small(SailKind::Gaff)],
};

/// The Brig, its waterline measured off its model: two staysails, three square sails on each of its two masts and a
/// gaff spanker, as its manifest has them. Its gain is DFO's for its galleon, its square-rigged two-master (the Small
/// Ship) with a gaff and a jib.
pub const BRIG: Hull = Hull {
    name: "brig",
    half_length_m: 30.7446 / 2.0,
    half_beam_m: 5.2883 / 2.0,
    draught_m: 2.2,
    gain: 1.643,
    sails: &[
        small(SailKind::Stay),
        small(SailKind::Stay),
        small(SailKind::Square),
        small(SailKind::Square),
        small(SailKind::Square),
        small(SailKind::Square),
        small(SailKind::Square),
        small(SailKind::Square),
        small(SailKind::Gaff),
    ],
};

/// The Frigate, its waterline measured off its model: two staysails, eight square sails on its three masts and a gaff
/// spanker, as its manifest has them. Its gain is DFO's for the Carrack, its square-rigged three-master.
pub const FRIGATE: Hull = Hull {
    name: "frigate",
    half_length_m: 38.0581 / 2.0,
    half_beam_m: 6.2015 / 2.0,
    draught_m: 2.4,
    gain: 1.798,
    sails: &[
        small(SailKind::Stay),
        small(SailKind::Stay),
        small(SailKind::Square),
        small(SailKind::Square),
        small(SailKind::Square),
        small(SailKind::Square),
        small(SailKind::Square),
        small(SailKind::Square),
        small(SailKind::Square),
        small(SailKind::Square),
        small(SailKind::Gaff),
    ],
};

/// Which hull a ship is, numbered 0 to 3 on the wire (0 the Sloop, so a reader that knows none reads it).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub enum HullKind {
    #[default]
    Sloop = 0,
    Schooner = 1,
    Brig = 2,
    Frigate = 3,
}

impl HullKind {
    pub const ALL: [HullKind; 4] = [HullKind::Sloop, HullKind::Schooner, HullKind::Brig, HullKind::Frigate];

    /// Its number on the wire.
    #[must_use]
    pub fn number(self) -> u8 {
        self as u8
    }

    /// The hull numbered so, if any.
    #[must_use]
    pub fn numbered(number: u8) -> Option<HullKind> {
        Self::ALL.into_iter().find(|kind| kind.number() == number)
    }

    /// Its hull's numbers.
    #[must_use]
    pub fn hull(self) -> &'static Hull {
        match self {
            HullKind::Sloop => &SLOOP,
            HullKind::Schooner => &SCHOONER,
            HullKind::Brig => &BRIG,
            HullKind::Frigate => &FRIGATE,
        }
    }

    /// Its key in the ships manifest.
    #[must_use]
    pub fn name(self) -> &'static str {
        self.hull().name
    }
}
