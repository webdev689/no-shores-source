//! The structure checks. Each is a pure function over the repository's files, tested on made-up input beside it.

mod assets;
mod comments;
mod crates;
mod dialogue;
mod html;
mod layers;
mod layout;
mod plain_text;
mod script_comments;
mod size;
mod vault;
mod versions;

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

/// Kept exactly as their authors ship them: the co-dev's toolkit, and DFO's sprite forge with
/// its models. Our code and asset rules are for the code we write.
const KEPT_AS_SHIPPED: [&str; 2] = ["tools/claude-toolkit/", "tools/forge/"];

fn kept_as_shipped(path: &str) -> bool {
    KEPT_AS_SHIPPED.iter().any(|root| path.starts_with(root))
}

/// Every extension a TypeScript or JavaScript file may carry; the checks that read scripts all use this one list.
const SCRIPT_EXTENSIONS: [&str; 7] = [".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs"];

fn is_script(path: &str) -> bool {
    SCRIPT_EXTENSIONS.iter().any(|extension| path.ends_with(extension))
}

/// Source files the size and comment checks read.
fn is_code(path: &str) -> bool {
    !kept_as_shipped(path) && (path.ends_with(".rs") || path.ends_with(".py") || is_script(path))
}

/// The files a check would read but cannot, since they are not UTF-8: each is a problem, never skipped.
fn unreadable(paths: &[String]) -> impl Iterator<Item = Problem> {
    paths.iter().map(|path| Problem::new("text", path, None, "not UTF-8, so no check can read it: save it as UTF-8"))
}

pub fn run_all(repo: &Repo) -> Vec<Problem> {
    let mut problems = layout::check(&repo.files, |path| repo.read(path));
    let (code, skipped) = repo.sources(is_code);
    problems.extend(unreadable(&skipped));
    problems.extend(size::check(&code));
    problems.extend(comments::check(&code));
    problems.extend(layers::check(&code));
    problems.extend(html::check_scripts(&code));
    let (pages, skipped) = repo.sources(html::is_page);
    problems.extend(unreadable(&skipped));
    problems.extend(html::check_pages(&pages, &repo.files));
    let sized: Vec<(String, u64)> =
        repo.files.iter().filter(|path| !kept_as_shipped(path)).map(|path| (path.clone(), repo.size(path))).collect();
    problems.extend(assets::check(&sized));
    problems.extend(versions::check(&repo.files));
    let (manifests, skipped) =
        repo.sources(|path| path == "Cargo.toml" || (path.starts_with("crates/") && path.ends_with("/Cargo.toml")));
    problems.extend(unreadable(&skipped));
    problems.extend(crates::check(&manifests));
    problems.extend(crates::check_unsafe(&code));
    let (notes, skipped) = repo.sources(|path| path.starts_with(vault::VAULT_ROOT) && path.ends_with(".md"));
    problems.extend(unreadable(&skipped));
    problems.extend(vault::check(&notes, &repo.files, |path| repo.read(path)));
    let (story, skipped) = repo.sources(|path| path.starts_with(dialogue::STORY_ROOT) || path == dialogue::QUESTS);
    problems.extend(unreadable(&skipped));
    problems.extend(dialogue::check(&story));
    let (content, skipped) = repo.sources(plain_text::is_read);
    problems.extend(unreadable(&skipped));
    problems.extend(plain_text::check(&content));
    problems
}

#[cfg(test)]
mod tests {
    use super::{is_code, is_script, kept_as_shipped};

    #[test]
    fn our_source_files_are_code() {
        assert!(is_code("client/src/main.ts"));
        assert!(is_code("crates/xtask/src/main.rs"));
        assert!(is_code("forge/body.py"));
    }

    #[test]
    fn every_script_extension_is_code() {
        for path in ["a.ts", "a.mts", "a.cts", "a.tsx", "a.js", "a.mjs", "a.cjs"] {
            assert!(is_script(path) && is_code(&format!("client/src/{path}")), "{path}");
        }
        assert!(!is_script("client/index.html"));
    }

    #[test]
    fn the_kept_toolkit_and_non_code_files_are_not() {
        assert!(!is_code("tools/claude-toolkit/check_tools.py"));
        assert!(!is_code("tools/forge/tools/sprite-forge/layers.py"));
        assert!(!is_code("bible/Home.md"));
        assert!(kept_as_shipped("tools/forge/tools/sprite-forge/models/crossbows.blend"));
        assert!(!kept_as_shipped("tools/forged.py"));
    }
}
