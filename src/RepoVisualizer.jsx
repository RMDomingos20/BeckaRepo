import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { CODE_EXTS, ASSET_EXTS, SKIP_DIRS_EXACT, IGNORE_FILES_EXACT } from "./utils/constants";
import { getFileType, buildFolderTree } from "./utils/helpers";
import { extractImports, buildIdIndex } from "./utils/parser"; 
import { useResizable } from "./hooks/useResizable";

import { ClusterControls } from "./components/ClusteringControls";
import { clusterGraph, buildNodeClusterMap, CLUSTER_STRATEGY } from "./utils/clustering";

import { TreeNode } from "./components/TreeNode";
import { FilePanel } from "./components/FilePanel";
import { CanvasGlobalGraph } from "./components/CanvasGlobalGraph";

import { useTags } from "./hooks/useTags";
import { useLayout } from "./hooks/useLayout";
import { ConnectionFilter } from "./components/ConnectionFilter";
import { ManualModal } from "./components/ManualModal";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
// Identidade BeckaRepo: preto profundo + rosa/lilás da logo
const T = {
  bg:       '#050810',
  bgDeep:   '#020408',
  bgPanel:  '#03060d',
  border:   '#1a1f35',
  borderHi: '#c084fc44',
  accent:   '#c084fc',   // lilás principal (cor da logo)
  accentHi: '#e879f9',   // rosa vivo (hover / destaque)
  accentDim: '#c084fc22',
  teal:     '#00d4aa',   // mantido para seleção/matches
  rose:     '#f43f5e',
  textHi:   '#f0e6ff',
  textMid:  '#8b7aa8',
  textLow:  '#3d3550',
  mono:     "'JetBrains Mono', monospace",
};

const FONT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${T.mono}; background: ${T.bg}; }
  ::-webkit-scrollbar { width: 5px; height: 5px; background: ${T.bg}; }
  ::-webkit-scrollbar-thumb { background: #2a1f45; border-radius: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }

  @keyframes spin {
    0%,100%{ opacity:1; transform:scale(1) rotate(0deg); }
    50%{ opacity:0.4; transform:scale(0.85) rotate(180deg); }
  }
  @keyframes fadeIn {
    from{ opacity:0; transform:translateY(10px); }
    to{ opacity:1; transform:translateY(0); }
  }
  @keyframes pulse-ring {
    0%{ transform:scale(0.95); box-shadow: 0 0 0 0 #c084fc44; }
    70%{ transform:scale(1); box-shadow: 0 0 0 12px transparent; }
    100%{ transform:scale(0.95); box-shadow: 0 0 0 0 transparent; }
  }
  @keyframes shimmer {
    0%{ background-position: -400px 0; }
    100%{ background-position: 400px 0; }
  }
  @keyframes node-float {
    0%, 100%{ transform: translateY(0px); }
    50%{ transform: translateY(-6px); }
  }

  /* Header buttons */
  .br-btn {
    background: transparent;
    border: 1px solid ${T.border};
    color: ${T.textMid};
    border-radius: 5px;
    padding: 4px 10px;
    font-size: 10px;
    font-family: ${T.mono};
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.8px;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: all 0.18s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .br-btn:hover {
    border-color: ${T.accent};
    color: ${T.accentHi};
    background: ${T.accentDim};
  }
  .br-btn.danger:hover {
    border-color: ${T.rose};
    color: ${T.rose};
    background: #f43f5e18;
  }
  .br-btn.primary:hover {
    border-color: ${T.teal};
    color: ${T.teal};
    background: #00d4aa18;
  }

  /* View tabs */
  .br-view-tab {
    padding: 4px 14px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: ${T.textMid};
    font-size: 10px;
    font-family: ${T.mono};
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 1px;
    text-transform: uppercase;
    transition: all 0.18s ease;
  }
  .br-view-tab.active {
    color: ${T.accent};
    border-bottom-color: ${T.accent};
    background: ${T.accentDim};
  }
  .br-view-tab:hover:not(.active) {
    color: ${T.textHi};
    background: #ffffff06;
  }

  /* Input style */
  .br-input {
    background: ${T.bgDeep};
    border: 1px solid ${T.border};
    border-radius: 5px;
    padding: 4px 10px;
    color: ${T.textHi};
    font-size: 10px;
    font-family: ${T.mono};
    outline: none;
    transition: border-color 0.18s ease;
  }
  .br-input:focus {
    border-color: ${T.accent};
  }
  .br-input::placeholder {
    color: ${T.textLow};
  }

  /* Resizer handle */
  .br-resizer {
    width: 4px;
    cursor: col-resize;
    background: transparent;
    position: relative;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }
  .br-resizer:hover { background: ${T.accentDim}; }
  .br-resizer-line {
    width: 1px;
    height: 35%;
    background: ${T.border};
    border-radius: 1px;
    transition: background 0.2s, height 0.2s;
  }
  .br-resizer:hover .br-resizer-line {
    background: ${T.accent};
    height: 60%;
  }

  /* Stat pill */
  .br-stat {
    font-size: 10px;
    color: ${T.textMid};
    white-space: nowrap;
    flex-shrink: 0;
  }
  .br-stat strong {
    color: ${T.accent};
    font-weight: 700;
  }
  .br-header {
  -webkit-app-region: drag;
}

/* IMPORTANTE: Tudo que for clicável dentro do header precisa de 'no-drag' */
.br-btn, 
.br-input, 
.br-view-tab,
.br-logo-container {
  -webkit-app-region: no-drag;
}

`;

const VIEWS = ['árvore', 'grafo global', 'grafo termo'];

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
        <line key={`l-${i}`} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} stroke="#c084fc" strokeWidth="2.5" opacity="0.5" />
      ))}
      {NODES.map(([cx, cy], i) => (
        <circle key={`c-${i}`} cx={cx} cy={cy} r={7.5} fill="#c084fc" opacity="0.9" />
      ))}
    </svg>
  );
}

// ─── LOGO INTERATIVA COM FÍSICA (Nova estrutura) ──────────────────────────────
function InteractiveLogo({ size = 120, interactive = false, isAnimating = false }) {
  const svgRef = useRef(null);
  const circlesRef = useRef([]);
  const linesRef = useRef([]);

  // Posições e índices idênticos à sua arquitetura de 10 nós
  const HOME_NODES = useMemo(() => [
    { id: 0, x: 10, y: 15 },   // 1. Topo esquerdo (Espinha)
    { id: 1, x: 95, y: 15 },   // 2. Topo direito
    { id: 2, x: 120, y: 48 },  // 3. Curva superior (Gordinha)
    { id: 3, x: 52, y: 58 },   // 4. Miolo superior (Desalinhado)
    { id: 4, x: 10, y: 85 },   // 5. Centro esquerdo (Espinha)
    { id: 5, x: 95, y: 85 },   // 6. Centro direito
    { id: 6, x: 120, y: 125 }, // 7. Curva inferior (Mais gordinha)
    { id: 7, x: 80, y: 135 },  // 8. Miolo inferior (Desalinhado)
    { id: 8, x: 10, y: 170 },  // 9. Base esquerda (Espinha)
    { id: 9, x: 95, y: 170 }   // 10. Base direita
  ], []);

  const LINKS = useMemo(() => [
    [0,1], [0,3], [0,4],
    [1,2], [1,3],
    [2,3], [2,5],
    [3,4],
    [4,5], [4,7], [4,8],
    [5,6], [5,7],
    [6,7], [6,9],
    [7,8], [7,9],
    [8,9]
  ], []);

  useEffect(() => {
    let raf;
    let dragged = -1;
    let mouse = { x: 0, y: 0 };
    
    const nodes = HOME_NODES.map(n => ({ ...n, cx: n.x, cy: n.y, vx: 0, vy: 0 }));

    const getSVGCoords = (e) => {
      if (!svgRef.current) return mouse;
      const svg = svgRef.current;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX || (e.touches && e.touches[0].clientX);
      pt.y = e.clientY || (e.touches && e.touches[0].clientY);
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      return { x: loc.x, y: loc.y };
    };

    const onPointerDown = (e) => {
      if (!interactive) return;
      const coords = getSVGCoords(e);
      let closest = -1;
      let minD = 15; 
      nodes.forEach((n, i) => {
        const dx = n.cx - coords.x, dy = n.cy - coords.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < minD) { minD = d; closest = i; }
      });
      if (closest !== -1) {
        dragged = closest;
        mouse = coords;
      }
    };

    const onPointerMove = (e) => {
      if (dragged !== -1) mouse = getSVGCoords(e);
    };

    const onPointerUp = () => { dragged = -1; };

    if (interactive && svgRef.current) {
      const svg = svgRef.current;
      svg.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }

    const tick = () => {
      const time = Date.now() / 300;

      nodes.forEach((n, i) => {
        let targetX = n.x;
        let targetY = n.y;

        if (dragged === i) {
          targetX = mouse.x;
          targetY = mouse.y;
        } else if (isAnimating) {
          // Fase Morphing: cada bolinha balança individualmente criando fluidez
          targetX += Math.sin(time + i * 1.5) * 20;
          targetY += Math.cos(time + i * 2.0) * 20;
        }

        const ax = (targetX - n.cx) * (isAnimating ? 0.05 : 0.15);
        const ay = (targetY - n.cy) * (isAnimating ? 0.05 : 0.15);
        
        n.vx = (n.vx + ax) * 0.75;
        n.vy = (n.vy + ay) * 0.75;
        n.cx += n.vx;
        n.cy += n.vy;

        if (circlesRef.current[i]) {
          circlesRef.current[i].setAttribute('cx', n.cx);
          circlesRef.current[i].setAttribute('cy', n.cy);
        }
      });

      LINKS.forEach(([a, b], i) => {
        if (linesRef.current[i]) {
          linesRef.current[i].setAttribute('x1', nodes[a].cx);
          linesRef.current[i].setAttribute('y1', nodes[a].cy);
          linesRef.current[i].setAttribute('x2', nodes[b].cx);
          linesRef.current[i].setAttribute('y2', nodes[b].cy);
        }
      });

      raf = requestAnimationFrame(tick);
    };
    
    tick();

    return () => {
      cancelAnimationFrame(raf);
      if (interactive && svgRef.current) {
        svgRef.current.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      }
    };
  }, [interactive, isAnimating, HOME_NODES, LINKS]);

  return (
    <svg 
      ref={svgRef} 
      width={size} 
      height={(size / 135) * 185} // Ajuste de proporção aqui
      viewBox="0 0 135 185"       // Viewbox novo
      style={{ overflow: 'visible', cursor: interactive ? 'grab' : 'default', touchAction: 'none' }}
    >
      {LINKS.map((_, i) => (
        <line key={`l-${i}`} ref={el => linesRef.current[i] = el} stroke="#c084fc" strokeWidth="2.5" opacity="0.6" />
      ))}
      {HOME_NODES.map((_, i) => (
        <circle 
          key={`c-${i}`} 
          ref={el => circlesRef.current[i] = el} 
          r={interactive ? 9 : 7} 
          fill="#c084fc" 
          opacity="0.9"
          style={{ transition: 'r 0.2s', cursor: interactive ? 'grab' : 'default' }}
          onMouseEnter={(e) => { if (interactive) e.target.setAttribute('r', 12) }}
          onMouseLeave={(e) => { if (interactive) e.target.setAttribute('r', 9) }}
        />
      ))}
    </svg>
  );
}

// ─── DROP SCREEN BACKGROUND (rede animada) ────────────────────────────────────
function NetworkBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const pts = Array.from({length: 55}, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: 1.5 + Math.random() * 2,
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(192,132,252,${0.12 * (1 - dist/130)})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = '#c084fc55';
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas ref={canvasRef} style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', opacity: 0.7
    }} />
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function RepoVisualizer() {
  const [phase, setPhase] = useState('drop');
  const [dragging, setDragging] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const [loadPct, setLoadPct] = useState(0);
  
  const [graph, setGraph] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [view, setView] = useState('árvore');
  
  const [search, setSearch] = useState('');
  const [termInput, setTermInput] = useState('');
  const [termQuery, setTermQuery] = useState('');

  const [activeEdgeTypes, setActiveEdgeTypes] = useState(new Set());
  const [clusterStrategy, setClusterStrategy] = useState(CLUSTER_STRATEGY.FOLDER);
  const [clusterDepth, setClusterDepth] = useState(1);
  const [showHulls, setShowHulls] = useState(true);
  const [isolatedCluster, setIsolatedCluster] = useState(null);

  const [stats, setStats] = useState({files:0, code:0, edges:0, connected:0, skippedDirs:[]});
  const [repoName, setRepoName] = useState('');

  const { tagsData, addTag, removeTag, setNote } = useTags(repoName);
  const { showTree, showDetail, toggleTree, toggleDetail } = useLayout();
  
  const inputRef = useRef(null);

  const [showManual, setShowManual] = useState(false);

  const [treeW, treeHandle] = useResizable(260, 140, 600, false);
  const [detailW, detailHandle] = useResizable(380, 200, 700, true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTermQuery(termInput);
      if (termInput.length >= 2) setView('grafo termo');
      else if (view === 'grafo termo') setView('árvore');
    }, 600);
    return () => clearTimeout(timer);
  }, [termInput, view]);

  const termGraph = useMemo(() => {
    if (!graph || termQuery.length < 2) return null;
    const query = termQuery.toLowerCase();
    const matchedNodeIds = new Set();
    const finalNodesMap = new Map();
    const finalEdges = [];

    for (const n of graph.nodes) {
      if ((n.content && n.content.toLowerCase().includes(query)) || n.name.toLowerCase().includes(query)) {
        matchedNodeIds.add(n.id);
        finalNodesMap.set(n.id, { ...n, isMatch: true }); 
      }
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
  }, [graph, termQuery]);

  const exportMarkdown = useCallback(() => {
    if (!graph || !graph.tree) return;
    let md = `# Repositório: ${repoName}\n\n`;
    md += `**Arquivos Úteis:** ${stats.code}\n**Conexões mapeadas:** ${stats.edges}\n\n`;
    md += `## Estrutura de Pastas e Arquivos\n\n`;
    const traverse = (node, indent = '') => {
      let res = '';
      const dirs = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
      const files = node.files.sort((a, b) => a.name.localeCompare(b.name));
      for (const d of dirs) { res += `${indent}- 📁 **${d.name}/**\n`; res += traverse(d, indent + '  '); }
      for (const f of files) { res += `${indent}- 📄 ${f.name}\n`; }
      return res;
    };
    md += traverse(graph.tree);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${repoName.replace(/[^a-z0-9]/gi, '_')}_mapa.md`; a.click();
    URL.revokeObjectURL(url);
  }, [graph, repoName, stats]);

  const buildGraph = useCallback((fileData) => {
    const pathSet = new Set(fileData.map(f => f.path));
    const nodeMap = new Map();
    for (const f of fileData) nodeMap.set(f.path, {id:f.path, name:f.name, path:f.path, size:f.size, content:f.content, ft:getFileType(f.name), weight: 0, fileRef: f.fileRef});
    setLoadMsg('Indexando IDs de protótipos e pastas RSI...');
    const idIndex = buildIdIndex(fileData);
    const edgeMap = new Map();
    let idx = 0;
    for (const f of fileData) {
      idx++;
      if (idx % 1000 === 0) setLoadMsg(`Analisando conexões ${idx}/${fileData.length}...`);
      if (!f.content) continue;
      for (const rel of extractImports(f.path, f.content, pathSet, idIndex)) {
        if (!nodeMap.has(rel.target)) continue;
        const k = f.path+'→'+rel.target;
        const rk = rel.target+'→'+f.path;
        if (edgeMap.has(k)) { edgeMap.get(k).detail += ', '+rel.detail; }
        else if (edgeMap.has(rk)) { edgeMap.get(rk).bidirectional=true; }
        else edgeMap.set(k, {id:k, source:f.path, target:rel.target, type:rel.type, detail:rel.detail, bidirectional:false});
      }
    }
    const addStructuralEdge = (srcPath, tgtPath, type, detail) => {
      if (!nodeMap.has(srcPath) || !nodeMap.has(tgtPath) || srcPath === tgtPath) return;
      const k = srcPath+'→'+tgtPath, rk = tgtPath+'→'+srcPath;
      if (!edgeMap.has(k) && !edgeMap.has(rk)) edgeMap.set(k, { id:k, source:srcPath, target:tgtPath, type, detail, bidirectional:false });
    };
    const byBaseName = new Map();
    for (const f of fileData) {
      const parts = f.path.split('/'), fileName = parts[parts.length-1];
      const base = fileName.includes('.') ? fileName.slice(0, fileName.indexOf('.')) : fileName;
      const folder = parts.slice(0,-1).join('/');
      const key = folder+'/'+base.replace(/\.(test|spec|stories|module|component|service|controller|repository|dto)$/, '');
      if (!byBaseName.has(key)) byBaseName.set(key, []);
      byBaseName.get(key).push(f.path);
    }
    for (const [, group] of byBaseName) {
      if (group.length > 1 && group.length <= 8) {
        for (let i = 0; i < group.length-1; i++) addStructuralEdge(group[i], group[i+1], 'sibling', 'mesmo módulo');
      }
    }
    for (const f of fileData) {
      if (f.name.toLowerCase().startsWith('dockerfile')) {
        const dir = f.path.split('/').slice(0,-1).join('/');
        for (const candidate of ['docker-compose.yml','docker-compose.yaml','compose.yml','compose.yaml','docker-compose.prod.yml','docker-compose.dev.yml']) {
          const inSameDir = dir ? dir+'/'+candidate : candidate;
          const inParent = dir.includes('/') ? dir.split('/').slice(0,-1).join('/')+'/'+candidate : candidate;
          if (pathSet.has(inSameDir)) addStructuralEdge(f.path, inSameDir, 'docker', 'Dockerfile ↔ Compose');
          if (pathSet.has(inParent)) addStructuralEdge(f.path, inParent, 'docker', 'Dockerfile ↔ Compose');
        }
      }
    }
    for (const f of fileData) {
      if (f.path.includes('.github/workflows') && ['yml','yaml'].includes(f.name.split('.').pop()?.toLowerCase())) {
        for (const rootCandidate of ['package.json','Makefile','makefile','build.gradle','pom.xml','Cargo.toml','go.mod','pyproject.toml','setup.py']) {
          if (pathSet.has(rootCandidate)) addStructuralEdge(f.path, rootCandidate, 'ci-ref', 'CI → build root');
        }
      }
    }
    const edges = Array.from(edgeMap.values());
    for (const e of edges) {
      const srcNode = nodeMap.get(e.source), tgtNode = nodeMap.get(e.target);
      if (srcNode) srcNode.weight += 1;
      if (tgtNode) tgtNode.weight += 1;
    }
    const allTypes = new Set(edges.map(e => e.type));
    setActiveEdgeTypes(allTypes);
    const nodes = Array.from(nodeMap.values());
    const conn = new Set(edges.flatMap(e=>[e.source,e.target]));
    const tree = buildFolderTree(nodes);
    setGraph({ nodes, edges, nodeMap, tree });
    setStats(s => ({...s, code:nodes.length, edges:edges.length, connected:conn.size}));
  }, []);

  // --- INÍCIO DA NOVA FUNÇÃO PROCESS FILES ---
  const processFiles = useCallback(async (rawFiles) => {
    try {
      setPhase('loading');
      setLoadPct(5);

      const MAX = 500 * 1024; // 500KB
      const BATCH_SIZE = 80;  // Arquivos lidos em paralelo por lote

      setLoadMsg(`Filtrando ${rawFiles.length} arquivos...`);

      const candidates = [];
      for (const f of rawFiles) {
        const path = (f.webkitRelativePath || f._path || f.name).replace(/\\/g, '/');
        const pathParts = path.split('/');

        if (pathParts.some(p => SKIP_DIRS_EXACT.has(p.toLowerCase()))) continue;

        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        const isCode = CODE_EXTS.has(ext) || ['dockerfile', 'makefile'].includes(f.name.toLowerCase());
        const isAsset = ASSET_EXTS.has(ext);

        if (!isCode && !isAsset) continue;
        if (IGNORE_FILES_EXACT.has(f.name.toLowerCase())) continue;

        candidates.push({ f, path, isCode });
      }

      if (!candidates.length) {
        alert('Nenhum arquivo de código ou asset compatível foi encontrado nesta pasta.');
        setPhase('drop');
        return;
      }

      setRepoName(candidates[0].path.split('/')[0] || 'Repositório');
      setLoadPct(15);

      const fd = [];
      const totalBatches = Math.ceil(candidates.length / BATCH_SIZE);

      for (let b = 0; b < totalBatches; b++) {
        const batch = candidates.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

        const batchPct = 15 + Math.round((b / totalBatches) * 35);
        setLoadMsg(`Lendo arquivos ${Math.min((b + 1) * BATCH_SIZE, candidates.length)}/${candidates.length}...`);
        setLoadPct(batchPct);

        await new Promise(r => setTimeout(r, 0));

        const results = await Promise.all(
          batch.map(async ({ f, path, isCode }) => {
            let content = null;
            if (isCode && f.size < MAX) {
              try { content = await f.text(); }
              catch (readErr) { console.warn(`Não foi possível ler: ${path}`, readErr); }
            }
            return { path, name: f.name, content, size: f.size, fileRef: f };
          })
        );

        fd.push(...results);
      }

      setLoadMsg(`Mapeando conexões de ${fd.length} arquivos...`);
      setLoadPct(55);
      await new Promise(r => setTimeout(r, 20));

      buildGraph(fd);

      setLoadPct(100);
      await new Promise(r => setTimeout(r, 60));
      setPhase('main');

    } catch (error) {
      console.error('[BeckaRepo] Erro crítico no processamento:', error);
      alert('Houve um erro ao processar o repositório. Verifique o console para mais detalhes.');
      setPhase('drop');
    }
  }, [buildGraph]);
  // --- FIM DA NOVA FUNÇÃO PROCESS FILES ---

  const onInput = useCallback(async e => await processFiles(Array.from(e.target.files)), [processFiles]);
  
  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await processFiles(files);
    }
  }, [processFiles]);
  
  const reset = () => { 
    setPhase('drop'); setGraph(null); setSelectedFile(null);
    setPhase('drop'); setGraph(null); setSelectedFile(null); 
    setSearch(''); setTermInput(''); setTermQuery(''); 
    setStats({files:0,code:0,edges:0,connected:0,skipped:0,skippedDirs:[]}); 
  };

  const baseDisplayGraph = useMemo(() => {
    if (!graph) return null;
    return { ...graph, edges: graph.edges.filter(e => activeEdgeTypes.has(e.type)) };
  }, [graph, activeEdgeTypes]);

  const { clusters, nodeClusterMap } = useMemo(() => {
    if (!baseDisplayGraph) return { clusters: new Map(), nodeClusterMap: new Map() };
    const cl = clusterGraph(baseDisplayGraph.nodes, baseDisplayGraph.edges, clusterStrategy, clusterDepth);
    return { clusters: cl, nodeClusterMap: buildNodeClusterMap(cl) };
  }, [baseDisplayGraph, clusterStrategy, clusterDepth]);

  const displayGraph = useMemo(() => {
    if (!baseDisplayGraph) return null;
    if (!isolatedCluster || !clusters.has(isolatedCluster)) return baseDisplayGraph;

    // Filtra o grafo para mostrar apenas o cluster isolado
    const clusterInfo = clusters.get(isolatedCluster);
    const clusterNodeIds = new Set(clusterInfo.nodes.map(n => n.id));
    const nodes = baseDisplayGraph.nodes.filter(n => clusterNodeIds.has(n.id));
    const edges = baseDisplayGraph.edges.filter(e => {
      const sId = typeof e.source === 'object' ? e.source.id : e.source;
      const tId = typeof e.target === 'object' ? e.target.id : e.target;
      return clusterNodeIds.has(sId) && clusterNodeIds.has(tId);
    });
    return { ...baseDisplayGraph, nodes, edges };
  }, [baseDisplayGraph, isolatedCluster, clusters]);

  // ── FASE: DROP ──────────────────────────────────────────────────────────────
  if (phase === 'drop') return (
    <div
      onDragOver={e=>{e.preventDefault();setDragging(true);}}
      onDragLeave={()=>setDragging(false)}
      onDrop={onDrop}
      style={{
        width:'100%', height:'100vh',
        background: T.bg,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily: T.mono,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{FONT_CSS}</style>
      <NetworkBackground />

      {/* Radial glow */}
      <div style={{
        position:'absolute', top:'50%', left:'50%',
        transform:'translate(-50%,-50%)',
        width:600, height:600,
        background:'radial-gradient(circle, #c084fc0a 0%, transparent 70%)',
        pointerEvents:'none',
      }} />

      <input
        ref={el=>{inputRef.current=el; if(el){el.setAttribute('webkitdirectory',''); el.setAttribute('directory','');}}}
        type="file" multiple onChange={onInput} style={{display:'none'}}
      />

      <div style={{
        border: `1.5px solid ${dragging ? T.accent : T.border}`,
        borderRadius: 16,
        padding: '52px 72px',
        textAlign: 'center',
        background: dragging ? '#c084fc08' : '#03060dee',
        backdropFilter: 'blur(12px)',
        transition: 'all 0.25s ease',
        maxWidth: 500,
        animation: 'fadeIn 0.6s ease',
        position: 'relative',
        boxShadow: dragging ? `0 0 40px #c084fc22, inset 0 0 60px #c084fc08` : `0 0 60px #00000080`,
      }}>
        {/* Logo Interativa */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 120,
          marginBottom: 16,
          animation: dragging ? 'pulse-ring 1.5s infinite' : 'none',
        }} title="Você pode puxar as bolinhas!">
          <InteractiveLogo size={80} interactive={true} />
        </div>

        <div style={{
          color: T.textHi,
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '5px',
          marginBottom: 6,
        }}>
          BECKAREPO
        </div>

        <div style={{
          color: T.textMid,
          fontSize: 10,
          marginBottom: 6,
          letterSpacing: '1.5px',
        }}>
          Árvore · Grafo Global · Busca In-Code
        </div>

        <div style={{
          color: T.textLow,
          fontSize: 9,
          marginBottom: 32,
          letterSpacing: '0.5px',
        }}>
          {dragging ? '✦ Solte para analisar ✦' : 'Solte sua pasta aqui ou selecione manualmente.'}
        </div>

        <button
          onClick={()=>inputRef.current?.click()}
          style={{
            background: 'linear-gradient(135deg, #c084fc, #e879f9)',
            color: '#0d0618',
            border: 'none',
            borderRadius: 8,
            padding: '11px 36px',
            fontSize: 11,
            fontFamily: T.mono,
            fontWeight: 800,
            cursor: 'pointer',
            letterSpacing: '2px',
            boxShadow: '0 4px 24px #c084fc44',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { e.target.style.transform='translateY(-2px)'; e.target.style.boxShadow='0 8px 32px #c084fc66'; }}
          onMouseLeave={e => { e.target.style.transform='translateY(0)'; e.target.style.boxShadow='0 4px 24px #c084fc44'; }}
        >
          SELECIONAR PASTA
        </button>

        {/* Bottom hint */}
        <div style={{
          marginTop: 28,
          display: 'flex',
          gap: 16,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          {['React', 'TypeScript', 'Python', 'Go', 'Rust', 'C#'].map(lang => (
            <span key={lang} style={{color:T.textLow, fontSize:8, letterSpacing:'1px'}}>{lang}</span>
          ))}
        </div>
      </div>
    </div>
  );

  // ── FASE: LOADING ────────────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <div style={{
      width:'100%', height:'100vh', background: T.bg,
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      fontFamily: T.mono, gap: 20,
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{FONT_CSS}</style>
      <NetworkBackground />

      {/* Loading Animation (Morphing Physics) */}
      <div style={{
        height: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        filter: 'drop-shadow(0 0 16px #c084fc88)',
        marginBottom: 10
      }}>
        <InteractiveLogo size={60} isAnimating={true} />
      </div>

      <div style={{color: T.textHi, fontSize: 13, fontWeight: 700, letterSpacing: '2px'}}>
        MAPEANDO REPOSITÓRIO
      </div>

      <div style={{color: T.textMid, fontSize: 10, minHeight: 16, letterSpacing: '0.5px'}}>
        {loadMsg}
      </div>

      {/* Progress bar */}
      <div style={{
        width: 300, height: 3,
        background: '#0d0a1a',
        borderRadius: 2,
        overflow: 'hidden',
        border: '1px solid #1a1030',
      }}>
        <div style={{
          height: '100%',
          width: `${loadPct}%`,
          background: 'linear-gradient(90deg, #c084fc, #e879f9)',
          borderRadius: 2,
          transition: 'width 0.4s ease',
          boxShadow: '0 0 8px #c084fc88',
        }} />
      </div>

      <div style={{color: T.textLow, fontSize: 9}}>{loadPct}%</div>
    </div>
  );

  // ── FASE: MAIN ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      width:'100%', height:'100vh', background: T.bg,
      display:'flex', flexDirection:'column',
      overflow:'hidden', fontFamily: T.mono,
    }}>
      <style>{FONT_CSS}</style>

      {/* ── HEADER ── */}
      <div style={{
        height: 46,
        background: T.bgDeep,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        paddingRight: 140,
        flexShrink: 0,
        zIndex: 30,
      }}>
        {/* Toggle tree */}
        <button className="br-btn" onClick={toggleTree} title="Alternar Painel Lateral" style={{padding:'4px 8px'}}>
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
            textShadow: '0 0 12px #c084fc55',
          }}>
            {repoName}
          </span>
        </div>

        <div style={{width:1, height:18, background:T.border, flexShrink:0}} />

        {/* Stats */}
        <span className="br-stat">
          <strong>{stats.code}</strong> arqs · <strong>{stats.edges}</strong> conexões
        </span>

        <div style={{flex:1}} />

        {/* View tabs */}
        <div style={{
          display: 'flex',
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {VIEWS.map((v, i) => (
            <button
              key={v}
              className={`br-view-tab${view===v ? ' active' : ''}`}
              onClick={() => {
                setView(v);
                if (v !== 'grafo termo') { setTermInput(''); setTermQuery(''); }
              }}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Search inputs */}
        <input
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Nome arquivo..."
          className="br-input"
          style={{width:130}}
        />
        <input
          value={termInput}
          onChange={e=>setTermInput(e.target.value)}
          placeholder="✦ In-Code / Relações..."
          className="br-input"
          style={{
            width:165,
            borderColor: termInput ? '#f43f5e55' : T.border,
            color: termInput ? '#f43f5e' : T.textHi,
          }}
        />

        {/* Export MD */}
        <button className="br-btn primary" onClick={exportMarkdown} title="Baixar mapa em formato Markdown">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          MAPA MD
        </button>
        
        <button 
          className="br-btn" 
          onClick={() => setShowManual(true)} 
          title="Ver o Manual de Instruções"
          style={{ borderColor: '#c084fc', color: '#c084fc' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          GUIA
        </button>

        {/* Trocar repo */}
        <button className="br-btn danger" onClick={reset} title="Fechar e escolher outra pasta">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
          TROCAR
        </button>

        {/* Toggle detail */}
        <button className="br-btn" onClick={toggleDetail} title="Alternar Painel de Detalhes" style={{padding:'4px 8px'}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3h18v18H3zM15 3v18"/>
          </svg>
        </button>
      </div>

      {/* ── BARRAS DE FILTRO E CLUSTER ── */}
      {graph && view === 'grafo global' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <ConnectionFilter graph={graph} activeTypes={activeEdgeTypes} setActiveTypes={setActiveEdgeTypes} />
          <ClusterControls 
            strategy={clusterStrategy} setStrategy={setClusterStrategy}
            showHulls={showHulls} setShowHulls={setShowHulls}
            clusters={clusters} depth={clusterDepth} setDepth={setClusterDepth}
            isolatedCluster={isolatedCluster} setIsolatedCluster={setIsolatedCluster}
          />
        </div>
      )}

      {/* ── LAYOUT PRINCIPAL (3 COLUNAS) ── */}
      <div style={{flex:1, display:'flex', overflow:'hidden'}}>

        {/* COLUNA ESQUERDA: Árvore */}
        {showTree && (
          <>
            <div style={{
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
                <span style={{color:T.textMid, fontSize:'9px', letterSpacing:'1.5px', textTransform:'uppercase', fontWeight:700}}>
                  Explorador
                </span>
                {search && (
                  <span style={{color:T.accent, fontSize:'8px', letterSpacing:'0.5px'}}>
                    ✦ filtrado
                  </span>
                )}
              </div>
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
          position:'relative', background: T.bg,
        }}>
          {/* Overlay do Grafo de Termos */}
          {view==='grafo termo' && termQuery && termGraph && (
            <div style={{
              position:'absolute', top:16, left:16,
              background:'#03060dee',
              border:`1px solid #f43f5e33`,
              padding:'10px 14px', borderRadius:8, zIndex:10,
              backdropFilter:'blur(8px)',
              animation:'fadeIn 0.2s ease',
            }}>
              <div style={{color:T.textMid, fontSize:'8px', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:4}}>
                ✦ Palavra Ativa
              </div>
              <div style={{color:'#f43f5e', fontSize:14, fontWeight:800}}>{termQuery}</div>
              <div style={{marginTop:6, color:T.textMid, fontSize:10}}>
                Em <span style={{color:T.textHi, fontWeight:700}}>{termGraph.matchCount}</span> arquivo(s)
              </div>
            </div>
          )}

          {view==='grafo global' && displayGraph && (
            <CanvasGlobalGraph graph={displayGraph} selectedFile={selectedFile} onSelect={setSelectedFile} />
          )}
          
          {view==='grafo termo' && termGraph && (
            termGraph.nodes.length > 0 ? (
              <CanvasGlobalGraph graph={termGraph} selectedFile={selectedFile} onSelect={setSelectedFile} isTermGraph />
            ) : (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:12,padding:20}}>
                <div style={{color:'#f43f5e', fontSize:12, textAlign:'center', lineHeight:2.5}}>
                  <div style={{fontSize:36, marginBottom:12, opacity:0.2}}>✦</div>
                  Nenhum arquivo contém <strong style={{color:'#fff'}}>{termQuery}</strong>.<br/>
                  <span style={{color:T.textMid}}>Tente outro termo.</span>
                </div>
              </div>
            )
          )}

          {view==='árvore' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:14,padding:20}}>
              <div style={{opacity:0.08}}>
                <LogoIcon size={56} />
              </div>
              <div style={{color:T.textLow, fontSize:11, textAlign:'center', letterSpacing:'0.5px'}}>
                Selecione na árvore à esquerda ou pesquise In-Code ✦
              </div>
            </div>
          )}
        </div>

        {/* COLUNA DIREITA: Detalhes */}
        {showDetail && (
          <>
            {/* Divisor arrastável */}
            <div className="br-resizer" onMouseDown={detailHandle}>
              <div className="br-resizer-line" />
            </div>

            <div style={{
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
                fileTags={selectedFile ? tagsData[selectedFile.path] : null}
                onAddTag={tag => addTag(selectedFile.path, tag)}
                onRemoveTag={tag => removeTag(selectedFile.path, tag)}
                onSaveNote={note => setNote(selectedFile.path, note)}
              />
            </div>
          </>
        )}
      </div>
      {showManual && <ManualModal onClose={() => setShowManual(false)} />}
    </div>
  );
}