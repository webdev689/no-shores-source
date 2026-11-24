//! Writes the Breaches' tables as the crate builds: each plan in `content/dungeon/breach-*.json` and every module its
//! rules stand on from `content/modules/modules.json`, so the rules lay the very pieces the Blender scripts build and
//! the room reads no file at run time.

use std::fmt::Write as _;

/// A number as Rust writes it back to the same bits.
fn number(value: &serde_json::Value) -> String {
    format!("{:?}", value.as_f64().expect("a number"))
}

/// A list of numbers as a Rust array.
fn numbers(value: &serde_json::Value) -> String {
    let each: Vec<String> = value.as_array().expect("a list of numbers").iter().map(number).collect();
    format!("[{}]", each.join(", "))
}

fn text(value: &serde_json::Value) -> String {
    format!("{:?}", value.as_str().expect("a string"))
}

fn whole(value: &serde_json::Value) -> u64 {
    value.as_u64().expect("a whole number")
}

/// A module's table: its name, size, parts and sockets.
fn module(entry: &serde_json::Value) -> String {
    let parts: Vec<String> = entry["parts"].as_array().expect("its parts").iter().map(numbers).collect();
    let sockets: Vec<String> = entry["sockets"]
        .as_array()
        .expect("its sockets")
        .iter()
        .map(|socket| {
            let (name, at, facing) = (text(&socket["name"]), numbers(&socket["at"]), numbers(&socket["facing"]));
            format!("ModuleSocket {{ name: {name}, at: {at}, facing: {facing} }}")
        })
        .collect();
    format!(
        "ModuleTable {{ name: {}, size: {}, parts: &[{}], sockets: &[{}] }}",
        text(&entry["name"]),
        numbers(&entry["size"]),
        parts.join(", "),
        sockets.join(", ")
    )
}

fn main() {
    let plan_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../content/dungeon/breach-drowned-vale.json");
    let manifest_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../content/modules/modules.json");
    println!("cargo::rerun-if-changed={plan_path}");
    println!("cargo::rerun-if-changed={manifest_path}");
    let read = |path: &str| -> serde_json::Value {
        serde_json::from_str(&std::fs::read_to_string(path).expect("the content file")).expect("its JSON")
    };
    let (plan, manifest) = (read(plan_path), read(manifest_path));
    let spaces: Vec<String> = plan["spaces"]
        .as_array()
        .expect("its spaces")
        .iter()
        .map(|space| {
            let (key, module, at) = (text(&space["key"]), text(&space["module"]), numbers(&space["at"]));
            format!("SpaceTable {{ key: {key}, module: {module}, at: {at}, turn: {} }}", whole(&space["turn"]))
        })
        .collect();
    let seals: Vec<String> = plan["seals"]
        .as_array()
        .expect("its seals")
        .iter()
        .map(|seal| {
            let (space, socket, opens) = (text(&seal["space"]), text(&seal["socket"]), text(&seal["opens"]));
            format!("SealTable {{ space: {space}, socket: {socket}, opens: {opens}, turn: {} }}", whole(&seal["turn"]))
        })
        .collect();
    let slabs: Vec<String> = plan["slabs"]
        .as_array()
        .expect("its slabs")
        .iter()
        .map(|slab| {
            let (space, socket) = (text(&slab["space"]), text(&slab["socket"]));
            format!("SlabTable {{ space: {space}, socket: {socket}, phase: {} }}", whole(&slab["phase"]))
        })
        .collect();
    let pairs = |key: &str| -> Vec<String> {
        let map = plan[key].as_object().expect("a map");
        map.iter()
            .map(|(name, value)| match value {
                serde_json::Value::Array(list) => {
                    let each: Vec<String> = list.iter().map(text).collect();
                    format!("({name:?}, &[{}])", each.join(", "))
                }
                _ => format!("({name:?}, &[{}])", text(value)),
            })
            .collect()
    };
    // The modules the rules stand on: each space's, and the seal's, the slab's and the gate's.
    let mut wanted: Vec<String> =
        plan["spaces"].as_array().expect("its spaces").iter().map(|space| space["module"].to_string()).collect();
    wanted.extend(["\"breach-seal\"", "\"breach-slab\"", "\"breach-gate\""].map(str::to_owned));
    let modules: Vec<String> = manifest["modules"]
        .as_array()
        .expect("the manifest's modules")
        .iter()
        .filter(|entry| wanted.contains(&entry["name"].to_string()))
        .map(module)
        .collect();
    let mut out = String::new();
    writeln!(out, "pub(crate) static PLAN_ID: &str = {};", text(&plan["id"])).expect("written");
    writeln!(out, "pub(crate) static SPACES: &[SpaceTable] = &[{}];", spaces.join(", ")).expect("written");
    writeln!(out, "pub(crate) static SEALS: &[SealTable] = &[{}];", seals.join(", ")).expect("written");
    writeln!(out, "pub(crate) static SLABS: &[SlabTable] = &[{}];", slabs.join(", ")).expect("written");
    let encounters = pairs("encounters").join(", ");
    writeln!(out, "pub(crate) static ENCOUNTERS: &[(&str, &[&str])] = &[{encounters}];").expect("written");
    writeln!(out, "pub(crate) static SHORES: &[(&str, &[&str])] = &[{}];", pairs("shores").join(", "))
        .expect("written");
    writeln!(out, "pub(crate) static MODULES: &[ModuleTable] = &[{}];", modules.join(", ")).expect("written");
    let target = std::path::Path::new(&std::env::var("OUT_DIR").expect("cargo's OUT_DIR")).join("breach_tables.rs");
    std::fs::write(target, out).expect("the tables are written");
}
