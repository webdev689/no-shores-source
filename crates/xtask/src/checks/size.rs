use super::{Problem, SCRIPT_EXTENSIONS};

/// The most lines a source file may hold. A file that needs more is two modules.
pub const MAX_LINES: usize = 600;
/// Test files read top to bottom as a list of cases, so they get a little more room.
pub const MAX_TEST_LINES: usize = 800;

/// A test file as the repo names them: Rust's `tests/` and `_tests.rs`, Python's `test_*.py` (pytest's other name,
/// `*_test.py`, too), and a script's `.test.` before any of the extensions the checks read.
fn is_test_file(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    let script = SCRIPT_EXTENSIONS
        .iter()
        .any(|extension| name.strip_suffix(extension).is_some_and(|stem| stem.ends_with(".test")));
    path.contains("/tests/")
        || path.ends_with("_tests.rs")
        || (name.starts_with("test_") && name.ends_with(".py"))
        || name.ends_with("_test.py")
        || script
}

pub fn check(sources: &[(String, String)]) -> Vec<Problem> {
    sources
        .iter()
        .filter_map(|(path, text)| {
            let limit = if is_test_file(path) { MAX_TEST_LINES } else { MAX_LINES };
            let lines = text.lines().count();
            (lines > limit).then(|| {
                Problem::new(
                    "size",
                    path,
                    None,
                    format!("{lines} lines, over the {limit} limit: split it by what it does"),
                )
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(path: &str, lines: usize) -> (String, String) {
        (path.to_owned(), "let x = 1;\n".repeat(lines))
    }

    #[test]
    fn a_file_at_the_limit_passes() {
        assert!(check(&[source("crates/core/src/lib.rs", MAX_LINES)]).is_empty());
    }

    #[test]
    fn a_file_over_the_limit_is_a_problem() {
        let problems = check(&[source("crates/core/src/lib.rs", MAX_LINES + 1)]);
        assert_eq!(problems.len(), 1);
        assert!(problems[0].message.starts_with("601 lines"));
    }

    #[test]
    fn test_files_get_the_test_limit() {
        assert!(check(&[source("crates/core/tests/sailing.rs", MAX_TEST_LINES)]).is_empty());
        assert_eq!(check(&[source("crates/core/src/wind_tests.rs", MAX_TEST_LINES + 1)]).len(), 1);
    }

    #[test]
    fn every_kind_of_test_file_the_repo_names_gets_the_test_limit_and_nothing_else_does() {
        for path in ["tools/islands/test_envelope.py", "tools/freesound/pages.test.mjs", "client/src/a.test.ts"] {
            assert!(check(&[source(path, MAX_TEST_LINES)]).is_empty(), "{path}");
        }
        for path in ["tools/islands/envelope.py", "tools/testStyles.mjs", "client/src/latest.ts", "tools/a.test.py"] {
            assert_eq!(check(&[source(path, MAX_LINES + 1)]).len(), 1, "{path}");
        }
    }
}
