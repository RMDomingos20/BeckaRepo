import { useMemo, useState } from 'react';
import { DenseGraphCanvas } from './DenseGraphCanvas.jsx';
import { projectFolders, collapseFolder } from '../utils/folderProjection.js';
import { useTranslation } from '../hooks/useTranslation';
import { theme as T } from '../styles/theme.js';

// The parent keys this view by snapshot. Filters keep navigation state; a new
// repository never inherits folder expansion from an unrelated snapshot.
export function FolderGraphCanvas({ ClassicView, ...props }) {
  const { t } = useTranslation();
  const [folders, setFolders] = useState(false), [expanded, setExpanded] = useState(new Set());
  const [page, setPage] = useState(0), [query, setQuery] = useState('');
  const [classic, setClassic] = useState(false);
  const graph = useMemo(() => folders ? projectFolders(props.graph, expanded, props.selectedFile?.id) : props.graph,
    [folders, props.graph, expanded, props.selectedFile?.id]);
  const groups = useMemo(() => graph.nodes.filter(n => n.isFolder && n.path.toLowerCase().includes(query.toLowerCase())), [graph, query]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(groups.length / 20) - 1));
  const expand = path => { setExpanded(old => new Set([...old, path])); setPage(0); };
  const select = node => { if (node?.isFolder) expand(node.path); else props.onSelect(node ? props.graph.nodeMap?.get(node.id) || node : null); };
  const bar = { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '6px 10px' };
  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <div className="map-rail">
      <span>{t('graph_detail')}</span>
      <button className="br-btn" aria-pressed={!folders && !(classic && ClassicView)} onClick={() => { setClassic(false); setFolders(false); }}>{t('graph_files')}</button>
      <button className="br-btn" aria-pressed={folders} onClick={() => { setClassic(false); setFolders(true); }}>{t('graph_folders')}</button>
      {ClassicView && <button className="br-btn" aria-pressed={classic} onClick={() => { setFolders(false); setClassic(true); }}>{t('graph_classic')}</button>}
      {folders && <button className="br-btn" disabled={!expanded.size} onClick={() => { setExpanded(new Set()); setPage(0); }}>{t('graph_collapse_all')}</button>}
    </div>
    {folders && <details style={{ padding: '4px 10px', color: T.textMid, fontSize: 11, maxHeight: 220, overflow: 'auto' }}>
      <summary>{t('graph_folder_navigation')} · {graph.folderSummary.folders} {t('graph_folders')} · {graph.folderSummary.files} {t('graph_files')}</summary>
      <p>{t('graph_folder_hint')}</p>
      <p>{graph.folderSummary.internalCount} {t('graph_internal_edges')} · {graph.folderSummary.sourceEdges} {t('graph_original_edges')}</p>
      {!!graph.folderSummary.omittedEdges && <p>{graph.folderSummary.omittedEdges} {t('graph_invalid_edges')}</p>}
      <div style={bar}>{[...expanded].sort().map(path => <button className="br-btn" key={path} onClick={() => { setExpanded(old => collapseFolder(old, path)); setPage(0); }}>{t('graph_collapse')} {path}</button>)}</div>
      <input className="br-input" aria-label={t('graph_find_folder')} placeholder={t('graph_find_folder')} value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/>
      <div style={bar}><button className="br-btn" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>←</button>
        <span>{currentPage + 1} / {Math.max(1, Math.ceil(groups.length / 20))} · {groups.length}</span>
        <button className="br-btn" disabled={(currentPage + 1) * 20 >= groups.length} onClick={() => setPage(currentPage + 1)}>→</button></div>
      {groups.slice(currentPage * 20, currentPage * 20 + 20).map(n => <div key={n.id} style={{ padding: '4px 0' }}>
        <button className="br-btn" onClick={() => expand(n.path)}>{n.path}</button> · {n.fileCount} {t('graph_files')} · {n.internalCount} {t('graph_internal_edges')} · {n.matchCount} {t('graph_matches')}
      </div>)}
    </details>}
    <div style={{ flex: 1, minHeight: 0 }}>{classic && ClassicView ? <ClassicView {...props} /> : <DenseGraphCanvas {...props} graph={graph} folderMode={folders} onSelect={select}
      onContextMenu={event => { if (!event.node?.isFolder) props.onContextMenu?.(event); }} />}</div>
  </div>;
}
