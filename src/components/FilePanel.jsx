import { useState, useEffect, useMemo, useRef } from 'react';
import { fmtBytes, hlCode } from '../utils/helpers';
import { loadAsset, readFileContent } from '../services/analysisClient.js';
import { ImagePreview } from './ImagePreview.jsx';
import { MiniGraph } from './MiniGraph';
import { useTranslation } from '../hooks/useTranslation';

import { theme as T } from '../styles/theme.js';
import { AnnotationEditor } from './AnnotationEditor.jsx';
import { ParsingEvidence } from './ParsingEvidence.jsx';
import { GitHistoryPanel } from './GitHistoryPanel.jsx';
import { SymbolPanel } from './SymbolPanel.jsx';

export function FilePanel({ file, graph, onSelect, termQuery, annotationEditor }) {
  const { t, lang } = useTranslation();
  const [tab, setTab] = useState('overview');
  const [anchorId, setAnchorId] = useState(file?.id);
  const isInternalChange = useRef(false);

  useEffect(() => {
    if (!isInternalChange.current) {
      setTab('overview');
      setAnchorId(file?.id);
    }
    isInternalChange.current = false;
  }, [file?.id]);

  const handleInternalSelect = (node) => {
    isInternalChange.current = true;
    onSelect(node);
  };

  const [textResult, setTextResult] = useState(null);
  const text = textResult?.file === file ? textResult : null;
  useEffect(() => {
    if (!file || tab !== 'code' || file.contentState === 'asset') return;
    let disposed = false;
    readFileContent(file).then(result => {
      if (!disposed) setTextResult({ file, ...result });
    }).catch(error => { if (!disposed) setTextResult({ file, error: String(error) }); });
    return () => { disposed = true; };
  }, [file, tab]);
  const highlightedCode = useMemo(() => {
    if (text?.status !== 'ready' || tab !== 'code') return null;
    const ext = file?.name.split('.').pop()?.toLowerCase() || '';
    return hlCode(text.content, ext, termQuery);
  }, [text, file, tab, termQuery]);

  const [asset, setAsset] = useState(null);
  const assetUrl = asset && asset.file === file ? asset.url : null;
  const assetError = asset && asset.file === file ? asset.error : null;
  useEffect(() => {
    const ext = file?.name.split('.').pop()?.toLowerCase();
    if (tab !== 'code' || !file || !['png','jpg','jpeg','gif','svg','webp','ico','mp3','mp4','wav','ogg'].includes(ext)) return;
    let disposed = false;
    let url;
    loadAsset(file).then(blob => {
      if (disposed) return;
      url = URL.createObjectURL(blob);
      setAsset({ file, url });
    }).catch(error => { if (!disposed) setAsset({ file, error: String(error) }); });
    return () => { disposed = true; if (url) URL.revokeObjectURL(url); };
  }, [file, tab]);

  // ── EMPTY STATE ─────────────────────────────────────────────────────────────
  if (!file) return (
    <div style={{
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      height:'100%', gap:14,
      color: T.textLow,
      fontFamily: T.ui,
      padding: 20,
    }}>
      {/* Animated node graphic */}
      <svg width="48" height="48" viewBox="0 0 48 48" style={{opacity:0.15}}>
        {[[8,8],[8,40],[40,8],[40,40],[24,24]].map(([cx,cy],i)=>(
          <circle key={i} cx={cx} cy={cy} r={4} fill="#a4b8c4" />
        ))}
        {[[8,8,40,8],[8,8,24,24],[40,8,24,24],[8,40,24,24],[40,40,24,24],[8,40,40,40]].map(([x1,y1,x2,y2],i)=>(
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a4b8c4" strokeWidth="1.5" />
        ))}
      </svg>
      <div style={{fontSize: 11, letterSpacing:'2px', textTransform:'uppercase', textAlign:'center'}}>
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


  const TABS = ['overview', 'code', 'graph', 'history', 'symbols'];

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
            fontSize: 11,
            fontWeight: 800,
            padding: '2px 7px',
            letterSpacing: '0.5px',
            fontFamily: T.ui,
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
            fontFamily: T.ui,
          }} title={file.name}>
            {file.name}
          </span>
        </div>
        <div style={{
          color: T.textLow,
          fontSize: 11,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: T.ui,
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
          <button key={tabKey} onClick={() => { if (tabKey !== tab) { setAsset(null); setTextResult(null); setTab(tabKey); } }} style={{
            flex: 1,
            padding: '7px 0',
            background: 'none',
            border: 'none',
            borderBottom: tab === tabKey ? `2px solid ${T.accent}` : '2px solid transparent',
            color: tab === tabKey ? T.accent : T.textLow,
            fontSize: 11,
            letterSpacing: '0.8px',
            cursor: 'pointer',
            fontFamily: T.ui,
            textTransform: 'uppercase',
            fontWeight: tab === tabKey ? 700 : 400,
            transition: 'all 0.15s ease',
          }}>
            {tabKey==='symbols' ? (lang==='pt'?'Símbolos':'Symbols') : t(`fp_tab_${tabKey}`)}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ─────────────────────────────────────────────────────── */}
      <div style={{flex:1, overflow:'auto'}}>
        {tab === 'history' && <GitHistoryPanel file={file} />}
        {tab === 'symbols' && <SymbolPanel key={`${file.snapshotId}:${file.id}:${file.revision}`} file={file} />}

        {/* VISÃO GERAL */}
        {tab==='overview' && (
          <div style={{padding:14, fontFamily: T.ui}}>
            {annotationEditor && <details className="file-notes"><summary>{t('notes_title')}</summary><AnnotationEditor key={`${file.worktreeId}:${file.path}`} editor={annotationEditor} /></details>}

            <ParsingEvidence key={`${file.snapshotId}:${file.id}`} file={file} edges={imports} />
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
                  <div style={{color:T.textLow, fontSize: 11, letterSpacing:'1px', marginBottom:4, textTransform:'uppercase'}}>
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
                <div style={{fontSize: 11, color:T.textLow, letterSpacing:'1px', marginBottom:6, textTransform:'uppercase'}}>
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
                  <span style={{color:T.amber, fontSize: 11, fontWeight:700, minWidth:20}}>{imports.length}</span>
                  <span style={{color:T.textLow, fontSize: 11}}>↑</span>
                  <span style={{color:T.textLow, fontSize: 11}}>↓</span>
                  <span style={{color:T.accent, fontSize: 11, fontWeight:700, minWidth:20, textAlign:'right'}}>{importedBy.length}</span>
                  <div style={{flex:1, height:3, borderRadius:2, background:T.accentDim, overflow:'hidden'}}>
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
                  fontSize: 11,
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
                      onMouseEnter={e=>{ e.currentTarget.style.borderColor=T.amber+'44'; e.currentTarget.style.background='#c2ac7e08'; }}
                      onMouseLeave={e=>{ e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background=T.bgCard; }}
                    >
                      <span style={{background:tn.ft.c+'22', color:tn.ft.c, borderRadius:3, fontSize: 11, fontWeight:800, padding:'1px 5px', flexShrink:0}}>
                        {tn.ft.l}
                      </span>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize: 11, color:T.textHi, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:600}}>
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
                  fontSize: 11,
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
                      onMouseEnter={e=>{ e.currentTarget.style.borderColor=T.borderHi; e.currentTarget.style.background=T.hover; }}
                      onMouseLeave={e=>{ e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background=T.bgCard; }}
                    >
                      <span style={{background:sn.ft.c+'22', color:sn.ft.c, borderRadius:3, fontSize: 11, fontWeight:800, padding:'1px 5px', flexShrink:0}}>
                        {sn.ft.l}
                      </span>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize: 11, color:T.textHi, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:600}}>
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
                  <ImagePreview key={file.id} url={assetUrl} name={file.name} hint={t('fp_img_hint')} />
                )}
              </div>
            ) : text?.status === 'ready' ? (
              <pre style={{
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderRadius: 7,
                padding: '12px 14px',
                fontSize: 12,
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
                fontSize: 11,
                padding: 20,
                textAlign: 'center',
                border: `1px dashed ${T.border}`,
                borderRadius: 7,
              }}>
                {assetError || text?.error || (file.contentState === 'asset' ? t('fp_unavailable') : !text ? t('content_loading') : text.status === 'changed' ? t('content_changed') : text.status === 'too-large' ? t('content_large') : t('fp_unavailable'))}
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
