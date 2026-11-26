import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { theme as T } from '../styles/theme.js';
import { indexPackages, packageConsumers } from '../utils/packageGraph.js';

const words = {
  pt: { title:'Dependências externas', hint:'Declaração, import observado e dependência do lockfile são relações distintas. Versão no lockfile não confirma instalação ou execução.', search:'Buscar pacote ou manifest', all:'Todos', declared:'Declarados', locked:'No lockfile', empty:'Nenhum pacote neste filtro.', prev:'Anterior', next:'Próxima', origin:'Origem', declaredVersion:'Versão declarada', resolved:'Versão no lockfile', unknown:'Não determinada', scope:'Escopo', consumers:'Arquivos consumidores', transitive:'Incluir impacto indireto pelo lockfile', indirect:'O impacto indireto indica um caminho no lockfile; não comprova uso em execução.', evidence:'Evidência', relations:'Relações do pacote', none:'Nenhum import comprovado na cobertura atual.', diagnostics:'Cobertura e diagnósticos', workspace:'Manifest local', graph:'Vizinhança do pacote', graphHint:'Retângulos representam pacotes; círculos representam arquivos. Exibindo até 12 relações; a lista abaixo é paginada.', select:'Selecione um pacote para consultar consumidores e evidências.' },
  en: { title:'External dependencies', hint:'Declarations, observed imports and lockfile dependencies are separate relations. A locked version does not confirm installation or execution.', search:'Search package or manifest', all:'All', declared:'Declared', locked:'In lockfile', empty:'No packages match this filter.', prev:'Previous', next:'Next', origin:'Origin', declaredVersion:'Declared version', resolved:'Locked version', unknown:'Unknown', scope:'Scope', consumers:'Consumer files', transitive:'Include indirect lockfile impact', indirect:'Indirect impact indicates a path in the lockfile; it does not prove runtime usage.', evidence:'Evidence', relations:'Package relations', none:'No imports established within current coverage.', diagnostics:'Coverage and diagnostics', workspace:'Local manifest', graph:'Package neighborhood', graphHint:'Rectangles represent packages; circles represent files. Showing up to 12 relations; the list below is paginated.', select:'Select a package to inspect consumers and evidence.' },
};
const bar = { display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', margin:'12px 0' };
const cell = { padding:8, textAlign:'left', borderBottom:`1px solid ${T.border}`, overflowWrap:'anywhere' };
function Pages({ page, count, setPage, w }) {
  return <div style={bar}><button className="br-btn" disabled={!page} onClick={() => setPage(page-1)}>{w.prev}</button>
    <span>{page+1} / {Math.max(1,Math.ceil(count/20))} · {count}</span>
    <button className="br-btn" disabled={(page+1)*20>=count} onClick={() => setPage(page+1)}>{w.next}</button></div>;
}
function Neighborhood({ selected, edges, index, graph, onPackage, onSelect, w }) {
  const rows = edges.slice(0,12), height = Math.max(100,rows.length*42);
  return <><p>{w.graphHint}</p><div style={{ overflowX:'auto' }}><svg role="img" aria-label={w.graph} viewBox={`0 0 800 ${height}`} style={{ width:'100%', minWidth:560, maxHeight:510 }}>
    <defs><marker id="package-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={T.textLow} /></marker></defs>
    <rect x="12" y={height/2-20} width="200" height="40" rx="5" fill={T.bgPanel} stroke={T.accent} />
    <text x="20" y={height/2+4} fill={T.textHi} fontSize="12">{selected.alias.slice(0,26)}</text>
    {rows.map((edge,i) => {
      const target = edge.source===selected.id ? edge.target : edge.source;
      const pkg=index.nodes.get(target), file=graph.nodeMap.get(target), y=i*42+22;
      return <g key={`${edge.kind}:${edge.source}:${edge.target}`}>
        <line x1="212" y1={height/2} x2="430" y2={y} stroke={T.border} markerEnd={edge.source===selected.id?'url(#package-arrow)':undefined} markerStart={edge.source!==selected.id?'url(#package-arrow)':undefined} strokeDasharray={edge.kind==='lock-dependency' ? '4 3' : undefined} />
        <g role="button" tabIndex={0} aria-label={pkg?.name || target} style={{ cursor:'pointer' }}
          onClick={() => pkg ? onPackage(pkg.id) : file && onSelect(file)}
          onKeyDown={e => { if (e.key==='Enter' || e.key===' ') { e.preventDefault(); if(pkg) onPackage(pkg.id); else if(file) onSelect(file); } }}>
          {pkg ? <rect x="432" y={y-8} width="16" height="16" rx="2" fill={T.accent} /> : <circle cx="440" cy={y} r="7" fill={T.textMid} />}
          <text x="458" y={y-2} fill={T.textHi} fontSize="11">{(pkg?.name || target).slice(0,44)}</text>
          <text x="458" y={y+13} fill={T.textMid} fontSize="10">{edge.kind} {pkg?.resolvedVersion || ''}</text>
          <title>{edge.detail}</title>
        </g>
      </g>;
    })}
  </svg></div></>;
}
function PackageDetail({ selected, index, graph, onSelect, onPackage, w }) {
  const [transitive,setTransitive]=useState(false), [page,setPage]=useState(0), [relationPage,setRelationPage]=useState(0);
  const consumers=useMemo(() => packageConsumers(index,selected.id,transitive),[index,selected.id,transitive]);
  const edges=useMemo(() => [...(index.incoming.get(selected.id)||[]),...(index.outgoing.get(selected.id)||[])],[index,selected.id]);
  const link = path => { const file=graph.nodeMap.get(path); return <button className="br-btn" disabled={!file} title={path} onClick={() => file && onSelect(file)}>{path}</button>; };
  return <section style={{ borderTop:`1px solid ${T.border}`, marginTop:16 }}>
    <h3>▣ {selected.name}</h3><p>{selected.ecosystem} · {selected.category} · {selected.alias}</p>
    <p>{w.scope}: {link(selected.manifest)}<br />{w.origin}: {selected.origin}<br />
      {w.declaredVersion}: <code>{selected.declaredVersion || w.unknown}</code><br />
      {w.resolved}: <code>{selected.resolvedVersion || w.unknown}</code>{selected.lockfile && <> · {selected.lockfile}</>}
      {selected.workspace && <><br />{w.workspace}: {link(selected.workspace)}</>}</p>
    <h4>{w.consumers} · {consumers.length}</h4>
    <label><input type="checkbox" checked={transitive} onChange={e => {setTransitive(e.target.checked);setPage(0);}} /> {w.transitive}</label>
    {transitive && <p>{w.indirect}</p>}
    {consumers.slice(page*20,page*20+20).map(edge => <div key={edge.source} style={{ padding:'8px 0' }}>{link(edge.source)}
      <details><summary>{w.evidence}{edge.evidence?.line ? ` · L${edge.evidence.line}` : ''}</summary>
        <div style={{ overflowWrap:'anywhere' }}>{edge.detail}<br />{edge.evidence && <>UTF-8 [{edge.evidence.startByte}, {edge.evidence.endByte})</>}
          {edge.via!==selected.id && <><br /><button className="br-btn" onClick={() => onPackage(edge.via)}>{index.nodes.get(edge.via)?.name || edge.via}</button></>}</div>
      </details></div>)}
    {!consumers.length && <p>{w.none}</p>}<Pages page={page} count={consumers.length} setPage={setPage} w={w} />
    <h4>{w.graph}</h4><Neighborhood selected={selected} edges={edges} index={index} graph={graph} onPackage={onPackage} onSelect={onSelect} w={w} />
    <h4>{w.relations} · {edges.length}</h4>
    {edges.slice(relationPage*20,relationPage*20+20).map(edge => {
      const other=edge.source===selected.id ? edge.target : edge.source;
      return <div key={`${edge.kind}:${edge.source}:${edge.target}`} style={{ padding:'6px 0',overflowWrap:'anywhere' }}>
        <code>{edge.kind}</code> · {index.nodes.has(other) ? <button className="br-btn" onClick={() => onPackage(other)}>{index.nodes.get(other).name} {index.nodes.get(other).resolvedVersion}</button> : link(other)}
        <details><summary>{w.evidence}</summary>{edge.detail}</details>
      </div>;
    })}<Pages page={relationPage} count={edges.length} setPage={setRelationPage} w={w} />
  </section>;
}
export function PackageInsights({ graph, onSelect }) {
  const { lang }=useTranslation(), w=words[lang] || words.pt;
  const [query,setQuery]=useState(''),[ecosystem,setEcosystem]=useState(''),[state,setState]=useState('declared'),[category,setCategory]=useState(''),[page,setPage]=useState(0),[selectedId,setSelectedId]=useState(null);
  const packages=graph.packages;
  const index=useMemo(() => indexPackages(packages),[packages]);
  const nodes=useMemo(() => [...index.nodes.values()].filter(n => (!ecosystem || n.ecosystem===ecosystem) && (!state || n.state===state) && (!category || n.category===category) && `${n.name} ${n.alias} ${n.manifest}`.toLowerCase().includes(query.toLowerCase())),[index,query,ecosystem,state,category]);
  const categories=useMemo(() => [...new Set([...index.nodes.values()].map(n=>n.category))].sort(),[index]);
  const change=(setter,value)=>{setter(value);setPage(0);};
  const selected=index.nodes.get(selectedId);
  const detailRef=useRef(null);
  useEffect(() => { if(selectedId) detailRef.current?.scrollIntoView({block:'start'}); },[selectedId]);
  return <section><h3>{w.title}</h3><p>{w.hint}</p><div style={bar}>
    <input className="br-input" aria-label={w.search} placeholder={w.search} value={query} onChange={e=>change(setQuery,e.target.value)} />
    <select className="br-input" aria-label="Ecossistema / Ecosystem" value={ecosystem} onChange={e=>change(setEcosystem,e.target.value)}><option value="">{w.all}</option>{['npm','cargo','maven'].map(v=><option key={v}>{v}</option>)}</select>
    <select className="br-input" aria-label="Estado / State" value={state} onChange={e=>change(setState,e.target.value)}><option value="">{w.all}</option><option value="declared">{w.declared}</option><option value="locked">{w.locked}</option></select>
    <select className="br-input" aria-label={w.scope} value={category} onChange={e=>change(setCategory,e.target.value)}><option value="">{w.all}</option>{categories.map(v=><option key={v}>{v}</option>)}</select>
  </div><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{[w.title,w.scope,w.declaredVersion,w.resolved].map(h=><th key={h} style={cell}>{h}</th>)}</tr></thead><tbody>
    {nodes.slice(page*20,page*20+20).map(n=><tr key={n.id} style={{background:n.id===selectedId?T.bgPanel:undefined}}>
      <td style={cell}><button className="br-btn" aria-pressed={n.id===selectedId} onClick={()=>setSelectedId(n.id)}>▣ {n.name}</button><div>{n.ecosystem} · {n.alias}</div></td>
      <td style={cell}>{n.manifest}<br />{n.category}</td><td style={cell}>{n.declaredVersion || '—'}</td><td style={cell}>{n.resolvedVersion || w.unknown}</td></tr>)}
  </tbody></table></div>{!nodes.length && <p>{w.empty}</p>}<Pages page={page} count={nodes.length} setPage={setPage} w={w} />
    <div ref={detailRef}>{selected ? <PackageDetail key={`${graph.snapshotId}:${selected.id}`} selected={selected} index={index} graph={graph} onSelect={onSelect} onPackage={setSelectedId} w={w} /> : <p>{w.select}</p>}</div>
    <details style={{ marginTop:16 }}><summary>{w.diagnostics} · {packages?.diagnostics?.length || 0}</summary>
      {packages?.diagnostics?.map((d,i)=><p key={i} style={{overflowWrap:'anywhere'}}>{d}</p>)}
      {!!packages?.diagnosticsOmitted && <p>+ {packages.diagnosticsOmitted}</p>}
    </details>
  </section>;
}
