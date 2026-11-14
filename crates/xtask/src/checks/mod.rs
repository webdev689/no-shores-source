//! The structure checks. Each is a pure function over the repository's files, tested on made-up input beside it.

mod assets;
mod comments;
mod crates;
mod layers;
mod layout;
mod script_comments;
mod size;
mod vault;

use crate::files::Repo;
use std::fmt;

/// One finding: which check, where, and what to do about it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    pub check: &'static str,
    pub file: String,
    pub line: Option<usize>,
    pub message: String,
}

impl Problem {
    pub fn new(check: &'static str, file: &str, line: Option<usize>, message: impl Into<String>) -> Self {
        Self { check, file: file.to_owned(), line, message: message.into() }
    }
}

impl fmt::Display for Problem {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.line {
            Some(line) => write!(formatter, "{}:{line}  [{}] {}", self.file, self.check, self.message),
            None => write!(formatter, "{}  [{}] {}", self.file, self.check, self.message),
        }
    }
}

/// The co-dev's toolkit, approved whole by the owner, stays as its author ships it: our code rules are for our code.
const KEPT_AS_SHIPPED: [&str; 1] = ["tools/claude-toolkit/"];

/// Source files the size and comment checks read.
fn is_code(path: &str) -> bool {
    let ours = !KEPT_AS_SHIPPED.iter().any(|root| path.starts_with(root));
    ours && [".rs", ".py", ".ts", ".js"].iter().any(|extension| path.ends_with(extension))
}

pub fn run_all(repo: &Repo) -> Vec<Problem> {
    let mut problems = layout::check(&repo.files, |path| repo.read(path));
    let code = repo.sources(is_code);
    problems.extend(size::check(&code));
    problems.extend(comments::check(&code));
    problems.extend(layers::check(&code));
    let sized: Vec<(String, u64)> = repo.files.iter().map(|path| (path.clone(), repo.size(path))).collect();
    problems.extend(assets::check(&sized));
    let manifests = repo.sources(|path| path.starts_with("crates/") && path.ends_with("/Cargo.toml"));
    problems.extend(crates::check(&manifests));
    let notes = repo.sources(|path| path.starts_with(vault::VAULT_ROOT) && path.ends_with(".md"));
    problems.extend(vault::check(&notes, &repo.files, |path| repo.read(path)));
    problems
}

#[cfg(test)]
mod tests {
    use super::is_code;

    #[test]
    fn our_source_files_are_code() {
        assert!(is_code("client/src/main.ts"));
        assert!(is_code("crates/xtask/src/main.rs"));
        assert!(is_code("forge/body.py"));
    }

    #[test]
    fn the_kept_toolkit_and_non_code_files_are_not() {
        assert!(!is_code("tools/claude-toolkit/check_tools.py"));
        assert!(!is_code("bible/Home.md"));
    }
}
