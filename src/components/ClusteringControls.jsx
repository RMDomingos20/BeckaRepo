import React from 'react';
import { CLUSTER_STRATEGY } from '../utils/clustering';

const T = {
  bg: '#030609', border: '#1a1f35', accent: '#c084fc',
  accentDim: '#c084fc22', teal: '#00d4aa', textMid: '#8b7aa8',
  textLow: '#3d3550', textHi: '#f0e6ff', mono: "'JetBrains Mono', monospace",
};

const STRATEGIES = [
  { key: CLUSTER_STRATEGY.FOLDER,       label: 'Pasta',      icon: '📁' },
  { key: CLUSTER_STRATEGY.SEMANTIC,     label: 'Arquitetura',icon: '🏗' },
  { key: CLUSTER_STRATEGY.CONNECTIVITY, label: 'Módulos',    icon: '🔗' },
  { key: CLUSTER_STRATEGY.TYPE,         label: 'Tipo',       icon: '🏷' },
];

export function ClusterControls({ strategy, setStrategy, showHulls, setShowHulls, clusters, depth, setDepth, isolatedCluster, setIsolatedCluster }) {
  const clusterArray = Array.from(clusters?.values() || []);

  return (
    <div style={{
      padding: '6px 14px', background: T.bg, borderBottom: `1px solid ${T.border}`,
      display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
    }}>
      <span style={{ fontSize: '8.5px', color: T.textLow, textTransform: 'uppercase', letterSpacing: '1.5px', fontFamily: T.mono, marginRight: 4 }}>
        Clusters
      </span>

      {STRATEGIES.map(s => {
        const isActive = strategy === s.key;
        return (
          <button
            key={s.key} onClick={() => setStrategy(s.key)}
            style={{
              background: isActive ? T.accentDim : 'transparent',
              border: `1px solid ${isActive ? T.accent : T.border}`,
              color: isActive ? T.accent : T.textLow,
              padding: '2px 9px', borderRadius: 10, fontSize: '8.5px',
              cursor: 'pointer', fontFamily: T.mono, fontWeight: isActive ? 700 : 400,
              display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s ease'
            }}
          >
            {s.icon} {s.label}
          </button>
        );
      })}

      {strategy === CLUSTER_STRATEGY.FOLDER && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <button onClick={() => setDepth(Math.max(1, depth - 1))} style={{ background:'none', border:'none', color:T.textMid, cursor:'pointer' }}>-</button>
          <span style={{ color:T.textHi, fontSize:'9px', fontFamily:T.mono }}>Lvl {depth}</span>
          <button onClick={() => setDepth(depth + 1)} style={{ background:'none', border:'none', color:T.textMid, cursor:'pointer' }}>+</button>
        </div>
      )}

      <div style={{ width: 1, height: 14, background: T.border, margin: '0 4px' }} />

      <button
        onClick={() => setShowHulls(!showHulls)}
        style={{
          background: showHulls ? '#00d4aa18' : 'transparent', border: `1px solid ${showHulls ? T.teal : T.border}`,
          color: showHulls ? T.teal : T.textLow, padding: '2px 9px', borderRadius: 10, fontSize: '8.5px',
          cursor: 'pointer', fontFamily: T.mono, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        {showHulls ? '◉' : '○'} NUVENS FÍSICAS
      </button>

      {clusterArray.length > 0 && (
        <select
          value={isolatedCluster || ''}
          onChange={e => setIsolatedCluster(e.target.value || null)}
          style={{
            background: isolatedCluster ? '#f43f5e18' : T.bg, border: `1px solid ${isolatedCluster ? '#f43f5e' : T.border}`,
            color: isolatedCluster ? '#f43f5e' : T.textMid, padding: '2px 6px', borderRadius: 5, fontSize: '9px',
            fontFamily: T.mono, outline: 'none', cursor: 'pointer', marginLeft: 'auto'
          }}
        >
          <option value="">-- Ver Todo o Grafo --</option>
          {clusterArray.map(c => <option key={c.id} value={c.id}>Isolar: {c.label}</option>)}
        </select>
      )}
    </div>
  );
}