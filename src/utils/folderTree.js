export function buildFolderTree(files) {
  const root = { name: '', children: Object.create(null), files: [], path: '' };
  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      if (!node.children[name]) node.children[name] = { name, children: Object.create(null), files: [], path: parts.slice(0, i + 1).join('/') };
      node = node.children[name];
    }
    node.files.push(file);
  }
  return root;
}
export function countTree(node) {
  let count = 0;
  const pending = [node];
  while (pending.length) { const current = pending.pop(); count += current.files.length; pending.push(...Object.values(current.children)); }
  return count;
}
