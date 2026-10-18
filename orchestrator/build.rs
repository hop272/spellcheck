// orchestrator/build.rs
fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=../proto/spellcheck.proto");
    tonic_build::configure().compile_protos(&["../proto/spellcheck.proto"], &["../proto"])?;
    Ok(())
}
