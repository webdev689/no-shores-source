//! A client test holds the page to the rules through what the rules write for it or what both sides read, never by
//! reading the rules' source: text tied to a line's spelling breaks when the line is reworded, not when the rule moves.

use super::{Problem, is_script};

const MESSAGE: &str = "a client test reads the rules' Rust source: compare with a fixture a Rust test writes under \
                       target/ (as target/protocol/ holds), or a content file both sides read";

/// A test script of the page's.
pub fn is_client_test(path: &str) -> bool {
    path.starts_with("client/") && is_script(path) && path.contains(".test.")
}

/// Whether a line of code names, in a string, a path into `crates/` or a Rust file: what a test reads at run time.
/// Comments are passed over, so a test may still say which Rust test holds the other side.
fn names_rust_source(line: &str) -> bool {
    let trimmed = line.trim_start();
    if trimmed.starts_with("//") || trimmed.starts_with('*') || trimmed.starts_with("/*") {
        return false;
    }
    let code = line.split(" // ").next().unwrap_or(line);
    code.char_indices().filter(|(_, mark)| matches!(mark, '\'' | '"' | '`')).any(|(at, quote)| {
        let rest = &code[at + quote.len_utf8()..];
        let mut path = rest;
        while let Some(up) = path.strip_prefix("../") {
            path = up;
        }
        let literal = rest.split(quote).next().unwrap_or(rest);
        path.starts_with("crates/") || (literal.ends_with(".rs") && !literal.contains(' '))
    })
}

pub fn check(code: &[(String, String)]) -> Vec<Problem> {
    code.iter()
        .filter(|(path, _)| is_client_test(path))
        .flat_map(|(path, text)| {
            text.lines()
                .enumerate()
                .filter(|(_, line)| names_rust_source(line))
                .map(|(index, _)| Problem::new("client tests", path, Some(index + 1), MESSAGE))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::check;

    fn lines_refused(path: &str, text: &str) -> Vec<Option<usize>> {
        check(&[(path.to_owned(), text.to_owned())]).into_iter().map(|problem| problem.line).collect()
    }

    #[test]
    fn a_client_test_reading_a_rust_file_is_refused() {
        let text = "const rules = readFileSync(new URL('../../../crates/room/src/sea.rs', import.meta.url), 'utf8');\n\
                    const read = (path: string) => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');\n\
                    const asks = await read('crates/room/src/asks.rs');\n\
                    const wire = await read('gear_wire.rs');\n\
                    const raid = readFileSync(new URL(`../../../crates/room/src/public/${file}`, import.meta.url));\n";
        assert_eq!(lines_refused("client/src/game/voyage.test.ts", text), [Some(1), Some(3), Some(4), Some(5)]);
    }

    #[test]
    fn a_fixture_a_comment_or_a_title_naming_a_rust_test_passes() {
        let text = "// crates/room/src/sea_tests.rs writes it\n\
                    /** The rules' paces (crates/room/src/sea.rs PACES). */\n\
                    const written = readFileSync(new URL('../../../target/protocol/room-numbers.json', import.meta.url));\n\
                    test('the land agrees (crates/land/tests/agree.rs holds the same)', () => {});\n\
                    const both = readFileSync(new URL('../../../content/fingerprints.txt', import.meta.url));\n";
        assert!(lines_refused("client/src/rules/landRules.test.ts", text).is_empty());
    }

    #[test]
    fn only_the_pages_tests_are_read() {
        let text = "const manifest = readFileSync(new URL(`../crates/${crate}/Cargo.toml`, import.meta.url));\n";
        assert!(lines_refused("server/roomsDeploy.test.ts", text).is_empty());
        assert!(lines_refused("client/src/game/voyage.ts", text).is_empty());
        assert_eq!(lines_refused("client/src/game/voyage.test.mts", text), [Some(1)]);
    }
}
