# Overlook

> "A proper pirate sandbox experience with goals of venturing into MMO territory. Everything built by us with 0
> bethesda assets."

Private and proprietary. Rust throughout: client, engine, rules, server and tooling, in one Cargo workspace.

## Start

```sh
cargo xtask check   # everything CI runs: format, lints, tests, repo checks
cargo xtask repo    # only the repo checks, in about a second
```

Rust 1.97.0 is pinned in `rust-toolchain.toml`; `rustup` installs it on first use.

## The bible

`bible/` is an Obsidian vault: open the folder as a vault. Start at `bible/Home.md`. It holds how things work now,
the rules every change follows, the procedures, and the owner's decisions.
