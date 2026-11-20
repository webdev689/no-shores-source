//! Every shader the client compiles, checked as WGSL before any browser runs it: `npm run shaders` writes each one
//! out, and naga, the WGSL front end wgpu builds on, parses and validates it. WebGPU reports a shader that fails to
//! compile only as a warning, so without this a broken one draws nothing and says nothing.

use naga::valid::{Capabilities, ValidationFlags, Validator};
use std::path::Path;

/// Where `npm run shaders` writes the client's shaders, one file each.
pub const WRITTEN: &str = "target/shaders";

/// What is wrong with one shader, named `name`, or nothing. It asks for no capability past WebGPU's own.
pub fn problem_in(name: &str, source: &str) -> Option<String> {
    let module = match naga::front::wgsl::parse_str(source) {
        Ok(module) => module,
        Err(error) => return Some(error.emit_to_string_with_path(source, name)),
    };
    let mut validator = Validator::new(ValidationFlags::all(), Capabilities::empty());
    validator.validate(&module).err().map(|error| error.emit_to_string_with_path(source, name))
}

/// The problems in every shader written under `root`; one if none was written, since then nothing was checked.
pub fn problems_written(root: &Path) -> Vec<String> {
    let folder = root.join(WRITTEN);
    let mut paths: Vec<_> = match std::fs::read_dir(&folder) {
        Ok(entries) => entries.filter_map(Result::ok).map(|entry| entry.path()).collect(),
        Err(error) => return vec![format!("{}: {error}", folder.display())],
    };
    paths.retain(|path| path.extension().is_some_and(|extension| extension == "wgsl"));
    paths.sort();
    if paths.is_empty() {
        return vec![format!("no shader was written to {}", folder.display())];
    }
    paths
        .iter()
        .filter_map(|path| {
            let name = path.file_name().map_or_else(String::new, |name| name.to_string_lossy().into_owned());
            match std::fs::read_to_string(path) {
                Ok(source) => problem_in(&name, &source),
                Err(error) => Some(format!("{name}: {error}")),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::problem_in;

    const DRAWS: &str = "
@vertex fn place(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let start = vec2f(f32(index), 0.0);
  return vec4f(start, 0.0, 1.0);
}
@fragment fn paint() -> @location(0) vec4f { return vec4f(1.0); }
";

    #[test]
    fn a_sound_shader_passes() {
        assert_eq!(problem_in("draws.wgsl", DRAWS), None);
    }

    #[test]
    fn a_reserved_word_fails_and_says_where() {
        let broken = DRAWS.replace("let start", "let from").replace("vec4f(start", "vec4f(from");
        let problem = problem_in("bolts.wgsl", &broken).unwrap_or_default();
        assert!(problem.contains("bolts.wgsl:3"), "{problem}");
        assert!(problem.contains("from"), "{problem}");
    }

    #[test]
    fn a_type_error_fails_validation() {
        let broken = DRAWS.replace("vec4f(1.0)", "vec3f(1.0)");
        assert!(problem_in("paint.wgsl", &broken).is_some());
    }

    #[test]
    fn a_missing_function_fails() {
        let broken = DRAWS.replace("return vec4f(1.0);", "return glow();");
        assert!(problem_in("paint.wgsl", &broken).is_some_and(|problem| problem.contains("glow")));
    }
}
