//! A fingerprint the TypeScript tests hold too, read from the one file that pins it: content/fingerprints.txt. Each
//! Rust test that holds one takes this file in with `#[path]`.

/// The value pinned under `name`.
pub(crate) fn pinned(name: &str) -> String {
    let pins = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../content/fingerprints.txt"));
    let pins = pins.expect("content/fingerprints.txt");
    let value = pins.lines().find_map(|line| line.strip_prefix(name)?.strip_prefix(' '));
    value.expect(name).to_owned()
}
