// src/utils/clustering.js
export const CLUSTER_STRATEGY = {
  FOLDER: 'folder',
  TYPE: 'type',
  CONNECTIVITY: 'connectivity',
  SEMANTIC: 'semantic'
};

const CLUSTER_PALETTE = [
  '#c084fc', '#00d4aa', '#f59e0b', '#38bdf8', '#f43f5e', '#4ade80',
  '#fb923c', '#818cf8', '#e879f9', '#34d399', '#fbbf24', '#60a5fa',
  '#f87171', '#a78bfa', '#2dd4bf', '#d946ef',
];

const TYPE_COLORS = {
  script: '#f59e0b', markup: '#f87171', style: '#f472b6',
  data: '#fbbf24', config: '#a3e635', asset: '#34d399',
  media: '#fb7185', other: '#6b7280',
};

function pickColor(index) {
  return CLUSTER_PALETTE[index % CLUSTER_PALETTE.length];
}

// ── 1. Por Pasta (Dinâmico) ──────────────────────────────────────────────────
function clusterByFolder(nodes, depth = 1) {
  const groups = new Map();
  for (const node of nodes) {
    const parts = node.path.split('/');
    // Ignora o root (parts[0]) a menos que seja raiz pura
    const labelParts = parts.length > 1 ? parts.slice(1, 1 + depth) : ['(raiz)'];
    const label = labelParts.length > 0 ? labelParts.join('/') : '(raiz)';
    
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(node);
  }

  const result = new Map();
  let i = 0;
  for (const [label, clusterNodes] of groups) {
    // Ignora pastas isoladas com poucos arquivos (limpa poluição visual)
    if (clusterNodes.length < 2 && depth > 1) continue; 
    const id = `folder:${label}`;
    result.set(id, { id, label, color: pickColor(i++), nodes: clusterNodes });
  }
  return result;
}

// ── 2. Por Tipo ───────────────────────────────────────────────────────────────
function clusterByType(nodes) {
  const groups = new Map();
  for (const node of nodes) {
    const group = node.ft?.g || 'other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(node);
  }

  const result = new Map();
  const labelMap = { script:'Scripts', markup:'Markup', style:'Estilos', data:'Dados', config:'Config', asset:'Assets', media:'Mídia', other:'Outros' };
  
  for (const [group, clusterNodes] of groups) {
    const id = `type:${group}`;
    result.set(id, { id, label: labelMap[group] || group, color: TYPE_COLORS[group] || '#6b7280', nodes: clusterNodes });
  }
  return result;
}

// ── 3. Por Semântica (Padrões) ───────────────────────────────────────────────
function clusterBySemantic(nodes) {
  const groups = new Map();
  const rules = [
    { regex: /test|spec|mock|fixture/i, label: 'Testes & Mocks' },
    { regex: /service|provider|api|client|fetch/i, label: 'Serviços & API' },
    { regex: /controller|handler|route|middleware/i, label: 'Controllers & Rotas' },
    { regex: /model|entity|dto|schema|type|interface/i, label: 'Modelos & Tipos' },
    { regex: /view|component|widget|page|layout|screen/i, label: 'Componentes UI' },
    { regex: /store|state|reducer|context/i, label: 'Estado Global' },
    { regex: /utils|helpers|constants|config|env/i, label: 'Utils & Config' }
  ];

  for (const node of nodes) {
    let label = 'Outros';
    for (const r of rules) {
      if (r.regex.test(node.path)) { label = r.label; break; }
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(node);
  }

  const result = new Map();
  let i = 0;
  for (const [label, clusterNodes] of groups) {
    if (label === 'Outros' && clusterNodes.length > nodes.length * 0.8) continue; // Evita cluster "Outros" se for quase tudo
    const id = `sem:${label}`;
    result.set(id, { id, label, color: pickColor(i++), nodes: clusterNodes });
  }
  return result;
}

// ── 4. Comunidades (Label Propagation Algorithm - LPA) ────────────────────────
function clusterByConnectivity(nodes, edges) {
  const adj = new Map();
  nodes.forEach(n => adj.set(n.id, []));
  edges.forEach(e => {
    const s = typeof e.source === 'object' ? e.source.id : e.source;
    const t = typeof e.target === 'object' ? e.target.id : e.target;
    if (adj.has(s)) adj.get(s).push(t);
    if (adj.has(t)) adj.get(t).push(s);
  });

  const labels = new Map();
  nodes.forEach((n, i) => labels.set(n.id, i)); // IDs únicos iniciais

  let changed = true;
  let iters = 0;
  while (changed && iters < 8) { // Máx 8 iterações para velocidade
    changed = false;
    iters++;
    const shuffled = [...nodes].sort(() => Math.random() - 0.5);
    
    for (const node of shuffled) {
      const neighbors = adj.get(node.id);
      if (neighbors.length === 0) continue;

      const counts = new Map();
      neighbors.forEach(neigh => {
        const l = labels.get(neigh);
        counts.set(l, (counts.get(l) || 0) + 1);
      });

      let maxCount = 0, bestLabel = labels.get(node.id);
      for (const [l, count] of counts) {
        if (count > maxCount) { maxCount = count; bestLabel = l; }
      }

      if (labels.get(node.id) !== bestLabel) {
        labels.set(node.id, bestLabel);
        changed = true;
      }
    }
  }

  const groups = new Map();
  nodes.forEach(n => {
    const l = labels.get(n.id);
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l).push(n);
  });

  const result = new Map();
  let i = 0;
  
  Array.from(groups.values())
    .sort((a, b) => b.length - a.length)
    .forEach(clusterNodes => {
      if (clusterNodes.length < 3) return; // Filtra microrredes para visualização limpa
      
      // Acha a pasta predominante para nomear o módulo
      const folderFreq = new Map();
      clusterNodes.forEach(n => {
        const p = n.path.split('/');
        const folder = p.length > 2 ? p[1] : p[0];
        folderFreq.set(folder, (folderFreq.get(folder) || 0) + 1);
      });
      const dominant = [...folderFreq.entries()].sort((a,b) => b[1]-a[1])[0][0];
      
      const id = `conn:${i}`;
      result.set(id, { id, label: `${dominant} (Módulo)`, color: pickColor(i++), nodes: clusterNodes });
    });

  return result;
}

export function clusterGraph(nodes, edges, strategy = 'folder', depth = 1) {
  if (!nodes || nodes.length === 0) return new Map();
  switch (strategy) {
    case CLUSTER_STRATEGY.TYPE: return clusterByType(nodes);
    case CLUSTER_STRATEGY.SEMANTIC: return clusterBySemantic(nodes);
    case CLUSTER_STRATEGY.CONNECTIVITY: return clusterByConnectivity(nodes, edges);
    case CLUSTER_STRATEGY.FOLDER:
    default: return clusterByFolder(nodes, depth);
  }
}

export function buildNodeClusterMap(clusters) {
  const map = new Map();
  for (const [clusterId, info] of clusters) {
    for (const node of info.nodes) map.set(node.id, clusterId);
  }
  return map;
}