//! Native filesystem scanning and dependency analysis, shared by the desktop and CLI.
mod analysis;
mod cargo_resolution;
pub mod packages;
mod parser;
pub mod policy;
pub mod repository;
mod rust_modules;
pub mod symbols;
pub mod syntax;
mod web_resolution;
pub use analysis::analyze;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisRequest {
    pub schema_version: u32,
    pub files: Vec<RepositoryFile>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepositoryFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub path: String,
    pub name: String,
    pub size: u64,
    pub weight: u64,
    #[serde(default)]
    pub parsing: syntax::Report,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub detail: String,
    pub bidirectional: bool,
    #[serde(default)]
    pub evidence: Option<syntax::Evidence>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Stats {
    pub files: usize,
    pub edges: usize,
    pub connected: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResult {
    pub schema_version: u32,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub stats: Stats,
    #[serde(default)]
    pub packages: packages::PackageGraph,
}

impl AnalysisRequest {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.schema_version != SCHEMA_VERSION {
            return Err("Unsupported analysis request");
        }
        if self.files.len() > policy::MAX_FILES {
            return Err("Analysis exceeds the file count limit");
        }
        let mut content_bytes = 0usize;
        let mut paths = HashSet::new();
        for file in &self.files {
            if policy::is_sensitive_path(&file.path) {
                return Err("File is excluded by the sensitive-file policy");
            }
            if let Some(content) = &file.content {
                if content.len() as u64 >= policy::MAX_CONTENT_BYTES {
                    return Err("Analysis text exceeds the per-file limit");
                }
                content_bytes = content_bytes
                    .checked_add(content.len())
                    .ok_or("Analysis content size overflow")?;
                if content_bytes > policy::MAX_TOTAL_CONTENT {
                    return Err("Analysis text exceeds the total content limit");
                }
            }
            let bytes = file.path.as_bytes();
            let drive = bytes.len() > 1 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':';
            if file.path.is_empty()
                || file.path.contains('\\')
                || drive
                || file
                    .path
                    .split('/')
                    .any(|part| part.is_empty() || part == "." || part == "..")
                || file.path.rsplit('/').next() != Some(file.name.as_str())
                || file.size > 9_007_199_254_740_991
                || !paths.insert(&file.path)
            {
                return Err("Invalid or duplicate repository file");
            }
        }
        Ok(())
    }
}

impl AnalysisResult {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.schema_version != SCHEMA_VERSION {
            return Err("Unsupported analysis result");
        }
        let ids: HashSet<_> = self.nodes.iter().map(|node| &node.id).collect();
        if ids.len() != self.nodes.len()
            || self
                .edges
                .iter()
                .any(|edge| !ids.contains(&edge.source) || !ids.contains(&edge.target))
        {
            return Err("Invalid graph endpoints");
        }
        let packages: HashSet<_> = self.packages.nodes.iter().map(|p| &p.id).collect();
        if packages.len() != self.packages.nodes.len()
            || packages.iter().any(|id| ids.contains(*id))
            || self.packages.edges.iter().any(|e| {
                !packages.contains(&e.target)
                    || !packages.contains(&e.source) && !ids.contains(&e.source)
            })
        {
            return Err("Invalid package graph endpoints");
        }
        Ok(())
    }
}
