//! The Python under `tools/` compiles and names nothing it never defines: the Blender scripts run only in the content
//! workflows' bakes, so without this a rename that misses one use fails a bake on push instead of here. Python itself
//! reads the files: it compiles each, then its own symbol tables say which names a scope reads but nothing defines.

use super::{Problem, kept_as_shipped};
use std::io::Write;
use std::process::{Command, Stdio};

/// Our Python tools: every `.py` under `tools/` but the folders kept as their authors ship them.
pub fn is_tool(path: &str) -> bool {
    path.starts_with("tools/") && path.ends_with(".py") && !kept_as_shipped(path)
}

/// Reads `[[path, text], ...]` as JSON on its input and prints `path<TAB>line<TAB>what` for each problem. A module
/// with a star import is compiled but not read for names, since it names what it brings in nowhere.
const READER: &str = r#"
import ast, builtins, json, sys, symtable
for path, text in json.load(sys.stdin):
    try:
        tree = ast.parse(text, path)
        compile(tree, path, 'exec')
        table = symtable.symtable(text, path, 'exec')
    except SyntaxError as error:
        print(f'{path}\t{error.lineno or 0}\tdoes not compile: {error.msg}')
        continue
    if any(isinstance(node, ast.ImportFrom) and any(each.name == '*' for each in node.names) for node in ast.walk(tree)):
        continue
    scopes, waiting = [], [table]
    while waiting:
        scope = waiting.pop()
        scopes.append(scope)
        waiting.extend(scope.get_children())
    defined = set(dir(builtins)) | {'__file__', '__builtins__'}
    for scope in scopes:
        for symbol in scope.get_symbols():
            if (scope is table or symbol.is_declared_global()) and (symbol.is_assigned() or symbol.is_imported()
                                                                       or symbol.is_namespace()):
                defined.add(symbol.get_name())
    unknown = {symbol.get_name() for scope in scopes for symbol in scope.get_symbols()
               if symbol.is_referenced() and symbol.is_global() and not symbol.is_local()
               and symbol.get_name() not in defined}
    # Each load is judged in its own scope (a def, a lambda or a class), so a name local in one function and unknown in
    # another is reported only where it is unknown; a scope symtable does not list (a comprehension's) goes by the file.
    named = {(scope.get_lineno(), scope.get_name()): scope for scope in scopes}
    def unresolved(scope, name):
        try:
            symbol = scope.lookup(name)
        except KeyError:
            return name in unknown
        return symbol.is_global() and not symbol.is_local() and name not in defined
    lines = set()
    def visit(node, scope):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            scope = named.get((node.lineno, node.name), scope)
        elif isinstance(node, ast.Lambda):
            scope = named.get((node.lineno, 'lambda'), scope)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id in unknown:
            if unresolved(scope, node.id):
                lines.add((node.lineno, node.id))
        for child in ast.iter_child_nodes(node):
            visit(child, scope)
    visit(tree, table)
    for line, name in sorted(lines):
        print(f'{path}\t{line}\t{name} is never defined')
"#;

pub fn check(tools: &[(String, String)]) -> Vec<Problem> {
    if tools.is_empty() {
        return Vec::new();
    }
    let failed = |message: String| vec![Problem::new("python", "tools/", None, message)];
    let child = Command::new("python3")
        .args(["-I", "-c", READER])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let mut child = match child {
        Ok(child) => child,
        Err(error) => return failed(format!("python3 could not be run to read the tools' Python: {error}")),
    };
    let written = serde_json::to_vec(tools).map_err(|error| error.to_string()).and_then(|input| {
        child.stdin.take().ok_or_else(|| "no input".to_owned())?.write_all(&input).map_err(|error| error.to_string())
    });
    let output = match (written, child.wait_with_output()) {
        (Ok(()), Ok(output)) if output.status.success() => output,
        (Err(error), _) => return failed(format!("python3 was not handed the tools' Python: {error}")),
        (_, Ok(output)) => return failed(format!("python3 failed: {}", String::from_utf8_lossy(&output.stderr))),
        (_, Err(error)) => return failed(format!("python3 failed: {error}")),
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '\t');
            let (path, number, what) = (parts.next()?, parts.next()?, parts.next()?);
            Some(Problem::new("python", path, number.parse().ok().filter(|line| *line > 0), what))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{check, is_tool};

    fn found(text: &str) -> Vec<String> {
        check(&[("tools/modules/outpost.py".to_owned(), text.to_owned())])
            .into_iter()
            .map(|problem| problem.to_string())
            .collect()
    }

    #[test]
    fn a_sound_script_passes() {
        let text = "import math\nfrom pathlib import Path\n\nHALF = 2\n\n\ndef scaffold(half):\n    half_x, half_y = half\n    \
                    return [math.floor(half_x) for _ in range(half_y)], Path(__file__), HALF, later()\n\n\n\
                    class Box:\n    size = HALF\n\n    def area(self):\n        return self.size * len(str(self))\n\n\n\
                    def later():\n    global LATE\n    LATE = 1\n    return LATE\n";
        assert_eq!(found(text), Vec::<String>::new());
    }

    #[test]
    fn a_name_left_by_a_rename_is_refused_where_it_is_read() {
        let text = "def scaffold(half):\n    half_x, half_y = half\n    return hx * half_y\n";
        assert_eq!(found(text), ["tools/modules/outpost.py:3  [python] hx is never defined"]);
        let elsewhere = "def keep():\n    hx = 1\n    return hx\n\n\ndef scaffold():\n    return hx\n";
        assert_eq!(found(elsewhere), ["tools/modules/outpost.py:7  [python] hx is never defined"]);
    }

    #[test]
    fn a_script_that_does_not_compile_is_refused() {
        let found = found("def scaffold(:\n    pass\n");
        assert!(found.len() == 1 && found[0].starts_with("tools/modules/outpost.py:1  [python] does not compile"));
    }

    #[test]
    fn only_our_tools_are_read() {
        assert!(is_tool("tools/islands/bake.py"));
        assert!(!is_tool("tools/forge/tools/sprite-forge/layers.py"));
        assert!(!is_tool("tools/claude-toolkit/check_tools.py"));
        assert!(!is_tool("server/script.py"));
    }
}
