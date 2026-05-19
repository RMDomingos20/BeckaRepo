import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export function MiniGraph({ anchorId, selectedId, graph, onSelect }) {
  const svgRef = useRef(null);
  
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // EFFECT 1: CRIAÇÃO E FÍSICA
  useEffect(() => {
    if (!anchorId || !graph || !svgRef.current) return;
    const el = svgRef.current;
    const W = el.clientWidth || 400;
    const H = el.clientHeight || 300;
    const sv = d3.select(el);
    sv.selectAll('*').remove();

    const center = graph.nodeMap.get(anchorId);
    if (!center) return;

    const rid = x => (typeof x === 'object' ? x.id : x);
    const hop1Nodes = new Set([anchorId]);
    const hop2Nodes = new Set();
    const finalEdges = [];
    
    graph.edges.forEach(e => {
      const s = rid(e.source), t = rid(e.target);
      if (s === anchorId) { hop1Nodes.add(t); finalEdges.push(e); }
      else if (t === anchorId) { hop1Nodes.add(s); finalEdges.push(e); }
    });

    let hop2Limit = 0;
    graph.edges.forEach(e => {
      if (hop2Limit >= 50) return;
      const s = rid(e.source), t = rid(e.target);
      const sIn1 = hop1Nodes.has(s), tIn1 = hop1Nodes.has(t);
      if (sIn1 && !tIn1 && t !== anchorId) {
        hop2Nodes.add(t); finalEdges.push(e); hop2Limit++;
      } else if (tIn1 && !sIn1 && s !== anchorId) {
        hop2Nodes.add(s); finalEdges.push(e); hop2Limit++;
      } else if (sIn1 && tIn1 && s !== anchorId && t !== anchorId) {
        finalEdges.push(e); 
      }
    });

    const nodes = [];
    hop1Nodes.forEach(id => { const n = graph.nodeMap.get(id); if (n) nodes.push({ ...n }); });
    hop2Nodes.forEach(id => { const n = graph.nodeMap.get(id); if (n) nodes.push({ ...n }); });

    const nids = new Set(nodes.map(n => n.id));
    const validEdges = finalEdges
      .filter(e => nids.has(rid(e.source)) && nids.has(rid(e.target)))
      .map(e => ({...e}));

    // Arrowhead marker
    const defs = sv.append('defs');
    defs.append('marker')
      .attr('id','mgarr')
      .attr('viewBox','0 -4 8 8')
      .attr('refX',17).attr('refY',0)
      .attr('markerWidth',5).attr('markerHeight',5)
      .attr('orient','auto')
      .append('path').attr('d','M0,-3L7,0L0,3').attr('fill','#2a1f45');

    defs.append('marker')
      .attr('id','mgarr-sel')
      .attr('viewBox','0 -4 8 8')
      .attr('refX',17).attr('refY',0)
      .attr('markerWidth',5).attr('markerHeight',5)
      .attr('orient','auto')
      .append('path').attr('d','M0,-3L7,0L0,3').attr('fill','#c084fc');

    const g = sv.append('g');
    sv.call(d3.zoom().scaleExtent([0.2,5]).on('zoom', ev => g.attr('transform', ev.transform)));

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(validEdges).id(d=>d.id).distance(85).strength(0.8))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(W/2, H/2))
      .force('collide', d3.forceCollide(30))
      .alphaDecay(0.04);

    const link = g.append('g').selectAll('line')
      .data(validEdges).join('line')
      .attr('class', 'mini-link')
      .attr('stroke', '#2a1f4580')
      .attr('stroke-width', 1)
      .attr('marker-end', 'url(#mgarr)');

    const node = g.append('g').selectAll('g.node-group')
      .data(nodes).join('g')
      .attr('class', 'node-group')
      .style('cursor','pointer')
      .on('click',(ev,d) => { ev.stopPropagation(); onSelectRef.current(d); })
      .call(d3.drag()
        .on('start',(ev,d)=>{ if(!ev.active)sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
        .on('drag', (ev,d)=>{ d.fx=ev.x; d.fy=ev.y; })
        .on('end',  (ev,d)=>{ if(!ev.active)sim.alphaTarget(0); d.fx=null; d.fy=null; })
      );

    node.append('circle').attr('class', 'node-circle');
    node.append('text').attr('class', 'node-text')
      .text(d => d.name.length>11 ? d.name.slice(0,10)+'…' : d.name)
      .attr('text-anchor','middle').attr('dy','2.9em')
      .attr('font-size','8px').attr('font-family','monospace');

    sim.on('tick', () => {
      link.attr('x1',d=>d.target.x).attr('y1',d=>d.target.y)
          .attr('x2',d=>d.source.x).attr('y2',d=>d.source.y);
      node.attr('transform',d=>`translate(${d.x||0},${d.y||0})`);
    });

    return () => sim.stop();
  }, [anchorId, graph]);

  // EFFECT 2: DESTAQUE REATIVO
  useEffect(() => {
    if (!svgRef.current) return;
    const sv = d3.select(svgRef.current);

    sv.selectAll('.mini-link')
      .transition().duration(200)
      .attr('stroke', d => {
        const sId = d.source.id || d.source;
        const tId = d.target.id || d.target;
        if (sId === selectedId || tId === selectedId) return '#c084fc';
        if (sId === anchorId || tId === anchorId) return '#f59e0b66';
        return '#2a1f4540';
      })
      .attr('stroke-width', d => {
        const sId = d.source.id || d.source;
        const tId = d.target.id || d.target;
        return (sId === selectedId || tId === selectedId) ? 2.5 : 1;
      })
      .attr('marker-end', d => {
        const sId = d.source.id || d.source;
        const tId = d.target.id || d.target;
        return (sId === selectedId || tId === selectedId) ? 'url(#mgarr-sel)' : 'url(#mgarr)';
      });

    sv.selectAll('.node-circle')
      .transition().duration(200)
      .attr('r', d => d.id === selectedId ? 16 : (d.id === anchorId ? 14 : 10))
      .attr('fill', d => {
        if (d.id === selectedId) return d.ft.c + '33';
        if (d.id === anchorId) return '#c084fc22';
        return d.ft.c + '18';
      })
      .attr('stroke', d => {
        if (d.id === selectedId) return '#c084fc';
        if (d.id === anchorId) return '#f59e0b';
        return d.ft.c;
      })
      .attr('stroke-width', d => d.id === selectedId ? 3 : (d.id === anchorId ? 2.5 : 1.5));

    sv.selectAll('.node-text')
      .attr('fill', d => {
        if (d.id === selectedId) return '#c084fc';
        if (d.id === anchorId) return '#f0e6ff';
        return '#8b7aa8';
      })
      .attr('font-weight', d => (d.id === selectedId || d.id === anchorId) ? 'bold' : 'normal');

  }, [selectedId, anchorId]);

  return (
    <svg
      ref={svgRef}
      style={{width:'100%', height:'100%', display:'block', background:'#020408'}}
    />
  );
}