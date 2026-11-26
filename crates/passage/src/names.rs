//! A zone's name, as nothing new is named: under a place already named that it lies near, by that place ("Under Grey
//! Point Light"); else by what it is, its ground and then its deal ("A chalk cut held by the Tithe"). No two zones of a
//! web share a name, so a dive of twenty meets twenty.

use crate::island::Island;
use crate::zone::{Deal, Form, Ground, Mission, Zone};
use isle::draws::Draws;

/// How near a place a zone lies to be called by it, metres: twice the lanes' spacing, so the zones of a depth passing
/// under a zone of the world take its places' names.
const NEAR_M: f64 = 2.0 * crate::web::LANE_M;
/// How many names a zone draws before it keeps one another zone of its web holds.
const TRIES: u32 = 32;

/// Names a web's zones, the shallowest first, each on draws of its own seed.
pub(crate) fn name(island: &Island, zones: &mut [Zone]) {
    let mut taken: Vec<String> = Vec::new();
    for zone in zones.iter_mut() {
        let mut draws = Draws::of(zone.seed, 2);
        let free = |name: &str, taken: &[String]| !taken.iter().any(|held| held == name);
        let near: Vec<String> = island
            .places
            .iter()
            .filter(|(at, _)| libm::hypot(at[0] - zone.at[0], at[1] - zone.at[1]) <= NEAR_M)
            .map(|(_, place)| under(place))
            .filter(|name| free(name, &taken))
            .collect();
        let name = draws.pick(&near).cloned().unwrap_or_else(|| {
            let mut name = String::new();
            for _ in 0..TRIES {
                let noun = draws.pick(nouns_of(&zone.ground)).copied().unwrap_or("A passage");
                let phrase = draws.pick(phrases_of(zone.deal)).copied().unwrap_or("of the Tithe");
                name = format!("{noun} {phrase}");
                if free(&name, &taken) {
                    return name;
                }
            }
            // Every draw held already: its depth and lane tell it apart, as no other zone stands there.
            format!("{name}, {} deep, {}", zone.depth, zone.lane + 1)
        });
        taken.push(name.clone());
        zone.name = name;
    }
}

/// A zone's name under a place: "Under Moorend", "Under the Pearl Tomb".
fn under(place: &str) -> String {
    match place.strip_prefix("The ") {
        Some(rest) => format!("Under the {rest}"),
        None => format!("Under {place}"),
    }
}

/// What a zone's ground is called, by its style under ground or its form above.
fn nouns_of(ground: &Ground) -> &'static [&'static str] {
    match ground {
        Ground::Under { style } => match style.as_str() {
            "chalk" => &["A chalk cut", "A flint seam", "A chalk working"],
            "barrow" => &["A stone-lined way", "A barrow way", "A lintelled passage"],
            "caverns" => &["A dripping cave", "A low cave", "A wet cavern"],
            "mines" => &["An old working", "A propped adit", "A timbered drift"],
            "cells" => &["A row of cells", "A cell block", "A barred passage"],
            "crypt" => &["A crypt", "A burial way", "An ossuary"],
            "halls" => &["A pillared hall", "A long hall", "A great hall"],
            _ => &["A sanctum", "A quiet chapel", "A shrine room"],
        },
        Ground::Open { form } => match form {
            Form::Hollow => &["A grassy hollow", "A chalk hollow", "A round hollow"],
            Form::Ravine => &["A narrow cut", "A winding cleft", "A deep ravine"],
            Form::Shelves => &["A stepped hollow", "A shelf of rock", "A terraced hollow"],
            Form::Court => &["A ruined court", "A walled court", "A fallen court"],
            Form::Strand => &["A dry strand", "A shell bed", "A shell-strewn strand"],
            Form::Grove => &["A thicket", "A hidden grove", "A dark grove"],
        },
    }
}

/// What a zone holds to be done, as its name ends.
fn phrases_of(deal: Deal) -> &'static [&'static str] {
    match deal {
        Deal::Skirmish => &["held by the Tithe", "of the Tithe's watch", "under the Tithe"],
        Deal::Mission(Mission::Kindle) => &["of the dead lamps", "of three cold lamps"],
        Deal::Mission(Mission::Hold) => &["of the held ring", "of the last stand"],
        Deal::Mission(Mission::Hunt) => &["of the marked one", "of the hunt"],
        Deal::Mission(Mission::Reckoning) => &["of the collectors", "of the tallies"],
        Deal::Mission(Mission::Gauntlet) => &["of the long run", "run against time"],
        Deal::Mission(Mission::Ambush) => &["of the barred mouths", "of the trap"],
        Deal::Mission(Mission::Sever) => &["of the tally posts", "of the counting posts"],
        Deal::Vault => &["over a sealed vault", "over a guarded vault"],
        Deal::Vein => &["of the lode", "of the vein"],
        Deal::Reliquary => &["of the guarded chest", "of the reliquary"],
        Deal::Lamp => &["of the lamp", "of the standing stones"],
    }
}
