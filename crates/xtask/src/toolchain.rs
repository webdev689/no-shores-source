use crate::files::repo_root;
use std::process::Command;

/// One toolchain step: a name for the report, a program and its arguments.
#[derive(Debug)]
struct Step {
    name: &'static str,
    program: Program,
    args: &'static [&'static str],
}

#[derive(Debug, Clone, Copy)]
enum Program {
    Cargo,
    Npm,
}

/// The toolchains' own checks, Rust and TypeScript side by side, in the order a failure is cheapest to read.
const STEPS: [Step; 9] = [
    Step { name: "format (Rust)", program: Program::Cargo, args: &["fmt", "--all", "--check"] },
    Step { name: "format (TypeScript)", program: Program::Npm, args: &["run", "-s", "format:check"] },
    Step {
        name: "lints (Rust)",
        program: Program::Cargo,
        args: &["clippy", "--workspace", "--all-targets", "--locked", "--", "-D", "warnings"],
    },
    Step { name: "lints (TypeScript)", program: Program::Npm, args: &["run", "-s", "lint"] },
    Step { name: "types (TypeScript)", program: Program::Npm, args: &["run", "-s", "types"] },
    Step { name: "tests (Rust)", program: Program::Cargo, args: &["test", "--workspace", "--locked"] },
    Step { name: "rules for the browser (WebAssembly)", program: Program::Npm, args: &["run", "-s", "wasm"] },
    Step { name: "tests (TypeScript)", program: Program::Npm, args: &["run", "-s", "test"] },
    Step { name: "build (client)", program: Program::Npm, args: &["run", "-s", "build"] },
];

/// Runs each step and stops at the first that fails.
pub fn run_all() -> bool {
    let root = repo_root();
    if !root.join("node_modules").is_dir() {
        println!("== the TypeScript tools are not installed: run `npm ci` first");
        return false;
    }
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".to_owned());
    for step in STEPS {
        let program = match step.program {
            Program::Cargo => cargo.as_str(),
            Program::Npm => "npm",
        };
        println!("== {}: {program} {}", step.name, step.args.join(" "));
        let passed =
            Command::new(program).args(step.args).current_dir(&root).status().is_ok_and(|status| status.success());
        if !passed {
            println!("== {} failed", step.name);
            return false;
        }
    }
    true
}
