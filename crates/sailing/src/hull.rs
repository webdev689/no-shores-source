//! A hull's own numbers: her waterline's size and draught, her rig, and the gain DFO measured for it.

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

/// A hull: half her waterline's length and beam and her draught below it, metres; her gain (her way under the
/// responsive helm over the mod's own, which her handling's rates are read at); and her sails.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hull {
    pub name: &'static str,
    pub half_length_m: f64,
    pub half_beam_m: f64,
    pub draught_m: f64,
    pub gain: f64,
    pub sails: &'static [Sail],
}

/// The owner's Sloop, her waterline measured off her model by the ship export. She sails as Come Sail Away's Large
/// Boat II, whose rig is hers (a small gaff sail and a small staysail): its handling is the mod's own, unscaled, and its
/// gain DFO's for that rig.
pub const SLOOP: Hull = Hull {
    name: "sloop",
    half_length_m: 6.2258 / 2.0,
    half_beam_m: 1.856 / 2.0,
    draught_m: 0.6,
    gain: 1.159,
    sails: &[Sail { kind: SailKind::Gaff, size: SailSize::Small }, Sail { kind: SailKind::Stay, size: SailSize::Small }],
};
