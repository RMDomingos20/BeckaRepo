import { FT, KW_MAP } from './constants';
import { tokenizeCode } from './tokenizeCode.js';
export { buildFolderTree, countTree } from './folderTree.js';

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

export function hlCode(code, ext, searchTerm = '') {
  if (!code) return null;
  const TC = { kw:'#a4b8c4', st:'#a9c5ac', cm:'#89949d', nm:'#c4a084' };
  const escapedTerm = searchTerm ? escapeRegExp(searchTerm) : '';
  return tokenizeCode(code, KW_MAP[ext]).map(({ text: content, type }, i) => {
    const color = TC[type] || '#b1bac3';
    if (!content) return null;

    if (escapedTerm && content.toLowerCase().includes(searchTerm.toLowerCase())) {
      const parts = content.split(new RegExp(`(${escapedTerm})`, 'gi'));
      return (
        <span key={i} style={{color}}>
          {parts.map((part, idx) => 
            part.toLowerCase() === searchTerm.toLowerCase()
            ? <span key={idx} style={{background:'#cf9d83', color:'#fff', borderRadius:2, padding:'0 2px', fontWeight:800}}>{part}</span>
            : part
          )}
        </span>
      );
    }
    return <span key={i} style={{color}}>{content}</span>;
  });
}