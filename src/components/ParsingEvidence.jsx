import { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { theme as T } from '../styles/theme.js';

export function ParsingEvidence({ file, edges }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const parsing = file.parsing;
  if (!parsing) return null;
  return <details style={{ border: `1px solid ${T.border}`, padding: 10, margin: '12px 0', fontSize: 11, overflowWrap: 'anywhere' }}>
    <summary>{t('syntax_title')} · {parsing.engine} · {parsing.diagnostics.length + parsing.omitted}</summary>
    <p>{t('syntax_hint')}</p><code>{parsing.version}</code>
    {parsing.configuration && <p>{t('syntax_config')}: <code>{parsing.configuration}</code><br />{t(parsing.configuration.endsWith('Cargo.toml') ? 'syntax_cargo_hint' : 'syntax_config_hint')}</p>}
    {parsing.intraFileImports > 0 && <p>{parsing.intraFileImports} {t('syntax_internal')}</p>}
    {parsing.targets?.length > 0 && <section>
      <h4>{t('syntax_targets')}</h4><p>{t('syntax_targets_hint')}</p>
      {parsing.targets.map((target, i) => <div key={i} style={{ margin: '8px 0' }}>
        <strong>{target.name}</strong> · {target.kind}<br />
        <code>{target.manifest} → {target.root}</code><br />
        <code>crate{target.module ? `::${target.module}` : ''}</code>
      </div>)}
      {parsing.targetsOmitted > 0 && <p>{parsing.targetsOmitted} {t('syntax_omitted')}</p>}
    </section>}
    {parsing.diagnostics.map((message, i) => <p key={i} style={{ color: T.amber }}>{message}</p>)}
    {parsing.omitted > 0 && <p>{parsing.omitted} {t('syntax_omitted')}</p>}
    <h4>{t('syntax_edges')}</h4>
    {edges.slice(page * 20, (page + 1) * 20).map(edge => <div key={edge.id} style={{ margin: '8px 0' }}>
      <strong>{edge.detail}</strong> · {edge.type}<br />
      {typeof edge.target === 'object' ? edge.target.path : edge.target}<br />
      {edge.evidence ? <><code>{edge.evidence.engine} · L{edge.evidence.line} · [{edge.evidence.startByte}, {edge.evidence.endByte})</code>
        {edge.evidence.resolution && <div>{t('syntax_resolution')}: {edge.evidence.resolution}</div>}
        {edge.evidence.symbols?.length > 0 ? edge.evidence.symbols.map((binding, i) => <div key={i}>
          <code>{binding.name}{binding.alias ? ` → ${binding.alias}` : ''}</code> · {binding.kind} · [{binding.startByte}, {binding.endByte})
        </div>) : edge.evidence.bindings.map((binding, i) => <div key={i}>{binding}</div>)}</> : <code>heuristic / regex</code>}
    </div>)}
    {edges.length > 20 && <div>
      <button className="br-btn" disabled={page === 0} onClick={() => setPage(value => value - 1)}>{t('insight_previous')}</button>
      <span> {page + 1} / {Math.ceil(edges.length / 20)} </span>
      <button className="br-btn" disabled={(page + 1) * 20 >= edges.length} onClick={() => setPage(value => value + 1)}>{t('insight_next')}</button>
    </div>}
  </details>;
}
