use crate::files::repo_root;
use crate::shaders;
use std::process::Command;

/// One toolchain step: a name for the report, a program and its arguments, and the parts of the check it runs in.
#[derive(Debug)]
struct Step {
    name: &'static str,
    program: Program,
    args: &'static [&'static str],
    parts: &'static [Part],
}

/// The check's parts, which CI runs side by side, each on a runner of its own (`cargo xtask check <part>`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Part {
    /// Format, lints, types, shaders, the builds and the repo checks.
    Rest,
    /// The Rust tests.
    Rust,
    /// The TypeScript tests, with what they read: the WebAssembly and the files the Rust tests write for them.
    Page,
}

impl Part {
    pub fn named(name: &str) -> Option<Self> {
        match name {
            "rest" => Some(Self::Rest),
            "rust" => Some(Self::Rust),
            "page" => Some(Self::Page),
            _ => None,
        }
    }
}

const ALL: &[Part] = &[Part::Rest, Part::Rust, Part::Page];
const REST: &[Part] = &[Part::Rest];

#[derive(Debug, Clone, Copy)]
enum Program {
    Cargo,
    Npm,
    /// The shaders written out, validated here with naga.
    Shaders,
    /// Every Rust test: with cargo-nextest where it is installed, which runs every crate's tests at once, or else
    /// `cargo test`, one crate's after another. The workspace has no doctests, which nextest would not run.
    RustTests,
}

/// The toolchains' own checks, Rust and TypeScript side by side, in the order a failure is cheapest to read.
const STEPS: [Step; 17] = [
    Step { name: "messages (FlatBuffers)", program: Program::Npm, args: &["run", "-s", "schema"], parts: ALL },
    Step { name: "format (Rust)", program: Program::Cargo, args: &["fmt", "--all", "--check"], parts: REST },
    Step { name: "format (TypeScript)", program: Program::Npm, args: &["run", "-s", "format:check"], parts: REST },
    Step {
        name: "lints (Rust)",
        program: Program::Cargo,
        args: &["clippy", "--workspace", "--all-targets", "--locked", "--", "-D", "warnings"],
        parts: REST,
    },
    Step { name: "lints (TypeScript)", program: Program::Npm, args: &["run", "-s", "lint"], parts: REST },
    Step { name: "types (TypeScript)", program: Program::Npm, args: &["run", "-s", "types"], parts: REST },
    Step { name: "shaders (written out)", program: Program::Npm, args: &["run", "-s", "shaders"], parts: REST },
    Step { name: "shaders (valid WGSL)", program: Program::Shaders, args: &[], parts: REST },
    Step { name: "tests (Rust)", program: Program::RustTests, args: &[], parts: &[Part::Rust] },
    // The files the page's tests read, written by these Rust tests: all of the messages', and three more. A test that
    // writes one more is added here, or the page's part fails on the file it misses.
    Step {
        name: "tests' files (messages)",
        program: Program::Cargo,
        args: &["test", "--locked", "-p", "protocol"],
        parts: &[Part::Page],
    },
    Step {
        name: "tests' files (rooms)",
        program: Program::Cargo,
        args: &[
            "test",
            "--locked",
            "-p",
            "room",
            "--lib",
            "--",
            "written_for_the_page",
            "written_for_the_clients_test",
        ],
        parts: &[Part::Page],
    },
    Step {
        name: "tests' files (Elite Dungeons)",
        program: Program::Cargo,
        args: &["test", "--locked", "-p", "room-wasm", "--lib", "--", "writes_them_for_the_browser"],
        parts: &[Part::Page],
    },
    Step {
        name: "rules for the browser (WebAssembly)",
        program: Program::Npm,
        args: &["run", "-s", "wasm"],
        parts: &[Part::Rest, Part::Page],
    },
    Step { name: "tests (TypeScript)", program: Program::Npm, args: &["run", "-s", "test"], parts: &[Part::Page] },
    Step { name: "build (client)", program: Program::Npm, args: &["run", "-s", "build"], parts: REST },
    Step { name: "build (site)", program: Program::Npm, args: &["run", "-s", "site:build"], parts: REST },
    Step { name: "bundle (server)", program: Program::Npm, args: &["run", "-s", "server:bundle"], parts: REST },
];

/// Runs each step and stops at the first that fails.
pub fn run_all() -> bool {
    run_steps(|_| true, None)
}

/// Runs each step of one part of the check, and stops at the first that fails. `slice` (`1/2`) runs that share of the
/// Rust tests alone, with nextest, so CI spreads them over runners.
pub fn run_part(part: Part, slice: Option<&str>) -> bool {
    run_steps(|step| step.parts.contains(&part), slice)
}

/// Runs each step whose name starts with `prefix`, and stops at the first that fails.
pub fn run_matching(prefix: &str) -> bool {
    run_steps(|step| step.name.starts_with(prefix), None)
}

fn run_steps(chosen: impl Fn(&Step) -> bool, slice: Option<&str>) -> bool {
    let root = repo_root();
    if !root.join("node_modules").is_dir() {
        println!("== the TypeScript tools are not installed: run `npm ci` first");
        return false;
    }
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".to_owned());
    let nextest = Command::new(&cargo).args(["nextest", "--version"]).output().is_ok_and(|out| out.status.success());
    if slice.is_some() && !nextest {
        println!("== a share of the Rust tests needs cargo-nextest: `cargo install cargo-nextest --locked`");
        return false;
    }
    for step in STEPS.iter().filter(|step| chosen(step)) {
        let owned = |args: &[&str]| args.iter().map(|&arg| arg.to_owned()).collect::<Vec<_>>();
        let (program, mut args) = match step.program {
            Program::Cargo => (cargo.as_str(), owned(step.args)),
            Program::Npm => ("npm", owned(step.args)),
            Program::RustTests if nextest => (cargo.as_str(), owned(&["nextest", "run", "--workspace", "--locked"])),
            Program::RustTests => (cargo.as_str(), owned(&["test", "--workspace", "--locked"])),
            Program::Shaders => {
                println!("== {}: naga over {}", step.name, shaders::WRITTEN);
                let problems = shaders::problems_written(&root);
                for problem in &problems {
                    println!("{problem}");
                }
                if !problems.is_empty() {
                    println!("== {} failed", step.name);
                    return false;
                }
                continue;
            }
        };
        if let (Program::RustTests, Some(slice)) = (step.program, slice) {
            args.extend(["--partition".to_owned(), format!("slice:{slice}")]);
        }
        println!("== {}: {program} {}", step.name, args.join(" "));
        let passed = Command::new(program).args(&args).current_dir(&root).status().is_ok_and(|status| status.success());
        if !passed {
            println!("== {} failed", step.name);
            return false;
        }
    }
    true
}

#[cfg(test)]
#[path = "toolchain_tests.rs"]
mod tests;
