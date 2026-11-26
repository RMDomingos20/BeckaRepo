import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFolderTree, countTree } from '../src/utils/folderTree.js';
import { tokenizeCode } from '../src/utils/tokenizeCode.js';
import { quadtree, zoomIdentity } from 'd3';
import { clipSegment, labelPlacer, screenGroups, screenRadius, viewportNodes } from '../src/utils/graphViewport.js';
import { indexPackages, packageConsumers } from '../src/utils/packageGraph.js';
import { assertResult } from '../src/core/contract.js';
import { galaxySeeds } from '../src/utils/galaxyLayout.js';
import { atlasSeeds } from '../src/utils/atlasLayout.js';

test('Galaxy puts distinct incoming dependencies at the core and isolated files outside', () => {
  const nodes = ['core','app/a','app/b','image'].map(id => ({id,path:id}));
  const edges = ['app/a','app/b','app/b'].map(source => ({source,target:'core'}));
  const positions = galaxySeeds(nodes, edges, 0, 0);
  const radius = id => Math.hypot(positions.get(id).x, positions.get(id).y);
  assert.equal(positions.get('core').relevance, 4);
  assert.ok(radius('core') < radius('app/a') && radius('app/a') < radius('image'));
  assert.deepEqual(positions, galaxySeeds([...nodes].reverse(), edges, 0, 0));
});

test('Atlas gives groups separate blocks and preserves all files independently of input order', () => {
  const nodes = ['a/1','a/2','b/1','b/2'].map(id => ({id,path:id}));
  const positions = atlasSeeds(nodes, 800, 400);
  assert.deepEqual(positions, atlasSeeds([...nodes].reverse(), 800, 400));
  assert.equal(positions.size, nodes.length);
  const points = group => [...positions].filter(([id]) => id.startsWith(group)).map(([,p]) => p);
  assert.ok(['x','y'].some(axis => Math.max(...points('a').map(p=>p[axis])) < Math.min(...points('b').map(p=>p[axis]))));
  assert.equal(atlasSeeds([], 0, 0).size, 0);
});

test('F6 consumer queries keep declarations separate and terminate on lock cycles', () => {
  const packages = { nodes: ['declA','declB','lockA','lockB'].map(id=>({id,state:id.startsWith('decl')?'declared':'locked'})), edges: [
    {source:'a.ts',target:'declA',kind:'imports-package'},
    {source:'b.ts',target:'declB',kind:'imports-package'},
    {source:'package.json',target:'declA',kind:'declares'},
    {source:'declA',target:'lockA',kind:'resolves-to'},
    {source:'declB',target:'lockB',kind:'resolves-to'},
    {source:'lockA',target:'lockB',kind:'lock-dependency'},
    {source:'lockB',target:'lockA',kind:'lock-dependency'},
  ] };
  const index = indexPackages(packages);
  assert.deepEqual(packageConsumers(index,'declB').map(e=>e.source),['b.ts']);
  assert.deepEqual(packageConsumers(index,'lockB').map(e=>e.source),['b.ts']);
  assert.deepEqual(packageConsumers(index,'declB',true).map(e=>e.source),['a.ts','b.ts']);
  assert.deepEqual(packageConsumers(index,'missing'),[]);
});

test('F6 contract accepts legacy responses and rejects dangling package endpoints', () => {
  const graph={schemaVersion:1,nodes:[{id:'main.js'},{id:'package.json'}],edges:[]};
  assert.doesNotThrow(()=>assertResult(graph));
  graph.packages={nodes:[{id:'pkg'}],edges:[{source:'main.js',target:'pkg',kind:'imports-package'}],diagnostics:[]};
  assert.doesNotThrow(()=>assertResult(graph));
  graph.packages.edges[0].source='foreign';
  assert.throws(()=>assertResult(graph),/endpoints/);
  graph.packages.edges=[];graph.packages.nodes=[{id:'main.js'}];
  assert.throws(()=>assertResult(graph),/endpoints/);
});

test('F0 tree handles prototype-like names at every depth', () => {
  const files = ['root/__proto__/a.rs', 'root/constructor/b.rs', 'root/toString/c.rs'].map(path => ({ path }));
  const tree = buildFolderTree(files);
  assert.equal(countTree(tree), 3);
  assert.equal(Object.getPrototypeOf(tree.children.root.children), null);
  assert.equal({}.polluted, undefined);
});
test('F1 code display preserves Unicode, NUL, strings containing comments and placeholder-like text', () => {
  for (const code of ['const s="https://example.test/42"; // comment\nconst n=12;', '\0'+'999'+'\0'+' const café = 3;', '"a /* b */ c"\n/* "comment" */', '😀\r\n# sample\n', '\uE000123\uE000']) {
    const tokens = tokenizeCode(code, /\b(const|let)\b/);
    assert.equal(tokens.map(t => t.text).join(''), code);
  }
});
test('F1 tokenizer keeps comment markers inside strings', () => {
  const tokens = tokenizeCode('"https://host/42"', /const/);
  assert.deepEqual(tokens, [{ type: 'st', text: '"https://host/42"' }]);
});

test('Graph segments crossing the viewport remain visible and labels do not overlap', () => {
  assert.deepEqual(clipSegment(-10, 50, 110, 50, 100, 100), [0, 50, 100, 50]);
  assert.equal(clipSegment(-10, -10, 110, -10, 100, 100), null);
  assert.deepEqual(clipSegment(50, 50, 50, 50, 100, 100), [50, 50, 50, 50]);
  const place = labelPlacer(100, 100);
  assert.equal(place(10, 10, 30, 20), true);
  assert.equal(place(20, 15, 30, 20), false);
  assert.equal(place(60, 60, 30, 20), true);
  assert.equal(place(95, 95, 30, 20), false);
});

test('Dense graph geometry preserves 85224 nodes and selected hit target across zoom', () => {
  const start = performance.now();
  const nodes = Array.from({ length: 85224 }, (_, i) => ({ id: `f${i}`, x: (i % 400) * 10, y: Math.floor(i / 400) * 10, weight: 1 }));
  const tree = quadtree(nodes, n => n.x, n => n.y);
  const overview = zoomIdentity.scale(0.1);
  const visible = viewportNodes(tree, overview, 800, 600, 0);
  assert.equal(visible.length, nodes.length);
  const selected = nodes[40000];
  const marks = screenGroups(visible, overview, true, new Set([selected.id]));
  assert.equal(marks.reduce((sum, m) => sum + m.count, 0), nodes.length);
  assert.equal(marks.at(-1).node.id, selected.id);
  assert.equal(marks.at(-1).radius, 6);
  const zoom = zoomIdentity.translate(400 - selected.x * 8, 300 - selected.y * 8).scale(8);
  const close = viewportNodes(tree, zoom, 800, 600, 0);
  const expected = nodes.filter(n => zoom.applyX(n.x) >= 0 && zoom.applyX(n.x) <= 800 && zoom.applyY(n.y) >= 0 && zoom.applyY(n.y) <= 600);
  assert.deepEqual(new Set(close.map(n => n.id)), new Set(expected.map(n => n.id)));
  assert.ok(close.some(n => n.id === selected.id));
  assert.ok(close.length < visible.length);
  assert.equal(screenRadius(selected, true), 6);
  console.log(`Dense geometry only: nodes=${nodes.length} overview_marks=${marks.length} zoom_visible=${close.length} elapsed_ms=${Math.round(performance.now()-start)} process_max_rss_kib=${process.resourceUsage().maxRSS}`);
});
