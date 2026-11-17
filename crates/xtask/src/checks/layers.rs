use super::{Problem, is_script};

/// A part of the client and the parts it may import. Every folder directly under `client/src` is one, declared here
/// on purpose when its first file arrives, with its entry in the Code Map note.
#[derive(Debug)]
pub struct Layer {
    pub name: &'static str,
    pub may_import: &'static [&'static str],
}

/// The client's layers, by folder name under `client/src`. Files directly in `client/src` may import any of them.
pub const LAYERS: &[Layer] = &[
    Layer { name: "rules", may_import: &[] },
    Layer { name: "network", may_import: &["rules"] },
    Layer { name: "editor", may_import: &["rules", "water", "terrain", "ships"] },
    Layer { name: "terrain", may_import: &["rules", "water"] },
    Layer {
        name: "game",
        may_import: &[
            "rules",
            "network",
            "water",
            "terrain",
            "editor",
            "overworld",
            "models",
            "textures",
            "city",
            "nature",
            "forge",
            "firstperson",
            "player",
            "heldmap",
            "ships",
            "plus",
        ],
    },
    Layer { name: "water", may_import: &["rules"] },
    Layer { name: "ships", may_import: &["rules", "water", "textures"] },
    Layer { name: "forge", may_import: &[] },
    Layer { name: "player", may_import: &["rules", "network", "forge", "editor", "firstperson"] },
    Layer {
        name: "testground",
        may_import: &["rules", "network", "forge", "editor", "firstperson", "player", "combat"],
    },
    Layer { name: "combat", may_import: &["rules", "network"] },
    Layer { name: "firstperson", may_import: &["forge"] },
    Layer { name: "overworld", may_import: &[] },
    Layer { name: "textures", may_import: &[] },
    Layer { name: "models", may_import: &[] },
    Layer { name: "nature", may_import: &["rules", "water"] },
    Layer { name: "city", may_import: &["models", "textures", "rules", "water"] },
    Layer { name: "heldmap", may_import: &["editor", "overworld", "forge", "firstperson", "plus"] },
    Layer { name: "plus", may_import: &[] },
];

/// The file that wires the layers together. The other files beside it (the GPU, the canvas size) are groundwork
/// that any layer may import; the entry point itself sits above every layer, so none may import it.
const ENTRY_POINT: &str = "client/src/main.ts";

/// Node's modules: the game runs in the browser, so only tests and build config may reach them.
const NODE_MODULES: [&str; 12] =
    ["fs", "path", "os", "child_process", "crypto", "url", "util", "stream", "http", "https", "net", "worker_threads"];

/// What a client file may not use, whatever its layer: Overlook draws with WebGPU only. Any lowercase `webgl` on a
/// line catches every context name, `experimental-webgl` included, in any quote.
const WEBGL_MARKERS: [&str; 3] = ["webgl", "WebGLRenderingContext", "WebGL2RenderingContext"];

/// Where a module is named: `import … from '…'`, `export … from '…'`, `import '…'`, `import('…')`, a worker's
/// `new URL('…', import.meta.url)` and Vite's `import.meta.glob('…')`, in any quote.
const IMPORT_MARKERS: [&str; 5] = ["from ", "import ", "import(", "new URL(", "import.meta.glob("];

/// Every module a script file imports, with its line. A glob's list of patterns yields each pattern.
pub fn imports_of(text: &str) -> Vec<(String, usize)> {
    let mut found = Vec::new();
    for (offset, line) in text.lines().enumerate() {
        for marker in IMPORT_MARKERS {
            let mut rest = line;
            while let Some(at) = rest.find(marker) {
                let mut after = rest[at + marker.len()..].trim_start().trim_start_matches('[').trim_start();
                while let Some(quote) = after.chars().next().filter(|ch| matches!(ch, '\'' | '"' | '`'))
                    && let Some(close) = after[1..].find(quote)
                {
                    found.push((after[1..=close].to_owned(), offset + 1));
                    after = after[close + 2..].trim_start().trim_start_matches(',').trim_start();
                }
                rest = &rest[at + marker.len()..];
            }
        }
    }
    found
}

/// The layer folder a client path sits in, if it is below `client/src/<folder>/`.
fn layer_folder(path: &str) -> Option<&str> {
    path.strip_prefix("client/src/")?.split_once('/').map(|(folder, _)| folder)
}

/// Resolves `./x.ts` or `../y/z.ts` against the importing file's folder.
fn resolve(from_file: &str, specifier: &str) -> String {
    let mut parts: Vec<&str> = from_file.split('/').collect();
    parts.pop();
    for piece in specifier.split('/') {
        match piece {
            "." | "" => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    parts.join("/")
}

/// Client code imports only what its layer allows, never Node's modules, and never draws with WebGL.
pub fn check(sources: &[(String, String)]) -> Vec<Problem> {
    let mut problems = Vec::new();
    for (path, text) in sources.iter().filter(|(path, _)| path.starts_with("client/src/") && is_script(path)) {
        let is_test = path.rsplit_once('.').is_some_and(|(stem, _)| stem.ends_with(".test"));
        let own_layer = layer_folder(path);
        if let Some(folder) = own_layer
            && !LAYERS.iter().any(|layer| layer.name == folder)
        {
            let message = format!("client/src/{folder}/ is not a declared layer: add it to LAYERS and the Code Map");
            problems.push(Problem::new("layers", path, None, message));
            continue;
        }
        for (specifier, line) in imports_of(text) {
            let bare = specifier.strip_prefix("node:").unwrap_or(&specifier);
            let is_node = specifier.starts_with("node:") || NODE_MODULES.contains(&bare);
            if is_node && !is_test {
                let message = format!("client code runs in the browser: \"{specifier}\" is Node's");
                problems.push(Problem::new("layers", path, Some(line), message));
            }
            if !specifier.starts_with('.') {
                continue;
            }
            let target = resolve(path, &specifier);
            let Some(from) = own_layer else { continue };
            let (allowed, to) = match layer_folder(&target) {
                Some(to) => {
                    (from == to || LAYERS.iter().any(|layer| layer.name == from && layer.may_import.contains(&to)), to)
                }
                None => (target != ENTRY_POINT, "the entry point"),
            };
            if !allowed {
                problems.push(Problem::new("layers", path, Some(line), format!("{from} may not import {to}")));
            }
        }
        for (offset, line_text) in text.lines().enumerate() {
            if WEBGL_MARKERS.iter().any(|marker| line_text.contains(marker)) {
                let message = "Overlook draws with WebGPU only: no WebGL";
                problems.push(Problem::new("layers", path, Some(offset + 1), message));
            }
        }
    }
    problems
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(path: &str, text: &str) -> Vec<Problem> {
        check(&[(path.to_owned(), text.to_owned())])
    }

    #[test]
    fn imports_are_read_in_every_form() {
        let text = "import { a } from './a.ts';\nexport { b } from \"../b.ts\";\nimport './side.ts';\nconst c = await import('./c.ts');\n";
        let found: Vec<String> = imports_of(text).into_iter().map(|(specifier, _)| specifier).collect();
        assert_eq!(found, ["./a.ts", "../b.ts", "./side.ts", "./c.ts"]);
    }

    #[test]
    fn workers_globs_and_backtick_imports_are_read() {
        let text = "const worker = new Worker(new URL('./landWorker.ts', import.meta.url));\nconst sea = await import(`../sea/waves.ts`);\nconst pages = import.meta.glob(['./a/*.ts', \"../b/*.ts\"]);\n";
        let found: Vec<String> = imports_of(text).into_iter().map(|(specifier, _)| specifier).collect();
        assert_eq!(found, ["./landWorker.ts", "../sea/waves.ts", "./a/*.ts", "../b/*.ts"]);
    }

    #[test]
    fn a_layer_reaching_up_by_any_form_is_a_problem() {
        let cases = [
            "const worker = new Worker(new URL('../editor/landWorker.ts', import.meta.url));\n",
            "const panel = await import(`../editor/editorPanel.ts`);\n",
            "const views = import.meta.glob('../editor/*.ts');\n",
        ];
        for case in cases {
            let problems = run("client/src/rules/landRules.ts", case);
            assert_eq!(problems.len(), 1, "{case}");
            assert_eq!(problems[0].message, "rules may not import editor");
        }
    }

    #[test]
    fn the_entry_point_may_import_its_neighbours() {
        assert!(run("client/src/main.ts", "import { canvasSize } from './canvasSize.ts';\n").is_empty());
    }

    #[test]
    fn a_layer_may_import_the_groundwork_but_not_the_entry_point() {
        assert!(run("client/src/editor/editorMain.ts", "import { startGpu } from '../gpu.ts';\n").is_empty());
        let problems = run("client/src/editor/editorMain.ts", "import { fitCanvas } from '../main.ts';\n");
        assert_eq!(problems.len(), 1);
        assert_eq!(problems[0].message, "editor may not import the entry point");
    }

    #[test]
    fn every_script_extension_is_held_to_the_layers() {
        for path in
            ["client/src/rules/a.mts", "client/src/rules/a.tsx", "client/src/rules/a.mjs", "client/src/rules/a.cjs"]
        {
            assert_eq!(run(path, "import { panel } from '../editor/editorPanel.ts';\n").len(), 1, "{path}");
        }
        assert!(run("client/src/rules/a.test.mts", "import { test } from 'node:test';\n").is_empty());
    }

    #[test]
    fn an_undeclared_client_folder_is_a_problem() {
        let problems = run("client/src/sea/waves.ts", "export const calm = 0;\n");
        assert_eq!(problems.len(), 1);
        assert!(problems[0].message.contains("not a declared layer"));
    }

    #[test]
    fn node_modules_belong_to_tests_only() {
        assert_eq!(run("client/src/main.ts", "import fs from 'node:fs';\n").len(), 1);
        assert_eq!(run("client/src/main.ts", "import path from 'path';\n").len(), 1);
        assert!(run("client/src/main.test.ts", "import { test } from 'node:test';\n").is_empty());
    }

    #[test]
    fn webgl_is_refused() {
        let problems = run("client/src/main.ts", "const context = canvas.getContext('webgl2');\n");
        assert_eq!(problems.len(), 1);
        assert!(problems[0].message.contains("WebGPU only"));
        assert!(run("client/src/main.ts", "const context = canvas.getContext('webgpu');\n").is_empty());
    }

    #[test]
    fn webgl_is_refused_in_any_quote_or_name() {
        let cases = [
            "const context = canvas.getContext(`webgl2`);\n",
            "const context = canvas.getContext('experimental-webgl');\n",
            "const kind = 'webgl';\n",
        ];
        for case in cases {
            assert_eq!(run("client/src/main.ts", case).len(), 1, "{case}");
        }
    }

    #[test]
    fn relative_paths_resolve_against_the_importer() {
        assert_eq!(resolve("client/src/ui/hud.ts", "../engine/gpu.ts"), "client/src/engine/gpu.ts");
        assert_eq!(resolve("client/src/main.ts", "./ui/hud.ts"), "client/src/ui/hud.ts");
    }
}
