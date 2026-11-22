//! Writes the landmarks' table from `content/dungeon/landmarks.json` as the crate builds, so the rules place the very
//! pieces the Blender scripts build and the table is never kept in git beside its source.

use std::fmt::Write as _;

/// A list of rows of numbers as a Rust slice of arrays of floats.
fn rows(value: &serde_json::Value) -> String {
    let rows = value.as_array().expect("a list of rows").iter().map(|row| {
        let numbers = row.as_array().expect("a row of numbers").iter();
        let numbers: Vec<String> = numbers.map(|number| format!("{:?}", number.as_f64().expect("a number"))).collect();
        format!("[{}]", numbers.join(", "))
    });
    format!("&[{}]", rows.collect::<Vec<_>>().join(", "))
}

fn main() {
    let source = concat!(env!("CARGO_MANIFEST_DIR"), "/../../content/dungeon/landmarks.json");
    println!("cargo::rerun-if-changed={source}");
    let text = std::fs::read_to_string(source).expect("content/dungeon/landmarks.json");
    let json: serde_json::Value = serde_json::from_str(&text).expect("landmarks.json is JSON");
    let mut table = String::from("&[");
    for landmark in json["landmarks"].as_array().expect("its landmarks") {
        let text = |key: &str| format!("{:?}", landmark[key].as_str().expect("a string"));
        let cells: Vec<String> = landmark["cells"]
            .as_array()
            .expect("its cells")
            .iter()
            .map(|cells| format!("{}", cells.as_u64().expect("whole cells")))
            .collect();
        write!(
            table,
            "Landmark {{ module: {}, style: {}, role: {}, name: {}, cells: [{}], wall: {}, solids: {}, glows: {} }},",
            text("module"),
            text("style"),
            text("role"),
            text("name"),
            cells.join(", "),
            landmark["wall"].as_bool().expect("wall is true or false"),
            rows(&landmark["solids"]),
            rows(&landmark["glows"]),
        )
        .expect("a string takes any text");
    }
    table.push(']');
    let out = std::path::Path::new(&std::env::var("OUT_DIR").expect("cargo sets OUT_DIR")).join("landmarks.rs");
    std::fs::write(out, table).expect("the table written");
}
