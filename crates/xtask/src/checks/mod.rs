//! The structure checks. Each is a pure function over the repository's files, tested on made-up input beside it.

mod assets;
mod comments;
mod layout;
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

/// Source files the size and comment checks read.
fn is_code(path: &str) -> bool {
    path.ends_with(".rs") || path.ends_with(".py")
}

pub fn run_all(repo: &Repo) -> Vec<Problem> {
    let mut problems = layout::check(&repo.files, |path| repo.read(path));
    let code = repo.sources(is_code);
    problems.extend(size::check(&code));
    problems.extend(comments::check(&code));
    let sized: Vec<(String, u64)> = repo.files.iter().map(|path| (path.clone(), repo.size(path))).collect();
    problems.extend(assets::check(&sized));
    let notes = repo.sources(|path| path.starts_with(vault::VAULT_ROOT) && path.ends_with(".md"));
    problems.extend(vault::check(&notes, &repo.files, |path| repo.read(path)));
    problems
}
