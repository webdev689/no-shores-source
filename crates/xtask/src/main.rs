//! The repository's own checks, run as `cargo xtask <command>`.
//! `check` is the one command CI runs and every change passes: format, lints, tests, then the repo's structure.
//! `repo` runs only the structure checks, which take about a second.
#![allow(clippy::print_stdout, reason = "a command-line tool reports to the terminal")]

mod checks;
mod files;
mod shaders;
mod toolchain;

use std::process::ExitCode;

const USAGE: &str = "usage: cargo xtask <command>

commands:
  check   everything CI runs: format, lints, tests, then the repo checks
  shaders only the shaders: every one the client compiles, written out and validated as WGSL
  repo    only the repo checks: layout, crate names, file size, comments, assets, vault links";

fn main() -> ExitCode {
    let command = std::env::args().nth(1);
    match command.as_deref() {
        Some("check") => {
            if !toolchain::run_all() {
                return ExitCode::FAILURE;
            }
            report_repo_checks()
        }
        Some("repo") => report_repo_checks(),
        Some("shaders") => {
            if toolchain::run_matching("shaders") {
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

fn report_repo_checks() -> ExitCode {
    let repo = match files::Repo::load() {
        Ok(repo) => repo,
        Err(error) => {
            println!("repo checks could not read the repository: {error}");
            return ExitCode::FAILURE;
        }
    };
    let problems = checks::run_all(&repo);
    if problems.is_empty() {
        println!("repo checks: {} files, no problems", repo.files.len());
        return ExitCode::SUCCESS;
    }
    println!("repo checks: {} problem(s)", problems.len());
    for problem in &problems {
        println!("  {problem}");
    }
    ExitCode::FAILURE
}
