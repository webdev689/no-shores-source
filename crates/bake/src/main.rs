//! The bake, run as `npm run bake` before the server runs or is bundled. It reads `content/world/layout.json`, each
//! landmass's edits in `content/world/land/`, the RMB index in `content/world/rmb/index.json` if there is one and the
//! open list in `content/world/open.json`, and writes each node's file and the index of them into `generated/nodes/`,
//! which git leaves out.
#![allow(clippy::print_stdout, reason = "a command-line tool reports to the terminal")]

use bake::{Builders, Listed, NodeFile, builders, ids_problem, lock, nodes_of};
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

fn every_node(
    continents: Vec<(Continent, String)>,
    blocks: &Blocks,
    builders: &Builders,
) -> Result<Vec<NodeFile>, String> {
    let threads = std::thread::available_parallelism().map_or(1, usize::from).min(AT_ONCE);
    let baked = in_turn(continents, threads, &|(continent, text): (Continent, String)| {
        land::edits::parse(&text)
            .map_err(|error| format!("{}: {error}", continent.id))
            .and_then(|edits| nodes_of(&continent, edits, blocks, builders))
    })?;
    let mut nodes = Vec::new();
    for each in baked {
        nodes.extend(each?);
    }
    Ok(nodes)
}

/// Works through `items` on `threads` threads, each taking the next item left, and gives back what each made in the
/// items' order, or an error if a thread panicked.
fn in_turn<Item: Send, Made: Send>(
    items: Vec<Item>,
    threads: usize,
    work: &(dyn Fn(Item) -> Made + Sync),
) -> Result<Vec<Made>, String> {
    let count = items.len();
    let queue = Mutex::new(items.into_iter().enumerate().collect::<VecDeque<_>>());
    let mut made = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..threads.max(1))
            .map(|_| {
                scope.spawn(|| {
                    let mut made = Vec::new();
                    loop {
                        let next = queue.lock().ok().and_then(|mut queue| queue.pop_front());
                        let Some((order, item)) = next else { break };
                        made.push((order, work(item)));
                    }
                    made
                })
            })
            .collect();
        let mut made = Vec::with_capacity(count);
        for handle in handles {
            made.extend(handle.join().map_err(|_| "a continent's bake panicked".to_owned())?);
        }
        Ok::<_, String>(made)
    })?;
    if made.len() != count {
        return Err("a continent's bake panicked".to_owned());
    }
    made.sort_by_key(|(order, _)| *order);
    Ok(made.into_iter().map(|(_, each)| each).collect())
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
    let mut nodes = every_node(continents, &blocks, &builders)?;
    if let Some(problem) = ids_problem(&nodes) {
        return Err(problem);
    }
    let open = content.join("open.json");
    let open: Vec<String> =
        serde_json::from_str(&read(&open)?).map_err(|error| format!("{}: {error}", open.display()))?;
    lock(&mut nodes, &open);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn work_done_in_turn_comes_back_in_order() {
        let made = in_turn((0..9).collect(), 3, &|number: i32| number * 2);
        assert_eq!(made, Ok((0..9).map(|number| number * 2).collect::<Vec<_>>()));
    }

    #[test]
    fn a_panic_in_a_thread_is_an_error_not_a_panic() {
        let made = in_turn((0..4).collect(), 2, &|number: i32| {
            assert!(number != 2, "this continent cannot be baked");
            number
        });
        assert_eq!(made, Err("a continent's bake panicked".to_owned()));
    }
}
