//! Her rig as the balls tear it: each sail takes its share of the canvas harm that strikes it, and once that passes
//! its due (its share of her whole canvas) it tears away and her drive loses its share; a mast whose sails are all
//! gone falls when her rig is struck there again, and her balls pass where it stood. A sail's share is the pull it
//! gives at its crest over her whole canvas's (`sailing::helm::canvas`).

use crate::arms::arms_of;
use sailing::HullKind;
use sailing::helm::{SAIL_CREST_DEG, canvas, sail_power};
use sailing::hull::SailKind;

/// Square sails and gaffs whose fore edges lie within this of the last one's along her keel (metres) stand on one
/// mast.
pub const MAST_APART_M: f64 = 2.0;

/// What a blow on her rig did: tore a sail away (her sail index, as her manifest lists them), or felled a mast (fore
/// to aft).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Torn {
    Sail(usize),
    Mast(usize),
}

/// Her rig: each sail's share of her drive, the mast it stands on, the canvas harm it has taken, whether it is gone,
/// and whether each mast has fallen.
#[derive(Debug, Clone, PartialEq)]
pub struct Rigging {
    shares: Vec<f64>,
    masts: Vec<usize>,
    harm: Vec<f64>,
    lost: Vec<bool>,
    fallen: Vec<bool>,
}

/// The mast each sail of `hull` stands on, fore to aft: her square sails and gaffs by their fore edge along her keel,
/// taken from the bow aft, one mast while each lies within `MAST_APART_M` of the last; a staysail stands on her
/// foremost mast, its stay running to it.
#[must_use]
pub fn masts_of(hull: HullKind) -> Vec<usize> {
    let (sails, boxes) = (hull.hull().sails, arms_of(hull).sails);
    let mut fore_edges: Vec<f64> =
        sails.iter().zip(boxes).filter(|(sail, _)| sail.kind != SailKind::Stay).map(|(_, [_, high])| high[0]).collect();
    fore_edges.sort_by(|one, other| other.total_cmp(one));
    let mut masts: Vec<f64> = Vec::new();
    for edge in fore_edges {
        if masts.last().is_none_or(|last| last - edge > MAST_APART_M) {
            masts.push(edge);
        }
    }
    let mast_at = |edge: f64| masts.iter().rposition(|mast| *mast >= edge - 1e-9).unwrap_or(0);
    sails
        .iter()
        .zip(boxes)
        .map(|(sail, [_, high])| if sail.kind == SailKind::Stay { 0 } else { mast_at(high[0]) })
        .collect()
}

impl Rigging {
    /// A sound rig for `hull`.
    #[must_use]
    pub fn new(hull: HullKind) -> Self {
        let sails = hull.hull().sails;
        let whole = canvas(hull.hull());
        let crest = |kind: SailKind| if kind == SailKind::Square { 0.0 } else { SAIL_CREST_DEG };
        let shares = sails
            .iter()
            .map(|sail| if whole > 0.0 { sail_power(sail.kind, sail.size, crest(sail.kind)) / whole } else { 0.0 })
            .collect();
        let masts = masts_of(hull);
        let fallen = vec![false; masts.iter().max().map_or(0, |most| most + 1)];
        Rigging { shares, masts, harm: vec![0.0; sails.len()], lost: vec![false; sails.len()], fallen }
    }

    /// The share of her drive her standing sails give.
    #[must_use]
    pub fn standing(&self) -> f64 {
        self.shares.iter().zip(&self.lost).filter(|(_, lost)| !**lost).map(|(share, _)| share).sum()
    }

    /// Whether a ball may still strike sail `sail`'s box: its mast stands.
    #[must_use]
    pub fn up(&self, sail: usize) -> bool {
        self.masts.get(sail).is_some_and(|mast| !self.fallen[*mast])
    }

    /// The masts fallen, one bit a mast fore to aft.
    #[must_use]
    pub fn fallen_bits(&self) -> u8 {
        self.fallen.iter().enumerate().filter(|(_, fallen)| **fallen).fold(0, |bits, (mast, _)| bits | (1 << mast))
    }

    /// Whether sail `sail` is gone.
    #[must_use]
    pub fn lost(&self, sail: usize) -> bool {
        self.lost.get(sail).copied().unwrap_or(true)
    }

    /// A ball's canvas harm `harm` on sail `sail` of her `max_sail`: torn away once its harm passes its due; struck
    /// where it was, with every sail of its mast gone, the mast falls.
    pub fn struck(&mut self, sail: usize, harm: f64, max_sail: f64) -> Option<Torn> {
        if !self.up(sail) {
            return None;
        }
        let mast = self.masts[sail];
        if self.lost[sail] {
            let bare = self.masts.iter().zip(&self.lost).all(|(on, lost)| *on != mast || *lost);
            if bare {
                self.fallen[mast] = true;
                return Some(Torn::Mast(mast));
            }
            return None;
        }
        self.harm[sail] += harm.max(0.0);
        if self.harm[sail] > self.shares[sail] * max_sail {
            self.lost[sail] = true;
            return Some(Torn::Sail(sail));
        }
        None
    }

    /// Every number she holds, in a fixed order.
    #[must_use]
    pub fn numbers(&self) -> Vec<f64> {
        let flag = |on: &bool| f64::from(u8::from(*on));
        let mut numbers = self.harm.clone();
        numbers.extend(self.lost.iter().map(flag));
        numbers.extend(self.fallen.iter().map(flag));
        numbers
    }
}

#[cfg(test)]
#[path = "rigging_tests.rs"]
mod tests;
