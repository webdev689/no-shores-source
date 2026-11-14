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

    /// The text of every file whose path passes `keep`.
    pub fn sources(&self, keep: impl Fn(&str) -> bool) -> Vec<(String, String)> {
        self.files.iter().filter(|path| keep(path)).filter_map(|path| Some((path.clone(), self.read(path)?))).collect()
    }
}

/// The workspace root: two folders above this crate's manifest.
pub fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..").canonicalize().unwrap_or_else(|_| PathBuf::from("."))
}
