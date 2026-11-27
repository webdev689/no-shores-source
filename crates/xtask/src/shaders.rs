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
    if let Err(error) = validator.validate(&module) {
        return Some(error.emit_to_string_with_path(source, name));
    }
    unparenthesised_bitwise(source).map(|(line, bitwise, other)| {
        format!(
            "{name}:{line}: `{bitwise}` shares an expression with `{other}` unparenthesised, which naga accepts and \
             Chrome's Tint refuses: parenthesise it"
        )
    })
}

/// Binary operators: the bitwise ones WGSL lets share an expression with no other, the shifts it lets share one only
/// with comparisons and the logical ones, and the rest.
const BITWISE: [&str; 3] = ["&", "|", "^"];
const SHIFTS: [&str; 2] = ["<<", ">>"];
const OTHERS: [&str; 13] = ["+", "-", "*", "/", "%", "<", ">", "<=", ">=", "==", "!=", "&&", "||"];
const ARITHMETIC: [&str; 5] = ["+", "-", "*", "/", "%"];
/// What ends an expression: an assignment, a separator or a block.
const ENDS: [&str; 18] =
    ["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=", "->", ",", ";", ":", "{", "}", "@"];
/// Words after which an operator is unary.
const LEADING: [&str; 5] = ["return", "if", "while", "switch", "case"];

/// Whether two operators may share an expression unparenthesised, as WGSL's grammar (and so Tint) allows.
fn mixable(one: &str, other: &str) -> bool {
    let (one, other) = if BITWISE.contains(&other) || SHIFTS.contains(&other) { (other, one) } else { (one, other) };
    if BITWISE.contains(&one) {
        return one == other;
    }
    !SHIFTS.contains(&one) || !(SHIFTS.contains(&other) || BITWISE.contains(&other) || ARITHMETIC.contains(&other))
}

/// The source's tokens with the line each starts on, its comments dropped and its template lists' `<` and `>` (as in
/// `array<vec4<f32>, 4>`) turned to parentheses, found as WGSL's template list discovery finds them.
fn tokens(source: &str) -> Vec<(usize, String)> {
    let chars: Vec<char> = source.chars().collect();
    let mut found: Vec<(usize, String)> = Vec::new();
    let (mut at, mut line) = (0, 1);
    // Each open `<` that may start a template list: its token's place and the bracket depth it opened at.
    let (mut open, mut depth): (Vec<(usize, usize)>, usize) = (Vec::new(), 0);
    let starts =
        |at: usize, text: &str| text.chars().enumerate().all(|(step, mark)| chars.get(at + step) == Some(&mark));
    while let Some(&mark) = chars.get(at) {
        if mark == '\n' {
            line += 1;
        }
        if mark.is_whitespace() {
            at += 1;
        } else if starts(at, "//") {
            while chars.get(at).is_some_and(|mark| *mark != '\n') {
                at += 1;
            }
        } else if starts(at, "/*") {
            while at < chars.len() && !starts(at, "*/") {
                line += usize::from(chars[at] == '\n');
                at += 1;
            }
            at += 2;
        } else if mark.is_alphanumeric() || mark == '_' {
            let from = at;
            while chars.get(at).is_some_and(|mark| mark.is_alphanumeric() || *mark == '_' || *mark == '.') {
                at += 1;
            }
            found.push((line, chars[from..at].iter().collect()));
            if chars.get(at) == Some(&'<') && !starts(at, "<<") && !starts(at, "<=") {
                open.push((found.len(), depth));
                found.push((line, "<".to_owned()));
                at += 1;
            }
        } else {
            let text =
                ["<<=", ">>=", "<<", ">>", "<=", ">=", "==", "!=", "&&", "||", "->", "+=", "-=", "*=", "/=", "%="]
                    .into_iter()
                    .chain(["&=", "|=", "^=", "++", "--"])
                    .find(|text| starts(at, text))
                    .map_or_else(|| mark.to_string(), str::to_owned);
            if mark == '>' && open.last().is_some_and(|(_, opened)| *opened == depth) {
                if let Some((start, _)) = open.pop() {
                    found[start].1 = "(".to_owned();
                }
                found.push((line, ")".to_owned()));
                at += 1;
                continue;
            }
            match text.as_str() {
                "(" | "[" => depth += 1,
                ")" | "]" => {
                    open.retain(|(_, opened)| *opened < depth);
                    depth = depth.saturating_sub(1);
                }
                "&&" | "||" => open.retain(|(_, opened)| *opened < depth),
                ";" | "{" | "}" | ":" | "=" => {
                    open.clear();
                    depth = 0;
                }
                _ => {}
            }
            at += text.chars().count();
            found.push((line, text));
        }
    }
    found
}

/// The first binary bitwise operator sharing an expression with an operator WGSL forbids beside it: its line, it and
/// the other operator.
fn unparenthesised_bitwise(source: &str) -> Option<(usize, String, String)> {
    // The operators of each expression still open, the innermost last.
    let mut levels: Vec<Vec<String>> = vec![Vec::new()];
    let mut operand = false;
    for (line, token) in tokens(source) {
        let text = token.as_str();
        match text {
            "(" | "[" => levels.push(Vec::new()),
            ")" | "]" => {
                levels.pop();
                if levels.is_empty() {
                    levels.push(Vec::new());
                }
            }
            _ if ENDS.contains(&text) => {
                if let Some(level) = levels.last_mut() {
                    level.clear();
                }
            }
            _ if operand && (BITWISE.contains(&text) || SHIFTS.contains(&text) || OTHERS.contains(&text)) => {
                let level = levels.last_mut()?;
                if let Some(other) = level.iter().find(|other| !mixable(text, other)) {
                    let (bitwise, other) = if BITWISE.contains(&text) || SHIFTS.contains(&text) {
                        (text, other.as_str())
                    } else {
                        (other.as_str(), text)
                    };
                    return Some((line, bitwise.to_owned(), other.to_owned()));
                }
                // A comparison or a logical operator ends the operand before it: a shift there and arithmetic after
                // it (`a << 1u < b + c`) are each a whole operand of their own.
                if OTHERS.contains(&text) && !ARITHMETIC.contains(&text) {
                    level.retain(|other| !SHIFTS.contains(&other.as_str()) && !ARITHMETIC.contains(&other.as_str()));
                }
                level.push(token.clone());
            }
            _ => {}
        }
        operand = matches!(text, ")" | "]")
            || (text.starts_with(|mark: char| mark.is_alphanumeric() || mark == '_') && !LEADING.contains(&text));
    }
    None
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
    fn a_bitwise_operator_mixed_unparenthesised_fails_as_tint_fails_it() {
        let hashed = |expression: &str| {
            DRAWS.replace(
                "return vec4f(1.0);",
                &format!("let a = 3u; let b = 5u; let h = {expression}; return vec4f(f32(h));"),
            )
        };
        let problem = problem_in("meadow.wgsl", &hashed("a * 7u ^ b * 9u ^ 1u")).unwrap_or_default();
        assert!(problem.contains("meadow.wgsl:6") && problem.contains("`^`") && problem.contains("`*`"), "{problem}");
        for mixed in [
            "a & b | 1u",
            "a << 2u + b",
            "a + b >> 1u",
            "a << 1u << b",
            "a & b == 1u",
            "a | b & 1u",
            "u32(a < b + 1u << 2u)",
        ] {
            assert!(problem_in("meadow.wgsl", &hashed(mixed)).is_some(), "{mixed}");
        }
        for sound in [
            "(a * 7u) ^ (b * 9u) ^ 1u",
            "a ^ b ^ 1u",
            "(a << 2u) + b",
            "u32(a << 1u < b)",
            "a & b",
            "~a & b",
            "u32(a << 1u < b + 1u)",
        ] {
            assert_eq!(problem_in("meadow.wgsl", &hashed(sound)), None, "{sound}");
        }
    }

    #[test]
    fn template_lists_unary_operators_and_comments_are_not_taken_for_operators() {
        let shader = "
// a ^ b * c, said in a comment
var<private> table: array<vec4<f32>, 2>;
fn pick(index: u32, held: ptr<function, array<u32, 4>>) -> u32 { return (*held)[index & 3u] | 1u; }
@fragment fn paint() -> @location(0) vec4f {
  var held = array<u32, 4>(1u, 2u, 3u, 4u);
  let first = pick(0u, &held) >> 1u;
  let near = -table[0].x * 2.0;
  return vec4f(f32(first) + near, 0.0, 0.0, 1.0);
}
";
        assert_eq!(problem_in("pick.wgsl", shader), None);
    }

    #[test]
    fn a_missing_function_fails() {
        let broken = DRAWS.replace("return vec4f(1.0);", "return glow();");
        assert!(problem_in("paint.wgsl", &broken).is_some_and(|problem| problem.contains("glow")));
    }
}
