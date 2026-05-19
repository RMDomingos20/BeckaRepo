import { normPath } from './helpers';

// =============================================================================
// PRÉ-PASSO: Índice semântico de IDs e pastas RSI
// Chamado UMA vez em buildGraph antes do loop de extração de arestas.
// Permite resolver referências como "parent: MinhaEntidade" (ID de protótipo)
// e "sprite: Mobs/Joe/base.rsi" (pasta RSI → meta.json) sem caminho explícito.
// =============================================================================
export function buildIdIndex(fileData) {
  const index = new Map(); // chave → Set<filePath>

  const add = (key, path) => {
    if (!key || key.length < 4 || !path) return; // ignora chaves triviais
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(path);
  };

  for (const f of fileData) {
    if (!f.content) continue;
    const ext = f.path.split('.').pop()?.toLowerCase();

    // --- YML/YAML: indexa somente campos "id:" (protótipos únicos) ---
    // "name:", "category:", "collection:" etc. são genéricos demais e causam
    // colisões em massa — NÃO indexamos esses campos.
    if (['yml', 'yaml'].includes(ext)) {
      for (const m of f.content.matchAll(/^[ \t]*-?[ \t]*id:\s*(\S+)/gm)) {
        add(m[1].trim(), f.path);
      }
    }

    // --- meta.json dentro de pasta .rsi ---
    // Indexa sufixos LONGOS (mínimo 2 segmentos) para evitar que dois
    // arquivos "base.rsi/meta.json" distintos se cruzem pelo sufixo simples.
    // Ex: "Mobs/WorkingJoe/base.rsi" → ok (2 segmentos)
    //     "base.rsi"                 → ignorado (1 segmento, muito genérico)
    if (f.name === 'meta.json' && f.path.includes('.rsi/')) {
      const rsiFolder = f.path.split('/').slice(0, -1).join('/');
      const parts = rsiFolder.split('/');
      for (let i = 0; i < parts.length; i++) {
        const suffix = parts.slice(i).join('/');
        if (suffix.split('/').length < 2) continue; // exige ao menos "Pasta/arquivo.rsi"
        add(suffix, f.path);
      }
    }
  }

  // Pós-processamento: descarta IDs presentes em muitos arquivos.
  // Se um "id:" aparece em mais de 4 arquivos, provavelmente é um valor
  // genérico reutilizado (ex: "id: None", "id: Default") — não é um protótipo único.
  const MAX_AMBIGUOUS = 4;
  for (const [key, paths] of index) {
    if (paths.size > MAX_AMBIGUOUS) index.delete(key);
  }

  return index;
}

// =============================================================================
// RESOLVEDORES DE CAMINHO
// =============================================================================
function findInPaths(base, pathSet) {
  const tries = [
    base,
    base+'.js', base+'.jsx', base+'.ts', base+'.tsx', base+'.mjs', base+'.cjs',
    base+'/index.js', base+'/index.jsx', base+'/index.ts', base+'/index.tsx',
    base+'.py', base+'.go', base+'.rs', base+'.rb', base+'.php', base+'.java',
    base+'.cs', base+'.c', base+'.cpp', base+'.h', base+'.hpp', base+'.swift',
    base+'.kt', base+'.dart', base+'.vue', base+'.svelte',
    base+'.css', base+'.scss', base+'.sass', base+'.less'
  ];

  for (let t of tries) {
    let clean = t.replace(/\/+/g, '/');
    if (pathSet.has(clean)) return clean;

    clean = clean.replace(/^\//, '');
    if (pathSet.has(clean)) return clean;

    if (pathSet.has('src/' + clean)) return 'src/' + clean;
    if (pathSet.has('lib/' + clean)) return 'lib/' + clean;
    if (pathSet.has('app/' + clean)) return 'app/' + clean;
  }
  return null;
}

export function resolveImport(imp, fromFile, pathSet) {
  if (!imp) return null;

  if (!pathSet._nameIndex) {
    pathSet._nameIndex = new Map();
    for (const p of pathSet) {
      const parts = p.split('/');
      const name = parts[parts.length - 1];
      const nameNoExt = name.split('.')[0];

      if (!pathSet._nameIndex.has(name)) pathSet._nameIndex.set(name, []);
      pathSet._nameIndex.get(name).push(p);

      if (nameNoExt && nameNoExt !== name) {
        if (!pathSet._nameIndex.has(nameNoExt)) pathSet._nameIndex.set(nameNoExt, []);
        pathSet._nameIndex.get(nameNoExt).push(p);
      }
    }
  }

  const dir = fromFile.split('/').slice(0,-1).join('/');

  if (imp.startsWith('.')) {
    const resolved = normPath((dir ? dir+'/' : '')+imp);
    const match = findInPaths(resolved, pathSet);
    if (match) return match;
  }

  const cleaned = imp.replace(/^[@~]\//, '').replace(/^src\//, '').replace(/^\//, '');

  let t = findInPaths(cleaned, pathSet);
  if (t) return t;

  t = findInPaths((dir ? dir+'/' : '')+cleaned, pathSet);
  if (t) return t;

  const impParts = cleaned.split(/[/\\]/);
  const targetName = impParts[impParts.length - 1];

  const candidates = pathSet._nameIndex.get(targetName);
  if (candidates && candidates.length > 0) {
    if (candidates.length === 1) return candidates[0];
    for (const c of candidates) {
      if (c.includes(cleaned)) return c;
    }
  }

  return null;
}

// =============================================================================
// EXTRAÇÃO DE IMPORTAÇÕES / REFERÊNCIAS
// idIndex é opcional (default null) — não quebra chamadas sem o argumento.
// =============================================================================
export function extractImports(filePath, content, pathSet, idIndex = null) {
  if (!content) return [];
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const results = [];
  const seen = new Set();

  const add = (target, type, detail) => {
    if (target && target !== filePath) {
      const key = target + ':' + type;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ target, type, detail });
      }
    }
  };

  const res = (imp) => resolveImport(imp, filePath, pathSet);

  // ---------------------------------------------------------------------------
  // PARSERS ESTRUTURADOS — ecossistemas Web / Genéricos
  // ---------------------------------------------------------------------------

  if (['html', 'htm'].includes(ext)) {
    for (const m of content.matchAll(/<script[^>]+src\s*=\s*['"]([^'"]+)['"]/gi)) add(res(m[1]), 'script', m[1]);
    for (const m of content.matchAll(/<link[^>]+href\s*=\s*['"]([^'"]+)['"]/gi)) add(res(m[1]), 'stylesheet', m[1]);
  }

  if (['js','jsx','ts','tsx','mjs','cjs','vue','svelte'].includes(ext)) {
    for (const m of content.matchAll(/import\s+(?:type\s+)?(?:[^'"`\n;]*?from\s+)?['"`]([^'"`\n]+)['"`]/g)) add(res(m[1]), 'import', m[1]);
    for (const m of content.matchAll(/import\s+['"`]([^'"`\n]+)['"`]/g)) add(res(m[1]), 'import', m[1]);
    for (const m of content.matchAll(/(?:require|import)\s*\(\s*['"`]([^'"`\n]+)['"`]\s*\)/g)) add(res(m[1]), 'require', m[1]);
    for (const m of content.matchAll(/export\s+(?:\*|{[^}]*})\s+from\s+['"`]([^'"`\n]+)['"`]/g)) add(res(m[1]), 're-export', m[1]);
  }

  if (ext === 'py') {
    for (const m of content.matchAll(/^from\s+(\.[\w.]*)\s+import/gm)) {
      const dots = (m[1].match(/^\.+/)||[''])[0].length;
      const mod = m[1].slice(dots).replace(/\./g,'/');
      const pparts = filePath.split('/');
      const ddir = pparts.slice(0, Math.max(1, pparts.length-dots)).join('/');
      const path = (ddir ? ddir+'/' : '')+(mod ? mod+'.py' : '__init__.py');
      add(pathSet.has(path) ? path : res(mod), 'import', m[0].trim().slice(0,60));
    }
    for (const m of content.matchAll(/^import\s+([\w.]+)/gm)) add(res(m[1].replace(/\./g, '/')), 'import', m[1]);
  }

  if (['c','cpp','h','hpp','cc'].includes(ext)) {
    for (const m of content.matchAll(/#include\s+["<]([^">]+)[">]/g)) add(res(m[1]), 'include', m[1]);
  }

  if (['cs','java','php','kt','dart','scala'].includes(ext)) {
    for (const m of content.matchAll(/(?:import|using|use)\s+([\w\\]+(?:\.[\w\\]+)*)[\s;]/g)) add(res(m[1].replace(/[.\\]/g, '/')), 'import', m[1]);
  }

  if (ext === 'rs') {
    for (const m of content.matchAll(/use\s+([\w:]+)(?:;|::)/g)) add(res(m[1].replace(/::/g, '/')), 'import', m[1]);
  }

  if (ext === 'go') {
    for (const m of content.matchAll(/import\s+(?:\([^)]+\)|"[^"]+")/g)) {
      for (const sm of m[0].matchAll(/"([^"]+)"/g)) add(res(sm[1]), 'import', sm[1]);
    }
  }

  if (['css','scss','sass','less'].includes(ext)) {
    for (const m of content.matchAll(/@(?:import|use)\s+['"]([^'"]+)['"]/g)) {
      const imp = m[1];
      add(res(imp.startsWith('.')?imp:'./'+imp), 'import', m[0].slice(0,50));
    }
  }

  // ---------------------------------------------------------------------------
  // REFERÊNCIAS SEMÂNTICAS YAML — requer idIndex
  // CONSERVADOR: só "parent:" e "sprite:" — os campos mais confiáveis e únicos.
  // "collection:", "entity:", "name:" foram removidos por causarem colisões em massa.
  // ---------------------------------------------------------------------------
  if (idIndex && ['yml', 'yaml'].includes(ext)) {

    // parent: BaseHumanoidSounds  →  YML que define "id: BaseHumanoidSounds"
    // É o campo mais confiável: protótipos têm IDs únicos e herança é 1-para-1.
    for (const m of content.matchAll(/^[ \t]+parent:\s*(\S+)/gm)) {
      const id = m[1].trim();
      if (id.length < 4) continue;
      for (const t of (idIndex.get(id) || [])) {
        add(t, 'prototype-parent', `parent: ${id}`);
      }
    }

    // sprite: Mobs/WorkingJoe/base.rsi  →  meta.json dessa pasta RSI específica.
    // Tenta caminho direto primeiro; fuzzy só com sufixo de 2+ segmentos.
    for (const m of content.matchAll(/sprite:\s+([^\s\n#'"]+\.rsi)/gi)) {
      const rsiPath = m[1].trim();

      const directMeta = rsiPath + '/meta.json';
      if (pathSet.has(directMeta)) {
        add(directMeta, 'sprite-ref', `sprite: ${rsiPath}`);
        continue;
      }

      if (idIndex) {
        const parts = rsiPath.split('/');
        let resolved = false;
        for (let i = 0; i < parts.length - 1 && !resolved; i++) {
          const suffix = parts.slice(i).join('/');
          if (suffix.split('/').length < 2) continue; // nunca casa só "base.rsi"
          const targets = idIndex.get(suffix);
          if (targets) {
            for (const t of targets) add(t, 'sprite-ref', `sprite: ${rsiPath}`);
            resolved = true;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // meta.json de pasta RSI → conecta aos PNGs das sprites declaradas dentro dele.
  // Ex: states[].name = "idle" → base.rsi/idle.png
  // ---------------------------------------------------------------------------
  if (ext === 'json' && filePath.endsWith('/meta.json') && filePath.includes('.rsi/')) {
    try {
      const data = JSON.parse(content);
      const rsiDir = filePath.split('/').slice(0, -1).join('/');
      if (Array.isArray(data.states)) {
        for (const state of data.states) {
          if (state.name) {
            const pngPath = rsiDir + '/' + state.name + '.png';
            if (pathSet.has(pngPath)) add(pngPath, 'rsi-state', `state: ${state.name}`);
          }
        }
      }
    } catch { /* JSON malformado — ignora silenciosamente */ }
  }

  // ---------------------------------------------------------------------------
  // A GARRA NUCLEAR UNIVERSAL
  // Encontra qualquer coisa que pareça um caminho de arquivo válido (com extensão).
  // Não exige aspas ou verbos. Pega referências em YML, JSON, Arrays C#, etc.
  // Exemplo: `sprite: _AU14/Mobs/WorkingJoe/parts.rsi`
  // ---------------------------------------------------------------------------
  const extList = 'png|jpg|jpeg|gif|svg|webp|ico|mp3|mp4|wav|ogg|ttf|woff|woff2|css|scss|json|yml|yaml|toml|xml|csv|txt|md|rsi|cs|js|ts|py|cpp|c|h|go|rs|java|kt|dart|lua';
  const nuclearRegex = new RegExp(`([a-zA-Z0-9_./\\\\-]+\\.(?:${extList}))`, 'gi');

  for (const m of content.matchAll(nuclearRegex)) {
    const raw = m[1];
    const cleanStr = raw.replace(/^[./\\]+/, '');

    // ⚡ CASO ESPECIAL: .rsi é uma PASTA, não um arquivo.
    // pathSet nunca vai ter "base.rsi" diretamente — só "base.rsi/meta.json" etc.
    // Tentamos resolver para o meta.json correspondente.
    if (cleanStr.toLowerCase().endsWith('.rsi')) {
      const metaCandidates = [
        cleanStr + '/meta.json',
        'Resources/' + cleanStr + '/meta.json',
        'Resources/Textures/' + cleanStr + '/meta.json',
        'Resources/Audio/' + cleanStr + '/meta.json',
      ];

      let found = false;
      for (const candidate of metaCandidates) {
        if (pathSet.has(candidate)) {
          add(candidate, 'rsi-ref', raw);
          found = true;
          break;
        }
      }

      // Fuzzy via índice — apenas sufixos com 2+ segmentos para evitar
      // que "base.rsi" de pastas diferentes se conectem entre si.
      if (!found && idIndex) {
        const parts = cleanStr.split('/');
        for (let i = 0; i < parts.length - 1 && !found; i++) {
          const suffix = parts.slice(i).join('/');
          if (suffix.split('/').length < 2) continue;
          const targets = idIndex.get(suffix);
          if (targets) {
            for (const t of targets) add(t, 'rsi-ref', raw);
            found = true;
          }
        }
      }

      continue; // Não passa por res(cleanStr) — pathSet nunca resolve uma pasta
    }

    // Caminho normal com extensão real
    add(res(cleanStr), 'reference', raw);
  }

  return results;
}