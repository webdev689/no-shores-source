use super::Problem;

/// The most lines a source file may hold. A file that needs more is two modules.
pub const MAX_LINES: usize = 600;
/// Test files read top to bottom as a list of cases, so they get a little more room.
pub const MAX_TEST_LINES: usize = 800;

fn is_test_file(path: &str) -> bool {
    path.contains("/tests/") || path.ends_with("_tests.rs") || path.ends_with("_test.py")
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
}
