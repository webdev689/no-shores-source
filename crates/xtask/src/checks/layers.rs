use super::Problem;

/// A part of the client and the parts it may import. Every folder directly under `client/src` is one, declared here
/// on purpose when its first file arrives, with its entry in the Code Map note.
#[derive(Debug)]
pub struct Layer {
    pub name: &'static str,
    pub may_import: &'static [&'static str],
}

/// The client's layers, by folder name under `client/src`. Files directly in `client/src` (the entry point) may
/// import any of them.
pub const LAYERS: &[Layer] = &[];

/// Node's modules: the game runs in the browser, so only tests and build config may reach them.
const NODE_MODULES: [&str; 12] =
    ["fs", "path", "os", "child_process", "crypto", "url", "util", "stream", "http", "https", "net", "worker_threads"];

/// What a client file may not use, whatever its layer: Overlook draws with WebGPU only.
const WEBGL_MARKERS: [&str; 4] =
    ["getContext('webgl", "getContext(\"webgl", "WebGLRenderingContext", "WebGL2RenderingContext"];

/// Every module a TypeScript file imports, with its line: `import … from '…'`, `export … from '…'`,
/// `import '…'` and `import('…')`.
pub fn imports_of(text: &str) -> Vec<(String, usize)> {
    let mut found = Vec::new();
    for (offset, line) in text.lines().enumerate() {
        for marker in ["from ", "import ", "import("] {
            let mut rest = line;
            while let Some(at) = rest.find(marker) {
                let after = rest[at + marker.len()..].trim_start();
                if let Some(quote) = after.chars().next().filter(|ch| *ch == '\'' || *ch == '"')
                    && let Some(close) = after[1..].find(quote)
                {
                    found.push((after[1..=close].to_owned(), offset + 1));
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
    for (path, text) in sources.iter().filter(|(path, _)| path.starts_with("client/src/") && path.ends_with(".ts")) {
        let is_test = path.ends_with(".test.ts");
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
            let (Some(from), Some(to)) = (own_layer, layer_folder(&target)) else { continue };
            let allowed = from == to || LAYERS.iter().any(|layer| layer.name == from && layer.may_import.contains(&to));
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
    fn the_entry_point_may_import_its_neighbours() {
        assert!(run("client/src/main.ts", "import { canvasSize } from './canvasSize.ts';\n").is_empty());
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
    fn relative_paths_resolve_against_the_importer() {
        assert_eq!(resolve("client/src/ui/hud.ts", "../engine/gpu.ts"), "client/src/engine/gpu.ts");
        assert_eq!(resolve("client/src/main.ts", "./ui/hud.ts"), "client/src/ui/hud.ts");
    }
}
