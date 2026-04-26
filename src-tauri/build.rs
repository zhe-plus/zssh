fn main() {
    let _ = std::panic::catch_unwind(|| tauri_build::build());
}
