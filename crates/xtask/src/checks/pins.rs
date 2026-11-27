//! A fingerprint both languages' tests hold is pinned once, in a file both read: copied into each side, a repin has to
//! find every copy, and a copy missed is a red check after a long run.

use super::{Problem, is_script};
use std::collections::BTreeMap;

/// The file every cross-language fingerprint is pinned in.
pub const PINNED: &str = "content/fingerprints.txt";

/// A fingerprint as the tests write one: eight or sixteen lowercase hex digits, at least four of them different and
/// both a letter and a digit among them, so a word, a count or a name's padded number (`000000ff`) is never taken for
/// one; in Rust also a `0x` literal, its `_` separators dropped. A script's `0x` word is a number it parses, a seed,
/// never a fingerprint, which is printed bare.
fn fingerprint(word: &str, rust: bool) -> Option<String> {
    let digits = match word.strip_prefix("0x") {
        Some(hex) if rust => {
            let hex = hex.replace('_', "");
            ["u64", "u32", "i64", "i32"].iter().find_map(|kind| hex.strip_suffix(kind)).unwrap_or(&hex).to_owned()
        }
        Some(_) => return None,
        None => word.to_owned(),
    };
    let hex = matches!(digits.len(), 8 | 16) && digits.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'));
    let mut kinds: Vec<u8> = digits.bytes().collect();
    kinds.sort_unstable();
    kinds.dedup();
    let mixed = kinds.iter().any(u8::is_ascii_digit) && kinds.iter().any(u8::is_ascii_alphabetic);
    (hex && mixed && kinds.len() >= 4).then_some(digits)
}

/// Every fingerprint in a file's text, with the line it is on.
fn fingerprints(text: &str, rust: bool) -> impl Iterator<Item = (usize, String)> + '_ {
    text.lines().enumerate().flat_map(move |(index, line)| {
        // A hyphen joins a word: an id's tail (`run-abcd1234`) is a name, never a fingerprint.
        line.split(|mark: char| !(mark.is_ascii_alphanumeric() || mark == '_' || mark == '-'))
            .filter_map(move |word| fingerprint(word, rust))
            .map(move |print| (index + 1, print))
    })
}

/// Where a fingerprint is written: a file and its line.
type Place<'a> = (&'a str, usize);

pub fn check(code: &[(String, String)]) -> Vec<Problem> {
    // Each fingerprint: where Rust holds it, and where a script does.
    let mut held: BTreeMap<String, (Vec<Place>, Vec<Place>)> = BTreeMap::new();
    for (path, text) in code {
        let rust = path.ends_with(".rs");
        if !rust && !is_script(path) {
            continue;
        }
        for (line, print) in fingerprints(text, rust) {
            let sides = held.entry(print).or_default();
            if rust { &mut sides.0 } else { &mut sides.1 }.push((path, line));
        }
    }
    held.into_iter()
        .filter(|(_, (rust, scripts))| !rust.is_empty() && !scripts.is_empty())
        .flat_map(|(print, (rust, scripts))| {
            rust.into_iter().chain(scripts).map(move |(path, line)| {
                let message = format!(
                    "{print} is pinned in Rust and in TypeScript: pin it once in {PINNED}, which both sides' tests read"
                );
                Problem::new("pins", path, Some(line), message)
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::check;

    fn found(files: &[(&str, &str)]) -> Vec<(String, Option<usize>)> {
        let code: Vec<_> = files.iter().map(|(path, text)| ((*path).to_owned(), (*text).to_owned())).collect();
        check(&code).into_iter().map(|problem| (problem.file, problem.line)).collect()
    }

    #[test]
    fn a_fingerprint_in_both_languages_is_refused_on_each_side() {
        let rust = "\npub const RUN_HASH: &str = \"e8369fd91758ace2\";\n";
        let page = "const RUN_HASH = 'e8369fd91758ace2';\n";
        let found =
            found(&[("crates/movement/tests/agree.rs", rust), ("client/src/rules/movementRules.test.ts", page)]);
        assert_eq!(
            found,
            [
                ("crates/movement/tests/agree.rs".to_owned(), Some(2)),
                ("client/src/rules/movementRules.test.ts".to_owned(), Some(1)),
            ]
        );
    }

    #[test]
    fn a_short_fingerprint_is_read_too() {
        let rust = "pub const CLIMB_HASH: &str = \"ec2c4d58\";\n";
        let page = "const CLIMB_HASH = 'ec2c4d58';\n";
        assert_eq!(
            found(&[("crates/room-wasm/src/climb_door_tests.rs", rust), ("server/climb.test.ts", page)]).len(),
            2
        );
    }

    #[test]
    fn a_rust_literal_and_a_run_of_them_are_read_too() {
        let rust = "const AGREED_HASH: u64 = 0x939e_f98a_66ce_5550_u64;\n";
        let page = "assert.equal(prints.join(' '), 'e454e050d99fa04e 939ef98a66ce5550');\n";
        assert_eq!(
            found(&[("crates/room-wasm/src/dungeon_door.rs", rust), ("client/src/rules/a.test.ts", page)]).len(),
            2
        );
    }

    #[test]
    fn one_side_alone_or_a_hash_constant_passes() {
        let rust = "let hash = 0xcbf2_9ce4_8422_2325_u64; let other = \"ffc809e61b97d35b\"; \"-000000ff\"\n";
        let page = "let hash = 0xcbf29ce484222325n; const KEY = '0123456789abcdef0123456789abcdef';\n\
                    const seed = BigInt('0x123456789abcdef0'); const room = 'crypt-000000ff';\n";
        let rust = format!("{rust}sea.reseed(0x1234_5678_9abc_def0);\n");
        let rust = rust.as_str();
        assert!(found(&[("crates/world/src/weather_tests.rs", rust), ("client/src/sky/hash.ts", page)]).is_empty());
        let ids = ("\"node-krakens-grotto--sea--run-abcd1234\",\n", "const room = `${ROOM}--run-abcd1234`;\n");
        assert!(found(&[("crates/world/src/regions.rs", ids.0), ("server/keeping.test.ts", ids.1)]).is_empty());
        let pinned = "const RUN_HASH = pinned('movement.run');\n";
        assert!(found(&[("crates/movement/tests/agree.rs", rust), ("client/src/rules/m.test.ts", pinned)]).is_empty());
    }
}
