import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useTranslation } from '../hooks/useTranslation';
import { theme as T } from '../styles/theme.js';
import { DRAW_LIMITS, clipSegment, labelPlacer, screenGroups, viewportNodes } from '../utils/graphViewport.js';
import { startDenseLayout } from '../utils/denseLayoutClient.js';
import { savedFolderPosition } from '../utils/folderProjection.js';
import { galaxySeeds } from '../utils/galaxyLayout.js';
import { atlasSeeds } from '../utils/atlasLayout.js';
import { paintNode } from '../utils/nodeGlyph.js';

const endpoint = value => typeof value === 'object' ? value.id : value;
const MIN_ZOOM = 0.002, MAX_ZOOM = 64;

export function DenseGraphCanvas({ graph, selectedFile, onSelect, isTermGraph, clusters, nodeClusterMap, showClusters, onContextMenu, folderMode = false }) {
  const { t, lang, colors } = useTranslation();
  const canvasRef = useRef(null), viewportRef = useRef(null), apiRef = useRef(null);
  const latestRef = useRef(null), savedLayoutRef = useRef(null);
  const [edgeMode, setEdgeMode] = useState('auto');
  const [layoutMode, setLayoutMode] = useState('galaxy');
  const [stats, setStats] = useState({ visible: 0, groups: 0, drawn: 0, eligible: 0, zoom: 1 });
  const [layoutStats, setLayoutStats] = useState({ state: 'running' });

  useEffect(() => {
    latestRef.current = { selectedFile, onSelect, onContextMenu, clusters, showClusters, edgeMode, folderMode, t, colors };
    apiRef.current?.redraw();
  }, [selectedFile, onSelect, onContextMenu, clusters, showClusters, edgeMode, folderMode, t, colors]);

  useEffect(() => {
    const canvas = canvasRef.current, viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    let width = Math.max(1, viewport.clientWidth), height = Math.max(1, viewport.clientHeight);
    let dpr = window.devicePixelRatio || 1, frame = null, spatialDirty = true, aggregate = false;
    let tree, hitTree, hovered = null, drag = null, suppressClick = false, statsKey = '';
    let clusterGeometry = null, geometryClusters = null;
    const scope = graph.snapshotId || graph.nodes[0]?.snapshotId;
    const previous = savedLayoutRef.current;
    const reuse = previous && previous.scope === scope && previous.isTermGraph === isTermGraph;
    const sameLayout = reuse && previous.layoutMode === layoutMode && previous.nodeClusterMap === nodeClusterMap;
    let transform = reuse ? previous.transform : d3.zoomIdentity;
    const ultra = graph.nodes.length > 15000;
    let seeds;
    if (layoutMode === 'galaxy') seeds = galaxySeeds(graph.nodes, graph.edges, width, height, nodeClusterMap);
    if (layoutMode === 'atlas') seeds = atlasSeeds(graph.nodes, width, height, nodeClusterMap);
    const landmarks = new Set();
    if (layoutMode === 'galaxy') {
      for (const [id, point] of seeds) {
        if (!point.relevance || landmarks.size === 6) break;
        landmarks.add(id);
      }
    }
    const nodes = graph.nodes.map((node, index) => {
      const pinned = reuse && previous.positions.get(node.id);
      const saved = pinned?.fx != null ? pinned : sameLayout && layoutMode === 'free' && savedFolderPosition(node, previous.positions, index);
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const radius = Math.sqrt(index) * (ultra ? 22 : 12);
      const x = saved?.x ?? seeds?.get(node.id)?.x ?? width / 2 + Math.cos(angle) * radius;
      const y = saved?.y ?? seeds?.get(node.id)?.y ?? height / 2 + Math.sin(angle) * radius;
      return { ...node, x, y, fx: saved?.fx ?? null, fy: saved?.fy ?? null, vx: 0, vy: 0, anchorX: x, anchorY: y };
    });
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const edges = [], adjacency = new Map();
    for (const edge of graph.edges) {
      const source = nodeById.get(endpoint(edge.source)), target = nodeById.get(endpoint(edge.target));
      if (!source || !target) continue;
      const copy = { ...edge, source, target };
      edges.push(copy);
      for (const id of new Set([source.id, target.id])) {
        if (!adjacency.has(id)) adjacency.set(id, []);
        adjacency.get(id).push(copy);
      }
    }
    // Anchors keep the large layout from collapsing under short links. Isolated
    // files use the same deterministic distribution and remain visible/pickable.
    const project = node => [transform.applyX(node.x), transform.applyY(node.y)];
    const redraw = () => { if (frame === null) frame = requestAnimationFrame(draw); };
    const changedPositions = () => { spatialDirty = true; clusterGeometry = null; redraw(); };
    const layout = layoutMode === 'free' ? startDenseLayout(nodes, edges, changedPositions, setLayoutStats) : null;

    function draw() {
      const drawStarted = performance.now();
      frame = null;
      const live = latestRef.current;
      if (!live) return;
      if (spatialDirty) {
        tree = d3.quadtree(nodes, node => node.x, node => node.y);
        spatialDirty = false;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1; ctx.fillStyle = live.colors.bg; ctx.fillRect(0, 0, width, height);
      const selected = nodeById.get(live.selectedFile?.id);
      const focus = selected || (hovered?.node && nodeById.get(hovered.node.id));
      const focusedEdges = focus ? adjacency.get(focus.id) || [] : [];
      const focused = Boolean(focus) && live.edgeMode !== 'all';
      const candidates = focused ? focusedEdges : live.edgeMode === 'focus' ? [] : edges;
      const limit = focused ? DRAW_LIMITS.focusEdges : live.edgeMode === 'all' ? DRAW_LIMITS.allEdges : DRAW_LIMITS.autoEdges;
      const eligible = [];
      for (const edge of candidates) {
        const [ax, ay] = project(edge.source), [bx, by] = project(edge.target);
        const segment = clipSegment(ax, ay, bx, by, width, height);
        if (segment) eligible.push({ edge, segment });
      }
      const drawn = [];
      const count = Math.min(limit, eligible.length);
      // Deterministic, evenly spaced sample of the eligible list when over budget.
      for (let i = 0; i < count; i++) drawn.push(eligible[Math.floor(i * eligible.length / count)]);
      const promoted = new Set(focus ? [] : landmarks);
      if (selected) promoted.add(selected.id);
      if (hovered?.node) promoted.add(hovered.node.id);
      const related = new Set(focus ? [focus.id] : []);
      for (const edge of focusedEdges) { related.add(edge.source.id); related.add(edge.target.id); }
      for (const { edge } of drawn) {
        if (focus && (edge.source.id === focus.id || edge.target.id === focus.id)) {
          promoted.add(edge.source.id); promoted.add(edge.target.id);
        }
      }

      // Work in CSS pixels: zoom changes positions, never opacity or stroke width.
      const sparse = drawn.length < 80;
      ctx.lineWidth = focused ? 1.4 : sparse ? 1 : 0.65;
      ctx.strokeStyle = focused ? live.colors.accent : live.colors.borderHi;
      ctx.globalAlpha = focused ? 0.85 : sparse ? 0.72 : live.edgeMode === 'all' ? 0.22 : 0.3;
      for (const logical of [false, true]) {
        ctx.setLineDash(logical ? [5, 4] : []); ctx.beginPath();
        for (const { edge, segment: [ax, ay, bx, by] } of drawn) {
          if ((edge.type === 'cochange') === logical) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
        }
        ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // In the all-edges mode, highlight selected connections above the background.
      if (focus && !focused) {
        ctx.strokeStyle = live.colors.accent; ctx.lineWidth = 1.6; ctx.beginPath();
        for (const { edge, segment: [ax, ay, bx, by] } of drawn) {
          if (edge.source.id === focus.id || edge.target.id === focus.id) { ctx.setLineDash(edge.type === 'cochange' ? [5, 4] : []); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // Direction arrows only for the focused edges; the overview stays quiet.
      if (focused || live.folderMode) {
        ctx.fillStyle = live.colors.accent;
        for (const { edge, segment: [ax, ay, bx, by] } of drawn) {
          if (edge.bidirectional) continue;
          const [tx, ty] = project(edge.target);
          if (tx < 8 || ty < 8 || tx > width - 8 || ty > height - 8 || Math.hypot(bx - ax, by - ay) < 26) continue;
          const angle = Math.atan2(by - ay, bx - ax), ux = Math.cos(angle), uy = Math.sin(angle);
          const x = tx - ux * 9, y = ty - uy * 9;
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.lineTo(x - ux * 6 + uy * 3, y - uy * 6 - ux * 3);
          ctx.lineTo(x - ux * 6 - uy * 3, y - uy * 6 + ux * 3);
          ctx.closePath(); ctx.fill();
        }
      }

      const visible = viewportNodes(tree, transform, width, height);
      // Hysteresis avoids toggling between all dots and grouped dots at one threshold.
      aggregate = !live.folderMode && (aggregate ? visible.length > 2000 : visible.length > 3000);
      const marks = screenGroups(visible, transform, aggregate, promoted);
      const activeMark = mark => Boolean(mark.node && (mark.node.id === focus?.id || mark.node.id === hovered?.node?.id));
      marks.sort((a, b) => Number(activeMark(a)) - Number(activeMark(b)));
      let groups = 0;
      for (const mark of marks) {
        const { x, y, node } = mark;
        if (!node) {
          groups++;
          const groupId = nodeClusterMap?.get(mark.representativeId);
          ctx.fillStyle = mark.matches ? T.rose : live.clusters?.get(groupId)?.color || live.colors.accent;
          ctx.globalAlpha = focus ? 0.22 : 0.68;
          ctx.beginPath();
          ctx.arc(x, y, Math.min(7, 1 + Math.log2(mark.count) * 0.65), 0, 2 * Math.PI);
          ctx.fill();
          continue;
        }
        const active = node && (node.id === focus?.id || node.id === hovered?.node?.id);
        ctx.globalAlpha = focus && node && !related.has(node.id) && !node.isMatch ? 0.25 : 1;
        const fill = node ? active ? live.colors.accent : node.isMatch ? T.rose : node.ft?.c || live.colors.accent : live.colors.bgCard;
        const outline = active ? T.textHi : node ? live.colors.bgDeep : mark.matches ? T.rose : live.colors.borderHi;
        paintNode(ctx, mark, adjacency.get(node?.id)?.length || 0, fill, outline, active);
      }
      ctx.globalAlpha = 1;
      hitTree = d3.quadtree(marks, mark => mark.x, mark => mark.y);

      const placeLabel = labelPlacer(width, height);
      const labels = marks.filter(mark => mark.node).sort((a, b) => {
        const score = node => node.id === focus?.id ? 4 : node.id === hovered?.node?.id ? 3 : related.has(node.id) ? 2 : node.isMatch ? 1 : 0;
        return score(b.node) - score(a.node);
      });
      let labelCount = 0;
      for (const mark of labels) {
        if (labelCount >= DRAW_LIMITS.labels) break;
        const node = mark.node, active = node.id === focus?.id || node.id === hovered?.node?.id;
        if (!node.isFolder && !landmarks.has(node.id) && !active && !related.has(node.id) && !node.isMatch && (aggregate || transform.k < 1.5)) continue;
        if (focus && !active && !related.has(node.id) && !node.isMatch) continue;
        const baseName = node.name.length > 34 ? `${node.name.slice(0, 33)}…` : node.name;
        const name = node.isFolder ? `${baseName} · ${node.fileCount}` : baseName;
        ctx.font = `${active ? '600 ' : ''}11px sans-serif`;
        const w = ctx.measureText(name).width + 8, h = 17;
        const x = Math.max(0, Math.min(width - w, mark.x - w / 2));
        const y = mark.y + mark.radius + 3;
        if (!placeLabel(x, y, w, h)) continue;
        ctx.fillStyle = live.colors.bgDeep; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = active ? T.textHi : T.textMid; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(name, x + 4, y + 2); labelCount++;
      }

      // Cluster captions belong to the overview; never grow with zoom or cover file labels.
      if (!live.folderMode && live.showClusters && live.clusters && !focus && transform.k < 1.2) {
        if (!clusterGeometry || geometryClusters !== live.clusters) {
          geometryClusters = live.clusters;
          clusterGeometry = [];
          for (const info of live.clusters.values()) {
            let x = 0, y = 0, n = 0;
            for (const member of info.nodes) {
              const node = nodeById.get(member.id);
              if (node) { x += node.x; y += node.y; n++; }
            }
            if (n) clusterGeometry.push({ x: x / n, y: y / n, count: n, label: info.label, color: info.color });
          }
          clusterGeometry.sort((a, b) => b.count - a.count);
        }
        let captions = 0;
        for (const info of clusterGeometry) {
          if (captions >= 12) break;
          const [cx, cy] = project(info), name = `${info.label.slice(0, 32)} · ${info.count}`;
          ctx.font = '600 11px sans-serif';
          const w = ctx.measureText(name).width + 10, x = cx - w / 2, y = cy - 20;
          if (!placeLabel(x, y, w, 18)) continue;
          ctx.fillStyle = live.colors.bgDeep; ctx.fillRect(x, y, w, 18);
          ctx.fillStyle = info.color; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(name, x + 5, y + 2);
          captions++;
        }
      }
      if (live.folderMode) {
        ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        for (const { edge, segment: [ax, ay, bx, by] } of drawn.slice(0, DRAW_LIMITS.labels)) {
          const label = `${edge.type} ×${edge.count || 1}`, w = ctx.measureText(label).width + 6;
          const x = (ax + bx) / 2 - w / 2, y = (ay + by) / 2;
          if (placeLabel(x, y, w, 15)) { ctx.fillStyle = live.colors.bgDeep; ctx.fillRect(x, y, w, 15); ctx.fillStyle = T.textMid; ctx.fillText(label, x + 3, y + 1); }
        }
      }
      const next = { visible: visible.length, groups, drawn: drawn.length, eligible: eligible.length,
        represented: drawn.reduce((sum, item) => sum + (item.edge.count || 1), 0), zoom: Math.round(transform.k * 1000) / 1000,
        drawMs: Math.round((performance.now() - drawStarted) * 10) / 10 };
      const key = JSON.stringify(next);
      if (key !== statsKey) { statsKey = key; setStats(next); }
    }

    const zoom = d3.zoom().scaleExtent([MIN_ZOOM, MAX_ZOOM]).extent(() => [[0, 0], [width, height]])
      .filter(event => event.type === 'wheel' || (!event.button && !drag))
      .on('zoom', event => { transform = event.transform; hovered = null; canvas.title = ''; redraw(); });
    const selection = d3.select(canvas).call(zoom).on('dblclick.zoom', null);
    const moveTo = (x, y, scale) => {
      const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
      selection.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(k).translate(-x, -y));
    };
    const fit = () => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const node of nodes) { minX = Math.min(minX, node.x); maxX = Math.max(maxX, node.x); minY = Math.min(minY, node.y); maxY = Math.max(maxY, node.y); }
      if (nodes.length) moveTo((minX + maxX) / 2, (minY + maxY) / 2, Math.min((width - 48) / Math.max(1, maxX - minX), (height - 48) / Math.max(1, maxY - minY), 2));
    };
    const locate = () => {
      const node = nodeById.get(latestRef.current.selectedFile?.id);
      if (node) moveTo(node.x, node.y, Math.max(2, transform.k));
    };
    const hit = (event) => {
      // Flush a pending camera/layout update before using screen-space hit targets.
      if (frame !== null) { cancelAnimationFrame(frame); draw(); }
      const [x, y] = d3.pointer(event, canvas);
      let found = null, best = Infinity;
      hitTree?.visit((quad, x0, y0, x1, y1) => {
        if (x0 > x + 17 || y0 > y + 17 || x1 < x - 17 || y1 < y - 17) return true;
        if (!quad.length) do {
          const mark = quad.data, distance = Math.hypot(mark.x - x, mark.y - y);
          if (distance <= mark.radius + 5 && distance < best) { found = mark; best = distance; }
        } while ((quad = quad.next));
        return false;
      });
      return found;
    };
    const down = event => {
      if (event.button !== 0) return;
      suppressClick = false;
      canvas.focus({ preventScroll: true });
      const mark = hit(event);
      if (!mark?.node || mark.node.isFolder) return;
      const [x, y] = d3.pointer(event, canvas);
      drag = { node: mark.node, x, y, moved: false };
      event.stopImmediatePropagation();
    };
    const move = event => {
      if (drag) {
        const [x, y] = d3.pointer(event, canvas);
        if (!drag.moved && Math.hypot(x - drag.x, y - drag.y) < 4) return;
        drag.moved = true;
        drag.node.fx = drag.node.x = transform.invertX(x); drag.node.fy = drag.node.y = transform.invertY(y);
        layout?.pin(drag.node);
        canvas.style.cursor = 'grabbing'; changedPositions();
        return;
      }
      if (event.target !== canvas || event.buttons) return;
      const found = hit(event);
      if (hovered?.node?.id !== found?.node?.id || Boolean(hovered) !== Boolean(found)) redraw();
      hovered = found;
      canvas.style.cursor = found ? found.node ? 'pointer' : 'zoom-in' : 'grab';
      canvas.title = found ? found.node ? found.node.isFolder
        ? `${found.node.path} · ${found.node.fileCount} ${latestRef.current.t('graph_files')} · ${found.node.internalCount} ${latestRef.current.t('graph_internal_edges')} · ${found.node.matchCount} ${latestRef.current.t('graph_matches')}` : `${found.node.path} · ${adjacency.get(found.node.id)?.length || 0} ${latestRef.current.t('graph_edges')}`
        : `${found.count} ${latestRef.current.t('graph_group_hint')}${found.matches ? ` · ${found.matches} ${latestRef.current.t('graph_matches')}` : ''}` : '';
    };
    const up = () => {
      if (!drag) return;
      suppressClick = drag.moved; drag = null; canvas.style.cursor = 'grab'; redraw();
    };
    const leave = () => { if (!drag) { hovered = null; canvas.title = ''; redraw(); } };
    const click = event => {
      if (suppressClick) { suppressClick = false; return; }
      const mark = hit(event);
      if (mark && !mark.node) {
        moveTo(transform.invertX(mark.x), transform.invertY(mark.y), transform.k * 2.5);
      } else latestRef.current.onSelect(mark?.node || null);
    };
    const context = event => {
      event.preventDefault();
      latestRef.current.onContextMenu?.({ x: event.clientX, y: event.clientY, node: hit(event)?.node || null });
    };
    const unpin = event => {
      const node = hit(event)?.node;
      if (!node || node.isFolder || node.fx == null) return;
      node.anchorX = node.x; node.anchorY = node.y;
      node.fx = null; node.fy = null;
      layout?.pin(node);
    };
    const keydown = event => {
      if (['+', '=', '-', 'Home', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
      if (event.key === '+' || event.key === '=') selection.call(zoom.scaleBy, 1.5);
      if (event.key === '-') selection.call(zoom.scaleBy, 1 / 1.5);
      if (event.key === 'Home') fit();
      if (event.key === 'Escape') latestRef.current.onSelect(null);
      const deltas = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] };
      if (deltas[event.key]) selection.call(zoom.translateBy, deltas[event.key][0] / transform.k, deltas[event.key][1] / transform.k);
    };
    const resize = () => {
      const nextWidth = Math.max(1, viewport.clientWidth), nextHeight = Math.max(1, viewport.clientHeight);
      const cx = transform.invertX(width / 2), cy = transform.invertY(height / 2);
      width = nextWidth; height = nextHeight; dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      moveTo(cx, cy, transform.k);
    };
    resize();
    if (!reuse || !sameLayout) fit();
    const observer = new ResizeObserver(resize); observer.observe(viewport);
    window.addEventListener('resize', resize);
    // Capture node drags before d3 starts a background pan; release also works outside the canvas.
    canvas.addEventListener('mousedown', down, true);
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); window.addEventListener('blur', up);
    canvas.addEventListener('mouseleave', leave); canvas.addEventListener('click', click);
    canvas.addEventListener('contextmenu', context); canvas.addEventListener('keydown', keydown); canvas.addEventListener('dblclick', unpin);
    apiRef.current = { redraw, fit, locate, scale: factor => selection.call(zoom.scaleBy, factor) };
    redraw();
    return () => {
      layout?.stop(); if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect(); selection.on('.zoom', null); apiRef.current = null;
      canvas.removeEventListener('mousedown', down, true);
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('blur', up);
      window.removeEventListener('resize', resize); canvas.removeEventListener('mouseleave', leave);
      canvas.removeEventListener('click', click); canvas.removeEventListener('contextmenu', context); canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('dblclick', unpin);
      const positions = reuse ? new Map(previous.positions) : new Map();
      for (const node of nodes) positions.set(node.id, { x: node.x, y: node.y, fx: node.fx, fy: node.fy });
      savedLayoutRef.current = { scope, isTermGraph, layoutMode, nodeClusterMap, transform, positions };
    };
  }, [graph, isTermGraph, layoutMode, nodeClusterMap]);

  const selectedInGraph = Boolean(selectedFile && graph.nodes.some(node => node.id === selectedFile.id));
  return <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, background: T.bg, fontFamily: T.ui }}>
    <div className="map-tools">
      <label>{t('graph_layout')} <select className="br-input" value={layoutMode} onChange={event => setLayoutMode(event.target.value)}>
        {['galaxy','atlas','free'].map(mode => <option key={mode} value={mode}>{t('graph_' + mode)}</option>)}
      </select></label>
      <label>{t('graph_edges')} <select className="br-input" value={edgeMode} onChange={event => setEdgeMode(event.target.value)}>
        <option value="auto">{t('graph_auto')}</option><option value="focus">{t('graph_focus')}</option><option value="all">{t('graph_all')}</option>
      </select></label>
      {selectedFile && <><button className="br-btn" disabled={!selectedInGraph} onClick={() => apiRef.current?.locate()}>{t('graph_locate')}</button>
        <button className="br-btn" onClick={() => onSelect(null)}>{t('graph_clear')}</button></>}
      <div className="zoom-group">
        <button className="br-btn" title={t('graph_out')} aria-label={t('graph_out')} onClick={() => apiRef.current?.scale(1 / 1.5)}>−</button>
        <span>{Math.round(stats.zoom * 1000) / 10}%</span>
        <button className="br-btn" title={t('graph_in')} aria-label={t('graph_in')} onClick={() => apiRef.current?.scale(1.5)}>+</button>
        <button className="br-btn" onClick={() => apiRef.current?.fit()}>{t('graph_fit')}</button>
      </div>
    </div>
    <div ref={viewportRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      <canvas ref={canvasRef} tabIndex={0} aria-label={`${t('graph_canvas')}. ${t('graph_keyboard')}`} style={{ display: 'block', touchAction: 'none', cursor: 'grab' }} />
    </div>
    <div style={{ padding: '6px 10px', borderTop: `1px solid ${T.border}`, color: T.textLow, fontSize: 11, lineHeight: 1.5 }}>
      <details className="map-legend"><summary>{lang === 'pt' ? 'Legenda e detalhes' : 'Legend and details'}</summary>
      <div className="map-key">{[['●',lang === 'pt' ? 'Conectado' : 'Connected'],['○',lang === 'pt' ? 'Isolado' : 'Isolated'],['◆',lang === 'pt' ? '8+ conexões' : '8+ connections'],['■',lang === 'pt' ? 'Pasta' : 'Folder']].map(([shape,label]) =>
        <span key={shape}><b aria-hidden="true">{shape}</b>{label}</span>)}</div>
      <div>{stats.visible} {t(folderMode ? 'graph_representatives' : 'graph_visible')} · {stats.groups} {t('graph_groups')} · {stats.drawn} {t(folderMode ? 'graph_aggregate_drawn' : 'graph_drawn')} / {stats.eligible} {t('graph_eligible')}</div>
      {folderMode && <div>{stats.represented || 0} {t('graph_represented_edges')}</div>}
      {stats.drawn < stats.eligible && <div style={{ color: T.amber }}>{t('graph_reduced')}</div>}
      <details><summary>{t('graph_performance')}</summary>
        {layoutMode !== 'free' && <div>{t('graph_' + layoutMode + '_hint')}</div>}
        {layoutMode === 'free' && <div>{t(`graph_layout_${layoutStats.state}`)} · {Math.round(layoutStats.computeMs || 0)} ms · {layoutStats.ticks || 0} {t('graph_layout_ticks')} · {Math.round((layoutStats.receivedBytes || 0) / 1024)} KiB</div>}
        <div>{t('graph_draw_time')}: {stats.drawMs || 0} ms</div>
        <div>{t('graph_timing_hint')}</div>
      </details>
      <div>{t('graph_hint')}</div></details>
      {layoutMode === 'free' && layoutStats.state === 'unavailable' && <div role="status" style={{ color: T.amber }}>{t('graph_layout_unavailable')}</div>}
      {selectedFile && !selectedInGraph && <div role="status">{t('graph_empty_focus')}</div>}
      {edgeMode === 'focus' && !selectedFile && <div role="status">{t('graph_need_selection')}</div>}
    </div>
  </div>;
}
