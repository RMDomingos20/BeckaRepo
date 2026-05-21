import React, { useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';

const T = {
  bg:       '#030609',
  border:   '#1a1f35',
  accent:   '#c084fc',
  accentDim: '#c084fc22',
  textMid:  '#8b7aa8',
  textLow:  '#3d3550',
  textHi:   '#f0e6ff',
  mono:     "'JetBrains Mono', monospace",
};

// Mapa de cores por tipo de conexão para distinguir visualmente
const TYPE_COLORS = {
  import:      '#c084fc',
  require:     '#a855f7',
  're-export': '#e879f9',
  sibling:     '#38bdf8',
  docker:      '#22d3ee',
  'ci-ref':    '#34d399',
  reference:   '#64748b',
  include:     '#f59e0b',
  'rsi-ref':   '#f97316',
  'rsi-state': '#fb923c',
  'sprite-ref':'#fbbf24',
  'prototype-parent': '#e2e8f0',
};

function getTypeColor(type) {
  return TYPE_COLORS[type] || '#8b7aa8';
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
        fontSize: '8.5px',
        color: T.textLow,
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        fontFamily: T.mono,
        marginRight: 6,
        flexShrink: 0,
      }}>
        {t('cf_title')}
      </span>

      {/* Toggle All */}
      <button
        onClick={toggleAll}
        style={{
          background: allActive ? '#c084fc18' : 'transparent',
          border: `1px solid ${allActive ? T.accent : T.border}`,
          color: allActive ? T.accent : T.textLow,
          padding: '2px 9px',
          borderRadius: 10,
          fontSize: '8.5px',
          cursor: 'pointer',
          fontFamily: T.mono,
          fontWeight: 700,
          letterSpacing: '0.5px',
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
      >
        {allActive ? `${t('cf_all')} ✦` : t('cf_all')}
      </button>

      <div style={{width:1, height:14, background:T.border, flexShrink:0}} />

      {/* Type pills dinâmicos */}
      {availableTypes.map(type => {
        const isActive = activeTypes.has(type);
        const color = getTypeColor(type);
        return (
          <button
            key={type}
            onClick={() => toggleType(type)}
            style={{
              background: isActive ? color + '18' : 'transparent',
              border: `1px solid ${isActive ? color : T.border}`,
              color: isActive ? color : T.textLow,
              padding: '2px 9px',
              borderRadius: 10,
              fontSize: '8.5px',
              cursor: 'pointer',
              fontFamily: T.mono,
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