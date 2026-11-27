---
type: reference
code:
  - crates/xtask/src/toolchain.rs#STEPS
  - crates/xtask/src/checks/mod.rs#run_all
  - crates/xtask/src/checks/html.rs#check_scripts
  - crates/xtask/src/checks/html.rs#check_pages
  - crates/xtask/src/shaders.rs#problem_in
  - crates/sweep/src/lib.rs#full
---
# Checks

`cargo xtask check` is the one command that says a change is done. CI runs it on every pull request and every push to
`main`, in three parts at once on runners of their own (`cargo xtask check rest`, `rust` and `page`): the rest
(steps 1 to 5, 7 and 8), the Rust tests, shared over two runners with nextest (`rust 1/2` and `rust 2/2`), and the
page's tests with the WebAssembly and the files the Rust tests write for them. A push to `main` whose merge is code its pull request's check passed is not checked again ([[Main Deploys What Its Pull Request Passed, and the Check Runs in Three Parts]]); a newer
merge's check cancels an older run's parts on `main`, and that run deploys nothing
([[Pull Requests Merge Up to Date, and a Newer Merge Cancels an Older Check]]). On
`main` CI publishes the client to GitHub Pages and the site once the check passes and the rooms have deployed or had
nothing to deploy, and deploys the Discord bot. The repo checks (8) run first, as they take a second, in the whole
check and in `rest`. Then each part, like the whole check, stops at its first failing step, in the order a failure is
cheapest to read; the Rust tests run to their end, so one run lists every failing test. The check runs in the
checkout git names from where it starts, and refuses to run where `CARGO_TARGET_DIR` points outside that checkout or
the binary was built from another one. Its last line gives the verdict, the commit and whether the tree held
uncommitted changes: `passed: checked <commit>, nothing uncommitted`, or `FAILED (<steps>): checked <commit> ...`, with
`; the tree changed during the check` when files changed while it ran.

Most of a part's time before its tests is the game's own crates compiling: CI keeps the dependencies built, per part,
with the Rust parts sharing theirs, and a fresh checkout rebuilds every crate of the workspace. Debug and test builds
keep line tables only, not full debug info, which makes a clean build nearly twice as fast and leaves the tests as
fast; a backtrace still names its files and lines. Builds on x86_64 Linux link with LLD, the faster linker Rust uses
there by default; linking is a small share of the time
([[Pull Requests Sample the World's Sweeps, the Full Sweep Runs Nightly, and Builds Link Faster]]). A session runs the
repo checks and the tests of what it changed, and leaves the whole check to CI ([[Toolkit]]).

1. **messages**: the Rust and the TypeScript for every network message, made from the schema with `flatc`
   (`npm run schema`), into `generated/`. Its first run on a machine installs the pinned `flatc`.
2. **format**: rustfmt, then Prettier.
3. **lints**: clippy on every crate and target, then ESLint; warnings are errors. Clippy also refuses clocks and
   every float method the platform may round its own way, such as `sin`, `exp` and `powf` ([[Agree to the Bit]]).
4. **types**: TypeScript, strict, for the client, the server's shell, the site, the desktop app's shell and the tests.
5. **shaders**: every shader the client compiles, written out by `npm run shaders` into `target/shaders/` and
   validated as WGSL with naga, the front end wgpu builds on ([[Every Shader Is Checked Offline]]). WebGPU reports a
   shader that fails to compile only as a warning, so this is where a broken one is caught. A shader's code is the
   constant `createShaderModule({ code: … })` names, wherever its key stands, exported where it is made: a string, or
   a record of strings picked by a key; a call naming anything else, or no `code:` this can read, fails
   (`tools/shaderCalls.mjs`). `cargo xtask shaders` runs this step alone. naga is not Chrome's compiler (Tint), and
   accepts a bitwise operator (`&`, `|`, `^`, `<<`, `>>`) sharing an expression unparenthesised with another, which
   Tint refuses: the step refuses it too, as WGSL's grammar does (a shift beside a comparison is let be).
6. **tests**: the Rust tests, with cargo-nextest, which runs every crate's at once, where it is installed (CI installs
   its pinned release) and with `cargo test` elsewhere; the workspace has no doctests, which nextest would not run. The
   tests that sweep the world check a sample here (see "The nightly run"). Then
   the Rust tests that write the files the page's tests read (the messages', the schedule's, the arts' first levels and
   the Elite Dungeons' answers and the rooms' and asks' numbers, into `target/`), so the page's part has them without
   the rest; the world rules, the land, movement and the rooms built as WebAssembly (`npm run wasm`); then
   `node --test`, whose bridge tests load them, and the build tools' own (`tools/*.test.mjs`).
7. **build**: the client, with Vite; the site (`npm run site:build`); then the bake cuts every node's window of the
   land (`npm run bake`), and the rooms' and the accounts' Cloudflare Workers are bundled with them as a deploy would,
   without deploying.
8. **repo checks**, each a pure function with tests beside it:

| Check | Holds | Rule |
|---|---|---|
| layout | the top level to the known list; every folder under `crates/` is a crate named after its folder | [[Code Map]] |
| size | source files to 600 lines, tests (Rust's, `test_*.py`, `*.test.ts` and its kin) to 800 | [[Small Files]] |
| comments | comments to eight lines, with no dates (numbered, year first or day first, or with a month's name before or after the day), issue numbers (after `#`, but for a colour's hex, after `PR` or joined to it, or after "pull request"), ticket tags (but a standard's name, `CRC-32`, `HTTP-2`) or `bible/` paths; lines in fenced examples are checked too, and so are Python's docstrings (raw ones, and one after a one-line `def` or `class`) and the comments after its code | [[Comments Say Why]] |
| layers | client imports follow the declared layers; no Node modules in client code (`fs/promises` is `fs`'s); no WebGL; nothing imports an entry point (`main.ts`, `gameWorker.ts`, `editorPage.ts`, `testground/testgroundMain.ts`) but another, as the page names the game's worker. It reads `import` and `export … from` in every form, backtick imports, `new URL(…, import.meta.url)` and `import.meta.glob`, a call's list wrapped onto the lines below read to its close, and a file named as the JavaScript it becomes (`./main.js`) as its TypeScript | [[Code Map]], [[WebGPU Only]] |
| html | a client page holds its head, one canvas and one module script loaded from its file, a path ending `.ts`, `.js` or `.mjs` (one, no more; never an address of another site or a `data:` one): no other element, no words but its title, no script written in the page, no `on…` handler or `style` attribute, no stylesheet linked or preloaded (`rel` and `as` read in any case or quote), and a `<style>` only for `html`, `body`, `:root` and the canvas's own id, no rule nested in theirs (a title, style or script read as text to its own end tag, HTML's comment marks in a style read as CSS, a comment ended where a browser ends it, at `-->`, `--!>`, or at once on `<!-->` and `<!--->`); no stylesheet in the client (`.css`, `.scss`, `.sass`, `.less` or `.styl`, in any case); no client script makes an element, puts one or words into the page, writes HTML, styles an element, brings in a stylesheet (any import of one, but a `?raw` read as text) or names an element but the canvas, in any spelling (`document['createElement']`, a space before the bracket, strings joined by `+`, `textContent`, `className` or `classList` named in a string, and `textContent` as a key, its shorthand too; an attribute made or set as a node), and `.append(` or `.prepend(` only on a name its file gives nothing but what `new` makes, or on a URL's `searchParams`. Free of it: the page's bridge in `ui/` (`canvasEvents.ts`, which sets the canvas's cursor; `pictures.ts`, which decodes SVG through an image it never shows; `page.ts`, which holds the page's touches, borrows a link and a file input for a moment and writes the words that say the game could not start), and the tests and their `…ForTests.ts` aids while nothing but tests reaches them | [[The Interface Uses No HTML, Now or Later]] |
| crates | every crate is declared, takes the workspace's lints, and depends only on the crates its rule allows, read by real package name through renames and per-platform tables; any attribute naming `unsafe_code` outside a door crate is refused | [[Code Map]] |
| assets | no file over 1 MB; media only in `bible/Attachments/`, and no WebAssembly, ship mesh, module pack (`.modules`) or binary bake (`.bin`) anywhere, the attachments too | [[Generated Files Stay Out of Git]] |
| vault | every wikilink resolves; every `code:` path exists and, in Rust, a script or Python, defines its symbol (after `fn`, `const`, `class` and the like, or as a field, variant, property or method), never only names it in an import, a `use`, a comment or a call; in any other file, names it | [[Notes Say How It Works Now]] |
| client tests | no client test names, in a string, a path into `crates/` or a Rust file: it compares with a fixture a Rust test writes under `target/`, or a content file both sides read | [[Tests Check Behaviour]] |
| pins | no fingerprint (8 or 16 hex digits) written both in Rust and in a script: each is pinned once, in `content/fingerprints.txt`, which both sides' tests read | [[Testing]] |
| schema | every FlatBuffers table holds `origin/main`'s fields, in their order and of their types, new ones after them (a clone without `origin/main` has nothing to hold them to; CI fetches it) | [[Messages Are FlatBuffers]] |
| python | every `.py` under `tools/` (but the two kept folders) compiles, and reads no name it never defines, by Python's own symbol tables, so a rename that misses a use fails here, not in a content workflow's bake | [[Short Branches, Green Main]] |
| versions | every `.sql` file in a `migrations/` folder, its ending in any case, is named by its UTC timestamp to the second, a day its month has, and what it does | [[Versions Are Not Counters]] |
| dialogue | every scene in `content/story/`: 14 words a line, 4 a bark, 2 lines a speaker in a row, 8 lines a scene, no dash (em, en, figure, the horizontal bar, the two- and three-em, the small em, a double hyphen, a hyphen spaced as one) or ellipsis, every speaker in the cast with a voice the speech system can read; and `content/quests/quests.json`, whose every named scene is the story's, every speaker the cast's and every word on the screen free of a dash or an ellipsis ([[The Audit's Leftovers Are Fixed as Claude Suggested]]), and whose seams (a `begin` into the first task's `start`, a task's `end` into the next's `start`) hold 2 lines a speaker in a row ([[The Dialogue Check Holds Two Lines a Turn Across a Quest's Seams]]) | [[Dialogue]] |

The checks read scripts of every extension: `.ts`, `.mts`, `.cts`, `.tsx`, `.js`, `.mjs` and `.cjs`. A file that is
not UTF-8 is reported, not skipped. Two folders are kept as their authors ship them, so the size, comment and assets
checks skip them: the co-dev's toolkit in `tools/claude-toolkit/` ([[The Co-Dev's Toolkit, Whole]]) and DFO's sprite
forge in `tools/forge/` ([[DFO's Sprite Forge Comes Over Exactly]]).

## The nightly run

The tests that sweep the world's weeks of passage zones (the passages' own and the rooms' walks through them) check a
sample wherever the check runs, and every case once a night on `main`
([[Pull Requests Sample the World's Sweeps, the Full Sweep Runs Nightly, and Builds Link Faster]]).
The sample is the same on every run, so a failure reproduces: the first zone of each kind, by its ground with its
size and by its ground with its deal, so it holds every kind the whole sweep does; where what a sweep looks for is
rare rather than a kind, a tenth of its weeks spread evenly over them. The `sweep` crate reads
`NO_SHORES_FULL_SWEEP`: set to anything but `0`, every sweep checks every case, as
`NO_SHORES_FULL_SWEEP=1 cargo test -p passage` does by hand.

The workflow `nightly.yml` runs the check's Rust part (`cargo xtask check rust`) with it set, at 10:00 UTC and by
hand, on `main` only. It reads the repository and nothing else: no secret, no deploy. A failure there is a sweep's
rare case the sample missed; its message names the week and zone, which a test can then take as a case of its own.

The sweeps over Saltmere's three patrol zones as the bake lays them (`sites_held`, `runs_walked`, `runs_planned`,
`layouts_laid`, `landings_safe`, `rooms_walked`) are not sampled. Each of their tests first settles or bakes the
continent, a quarter to all of its time, and its cases are the few territories, runs, buildings and bridges the
briefs name, each a place of its own that a sample would leave unchecked; `landings_safe` stands a player a minute
in each zone, which a shorter wait would not check.

## Adding a check

A check earns its place by catching something review keeps missing. It needs the owner's agreement, a test on
made-up input, and must hold everywhere the day it lands: if the code does not pass it yet, fix the code in the same
change. No baselines. Before it is added or tightened, prototype it over the whole repo: count its false alarms on
real cases and its misses on a generated bad set, then prove the xtask version by planting one bad case for each new
rule.
