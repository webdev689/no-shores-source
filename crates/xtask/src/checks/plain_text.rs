use super::Problem;
use serde_json::Value;

/// Where the player's words live: the game's content, read as one table of strings.
pub const CONTENT_ROOT: &str = "content/";
/// Read as pages, not strings: the lore's books, and the world's briefs (never shown), town blocks and land.
const PAGES: [&str; 4] = ["content/lore/", "content/world/briefs.json", "content/world/rmb/", "content/world/land/"];
/// A string's most words, and its longest sentence's: longer help is a page or a fold.
const STRING_WORDS: usize = 40;
const SENTENCE_WORDS: usize = 25;
/// A file's word on itself, never shown.
const ABOUT: &str = "about";
/// A name is a name, whatever word it uses ("Delve Gate").
const NAME: &str = "name";
/// Words that pad or sell instead of saying, none of them needed in the game's text.
const PADDING: [&str; 22] = [
    "seamless",
    "seamlessly",
    "delve",
    "elevate",
    "embark",
    "unleash",
    "vibrant",
    "bustling",
    "a testament to",
    "tapestry of",
    "in the world of",
    "dive into",
    "whether you're",
    "not just",
    "not only",
    "not merely",
    "simply",
    "please note",
    "rest assured",
    "it's worth noting",
    "game-changer",
    "gamechanger",
];
/// A dash the game's text keeps out: a pause is a full stop.
const EM_DASH: char = '\u{2014}';

/// Whether a content file is read as strings.
pub fn is_read(path: &str) -> bool {
    path.starts_with(CONTENT_ROOT) && path.ends_with(".json") && !PAGES.iter().any(|page| path.starts_with(page))
}

fn words(text: &str) -> usize {
    text.split_whitespace().count()
}

fn longest_sentence(text: &str) -> usize {
    let mut longest = 0;
    let mut current = 0;
    for word in text.split_whitespace() {
        current += 1;
        if word.ends_with(['.', '!', '?']) {
            longest = longest.max(current);
            current = 0;
        }
    }
    longest.max(current)
}

/// The padding a string holds, matched as whole words.
fn padding(text: &str) -> Vec<&'static str> {
    let spoken: String = text
        .to_lowercase()
        .replace('\u{2019}', "'")
        .chars()
        .map(|ch| if ch.is_alphanumeric() || ch == '\'' || ch == '-' { ch } else { ' ' })
        .collect();
    let spaced = format!(" {} ", spoken.split_whitespace().collect::<Vec<_>>().join(" "));
    PADDING.into_iter().filter(|phrase| spaced.contains(&format!(" {phrase} "))).collect()
}

/// What breaks the rule in one string, each as a message.
pub fn breaches(text: &str, is_name: bool) -> Vec<String> {
    if !text.contains(' ') {
        return Vec::new();
    }
    let mut found = Vec::new();
    let count = words(text);
    if count > STRING_WORDS {
        found.push(format!("{count} words, past {STRING_WORDS}: a longer help is a page or a fold"));
    }
    let sentence = longest_sentence(text);
    if sentence > SENTENCE_WORDS {
        found.push(format!("a sentence of {sentence} words, past {SENTENCE_WORDS}: split it"));
    }
    if !is_name {
        found.extend(padding(text).into_iter().map(|phrase| format!("\"{phrase}\" pads: say it plainly")));
    }
    if text.contains(EM_DASH) {
        found.push("an em dash: a pause is a full stop".to_owned());
    }
    found
}

fn walk(value: &Value, at: &str, key: &str, found: &mut Vec<String>) {
    match value {
        Value::String(text) if key != ABOUT => {
            found.extend(breaches(text, key == NAME).into_iter().map(|breach| format!("{at}: {breach}")));
        }
        Value::Object(fields) => {
            for (name, inner) in fields.iter().filter(|(name, _)| name.as_str() != ABOUT) {
                walk(inner, &format!("{at}.{name}"), name, found);
            }
        }
        Value::Array(items) => {
            for (index, inner) in items.iter().enumerate() {
                walk(inner, &format!("{at}[{index}]"), key, found);
            }
        }
        _ => {}
    }
}

pub fn check(content: &[(String, String)]) -> Vec<Problem> {
    let mut problems = Vec::new();
    for (path, text) in content {
        let Ok(value) = serde_json::from_str::<Value>(text) else {
            problems.push(Problem::new("plain text", path, None, "not JSON, so its words cannot be read"));
            continue;
        };
        let mut found = Vec::new();
        walk(&value, "", "", &mut found);
        problems.extend(found.into_iter().map(|message| Problem::new("plain text", path, None, message)));
    }
    problems
}

#[cfg(test)]
mod tests {
    use super::{breaches, check, is_read};

    #[test]
    fn a_long_string_or_sentence_is_a_breach() {
        let long = ["word"; 41].join(" ");
        assert_eq!(breaches(&long, false).len(), 2, "41 words, one sentence");
        let sentence = format!("{}.", ["word"; 26].join(" "));
        assert_eq!(breaches(&sentence, false).len(), 1);
        let two = format!("{}. {}.", ["word"; 20].join(" "), ["word"; 20].join(" "));
        assert!(breaches(&two, false).is_empty(), "40 words in two sentences keep the rule");
    }

    #[test]
    fn padding_and_the_em_dash_are_breaches_but_a_name_may_hold_a_word() {
        assert_eq!(breaches("Simply sail on.", false).len(), 1);
        assert_eq!(breaches("A shield \u{2014} thin.", false).len(), 1);
        assert_eq!(breaches("It is not only a ship, but a home.", false).len(), 1);
        assert!(breaches("Delve Gate", true).is_empty());
        assert_eq!(breaches("Delve into the deep.", false).len(), 1);
        assert!(breaches("A simplyshaped hull at the onlyport.", false).is_empty(), "whole words only");
    }

    #[test]
    fn about_is_never_read_and_pages_are_not_strings() {
        let about = format!(r#"{{ "about": "{}", "items": [{{ "words": "Simply sail." }}] }}"#, ["w"; 50].join(" "));
        let problems = check(&[("content/gear/a.json".to_owned(), about)]);
        assert_eq!(problems.len(), 1);
        assert!(problems[0].message.starts_with(".items[0].words: \"simply\""), "{}", problems[0].message);
        assert!(is_read("content/gear/traits.json"));
        assert!(!is_read("content/lore/lore.json"));
        assert!(!is_read("content/world/briefs.json"));
    }
}
