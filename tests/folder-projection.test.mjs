import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFolders, collapseFolder, savedFolderPosition } from '../src/utils/folderProjection.js';

const node = path => ({ id: path, path, name: path.split('/').at(-1), snapshotId: 'snapshot-a' });
const edge = (source, target, type = 'import', bidirectional = false) => ({ source, target, type, bidirectional });
const conserved = (original, projected) => {
  assert.equal(projected.nodes.reduce((sum, n) => sum + (n.isFolder ? n.fileCount : 1), 0), original.nodes.length);
  assert.equal(projected.edges.reduce((sum, e) => sum + e.count, 0) + projected.folderSummary.internalCount + projected.folderSummary.omittedEdges, original.edges.length);
  assert.equal(projected.representatives.size, original.nodes.length);
  for (const e of projected.edges) assert.ok(projected.nodeMap.has(e.source) && projected.nodeMap.has(e.target));
};

test('F8 folder partition preserves direction, relation types, internal cycles and multiplicity', () => {
  const graph = { nodes: ['src/a.js', 'src/b.js', 'lib/c.js', 'root.js'].map(node), edges: [
    edge('src/a.js','src/b.js'), edge('src/b.js','src/a.js'), edge('src/a.js','lib/c.js'),
    edge('src/b.js','lib/c.js'), edge('lib/c.js','src/a.js'), edge('src/a.js','lib/c.js','reference'),
    edge('src/a.js','lib/c.js','cochange',true), edge('lib/c.js','src/b.js','cochange',true), edge('root.js','root.js'),
  ] };
  const p = projectFolders(graph);
  conserved(graph, p); assert.equal(p.snapshotId, 'snapshot-a');
  assert.equal(p.nodeMap.get(p.representatives.get('src/a.js')).internalCount, 2);
  assert.equal(p.edges.find(e => e.source === p.representatives.get('src/a.js') && e.type === 'import').count, 2);
  assert.equal(p.edges.find(e => e.type === 'cochange').count, 2);
  assert.ok(p.edges.some(e => e.source === 'root.js' && e.target === 'root.js'));
  assert.equal(graph.nodes[0].isFolder, undefined);
});

test('F8 selected file stays separate without duplicating counts, match totals or edges', () => {
  const graph = { nodes: ['src/a.js', 'src/deep/b.js', 'lib/c.js'].map(path => ({ ...node(path), isMatch: true })),
    edges: [edge('src/a.js','src/deep/b.js'), edge('lib/c.js','src/a.js')] };
  for (const expanded of [new Set(), new Set(['src']), new Set(['src','src/deep','lib'])]) {
    const p = projectFolders(graph, expanded, 'src/a.js');
    conserved(graph, p); assert.equal(p.representatives.get('src/a.js'), 'src/a.js');
    assert.equal(p.nodes.reduce((n, item) => n + (item.isFolder ? item.matchCount : Number(item.isMatch)), 0), 3);
    assert.equal(p.edges.reduce((sum,e) => sum + e.count, 0), 2);
  }
});

test('F8 hierarchy treats special and Unicode paths as data and collapses exact descendants only', () => {
  const graph = { nodes: ['__proto__/ação.rs','constructor/x.rs','a/x.rs','ab/x.rs','a/b/y.rs','a.txt'].map(node),
    edges: [edge('__proto__/ação.rs','__proto__/ação.rs','__proto__'), edge('absent','a.txt')] };
  const p = projectFolders(graph);
  conserved(graph, p); assert.equal(p.folderSummary.omittedEdges, 1);
  assert.equal(p.nodes.find(n => n.path === '__proto__').internalTypes.__proto__, 1);
  assert.equal({}.polluted, undefined);
  assert.deepEqual([...collapseFolder(new Set(['a','ab','a/b','a/b/c','other']), 'a')], ['ab','other']);
});

test('F8 new children inherit ancestor vicinity while cached file pins survive collapse', () => {
  const graph = { nodes: ['src/deep/a.rs', 'src/b.rs'].map(node), edges: [] };
  const closed = projectFolders(graph), parent = closed.nodes[0];
  const opened = projectFolders(graph, new Set(['src','src/deep']));
  const positions = new Map([[parent.id,{x:200,y:300}], ['src/b.rs',{x:17,y:19,fx:17,fy:19}]]);
  const near = savedFolderPosition(opened.nodes.find(n=>n.id==='src/deep/a.rs'),positions,0);
  assert.ok(Math.hypot(near.x-200,near.y-300) < 60);
  assert.equal(near.fx,undefined);
  assert.deepEqual(savedFolderPosition(opened.nodes.find(n=>n.id==='src/b.rs'),positions,1),{x:17,y:19,fx:17,fy:19});
});

test('F8 folder projection conserves 85224 files and 91745 connections across levels', () => {
  const nodes = Array.from({ length:85224 }, (_,i) => node(`pkg${i%80}/sub${i%9}/file${i}.rs`));
  const graph = { nodes, edges: Array.from({length:91745},(_,i)=>edge(nodes[i%nodes.length].id,nodes[(i*31+1)%nodes.length].id)) };
  const started=performance.now();
  for (const expanded of [new Set(),new Set(['pkg0','pkg1','pkg0/sub0'])]) {
    const p=projectFolders(graph,expanded,nodes[80].id); conserved(graph,p);
    assert.ok(p.nodes.length<1000); assert.ok(p.nodes.some(n=>n.id===nodes[80].id));
  }
  console.log(`F8 folder projection: two synthetic levels in ${Math.round(performance.now()-started)} ms; not a browser FPS measurement`);
});
