import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { countTree } from '../utils/helpers';

// Subcomponente isolado para gerenciar o foco (scroll) de cada arquivo
const TreeFileItem = memo(function TreeFileItem({ f, selected, onSelect, indent, nodeName }) {
  const isSel = selected?.id === f.id;
  const elRef = useRef(null);

  useEffect(() => {
    // Quando este arquivo for selecionado e estiver renderizado na tela
    if (isSel && elRef.current) {
      // O timeout garante que se alguma pasta pai precisou abrir, 
      // o DOM já atualizou as alturas antes do cálculo do scroll.
      const timer = setTimeout(() => {
        elRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isSel]);

  return (
    <button className="tree-row" aria-pressed={isSel} ref={elRef}
      onClick={() => onSelect(f)}
      style={{ display:'flex', alignItems:'center', gap:5, padding:'var(--row-pad) 8px', paddingLeft: indent + (nodeName ? 30 : 8), cursor:'pointer', borderRadius:3, background: isSel ? 'var(--accentDim)' : 'transparent', borderLeft: isSel ? '2px solid var(--accent)' : '2px solid transparent', marginLeft:0 }}
      onMouseEnter={e => { if(!isSel) e.currentTarget.style.background='var(--hover)'; }}
      onMouseLeave={e => { if(!isSel) e.currentTarget.style.background='transparent'; }}
    >
      <span style={{ background:f.ft.c+'30', color:f.ft.c, borderRadius:2, fontSize: 11, fontWeight:800, padding:'1px 3px', flexShrink:0, minWidth:22, textAlign:'center' }}>{f.ft.l.slice(0,4)}</span>
      <span style={{ fontSize: 11, color: isSel ? '#e5e7e9' : '#b1bac3', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }} title={f.path}>{f.name}</span>
      {f.weight > 0 && <span style={{width:5,height:5,borderRadius:'50%',background:'var(--accent)',flexShrink:0,opacity:0.7}} title="Tem conexões" />}
    </button>
  );
});

export const TreeNode = memo(function TreeNode({ node, depth, selected, onSelect, searchQ }) {
  const hasSearch = !!searchQ;
  const [open, setOpen] = useState(!hasSearch && depth < 1);

  useEffect(() => {
    if (hasSearch) {
      setOpen(true);
    } else if (selected && selected.path) {
      // Abre a raiz se for o item pai, ou abre a pasta se o arquivo selecionado estiver dentro dela
      if (!node.path) setOpen(true); 
      else if (selected.path.startsWith(node.path + '/')) setOpen(true);
    } else if (depth >= 1) {
      // Mantém o estado atual se o usuário clicou para fechar manualmente
    }
  }, [hasSearch, selected, node.path, depth]);

  const dirs = useMemo(() => Object.values(node.children).sort((a,b) => a.name.localeCompare(b.name)), [node.children]);
  const files = useMemo(() => [...node.files].sort((a,b) => a.name.localeCompare(b.name)), [node.files]);

  const visibleFiles = useMemo(() =>
    searchQ ? files.filter(f => f.name.toLowerCase().includes(searchQ.toLowerCase()) || f.path.toLowerCase().includes(searchQ.toLowerCase())) : files,
    [files, searchQ]
  );

  const indent = depth * 14;
  const total = useMemo(() => countTree(node), [node]);

  return (
    <div>
      {node.name && (
        <button className="tree-row" aria-expanded={open} onClick={() => setOpen(o => !o)}
          style={{ display:'flex', alignItems:'center', gap:5, padding:'var(--row-pad) 8px', paddingLeft:indent+8, cursor:'pointer', userSelect:'none', borderRadius:3, color:'#98a3ad', fontSize:11 }}
          onMouseEnter={e => e.currentTarget.style.background='var(--hover)'}
          onMouseLeave={e => e.currentTarget.style.background='transparent'}
        >
          <span style={{fontSize: 11,color:'#808b95',width:9,flexShrink:0}}>{open?'▾':'▸'}</span>
          <svg width="14" height="12" viewBox="0 0 16 13" aria-hidden="true"><path d="M1 2h5l2 2h7v8H1z" stroke="#c5ac84" fill="#554b38"/></svg>
          <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{node.name}</span>
          <span style={{fontSize: 11,color:'#687682',flexShrink:0,minWidth:20,textAlign:'right'}}>{total}</span>
        </button>
      )}

      {(open || !node.name) && (
        <div>
          {dirs.map(d => <TreeNode key={d.path} node={d} depth={depth+1} selected={selected} onSelect={onSelect} searchQ={searchQ} /> )}
          {/* Agora utilizamos o componente criado acima */}
          {visibleFiles.map(f => (
            <TreeFileItem 
              key={f.id} 
              f={f} 
              selected={selected} 
              onSelect={onSelect} 
              indent={indent} 
              nodeName={node.name} 
            />
          ))}
        </div>
      )}
    </div>
  );
});