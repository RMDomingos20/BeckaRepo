import { useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';

import { theme as T } from '../styles/theme.js';

// Mapa de cores por tipo de conexão para distinguir visualmente
const TYPE_COLORS = {
  import:      '#a4b8c4',
  require:     '#ab9db9',
  're-export': '#c1d0d8',
  sibling:     '#8eb1c5',
  docker:      '#8db5bd',
  'ci-ref':    '#8db2a0',
  reference:   '#98a3ad',
  include:     '#c2ac7e',
  'rsi-ref':   '#bd9679',
  'rsi-state': '#c4a084',
  'sprite-ref':'#c2b386',
  'prototype-parent': '#e5e7e9',
};

function getTypeColor(type) {
  return TYPE_COLORS[type] || '#b1b8bf';
}

export function ConnectionFilter({ graph, activeTypes, setActiveTypes }) {
  const { t } = useTranslation(); // Puxando o tradutor

  const availableTypes = useMemo(() => {
    if (!graph) return [];
    const types = new Set();
    graph.edges.forEach(e => types.add(e.type));
    return Array.from(types).sort();
  }, [graph]);

  if (!availableTypes.length) return null;

  const toggleType = (type) => {
    const newTypes = new Set(activeTypes);
    if (newTypes.has(type)) newTypes.delete(type);
    else newTypes.add(type);
    setActiveTypes(newTypes);
  };

  const allActive = availableTypes.every(type => activeTypes.has(type));

  const toggleAll = () => {
    if (allActive) setActiveTypes(new Set());
    else setActiveTypes(new Set(availableTypes));
  };

  return (
    <div style={{
      padding: '7px 14px',
      background: T.bg,
      borderBottom: `1px solid ${T.border}`,
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      {/* Label Principal */}
      <span style={{
        fontSize: 11,
        color: T.textLow,
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        fontFamily: T.ui,
        marginRight: 6,
        flexShrink: 0,
      }}>
        {t('cf_title')}
      </span>

      {/* Toggle All */}
      <button
        aria-pressed={allActive} onClick={toggleAll}
        style={{
          background: allActive ? '#a4b8c418' : 'transparent',
          border: `1px solid ${allActive ? T.accent : T.border}`,
          color: allActive ? T.accent : T.textLow,
          padding: '2px 9px',
          borderRadius: 10,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: T.ui,
          fontWeight: 700,
          letterSpacing: '0.5px',
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
      >
        {t('cf_all')}
      </button>

      <div style={{width:1, height:14, background:T.border, flexShrink:0}} />

      {/* Type pills dinâmicos */}
      {availableTypes.map(type => {
        const isActive = activeTypes.has(type);
        const color = getTypeColor(type);
        return (
          <button
            key={type}
            aria-pressed={isActive} onClick={() => toggleType(type)}
            style={{
              background: isActive ? color + '18' : 'transparent',
              border: `1px solid ${isActive ? color : T.border}`,
              color: isActive ? color : T.textLow,
              padding: '2px 9px',
              borderRadius: 10,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: T.ui,
              fontWeight: isActive ? 700 : 400,
              letterSpacing: '0.3px',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {isActive && (
              <span style={{
                display:'inline-block',
                width: 4, height: 4,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
              }} />
            )}
            {type}
          </button>
        );
      })}
    </div>
  );
}