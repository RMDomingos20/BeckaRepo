import { useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';

export function RepositoryOverview({ graph, name, onSelect, onOpenGraph }) {
  const { lang, t } = useTranslation();
  const pt = lang === 'pt';
  const leaders = useMemo(() => {
    const top = [];
    for (const file of graph.nodes) {
      if (!file.weight || (top.length === 4 && file.weight <= top[3].weight)) continue;
      top.push(file);
      top.sort((a,b) => b.weight - a.weight);
      if (top.length > 4) top.pop();
    }
    return top;
  }, [graph.nodes]);
  const fmt = new Intl.NumberFormat(pt ? 'pt-BR' : 'en');
  return <section className="repo-overview">
    <small>{pt ? 'Projeto aberto' : 'Open project'}</small><h1>{name}</h1>
    <div className="repo-metrics">{[[graph.nodes.length, t('graph_files')],[graph.edges.length,t('graph_edges')]].map(([n,label]) =>
      <div key={label}><strong>{fmt.format(n)}</strong><span>{label}</span></div>)}</div>
    <button className="br-primary" onClick={onOpenGraph}>{pt ? 'Abrir grafo global' : 'Open global graph'} <span aria-hidden="true">→</span></button>
    <h2>{pt ? 'Arquivos com mais conexões' : 'Most connected files'}</h2>
    {leaders.length ? <ul>{leaders.map(file => <li key={file.id}><button onClick={() => onSelect(file)}>
      <i style={{background:file.ft?.c}}/><span><b>{file.name}</b><small>{file.path}</small></span><strong>{fmt.format(file.weight)}</strong>
    </button></li>)}</ul> : <p>{pt ? 'Nenhuma conexão detectada. Escolha um arquivo na árvore para examinar seu conteúdo.' : 'No connections detected. Select a file in the tree to inspect its contents.'}</p>}
  </section>;
}
