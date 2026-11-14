---
type: reference
code:
  - rust-toolchain.toml
  - Cargo.toml
  - clippy.toml
  - rustfmt.toml
---
# Toolchain

- **Rust 1.97.0**, pinned in `rust-toolchain.toml` with `rustfmt`, `clippy` and the `wasm32-unknown-unknown` target.
  `rustup` installs it on first use. Everyone builds with the same compiler.
- **Edition 2024**, one workspace (`Cargo.toml`). Every crate takes the workspace's lints with `[lints] workspace = true`.
- **Lints**: unsafe code is forbidden; clippy runs with warnings as errors. `clippy.toml` holds the short names allowed.
- **Format**: `rustfmt.toml`, 120 columns. The whole repository is formatted; there is no list of exceptions.
- **Build profiles**: debug builds optimise dependencies fully and our own crates lightly, so a debug build runs at
  a usable frame rate and still rebuilds quickly.
- **Python** only for tooling that runs inside Blender (the sprite forge), checked for size and comments like Rust.

## Commands

| Command | What it does |
|---|---|
| `cargo xtask check` | Everything CI runs: format, lints, tests, then the repo checks |
| `cargo xtask repo` | Only the repo checks, in about a second |
| `cargo test -p <crate>` | One crate's tests |
| `cargo fmt --all` | Format everything |
