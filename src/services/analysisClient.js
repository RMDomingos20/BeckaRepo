import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { assertResult } from '../core/contract.js';
import { getFileType, buildFolderTree } from '../utils/helpers.jsx';

export const isDesktop = isTauri;
let activeAnalysisId = null;

export function hydrateGraph(snapshot) {
  if (snapshot.schemaVersion !== 2 || typeof snapshot.snapshotId !== 'string') throw new Error('Unsupported repository snapshot');
  const result = snapshot.graph;
  assertResult(result);
  const fileMap = new Map(snapshot.files.map(file => [file.path, file]));
  const nodes = result.nodes.map(node => ({
    ...node, revision: fileMap.get(node.path)?.revision, contentState: fileMap.get(node.path)?.contentState,
    snapshotId: snapshot.snapshotId,
    repositoryId: snapshot.repositoryId, worktreeId: snapshot.worktreeId, ft: getFileType(node.name),
  }));
  return { ...result, snapshotId: snapshot.snapshotId, nodes, nodeMap: new Map(nodes.map(node => [node.id, node])), tree: buildFolderTree(nodes) };
}

export async function openRepository(onProgress, droppedPath = null, refreshSnapshotId = null) {
  const analysisId = crypto.randomUUID();
  activeAnalysisId = analysisId;
  const unlisten = await listen('analysis-progress', event => {
    if (event.payload.analysisId === analysisId) onProgress(event.payload);
  });
  try {
    const manifest = await invoke('open_repository', { droppedPath, analysisId, refreshSnapshotId });
    if (!manifest) return null;
    if (manifest.analysisId !== analysisId || !Array.isArray(manifest.counts) || manifest.counts.length !== 7) throw new Error('Invalid snapshot manifest');
    const sections = Array.from({ length: 7 }, () => []);
    const total = manifest.counts.reduce((sum, count) => sum + count, 0);
    let completed = 0;
    for (let section = 0; section < sections.length; section++) {
      let cursor = 0;
      while (true) {
        // Pull the next bounded batch only after consuming the previous one.
        const batch = await invoke('snapshot_batch', { snapshotId: manifest.snapshotId, analysisId, section, cursor });
        if (batch.analysisId !== analysisId || batch.snapshotId !== manifest.snapshotId || batch.section !== section
          || batch.cursor !== cursor || batch.nextCursor !== cursor + batch.items.length
          || batch.nextCursor > manifest.counts[section] || (!batch.done && batch.items.length === 0)) throw new Error('Invalid snapshot batch');
        sections[section].push(...batch.items);
        cursor = batch.nextCursor;
        completed += batch.items.length;
        onProgress({ analysisId, phase: 'transfer', completed, total });
        if (batch.done) {
          if (cursor !== manifest.counts[section]) throw new Error('Incomplete snapshot');
          break;
        }
      }
    }
    const snapshot = { ...manifest, files: sections[0], warnings: sections[3],
      graph: { schemaVersion: 1, nodes: sections[1], edges: sections[2], stats: manifest.stats,
        packages: { nodes: sections[4], edges: sections[5], diagnostics: sections[6], diagnosticsOmitted: manifest.packageDiagnosticsOmitted } } };
    const graph = hydrateGraph(snapshot);
    await invoke('finish_snapshot', { snapshotId: manifest.snapshotId, analysisId });
    return { ...snapshot, graph };
  } catch (error) {
    await invoke('cancel_analysis', { analysisId }).catch(() => {});
    throw error;
  } finally { unlisten(); if (activeAnalysisId === analysisId) activeAnalysisId = null; }
}

export const cancelAnalysis = () => activeAnalysisId ? invoke('cancel_analysis', { analysisId: activeAnalysisId }) : Promise.resolve();
export const closeRepository = () => invoke('close_repository');
export const setUnsavedChanges = unsaved => invoke('set_unsaved_changes', { unsaved });
export const onUnsavedClose = handler => listen('unsaved-changes', handler);
export const saveMarkdown = (name, content) => invoke('export_markdown', { name, content });
export const onRepositoryDrop = handler => listen('repository-dropped', event => handler(event.payload[0]));

const MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', svg:'image/svg+xml', webp:'image/webp', ico:'image/x-icon', mp3:'audio/mpeg', mp4:'video/mp4', wav:'audio/wav', ogg:'audio/ogg' };
export async function loadAsset(file) {
  const bytes = await invoke('read_asset', { snapshotId: file.snapshotId, path: file.path });
  const body = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes);
  return new Blob([body], { type: MIME[file.name.split('.').pop().toLowerCase()] || 'application/octet-stream' });
}

export const readFileContent = file => invoke('read_file_content', { snapshotId: file.snapshotId, path: file.path });
export const readFileSymbols = file => invoke('file_symbols', { snapshotId: file.snapshotId, path: file.path });
export const searchRepository = (snapshotId, queryId, query, cursor, limit) => invoke('search_repository', { snapshotId, queryId, query, cursor, limit });
export const cancelSearch = queryId => invoke('cancel_search', { queryId });
