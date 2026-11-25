use super::Problem;

/// No file in git is bigger than this. Renders, bakes and builds are generated, and stored outside git.
pub const MAX_BYTES: u64 = 1024 * 1024;

/// Media, and builds that are not text (WebAssembly, the ship exporter's meshes, the module packs and any other
/// binary bake), which the UTF-8 check skips.
const MEDIA_EXTENSIONS: [&str; 30] = [
    "png", "jpg", "jpeg", "webp", "gif", "bmp", "tga", "dds", "ktx", "ktx2", "glb", "gltf", "fbx", "obj", "blend",
    "wav", "ogg", "mp3", "flac", "mp4", "webm", "ttf", "otf", "woff", "woff2", "exr", "wasm", "mesh", "modules", "bin",
];

/// Pictures for the bible's own pages are the one place media may sit in git.
const MEDIA_ALLOWED_UNDER: [&str; 1] = ["bible/Attachments/"];

fn is_media(path: &str) -> bool {
    path.rsplit_once('.').is_some_and(|(_, extension)| MEDIA_EXTENSIONS.contains(&extension.to_lowercase().as_str()))
}

pub fn check(files: &[(String, u64)]) -> Vec<Problem> {
    let mut problems = Vec::new();
    for (path, bytes) in files {
        if *bytes > MAX_BYTES {
            let megabytes = *bytes as f64 / (1024.0 * 1024.0);
            problems.push(Problem::new(
                "assets",
                path,
                None,
                format!("{megabytes:.1} MB: files over 1 MB stay out of git"),
            ));
        }
        if is_media(path) && !MEDIA_ALLOWED_UNDER.iter().any(|root| path.starts_with(root)) {
            problems.push(Problem::new(
                "assets",
                path,
                None,
                "media and builds are made by our tools from sources in the repo and stored outside git",
            ));
        }
    }
    problems
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_and_small_attachments_pass() {
        let files = [("crates/core/src/lib.rs".to_owned(), 2_000), ("bible/Attachments/map.png".to_owned(), 200_000)];
        assert!(check(&files).is_empty());
    }

    #[test]
    fn media_outside_the_attachments_is_a_problem() {
        let problems = check(&[("crates/client/assets/hull.PNG".to_owned(), 10)]);
        assert_eq!(problems.len(), 1);
    }

    #[test]
    fn a_small_build_is_a_problem() {
        let files = [("client/public/room.wasm".to_owned(), 900_000), ("tools/ships/sloop.mesh".to_owned(), 900_000)];
        assert_eq!(check(&files).len(), 2);
    }

    #[test]
    fn a_module_pack_or_a_binary_bake_is_a_problem() {
        let files = [("tools/modules/out/town.modules".to_owned(), 40_000), ("content/land/node.BIN".to_owned(), 10)];
        assert_eq!(check(&files).len(), 2);
    }

    #[test]
    fn a_file_over_a_megabyte_is_a_problem() {
        let problems = check(&[("bible/Attachments/big.png".to_owned(), MAX_BYTES + 1)]);
        assert_eq!(problems.len(), 1);
        assert!(problems[0].message.contains("1 MB"));
    }
}
