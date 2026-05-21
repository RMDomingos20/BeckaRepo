// src/components/CanvasGlobalGraph.jsx
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

// ─── UTILITÁRIO: Raio visual inteligente ──────────────────────────────────────
function nodeRadius(d, selId, isUltra, isTiny = false) {
  if (selId === d?.id) return isTiny ? 14 : 10;
  if (d?.isMatch) return isTiny ? 10 : 6;
  if (isUltra) return 1.5;
  return (isTiny ? 6 : 3) + Math.min(isTiny ? 6 : 4, (d?.weight || 0) * (isTiny ? 0.8 : 0.5));
}

// ─── UTILITÁRIO: Convex Hull com margem ──────────────────────────────────────
// Expande cada ponto do hull radialmente a partir do centróide, criando
// um "balão" suave ao redor do cluster.
function expandedHull(points, margin = 28) {
  if (points.length < 2) return null;
  if (points.length === 2) {
    // Hull degenerado: 2 pontos → retângulo orientado
    const [a, b] = points;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len * margin, ny = dx / len * margin;
    return [[a[0]+nx, a[1]+ny],[b[0]+nx, b[1]+ny],[b[0]-nx, b[1]-ny],[a[0]-nx, a[1]-ny]];
  }
  const hull = d3.polygonHull(points);
  if (!hull) return null;

  // Centróide do hull
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;

  return hull.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return [x + (dx / len) * margin, y + (dy / len) * margin];
  });
}

// ─── Gera SVG path suave (catmull-rom) a partir de um polígono ────────────────
function hullPath(polygon) {
  if (!polygon || polygon.length < 3) return '';
  const line = d3.line().x(d => d[0]).y(d => d[1]).curve(d3.curveCatmullRomClosed.alpha(0.5));
  return line(polygon) || '';
}

// ─── Desenha hulls no canvas ──────────────────────────────────────────────────
function drawClusterHulls(ctx, clusters, nodeById) {
  if (!clusters || clusters.size === 0) return;

  for (const [, info] of clusters) {
    const pts = info.nodes
      .map(n => nodeById.get(n.id))
      .filter(n => n && n.x != null && n.y != null && !isNaN(n.x) && !isNaN(n.y))
      .map(n => [n.x, n.y]);

    if (pts.length < 2) continue;
    const expanded = expandedHull(pts);
    if (!expanded || expanded.length < 3) continue;

    // Curva catmull-rom manual no canvas
    ctx.beginPath();
    const n = expanded.length;
    for (let i = 0; i < n; i++) {
      const p0 = expanded[(i - 1 + n) % n];
      const p1 = expanded[i];
      const p2 = expanded[(i + 1) % n];
      const p3 = expanded[(i + 2) % n];

      if (i === 0) ctx.moveTo(p1[0], p1[1]);

      // Catmull-rom → bezier
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
    }
    ctx.closePath();

    const hex = info.color;
    ctx.fillStyle = hex + '14';   // 8% opacidade — sutil
    ctx.fill();
    ctx.strokeStyle = hex + '55'; // 33% opacidade
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ==========================================
// 1. MOTOR SVG (< 800 NÓS)
// ==========================================
function SvgEngine({ graph, selectedFile, onSelect, isTermGraph, clusters, nodeClusterMap, showClusters }) {
  const svgRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const simRef = useRef(null);

  const isTiny = graph.nodes.length <= 250;

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!graph || !svgRef.current) return;
    const el = svgRef.current;
    const W = el.clientWidth || 800;
    const H = el.clientHeight || 600;
    const sv = d3.select(el);
    sv.selectAll('*').remove();

    const connectedNodes = [];
    const isolatedNodes = [];

    const nodes = graph.nodes.map(n => {
      const copy = { ...n };
      copy.vx = 0; copy.vy = 0;
      if (isNaN(copy.x) || copy.x == null) {
        const angle = Math.random() * 2 * Math.PI;
        const dist = (isTiny ? 80 : 30) + Math.random() * (isTiny ? 120 : 80);
        copy.x = W / 2 + Math.cos(angle) * dist;
        copy.y = H / 2 + Math.sin(angle) * dist;
      }
      if (isTermGraph || copy.weight > 0 || copy.isMatch) connectedNodes.push(copy);
      else isolatedNodes.push(copy);
      return copy;
    });

    const connectedCount = connectedNodes.length;
    const nodeById = new Map(connectedNodes.map(n => [n.id, n]));
    const validEdges = [];
    graph.edges.forEach(e => {
      const srcId = typeof e.source === 'object' ? e.source.id : e.source;
      const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
      const src = nodeById.get(srcId);
      const tgt = nodeById.get(tgtId);
      if (src && tgt) validEdges.push({ ...e, source: src, target: tgt });
    });

    // Setas (só para repos pequenos)
    if (isTiny) {
      const defs = sv.append('defs');
      defs.append('marker').attr('id', 'arrow-norm').attr('viewBox', '0 -4 8 8').attr('refX', 18).attr('refY', 0).attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto').append('path').attr('d', 'M0,-3L7,0L0,3').attr('fill', '#1e3a5f80');
      defs.append('marker').attr('id', 'arrow-sel').attr('viewBox', '0 -4 8 8').attr('refX', 18).attr('refY', 0).attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto').append('path').attr('d', 'M0,-3L7,0L0,3').attr('fill', '#00d4aa');
      defs.append('marker').attr('id', 'arrow-match').attr('viewBox', '0 -4 8 8').attr('refX', 18).attr('refY', 0).attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto').append('path').attr('d', 'M0,-3L7,0L0,3').attr('fill', '#f43f5e80');
    }

    const g = sv.append('g');

    const zoom = d3.zoom()
      .scaleExtent([isTiny ? 0.2 : 0.05, 10])
      .on('zoom', ev => { g.attr('transform', ev.transform); });

    const initScale = isTiny ? 0.8 : Math.max(0.3, 0.95 - (connectedCount / 1500));
    sv.call(zoom).on('dblclick.zoom', null);
    sv.call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(initScale).translate(-W / 2, -H / 2));

    const dynamicDistance = isTiny ? 85 : Math.max(20, Math.min(60, 15 + connectedCount * 0.05));
    const dynamicCharge = isTiny ? -200 : -Math.max(25, Math.min(100, 20 + connectedCount * 0.1));

    const sim = d3.forceSimulation(connectedNodes);
    sim.force('link', d3.forceLink(validEdges).id(d => d.id).distance(dynamicDistance).strength(0.8));
    sim.force('charge', d3.forceManyBody().strength(dynamicCharge).distanceMax(400));
    sim.force('collide', d3.forceCollide(d => nodeRadius(d, null, false, isTiny) + 2).iterations(2));
    sim.force('center', d3.forceCenter(W / 2, H / 2).strength(isTiny ? 0.05 : 0.08));
    sim.alphaDecay(0.04);
    simRef.current = sim;

    // -- FORÇA GRAVITACIONAL DOS CLUSTERS --
    // Atrai nós suavemente para o centro de seu grupo
    const clustersRef = { current: clusters };
    const nodeClusterMapRef = { current: nodeClusterMap };

    sim.force('cluster', function(alpha) {
      const cls = clustersRef.current;
      const ncm = nodeClusterMapRef.current;
      if (!showClusters || !cls || cls.size === 0) return;

      // 1. Calcula o centro de massa (Baricentro) de cada cluster
      const centroids = new Map();
      for (const [id, info] of cls) {
        let cx = 0, cy = 0, count = 0;
        info.nodes.forEach(n => {
          const node = nodeById.get(n.id);
          if (node && node.x != null && !isNaN(node.x)) { cx += node.x; cy += node.y; count++; }
        });
        if (count > 0) centroids.set(id, { x: cx / count, y: cy / count });
      }

      // 2. Aplica força direcional em cada nó conectado
      connectedNodes.forEach(n => {
        const cId = ncm?.get(n.id);
        if (cId && centroids.has(cId)) {
          const cent = centroids.get(cId);
          const strength = 0.04 * alpha; // Modulador da força física
          n.vx -= (n.x - cent.x) * strength;
          n.vy -= (n.y - cent.y) * strength;
        }
      });
    });

    // ── CAMADA DE HULLS (abaixo de tudo) ──────────────────────────────────────
    const hullGroup = g.append('g').attr('class', 'hull-layer');

    const updateHulls = () => {
      if (!showClusters || !clusters || clusters.size === 0) return;
      hullGroup.selectAll('.cluster-hull').remove();

      for (const [, info] of clusters) {
        const pts = info.nodes
          .map(n => nodeById.get(n.id))
          .filter(n => n && n.x != null && !isNaN(n.x))
          .map(n => [n.x, n.y]);

        if (pts.length < 2) continue;
        const expanded = expandedHull(pts);
        if (!expanded) continue;
        const pathStr = hullPath(expanded);
        if (!pathStr) continue;

        hullGroup.append('path')
          .attr('class', 'cluster-hull')
          .attr('d', pathStr)
          .attr('fill', info.color + '14')
          .attr('stroke', info.color + '55')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4,4');
      }
    };

    const linkg = g.append('g').attr('class', 'links-layer');
    const nodeg = g.append('g').attr('class', 'nodes-layer');

    const link = linkg.selectAll('line').data(validEdges).join('line')
      .attr('class', 'graph-link')
      .attr('stroke', d => (d.source.isMatch || d.target.isMatch) ? '#f43f5e55' : (isTiny ? '#1e3a5f80' : '#1e3a5f4d'))
      .attr('stroke-width', d => (d.source.isMatch || d.target.isMatch) ? (isTiny ? 1.5 : 1.2) : (isTiny ? 1 : 0.6))
      .attr('marker-end', d => {
        if (!isTiny) return null;
        return (d.source.isMatch || d.target.isMatch) ? 'url(#arrow-match)' : 'url(#arrow-norm)';
      });

    const node = nodeg.selectAll('g.node-group').data(connectedNodes).join('g')
      .attr('class', 'node-group').style('cursor', 'pointer')
      .on('click', (ev, d) => { ev.stopPropagation(); onSelectRef.current(d); })
      .call(d3.drag()
        .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); })
      );

    node.append('circle')
      .filter(d => d.isMatch)
      .attr('r', d => nodeRadius(d, null, false, isTiny) + 4)
      .attr('fill', '#f43f5e1a');

    node.append('circle')
      .attr('class', 'node-circle')
      .attr('r', d => nodeRadius(d, null, false, isTiny))
      .attr('fill', d => isTiny ? d.ft.c + '18' : (d.isMatch ? '#f43f5e' : (d.ft?.c || '#64748b')))
      .attr('fill-opacity', isTiny ? 1 : 0.25)
      .attr('stroke', d => d.isMatch ? '#f43f5e' : (d.ft?.c || '#64748b'))
      .attr('stroke-width', 1.5);

    node.append('text').attr('class', 'node-text')
      .text(d => d.name.length > 16 ? d.name.slice(0, 15) + '…' : d.name)
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.isMatch ? (isTiny ? '3.5em' : '2.5em') : (isTiny ? '2.8em' : '1.5em'))
      .attr('font-size', d => d.isMatch ? (isTiny ? '10px' : '9px') : (isTiny ? '8.5px' : '7px'))
      .attr('fill', d => d.isMatch ? '#ff7e94' : '#94a3b8')
      .attr('font-family', 'monospace').attr('pointer-events', 'none')
      .attr('display', d => d.isMatch || isTiny ? 'block' : 'none');

    // ── Labels de cluster (centroides) ────────────────────────────────────────
    const clusterLabelGroup = g.append('g').attr('class', 'cluster-labels');

    const updateClusterLabels = () => {
      if (!showClusters || !clusters || clusters.size === 0) return;
      clusterLabelGroup.selectAll('.cluster-label').remove();

      for (const [, info] of clusters) {
        const pts = info.nodes
          .map(n => nodeById.get(n.id))
          .filter(n => n && n.x != null && !isNaN(n.x));
        if (pts.length < 1) continue;

        const cx = pts.reduce((s, n) => s + n.x, 0) / pts.length;
        const cy = pts.reduce((s, n) => s + n.y, 0) / pts.length;

        // Encontra o ponto mais alto do hull para posicionar o label
        const topY = Math.min(...pts.map(n => n.y)) - 36;

        clusterLabelGroup.append('text')
          .attr('class', 'cluster-label')
          .attr('x', cx)
          .attr('y', topY)
          .attr('text-anchor', 'middle')
          .attr('font-size', '9px')
          .attr('font-family', 'monospace')
          .attr('font-weight', '700')
          .attr('fill', info.color + 'cc')
          .attr('letter-spacing', '1px')
          .attr('pointer-events', 'none')
          .text(info.label.toUpperCase());
      }
    };

    sim.on('tick', () => {
      link.attr('x1', d => d.target.x).attr('y1', d => d.target.y)
          .attr('x2', d => d.source.x).attr('y2', d => d.source.y);
      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
      updateHulls();
      updateClusterLabels();
    });

    return () => sim.stop();
  }, [graph, isTermGraph, isTiny, clusters, showClusters]);

  // Efeito de seleção
  useEffect(() => {
    if (!svgRef.current) return;
    const sv = d3.select(svgRef.current);
    const selId = selectedFile?.id;

    sv.selectAll('.graph-link')
      .attr('stroke', d => {
        const isSel = selId && (d.source.id === selId || d.target.id === selId);
        if (isSel) return '#00d4aa';
        if (d.source.isMatch || d.target.isMatch) return '#f43f5e55';
        return isTiny ? '#1e3a5f80' : '#1e3a5f4d';
      })
      .attr('stroke-width', d => {
        const isSel = selId && (d.source.id === selId || d.target.id === selId);
        if (isSel) return 2.5;
        if (d.source.isMatch || d.target.isMatch) return 1.5;
        return isTiny ? 1 : 0.6;
      })
      .attr('marker-end', d => {
        if (!isTiny) return null;
        const isSel = selId && (d.source.id === selId || d.target.id === selId);
        if (isSel) return 'url(#arrow-sel)';
        if (d.source.isMatch || d.target.isMatch) return 'url(#arrow-match)';
        return 'url(#arrow-norm)';
      });

    sv.selectAll('.graph-link')
      .filter(d => selId && (d.source.id === selId || d.target.id === selId))
      .raise();

    sv.selectAll('.node-circle')
      .attr('r', d => nodeRadius(d, selId, false, isTiny))
      .attr('fill', d => {
        if (isTiny) return (selId === d.id) ? d.ft.c + '33' : d.ft.c + '18';
        return d.isMatch ? '#f43f5e' : (d.ft?.c || '#64748b');
      })
      .attr('stroke', d => selId === d.id ? '#00d4aa' : (d.isMatch ? '#f43f5e' : (d.ft?.c || '#64748b')))
      .attr('stroke-width', d => selId === d.id ? (isTiny ? 3 : 2.5) : 1.5);

    sv.selectAll('.node-group')
      .filter(d => d.id === selId)
      .raise();
  }, [selectedFile, graph, isTiny]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#050810' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

// ==========================================
// 2. MOTOR CANVAS (> 800 NÓS - Máxima Performance)
// ==========================================
function CanvasEngine({ graph, selectedFile, onSelect, isTermGraph, clusters, nodeClusterMap, showClusters }) {
  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const transformRef = useRef(d3.zoomIdentity);
  const simRef       = useRef(null);
  const selRef       = useRef(selectedFile);
  const hoverRef     = useRef(null);
  const dragNodeRef  = useRef(null);
  const dirtyRef     = useRef(true);
  const animIdRef    = useRef(null);
  // Ref para clusters (evita re-criar o effect quando só muda strategy)
  const clustersRef  = useRef(clusters);
  const showClustersRef = useRef(showClusters);

  selRef.current = selectedFile;
  clustersRef.current = clusters;
  showClustersRef.current = showClusters;

  // Quando clusters mudam, basta marcar dirty — sem reconstruir simulação
  useEffect(() => {
    clustersRef.current = clusters;
    dirtyRef.current = true;
  }, [clusters]);

  useEffect(() => {
    showClustersRef.current = showClusters;
    dirtyRef.current = true;
  }, [showClusters]);

  useEffect(() => {
    if (!graph || !containerRef.current || !canvasRef.current) return;

    const W = containerRef.current.clientWidth || 800;
    const H = containerRef.current.clientHeight || 600;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.scale(dpr, dpr);

    const connectedNodes = [];
    const isolatedNodes  = [];
    const nodeCount = graph.nodes.length;
    const isUltra = nodeCount > 15000;

    let connectedIdx = 0;
    const phi = 1.61803398875 * Math.PI * 2;

    graph.nodes.forEach(n => {
      const copy = { ...n };
      copy.vx = 0; copy.vy = 0;

      if (copy.weight > 0 || copy.isMatch || isTermGraph) {
        if (copy.x == null || isNaN(copy.x) || isNaN(copy.y)) {
          if (isUltra) {
            const radius = Math.sqrt(connectedIdx) * 35;
            copy.x = W / 2 + Math.cos(connectedIdx * phi) * radius;
            copy.y = H / 2 + Math.sin(connectedIdx * phi) * radius;
          } else {
            const angle = Math.random() * 2 * Math.PI;
            const dist = 20 + Math.random() * 100;
            copy.x = W / 2 + Math.cos(angle) * dist;
            copy.y = H / 2 + Math.sin(angle) * dist;
          }
        }
        connectedNodes.push(copy);
        connectedIdx++;
      } else {
        const angle = Math.random() * 2 * Math.PI;
        const dist = 200 + Math.random() * 200;
        copy.x = W / 2 + Math.cos(angle) * dist;
        copy.y = H / 2 + Math.sin(angle) * dist;
        isolatedNodes.push(copy);
      }
    });

    const connectedCount = connectedNodes.length;
    const nodeById = new Map(connectedNodes.map(n => [n.id, n]));
    const validEdges = [];
    graph.edges.forEach(e => {
      const srcId = typeof e.source === 'object' ? e.source.id : e.source;
      const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
      const src = nodeById.get(srcId);
      const tgt = nodeById.get(tgtId);
      if (src && tgt) validEdges.push({ ...e, source: src, target: tgt });
    });

    const allNodes = [...connectedNodes, ...isolatedNodes];

    const sim = d3.forceSimulation(connectedNodes);
    const dynamicDistance = isUltra ? 10 : Math.max(15, Math.min(80, 12 + connectedCount * 0.04));
    const dynamicCharge = isUltra ? -10 : -Math.max(25, Math.min(250, 20 + connectedCount * 0.08));

    sim.force('link', d3.forceLink(validEdges).id(d => d.id).distance(dynamicDistance).strength(isUltra ? 0.3 : 0.8));
    if (!isUltra) {
      sim.force('charge', d3.forceManyBody().strength(dynamicCharge).distanceMax(300 + connectedCount * 0.1));
      sim.force('collide', d3.forceCollide(d => nodeRadius(d, null, false) + 1.5).iterations(2));
    }
    sim.force('center', d3.forceCenter(W / 2, H / 2).strength(isUltra ? 0.02 : 0.1));
    sim.alphaDecay(isUltra ? 0.1 : 0.04);
    simRef.current = sim;

    sim.on('tick', () => { dirtyRef.current = true; });

    // ─── Função de desenho dos hulls via canvas ───────────────────────────────
    const drawHulls = () => {
      if (!showClustersRef.current) return;
      const cls = clustersRef.current;
      if (!cls || cls.size === 0) return;

      ctx.save();
      drawClusterHulls(ctx, cls, nodeById);
      ctx.restore();
    };

    // ─── Labels de cluster no canvas ─────────────────────────────────────────
    const drawClusterLabels = (t) => {
      if (!showClustersRef.current) return;
      const cls = clustersRef.current;
      if (!cls || cls.size === 0) return;

      for (const [, info] of cls) {
        const pts = info.nodes
          .map(n => nodeById.get(n.id))
          .filter(n => n && n.x != null && !isNaN(n.x));
        if (pts.length < 1) continue;

        const cx = pts.reduce((s, n) => s + n.x, 0) / pts.length;
        const topY = Math.min(...pts.map(n => n.y)) - 38;

        // Só renderiza label em zoom razoável (evita poluição visual no ultra-zoom-out)
        if (t.k < (isUltra ? 0.5 : 0.2)) continue;

        const fontSize = Math.max(8, 9 / t.k);
        ctx.font = `700 ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.letterSpacing = '1px';
        ctx.fillStyle = info.color + 'cc';
        ctx.fillText(info.label.toUpperCase(), cx, topY);
      }
    };

    const draw = () => {
      if (W === 0 || H === 0) return;

      ctx.fillStyle = '#050810';
      ctx.fillRect(0, 0, W, H);

      const t = transformRef.current;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      const vMinX = -t.x / t.k, vMaxX = (W - t.x) / t.k;
      const vMinY = -t.y / t.k, vMaxY = (H - t.y) / t.k;
      const buffer = 100 / t.k;
      const inView = (x, y) =>
        x >= vMinX - buffer && x <= vMaxX + buffer &&
        y >= vMinY - buffer && y <= vMaxY + buffer;

      // ── 0. Hulls de cluster (fundo de tudo) ───────────────────────────────
      drawHulls();

      ctx.globalAlpha = 1.0;

      const normalEdges = [];
      const matchEdges = [];
      const selEdges = [];

      validEdges.forEach(e => {
        if (!inView(e.source.x, e.source.y) && !inView(e.target.x, e.target.y)) return;
        const isSel = selRef.current && (selRef.current.id === e.source.id || selRef.current.id === e.target.id);
        const isMatch = e.source.isMatch || e.target.isMatch;
        if (isSel) selEdges.push(e);
        else if (isMatch) matchEdges.push(e);
        else normalEdges.push(e);
      });

      if (normalEdges.length > 0) {
        ctx.beginPath();
        normalEdges.forEach(e => { ctx.moveTo(e.source.x, e.source.y); ctx.lineTo(e.target.x, e.target.y); });
        ctx.strokeStyle = '#1e3a5f4d';
        ctx.lineWidth = Math.max(0.15, 0.5 / t.k);
        ctx.stroke();
      }

      if (matchEdges.length > 0) {
        ctx.beginPath();
        matchEdges.forEach(e => { ctx.moveTo(e.source.x, e.source.y); ctx.lineTo(e.target.x, e.target.y); });
        ctx.strokeStyle = '#f43f5e55';
        ctx.lineWidth = Math.max(0.3, 1.0 / t.k);
        ctx.stroke();
      }

      if (selEdges.length > 0) {
        ctx.beginPath();
        selEdges.forEach(e => { ctx.moveTo(e.source.x, e.source.y); ctx.lineTo(e.target.x, e.target.y); });
        ctx.strokeStyle = '#00d4aa';
        ctx.lineWidth = Math.max(1.0, 2.5 / t.k);
        ctx.stroke();
      }

      const renderNodes = (nodesList) => {
        for (let i = 0; i < nodesList.length; i++) {
          const n = nodesList[i];
          const isSel = selRef.current?.id === n.id;
          const r = nodeRadius(n, selRef.current?.id, isUltra);

          if (!inView(n.x, n.y)) continue;

          if (n.isMatch && !isUltra && !isSel) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + (5 / t.k), 0, 2 * Math.PI);
            ctx.fillStyle = '#f43f5e1a';
            ctx.fill();
          }

          const baseColor = isSel ? '#00d4aa' : (n.isMatch ? '#f43f5e' : n.ft.c);

          ctx.globalAlpha = Math.min(1.0, Math.max(0.15, 0.4 / t.k));
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = baseColor;
          ctx.fill();

          ctx.globalAlpha = 1.0;
          if (!isUltra || isSel || n.isMatch) {
            ctx.lineWidth = isSel ? (2.5 / t.k) : (1.2 / t.k);
            ctx.strokeStyle = baseColor;
            ctx.stroke();
          }

          if (t.k > (isUltra ? 3.0 : 1.2) || isSel || (n.isMatch && t.k > 0.5)) {
            ctx.fillStyle = isSel ? '#3b82f6' : (n.isMatch ? '#ff7e94' : '#94a3b8');
            const fontSize = (n.isMatch ? 10 : 8) / t.k;
            ctx.font = `${isSel || n.isMatch ? 'bold' : 'normal'} ${fontSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(n.name.length > 18 ? n.name.slice(0, 17) + '…' : n.name, n.x, n.y + r + 3 / t.k);
          }
        }
      };

      renderNodes(connectedNodes);
      if (t.k > (isUltra ? 0.8 : 0.2)) renderNodes(isolatedNodes);

      // ── Labels de cluster (topo de tudo) ─────────────────────────────────
      drawClusterLabels(t);

      ctx.restore();
    };

    const renderLoop = () => {
      if (dirtyRef.current) {
        draw();
        dirtyRef.current = false;
      }
      animIdRef.current = requestAnimationFrame(renderLoop);
    };

    dirtyRef.current = true;
    animIdRef.current = requestAnimationFrame(renderLoop);

    const zoom = d3.zoom()
      .scaleExtent([isUltra ? 0.005 : 0.05, 10])
      .filter(ev => (!ev.button && ev.type !== 'mousedown') || dragNodeRef.current == null)
      .on('zoom', ev => {
        transformRef.current = ev.transform;
        dirtyRef.current = true;
      });

    const zoomSel = d3.select(canvas).call(zoom).on('dblclick.zoom', null);
    const initScale = isUltra ? 0.05 : Math.max(0.15, 0.9 - (connectedCount / 2500));
    zoomSel.call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(initScale).translate(-W / 2, -H / 2));

    const getNodeAtMouse = (mx, my) => {
      const t = transformRef.current;
      const wx = t.invertX(mx), wy = t.invertY(my);
      const arrays = [isolatedNodes, connectedNodes];
      for (const arr of arrays) {
        for (let i = arr.length - 1; i >= 0; i--) {
          const n = arr[i];
          const r = nodeRadius(n, selRef.current?.id, isUltra) + 6;
          if (Math.abs(n.x - wx) < r && Math.abs(n.y - wy) < r) {
            if ((n.x - wx)**2 + (n.y - wy)**2 <= r**2) return n;
          }
        }
      }
      return null;
    };

    d3.select(canvas).on('mousemove.hover', ev => {
      if (dragNodeRef.current) {
        const t = transformRef.current;
        dragNodeRef.current.fx = t.invertX(ev.offsetX);
        dragNodeRef.current.fy = t.invertY(ev.offsetY);
        sim.alphaTarget(0.1).restart();
        return;
      }
      const found = getNodeAtMouse(ev.offsetX, ev.offsetY);
      if (hoverRef.current?.id !== found?.id) {
        hoverRef.current = found;
        canvas.style.cursor = found ? 'pointer' : 'default';
        dirtyRef.current = true;
      }
    });

    d3.select(canvas).on('mousedown.drag', ev => {
      if (ev.button !== 0) return;
      const found = getNodeAtMouse(ev.offsetX, ev.offsetY);
      if (found) {
        dragNodeRef.current = found;
        canvas.style.cursor = 'grabbing';
        d3.select(canvas).on('.zoom', null);
        ev.stopPropagation();
      }
    });

    d3.select(canvas).on('mouseup.drag', () => {
      if (dragNodeRef.current) {
        sim.alphaTarget(0);
        dragNodeRef.current = null;
        canvas.style.cursor = 'default';
        d3.select(canvas).call(zoom);
        dirtyRef.current = true;
      }
    });

    d3.select(canvas).on('dblclick.unpin', ev => {
      const found = getNodeAtMouse(ev.offsetX, ev.offsetY);
      if (found && found.fx != null) {
        found.fx = null; found.fy = null;
        sim.alphaTarget(0.15).restart();
        setTimeout(() => sim.alphaTarget(0), 1000);
      }
    });

    d3.select(canvas).on('click.select', ev => {
      if (ev.detail > 1) return;
      onSelect(getNodeAtMouse(ev.offsetX, ev.offsetY) || null);
    });

    return () => {
      cancelAnimationFrame(animIdRef.current);
      sim.stop();
      d3.select(canvas)
        .on('.zoom', null).on('.drag', null)
        .on('.hover', null).on('.select', null)
        .on('dblclick.unpin', null);
    };
  }, [graph, isTermGraph]);

  useEffect(() => {
    dirtyRef.current = true;
  }, [selectedFile]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#050810' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
}

// ─── DISPATCHER ───────────────────────────────────────────────────────────────
export function CanvasGlobalGraph(props) {
  if (!props.graph || !props.graph.nodes) return null;
  const useCanvas = props.graph.nodes.length > 800;
  if (useCanvas) return <CanvasEngine {...props} />;
  return <SvgEngine {...props} />;
}