use crate::files::repo_root;
use std::process::Command;

/// The toolchain's own checks, in the order a failure is cheapest to read.
const STEPS: [(&str, &[&str]); 3] = [
    ("format", &["fmt", "--all", "--check"]),
    ("lints", &["clippy", "--workspace", "--all-targets", "--locked", "--", "-D", "warnings"]),
    ("tests", &["test", "--workspace", "--locked"]),
];

/// Runs each step and stops at the first that fails.
pub fn run_all() -> bool {
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".to_owned());
    let root = repo_root();
    for (name, args) in STEPS {
        println!("== {name}: cargo {}", args.join(" "));
        let passed = Command::new(&cargo).args(args).current_dir(&root).status().is_ok_and(|status| status.success());
        if !passed {
            println!("== {name} failed");
            return false;
        }
    }
    true
}
