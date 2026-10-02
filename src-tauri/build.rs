fn main() {
    if std::env::var_os("CARGO_FEATURE_DESKTOP").is_some() {
        // Recompile native icon resources when branding assets change.
        println!("cargo:rerun-if-changed=icons");
        tauri_build::build()
    }
}
