use std::{
    io::{self, Read},
    path::Path,
};

fn run() -> Result<(), String> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let output = match args.first().map(String::as_str) {
        Some("--json") => {
            let mut input = String::new();
            io::stdin()
                .take(beckarepo_core::policy::MAX_REQUEST_BYTES + 1)
                .read_to_string(&mut input)
                .map_err(|e| e.to_string())?;
            if input.len() as u64 > beckarepo_core::policy::MAX_REQUEST_BYTES {
                return Err("JSON request exceeds the transport limit".into());
            }
            let request = serde_json::from_str(&input).map_err(|e| e.to_string())?;
            serde_json::to_string(&beckarepo_core::analyze(&request)?).map_err(|e| e.to_string())?
        }
        Some(path) => {
            serde_json::to_string(&beckarepo_core::repository::scan(Path::new(path), |_| {
                Ok(())
            })?)
            .map_err(|e| e.to_string())?
        }
        None => return Err("Usage: beckarepo-cli <repository-directory> | --json (stdin)".into()),
    };
    println!("{output}");
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
