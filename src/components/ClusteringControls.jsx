import { CLUSTER_STRATEGY } from '../utils/clustering';
import { useTranslation } from '../hooks/useTranslation';

const strategies = [
  [CLUSTER_STRATEGY.FOLDER, 'cc_folder'], [CLUSTER_STRATEGY.SEMANTIC, 'cc_semantic'],
  [CLUSTER_STRATEGY.CONNECTIVITY, 'cc_modules'], [CLUSTER_STRATEGY.TYPE, 'cc_type'],
];

export function ClusterControls({ strategy, setStrategy, showHulls, setShowHulls, clusters, depth, setDepth, isolatedCluster, setIsolatedCluster }) {
  const { t, lang } = useTranslation();
  const pt = lang === 'pt';
  return <div className="map-rail">
    <label>{pt ? 'Agrupar por' : 'Group by'} <select className="br-input" value={strategy} onChange={e => setStrategy(e.target.value)}>
      {strategies.map(([value,key])=><option key={value} value={value}>{t(key)}</option>)}</select></label>
    {strategy === CLUSTER_STRATEGY.FOLDER && <>
      <button className="br-btn" aria-label={pt ? 'Reduzir profundidade' : 'Decrease depth'} disabled={depth <= 1} onClick={() => setDepth(depth - 1)}>−</button>
      <span>{pt ? 'Nível' : 'Level'} {depth}</span>
      <button className="br-btn" aria-label={pt ? 'Aumentar profundidade' : 'Increase depth'} onClick={() => setDepth(depth + 1)}>+</button>
    </>}
    <label><input type="checkbox" checked={showHulls} onChange={e => setShowHulls(e.target.checked)}/> {t('cc_hulls')}</label>
    {clusters.size > 0 && <label>{pt ? 'Isolar grupo' : 'Isolate group'} <select className="br-input" value={isolatedCluster || ''} onChange={e=>setIsolatedCluster(e.target.value || null)}>
      <option value="">{pt ? 'Todos os grupos' : 'All groups'}</option>
      {[...clusters.values()].map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
    </select></label>}
  </div>;
}
