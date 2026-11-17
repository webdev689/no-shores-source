//! The RMB blocks a city may stand, by the prefix of their names, read from `content/world/rmb/index.json`. The plan
//! only names a block for each cell; the browser reads the block's buildings and props from the same table.

use serde::Deserialize;
use std::collections::BTreeMap;

/// Every block name the table holds, by its four-letter prefix.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Blocks {
    by_prefix: BTreeMap<String, Vec<String>>,
}

#[derive(Deserialize)]
struct Prefix {
    blocks: Vec<String>,
}

#[derive(Deserialize)]
struct Index {
    prefixes: BTreeMap<String, Prefix>,
}

impl Blocks {
    /// Reads the table's index.
    pub fn from_index(text: &str) -> Result<Self, String> {
        let index: Index = serde_json::from_str(text).map_err(|error| format!("the RMB index: {error}"))?;
        Ok(Self { by_prefix: index.prefixes.into_iter().map(|(prefix, entry)| (prefix, entry.blocks)).collect() })
    }

    /// A table of the given blocks, for tests.
    #[must_use]
    pub fn of(names: &[&str]) -> Self {
        let mut by_prefix: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for name in names {
            by_prefix.entry(name.chars().take(4).collect()).or_default().push((*name).to_owned());
        }
        Self { by_prefix }
    }

    /// The blocks under any of these prefixes, in the table's order.
    #[must_use]
    pub fn family(&self, prefixes: &[&str]) -> Vec<&str> {
        prefixes.iter().filter_map(|prefix| self.by_prefix.get(*prefix)).flatten().map(String::as_str).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_are_read_by_prefix_from_the_index() {
        let text = r#"{"prefixes":{"RESI":{"kind":"Houses only","blocks":["RESIAA00.RMB","RESIAA01.RMB"]},"TVRN":{"blocks":["TVRNAL01.RMB"]}}}"#;
        let blocks = Blocks::from_index(text).unwrap();
        assert_eq!(blocks.family(&["TVRN", "RESI"]), ["TVRNAL01.RMB", "RESIAA00.RMB", "RESIAA01.RMB"]);
        assert!(blocks.family(&["TEMP"]).is_empty());
    }
}
