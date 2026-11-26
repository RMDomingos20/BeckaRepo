import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from '../hooks/useTranslation';
import { theme as T } from '../styles/theme.js';

export function GitHistoryPanel({ file }) {
  const { t, lang } = useTranslation();
  const [days, setDays] = useState(90);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const jobRef = useRef(null);
  const snapshotId = file.snapshotId;
  const path = file.path;
  const key = JSON.stringify([snapshotId, path, days, revision]);
  const current = result?.key === key ? result : { busy: true };

  useEffect(() => {
    const job = { id: crypto.randomUUID(), cancelled: false };
    jobRef.current = job;
    invoke('git_file_history', { snapshotId, path, days, force: revision > 0, queryId: job.id }).then(data => {
      if (!job.cancelled && data.queryId === job.id && data.snapshotId === snapshotId) setResult({ key, busy: false, data });
    }).catch(error => { if (!job.cancelled) setResult({ key, busy: false, error: String(error) }); });
    return () => { job.cancelled = true; invoke('cancel_git', { queryId: job.id }).catch(() => {}); };
  }, [snapshotId, path, days, revision, key]);

  const cancel = () => {
    const job = jobRef.current;
    if (!job) return;
    job.cancelled = true;
    setResult({ key, busy: false, cancelled: true });
    invoke('cancel_git', { queryId: job.id }).catch(error => {
      if (jobRef.current === job) setResult({ key, busy: false, error: String(error) });
    });
  };
  const date = timestamp => {
    const value = new Date(timestamp * 1000);
    return Number.isFinite(value.getTime()) ? value.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US') : '—';
  };
  const context = current.data?.context;
  const history = current.data?.history;
  const partial = history && (history.truncated || context?.shallow || history.excludedRecords > 0);
  return <section style={{ padding: 14, fontFamily: T.ui, fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <label>{t('git_window')} <select className="br-input" value={days} onChange={event => setDays(Number(event.target.value))}>
        {[7, 30, 90, 365].map(value => <option key={value} value={value}>{value} {t('git_days')}</option>)}
      </select></label>
      {current.busy
        ? <button className="br-btn" onClick={cancel}>{t('load_cancel')}</button>
        : <button className="br-btn" onClick={() => setRevision(value => value + 1)}>{t('git_reload')}</button>}
    </div>
    <p style={{ color: T.textLow }}>{t('git_scope')}</p>
    <div role="status" style={{ color: current.error ? T.amber : T.textMid, overflowWrap: 'anywhere' }}>
      {current.busy && t('git_loading')}
      {current.cancelled && t('git_cancelled')}
      {current.error}
      {current.data?.warnings?.map((warning,i) => <p key={i} style={{ color: T.amber }}>{warning}</p>)}
      {current.data && current.data.status !== 'ready' && t(`git_${current.data.status}`)}
    </div>
    {context && <div style={{ padding: 10, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 6, marginTop: 12, overflowWrap: 'anywhere' }}>
      <div><strong>{context.branch || t('git_detached')}</strong>{context.linkedWorktree ? ` · ${t('git_worktree')}` : ''}</div>
      {context.head && <div title={context.head}>HEAD <code>{context.head.slice(0, 12)}</code></div>}
      <div>{t(context.trackedInIndex ? 'git_tracked' : 'git_untracked')}</div>
      <div>{t(`git_copy_${context.workingCopy}`)}</div><p style={{ fontSize: 11 }}>{t('git_copy_hint')}</p>
      {context.stagedChange && <div style={{ color: T.amber }}>{t('git_staged')}</div>}
      <details style={{ marginTop: 6 }}><summary style={{ cursor: 'pointer' }}>{t('git_location')}</summary>
        <div>{context.root}</div>
        <div>Git: {context.gitDir}</div>
        <div>{t('git_common')}: {context.commonDir}</div>
        {context.identity && <div>{t('insight_identity')}: {context.identity.worktreeId}</div>}
      </details>
    </div>}
    {history && <>
      <p style={{ fontSize: 11, color: T.textLow }}>{date(history.since)} — {date(history.until)}{current.data.cached ? ` · ${t('git_cached')}` : ''}</p>
      {partial && <p role="status" style={{ color: T.amber }}>{t('git_partial')}
        {history.truncated ? ` ${t('git_limit')}` : ''}
        {context.shallow ? ` ${t('git_shallow')}` : ''}
        {history.excludedRecords > 0 ? ` ${t('git_excluded')}: ${history.excludedRecords}.` : ''}
      </p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[[t('git_frequency'), history.frequency], [t('git_churn'), history.churn],
          [t('git_additions'), `+${history.additions}`], [t('git_deletions'), `−${history.deletions}`]].map(([label, value]) =>
          <div key={label} style={{ padding: 10, border: `1px solid ${T.border}`, borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: T.textLow }}>{label}</div><strong style={{ color: T.textHi, fontSize: 17 }}>{value}</strong>
          </div>)}
      </div>
      <p>{t('git_last')}: {history.lastChange ? date(history.lastChange) : t('git_none')}</p>
      <p style={{ fontSize: 11, color: T.textLow }}>{t('git_rules')}<br />
        {t('git_binary')}: {history.binaryCommits} · {t('git_renames')}: {history.renames}
      </p>
      {history.commits.length === 0 && <p>{t('git_empty')}</p>}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {history.commits.map(commit => <li key={commit.hash} style={{ padding: '10px 0', borderTop: `1px solid ${T.border}`, overflowWrap: 'anywhere' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <code title={commit.hash} style={{ userSelect: 'text', color: T.textHi }}>{commit.hash.slice(0, 12)}</code>
            <span>{commit.binary ? t('git_binary_file') : `+${commit.additions} / −${commit.deletions}`}</span>
          </div>
          <div style={{ fontSize: 11 }}>{date(commit.timestamp)}</div>
          {commit.previousPath && <div style={{ fontSize: 11 }}>{commit.previousPath} → {commit.path}</div>}
        </li>)}
      </ol>
    </>}
  </section>;
}
