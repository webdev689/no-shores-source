//! A week's web of an island's passages: three zones at the first depth, one behind each mouth, then three or four at
//! each depth to the twentieth, each lying across the island along its spine; the week's share of its landmark zones
//! at their depths; and the ways on, each zone to one to three of the next depth's beside it, so ways cross and
//! meet, every zone with a way in. It is drawn from the island and the week alone.

use crate::island::{Island, Landmark};
use crate::zone::{Current, Deal, Form, Ground, Mission, Size, Zone, names_of};
use crate::{DEPTHS, has_lamp};
use isle::draws::{Draws, mix};

/// How far apart zones of one depth lie across the spine, metres.
pub const LANE_M: f64 = 14_000.0;
/// The share of zones laid under ground, the rest hollows above it.
const UNDER_SHARE: f64 = 0.5;
/// The deals' weights: skirmish, mission, vault, vein and reliquary.
const DEALS: [(u32, u8); 5] = [(30, 0), (35, 1), (10, 2), (12, 3), (13, 4)];
/// The forms' weights above ground.
const FORMS: [(u32, Form); 6] = [
    (22, Form::Hollow),
    (20, Form::Ravine),
    (16, Form::Shelves),
    (16, Form::Court),
    (12, Form::Strand),
    (14, Form::Grove),
];
/// The styles under ground at each five depths, the shallowest first.
const STYLES: [&[&str]; 4] = [
    &["chalk", "chalk", "caverns", "mines"],
    &["chalk", "barrow", "cells", "mines"],
    &["barrow", "crypt", "halls", "caverns"],
    &["barrow", "sanctum", "crypt", "halls"],
];

/// The web of an island's passages for a week.
#[derive(Clone, Debug, PartialEq)]
pub struct Web {
    pub island: &'static Island,
    pub week: u64,
    /// Every zone, the shallowest first, each depth's in its lanes' order.
    pub zones: Vec<Zone>,
    /// The zone behind each of the island's mouths, in the mouths' order.
    pub mouths: Vec<u16>,
}

/// A whole number of `weights`' kinds, each as likely as its weight.
fn weighted<Kind: Copy>(weights: &[(u32, Kind)], draws: &mut Draws) -> Kind {
    let total: u32 = weights.iter().map(|(weight, _)| weight).sum();
    let mut left = (draws.unit() * f64::from(total)) as u32;
    for &(weight, kind) in weights {
        if left < weight {
            return kind;
        }
        left -= weight;
    }
    weights[weights.len() - 1].1
}

/// The island's seed: its id's, as the dungeons name theirs.
fn island_seed(island: &Island) -> u64 {
    u64::from(dungeon::lane::named(&format!("passages:{}", island.id)))
}

/// A size, larger past depth 10 and at least medium where a lamp or a vault needs the room.
fn size_of(depth: u8, least: Size, draws: &mut Draws) -> Size {
    let weights = if depth > 10 {
        [(15, Size::Small), (45, Size::Medium), (40, Size::Large)]
    } else {
        [(40, Size::Small), (35, Size::Medium), (25, Size::Large)]
    };
    weighted(&weights, draws).max(least)
}

/// A deal for a zone that holds no lamp: a vault only under ground.
fn deal_of(under: bool, draws: &mut Draws) -> Deal {
    match weighted(&DEALS, draws) {
        1 => Deal::Mission(*draws.pick(&Mission::ALL).unwrap_or(&Mission::Hold)),
        2 if under => Deal::Vault,
        3 => Deal::Vein,
        4 => Deal::Reliquary,
        _ => Deal::Skirmish,
    }
}

/// What stands at one place of a depth: a landmark, or a zone drawn there.
enum Standing<'island> {
    Landmark(&'island Landmark),
    Drawn,
}

/// The landmarks a week shows at a depth: its anchors always, and of the rest one or two drawn by the week.
fn landmarks_at<'island>(island: &'island Island, depth: u8, draws: &mut Draws) -> Vec<&'island Landmark> {
    let here = island.landmarks.iter().filter(|mark| mark.depth == depth);
    let (anchors, mut rest): (Vec<&Landmark>, Vec<&Landmark>) = here.partition(|mark| mark.anchor);
    let mut shown = anchors;
    let wanted = if draws.unit() < 0.4 { 2 } else { 1 };
    while shown.len() < wanted && !rest.is_empty() {
        shown.push(rest.remove(draws.index(rest.len())));
    }
    shown
}

impl Web {
    /// The web an island's passages lay in a week.
    #[must_use]
    pub fn of(island: &'static Island, week: u64) -> Self {
        let seed = mix(island_seed(island), week);
        let mut zones: Vec<Zone> = Vec::new();
        let mut depths: Vec<Vec<u16>> = Vec::new();
        for depth in 1..=DEPTHS {
            let mut draws = Draws::of(seed, u64::from(depth));
            let marks = landmarks_at(island, depth, &mut draws);
            let width = if depth == 1 { island.mouths.len().max(1) } else { 3 + usize::from(draws.unit() < 0.5) };
            let width = width.max(marks.len()).min(5);
            // The landmarks take the middle lanes: they lie by the spine itself.
            let first_mark = (width - marks.len()) / 2;
            let mut row = Vec::new();
            for lane in 0..width {
                let standing = lane
                    .checked_sub(first_mark)
                    .and_then(|at| marks.get(at))
                    .map_or(Standing::Drawn, |mark| Standing::Landmark(mark));
                let number = u16::try_from(zones.len()).unwrap_or(u16::MAX);
                let zone_seed = mix(seed, u64::from(depth) * 64 + lane as u64);
                zones.push(Self::zone(island, (depth, lane, width), number, zone_seed, standing));
                row.push(number);
            }
            depths.push(row);
        }
        for depth in 0..depths.len().saturating_sub(1) {
            let mut draws = Draws::of(seed, 100 + depth as u64);
            Self::link(&mut zones, (&depths[depth], &depths[depth + 1]), &mut draws);
        }
        let mouths = depths.first().cloned().unwrap_or_default();
        Web { island, week, zones, mouths }
    }

    /// One zone at a lane of a depth `width` zones wide: a landmark's ground and place, or ground drawn and laid
    /// along the spine.
    fn zone(
        island: &Island,
        (depth, lane, width): (u8, usize, usize),
        number: u16,
        seed: u64,
        standing: Standing,
    ) -> Zone {
        let mut draws = Draws::of(seed, 1);
        let lamp = has_lamp(depth);
        let (spine_at, way) = island.along(f64::from(depth));
        let across = (lane as f64 - (width as f64 - 1.0) / 2.0) * LANE_M;
        // Across the spine is the way turned a quarter: x east, y south.
        let drawn_at = [spine_at[0] - way[1] * across, spine_at[1] + way[0] * across];
        let (ground, at, landmark) = match standing {
            Standing::Landmark(mark) => {
                let ground = match (&mark.style, mark.form) {
                    (Some(style), _) => Ground::Under { style: style.clone() },
                    (None, form) => Ground::Open { form: form.unwrap_or(Form::Hollow) },
                };
                (ground, mark.at, Some(mark.name.clone()))
            }
            Standing::Drawn => {
                let ground = if draws.unit() < UNDER_SHARE {
                    let styles = STYLES[usize::from((depth - 1) / 5).min(STYLES.len() - 1)];
                    Ground::Under { style: (*draws.pick(styles).unwrap_or(&"caverns")).to_owned() }
                } else {
                    Ground::Open { form: weighted(&FORMS, &mut draws) }
                };
                (ground, drawn_at, None)
            }
        };
        let under = matches!(ground, Ground::Under { .. });
        let deal = if lamp { Deal::Lamp } else { deal_of(under, &mut draws) };
        let least = if lamp || deal == Deal::Vault { Size::Medium } else { Size::Small };
        let size = size_of(depth, least, &mut draws);
        let currents = Current::draw(depth, deal, &mut draws);
        let name = landmark.clone().unwrap_or_else(|| {
            let names = names_of(&ground);
            (*draws.pick(names).unwrap_or(&"A passage")).to_owned()
        });
        let lane = u8::try_from(lane).unwrap_or(u8::MAX);
        Zone { number, depth, lane, at, ground, size, deal, currents, seed, name, onward: Vec::new(), landmark }
    }

    /// The ways on from one depth's zones to the next's: each to one to three of those beside it across the spine,
    /// the nearest always, then every zone of the next depth left without a way in given one from the nearest.
    fn link(zones: &mut [Zone], (from, to): (&[u16], &[u16]), draws: &mut Draws) {
        let place = |row: &[u16], at: usize| if row.len() < 2 { 0.5 } else { at as f64 / (row.len() - 1) as f64 };
        let reach = 1.0 / (from.len().min(to.len()).max(2) - 1) as f64 + 1e-9;
        let mut reached = vec![false; to.len()];
        for (at, &number) in from.iter().enumerate() {
            let here = place(from, at);
            let mut near: Vec<(f64, usize)> = (0..to.len())
                .map(|next| ((place(to, next) - here).abs(), next))
                .filter(|(gap, _)| *gap <= reach)
                .collect();
            near.sort_by(|one, other| one.0.total_cmp(&other.0).then(one.1.cmp(&other.1)));
            let count = (1 + draws.index(3)).min(near.len()).max(1);
            let mut chosen: Vec<usize> = near.iter().take(count).map(|(_, next)| *next).collect();
            if chosen.is_empty() {
                chosen.push(((here * (to.len() - 1) as f64).round() as usize).min(to.len() - 1));
            }
            chosen.sort_unstable();
            for next in chosen {
                reached[next] = true;
                zones[usize::from(number)].onward.push(to[next]);
            }
        }
        for (next, _) in reached.iter().enumerate().filter(|(_, reached)| !**reached) {
            let there = place(to, next);
            let nearest = (0..from.len())
                .min_by(|one, other| (place(from, *one) - there).abs().total_cmp(&(place(from, *other) - there).abs()))
                .unwrap_or(0);
            let onward = &mut zones[usize::from(from[nearest])].onward;
            onward.push(to[next]);
            onward.sort_unstable();
        }
    }

    /// A zone by its number.
    #[must_use]
    pub fn zone_of(&self, number: u16) -> Option<&Zone> {
        self.zones.get(usize::from(number))
    }

    /// The zones at a depth, in their lanes' order.
    pub fn at_depth(&self, depth: u8) -> impl Iterator<Item = &Zone> {
        self.zones.iter().filter(move |zone| zone.depth == depth)
    }

    /// The zones a zone is reached from.
    pub fn ways_in(&self, number: u16) -> impl Iterator<Item = &Zone> {
        self.zones.iter().filter(move |zone| zone.onward.contains(&number))
    }
}
