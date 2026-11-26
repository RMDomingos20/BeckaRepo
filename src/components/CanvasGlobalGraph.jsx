// src/components/CanvasGlobalGraph.jsx
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { FolderGraphCanvas } from './FolderGraphCanvas.jsx';

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

// ==========================================
// 1. MOTOR SVG (< 800 NÓS)
// ==========================================
function SvgEngine({ graph, selectedFile, onSelect, isTermGraph, clusters, nodeClusterMap, showClusters, onContextMenu }) {
  const svgRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const onContextMenuRef = useRef(onContextMenu);
  const simRef = useRef(null);

  const isTiny = graph.nodes.length <= 250;

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onContextMenuRef.current = onContextMenu; }, [onContextMenu]);

  useEffect(() => {
    if (!graph || !svgRef.current) return;
    const el = svgRef.current;
    const W = el.clientWidth || 800;
    const H = el.clientHeight || 600;
    const sv = d3.select(el);
    sv.selectAll('*').remove();

    const connectedNodes = [];

    graph.nodes.forEach(n => {
      const copy = { ...n };
      copy.vx = 0; copy.vy = 0;
      if (isNaN(copy.x) || copy.x == null) {
        const angle = Math.random() * 2 * Math.PI;
        const dist = (isTiny ? 80 : 30) + Math.random() * (isTiny ? 120 : 80);
        copy.x = W / 2 + Math.cos(angle) * dist;
        copy.y = H / 2 + Math.sin(angle) * dist;
      }
      connectedNodes.push(copy);
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
      defs.append('marker').attr('id', 'arrow-norm').attr('viewBox', '0 -4 8 8').attr('refX', 18).attr('refY', 0).attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto').append('path').attr('d', 'M0,-3L7,0L0,3').attr('fill', '#68768280');
      defs.append('marker').attr('id', 'arrow-sel').attr('viewBox', '0 -4 8 8').attr('refX', 18).attr('refY', 0).attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto').append('path').attr('d', 'M0,-3L7,0L0,3').attr('fill', 'var(--accent)');
      defs.append('marker').attr('id', 'arrow-match').attr('viewBox', '0 -4 8 8').attr('refX', 18).attr('refY', 0).attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto').append('path').attr('d', 'M0,-3L7,0L0,3').attr('fill', '#cf9d8380');
    }

    const g = sv.append('g');

    const zoom = d3.zoom()
      .scaleExtent([isTiny ? 0.2 : 0.05, 10])
      .on('zoom', ev => { g.attr('transform', ev.transform); });

    const initScale = isTiny ? 0.8 : Math.max(0.3, 0.95 - (connectedCount / 1500));
    sv.call(zoom).on('dblclick.zoom', null);
    sv.call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(initScale).translate(-W / 2, -H / 2));

    sv.on('contextmenu', (ev) => {
      if (onContextMenuRef.current) {
        ev.preventDefault();
        // Se não clicou em um nó (circle), é o fundo
        if (ev.target.tagName !== 'circle') {
          onContextMenuRef.current({ x: ev.clientX, y: ev.clientY, node: null });
        }
      }
    });

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
      .attr('stroke', d => (d.source.isMatch || d.target.isMatch) ? '#cf9d8355' : (isTiny ? '#68768280' : '#6876824d'))
      .attr('stroke-width', d => (d.source.isMatch || d.target.isMatch) ? (isTiny ? 1.5 : 1.2) : (isTiny ? 1 : 0.6))
      .attr('marker-end', d => {
        if (!isTiny) return null;
        return (d.source.isMatch || d.target.isMatch) ? 'url(#arrow-match)' : 'url(#arrow-norm)';
      });

    const node = nodeg.selectAll('g.node-group').data(connectedNodes).join('g')
      .attr('class', 'node-group').style('cursor', 'pointer')
      .on('click', (ev, d) => { ev.stopPropagation(); onSelectRef.current(d); })
      .on('contextmenu', (ev, d) => {
        if (onContextMenuRef.current) {
          ev.preventDefault();
          ev.stopPropagation();
          onContextMenuRef.current({ x: ev.clientX, y: ev.clientY, node: d });
        }
      })
      .call(d3.drag()
        .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on('end', ev => { if (!ev.active) sim.alphaTarget(0); })
      );

    node.append('circle')
      .filter(d => d.isMatch)
      .attr('r', d => nodeRadius(d, null, false, isTiny) + 4)
      .attr('fill', '#cf9d831a');

    node.append('circle')
      .attr('class', 'node-circle')
      .attr('r', d => nodeRadius(d, null, false, isTiny))
      .attr('fill', d => isTiny ? d.ft.c + '18' : (d.isMatch ? '#cf9d83' : (d.ft?.c || '#98a3ad')))
      .attr('fill-opacity', isTiny ? 1 : 0.25)
      .attr('stroke', d => d.isMatch ? '#cf9d83' : (d.ft?.c || '#98a3ad'))
      .attr('stroke-width', 1.5);

    node.append('text').attr('class', 'node-text')
      .text(d => d.name.length > 16 ? d.name.slice(0, 15) + '…' : d.name)
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.isMatch ? (isTiny ? '3.5em' : '2.5em') : (isTiny ? '2.8em' : '1.5em'))
      .attr('font-size', d => d.isMatch ? (isTiny ? '10px' : '9px') : (isTiny ? '8.5px' : '7px'))
      .attr('fill', d => d.isMatch ? '#d3ad9c' : '#b1bac3')
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
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
      updateHulls();
      updateClusterLabels();
    });

    return () => sim.stop();
  }, [graph, isTermGraph, isTiny, clusters, nodeClusterMap, showClusters]);

  // Efeito de seleção
  useEffect(() => {
    if (!svgRef.current) return;
    const sv = d3.select(svgRef.current);
    const selId = selectedFile?.id;

    sv.selectAll('.graph-link')
      .attr('stroke', d => {
        const isSel = selId && (d.source.id === selId || d.target.id === selId);
        if (isSel) return 'var(--accent)';
        if (d.source.isMatch || d.target.isMatch) return '#cf9d8355';
        return isTiny ? '#68768280' : '#6876824d';
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
        return d.isMatch ? '#cf9d83' : (d.ft?.c || '#98a3ad');
      })
      .attr('stroke', d => selId === d.id ? 'var(--accent)' : (d.isMatch ? '#cf9d83' : (d.ft?.c || '#98a3ad')))
      .attr('stroke-width', d => selId === d.id ? (isTiny ? 3 : 2.5) : 1.5);

    sv.selectAll('.node-group')
      .filter(d => d.id === selId)
      .raise();
  }, [selectedFile, graph, isTiny]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: 'var(--bg)' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

// ─── DISPATCHER ───────────────────────────────────────────────────────────────
export function CanvasGlobalGraph(props) {
  if (!props.graph || !props.graph.nodes) return null;
  const useCanvas = props.graph.nodes.length > 800;
  if (useCanvas || !props.isTermGraph) return <FolderGraphCanvas key={props.graph.snapshotId || props.graph.nodes[0]?.snapshotId || 'current'} {...props} ClassicView={useCanvas ? null : SvgEngine} />;
  return <SvgEngine {...props} />;
}
