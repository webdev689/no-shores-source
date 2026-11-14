use super::comments::Comment;

/// Characters after which a slash starts a regular expression rather than a division.
const REGEX_CAN_FOLLOW: &str = "(,=:[!&|?{};+-*%<>~^";

/// The comments of a TypeScript or JavaScript file. Strings, template literals and regular expressions are skipped,
/// so their contents are never read as comments; consecutive `//` lines that stand alone form one comment.
pub fn script_comments(text: &str) -> Vec<Comment> {
    let chars: Vec<char> = text.chars().collect();
    let mut comments: Vec<Comment> = Vec::new();
    let mut line = 1;
    let mut index = 0;
    let mut line_has_code = false;
    let mut last_standalone_line: Option<usize> = None;
    let mut previous_significant: Option<char> = None;
    while index < chars.len() {
        let current = chars[index];
        let next = chars.get(index + 1).copied();
        if current == '\n' {
            line += 1;
            line_has_code = false;
            index += 1;
        } else if current == '/' && next == Some('/') {
            let end = chars[index..].iter().position(|&ch| ch == '\n').map_or(chars.len(), |offset| index + offset);
            let body: String = chars[index + 2..end].iter().collect();
            let standalone = !line_has_code;
            let continues = standalone && last_standalone_line.is_some_and(|previous| previous + 1 == line);
            match comments.last_mut() {
                Some(comment) if continues => comment.lines.push((line, body)),
                _ => comments.push(Comment { lines: vec![(line, body)] }),
            }
            last_standalone_line = standalone.then_some(line);
            index = end;
        } else if current == '/' && next == Some('*') {
            let close = chars[index + 2..].windows(2).position(|pair| pair == ['*', '/']);
            let end = close.map_or(chars.len(), |offset| index + 2 + offset);
            let body: String = chars[index + 2..end].iter().collect();
            let lines: Vec<(usize, String)> =
                body.split('\n').enumerate().map(|(offset, text)| (line + offset, text.to_owned())).collect();
            line += lines.len() - 1;
            comments.push(Comment { lines });
            last_standalone_line = None;
            index = (end + 2).min(chars.len());
        } else if current == '"' || current == '\'' || current == '`' {
            let (end, crossed) = skip_string(&chars, index, current);
            line += crossed;
            line_has_code = true;
            previous_significant = Some('"');
            index = end;
        } else if current == '/' && previous_significant.is_none_or(|ch| REGEX_CAN_FOLLOW.contains(ch)) {
            line_has_code = true;
            previous_significant = Some('"');
            index = skip_regex(&chars, index);
        } else {
            if !current.is_whitespace() {
                line_has_code = true;
                let is_value_end = current.is_alphanumeric() || matches!(current, '_' | '$' | ')' | ']');
                previous_significant = Some(if is_value_end { 'a' } else { current });
            }
            index += 1;
        }
    }
    comments
}

/// Skips a quoted string or a template literal (with its `${ }` parts), returning where it ends and the lines it crossed.
fn skip_string(chars: &[char], start: usize, quote: char) -> (usize, usize) {
    let mut position = start + 1;
    let mut crossed = 0;
    let mut depth = 0;
    while position < chars.len() {
        let current = chars[position];
        if current == '\\' {
            position += 2;
            continue;
        }
        if current == '\n' {
            if quote != '`' {
                return (position, crossed);
            }
            crossed += 1;
        } else if quote == '`' && current == '$' && chars.get(position + 1) == Some(&'{') {
            depth += 1;
        } else if quote == '`' && current == '}' && depth > 0 {
            depth -= 1;
        } else if current == quote && depth == 0 {
            return (position + 1, crossed);
        }
        position += 1;
    }
    (position, crossed)
}

fn skip_regex(chars: &[char], start: usize) -> usize {
    let mut position = start + 1;
    let mut in_class = false;
    while position < chars.len() {
        match chars[position] {
            '\\' => position += 1,
            '[' => in_class = true,
            ']' => in_class = false,
            '/' if !in_class => {
                position += 1;
                while chars.get(position).is_some_and(char::is_ascii_alphabetic) {
                    position += 1;
                }
                return position;
            }
            '\n' => return position,
            _ => {}
        }
        position += 1;
    }
    position
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bodies(text: &str) -> Vec<Vec<String>> {
        script_comments(text)
            .into_iter()
            .map(|comment| comment.lines.into_iter().map(|(_, body)| body).collect())
            .collect()
    }

    #[test]
    fn line_and_block_comments_are_found() {
        let text = "// one\n// two\nconst sail = 1; // beside\n/* block\n   end */\n";
        assert_eq!(bodies(text), vec![vec![" one", " two"], vec![" beside"], vec![" block", "   end "]]);
    }

    #[test]
    fn strings_templates_and_regexes_are_not_comments() {
        let text = "const url = 'https://example.com';\nconst t = `a // ${f('/* x */')} b`;\nconst re = /\\/\\/[/]/g;\nconst half = width / 2; // real\n";
        assert_eq!(bodies(text), vec![vec![" real"]]);
    }

    #[test]
    fn line_numbers_survive_a_multi_line_template() {
        let text = "const page = `\nline\nline\n`;\n// after\n";
        assert_eq!(script_comments(text)[0].lines[0].0, 5);
    }
}
