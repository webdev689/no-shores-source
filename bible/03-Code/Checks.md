---
type: reference
code:
  - crates/xtask/src/toolchain.rs#STEPS
  - crates/xtask/src/checks/mod.rs#run_all
  - crates/xtask/src/checks/html.rs#check_scripts
  - crates/xtask/src/checks/html.rs#check_pages
  - crates/xtask/src/shaders.rs#problem_in
---
# Checks

`cargo xtask check` is the one command that says a change is done. CI runs it on every pull request and every push to
`main`, and on `main` publishes the client to GitHub Pages once it passes. It stops at the first failing step, in the
order a failure is cheapest to read:

1. **messages**: the Rust and the TypeScript for every network message, made from the schema with `flatc`
   (`npm run schema`), into `generated/`. Its first run on a machine installs the pinned `flatc`.
2. **format**: rustfmt, then Prettier.
3. **lints**: clippy on every crate and target, then ESLint; warnings are errors. Clippy also refuses clocks and
   every float method the platform may round its own way, such as `sin`, `exp` and `powf` ([[Agree to the Bit]]).
4. **types**: TypeScript, strict, for the client, the server's shell and the tests.
5. **shaders**: every shader the client compiles, written out by `npm run shaders` into `target/shaders/` and
   validated as WGSL with naga, the front end wgpu builds on ([[Every Shader Is Checked Offline]]). WebGPU reports a
   shader that fails to compile only as a warning, so this is where a broken one is caught. A shader's code is the
   constant `createShaderModule({ code: … })` names, exported where it is made: a string, or a record of strings
   picked by a key; a call naming anything else fails. `cargo xtask shaders` runs this step alone.
6. **tests**: `cargo test`, then the world rules, the land and movement built as WebAssembly (`npm run wasm`), then
   `node --test`, whose bridge tests load them.
7. **build**: the client, with Vite; then the bake cuts every node's window of the land (`npm run bake`), and the
   server's Cloudflare Worker is bundled with them as a deploy would, without deploying.
8. **repo checks**, each a pure function with tests beside it:

| Check | Holds | Rule |
|---|---|---|
| layout | the top level to the known list; every folder under `crates/` is a crate named after its folder | [[Code Map]] |
| size | source files to 600 lines, tests to 800 | [[Small Files]] |
| comments | comments to eight lines, with no dates, issue numbers, ticket tags or `bible/` paths; lines in fenced examples are checked too, and so are Python's docstrings and the comments after its code | [[Comments Say Why]] |
| layers | client imports follow the declared layers; no Node modules in client code; no WebGL; nothing imports an entry point (`main.ts`, `gameWorker.ts`, `editorPage.ts`) but another, as the page names the game's worker. It reads `import` and `export … from` in every form, backtick imports, `new URL(…, import.meta.url)` and `import.meta.glob` | [[Code Map]], [[WebGPU Only]] |
| html | a client page holds its head, one canvas and one module script loaded from its file: no other element, no words but its title, no script written in the page, no `on…` handler or `style` attribute, no stylesheet linked or preloaded (`rel` and `as` read in any case or quote), and a `<style>` only for `html`, `body`, `:root` and the canvas's own id; no stylesheet in the client (`.css`, `.scss`, `.sass`, `.less` or `.styl`, in any case); no client script makes an element, puts one or words into the page, writes HTML, styles an element, brings in a stylesheet (any import of one, but a `?raw` read as text) or names an element but the canvas, in any spelling (`document['createElement']`, a space before the bracket, strings joined by `+`), and `.append(` or `.prepend(` only on what its file makes with `new` or on a URL's `searchParams`. Free of it: the page's bridge in `ui/` (`canvasEvents.ts`, which sets the canvas's cursor; `pictures.ts`, which decodes SVG through an image it never shows; `page.ts`, which holds the page's touches, borrows a link and a file input for a moment and writes the words that say the game could not start), and the tests and their `…ForTests.ts` aids while nothing but tests reaches them | [[The Interface Uses No HTML, Now or Later]] |
| crates | every crate is declared, takes the workspace's lints, and depends only on the crates its rule allows, read by real package name through renames and per-platform tables; any attribute naming `unsafe_code` outside a door crate is refused | [[Code Map]] |
| assets | no file over 1 MB; media only in `bible/Attachments/`, and no WebAssembly or ship mesh anywhere | [[Generated Files Stay Out of Git]] |
| vault | every wikilink resolves; every `code:` path exists and holds its symbol | [[Notes Say How It Works Now]] |
| versions | every `.sql` file in a `migrations/` folder is named by its UTC timestamp to the second and what it does | [[Versions Are Not Counters]] |

The checks read scripts of every extension: `.ts`, `.mts`, `.cts`, `.tsx`, `.js`, `.mjs` and `.cjs`. A file that is
not UTF-8 is reported, not skipped. Two folders are kept as their authors ship them, so the size, comment and assets
checks skip them: the co-dev's toolkit in `tools/claude-toolkit/` ([[The Co-Dev's Toolkit, Whole]]) and DFO's sprite
forge in `tools/forge/` ([[DFO's Sprite Forge Comes Over Exactly]]).

## Adding a check

A check earns its place by catching something review keeps missing. It needs the owner's agreement, a test on
made-up input, and must hold everywhere the day it lands: if the code does not pass it yet, fix the code in the same
change. No baselines.
