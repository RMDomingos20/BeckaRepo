import React, { useEffect, useRef } from 'react';
import { useTranslation } from '../hooks/useTranslation';

const T = {
  bgDeep: '#020408', border: '#1a1f35', accent: '#c084fc',
  textHi: '#f0e6ff', textMid: '#8b7aa8', textLow: '#3d3550',
  mono: "'JetBrains Mono', monospace", hover: '#c084fc18'
};

export function ContextMenu({ menu, closeMenu, actions }) {
  const menuRef = useRef(null);
  const { t } = useTranslation(); // Puxando o tradutor

  // Fecha o menu se clicar fora
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) closeMenu();
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [closeMenu]);

  if (!menu.visible) return null;

  const isNode = !!menu.node;

  const btnStyle = {
    background: 'transparent', border: 'none', color: T.textMid,
    padding: '8px 14px', textAlign: 'left', fontSize: '10px',
    fontFamily: T.mono, cursor: 'pointer', display: 'flex', gap: '8px',
    alignItems: 'center', transition: 'all 0.1s'
  };

  return (
    <div ref={menuRef} style={{
      position: 'fixed', top: menu.y, left: menu.x, zIndex: 9999,
      background: '#03060de6', backdropFilter: 'blur(8px)',
      border: `1px solid ${T.accent}55`, borderRadius: '6px',
      boxShadow: '0 4px 24px #000000aa', display: 'flex', flexDirection: 'column',
      padding: '4px', minWidth: '160px', animation: 'fadeIn 0.1s ease-out'
    }}>
      {isNode ? (
        <>
          <div style={{ padding: '4px 8px', fontSize: '8px', color: T.textLow, textTransform: 'uppercase' }}>
            {t('ctx_file')}
          </div>
          <button style={btnStyle} onMouseEnter={e => { e.target.style.background = T.hover; e.target.style.color = T.textHi; }} onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = T.textMid; }} onClick={() => { actions.copyPath(menu.node); closeMenu(); }}>
            {t('ctx_copy')}
          </button>
          <button style={btnStyle} onMouseEnter={e => { e.target.style.background = T.hover; e.target.style.color = T.textHi; }} onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = T.textMid; }} onClick={() => { actions.isolateNodeCluster(menu.node); closeMenu(); }}>
            {t('ctx_iso_cluster')}
          </button>
          <button style={btnStyle} onMouseEnter={e => { e.target.style.background = T.hover; e.target.style.color = T.textHi; }} onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = T.textMid; }} onClick={() => { actions.focusNode(menu.node); closeMenu(); }}>
            {t('ctx_inspect')}
          </button>
        </>
      ) : (
        <>
          <div style={{ padding: '4px 8px', fontSize: '8px', color: T.textLow, textTransform: 'uppercase' }}>
            {t('ctx_global')}
          </div>
          <button style={btnStyle} onMouseEnter={e => { e.target.style.background = T.hover; e.target.style.color = T.textHi; }} onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = T.textMid; }} onClick={() => { actions.resetIsolation(); closeMenu(); }}>
            {t('ctx_show_all')}
          </button>
          <button style={btnStyle} onMouseEnter={e => { e.target.style.background = T.hover; e.target.style.color = T.textHi; }} onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = T.textMid; }} onClick={() => { actions.toggleHulls(); closeMenu(); }}>
            {t('ctx_toggle_hulls')}
          </button>
          <button style={btnStyle} onMouseEnter={e => { e.target.style.background = T.hover; e.target.style.color = T.textHi; }} onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = T.textMid; }} onClick={() => { actions.exportMd(); closeMenu(); }}>
            {t('ctx_export')}
          </button>
        </>
      )}
    </div>
  );
}