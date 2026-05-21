// src/components/SettingsModal.jsx
import React from 'react';
import { useTranslation } from '../hooks/useTranslation';

const T = {
  bg: '#050810', bgDeep: '#020408', border: '#1a1f35',
  accent: '#c084fc', textHi: '#f0e6ff', textMid: '#8b7aa8', mono: "'JetBrains Mono', monospace",
};

export function SettingsModal({ onClose }) {
  const { lang, setLang, t } = useTranslation();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: '#020408ee', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        width: 400, background: T.bg, border: `1px solid ${T.accent}55`, borderRadius: 12,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: `0 0 80px ${T.accent}1a`
      }}>
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.border}`, background: T.bgDeep, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: T.textHi, fontSize: 14, fontWeight: 800, letterSpacing: '1px' }}>⚙️ {t('cfg_title')}</span>
        </div>

        <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Opção de Idioma */}
          <div>
            <div style={{ color: T.textMid, fontSize: 10, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>
              {t('cfg_lang')}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setLang('pt')} style={{
                flex: 1, padding: '10px', borderRadius: '6px', background: lang === 'pt' ? `${T.accent}22` : 'transparent',
                border: `1px solid ${lang === 'pt' ? T.accent : T.border}`, color: lang === 'pt' ? T.accent : T.textMid,
                cursor: 'pointer', fontFamily: T.mono, fontWeight: lang === 'pt' ? 700 : 400, transition: 'all 0.2s'
              }}>🇧🇷 Português</button>
              
              <button onClick={() => setLang('en')} style={{
                flex: 1, padding: '10px', borderRadius: '6px', background: lang === 'en' ? `${T.accent}22` : 'transparent',
                border: `1px solid ${lang === 'en' ? T.accent : T.border}`, color: lang === 'en' ? T.accent : T.textMid,
                cursor: 'pointer', fontFamily: T.mono, fontWeight: lang === 'en' ? 700 : 400, transition: 'all 0.2s'
              }}>🇺🇸 English</button>
            </div>
          </div>

        </div>

        <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: T.textHi, color: '#000', border: 'none', padding: '6px 16px', borderRadius: '4px',
            fontFamily: T.mono, fontWeight: 800, cursor: 'pointer', fontSize: 10, letterSpacing: '1px'
          }}>
            {t('cfg_close')}
          </button>
        </div>
      </div>
    </div>
  );
}