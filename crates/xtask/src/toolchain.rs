use crate::files::repo_root;
use crate::shaders;
use std::path::Path;
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

/// How much of the Rust tests a run takes, and where they are built.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Share<'a> {
    /// Every test, built and run here.
    All,
    /// Every test built into this nextest archive and none run, so CI compiles them once for the runners that share
    /// them.
    Archive(&'a str),
    /// That share (`1/2`), built here, or run from the archive another runner built.
    Slice(&'a str, Option<&'a str>),
}

impl<'a> Share<'a> {
    /// The share the words after `check rust` name: none, `archive <file>`, `1/2`, or `1/2 <archive>`.
    pub fn named(words: &[&'a str]) -> Option<Self> {
        match *words {
            [] => Some(Self::All),
            ["archive", file] => Some(Self::Archive(file)),
            [slice] if slice.contains('/') => Some(Self::Slice(slice, None)),
            [slice, file] if slice.contains('/') => Some(Self::Slice(slice, Some(file))),
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
const STEPS: [Step; 18] = [
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
    // writes one more is added here, or the page's part fails on the file it misses. They are built first in one go,
    // side by side (protocol holds nothing but its library), then each crate's run with its own filter.
    Step {
        name: "tests' files (built)",
        program: Program::Cargo,
        args: &["test", "--locked", "--no-run", "-p", "protocol", "-p", "room", "-p", "room-wasm", "--lib"],
        parts: &[Part::Page],
    },
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

/// Runs each step and stops at the first that fails, naming it.
pub fn run_all() -> Result<(), String> {
    run_steps(|_| true, Share::All)
}

/// Runs each step of one part of the check, and stops at the first that fails. A share other than all of the Rust
/// tests takes nextest: CI builds them once into an archive and spreads running it over runners.
pub fn run_part(part: Part, share: Share) -> Result<(), String> {
    run_steps(|step| step.parts.contains(&part), share)
}

/// Runs each step whose name starts with `prefix`, and stops at the first that fails.
pub fn run_matching(prefix: &str) -> Result<(), String> {
    run_steps(|step| step.name.starts_with(prefix), Share::All)
}

/// nextest's arguments for the Rust tests: built and run here, archived for other runners, or one share of them run
/// from an archive, whose tests read this checkout's files as they would where it was built.
fn rust_tests(share: Share, root: &Path) -> Vec<String> {
    let root = root.display().to_string();
    let mut args = vec!["nextest", "run"];
    match share {
        Share::Archive(file) => {
            return words(&["nextest", "archive", "--workspace", "--locked", "--archive-file", file]);
        }
        Share::Slice(_, Some(file)) => args.extend(["--archive-file", file, "--workspace-remap", &root]),
        Share::All | Share::Slice(_, None) => args.extend(["--workspace", "--locked"]),
    }
    args.push("--no-fail-fast");
    let partition;
    if let Share::Slice(slice, _) = share {
        partition = format!("slice:{slice}");
        args.extend(["--partition", &partition]);
    }
    words(&args)
}

/// Arguments as the command takes them.
fn words(args: &[&str]) -> Vec<String> {
    args.iter().map(|&arg| arg.to_owned()).collect()
}

fn run_steps(chosen: impl Fn(&Step) -> bool, share: Share) -> Result<(), String> {
    let root = repo_root();
    if !root.join("node_modules").is_dir() {
        println!("== the TypeScript tools are not installed: run `npm ci` first");
        return Err("npm ci".to_owned());
    }
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".to_owned());
    let nextest = Command::new(&cargo).args(["nextest", "--version"]).output().is_ok_and(|out| out.status.success());
    if share != Share::All && !nextest {
        println!(
            "== a share of the Rust tests, or their archive, needs cargo-nextest: `cargo install cargo-nextest --locked`"
        );
        return Err("cargo-nextest".to_owned());
    }
    for step in STEPS.iter().filter(|step| chosen(step)) {
        let (program, args) = match step.program {
            Program::Cargo => (cargo.as_str(), words(step.args)),
            Program::Npm => ("npm", words(step.args)),
            Program::RustTests if nextest => (cargo.as_str(), rust_tests(share, &root)),
            Program::RustTests => (cargo.as_str(), words(&["test", "--workspace", "--locked", "--no-fail-fast"])),
            Program::Shaders => {
                println!("== {}: naga over {}", step.name, shaders::WRITTEN);
                let problems = shaders::problems_written(&root);
                for problem in &problems {
                    println!("{problem}");
                }
                if !problems.is_empty() {
                    println!("== {} failed", step.name);
                    return Err(step.name.to_owned());
                }
                continue;
            }
        };
        println!("== {}: {program} {}", step.name, args.join(" "));
        // Node's fetch ignores HTTPS_PROXY without NODE_USE_ENV_PROXY, and the page's tests fetch from R2.
        let passed = Command::new(program)
            .args(&args)
            .current_dir(&root)
            .env("NODE_USE_ENV_PROXY", "1")
            .status()
            .is_ok_and(|status| status.success());
        if !passed {
            println!("== {} failed", step.name);
            return Err(step.name.to_owned());
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "toolchain_tests.rs"]
mod tests;
