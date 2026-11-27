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

/// The checkout the command runs in, git's top folder from the current one: never the folder this binary was built
/// from, which is another checkout's when two share a build folder.
pub fn repo_root() -> PathBuf {
    let top =
        Command::new("git").args(["rev-parse", "--show-toplevel"]).output().ok().filter(|out| out.status.success());
    top.map_or_else(|| PathBuf::from("."), |out| PathBuf::from(String::from_utf8_lossy(&out.stdout).trim()))
}

/// Why a check here would test another checkout's build, or `None`. Two checkouts sharing one build folder
/// (`CARGO_TARGET_DIR`) overwrite each other's binaries mid-run, so a result can be the other tree's.
pub fn foreign_build(root: &Path, target: Option<PathBuf>) -> Option<String> {
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let built = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let built = built.canonicalize().unwrap_or(built);
    if built != root {
        return Some(format!("this xtask was built from {}, not {}", built.display(), root.display()));
    }
    let target = target?;
    // shortcut: a cargo config file's `build.target-dir` is not seen; read `cargo metadata` once one is set.
    let target = std::env::current_dir().map_or_else(|_| target.clone(), |cwd| cwd.join(&target));
    let target = target.canonicalize().unwrap_or(target);
    (!target.starts_with(&root)).then(|| {
        format!("CARGO_TARGET_DIR is {}, outside the checkout: unset it, or point it inside", target.display())
    })
}

#[cfg(test)]
mod tests {
    use super::{Repo, foreign_build, repo_root};

    #[test]
    fn a_build_folder_outside_the_checkout_is_refused_and_one_inside_is_not() {
        let root = repo_root();
        assert_eq!(foreign_build(&root, None), None);
        assert_eq!(foreign_build(&root, Some(root.join("target"))), None);
        let outside = std::env::temp_dir().join("shared-target");
        assert!(foreign_build(&root, Some(outside)).is_some_and(|why| why.contains("outside the checkout")));
    }

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
