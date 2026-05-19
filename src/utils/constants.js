export const FT = {
  js:{c:'#f59e0b',l:'JS',g:'script'},   jsx:{c:'#f59e0b',l:'JSX',g:'script'},
  ts:{c:'#3b82f6',l:'TS',g:'script'},   tsx:{c:'#3b82f6',l:'TSX',g:'script'},
  mjs:{c:'#f59e0b',l:'MJS',g:'script'}, cjs:{c:'#f59e0b',l:'CJS',g:'script'},
  py:{c:'#4ade80',l:'PY',g:'script'},   rs:{c:'#fb923c',l:'RS',g:'script'},
  go:{c:'#00add8',l:'GO',g:'script'},   rb:{c:'#f87171',l:'RB',g:'script'},
  java:{c:'#ff6b35',l:'JV',g:'script'}, kt:{c:'#a78bfa',l:'KT',g:'script'},
  swift:{c:'#fb923c',l:'SW',g:'script'},cpp:{c:'#c084fc',l:'C++',g:'script'},
  c:{c:'#818cf8',l:'C', g:'script'},    cs:{c:'#a78bfa',l:'C#',g:'script'},
  php:{c:'#818cf8',l:'PHP',g:'script'}, lua:{c:'#6366f1',l:'LUA',g:'script'},
  dart:{c:'#22d3ee',l:'DART',g:'script'},
  vue:{c:'#4ade80',l:'VUE',g:'markup'}, svelte:{c:'#fb923c',l:'SV',g:'markup'},
  html:{c:'#f87171',l:'HTML',g:'markup'},htm:{c:'#f87171',l:'HTM',g:'markup'},
  css:{c:'#f472b6',l:'CSS',g:'style'},  scss:{c:'#f9a8d4',l:'SCSS',g:'style'},
  sass:{c:'#f9a8d4',l:'SASS',g:'style'},less:{c:'#f9a8d4',l:'LESS',g:'style'},
  json:{c:'#fbbf24',l:'JSON',g:'data'}, yaml:{c:'#fcd34d',l:'YAML',g:'data'},
  yml:{c:'#fcd34d',l:'YML',g:'data'},   toml:{c:'#fb923c',l:'TOML',g:'data'},
  xml:{c:'#fde68a',l:'XML',g:'data'},   csv:{c:'#d1fae5',l:'CSV',g:'data'},
  sh:{c:'#a3e635',l:'SH',g:'config'},   bash:{c:'#a3e635',l:'SH',g:'config'},
  env:{c:'#64748b',l:'ENV',g:'config'}, ini:{c:'#64748b',l:'INI',g:'config'},
  cfg:{c:'#64748b',l:'CFG',g:'config'},
  svg:{c:'#34d399',l:'SVG',g:'asset'},  mp4:{c:'#fb7185',l:'MP4',g:'media'},  
  mp3:{c:'#fda4af',l:'MP3',g:'media'},  wav:{c:'#fda4af',l:'WAV',g:'media'},  
  png:{c:'#34d399',l:'PNG',g:'asset'},  jpg:{c:'#34d399',l:'JPG',g:'asset'},  
  jpeg:{c:'#34d399',l:'JPEG',g:'asset'},gif:{c:'#34d399',l:'GIF',g:'asset'},  
  webp:{c:'#34d399',l:'WEBP',g:'asset'},ico:{c:'#34d399',l:'ICO',g:'asset'},  
  ttf:{c:'#94a3b8',l:'TTF',g:'asset'},  woff:{c:'#94a3b8',l:'WOFF',g:'asset'},
  woff2:{c:'#94a3b8',l:'WOFF2',g:'asset'}
};

export const CODE_EXTS = new Set([
  'js','jsx','ts','tsx','mjs','cjs','py','go','rs','rb','java','cpp','c','h','cs',
  'php','lua','kt','swift','dart','css','scss','sass','less','html','htm','vue',
  'svelte','json','yaml','yml','toml','xml','txt','sh','bash','env','ini',
  'cfg','csv','rst','r','scala','clj','ex','exs','elm','ml','fs','fsx',
]);

export const ASSET_EXTS = new Set([
  'png','jpg','jpeg','gif','svg','webp','ico','mp3','mp4','wav','ogg','ttf','woff','woff2'
]);

// Adicionadas dezenas de pastas de infraestrutura de Múltiplas Linguagens
export const SKIP_DIRS_EXACT = new Set([
  // JS / TS
  'node_modules', '.next', '.nuxt', '.svelte-kit', 'dist', 'build', 'out', 'coverage',
  // Python
  '__pycache__', 'venv', '.venv', 'env', '.env', '.tox', 'site-packages',
  // C# / C++ / C / Rust
  'bin', 'obj', 'target', 'packages', 'debug', 'release',
  // Java / Kotlin / Scala
  '.gradle', 'build', 'target', 'out',
  // PHP / Go / Ruby
  'vendor', 'pkg', '.bundle',
  // Controle de Versão e IDEs
  '.git', '.svn', '.hg', '.idea', '.vscode', '.cache', '.yarn'
]);

export const IGNORE_FILES_EXACT = new Set([
  'package-lock.json','yarn.lock','pnpm-lock.yaml','composer.lock',
  '.gitignore','.gitattributes','.prettierrc','.eslintrc','.eslintrc.js','.eslintrc.json',
  'security.md','code_of_conduct.md','contributing.md','license','changelog.md',
  'license.md', '.env.local', '.env.example'
]);

export const KW_JS = /\b(import|export|from|const|let|var|function|return|class|extends|new|if|else|for|while|switch|case|break|continue|try|catch|finally|async|await|typeof|instanceof|in|of|default|null|undefined|true|false|this|super|static|delete|void|yield|throw|do)\b/g;
export const KW_TS = /\b(import|export|from|const|let|var|function|return|class|extends|new|if|else|for|while|switch|case|break|continue|try|catch|finally|async|await|typeof|instanceof|in|of|default|null|undefined|true|false|this|super|static|interface|type|enum|namespace|declare|abstract|implements|readonly|as|keyof|never|any|unknown|void)\b/g;
export const KW_PY = /\b(import|from|def|class|return|if|else|elif|for|while|try|except|finally|with|as|pass|break|continue|and|or|not|in|is|None|True|False|lambda|yield|raise|del|global|nonlocal|async|await)\b/g;
export const KW_MAP = { js:KW_JS,jsx:KW_JS,mjs:KW_JS,cjs:KW_JS,ts:KW_TS,tsx:KW_TS,py:KW_PY };