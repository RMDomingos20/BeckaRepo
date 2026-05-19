import React from 'react';
import { FT, KW_MAP } from './constants';

export function getFileType(name) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return FT[ext] || {c:'#6b7280',l:(ext.slice(0,4)||'FILE').toUpperCase(),g:'other'};
}

export function fmtBytes(b) {
  if (!b || b < 1024) return (b||0)+'B';
  if (b < 1048576) return (b/1024).toFixed(1)+'KB';
  return (b/1048576).toFixed(1)+'MB';
}

export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normPath(p) {
  const parts = p.split('/').filter(Boolean);
  const r = [];
  for (const s of parts) { if (s === '..') r.pop(); else if (s !== '.') r.push(s); }
  return r.join('/');
}

export function buildFolderTree(files) {
  const root = { name:'', children:{}, files:[], path:'' };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length-1; i++) {
      const p = parts[i];
      if (!node.children[p])
        node.children[p] = { name:p, children:{}, files:[], path:parts.slice(0,i+1).join('/') };
      node = node.children[p];
    }
    node.files.push(f);
  }
  return root;
}

export function countTree(node) {
  let n = node.files.length;
  for (const c of Object.values(node.children)) n += countTree(c);
  return n;
}

export function hlCode(code, ext, searchTerm = '') {
  if (!code) return null;
  const kwRe = KW_MAP[ext];
  const ph = [];
  const mark = (type, text) => { const id = `\x00${ph.length}\x00`; ph.push({type,text}); return id; };
  let s = code;
  
  // 1. Esconde comentários
  s = s.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|#[^\n]*)/g, m => mark('cm',m));
  
  // 2. Esconde strings (Isso engloba atributos HTML como href="...")
  s = s.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, m => mark('st',m));
  
  // 3. Aplica palavras-chave de acordo com a linguagem
  if (kwRe) { const re = new RegExp(kwRe.source,'g'); s = s.replace(re, m => mark('kw',m)); }
  
  // 4. FIX DOS NÚMEROS: O Regex não pode pegar números que estejam no meio dos nossos tokens \x00...
  // Usamos Lookbehinds e Lookaheads para evitar o caractere Nulo \x00
  s = s.replace(/(?<!\x00)\b(\d+\.?\d*)\b(?!\x00)/g, m => mark('nm',m));
  
  const TC = { kw:'#c084fc', st:'#86efac', cm:'#475569', nm:'#fb923c' };
  
  const escapedTerm = searchTerm ? escapeRegExp(searchTerm) : '';

  return s.split(/(\x00\d+\x00)/).map((p,i) => {
    let content = p;
    let color = '#94a3b8';
    
    const hit = p.match(/^\x00(\d+)\x00$/);
    if (hit) { 
      const t = ph[+hit[1]]; 
      content = t.text;
      color = TC[t.type] || color;
    }
    if (!content) return null;

    if (escapedTerm && content.toLowerCase().includes(searchTerm.toLowerCase())) {
      const parts = content.split(new RegExp(`(${escapedTerm})`, 'gi'));
      return (
        <span key={i} style={{color}}>
          {parts.map((part, idx) => 
            part.toLowerCase() === searchTerm.toLowerCase()
            ? <span key={idx} style={{background:'#f43f5e', color:'#fff', borderRadius:2, padding:'0 2px', fontWeight:800}}>{part}</span>
            : part
          )}
        </span>
      );
    }
    return <span key={i} style={{color}}>{content}</span>;
  });
}