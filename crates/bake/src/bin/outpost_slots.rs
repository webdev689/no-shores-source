//! Draws the outpost slots, run as `cargo run -p bake --bin outpost_slots`: three in each region of every continent
//! (an existing slot counts as one of its region's), each drawn from the continent's seed on land of its region where
//! the bake lays a level plot, clear of the coast, the port city and every other node, and named from the continent's
//! own words. It writes them into `content/world/land/<continent>.json` and `content/world/regions.json`, and leaves
//! a region already holding three as it is, so running it again changes nothing.
#![allow(clippy::print_stdout, reason = "a command-line tool reports to the terminal")]

use land::exact::{hash32, seed_of, sin_cos};
use land::places::distance_to_ring;
use land::sites::{Node, NodeKind, check_sites};
use layout::areas::PLOT_FROM_LANDING_M;
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use world::geometry::Point;

/// Slots a region holds.
const SLOTS: usize = 3;
/// A slot's section is a 20-sided ring this far round its middle, as the first sites were drawn, metres.
const RADIUS_M: f64 = 357.0;
/// How far from its region's centre a slot is drawn before it is brought to the shore, metres.
const FROM_CENTRE_M: (u32, u32) = (2000, 16000);
/// How far a slot's middle stands from the coast, metres: on the strand, as the first sites stand, its ring just
/// clear of the water.
const ON_STRAND_M: f64 = 450.0;
/// The least it may stand from any of the coast once brought to the strand, metres.
const FROM_COAST_M: f64 = RADIUS_M + 40.0;
/// How far a slot's middle stands from its port city's, metres, clear of the city's plan.
const FROM_CITY_M: f64 = 4000.0;
/// The ground left between a slot's ring and any other node's, metres.
const CLEAR_M: f64 = 300.0;
/// How far a plot's ground may stand off its level anywhere on its square, metres (as `tests/outposts_baked.rs`).
const LEVEL_WITHIN_M: f64 = 0.05;
/// Draws tried in a region before the tool gives up on it.
const DRAWS: u32 = 4000;

/// Each continent's own words a slot's name starts with, by its places' names and its land.
const WORDS: [[&str; 8]; 9] = [
    ["Saltwind", "Chalkdown", "Gullcry", "Sheepwalk", "Shingle", "Ternwing", "Driftweed", "Weirstone"],
    ["Cairnstone", "Heatherfell", "Slatewater", "Highcrag", "Peatmoss", "Ravenfell", "Fellwater", "Stoneheap"],
    ["Oakshade", "Mossbank", "Fernhollow", "Ashgrove", "Hazelwood", "Briarleaf", "Willowbend", "Thornbark"],
    ["Ochrestone", "Dunesand", "Sunscorch", "Redrock", "Dryreed", "Saltglare", "Duskdune", "Brasswind"],
    ["Goldgrass", "Tawnyreed", "Lionmane", "Amberdune", "Sunhide", "Hartsgrass", "Kilnsand", "Wheatsheaf"],
    ["Mistvine", "Ferntide", "Copperleaf", "Fogmoss", "Jadewater", "Vinewrap", "Palmshade", "Orchidfall"],
    ["Windscour", "Saltflat", "Kurganstone", "Dustgrass", "Galeworn", "Steppewind", "Flintcairn", "Driftsand"],
    ["Reedmarsh", "Bogwater", "Sedgefen", "Mireway", "Peatwater", "Rushwater", "Fenmoss", "Ravenreed"],
    ["Frostbite", "Icefloe", "Snowdrift", "Whitecap", "Rimewater", "Hoarfrost", "Sealskin", "Glacierfall"],
];
/// What a slot's name ends with: a landing place on the shore, as the first sites' are.
const ENDS: [&str; 6] = ["Strand", "Cove", "Hythe", "Ness", "Haven", "Landing"];

fn main() -> ExitCode {
    match run() {
        Ok(report) => {
            println!("{report}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("outpost slots failed: {error}");
            ExitCode::FAILURE
        }
    }
}

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..")
}

fn read(path: &str) -> Result<String, String> {
    std::fs::read_to_string(root().join(path)).map_err(|error| format!("{path}: {error}"))
}

fn write(path: &str, text: &str) -> Result<(), String> {
    std::fs::write(root().join(path), text).map_err(|error| format!("{path}: {error}"))
}

/// A region as `regions.json` lists it.
struct Region {
    name: String,
    centre: [f64; 2],
    nodes: Vec<String>,
}

fn regions_of(island: &Value) -> Vec<Region> {
    let point = |value: &Value| [value[0].as_f64().unwrap_or(0.0), value[1].as_f64().unwrap_or(0.0)];
    island["regions"]
        .as_array()
        .map(|regions| {
            regions
                .iter()
                .map(|region| Region {
                    name: region["name"].as_str().unwrap_or_default().to_owned(),
                    centre: point(&region["centre"]),
                    nodes: region["nodes"]
                        .as_array()
                        .map(|nodes| nodes.iter().filter_map(|node| node.as_str().map(str::to_owned)).collect())
                        .unwrap_or_default(),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn apart(first: [f64; 2], second: [f64; 2]) -> f64 {
    let (x, y) = (first[0] - second[0], first[1] - second[1]);
    (x * x + y * y).sqrt()
}

fn middle(node: &Node) -> [f64; 2] {
    let count = node.ring.len().max(1) as f64;
    let sum = node.ring.iter().fold([0.0, 0.0], |sum, point| [sum[0] + point.x as f64, sum[1] + point.y as f64]);
    [sum[0] / count, sum[1] / count]
}

fn reach(node: &Node) -> f64 {
    let at = middle(node);
    node.ring.iter().map(|point| apart(at, [point.x as f64, point.y as f64])).fold(0.0, f64::max)
}

/// The point of the coast nearest `at`, on its edges.
fn nearest_on(coast: &[Point], at: [f64; 2]) -> [f64; 2] {
    let corners = coast.iter().map(|point| [point.x as f64, point.y as f64]);
    let edges = corners.clone().zip(corners.cycle().skip(1)).map(|(from, to)| {
        let along = [to[0] - from[0], to[1] - from[1]];
        let square = along[0] * along[0] + along[1] * along[1];
        let share = (((at[0] - from[0]) * along[0] + (at[1] - from[1]) * along[1]) / square.max(1.0)).clamp(0.0, 1.0);
        [from[0] + along[0] * share, from[1] + along[1] * share]
    });
    edges.min_by(|first, second| apart(*first, at).total_cmp(&apart(*second, at))).unwrap_or(at)
}

fn point(at: [f64; 2]) -> Point {
    Point::from([at[0].round() as i64, at[1].round() as i64])
}

/// A slot's section round `at`, its first point due north and on clockwise, and its spawn toward the nearest coast.
fn slot_at(at: [f64; 2], coast: &[Point]) -> Node {
    let ring = (0..20)
        .map(|step| {
            let (sin, cos) = sin_cos(f64::from(step) * 18f64.to_radians());
            point([at[0] + RADIUS_M * sin, at[1] - RADIUS_M * cos])
        })
        .collect();
    let shore = nearest_on(coast, at);
    let way = apart(shore, at).max(1.0);
    let spawn = [at[0] + (shore[0] - at[0]) / way * RADIUS_M * 0.8, at[1] + (shore[1] - at[1]) / way * RADIUS_M * 0.8];
    // Its id and name are given from the names drawn before it (`slots_of`); the placeholder only passes the check.
    Node { id: "slot".to_owned(), kind: NodeKind::Outpost, name: "Slot".to_owned(), ring, spawns: vec![point(spawn)] }
}

/// The next slot of a region past draw `from`: on its land, nearer its centre than any other region's, clear of the
/// coast, the city and `taken`; and the draw it was found at.
fn draw(
    seed: u32,
    regions: &[Region],
    region: usize,
    coast: &[Point],
    city: Option<[f64; 2]>,
    taken: &[Node],
    from: u32,
) -> Option<(Node, u32)> {
    let seed = seed_of(seed, &format!("outpost slot {}", regions[region].name));
    (from..DRAWS).find_map(|number| {
        let [turn, far] = [0, 1].map(|salt| hash32(&[i64::from(seed), i64::from(number), salt]));
        let turn = f64::from(turn % 3600) / 10.0;
        let far = f64::from(FROM_CENTRE_M.0 + far % (FROM_CENTRE_M.1 - FROM_CENTRE_M.0));
        let centre = regions[region].centre;
        let (sin, cos) = sin_cos(turn.to_radians());
        let drawn = [centre[0] + far * sin, centre[1] - far * cos];
        // Brought to the strand: on the line from the nearest coast to the drawn point, a strand's width inland.
        let shore = nearest_on(coast, drawn);
        // Inland is toward the drawn point when it fell on land, away from it when it fell in the sea.
        let inland = if world::geometry::ring_contains(coast, point(drawn)) { 1.0 } else { -1.0 };
        let way = apart(shore, drawn).max(1.0) * inland;
        let at = [
            shore[0] + (drawn[0] - shore[0]) / way * ON_STRAND_M,
            shore[1] + (drawn[1] - shore[1]) / way * ON_STRAND_M,
        ];
        let nearest =
            (0..regions.len()).min_by(|&a, &b| apart(regions[a].centre, at).total_cmp(&apart(regions[b].centre, at)));
        let shore = distance_to_ring(coast, point(at));
        let fits = nearest == Some(region)
            && world::geometry::ring_contains(coast, point(at))
            && shore >= FROM_COAST_M
            && city.is_none_or(|city| apart(city, at) >= FROM_CITY_M)
            && taken.iter().all(|other| apart(middle(other), at) >= RADIUS_M + reach(other) + CLEAR_M);
        let slot = slot_at(at, coast);
        (fits && check_sites(coast, None, std::slice::from_ref(&slot)).is_empty()).then_some((slot, number))
    })
}

/// Which of `ids` the bake lays no bare, level plot for in reach of its landing (as `tests/outposts_baked.rs` asks), or
/// lays a box across a way of, on `edits` laid on `continent`.
fn unlaid(
    continent: &world::layout::Continent,
    edits: land::edits::Edits,
    blocks: &city::rmb::Blocks,
    builders: &bake::Builders,
    ids: &[String],
) -> Result<Vec<String>, String> {
    let mut landmass = land::landmass::generate(continent, edits)?;
    if let Some(problem) = landmass.problems().first() {
        return Err(format!("{}: {}: {}", continent.id, problem.subject, problem.message));
    }
    city::settle(&mut landmass, blocks)?;
    let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
    Ok(ids
        .iter()
        .filter(|id| {
            let Some(layout) = layouts.iter().find(|layout| &&layout.id == id) else { return true };
            let [west, north, east, south] = bake::bounds_of(&layout.ring);
            let window = landmass.surface.window(west, north, east, south);
            let Some(outpost) = bake::outpost_of(layout, &window) else { return true };
            bake::plot_off(&outpost, &window) > LEVEL_WITHIN_M
                || apart(outpost.plot, outpost.landing) > PLOT_FROM_LANDING_M
                || !bake::on_plot(layout).is_empty()
                || blocks_a_way(layout, &landmass.surface)
        })
        .cloned()
        .collect())
}

/// Whether a box of the layout stands across one of its ways' walked width between a step and head height, as the
/// room's `tests/layouts_laid.rs` asks of Saltmere's: a slot by a cliff can stand its rim's ruins on its own path.
fn blocks_a_way(layout: &layout::Layout, ground: &land::ground::Ground) -> bool {
    const HEAD_M: f64 = 1.8;
    const STEPPED_OVER_M: f64 = 0.45;
    let walked = layout.paths.iter().filter(|path| !layout.runs.iter().any(|run| run.line == path.points));
    walked.into_iter().any(|path| {
        // Boxes are written grown out to the centimetre, so a box grazing the edge by that much is not in the way.
        let reach = path.tier.width() / 2.0 - 0.02;
        path.points.windows(2).any(|pair| {
            let steps = (apart(pair[0], pair[1]) / 0.25).ceil().max(1.0) as usize;
            (0..=steps).any(|step| {
                let share = step as f64 / steps as f64;
                let at =
                    [pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share];
                let floor = ground.height_at(at[0], at[1]);
                layout.boxes.iter().any(|found| {
                    let east = (found[0] - at[0]).max(at[0] - found[2]).max(0.0);
                    let south = (found[1] - at[1]).max(at[1] - found[3]).max(0.0);
                    (east * east + south * south).sqrt() < reach
                        && found[5] < floor + HEAD_M
                        && found[4] > floor + STEPPED_OVER_M
                })
            })
        })
    })
}

/// A slot's name from the continent's words and a shore's ending, one no place of the world has yet.
fn name_of(seed: u32, words: &[&str; 8], used: &BTreeSet<String>) -> Result<String, String> {
    let names = words.iter().flat_map(|word| ENDS.iter().map(move |end| (*word, format!("{word} {end}"))));
    let mut names: Vec<(&str, String)> =
        names.filter(|(_, name)| !used.contains(name) && !used.contains(&id_of(name))).collect();
    // A word no slot of the continent starts with yet comes first, so its slots' names differ at a glance.
    names.sort_by_key(|(word, name)| {
        let again = used.iter().any(|named| named.starts_with(&format!("{word} ")));
        (again, hash32(&[i64::from(seed), i64::from(hash32(&name.bytes().map(i64::from).collect::<Vec<_>>()))]))
    });
    names.into_iter().next().map(|(_, name)| name).ok_or_else(|| "a continent ran out of names".to_owned())
}

fn id_of(name: &str) -> String {
    format!("{}-outpost", name.to_lowercase().replace(' ', "-"))
}

/// One continent's new slots, each with the index of its region, or none where every region holds three.
fn slots_of(
    continent: &world::layout::Continent,
    text: &str,
    regions: &[Region],
    blocks: &city::rmb::Blocks,
    builders: &bake::Builders,
    (words, used): (&[&str; 8], &BTreeSet<String>),
) -> Result<Vec<(usize, Node)>, String> {
    let edits = land::edits::parse(text).map_err(|error| format!("{}: {error}", continent.id))?;
    let landmass = land::landmass::generate(continent, edits.clone())?;
    let (coast, seed) = (landmass.coast.clone(), landmass.seed);
    drop(landmass);
    let city = edits.city.as_ref().map(|city| [city.centre.x as f64, city.centre.y as f64]);
    let wanted: Vec<usize> = regions
        .iter()
        .map(|region| {
            let held =
                edits.nodes.iter().filter(|node| node.kind == NodeKind::Outpost && region.nodes.contains(&node.id));
            SLOTS.saturating_sub(held.count())
        })
        .collect();
    // Named before they are laid: a layout is drawn from its node's id.
    let mut named = used.clone();
    let seed_named = seed_of(0x0057, &continent.id);
    let mut names = Vec::new();
    for number in 0..wanted.iter().sum::<usize>() {
        let name = name_of(seed_named ^ hash32(&[(edits.nodes.len() + number) as i64]), words, &named)?;
        named.extend([id_of(&name), name.clone()]);
        names.push(name);
    }
    let mut next: Vec<u32> = vec![0; regions.len()];
    loop {
        let mut taken = edits.nodes.clone();
        let mut drawn: Vec<(usize, Node, u32)> = Vec::new();
        for (region, &count) in wanted.iter().enumerate() {
            let mut from = next[region];
            for _ in 0..count {
                let (mut node, number) = draw(seed, regions, region, &coast, city, &taken, from)
                    .ok_or_else(|| format!("{} {}: no ground for a slot", continent.id, regions[region].name))?;
                node.name.clone_from(&names[drawn.len()]);
                node.id = id_of(&node.name);
                taken.push(node.clone());
                drawn.push((region, node, number));
                from = number + 1;
            }
        }
        if drawn.is_empty() {
            return Ok(Vec::new());
        }
        let mut trial = edits.clone();
        trial.nodes.extend(drawn.iter().map(|(_, node, _)| node.clone()));
        let ids: Vec<String> = drawn.iter().map(|(_, node, _)| node.id.clone()).collect();
        let bare = unlaid(continent, trial, blocks, builders, &ids)?;
        // A slot the bake lays badly is passed over: its region draws again from past it.
        let Some(first) = drawn.iter().find(|(_, node, _)| bare.contains(&node.id)) else {
            return Ok(drawn.into_iter().map(|(region, node, _)| (region, node)).collect());
        };
        println!("{} {}: draw {} fails a laid check, drawn past", continent.id, regions[first.0].name, first.2);
        next[first.0] = first.2 + 1;
    }
}

/// `regions.json` in its written form: an island to a block, a region to a line.
fn regions_text(islands: &[Value]) -> String {
    let lines: Vec<String> = islands
        .iter()
        .map(|island| {
            let regions = island["regions"].as_array().map(Vec::as_slice).unwrap_or_default();
            let rows: Vec<String> = regions
                .iter()
                .map(|region| {
                    let numbers = |value: &Value| {
                        let numbers = value.as_array().map(Vec::as_slice).unwrap_or_default();
                        numbers.iter().map(Value::to_string).collect::<Vec<_>>().join(", ")
                    };
                    let nodes = region["nodes"].as_array().map(Vec::as_slice).unwrap_or_default();
                    format!(
                        "      {{\"name\": {}, \"centre\": [{}], \"anchorage\": [{}], \"nodes\": [{}]}}",
                        region["name"],
                        numbers(&region["centre"]),
                        numbers(&region["anchorage"]),
                        nodes.iter().map(Value::to_string).collect::<Vec<_>>().join(", ")
                    )
                })
                .collect();
            format!(
                "  {{\n    \"island\": {},\n    \"regions\": [\n{}\n    ]\n  }}",
                island["island"],
                rows.join(",\n")
            )
        })
        .collect();
    format!("[\n{}\n]\n", lines.join(",\n"))
}

fn island_of(islands: &[Value], id: &str) -> Option<usize> {
    islands.iter().position(|island| island["island"] == id)
}

fn run() -> Result<String, String> {
    let world = world::layout::parse(&read("content/world/layout.json")?).map_err(|error| error.to_string())?;
    let builders = bake::builders(&root())?;
    let blocks = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")?)?;
    let mut islands: Vec<Value> =
        serde_json::from_str(&read("content/world/regions.json")?).map_err(|error| format!("regions.json: {error}"))?;
    let texts: Vec<String> = world
        .continents
        .iter()
        .map(|continent| read(&format!("content/world/land/{}.json", continent.id)))
        .collect::<Result<_, _>>()?;
    let mut used: BTreeSet<String> = BTreeSet::new();
    for text in &texts {
        let edits = land::edits::parse(text).map_err(|error| error.to_string())?;
        used.extend(edits.city.iter().flat_map(|city| [city.id.clone(), city.name.clone()]));
        used.extend(edits.nodes.iter().flat_map(|node| [node.id.clone(), node.name.clone()]));
    }
    let found: Vec<Result<Vec<(usize, Node)>, String>> = std::thread::scope(|scope| {
        // Three at once: each continent laid out takes up to a quarter of a gigabyte.
        world
            .continents
            .chunks(3)
            .zip(texts.chunks(3))
            .zip(WORDS.chunks(3))
            .flat_map(|((continents, texts), words)| {
                let handles: Vec<_> = continents
                    .iter()
                    .zip(texts)
                    .zip(words)
                    .map(|((continent, text), words)| {
                        let regions =
                            island_of(&islands, &continent.id).map(|at| regions_of(&islands[at])).unwrap_or_default();
                        let (blocks, builders, used) = (&blocks, &builders, &used);
                        scope.spawn(move || slots_of(continent, text, &regions, blocks, builders, (words, used)))
                    })
                    .collect();
                handles.into_iter().map(|handle| handle.join().unwrap_or_else(|_| Err("a continent panicked".into())))
            })
            .collect()
    });
    let mut report = Vec::new();
    for (continent, (text, slots)) in world.continents.iter().zip(texts.iter().zip(found)) {
        let slots = slots?;
        if slots.is_empty() {
            continue;
        }
        let at = island_of(&islands, &continent.id).ok_or_else(|| format!("{} has no regions", continent.id))?;
        let mut edits = land::edits::parse(text).map_err(|error| error.to_string())?;
        for (region, slot) in slots {
            report.push(format!(
                "{} {}: {} ({})",
                continent.id,
                regions_of(&islands[at])[region].name,
                slot.name,
                slot.id
            ));
            let listed = islands[at]["regions"][region]["nodes"].as_array_mut().ok_or("a region lists its nodes")?;
            listed.push(Value::String(slot.id.clone()));
            edits.nodes.push(slot);
        }
        let written = land::edits::write(&edits).map_err(|error| error.to_string())?;
        write(&format!("content/world/land/{}.json", continent.id), &format!("{}\n", written.trim_end()))?;
    }
    write("content/world/regions.json", &regions_text(&islands))?;
    Ok(if report.is_empty() { "every region holds its three slots".to_owned() } else { report.join("\n") })
}
