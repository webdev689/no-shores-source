use std::path::{Path, PathBuf};
use std::process::Command;

/// The repository as the checks see it: every file git tracks or would track, with forward-slash paths.
#[derive(Debug)]
pub struct Repo {
    pub root: PathBuf,
    pub files: Vec<String>,
}

impl Repo {
    pub fn load() -> Result<Self, String> {
        let root = repo_root();
        let output = Command::new("git")
            .args(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
            .current_dir(&root)
            .output()
            .map_err(|error| format!("git ls-files: {error}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).into_owned());
        }
        let listing = String::from_utf8_lossy(&output.stdout);
        let files = listing
            .split('\0')
            .filter(|path| !path.is_empty() && root.join(path).is_file())
            .map(str::to_owned)
            .collect();
        Ok(Self { root, files })
    }

    /// A file's text, or `None` when it does not exist or is not UTF-8.
    pub fn read(&self, path: &str) -> Option<String> {
        std::fs::read_to_string(self.root.join(path)).ok()
    }

    pub fn size(&self, path: &str) -> u64 {
        std::fs::metadata(self.root.join(path)).map(|meta| meta.len()).unwrap_or(0)
    }

    /// A file's text as it stands at `commit` (`origin/main`), or `None` where the clone lacks that commit or the file.
    pub fn at(&self, commit: &str, path: &str) -> Option<String> {
        let output = Command::new("git").args(["show", &format!("{commit}:{path}")]).current_dir(&self.root).output();
        output.ok().filter(|output| output.status.success()).and_then(|output| String::from_utf8(output.stdout).ok())
    }

    /// The commit where `HEAD` and `other` (`origin/main`) parted, or `None` where the clone cannot say.
    pub fn merge_base(&self, other: &str) -> Option<String> {
        let output = Command::new("git").args(["merge-base", "HEAD", other]).current_dir(&self.root).output();
        let output = output.ok().filter(|output| output.status.success())?;
        Some(String::from_utf8_lossy(&output.stdout).trim().to_owned())
    }

    /// The text of every file whose path passes `keep`, and apart the paths of those that are not UTF-8, so a check
    /// can report them rather than pass over them.
    pub fn sources(&self, keep: impl Fn(&str) -> bool) -> (Vec<(String, String)>, Vec<String>) {
        let mut texts = Vec::new();
        let mut unreadable = Vec::new();
        for path in self.files.iter().filter(|path| keep(path)) {
            match self.read(path) {
                Some(text) => texts.push((path.clone(), text)),
                None => unreadable.push(path.clone()),
            }
        }
        (texts, unreadable)
    }
}

/// The workspace root: two folders above this crate's manifest.
pub fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..").canonicalize().unwrap_or_else(|_| PathBuf::from("."))
}

#[cfg(test)]
mod tests {
    use super::Repo;

    #[test]
    fn a_file_that_is_not_utf8_is_reported_not_skipped() {
        let root = std::env::temp_dir().join(format!("xtask-sources-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("good.rs"), "fn sail() {}\n").unwrap();
        std::fs::write(root.join("bad.rs"), [0x66, 0xff, 0xfe, 0x0a]).unwrap();
        let repo = Repo { root: root.clone(), files: vec!["good.rs".to_owned(), "bad.rs".to_owned()] };
        let (texts, unreadable) = repo.sources(|path| path.ends_with(".rs"));
        std::fs::remove_dir_all(&root).unwrap();
        assert_eq!(texts, [("good.rs".to_owned(), "fn sail() {}\n".to_owned())]);
        assert_eq!(unreadable, ["bad.rs"]);
    }
}
