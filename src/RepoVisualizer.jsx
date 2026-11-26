import { ProjectActions } from './components/ProjectActions.jsx';
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { isDesktop, setUnsavedChanges, onUnsavedClose, openRepository, onRepositoryDrop, cancelAnalysis, closeRepository, saveMarkdown } from "./services/analysisClient.js";
import { useRepositorySearch } from './hooks/useRepositorySearch.js';
import { useResizable } from "./hooks/useResizable";

import { useTranslation } from "./hooks/useTranslation";
import { SettingsModal } from "./components/SettingsModal";

import { ClusterControls } from "./components/ClusteringControls";
import { clusterGraph, buildNodeClusterMap, CLUSTER_STRATEGY } from "./utils/clustering";

import { TreeNode } from "./components/TreeNode";
import { FilePanel } from "./components/FilePanel";
import { CanvasGlobalGraph } from "./components/CanvasGlobalGraph";
import { RepositoryInsights } from './components/RepositoryInsights.jsx';

import { useTags } from "./hooks/useTags";
import { useLayout } from "./hooks/useLayout";
import { ConnectionFilter } from "./components/ConnectionFilter";
import { RepositoryOverview } from './components/RepositoryOverview.jsx';
import { OrbitFigure } from './components/OrbitFigure.jsx';
import { ManualModal } from "./components/ManualModal";
import { ContextMenu } from "./components/ContextMenu";

import { theme as T } from "./styles/theme.js";
import "./styles/app.css";

// ─── LOGO SVG INLINE (Nova estrutura) ─────────────────────────────────────────
function LogoIcon({ size = 22 }) {
  // Coordenadas ajustadas: Base vertical em 20, larguras crescentes e alturas variadas
  const NODES = [
    [10, 15],   // 1. Topo esquerdo (Espinha)
    [95, 15],   // 2. Topo direito
    [120, 48],  // 3. Curva superior (Gordinha)
    [52, 58],   // 4. Miolo superior (Desalinhado)
    [10, 85],   // 5. Centro esquerdo (Espinha)
    [95, 85],   // 6. Centro direito
    [120, 125], // 7. Curva inferior (Mais gordinha)
    [80, 135],  // 8. Miolo inferior (Desalinhado)
    [10, 170],  // 9. Base esquerda (Espinha)
    [95, 170]   // 10. Base direita
  ];

  // As conexões (EDGES) permanecem as mesmas que você enviou, pois a lógica está certa
  const EDGES = [
    [0,1], [0,3], [0,4], [1,2], [1,3], [2,3], [2,5], [3,4],
    [4,5], [4,7], [4,8], [5,6], [5,7], [6,7], [6,9], [7,8], [7,9], [8,9]
  ];

  return (
    // Viewbox aumentado para 135x185 para acomodar o design mais largo e alto
    <svg width={size} height={(size / 135) * 185} viewBox="0 0 135 185" fill="none" xmlns="http://www.w3.org/2000/svg">
      {EDGES.map(([a, b], i) => (
        <line key={`l-${i}`} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} stroke="var(--accent)" strokeWidth="2.5" opacity="0.5" />
      ))}
      {NODES.map(([cx, cy], i) => (
        <circle key={`c-${i}`} cx={cx} cy={cy} r={7.5} fill="var(--accent)" opacity="0.9" />
      ))}
    </svg>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function RepoVisualizer() {
  const [phase, setPhase] = useState('drop');
  const [loadError, setLoadError] = useState('');
  const [draftWarning, setDraftWarning] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [worktreeId, setWorktreeId] = useState('');
  const [legacyKey, setLegacyKey] = useState('');
  const [refreshSummary, setRefreshSummary] = useState(null);
  const [loadMsg, setLoadMsg] = useState('');
  const [loadPct, setLoadPct] = useState(0);

  const [graph, setGraph] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [view, setView] = useState('view_tree');
  const VIEWS = ['view_tree', 'view_global', 'view_term', 'view_analysis']

  const [search, setSearch] = useState('');
  const [termInput, setTermInput] = useState('');
  const [termQuery, setTermQuery] = useState('');

  const [activeEdgeTypes, setActiveEdgeTypes] = useState(new Set());
  const [clusterStrategy, setClusterStrategy] = useState(CLUSTER_STRATEGY.FOLDER);
  const [clusterDepth, setClusterDepth] = useState(1);
  const [showHulls, setShowHulls] = useState(true);
  const [isolatedCluster, setIsolatedCluster] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, node: null });

  const [stats, setStats] = useState({files:0, code:0, edges:0, connected:0, skippedDirs:[]});
  const [repoName, setRepoName] = useState('');

  const annotationEditor = useTags(worktreeId, graph?.snapshotId, legacyKey, selectedFile?.path);
  // A blocked navigation warning belongs only to the current unsaved edit session.
  if (draftWarning && !annotationEditor.hasUnsaved) setDraftWarning(false);
  const { showTree, showDetail, toggleTree, toggleDetail } = useLayout();

  const { t, lang } = useTranslation();
  const pt = lang === 'pt';
  const [showSettings, setShowSettings] = useState(false);



  const [showManual, setShowManual] = useState(false);

  const [treeW, treeHandle] = useResizable(260, 140, 600, false);
  const [detailW, detailHandle] = useResizable(380, 200, 700, true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTermQuery(termInput.trim());
    }, 600);
    return () => clearTimeout(timer);
  }, [termInput]);

  const nativeSearch = useRepositorySearch(graph?.snapshotId, termQuery);

  const termGraph = useMemo(() => {
    if (!graph || termQuery.length < 2) return null;
    const matchedNodeIds = new Set();
    const finalNodesMap = new Map();
    const finalEdges = [];

    for (const hit of nativeSearch.hits) {
      const node = graph.nodeMap.get(hit.path);
      if (node) { matchedNodeIds.add(node.id); finalNodesMap.set(node.id, { ...node, isMatch: true }); }
    }
    if (matchedNodeIds.size === 0) return { nodes:[], edges:[], matchCount: 0 };
    for (const e of graph.edges) {
      const sId = typeof e.source==='object' ? e.source.id : e.source;
      const tId = typeof e.target==='object' ? e.target.id : e.target;
      if (matchedNodeIds.has(sId) || matchedNodeIds.has(tId)) {
        finalEdges.push({...e});
        if (!finalNodesMap.has(sId)) finalNodesMap.set(sId, { ...graph.nodeMap.get(sId), isContext: true });
        if (!finalNodesMap.has(tId)) finalNodesMap.set(tId, { ...graph.nodeMap.get(tId), isContext: true });
      }
    }
    return { nodes: Array.from(finalNodesMap.values()), edges: finalEdges, matchCount: matchedNodeIds.size };
  }, [graph, termQuery, nativeSearch.hits]);

  const exportMarkdown = useCallback(async () => {
    if (!graph || !graph.tree) return;
    let md = `# Repositório: ${repoName}\n\n`;
    md += `**Arquivos Úteis:** ${stats.code}\n**Conexões mapeadas:** ${stats.edges}\n\n`;
    md += `## Estrutura de Pastas e Arquivos\n\n`;
    const traverse = (node, indent = '') => {
      let res = '';
      const dirs = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
      const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
      for (const d of dirs) { res += `${indent}- 📁 **${d.name}/**\n`; res += traverse(d, indent + '  '); }
      for (const f of files) { res += `${indent}- 📄 ${f.name}\n`; }
      return res;
    };
    md += traverse(graph.tree);
    try { await saveMarkdown(repoName, md); }
    catch (error) { setLoadError(String(error)); }
  }, [graph, repoName, stats]);

  const processingRef = useRef(false);
  const loadRepository = useCallback(async (path = null, refresh = false) => {
    if (processingRef.current || !isDesktop()) return;
    if (annotationEditor.hasUnsaved) { setDraftWarning(true); return; }
    processingRef.current = true;
    const previousGraph = graph;
    setLoadError(''); setWarnings([]); setPhase('loading'); setLoadPct(5);
    setLoadMsg(t('load_filter'));
    try {
      const snapshot = await openRepository(({ phase, completed, total }) => {
        setLoadMsg(t(phase === 'transfer' ? 'load_transfer' : phase === 'retry' ? 'load_retry' : phase === 'reconcile' ? 'load_reconcile' : phase === 'analyze' ? 'load_map' : 'load_read'));
        setLoadPct(phase === 'scan' ? 5 : (phase === 'read' ? 10 : phase === 'analyze' ? 35 : phase === 'reconcile' ? 60 : 80) + Math.round(completed / Math.max(1, total) * 18));
      }, path, refresh ? graph?.snapshotId : null);
      if (!snapshot) { setPhase(previousGraph ? 'main' : 'drop'); return; }
      const nextGraph = snapshot.graph;
      setRepoName(snapshot.name); setWorktreeId(snapshot.worktreeId); setLegacyKey(snapshot.legacyKey);
      setGraph(nextGraph); setSelectedFile(current => refresh ? nextGraph.nodeMap.get(current?.id) || null : null); setIsolatedCluster(null);
      setRefreshSummary(refresh ? snapshot.changes : null);
      if (!refresh) { setSearch(''); setTermInput(''); setTermQuery(''); setView('view_tree'); }
      setWarnings(snapshot.warnings);
      setActiveEdgeTypes(new Set(nextGraph.edges.map(edge => edge.type)));
      setStats({ ...nextGraph.stats, code: nextGraph.stats.files });
      setLoadPct(100); setPhase('main');
    } catch (error) {
      if (String(error) !== 'Analysis cancelled') setLoadError(String(error));
      setPhase(previousGraph ? 'main' : 'drop');
    } finally { processingRef.current = false; }
  }, [t, graph, annotationEditor.hasUnsaved, setIsolatedCluster, setSearch, setTermInput, setTermQuery, setView, setActiveEdgeTypes]);

  useEffect(() => {
    if (!isDesktop()) return;
    let disposed = false;
    let unlisten;
    onRepositoryDrop(path => { if (!disposed) loadRepository(path); }).then(stop => {
      if (disposed) stop(); else unlisten = stop;
    }).catch(error => setLoadError(String(error)));
    return () => { disposed = true; unlisten?.(); };
  }, [loadRepository]);

  useEffect(() => {
    if (isDesktop()) setUnsavedChanges(annotationEditor.hasUnsaved).catch(error => setLoadError(String(error)));
  }, [annotationEditor.hasUnsaved]);

  useEffect(() => {
    if (!isDesktop()) return;
    let disposed = false;
    let unlisten;
    onUnsavedClose(() => setDraftWarning(true)).then(stop => {
      if (disposed) stop(); else unlisten = stop;
    }).catch(error => setLoadError(String(error)));
    return () => { disposed = true; unlisten?.(); };
  }, [t]);

  const reset = async () => {
    if (annotationEditor.hasUnsaved) { setDraftWarning(true); return; }
    try { await closeRepository(); }
    catch (error) { setLoadError(String(error)); return; }
    setPhase('drop'); setGraph(null); setSelectedFile(null);
    setSearch(''); setTermInput(''); setTermQuery('');
    setIsolatedCluster(null); setRepoName(''); setWorktreeId(''); setLegacyKey(''); setRefreshSummary(null); setView('view_tree');
    setWarnings([]); setLoadError('');
    setStats({ files:0, code:0, edges:0, connected:0 });
  };

  const baseDisplayGraph = useMemo(() => {
    if (!graph) return null;
    return { ...graph, edges: graph.edges.filter(e => activeEdgeTypes.has(e.type)) };
  }, [graph, activeEdgeTypes]);

  const { clusters, nodeClusterMap } = useMemo(() => {
    if (!baseDisplayGraph || (view !== 'view_global' && !isolatedCluster)) return { clusters: new Map(), nodeClusterMap: new Map() };
    const cl = clusterGraph(baseDisplayGraph.nodes, baseDisplayGraph.edges, clusterStrategy, clusterDepth);
    return { clusters: cl, nodeClusterMap: buildNodeClusterMap(cl) };
  }, [baseDisplayGraph, clusterStrategy, clusterDepth, view, isolatedCluster]);

  const displayGraph = useMemo(() => {
    if (!baseDisplayGraph) return null;
    if (!isolatedCluster || !clusters.has(isolatedCluster)) return baseDisplayGraph;

    // Filtra o grafo para mostrar apenas o cluster isolado
    const clusterInfo = clusters.get(isolatedCluster);
    const clusterNodeIds = new Set(clusterInfo.nodes.map(n => n.id));
    const nodes = baseDisplayGraph.nodes
      .filter(n => clusterNodeIds.has(n.id))
      .map(n => {
        const cleanNode = { ...n };
        for (const key of ['x', 'y', 'vx', 'vy', 'fx', 'fy']) delete cleanNode[key];
        return cleanNode;
      });

    const edges = baseDisplayGraph.edges.filter(e => {
      const sId = typeof e.source === 'object' ? e.source.id : e.source;
      const tId = typeof e.target === 'object' ? e.target.id : e.target;
      return clusterNodeIds.has(sId) && clusterNodeIds.has(tId);
    });

    return { ...baseDisplayGraph, nodes, edges };
  }, [baseDisplayGraph, isolatedCluster, clusters]);

   const handleContextMenuOpen = ({ x, y, node }) => {
    setContextMenu({ visible: true, x, y, node });
  };

  const contextActions = {
    copyPath: (node) => {
      navigator.clipboard.writeText(node.path);
    },
    isolateNodeCluster: (node) => {
      const clusterId = nodeClusterMap?.get(node.id);
      if (clusterId) setIsolatedCluster(clusterId);
    },
    focusNode: (node) => {
      setSelectedFile(node);
      if (!showDetail) toggleDetail(); // Se o painel direito estiver fechado, abre ele
    },
    resetIsolation: () => setIsolatedCluster(null),
    toggleHulls: () => setShowHulls(prev => !prev),
    exportMd: exportMarkdown
  };

  // ── FASE: DROP ──────────────────────────────────────────────────────────────
  if (phase === 'drop') return (
    <main className="opening">
      <div className="opening-frame">
        <header><LogoIcon size={20}/><strong>BeckaRepo</strong></header>
        <div className="opening-body">
          <div>
            <h1>{pt ? 'Mapa do repositório' : 'Repository map'}</h1>
            <p>{pt ? 'Abra uma pasta para explorar seus arquivos e seguir as conexões entre eles.' : 'Open a folder to explore its files and follow the connections between them.'}</p>
            <button className="br-primary" onClick={() => loadRepository()} disabled={!isDesktop()}>{t('drop_btn')} <span aria-hidden="true">→</span></button>
            {isDesktop() && <small>{pt ? 'Ou arraste a pasta para esta janela.' : 'Or drag the folder into this window.'}</small>}
          </div>
          <figure><OrbitFigure/><figcaption>{pt ? 'Exemplo de conexões entre arquivos' : 'Example connections between files'}</figcaption></figure>
        </div>
        {!isDesktop() && <p role="status">{t('desktop_required')}</p>}
        {loadError && <p role="alert">{loadError}</p>}
        <footer><button className="br-btn" onClick={() => setShowManual(true)}>{t('hdr_guide')}</button>
          <button className="br-btn" onClick={() => setShowSettings(true)}>{t('data_settings')}</button></footer>
      </div>
      {showManual && <ManualModal onClose={() => setShowManual(false)}/>}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)}/>}
    </main>
  );
  // ── FASE: LOADING ────────────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <main className="opening"><section className="loading-card">
      <LogoIcon size={26}/><h1>{t('load_title')}</h1>
      <div className="loading-stage"><span role="status">{loadMsg}</span><strong>{loadPct}%</strong></div>
      <progress value={loadPct} max="100" aria-label={t('load_title')}/>
      <button className="br-btn" onClick={() => cancelAnalysis().catch(error => setLoadError(String(error)))}>{t('load_cancel')}</button>
    </section></main>
  );
  // ── FASE: MAIN ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      width:'100%', height:'100vh', background: T.bg,
      display:'flex', flexDirection:'column',
      overflow:'hidden', fontFamily: T.ui,
    }}>

      {/* ── HEADER ── */}
      <div className="br-toolbar" style={{
        minHeight: 52,
        background: T.bgDeep,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        flexWrap: 'wrap',
        paddingBlock: 8,
        flexShrink: 0,
        zIndex: 30,
      }}>
        {/* Toggle tree */}
        <button className="br-btn" onClick={toggleTree} aria-pressed={showTree} title={pt ? 'Explorador de arquivos' : 'File explorer'} style={{padding:'4px 8px'}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3h18v18H3zM9 3v18"/>
          </svg>
        </button>

        {/* Logo + repo name */}
        <div style={{display:'flex', alignItems:'center', gap:7, flexShrink:0}}>
          <LogoIcon size={18} />
          <span style={{
            color: T.accentHi,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.5px',
            textShadow: 'none',
          }}>
            {repoName}
          </span>
        </div>

        <div style={{flex:1}} />

        {/* View tabs */}
        <div style={{
          display: 'flex',
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {VIEWS.map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              className={`br-view-tab${view === v ? ' active' : ''}`}
              onClick={() => {
                setView(v);
                if (v !== 'view_term') { setTermInput(''); setTermQuery(''); }
              }}
            >
              {t(v)} {/* AQUI OCORRE A TRADUÇÃO */}
            </button>
          ))}
        </div>

        <button className="br-btn" onClick={() => setShowManual(true)}>{t('hdr_guide')}</button>
        <ProjectActions actions={[
          [t('refresh'), () => loadRepository(null, true)],
          [t('hdr_map'), exportMarkdown],
          [pt ? (showDetail ? 'Ocultar painel de detalhes' : 'Mostrar painel de detalhes') : (showDetail ? 'Hide file panel' : 'Show file panel'), toggleDetail],
          [t('data_settings'), () => setShowSettings(true)],
          [t('hdr_swap'), reset],
        ]}/>
      </div>

      {annotationEditor.hasUnsaved && <div style={{ padding: '5px 12px', fontSize: 11, color: T.amber, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {t('notes_drafts')}:
        {annotationEditor.unsavedPaths.map(path => <button className="br-btn" key={path} onClick={() => { setSelectedFile(graph.nodeMap.get(path)); if (!showDetail) toggleDetail(); }}>{path}</button>)}
      </div>}
      {refreshSummary && <div role="status" style={{ padding: '5px 12px', fontSize: 11, color: T.textMid }}>
        {t('refresh_summary')}: {refreshSummary.parsed} {t('refresh_parsed')}, {refreshSummary.reused} {t('refresh_reused')}, {refreshSummary.added} + / {refreshSummary.removed} −.
      </div>}
      {(loadError || draftWarning || warnings.length > 0) && <div role="status" style={{padding:'6px 12px', color:T.amber, fontSize:12}} title={warnings.slice(0, 20).join('\n')}>{loadError || (draftWarning ? t('notes_before_switch') : t('load_warnings') + ' ' + warnings.length)}</div>}

      {/* ── BARRAS DE FILTRO E CLUSTER ── */}
      {graph && view === 'view_global' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <details className="map-filters"><summary>{pt ? 'Filtros e agrupamento' : 'Filters and grouping'} <span>{t('cc_' + ({folder:'folder',semantic:'semantic',connectivity:'modules',type:'type'}[clusterStrategy]))} · {activeEdgeTypes.size} {activeEdgeTypes.size === 1 ? (pt ? 'tipo ativo' : 'active type') : (pt ? 'tipos ativos' : 'active types')}</span></summary>
          <ConnectionFilter graph={graph} activeTypes={activeEdgeTypes} setActiveTypes={setActiveEdgeTypes} />
          <ClusterControls
            strategy={clusterStrategy} setStrategy={setClusterStrategy}
            showHulls={showHulls} setShowHulls={setShowHulls}
            clusters={clusters} depth={clusterDepth} setDepth={setClusterDepth}
            isolatedCluster={isolatedCluster} setIsolatedCluster={setIsolatedCluster}
          /></details>
        </div>
      )}

      {/* ── LAYOUT PRINCIPAL (3 COLUNAS) ── */}
      <div style={{flex:1, display:'flex', overflow:'hidden'}}>

        {/* COLUNA ESQUERDA: Árvore */}
        {showTree && (
          <>
            <div className="repo-tree" style={{
              width: treeW, minWidth:0, flexShrink:0,
              background: T.bgPanel,
              borderRight: `1px solid ${T.border}`,
              display:'flex', flexDirection:'column', overflow:'hidden',
            }}>
              <div style={{
                padding:'7px 12px',
                borderBottom:`1px solid ${T.border}`,
                flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'space-between',
                background: T.bgDeep,
              }}>
                <span style={{color:T.textMid, fontSize: 11, letterSpacing:'1.5px', textTransform:'uppercase', fontWeight:700}}>
                  {t('tree_explorer')}
                </span>
                {search && (
                  <span style={{color:T.accent, fontSize: 11, letterSpacing:'0.5px'}}>
                    {t('tree_filtered')}
                  </span>
                )}
              </div>
              <input className="br-input tree-search" value={search} onChange={event => setSearch(event.target.value)}
                aria-label={t('hdr_search')} placeholder={t('hdr_search')}/>
              <div style={{flex:1, overflowY:'auto', padding:'4px 0'}}>
                {graph?.tree && (
                  <TreeNode
                    node={graph.tree}
                    depth={0}
                    selected={selectedFile}
                    onSelect={setSelectedFile}
                    searchQ={search}
                  />
                )}
              </div>
            </div>

            {/* Divisor arrastável */}
            <div className="br-resizer" onMouseDown={treeHandle}>
              <div className="br-resizer-line" />
            </div>
          </>
        )}

        {/* COLUNA CENTRAL: Grafo / Árvore vazia */}
        <div style={{
          flex:1, minWidth:0, overflow:'hidden',
          position:'relative', background: T.bg, display:'flex', flexDirection:'column',
        }}>
          {view==='view_analysis' && graph && <RepositoryInsights key={graph.snapshotId} graph={graph} selectedFile={selectedFile} onSelect={setSelectedFile} />}
          {view==='view_global' && displayGraph && (
            <CanvasGlobalGraph
              graph={displayGraph}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
              clusters={clusters}
              nodeClusterMap={nodeClusterMap}
              showClusters={showHulls}
              onContextMenu={handleContextMenuOpen}
            />
          )}

          {view === 'view_term' && <div className="term-search">
            <label>{t('hdr_incode')} <input className="br-input" maxLength={128} value={termInput}
              onChange={event => setTermInput(event.target.value)} placeholder={pt ? 'Pelo menos 2 caracteres' : 'At least 2 characters'}/></label>
          </div>}
          {view==='view_term' && termQuery.length >= 2 && <div role="status" style={{flexShrink:0, maxHeight:160, overflow:'auto', padding:'8px 12px', color:T.textMid, fontSize:12, borderBottom:`1px solid ${T.border}`}}>
            <div style={{color:T.textHi, marginBottom:4}}>{t('term_active')}: {termQuery}</div>
            {nativeSearch.error ? <span role="alert">{nativeSearch.error}</span> : <>
              {nativeSearch.busy ? t('search_running') : t('search_results')} {nativeSearch.hits.length} · {t('search_scanned')} {nativeSearch.scanned}/{nativeSearch.total}
              <span> · {t('search_coverage')} {nativeSearch.searchedText} · {t('search_skipped')} {nativeSearch.skippedText} · {t('search_changed')} {nativeSearch.changed} · {t('search_unreadable')} {nativeSearch.unreadable}</span>
              {nativeSearch.busy && <button className="br-btn" onClick={() => { setTermInput(''); setTermQuery(''); setView('view_tree'); }} style={{marginLeft:8}}>{t('load_cancel')}</button>}
              {nativeSearch.hasMore && !nativeSearch.busy && !nativeSearch.capped && <button className="br-btn" onClick={nativeSearch.loadMore} style={{marginLeft:8}}>{t('search_more')}</button>}
              {nativeSearch.capped && <span> · {t('search_cap')}</span>}
            </>}
          </div>}
          {view==='view_term' && termGraph && (
            termGraph.nodes.length > 0 ? (
              <div style={{flex:1, minHeight:0}}><CanvasGlobalGraph graph={termGraph} selectedFile={selectedFile} onSelect={setSelectedFile} isTermGraph /></div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:12,padding:20}}>
                <div style={{color:'#cf9d83', fontSize:12, textAlign:'center', lineHeight:2.5}}>

                  {nativeSearch.busy ? t('search_running') : nativeSearch.error ? t('search_failed') : t('empty_term_1')} <strong style={{color:'#fff'}}>{termQuery}</strong>.<br/>
                  <span style={{color:T.textMid}}>{t('empty_term_2')}</span>
                </div>
              </div>
            )
          )}

          {view==='view_tree' && graph && <RepositoryOverview graph={graph} name={repoName}
            onSelect={file => { setSelectedFile(file); if (!showDetail) toggleDetail(); }}
            onOpenGraph={() => setView('view_global')} />}
        </div>

        {/* COLUNA DIREITA: Detalhes */}
        {showDetail && selectedFile && (
          <>
            {/* Divisor arrastável */}
            <div className="br-resizer" onMouseDown={detailHandle}>
              <div className="br-resizer-line" />
            </div>

            <div className="file-details" style={{
              width: detailW, minWidth:0, flexShrink:0,
              background: T.bgPanel,
              borderLeft: `1px solid ${T.border}`,
              overflow:'hidden', display:'flex', flexDirection:'column',
            }}>
              <FilePanel
                file={selectedFile}
                graph={displayGraph}
                onSelect={setSelectedFile}
                termQuery={termQuery}
                annotationEditor={annotationEditor}
              />
            </div>
          </>
        )}
      </div>
        {showSettings && <SettingsModal snapshotId={graph?.snapshotId} onImported={annotationEditor.reload} hasUnsaved={annotationEditor.hasUnsaved} onRestored={() => setShowSettings(false)} onClose={() => setShowSettings(false)} />}
        {showManual && <ManualModal onClose={() => setShowManual(false)} />}
        <ContextMenu
          menu={contextMenu}
          closeMenu={() => setContextMenu({ ...contextMenu, visible: false })}
          actions={contextActions}
        />
      </div> // Fim do componente RepoVisualizer
  );
}
