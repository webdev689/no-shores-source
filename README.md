# No Shores

> "A proper pirate sandbox experience with goals of venturing into MMO territory. Everything built by us with 0
> bethesda assets."

Private and proprietary. The client is TypeScript drawing with WebGPU; the server and the game's rules are Rust.

## Start

```sh
npm ci              # once: the TypeScript tools
npm run dev         # the client in a browser with WebGPU
cargo xtask check   # everything CI runs, both languages
cargo xtask repo    # only the repo checks, in about a second
```

Rust 1.97.0 is pinned in `rust-toolchain.toml`; `rustup` installs it on first use. Node 22.18 or later.

## The bible

`bible/` is an Obsidian vault: open the folder as a vault. Start at `bible/Home.md`. It holds how things work now,
the rules every change follows, the procedures, and the owner's decisions.
