import { useEffect, useRef, useState } from 'react';
import { DataSettings } from './DataSettings.jsx';
import { useTranslation } from '../hooks/useTranslation';
import { accents, validAccent } from '../styles/theme.js';

export function SettingsModal({ onClose, onRestored = () => {}, hasUnsaved = false, snapshotId, onImported }) {
  const { lang, setLang, t, density, preferences, setPreference, preferencesReady, preferencesError } = useTranslation();
  const pt = lang === 'pt';
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false);
  const accent = validAccent(preferences.accent) ? preferences.accent.toLowerCase() : accents.lilac;
  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => el.close();
  }, []);
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="guide-header"><h2 id="settings-title">{t('cfg_title')}</h2>
      <button className="br-btn" disabled={busy} onClick={onClose}>{pt ? 'Fechar' : 'Close'}</button></header>
    <div className="settings-body">
      <fieldset disabled={!preferencesReady || busy}><legend>{pt ? 'Aparência' : 'Appearance'}</legend>
        <div className="setting-label">{pt ? 'Cor de destaque' : 'Accent color'}</div>
        <div className="swatches">{Object.entries(accents).map(([key, value], i) =>
          <button key={key} className="br-btn" aria-pressed={accent === value} onClick={() => setPreference('accent', value)}>
            <i style={{ background: value }}/>{(pt ? ['Lilás', 'Azul', 'Sálvia'] : ['Lilac', 'Blue', 'Sage'])[i]}</button>)}</div>
        <label className="setting-row">{pt ? 'Cor personalizada' : 'Custom color'}
          <input type="color" value={accent} onChange={event => setPreference('accent', event.target.value)}/></label>
        <label className="setting-row">{pt ? 'Espaçamento' : 'Spacing'}
          <select className="br-input" value={density} onChange={event => setPreference('density', event.target.value)}>
            <option value="comfortable">{pt ? 'Confortável' : 'Comfortable'}</option>
            <option value="compact">{pt ? 'Compacto' : 'Compact'}</option>
          </select></label>
        <button className="settings-reset" disabled={accent === accents.lilac && density === 'comfortable'} onClick={() => {
          setPreference('accent', accents.lilac);
          setPreference('density', 'comfortable');
        }}>{pt ? 'Restaurar aparência original' : 'Reset appearance'}</button>
      </fieldset>
      <label className="setting-row">{t('cfg_lang')}
        <select className="br-input" value={lang} disabled={!preferencesReady || busy} onChange={event => setLang(event.target.value)}>
          <option value="pt">Português</option><option value="en">English</option>
        </select></label>
      {preferencesError && <p role="alert">{t('data_error')}: {preferencesError}</p>}
      <details className="settings-data"><summary>{t('data_title')}</summary>
        <DataSettings hasUnsaved={hasUnsaved} onRestored={onRestored} onBusy={setBusy} snapshotId={snapshotId} onImported={onImported}/>
      </details>
    </div>
  </dialog>;
}
