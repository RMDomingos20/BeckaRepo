import { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { theme as T } from '../styles/theme.js';

export function AnnotationEditor({ editor }) {
  const { t } = useTranslation();
  const [tag, setTag] = useState('');
  const { annotation, edit, save, discard, dirty, ready, saving, error } = editor;
  const add = event => {
    event.preventDefault();
    const value = tag.trim();
    if (value && !annotation.tags.includes(value) && annotation.tags.length < 32) {
      edit({ tags: [...annotation.tags, value] }); setTag('');
    }
  };
  return <section style={{ marginBottom: 18, padding: 12, border: `1px solid ${T.border}`, borderRadius: 6 }}>
    <fieldset disabled={!ready || saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <form onSubmit={add} style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
        <input className="br-input" style={{ minWidth: 0, flex: 1 }} maxLength={80} value={tag}
          placeholder={t('notes_new_tag')} onChange={event => setTag(event.target.value)} aria-label={t('notes_new_tag')} />
        <button className="br-btn" type="submit" disabled={!tag.trim() || annotation.tags.length >= 32}>{t('notes_add')}</button>
      </form>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {annotation.tags.map(value => <button key={value} className="br-btn" title={`${t('notes_remove')} ${value}`}
          onClick={() => edit({ tags: annotation.tags.filter(item => item !== value) })}>{value} ×</button>)}
      </div>
      <label style={{ display: 'block', fontSize: 11, color: T.textMid }}>
        {t('notes_note')}
        <textarea className="br-input" rows={5} maxLength={65536} value={annotation.note}
          onChange={event => edit({ note: event.target.value })}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', resize: 'vertical', marginTop: 6, lineHeight: 1.5 }} />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="br-btn primary" onClick={save} disabled={!dirty}>{t('notes_save')}</button>
        <button className="br-btn" onClick={discard} disabled={!dirty}>{t('notes_discard')}</button>
      </div>
    </fieldset>
    {error && <button className="br-btn" disabled={saving} onClick={editor.reload}>{t('notes_reload')}</button>}
    <p role="status" style={{ fontSize: 11, lineHeight: 1.5, margin: '10px 0 0', color: error ? T.amber : T.textLow, overflowWrap: 'anywhere' }}>
      {error || t(!ready ? 'notes_loading' : saving ? 'notes_saving' : dirty ? 'notes_dirty' : 'notes_saved')}
    </p>
  </section>;
}
