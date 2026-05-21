import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';

const T = {
  bg: '#050810', bgDeep: '#020408', bgPanel: '#03060d', border: '#1a1f35',
  accent: '#c084fc', teal: '#00d4aa', rose: '#f43f5e', amber: '#f59e0b',
  purple: '#a855f7', blue: '#3b82f6', green: '#4ade80',
  textHi: '#f0e6ff', textMid: '#8b7aa8', textLow: '#3d3550',
  mono: "'JetBrains Mono', monospace",
};

// --- COMPONENTES VISUAIS PARA O MANUAL ---
const NodeEx = ({ c, r, label, outline = false }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#1a1f3544', padding:'2px 8px', borderRadius:12 }}>
    <span style={{ width:r, height:r, borderRadius:'50%', background: outline ? 'transparent' : c, border: outline ? `2px solid ${c}` : 'none', boxShadow: outline ? 'none' : `0 0 8px ${c}66` }} />
    <span style={{ color:T.textHi, fontSize:10 }}>{label}</span>
  </span>
);

const EdgeEx = ({ c, label, dashed = false }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#1a1f3544', padding:'2px 8px', borderRadius:12 }}>
    <svg width="24" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={c} strokeWidth="2" strokeDasharray={dashed ? "3,3" : "none"} /><polygon points="20,2 24,5 20,8" fill={c} /></svg>
    <span style={{ color:T.textHi, fontSize:10 }}>{label}</span>
  </span>
);

const PillEx = ({ c, label }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:`${c}18`, border:`1px solid ${c}`, padding:'2px 8px', borderRadius:10, color:c, fontSize:'9px', fontWeight:700 }}>
    <span style={{ width:4, height:4, borderRadius:'50%', background:c }} /> {label}
  </span>
);

const BtnEx = ({ label, color = T.teal }) => (
  <span style={{ display:'inline-block', padding:'2px 8px', border:`1px solid ${color}`, borderRadius:4, color:color, fontSize:9, fontWeight:800, background:`${color}18` }}>
    {label}
  </span>
);

const CodeTag = ({ children }) => (
  <code style={{ background:'#0d1326', color:T.accent, padding:'2px 6px', borderRadius:4, fontSize:'0.9em', border:`1px solid ${T.border}` }}>
    {children}
  </code>
);

export function ManualModal({ onClose }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('interface');

  const tabs = [
    { id: 'interface',   label: t('man_tab_1') },
    { id: 'painel',      label: t('man_tab_2') },
    { id: 'fundamentos', label: t('man_tab_3') },
    { id: 'clusters',    label: t('man_tab_4') },
    { id: 'conexoes',    label: t('man_tab_5') },
    { id: 'render',      label: t('man_tab_6') },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: '#020408ee', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        width: 1000, height: 700, background: T.bg, border: `1px solid ${T.accent}55`, borderRadius: 12,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: `0 0 80px ${T.accent}1a`
      }}>
        {/* HEADER */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.border}`, background: T.bgDeep, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, color: T.accent }}>✦</span>
            <span style={{ color: T.textHi, fontSize: 16, fontWeight: 800, letterSpacing: '1px' }}>{t('man_header')}</span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.textMid, borderRadius: 6, width: 32, height: 32, cursor: 'pointer', transition: 'all 0.2s' }}
             onMouseEnter={e => { e.target.style.color = T.rose; e.target.style.borderColor = T.rose; }} onMouseLeave={e => { e.target.style.color = T.textMid; e.target.style.borderColor = T.border; }}>✕</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* MENU LATERAL */}
          <div style={{ width: 240, borderRight: `1px solid ${T.border}`, background: T.bgPanel, display: 'flex', flexDirection: 'column', padding: 16, gap: 8 }}>
            {tabs.map(tData => (
              <button key={tData.id} onClick={() => setTab(tData.id)} style={{
                background: tab === tData.id ? T.accent + '22' : 'transparent', border: '1px solid', borderColor: tab === tData.id ? T.accent : 'transparent',
                color: tab === tData.id ? T.accent : T.textMid, padding: '10px 14px', borderRadius: 6, textAlign: 'left', fontSize: 11, cursor: 'pointer',
                fontWeight: tab === tData.id ? 700 : 400, transition: 'all 0.2s', letterSpacing: '0.5px'
              }}>
                {tData.label}
              </button>
            ))}
          </div>

          {/* CONTEÚDO SCROLLÁVEL */}
          <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto', color: T.textMid, fontSize: 12, lineHeight: 1.7 }}>
            
            {/* 1. INTERFACE E CONTROLES */}
            {tab === 'interface' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <h2 style={{ color: T.textHi, marginBottom: 16 }}>{t('man_1_h2')}</h2>
                <p>{t('man_1_p1')}</p>

                <h4 style={{ color: T.textHi, marginTop: 24 }}>{t('man_1_h4_1')}</h4>
                <ul style={{ paddingLeft: 20, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <li><BtnEx label={t('hdr_map')} />{t('man_1_li1_1')}<strong>Markdown (.md)</strong>{t('man_1_li1_2')}<code>README.md</code>{t('man_1_li1_3')}</li>
                  <li><strong>{t('man_1_li2_1')}</strong>{t('man_1_li2_2')}<CodeTag>{t('view_tree').toUpperCase()}</CodeTag>{t('man_1_li2_3')}<CodeTag>{t('view_global').toUpperCase()}</CodeTag>{t('man_1_li2_4')}</li>
                  <li><strong>{t('man_1_li3_1')}</strong>{t('man_1_li3_2')}<strong>{t('hdr_incode').replace('✦ ', '')}</strong>{t('man_1_li3_3')}<em>{t('view_term').toUpperCase()}</em>{t('man_1_li3_4')}<code>useState</code>).</li>
                </ul>

                <h4 style={{ color: T.textHi, marginTop: 24 }}>{t('man_1_h4_2')}</h4>
                <p>{t('man_1_p2')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, background: '#0d1326', padding: 16, borderRadius: 8, border: `1px solid ${T.border}` }}>
                  <PillEx c={T.accent} label="import" />
                  <PillEx c="#38bdf8" label="sibling" />
                  <PillEx c="#22d3ee" label="docker" />
                  <PillEx c="#e2e8f0" label="prototype-parent" />
                  <PillEx c="#f97316" label="rsi-ref" />
                </div>
                <p style={{ marginTop: 12 }}>
                  <strong>{t('man_1_p3_1')}</strong>{t('man_1_p3_2')}<CodeTag>sibling</CodeTag>{t('man_1_p3_3')}<CodeTag>import</CodeTag>{t('man_1_p3_4')}<CodeTag>prototype-parent</CodeTag>{t('man_1_p3_5')}
                </p>

                <h4 style={{ color: T.textHi, marginTop: 24 }}>{t('man_1_h4_3')}</h4>
                <p>{t('man_1_p4')}</p>
                <ul style={{ paddingLeft: 20, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <li><strong>{t('man_1_li4_1')}</strong>{t('man_1_li4_2')}<CodeTag>{t('man_1_li4_3')}</CodeTag>{t('man_1_li4_4')}<strong>{t('ctx_iso_cluster').replace('🔍 ', '')}</strong>{t('man_1_li4_5')}</li>
                  <li><strong>{t('man_1_li5_1')}</strong>{t('man_1_li5_2')}</li>
                </ul>
              </div>
            )}

            {/* 2. PAINEL LATERAL DIREITO & TAGS */}
            {tab === 'painel' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <h2 style={{ color: T.textHi, marginBottom: 16 }}>{t('man_2_h2')}</h2>
                <p>{t('man_2_p1')}</p>
                
                <h4 style={{ color: T.textHi, marginTop: 24 }}>{t('man_2_h4_1')}</h4>
                <ul style={{ paddingLeft: 20, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <li><strong>{t('man_2_li1_1')}</strong>{t('man_2_li1_2')}<strong>{t('fp_imports')} (↑)</strong>{t('man_2_li1_3')}<strong>{t('fp_importedBy')} (↓)</strong>{t('man_2_li1_4')}</li>
                  <li><strong>{t('man_2_li2_1')}</strong>{t('man_2_li2_2')}<span style={{color:'#fff', background:T.rose, padding:'0 2px'}}>{t('man_2_li2_3')}</span>.</li>
                  <li><strong>{t('man_2_li3_1')}</strong>{t('man_2_li3_2')}</li>
                </ul>

                <h4 style={{ color: T.amber, marginTop: 24 }}>{t('man_2_h4_2')}</h4>
                <div style={{ background: '#f59e0b11', border: `1px solid ${T.amber}44`, padding: 16, borderRadius: 8, marginTop: 12 }}>
                  <p>{t('man_2_p2')}</p>
                  <p style={{ marginTop: 8 }}><strong>{t('man_2_p3_1')}</strong>{t('man_2_p3_2')}<CodeTag>refactoring</CodeTag>, <CodeTag>core</CodeTag> ou <CodeTag>legacy</CodeTag>{t('man_2_p3_3')}<strong>LocalStorage</strong>{t('man_2_p3_4')}</p>
                </div>
              </div>
            )}

            {/* 3. FUNDAMENTOS VISUAIS */}
            {tab === 'fundamentos' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <h2 style={{ color: T.textHi, marginBottom: 16 }}>{t('man_3_h2')}</h2>
                <p>{t('man_3_p1')}<strong>Grafo Direcionado (Directed Graph)</strong>{t('man_3_p2')}</p>
                
                <h4 style={{ color: T.textHi, marginTop: 24, marginBottom: 12 }}>{t('man_3_h4_1')}</h4>
                <p>{t('man_3_p3')}<strong>{t('man_3_p4')}</strong>{t('man_3_p5')}</p>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
                  <NodeEx c={T.amber} r={8} label={t('man_3_lbl_1')} />
                  <NodeEx c={T.rose} r={8} label={t('man_3_lbl_2')} />
                  <NodeEx c={T.green} r={8} label={t('man_3_lbl_3')} />
                  <NodeEx c={T.teal} r={14} outline label={t('man_3_lbl_4')} />
                </div>

                <h4 style={{ color: T.textHi, marginTop: 32, marginBottom: 12 }}>{t('man_3_h4_2')}</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16, background: '#0d1326', padding: 16, borderRadius: 8, border: `1px solid ${T.border}` }}>
                  <EdgeEx c="#1e3a5f" label={t('man_3_lbl_5')} />
                  <EdgeEx c={T.teal} label={t('man_3_lbl_6')} />
                  <EdgeEx c={T.rose} label={t('man_3_lbl_7')} />
                </div>
              </div>
            )}

            {/* 4. CLUSTERS E FÍSICA */}
            {tab === 'clusters' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <h2 style={{ color: T.textHi, marginBottom: 16 }}>{t('man_4_h2')}</h2>
                <p>{t('man_4_p1')}<CodeTag>Clustering</CodeTag>).</p>

                <h4 style={{ color: T.textHi, marginTop: 24 }}>{t('man_4_h4_1')}</h4>
                <ul style={{ paddingLeft: 20, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <li><strong style={{color:T.accent}}>{t('man_4_li1_1')}</strong>{t('man_4_li1_2')}<CodeTag>Lvl 1, 2...</CodeTag>{t('man_4_li1_3')}</li>
                  <li><strong style={{color:T.accent}}>{t('man_4_li2_1')}</strong>{t('man_4_li2_2')}</li>
                  <li><strong style={{color:T.accent}}>{t('man_4_li3_1')}</strong>{t('man_4_li3_2')}<em>{t('man_4_li3_3')}</em>.</li>
                  <li><strong style={{color:T.accent}}>{t('man_4_li4_1')}</strong>{t('man_4_li4_2')}</li>
                </ul>

                <h4 style={{ color: T.teal, marginTop: 24 }}>{t('man_4_h4_2')}</h4>
                <p>{t('man_4_p2')}<strong>{t('man_4_p3')}</strong>{t('man_4_p4')}</p>
                
                <div style={{ background: '#00d4aa11', border: `1px solid ${T.teal}44`, padding: 16, borderRadius: 8, marginTop: 16 }}>
                  <strong style={{ display: 'block', marginBottom: 8, color: T.teal }}>{t('man_4_str_1')}</strong>
                  <p>{t('man_4_p5')}</p>
                  <p style={{ marginTop: 8 }}>{t('man_4_p6')}<strong>{t('man_4_p7')}</strong>{t('man_4_p8')}<CodeTag>{t('ctx_show_all')}</CodeTag>.</p>
                </div>
              </div>
            )}

            {/* 5. PARSER / CONEXÕES */}
            {tab === 'conexoes' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <h2 style={{ color: T.textHi, marginBottom: 16 }}>{t('man_5_h2')}</h2>
                <p>{t('man_5_p1')}</p>

                <h4 style={{ color: T.textHi, marginTop: 24 }}>{t('man_5_h4_1')}</h4>
                <p>{t('man_5_p2')}<CodeTag>package.json</CodeTag>{t('man_5_p3')}<CodeTag>ci-ref</CodeTag>.</p>

                <h4 style={{ color: T.textHi, marginTop: 24 }}>{t('man_5_h4_2')}</h4>
                <p>{t('man_5_p4')}</p>
                <p style={{ marginTop: 8 }}>{t('man_5_p5')}<CodeTag>.rsi</CodeTag>{t('man_5_p6')}<CodeTag>sprite: Mobs/Joe.rsi</CodeTag>{t('man_5_p7')}<CodeTag>meta.json</CodeTag>{t('man_5_p8')}</p>
              </div>
            )}

            {/* 6. RENDERIZAÇÃO E MINI-GRAFO */}
            {tab === 'render' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <h2 style={{ color: T.textHi, marginBottom: 16 }}>{t('man_6_h2')}</h2>
                
                <h4 style={{ color: T.textHi }}>{t('man_6_h4_1')}</h4>
                <p>{t('man_6_p1')}<strong>{t('man_6_p2')}</strong>{t('man_6_p3')}</p>
                
                <div style={{ background: '#f43f5e11', border: `1px solid ${T.rose}44`, padding: 12, borderRadius: 8, marginTop: 12 }}>
                  <strong style={{ color: T.rose }}>{t('man_6_str_1')}</strong>{t('man_6_p4')}
                </div>

                <h4 style={{ color: T.amber, marginTop: 32 }}>{t('man_6_h4_2')}</h4>
                <p>{t('man_6_p5')}<em>{t('man_6_p6')}</em>.</p>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '24px 0', border:`1px dashed ${T.border}`, padding: 20, borderRadius:8 }}>
                  <svg width="400" height="120" viewBox="0 0 400 120">
                    <line x1="200" y1="60" x2="100" y2="60" stroke="#f59e0b66" strokeWidth="2" />
                    <line x1="200" y1="60" x2="300" y2="30" stroke="#f59e0b66" strokeWidth="2" />
                    <line x1="200" y1="60" x2="300" y2="90" stroke="#f59e0b66" strokeWidth="2" />
                    <line x1="300" y1="30" x2="380" y2="10" stroke="#2a1f45" strokeWidth="1" strokeDasharray="3,3" />
                    <line x1="100" y1="60" x2="20" y2="60" stroke="#2a1f45" strokeWidth="1" strokeDasharray="3,3" />
                    
                    <circle cx="200" cy="60" r="16" fill={T.amber} stroke="#fff" strokeWidth="2" />
                    <text x="200" y="85" textAnchor="middle" fill="#fff" fontSize="10">{t('man_6_lbl_1')}</text>

                    <circle cx="100" cy="60" r="10" fill={T.purple} />
                    <text x="100" y="85" textAnchor="middle" fill={T.purple} fontSize="10">{t('man_6_lbl_2')}</text>

                    <circle cx="300" cy="30" r="10" fill={T.purple} />
                    <circle cx="300" cy="90" r="10" fill={T.purple} />
                    <text x="320" y="60" fill={T.purple} fontSize="10">{t('man_6_lbl_3')}</text>

                    <circle cx="380" cy="10" r="6" fill="#64748b" />
                    <circle cx="20" cy="60" r="6" fill="#64748b" />
                    <text x="20" y="80" textAnchor="middle" fill="#64748b" fontSize="9">{t('man_6_lbl_4')}</text>
                  </svg>
                </div>
                <p>{t('man_6_p7')}<strong>Hop 1</strong>{t('man_6_p8')}<strong>Hop 2</strong>{t('man_6_p9')}</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}