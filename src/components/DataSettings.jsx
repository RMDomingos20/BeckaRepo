import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useTranslation } from '../hooks/useTranslation';
import { theme as T } from '../styles/theme.js';

export function DataSettings({ hasUnsaved, onRestored, onBusy, snapshotId, onImported }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [locations, setLocations] = useState([]), [previousPath, setPreviousPath] = useState('');
  useEffect(() => {
    let disposed = false;
    if (snapshotId && isTauri()) invoke('saved_locations', { snapshotId }).then(value => { if (!disposed) setLocations(value); }).catch(error => { if (!disposed) setMessage(String(error)); });
    return () => { disposed = true; };
  }, [snapshotId]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    if (isTauri()) invoke('database_status').then(value => { if (!disposed) setStatus(value); })
      .catch(error => { if (!disposed) setMessage(String(error)); });
    return () => { disposed = true; };
  }, []);
  const run = async action => {
    if (action !== 'backup' && hasUnsaved) { setMessage(t('notes_before_switch')); return; }
    setBusy(true); onBusy(true); setMessage('');
    try {
      const result = await invoke(action === 'reassociate' ? 'reassociate_location' : action === 'import' ? 'import_legacy_file' : action === 'restore' ? 'restore_database' : 'backup_database', action === 'reassociate' ? { snapshotId, previousPath } : action === 'import' ? { snapshotId } : {});
      if (['restore', 'reassociate'].includes(action) && result) {
        setMessage(t('data_restored'));
        onRestored();
        // Reload preferences and discard all old snapshot/session references after restore.
        window.location.reload();
      } else if (action === 'backup') setMessage(`${t('data_backed_up')}: ${result}`);
      else if (action === 'import' && result !== null) { setMessage(`${t('data_imported')}: ${result}`); onImported?.(); }
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); onBusy(false); }
  };
  return <section style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>
    <p style={{ overflowWrap: 'anywhere', userSelect: 'text' }}>{status?.path}</p>
    <p>{t('data_hint')}</p><p>{t('data_restore_hint')}</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="br-btn" disabled={busy || !isTauri() || Boolean(status?.error)} onClick={() => run('backup')}>{t('data_backup')}</button>
      <button className="br-btn" disabled={busy || !isTauri()} onClick={() => run('restore')}>{t('data_restore')}</button>
      {snapshotId && <button className="br-btn" disabled={busy || Boolean(status?.error)} onClick={() => run('import')}>{t('data_import')}</button>}
    </div>
    {snapshotId && <p>{t('data_import_hint')}</p>}
    {snapshotId && locations.length > 0 && <div style={{ marginTop: 12 }}>
      <p>{t('data_reassociate_hint')}</p>
      <select className="br-input" aria-label={t('data_previous')} value={previousPath} disabled={busy} onChange={e => setPreviousPath(e.target.value)} style={{ maxWidth: '100%' }}>
        <option value="">{t('data_previous')}</option>{locations.map(path => <option key={path} value={path}>{path}</option>)}
      </select>
      <button className="br-btn" disabled={busy || !previousPath || hasUnsaved} onClick={() => run('reassociate')}>{t('data_reassociate')}</button>
    </div>}
    <p role="status" style={{ color: T.amber, overflowWrap: 'anywhere', userSelect: 'text' }}>{busy ? t('data_busy') : message || status?.error}</p>
  </section>;
}
