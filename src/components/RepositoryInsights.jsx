import { useEffect, useMemo, useState } from 'react';
import { useNativeAnalysis } from '../hooks/useNativeAnalysis.js';
import { useTranslation } from '../hooks/useTranslation';
import { DenseGraphCanvas } from './DenseGraphCanvas.jsx';
import { PackageInsights } from './PackageInsights.jsx';
import { theme as T } from '../styles/theme.js';

const bar = { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 };
const box = { padding: 12, margin: '12px 0', border: `1px solid ${T.border}`, borderRadius: 6, lineHeight: 1.6 };
const cell = { padding: '8px 10px', borderBottom: `1px solid ${T.border}`, textAlign: 'left', verticalAlign: 'top' };
const precise = value => typeof value === 'number' ? value.toExponential(3) : '—';

function FileLink({ path, graph, onSelect }) {
  const { t } = useTranslation();
  const node = graph.nodeMap.get(path);
  return <button className="br-btn" disabled={!node} title={node ? path : `${path} · ${t('insight_absent')}`}
    style={{ textAlign: 'left', overflowWrap: 'anywhere', whiteSpace: 'normal', maxWidth: 440 }}
    onClick={() => { if (node) onSelect(node); }}>{path}</button>;
}
function QueryStatus({ query }) {
  const { t } = useTranslation();
  return <div style={bar}>
    <button className="br-btn" onClick={query.busy ? query.cancel : query.reload}>{t(query.busy ? 'load_cancel' : 'insight_refresh')}</button>
    <span role="status" style={{ color: query.error ? T.amber : T.textMid, overflowWrap: 'anywhere' }}>
      {query.busy ? t('insight_loading') : query.error || (query.cancelled ? t('insight_cancelled') : query.data?.cached ? t('insight_cache') : '')}
    </span>
  </div>;
}
function Table({ headers, children }) {
  return <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
    <thead><tr>{headers.map(header => <th style={{ ...cell, color: T.textHi }} key={header}>{header}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table></div>;
}

function Pages({ page, total, size = 100, onChange }) {
  const { t } = useTranslation();
  return <div style={{ ...bar, marginTop: 10 }}>
    <button className="br-btn" disabled={page === 0} onClick={() => onChange(page - 1)}>{t('insight_previous')}</button>
    <span>{page + 1} / {Math.max(1, Math.ceil(total / size))} · {total}</span>
    <button className="br-btn" disabled={(page + 1) * size >= total} onClick={() => onChange(page + 1)}>{t('insight_next')}</button>
  </div>;
}
function CochangeGraph({ graph, pairs, selectedFile, onSelect }) {
  const { t } = useTranslation();
  const logical = useMemo(() => {
    const edges = pairs.filter(pair => graph.nodeMap.has(pair.source) && graph.nodeMap.has(pair.target))
      .map(pair => ({ ...pair, id: JSON.stringify(['cochange', pair.source, pair.target]), type: 'cochange', bidirectional: true }));
    const ids = new Set(edges.flatMap(edge => [edge.source, edge.target]));
    return { snapshotId: graph.snapshotId, nodes: graph.nodes.filter(node => ids.has(node.id)), edges };
  }, [graph, pairs]);
  return <section>
    <p>{t('insight_logical_hint')} {logical.edges.length} / {pairs.length}</p>
    {logical.nodes.length > 0 ? <div style={{ height: 440, position: 'relative', display: 'flex', border: `1px solid ${T.border}` }}>
      <DenseGraphCanvas graph={logical} selectedFile={selectedFile} onSelect={onSelect} />
    </div> : <p>{t('insight_none')}</p>}
  </section>;
}
function GitOverview({ graph, onSelect, onReport, selectedFile }) {
  const { t, lang } = useTranslation();
  const [days, setDays] = useState(90), [massLimit, setMassLimit] = useState(50);
  const [minSupport, setMinSupport] = useState(3), [authors, setAuthors] = useState(false);
  const [filePage, setFilePage] = useState(0), [pairPage, setPairPage] = useState(0), [showLogical, setShowLogical] = useState(false);
  const change = (setter, value) => { setter(value); setFilePage(0); setPairPage(0); };
  const query = useNativeAnalysis('git_repository_insights', 'cancel_git', { snapshotId: graph.snapshotId, days, massLimit, minSupport, authors, filePage, pairPage });
  const data = query.data, report = data?.report;
  useEffect(() => { if (data) onReport(data.status === 'ready' ? data : null); }, [data, onReport]);
  const date = timestamp => new Date(timestamp * 1000).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US');
  return <section>
    <div style={bar}>
      <label>{t('git_window')} <select className="br-input" value={days} onChange={e => change(setDays,Number(e.target.value))}>{[7,30,90,365].map(n => <option key={n} value={n}>{n} {t('git_days')}</option>)}</select></label>
      <label>{t('insight_mass')} <select className="br-input" value={massLimit} onChange={e => change(setMassLimit,Number(e.target.value))}>{[10,20,50,100].map(n => <option key={n} value={n}>{n}</option>)}</select> {t('insight_files')}</label>
      <label>{t('insight_support')} <select className="br-input" value={minSupport} onChange={e => change(setMinSupport,Number(e.target.value))}>{[2,3,5,10].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label><input type="checkbox" checked={authors} onChange={e => { onReport(null); change(setAuthors,e.target.checked); }} /> {t('insight_authors')}</label>
    </div>
    <p>{t('insight_scope')}</p>
    {authors && <p>{t('insight_authors_hint')}</p>}
    <QueryStatus query={query} />
    {data && data.status !== 'ready' && <p role="status">{t(`git_${data.status}`)}</p>}
    {report && <>
      <div style={box}>
        <strong>{t('insight_coverage')}</strong> · HEAD <code title={data.head}>{data.head.slice(0,12)}</code><br />
        {date(report.since)} — {date(report.until)}<br />
        {report.examinedCommits} {t('insight_examined')} · {report.includedCommits} {t('insight_included')} · {report.massCommits} {t('insight_mass_excluded')} · {report.excludedRecords} {t('insight_records_excluded')}
        {report.truncated && <p style={{ color: T.amber }}>{t('insight_truncated')}</p>}
        {data.shallow && <p style={{ color: T.amber }}>{t('git_shallow')}</p>}
        {data.warnings?.map((warning,i) => <p style={{ color: T.amber, overflowWrap: 'anywhere' }} key={i}>{warning}</p>)}
        {data.identity && <details><summary>{t('insight_identity')}</summary><div style={{ overflowWrap: 'anywhere' }}>
          {data.root}<br />{t('insight_snapshot')}: {graph.snapshotId}<br />Repository: {data.identity.repositoryId}<br />Worktree: {data.identity.worktreeId}
        </div></details>}
      </div>
      <h3>{t('insight_score')}</h3><p>{t('insight_formula')}</p>
      <p>{t('insight_top')} {report.totalFiles} {t('insight_files')}.</p>
      <Table headers={[t('insight_file'),t('insight_score'),t('insight_churn'),t('insight_frequency'),t('insight_last')]}>
        {report.files.map(file => <tr key={file.path}>
          <td style={cell}><FileLink path={file.path} graph={graph} onSelect={onSelect} />
            <div style={{ fontSize: 11 }}>{file.binaryCommits} / {file.renames} {t('insight_binary_rename')}</div>
            {authors && <details><summary>{t('insight_author_details')}</summary>{file.authors.map(author => <div key={author} style={{ overflowWrap: 'anywhere' }}>{author}</div>)}
              {file.authorsOmitted > 0 && <div>{file.authorsOmitted} {t('insight_author_omitted')}</div>}</details>}
          </td>
          <td style={cell}>{file.score.toFixed(1)}</td><td style={cell}>{file.churn}<div style={{ fontSize: 11 }}>+{file.additions} / −{file.deletions}</div></td>
          <td style={cell}>{file.frequency}</td><td style={cell}>{date(file.lastChange)}</td>
        </tr>)}
      </Table>
      <Pages page={filePage} total={report.totalFiles} onChange={setFilePage} />
      {report.files.length === 0 && <p>{t('insight_none')}</p>}
      <h3>{t('insight_pairs')}</h3><p>{t('insight_pairs_hint')}</p>
      <p>{t('insight_top')} {report.totalPairs} {t('insight_pairs_total')}.</p>
      <Table headers={['A','B',t('insight_pair_support'),'P(B|A)','P(A|B)']}>
        {report.pairs.map(pair => <tr key={JSON.stringify([pair.source,pair.target])}>
          <td style={cell}><FileLink path={pair.source} graph={graph} onSelect={onSelect} /></td>
          <td style={cell}><FileLink path={pair.target} graph={graph} onSelect={onSelect} /></td>
          <td style={cell}>{pair.support}</td><td style={cell}>{(pair.targetGivenSource*100).toFixed(1)}%</td><td style={cell}>{(pair.sourceGivenTarget*100).toFixed(1)}%</td>
        </tr>)}
      </Table>
      <Pages page={pairPage} total={report.totalPairs} onChange={setPairPage} />
      <label><input type="checkbox" checked={showLogical} onChange={e => setShowLogical(e.target.checked)} /> {t('insight_logical')}</label>
      {showLogical && <CochangeGraph graph={graph} pairs={report.pairs} selectedFile={selectedFile} onSelect={onSelect} />}
      {report.pairs.length === 0 && <p>{t('insight_none')}</p>}
    </>}
  </section>;
}

function CycleCard({ cycle, graph, onSelect }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  return <div style={box}>
    <button className="br-btn" aria-expanded={open} onClick={() => setOpen(value => !value)}>#{cycle.id+1} · {cycle.size} {t('insight_members')}</button>
    {open && <>
      <p>{t('insight_witness')}</p>
      <div style={{ ...bar, gap: 4 }}>{cycle.witness.map((path,i) => <span key={`${i}:${path}`}>{i>0 && ' → '}<FileLink path={path} graph={graph} onSelect={onSelect} /></span>)}</div>
      {cycle.witnessTruncated && <p style={{ color: T.amber }}>{t('insight_witness_partial')}</p>}
    </>}
  </div>;
}
function StructureOverview({ graph, onSelect, selectedFile, gitReport }) {
  const { t } = useTranslation();
  const [inheritance, setInheritance] = useState(false), [samples, setSamples] = useState(16);
  const [sort, setSort] = useState('pageRank'), [filter, setFilter] = useState(''), [input, setInput] = useState('');
  const [page, setPage] = useState(0), [cyclePage, setCyclePage] = useState(0);
  const query = useNativeAnalysis('structural_metrics', 'cancel_structure', {
    snapshotId: graph.snapshotId, inheritance, samples, sort, filter, page, cyclePage, selectedPath: selectedFile?.path || null,
  });
  const data = query.data;
  const change = (setter, value) => { setter(value); setPage(0); setCyclePage(0); };
  const gitFile = gitReport?.snapshotId === graph.snapshotId ? gitReport.report?.files.find(file => file.path === selectedFile?.path) : null;
  return <section>
    <div style={bar}>
      <label><input type="checkbox" checked={inheritance} onChange={e => change(setInheritance,e.target.checked)} /> {t('insight_inheritance')}</label>
      <label>{t('insight_samples')} <select className="br-input" value={samples} onChange={e => change(setSamples,Number(e.target.value))}>
        <option value={0}>{t('insight_disabled')}</option>{[8,16,32].map(n => <option key={n} value={n}>{n} {t('insight_pivots')}</option>)}
      </select></label>
      <label>{t('insight_sort')} <select className="br-input" value={sort} onChange={e => change(setSort,e.target.value)}>
        <option value="pageRank">PageRank</option><option value="inDegree">{t('insight_in_degree')}</option><option value="outDegree">{t('insight_out_degree')}</option><option value="betweenness">Betweenness</option>
      </select></label>
      <form onSubmit={e => { e.preventDefault(); change(setFilter,input.trim()); }} style={bar}>
        <input className="br-input" value={input} maxLength={128} aria-label={t('insight_filter')} placeholder={t('insight_filter')} onChange={e => setInput(e.target.value)} />
        <button className="br-btn" type="submit">{t('insight_apply')}</button>
      </form>
    </div>
    <p>{t('insight_projection')}</p><QueryStatus query={query} />
    {data && <>
      <div style={box}>
        <strong>{t('insight_graph')}</strong>: {data.nodeCount} {t('insight_nodes')} · {data.edgeCount} {t('insight_edges')}<br />
        PageRank: {data.iterations} {t('insight_iterations')} · {t('insight_residual')}: {precise(data.residual)}<br />
        {samples > 0 && <>Betweenness: {data.sampleCount} {t('insight_pivots')} · {t(data.betweennessExact ? 'insight_exact' : 'insight_approx')}</>}
        {!data.converged && <p style={{ color: T.amber }}>{t('insight_no_convergence')}</p>}
        <details><summary>{t('insight_warning')}</summary><p>{t('insight_metric_formula')}</p><code>{data.algorithm} · {graph.snapshotId}</code></details>
      </div>
      {data.selected && <div style={box}>
        <strong>{t('insight_evidence')}</strong><div style={{ overflowWrap: 'anywhere' }}>{data.selected.path}</div>
        <p>PageRank {precise(data.selected.pageRank)} · Betweenness {precise(data.selected.betweenness)} · {t('insight_churn')} {gitFile?.churn ?? '—'} · {t('insight_frequency')} {gitFile?.frequency ?? '—'}</p>
        {gitFile && <code>HEAD {gitReport.head.slice(0,12)} · {new Date(gitReport.report.since*1000).toISOString().slice(0,10)} — {new Date(gitReport.report.until*1000).toISOString().slice(0,10)}</code>}
        <p>{t('insight_cross_hint')}</p>
      </div>}
      <Table headers={[t('insight_file'),t('insight_in_degree'),t('insight_out_degree'),'PageRank','Betweenness',t('insight_cyclic')]}>
        {data.rows.map(row => <tr key={row.path}>
          <td style={cell}><FileLink path={row.path} graph={graph} onSelect={onSelect} /></td>
          <td style={cell}>{row.inDegree}</td><td style={cell}>{row.outDegree}</td><td style={cell}>{precise(row.pageRank)}</td><td style={cell}>{precise(row.betweenness)}</td><td style={cell}>{row.cycle == null ? '—' : `#${row.cycle+1}`}</td>
        </tr>)}
      </Table>
      <div style={{ ...bar, marginTop: 12 }}>
        <button className="br-btn" disabled={page===0} onClick={() => setPage(value => value-1)}>{t('insight_previous')}</button>
        <span>{page+1} / {Math.max(1,Math.ceil(data.total/100))} · {data.total} {t('insight_files')}</span>
        <button className="br-btn" disabled={(page+1)*100>=data.total} onClick={() => setPage(value => value+1)}>{t('insight_next')}</button>
      </div>
      <h3>{t('insight_cycles')}: {data.totalCycles} · {data.cycleNodes} {t('insight_cycle_nodes')}</h3>
      <p>{t('insight_cycle_hint')}</p>
      {data.cycles.map(cycle => <CycleCard key={`${graph.snapshotId}:${inheritance}:${cycle.id}`} cycle={cycle} graph={graph} onSelect={onSelect} />)}
      <Pages page={cyclePage} total={data.totalCycles} size={20} onChange={setCyclePage} />
      {data.totalCycles===0 && <p>{t('insight_none')}</p>}
    </>}
  </section>;
}

export function RepositoryInsights({ graph, onSelect, selectedFile }) {
  const { t, lang } = useTranslation();
  const [tab, setTab] = useState('git'), [gitReport, setGitReport] = useState(null);
  return <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16, fontFamily: T.ui, color: T.textMid, fontSize: 12, lineHeight: 1.5 }}>
    <nav style={bar} aria-label={t('view_analysis')}>
      <button className={`br-btn ${tab==='git' ? 'primary' : ''}`} aria-pressed={tab==='git'} onClick={() => setTab('git')}>{t('insight_git')}</button>
      <button className={`br-btn ${tab==='structure' ? 'primary' : ''}`} aria-pressed={tab==='structure'} onClick={() => setTab('structure')}>{t('insight_structure')}</button>
      <button className={`br-btn ${tab==='packages' ? 'primary' : ''}`} aria-pressed={tab==='packages'} onClick={() => setTab('packages')}>{lang==='pt' ? 'Dependências externas' : 'External dependencies'}</button>
    </nav>
    {tab==='git' ? <GitOverview graph={graph} onSelect={onSelect} selectedFile={selectedFile} onReport={setGitReport} />
      : tab==='packages' ? <PackageInsights key={graph.snapshotId} graph={graph} onSelect={onSelect} />
      : <StructureOverview graph={graph} onSelect={onSelect} selectedFile={selectedFile} gitReport={gitReport} />}
  </div>;
}
