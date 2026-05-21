import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fmtBytes, hlCode } from '../utils/helpers';
import { MiniGraph } from './MiniGraph';
import { useTranslation } from '../hooks/useTranslation';

const T = {
  bg:       '#050810',
  bgDeep:   '#020408',
  bgPanel:  '#03060d',
  bgCard:   '#060b16',
  border:   '#1a1f35',
  accent:   '#c084fc',
  accentDim: '#c084fc18',
  teal:     '#00d4aa',
  amber:    '#f59e0b',
  purple:   '#a855f7',
  textHi:   '#f0e6ff',
  textMid:  '#8b7aa8',
  textLow:  '#3d3550',
  mono:     "'JetBrains Mono', monospace",
};

export function FilePanel({ file, graph, onSelect, termQuery }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('overview');
  const [anchorId, setAnchorId] = useState(file?.id);
  const isInternalChange = useRef(false);

  const [imgState, setImgState] = useState({ s: 1, x: 0, y: 0 });
  const isDraggingImg = useRef(false);
  const lastImgPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!isInternalChange.current) {
      setTab('overview');
      setAnchorId(file?.id);
    }
    isInternalChange.current = false;
  }, [file?.id]);

  useEffect(() => {
    setImgState({ s: 1, x: 0, y: 0 });
  }, [file?.id, tab]);

  const handleInternalSelect = (node) => {
    isInternalChange.current = true;
    onSelect(node);
  };

  const highlightedCode = useMemo(() => {
    if (!file?.content || tab !== 'code') return null;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    return hlCode(file.content, ext, termQuery);
  }, [file?.content, file?.name, tab, termQuery]);

  const [assetUrl, setAssetUrl] = useState(null);
  useEffect(() => {
    if (tab === 'code' && file?.fileRef) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isMedia = ['png','jpg','jpeg','gif','svg','webp','ico','mp3','mp4','wav','ogg'].includes(ext);
      if (isMedia) {
        const url = URL.createObjectURL(file.fileRef);
        setAssetUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    }
    setAssetUrl(null);
  }, [file, tab]);

  // ── EMPTY STATE ─────────────────────────────────────────────────────────────
  if (!file) return (
    <div style={{
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      height:'100%', gap:14,
      color: T.textLow,
      fontFamily: T.mono,
      padding: 20,
    }}>
      {/* Animated node graphic */}
      <svg width="48" height="48" viewBox="0 0 48 48" style={{opacity:0.15}}>
        {[[8,8],[8,40],[40,8],[40,40],[24,24]].map(([cx,cy],i)=>(
          <circle key={i} cx={cx} cy={cy} r={4} fill="#c084fc" />
        ))}
        {[[8,8,40,8],[8,8,24,24],[40,8,24,24],[8,40,24,24],[40,40,24,24],[8,40,40,40]].map(([x1,y1,x2,y2],i)=>(
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c084fc" strokeWidth="1.5" />
        ))}
      </svg>
      <div style={{fontSize:10, letterSpacing:'2px', textTransform:'uppercase', textAlign:'center'}}>
        Selecione um arquivo
      </div>
    </div>
  );

  const rid = x => typeof x==='object' ? x.id : x;
  const imports    = graph ? graph.edges.filter(e => rid(e.source)===file.id) : [];
  const importedBy = graph ? graph.edges.filter(e => rid(e.target)===file.id) : [];

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isVideo = ['mp4'].includes(ext);
  const isAudio = ['mp3','wav','ogg'].includes(ext);
  const isImage = !isVideo && !isAudio && assetUrl;

  const TABS = ['overview', 'code', 'graph'];

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', overflow:'hidden'}}>

      {/* ── FILE HEADER ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
        background: T.bgDeep,
      }}>
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
          <span style={{
            background: file.ft.c + '22',
            color: file.ft.c,
            borderRadius: 4,
            fontSize: '8px',
            fontWeight: 800,
            padding: '2px 7px',
            letterSpacing: '0.5px',
            fontFamily: T.mono,
            flexShrink: 0,
          }}>
            {file.ft.l}
          </span>
          <span style={{
            color: T.textHi,
            fontSize: 11,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: T.mono,
          }} title={file.name}>
            {file.name}
          </span>
        </div>
        <div style={{
          color: T.textLow,
          fontSize: 8.5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: T.mono,
          letterSpacing: '0.3px',
        }} title={file.path}>
          {file.path}
        </div>
      </div>

      {/* ── TABS ────────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
        background: T.bgDeep,
      }}>
        {TABS.map(tabKey => (
          <button key={tabKey} onClick={() => setTab(tabKey)} style={{
            flex: 1,
            padding: '7px 0',
            background: 'none',
            border: 'none',
            borderBottom: tab === tabKey ? `2px solid ${T.accent}` : '2px solid transparent',
            color: tab === tabKey ? T.accent : T.textLow,
            fontSize: '8px',
            letterSpacing: '0.8px',
            cursor: 'pointer',
            fontFamily: T.mono,
            textTransform: 'uppercase',
            fontWeight: tab === tabKey ? 700 : 400,
            transition: 'all 0.15s ease',
          }}>
            {t(`fp_tab_${tabKey}`)}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ─────────────────────────────────────────────────────── */}
      <div style={{flex:1, overflow:'auto'}}>

        {/* VISÃO GERAL */}
        {tab==='overview' && (
          <div style={{padding:14, fontFamily: T.mono}}>

            {/* Stats grid */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:16}}>
              {[
                [t('fp_size'), fmtBytes(file.size), T.textMid],
                [t('fp_imports'), imports.length, T.amber],
                [t('fp_importedBy'), importedBy.length, T.accent],
              ].map(([l,v,c]) => (
                <div key={l} style={{
                  background: T.bgCard,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  padding: '9px 10px',
                }}>
                  <div style={{color:T.textLow, fontSize:'7.5px', letterSpacing:'1px', marginBottom:4, textTransform:'uppercase'}}>
                    {l}
                  </div>
                  <div style={{color:c, fontSize:15, fontWeight:800}}>
                    {v}
                  </div>
                </div>
              ))}
            </div>

            {/* Connections bar */}
            {(imports.length > 0 || importedBy.length > 0) && (
              <div style={{
                marginBottom:16,
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderRadius:6,
                padding:'8px 10px',
              }}>
                <div style={{fontSize:'7.5px', color:T.textLow, letterSpacing:'1px', marginBottom:6, textTransform:'uppercase'}}>
                  {t('fp_coupling')}
                </div>
                <div style={{display:'flex', gap:4, alignItems:'center'}}>
                  <div style={{flex:1, height:3, borderRadius:2, background:`${T.amber}33`, overflow:'hidden'}}>
                    <div style={{
                      height:'100%',
                      width:`${Math.min(100, imports.length * 8)}%`,
                      background: T.amber,
                      borderRadius:2,
                    }} />
                  </div>
                  <span style={{color:T.amber, fontSize:8, fontWeight:700, minWidth:20}}>{imports.length}</span>
                  <span style={{color:T.textLow, fontSize:7}}>↑</span>
                  <span style={{color:T.textLow, fontSize:7}}>↓</span>
                  <span style={{color:T.accent, fontSize:8, fontWeight:700, minWidth:20, textAlign:'right'}}>{importedBy.length}</span>
                  <div style={{flex:1, height:3, borderRadius:2, background:`${T.accent}33`, overflow:'hidden'}}>
                    <div style={{
                      height:'100%',
                      width:`${Math.min(100, importedBy.length * 8)}%`,
                      background: T.accent,
                      borderRadius:2,
                      marginLeft:'auto',
                    }} />
                  </div>
                </div>
              </div>
            )}

            {/* Imports list */}
            {imports.length > 0 && (
              <div style={{marginBottom:14}}>
                <div style={{
                  color: T.textLow,
                  fontSize: '7.5px',
                  letterSpacing: '1.5px',
                  marginBottom: 7,
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{color:T.amber}}>↑</span> {t('fp_imports')} ({imports.length})
                </div>
                {imports.map((e,i) => {
                  const tn = graph.nodeMap.get(rid(e.target));
                  if (!tn) return null;
                  return (
                    <div
                      key={i}
                      onClick={() => handleInternalSelect(tn)}
                      style={{
                        display:'flex', alignItems:'center', gap:7,
                        padding:'6px 9px', marginBottom:2,
                        background: T.bgCard,
                        border:`1px solid ${T.border}`,
                        borderRadius:5, cursor:'pointer',
                        transition:'all 0.15s ease',
                      }}
                      onMouseEnter={e=>{ e.currentTarget.style.borderColor=T.amber+'44'; e.currentTarget.style.background='#f59e0b08'; }}
                      onMouseLeave={e=>{ e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background=T.bgCard; }}
                    >
                      <span style={{background:tn.ft.c+'22', color:tn.ft.c, borderRadius:3, fontSize:'6.5px', fontWeight:800, padding:'1px 5px', flexShrink:0}}>
                        {tn.ft.l}
                      </span>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize:9.5, color:T.textHi, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:600}}>
                          {tn.name}
                        </div>
                      </div>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.textLow} strokeWidth="2" style={{flexShrink:0}}>
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Imported by list */}
            {importedBy.length > 0 && (
              <div style={{marginBottom:14}}>
                <div style={{
                  color: T.textLow,
                  fontSize: '7.5px',
                  letterSpacing: '1.5px',
                  marginBottom: 7,
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{color:T.accent}}>↓</span> {t('fp_importedBy')} ({importedBy.length})
                </div>
                {importedBy.map((e,i) => {
                  const sn = graph.nodeMap.get(rid(e.source));
                  if (!sn) return null;
                  return (
                    <div
                      key={i}
                      onClick={() => handleInternalSelect(sn)}
                      style={{
                        display:'flex', alignItems:'center', gap:7,
                        padding:'6px 9px', marginBottom:2,
                        background: T.bgCard,
                        border:`1px solid ${T.border}`,
                        borderRadius:5, cursor:'pointer',
                        transition:'all 0.15s ease',
                      }}
                      onMouseEnter={e=>{ e.currentTarget.style.borderColor=T.accent+'44'; e.currentTarget.style.background='#c084fc08'; }}
                      onMouseLeave={e=>{ e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background=T.bgCard; }}
                    >
                      <span style={{background:sn.ft.c+'22', color:sn.ft.c, borderRadius:3, fontSize:'6.5px', fontWeight:800, padding:'1px 5px', flexShrink:0}}>
                        {sn.ft.l}
                      </span>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize:9.5, color:T.textHi, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:600}}>
                          {sn.name}
                        </div>
                      </div>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.textLow} strokeWidth="2" style={{flexShrink:0}}>
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CÓDIGO/CONTEÚDO */}
        {tab==='code' && (
          <div style={{padding:12, height:'100%', display:'flex', flexDirection:'column'}}>
            {assetUrl ? (
              <div style={{
                flex:1, display:'flex', alignItems:'center', justifyContent:'center',
                background: T.bgCard,
                border:`1px dashed ${T.border}`,
                borderRadius:8, padding:20,
                overflow:'hidden', position:'relative',
              }}>
                {isVideo ? (
                  <video src={assetUrl} controls style={{maxWidth:'100%', maxHeight:'100%', outline:'none', borderRadius:4}} />
                ) : isAudio ? (
                  <audio src={assetUrl} controls style={{outline:'none'}} />
                ) : (
                  <div
                    style={{width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', cursor: isDraggingImg.current ? 'grabbing' : 'grab'}}
                    onWheel={e => {
                      setImgState(p => ({ ...p, s: Math.max(0.1, Math.min(10, p.s - e.deltaY * 0.005)) }));
                    }}
                    onMouseDown={e => { isDraggingImg.current = true; lastImgPos.current = { x: e.clientX, y: e.clientY }; }}
                    onMouseMove={e => {
                      if (isDraggingImg.current) {
                        setImgState(p => ({ ...p, x: p.x + (e.clientX - lastImgPos.current.x), y: p.y + (e.clientY - lastImgPos.current.y) }));
                        lastImgPos.current = { x: e.clientX, y: e.clientY };
                      }
                    }}
                    onMouseUp={() => isDraggingImg.current = false}
                    onMouseLeave={() => isDraggingImg.current = false}
                  >
                    <img
                      src={assetUrl}
                      alt={file.name}
                      style={{
                        transform: `translate(${imgState.x}px, ${imgState.y}px) scale(${imgState.s})`,
                        transition: isDraggingImg.current ? 'none' : 'transform 0.1s ease-out',
                        maxWidth:'100%', maxHeight:'100%', objectFit:'contain', borderRadius:4, pointerEvents:'none',
                      }}
                    />
                    <div style={{
                      position:'absolute', bottom:10, right:10,
                      background:`${T.bgDeep}cc`, padding:'3px 8px',
                      borderRadius:4, fontSize:8, color:T.textMid,
                      pointerEvents:'none', border:`1px solid ${T.border}`,
                    }}>
                      {t('fp_img_hint')}
                    </div>
                  </div>
                )}
              </div>
            ) : highlightedCode ? (
              <pre style={{
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderRadius: 7,
                padding: '12px 14px',
                fontSize: 10.5,
                fontFamily: T.mono,
                lineHeight: 1.75,
                overflowX: 'auto',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: T.textHi,
              }}>
                {highlightedCode}
              </pre>
            ) : (
              <div style={{
                color: T.textLow,
                fontSize: 10,
                padding: 20,
                textAlign: 'center',
                border: `1px dashed ${T.border}`,
                borderRadius: 7,
              }}>
                {t('fp_unavailable')}
              </div>
            )}
          </div>
        )}

        {/* GRAFO LOCAL */}
        {tab==='graph' && (
          <div style={{height:'calc(100vh - 200px)', minHeight:300}}>
            <MiniGraph
              anchorId={anchorId}
              selectedId={file.id}
              graph={graph}
              onSelect={handleInternalSelect}
            />
          </div>
        )}
      </div>
    </div>
  );
}