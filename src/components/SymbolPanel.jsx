import { useEffect, useMemo, useState } from 'react';
import { readFileContent, readFileSymbols } from '../services/analysisClient.js';
import { useTranslation } from '../hooks/useTranslation';
import { theme as T } from '../styles/theme.js';

const words={pt:{loading:'Extraindo símbolos no Rust…',title:'Símbolos e complexidade',hint:'Análise deste arquivo, sob demanda. Identidades são vinculadas à revisão; não são âncoras permanentes para notas.',filter:'Buscar símbolo',zero:'Sem chamadas locais conhecidas',zeroHint:'Hipótese limitada a este arquivo. Exports, entrypoints, callbacks e consumidores externos podem não aparecer. Não exclua código com base apenas neste filtro.',partial:'Cobertura parcial: contagens e complexidade podem estar incompletas.',unsupported:'Linguagem ainda não suportada para símbolos.',prev:'Anterior',next:'Próxima',expand:'Expandir grafo do arquivo',collapse:'Recolher grafo',cc:'Complexidade de decisões',rules:'Regras: base 1; if, laços condicionais, catch, ternário, case, &&/|| e ? Rust somam 1; match soma braços menos 1. Funções aninhadas são contadas separadamente.',calls:'Chamadas observadas',resolved:'Destino lexical',unknown:'Sem destino resolvido',code:'Trecho do símbolo',evidence:'Decisões e evidências',public:'Export / visibilidade pública',entry:'Possível entrypoint',graphHint:'Até 40 símbolos da página e 80 relações resolvidas. O nó do arquivo é preservado como contexto; recolher mantém a seleção.',noSymbols:'Nenhum símbolo extraído na cobertura atual.'},en:{loading:'Extracting symbols in Rust…',title:'Symbols and complexity',hint:'On-demand analysis of this file. Identities are revision-bound and are not permanent note anchors.',filter:'Search symbol',zero:'No known local calls',zeroHint:'A hypothesis limited to this file. Exports, entrypoints, callbacks and external consumers may be absent. Do not delete code based on this filter alone.',partial:'Partial coverage: counts and complexity may be incomplete.',unsupported:'This language is not supported for symbols yet.',prev:'Previous',next:'Next',expand:'Expand file graph',collapse:'Collapse graph',cc:'Decision complexity',rules:'Rules: baseline 1; if, conditional loops, catch, ternary, case, &&/|| and Rust ? add 1; match adds arms minus 1. Nested functions are counted separately.',calls:'Observed calls',resolved:'Lexical target',unknown:'Unresolved target',code:'Symbol excerpt',evidence:'Decisions and evidence',public:'Export / public visibility',entry:'Possible entrypoint',graphHint:'Up to 40 symbols on this page and 80 resolved relations. The file remains as context; collapsing preserves selection.',noSymbols:'No symbols extracted within current coverage.'}};
const bar={display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',margin:'10px 0'};
function Pages({page,total,setPage,w}) {return <div style={bar}><button className="br-btn" disabled={!page} onClick={()=>setPage(page-1)}>{w.prev}</button><span>{page+1} / {Math.max(1,Math.ceil(total/40))} · {total}</span><button className="br-btn" disabled={(page+1)*40>=total} onClick={()=>setPage(page+1)}>{w.next}</button></div>;}
function SymbolGraph({file,symbols,calls,selected,onSelect,w}) {
  const [zoom,setZoom]=useState(1);
  const positions=new Map(symbols.map((s,i)=>[s.id,{x:60+(i%2)*160,y:100+Math.floor(i/2)*80}]));
  const edges=calls.filter(c=>positions.has(c.source)&&positions.has(c.target)).slice(0,80);
  const height=Math.max(200,Math.ceil(symbols.length/2)*80+130);
  return <><p>{w.graphHint}</p><label>Zoom <input type="range" min="1" max="2.5" step="0.25" value={zoom} onChange={e=>setZoom(Number(e.target.value))} /></label>
    <div style={{overflow:'auto',maxHeight:460,border:`1px solid ${T.border}`}}><svg aria-label={w.title} width={320*zoom} height={height*zoom} viewBox={`0 0 320 ${height}`}>
      <defs><marker id="symbol-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={T.accent}/></marker></defs>
      <rect x="10" y="8" width="300" height="35" rx="5" fill={T.bgCard} stroke={T.border}/><text x="20" y="30" fontSize="12" fill={T.textHi}>{file.name.slice(0,40)}</text>
      {edges.map((c,i)=>{const a=positions.get(c.source),b=positions.get(c.target);return <path key={i} d={c.source===c.target?`M ${a.x} ${a.y-12} c -28 -34 28 -34 8 0`:`M ${a.x} ${a.y} L ${b.x} ${b.y-13}`} stroke={T.accent} opacity="0.7" fill="none" markerEnd="url(#symbol-arrow)"><title>{c.expression} · L{c.line}</title></path>;})}
      {symbols.map(s=>{const p=positions.get(s.id);return <g key={s.id} role="button" tabIndex={0} aria-label={s.qualifiedName} onClick={()=>onSelect(s.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(s.id);}}} style={{cursor:'pointer'}}>
        <circle cx={p.x} cy={p.y} r={selected===s.id?15:11} fill={selected===s.id?T.accent:T.bgCard} stroke={T.accent}/><text x={p.x-45} y={p.y+30} fill={T.textHi} fontSize="10">{s.name.slice(0,20)}</text><title>{s.qualifiedName} · L{s.line}</title>
      </g>;})}
    </svg></div></>;
}
function Excerpt({file,symbol,w}) {
  const [result,setResult]=useState(null);
  useEffect(()=>{let active=true;readFileContent(file).then(r=>{if(active)setResult({key:symbol.id,...r});}).catch(e=>{if(active)setResult({key:symbol.id,error:String(e)});});return()=>{active=false;};},[file,symbol.id]);
  const text=useMemo(()=>{
    if(result?.key!==symbol.id||result.status!=='ready'||result.revision!==file.revision)return null;
    // Parser offsets are UTF-8 byte offsets; slicing a JS string by them corrupts Unicode.
    const bytes=new TextEncoder().encode(result.content);
    return new TextDecoder().decode(bytes.subarray(symbol.startByte,Math.min(symbol.endByte,symbol.startByte+24000)));
  },[result,symbol,file.revision]);
  return <details><summary>{w.code} · L{symbol.line}–{symbol.endLine}</summary>{text!==null?<pre style={{overflow:'auto',maxHeight:360,whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:T.mono,fontSize:11}}>{text}{symbol.endByte-symbol.startByte>24000?'\n… (24 KiB)':''}</pre>:<p>{result?.error||result?.status||w.loading}</p>}</details>;
}
export function SymbolPanel({file}) {
  const {lang}=useTranslation(),w=words[lang]||words.pt;
  const [result,setResult]=useState(null),[query,setQuery]=useState(''),[onlyZero,setOnlyZero]=useState(false),[page,setPage]=useState(0),[selectedId,setSelectedId]=useState(null),[expanded,setExpanded]=useState(false),[callPage,setCallPage]=useState(0);
  useEffect(()=>{let active=true;readFileSymbols(file).then(data=>{if(active)setResult({key:file.revision,data});}).catch(e=>{if(active)setResult({key:file.revision,error:String(e)});});return()=>{active=false;};},[file]);
  const report=result?.key===file.revision?result.data:null;
  const filtered=useMemo(()=>report?.symbols.filter(s=>(!onlyZero||s.complexity!==null&&s.incoming===0)&&s.qualifiedName.toLowerCase().includes(query.toLowerCase()))||[],[report,query,onlyZero]);
  const selected=report?.symbols.find(s=>s.id===selectedId);
  const calls=report?.calls.filter(c=>!selected||c.source===selected.id||c.target===selected.id)||[];
  const select=id=>{setSelectedId(id);setCallPage(0);};
  if(!report)return <p role="status" style={{padding:12}}>{result?.error||w.loading}</p>;
  return <section style={{padding:12,fontSize:12,color:T.textMid,overflowWrap:'anywhere'}}><h3>{w.title}</h3><p>{w.hint}</p><code>{report.version}</code>
    {report.status!=='ready'&&<p role="status" style={{color:T.amber}}>{report.status==='unsupported'?w.unsupported:w.partial}</p>}
    <p>{w.rules}</p><div style={bar}><input className="br-input" aria-label={w.filter} placeholder={w.filter} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/>
      <label><input type="checkbox" checked={onlyZero} onChange={e=>{setOnlyZero(e.target.checked);setPage(0);}}/>{w.zero}</label></div><p>{w.zeroHint}</p>
    <button className="br-btn" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?w.collapse:w.expand}</button>
    {expanded&&<SymbolGraph file={file} symbols={filtered.slice(page*40,page*40+40)} calls={report.calls} selected={selectedId} onSelect={select} w={w}/>}
    <Pages page={page} total={filtered.length} setPage={setPage} w={w}/>
    {filtered.slice(page*40,page*40+40).map(s=><div key={s.id} style={{borderBottom:`1px solid ${T.border}`,padding:'8px 0'}}><button className="br-btn" aria-pressed={s.id===selectedId} onClick={()=>select(s.id)}>{s.qualifiedName}</button><div>{s.kind} · L{s.line}–{s.endLine} · {w.cc}: {s.complexity??'—'} · ← {s.incoming}</div>{s.exported&&<span>{w.public} · </span>}{s.entrypoint&&<span>{w.entry}</span>}</div>)}
    {!filtered.length&&<p>{w.noSymbols}</p>}
    {selected&&<section style={{border:`1px solid ${T.border}`,padding:10,marginTop:12}}><h4>{selected.qualifiedName}</h4><code>UTF-8 [{selected.startByte}, {selected.endByte})</code><Excerpt key={selected.id} file={file} symbol={selected} w={w}/>
      <details><summary>{w.evidence} · {selected.decisions.length}</summary>{selected.decisions.map((d,i)=><p key={i}>L{d.line}: {d.rule} +{d.points} · [{d.startByte},{d.endByte})</p>)}{!!selected.decisionsOmitted&&<p>+{selected.decisionsOmitted}</p>}</details></section>}
    <h4>{w.calls} · {calls.length}</h4>{calls.slice(callPage*40,callPage*40+40).map((c,i)=><details key={`${callPage}:${i}`}><summary>L{c.line} · {c.expression} · {c.target?w.resolved:w.unknown}</summary><p>{c.resolution}</p><code>[{c.startByte},{c.endByte})</code>{c.target&&<button className="br-btn" onClick={()=>select(c.target)}>{report.symbols.find(s=>s.id===c.target)?.qualifiedName}</button>}</details>)}
    <Pages page={callPage} total={calls.length} setPage={setCallPage} w={w}/><details><summary>Diagnósticos / Diagnostics</summary>{report.diagnostics.map((d,i)=><p key={i}>{d}</p>)}{!!report.omitted&&<p>+{report.omitted}</p>}</details>
  </section>;
}
