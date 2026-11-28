//! The repository's own checks, run as `cargo xtask <command>`.
//! `check` is the one command every change passes: the repo's structure first, then format, lints and tests. CI runs
//! it in its three parts side by side (`check rest`, `check rust`, `check page`), the Rust tests built once into an
//! archive (`archive <file>`) that runners each run a share of (`1/2 <archive>`).
//! `repo` runs only the structure checks, which take about a second.
#![allow(clippy::print_stdout, reason = "a command-line tool reports to the terminal")]

mod checks;
mod decisions;
mod files;
mod shaders;
mod toolchain;

use std::process::ExitCode;

const USAGE: &str = "usage: cargo xtask <command>

commands:
  check   everything CI runs: the repo checks first, then format, lints, tests; its last line the verdict
          check rest | rust | page: one of the parts CI runs side by side (rest holds the repo checks);
          check rust 1/2: that share of the Rust tests, with cargo-nextest
          check rust archive <file>: every Rust test built into a nextest archive, none run
          check rust 1/2 <archive>: that share run from the archive, in this checkout
  shaders only the shaders: every one the client compiles, written out and validated as WGSL
  repo    only the repo checks: layout, file size, comments, layers, html, assets, versions, crates, vault links,
          dialogue, client tests, pins, schema and python
  decisions [base]
          the owner's decisions over the files changed against base (origin/main): read them before the change";

fn main() -> ExitCode {
    let command = std::env::args().nth(1);
    match command.as_deref() {
        Some("check") => {
            let part = std::env::args().nth(2);
            let part = match part.as_deref().map(toolchain::Part::named) {
                None => None,
                Some(Some(part)) => Some(part),
                Some(None) => {
                    println!("{USAGE}");
                    return ExitCode::from(2);
                }
            };
            let words: Vec<String> = std::env::args().skip(3).collect();
            let words: Vec<&str> = words.iter().map(String::as_str).collect();
            let share = match toolchain::Share::named(&words) {
                Some(toolchain::Share::All) => toolchain::Share::All,
                Some(share) if part == Some(toolchain::Part::Rust) => share,
                _ => {
                    println!("{USAGE}");
                    return ExitCode::from(2);
                }
            };
            check(part, share)
        }
        Some("repo") => {
            if repo_checks_pass() {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Some("decisions") => {
            let base = std::env::args().nth(2).unwrap_or_else(|| "origin/main".to_owned());
            if decisions::report(&base) { ExitCode::SUCCESS } else { ExitCode::FAILURE }
        }
        Some("shaders") => {
            if toolchain::run_matching("shaders").is_ok() {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        _ => {
            println!("{USAGE}");
            ExitCode::from(2)
        }
    }
}

/// The check, or one part of it: the repo checks first, as they take a second, then every toolchain step, and last a
/// line with the verdict and the commit, so a log's tail says both what failed and what it covered.
fn check(part: Option<toolchain::Part>, share: toolchain::Share) -> ExitCode {
    let root = files::repo_root();
    if let Some(reason) = files::foreign_build(
        &root,
        std::env::var_os("CARGO_TARGET_DIR")
            .or_else(|| std::env::var_os("CARGO_BUILD_TARGET_DIR"))
            .map(std::path::PathBuf::from),
    ) {
        println!("FAILED: not checked, {reason}");
        return ExitCode::FAILURE;
    }
    println!("== checking {}", root.display());
    // Read before the check, which takes minutes: a commit or an edit made meanwhile was never checked.
    let checked = checked_commit();
    // The diff as well as the status: an edit to a file already changed leaves the status as it was.
    let tree = || (git(&["status", "--porcelain"]), git(&["diff", "HEAD"]));
    let before = tree();
    let mut failed = Vec::new();
    if matches!(part, None | Some(toolchain::Part::Rest)) && !repo_checks_pass() {
        failed.push("repo checks".to_owned());
    }
    let steps = part.map_or_else(toolchain::run_all, |part| toolchain::run_part(part, share));
    failed.extend(steps.err());
    let changed = if tree() == before { "" } else { "; the tree changed during the check" };
    if failed.is_empty() {
        println!("passed: {checked}{changed}");
        ExitCode::SUCCESS
    } else {
        println!("FAILED ({}): {checked}{changed}", failed.join(", "));
        ExitCode::FAILURE
    }
}

/// A git command's output in the checkout, or `None` when it fails.
fn git(args: &[&str]) -> Option<String> {
    std::process::Command::new("git")
        .args(args)
        .current_dir(files::repo_root())
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

/// The commit a check ran on, and whether the tree held changes not in it: so a log of the check says what it
/// covered, and a claim of "tested" can be held to the commit it names.
fn checked_commit() -> String {
    match (git(&["rev-parse", "--short=12", "HEAD"]), git(&["status", "--porcelain"])) {
        (Some(head), Some(changes)) if changes.is_empty() => format!("checked {head}, nothing uncommitted"),
        (Some(head), Some(_)) => format!("checked {head} with uncommitted changes"),
        _ => "checked: no commit could be read".to_owned(),
    }
}

fn repo_checks_pass() -> bool {
    let repo = match files::Repo::load() {
        Ok(repo) => repo,
        Err(error) => {
            println!("repo checks could not read the repository: {error}");
            return false;
        }
    };
    let problems = checks::run_all(&repo);
    if problems.is_empty() {
        println!("repo checks: {} files, no problems", repo.files.len());
        return true;
    }
    println!("repo checks: {} problem(s)", problems.len());
    for problem in &problems {
        println!("  {problem}");
    }
    false
}
