//! The bake, run as `npm run bake` before the server runs or is bundled. It reads `content/world/layout.json`, each
//! landmass's edits in `content/world/land/` and the RMB index in `content/world/rmb/index.json` if there is one, and
//! writes each node's file and the index of them into `generated/nodes/`, which git leaves out.
#![allow(clippy::print_stdout, reason = "a command-line tool reports to the terminal")]

use bake::{Builders, Listed, NodeFile, builders, ids_problem, nodes_of};
use city::rmb::Blocks;
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Mutex;
use world::layout::Continent;

/// The most continents generated at once: each takes up to a quarter of a gigabyte while it does.
const AT_ONCE: usize = 4;

fn main() -> ExitCode {
    match bake() {
        Ok(report) => {
            println!("{report}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("bake failed: {error}");
            ExitCode::FAILURE
        }
    }
}

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..")
}

fn read(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))
}

/// Each continent's nodes, generated a few continents at a time; the nodes come back in the layout's order.
fn every_node(
    continents: Vec<(Continent, String)>,
    blocks: &Blocks,
    builders: &Builders,
) -> Result<Vec<NodeFile>, String> {
    let count = continents.len();
    let queue = Mutex::new(continents.into_iter().enumerate().collect::<VecDeque<_>>());
    let baked = Mutex::new(Vec::with_capacity(count));
    let threads = std::thread::available_parallelism().map_or(1, usize::from).min(AT_ONCE);
    std::thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| {
                loop {
                    let next = queue.lock().ok().and_then(|mut queue| queue.pop_front());
                    let Some((order, (continent, text))) = next else { break };
                    let nodes = land::edits::parse(&text)
                        .map_err(|error| format!("{}: {error}", continent.id))
                        .and_then(|edits| nodes_of(&continent, edits, blocks, builders));
                    if let Ok(mut baked) = baked.lock() {
                        baked.push((order, nodes));
                    }
                }
            });
        }
    });
    let mut baked = baked.into_inner().map_err(|_| "a continent's bake panicked".to_owned())?;
    if baked.len() != count {
        return Err("a continent's bake panicked".to_owned());
    }
    baked.sort_by_key(|(order, _)| *order);
    let mut nodes = Vec::new();
    for (_, each) in baked {
        nodes.extend(each?);
    }
    Ok(nodes)
}

#[allow(
    clippy::disallowed_methods,
    reason = "the bake times its own run for its report; what it writes never reads it"
)]
fn bake() -> Result<String, String> {
    let started = std::time::Instant::now();
    let root = root();
    let content = root.join("content/world");
    let layout = world::layout::parse(&read(&content.join("layout.json"))?).map_err(|error| error.to_string())?;
    let rmb = content.join("rmb/index.json");
    let blocks = if rmb.is_file() { Blocks::from_index(&read(&rmb)?)? } else { Blocks::default() };
    let builders = builders(&root)?;
    let mut continents = Vec::new();
    for continent in layout.continents {
        let edits = content.join("land").join(format!("{}.json", continent.id));
        if edits.is_file() {
            continents.push((continent, read(&edits)?));
        }
    }
    let landmasses = continents.len();
    let nodes = every_node(continents, &blocks, &builders)?;
    if let Some(problem) = ids_problem(&nodes) {
        return Err(problem);
    }
    let folder = root.join("generated/nodes");
    if folder.is_dir() {
        std::fs::remove_dir_all(&folder).map_err(|error| format!("{}: {error}", folder.display()))?;
    }
    std::fs::create_dir_all(&folder).map_err(|error| format!("{}: {error}", folder.display()))?;
    let write = |name: &str, text: String| {
        let path = folder.join(name);
        std::fs::write(&path, &text).map_err(|error| format!("{}: {error}", path.display())).map(|()| text.len())
    };
    let mut bytes = 0;
    for node in &nodes {
        bytes += write(&format!("{}.json", node.id), serde_json::to_string(node).map_err(|error| error.to_string())?)?;
    }
    let listed: Vec<Listed> = nodes.iter().map(Listed::from).collect();
    write("index.json", serde_json::to_string_pretty(&listed).map_err(|error| error.to_string())?)?;
    let seconds = started.elapsed().as_secs_f64();
    let megabytes = bytes as f64 / 1_000_000.0;
    Ok(format!("baked {} nodes of {landmasses} landmasses in {seconds:.1} s: {megabytes:.2} MB", nodes.len()))
}
