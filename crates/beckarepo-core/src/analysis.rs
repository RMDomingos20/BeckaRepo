use crate::{parser::Index, AnalysisRequest, AnalysisResult, Edge, Node, Stats, SCHEMA_VERSION};
use std::collections::{HashMap, HashSet};

pub fn analyze(request: &AnalysisRequest) -> Result<AnalysisResult, String> {
    analyze_with_progress(request, |_, _| Ok(()))
}

pub fn analyze_with_progress(
    request: &AnalysisRequest,
    progress: impl FnMut(usize, usize) -> Result<(), String>,
) -> Result<AnalysisResult, String> {
    request.validate()?;
    let files = &request.files;
    let index = Index::new(files);
    index.validate()?;
    analyze_indexed(files, &index, |file| Ok(file.content.clone()), progress)
}

pub(crate) fn analyze_indexed(
    files: &[crate::RepositoryFile],
    index: &Index,
    mut load: impl FnMut(&crate::RepositoryFile) -> Result<Option<String>, String>,
    mut progress: impl FnMut(usize, usize) -> Result<(), String>,
) -> Result<AnalysisResult, String> {
    let mut packages = crate::packages::Builder::new();
    for file in files
        .iter()
        .filter(|f| crate::packages::is_manifest(&f.path) || crate::packages::is_lock(&f.path))
    {
        packages.load(&file.path, load(file)?.as_deref())?;
    }
    packages.build(|| progress(0, files.len()))?;
    let selected: Vec<_> = files
        .iter()
        .filter(|f| !crate::packages::is_lock(&f.path))
        .map(|f| crate::RepositoryFile {
            path: f.path.clone(),
            name: f.name.clone(),
            size: f.size,
            content: None,
        })
        .collect();
    let lookup: HashMap<_, _> = files.iter().map(|f| (f.path.as_str(), f)).collect();
    let mut result = analyze_relations(
        &selected,
        &mut packages,
        |file| {
            let loaded = crate::RepositoryFile {
                path: file.path.clone(),
                name: file.name.clone(),
                size: file.size,
                content: load(lookup[file.path.as_str()])?,
            };
            Ok(std::sync::Arc::new(index.extract(&loaded)))
        },
        progress,
    )?;
    result.packages = packages.finish()?;
    Ok(result)
}

pub(crate) fn analyze_relations(
    files: &[crate::RepositoryFile],
    packages: &mut crate::packages::Builder,
    mut relations: impl FnMut(
        &crate::RepositoryFile,
    ) -> Result<std::sync::Arc<crate::parser::Extraction>, String>,
    mut progress: impl FnMut(usize, usize) -> Result<(), String>,
) -> Result<AnalysisResult, String> {
    let paths: HashSet<_> = files.iter().map(|f| f.path.as_str()).collect();
    let mut edges = Vec::new();
    let mut reports = HashMap::new();
    let mut evidence = HashMap::new();
    let mut seen = HashSet::new();
    let mut graph_bytes = 0usize;
    let mut over_budget = false;
    let mut extraction_bytes = 0usize;
    let mut add = |source: &str, target: &str, kind: &str, detail: String| {
        if over_budget {
            return;
        }
        if !paths.contains(source) || !paths.contains(target) {
            return;
        }
        let id = serde_json::to_string(&(source, target, kind)).expect("string tuple");
        if seen.insert(id.clone()) {
            graph_bytes += id.len() + source.len() + target.len() + kind.len() + detail.len();
            if edges.len() >= 500_000 || graph_bytes > 128 * 1024 * 1024 {
                over_budget = true;
                return;
            }
            edges.push(Edge {
                id,
                source: source.into(),
                target: target.into(),
                kind: kind.into(),
                detail,
                bidirectional: false,
                evidence: None,
            });
        }
    };
    for (i, file) in files.iter().enumerate() {
        progress(i, files.len())?;
        let extracted = relations(file)?;
        packages.imports(file, &extracted.package_imports, &extracted.report)?;
        extraction_bytes += extracted.bytes();
        if extraction_bytes > 128 * 1024 * 1024 {
            return Err("Parser metadata exceeds 128 MiB".into());
        }
        reports.insert(file.path.clone(), extracted.report.clone());
        for rel in extracted.relations.iter() {
            if let Some(item) = &rel.evidence {
                evidence.insert(
                    (file.path.clone(), rel.target.clone(), rel.kind.clone()),
                    item.clone(),
                );
            }
            add(&file.path, &rel.target, &rel.kind, rel.detail.clone());
        }
    }
    let mut groups: Vec<Vec<&str>> = Vec::new();
    let mut group_index = HashMap::new();
    for file in files {
        let dir = file.path.rsplit_once('/').map_or("", |(dir, _)| dir);
        let base = file.name.split('.').next().unwrap_or(&file.name);
        let key = format!("{dir}/{base}");
        let i = *group_index.entry(key).or_insert_with(|| {
            groups.push(Vec::new());
            groups.len() - 1
        });
        groups[i].push(&file.path);
    }
    for group in groups.iter().filter(|g| g.len() > 1 && g.len() <= 8) {
        for pair in group.windows(2) {
            add(pair[0], pair[1], "sibling", "mesmo módulo".into());
        }
    }
    for file in files {
        if file.name.to_lowercase().starts_with("dockerfile") {
            let dir = file.path.rsplit_once('/').map_or("", |(dir, _)| dir);
            let parent = dir.rsplit_once('/').map_or("", |(parent, _)| parent);
            for candidate in [
                "docker-compose.yml",
                "docker-compose.yaml",
                "compose.yml",
                "compose.yaml",
                "docker-compose.prod.yml",
                "docker-compose.dev.yml",
            ] {
                for folder in [dir, parent] {
                    let target = if folder.is_empty() {
                        candidate.into()
                    } else {
                        format!("{folder}/{candidate}")
                    };
                    add(&file.path, &target, "docker", "Dockerfile ↔ Compose".into());
                }
            }
        }
    }
    for file in files {
        if file.path.contains(".github/workflows")
            && ["yml", "yaml"].contains(
                &file
                    .name
                    .rsplit('.')
                    .next()
                    .unwrap_or("")
                    .to_lowercase()
                    .as_str(),
            )
        {
            for target in [
                "package.json",
                "Makefile",
                "makefile",
                "build.gradle",
                "pom.xml",
                "Cargo.toml",
                "go.mod",
                "pyproject.toml",
                "setup.py",
            ] {
                add(&file.path, target, "ci-ref", "CI → build root".into());
            }
        }
    }
    if over_budget {
        return Err("Graph exceeds 500,000 edges or 128 MiB of strings".into());
    }
    for edge in &mut edges {
        edge.evidence =
            evidence.remove(&(edge.source.clone(), edge.target.clone(), edge.kind.clone()));
    }
    let mut weights: HashMap<&str, u64> = HashMap::new();
    for edge in &edges {
        *weights.entry(&edge.source).or_default() += 1;
        *weights.entry(&edge.target).or_default() += 1;
    }
    let nodes = files
        .iter()
        .map(|file| Node {
            id: file.path.clone(),
            path: file.path.clone(),
            name: file.name.clone(),
            size: file.size,
            weight: weights.get(file.path.as_str()).copied().unwrap_or(0),
            parsing: reports.remove(&file.path).unwrap_or_default(),
        })
        .collect();
    let stats = Stats {
        files: files.len(),
        edges: edges.len(),
        connected: weights.len(),
    };
    progress(files.len(), files.len())?;
    Ok(AnalysisResult {
        packages: Default::default(),
        schema_version: SCHEMA_VERSION,
        nodes,
        edges,
        stats,
    })
}
