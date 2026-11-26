export const FT = {
  js:{c:'#c2ac7e',l:'JS',g:'script'},   jsx:{c:'#c2ac7e',l:'JSX',g:'script'},
  ts:{c:'#8ca9bf',l:'TS',g:'script'},   tsx:{c:'#8ca9bf',l:'TSX',g:'script'},
  mjs:{c:'#c2ac7e',l:'MJS',g:'script'}, cjs:{c:'#c2ac7e',l:'CJS',g:'script'},
  py:{c:'#95b59d',l:'PY',g:'script'},   rs:{c:'#c4a084',l:'RS',g:'script'},
  go:{c:'#8db5bd',l:'GO',g:'script'},   rb:{c:'#c39b98',l:'RB',g:'script'},
  java:{c:'#c39780',l:'JV',g:'script'}, kt:{c:'#ab9db9',l:'KT',g:'script'},
  swift:{c:'#c4a084',l:'SW',g:'script'},cpp:{c:'#a4b8c4',l:'C++',g:'script'},
  c:{c:'#a3abc5',l:'C', g:'script'},    cs:{c:'#ab9db9',l:'C#',g:'script'},
  php:{c:'#a3abc5',l:'PHP',g:'script'}, lua:{c:'#9b9fb9',l:'LUA',g:'script'},
  dart:{c:'#8db5bd',l:'DART',g:'script'},
  vue:{c:'#95b59d',l:'VUE',g:'markup'}, svelte:{c:'#c4a084',l:'SV',g:'markup'},
  html:{c:'#c39b98',l:'HTML',g:'markup'},htm:{c:'#c39b98',l:'HTM',g:'markup'},
  css:{c:'#b59fae',l:'CSS',g:'style'},  scss:{c:'#bfaeb8',l:'SCSS',g:'style'},
  sass:{c:'#bfaeb8',l:'SASS',g:'style'},less:{c:'#bfaeb8',l:'LESS',g:'style'},
  json:{c:'#c2b386',l:'JSON',g:'data'}, yaml:{c:'#c2b386',l:'YAML',g:'data'},
  yml:{c:'#c2b386',l:'YML',g:'data'},   toml:{c:'#c4a084',l:'TOML',g:'data'},
  xml:{c:'#c8bd9c',l:'XML',g:'data'},   csv:{c:'#c2d1c5',l:'CSV',g:'data'},
  sh:{c:'#b2ba95',l:'SH',g:'config'},   bash:{c:'#b2ba95',l:'SH',g:'config'},
  env:{c:'#98a3ad',l:'ENV',g:'config'}, ini:{c:'#98a3ad',l:'INI',g:'config'},
  cfg:{c:'#98a3ad',l:'CFG',g:'config'},
  svg:{c:'#8db2a0',l:'SVG',g:'asset'},  mp4:{c:'#c19ba3',l:'MP4',g:'media'},
  mp3:{c:'#cbb0b4',l:'MP3',g:'media'},  wav:{c:'#cbb0b4',l:'WAV',g:'media'},
  png:{c:'#8db2a0',l:'PNG',g:'asset'},  jpg:{c:'#8db2a0',l:'JPG',g:'asset'},
  jpeg:{c:'#8db2a0',l:'JPEG',g:'asset'},gif:{c:'#8db2a0',l:'GIF',g:'asset'},
  webp:{c:'#8db2a0',l:'WEBP',g:'asset'},ico:{c:'#8db2a0',l:'ICO',g:'asset'},
  ttf:{c:'#b1bac3',l:'TTF',g:'asset'},  woff:{c:'#b1bac3',l:'WOFF',g:'asset'},
  woff2:{c:'#b1bac3',l:'WOFF2',g:'asset'}
};

export const KW_JS = /\b(import|export|from|const|let|var|function|return|class|extends|new|if|else|for|while|switch|case|break|continue|try|catch|finally|async|await|typeof|instanceof|in|of|default|null|undefined|true|false|this|super|static|delete|void|yield|throw|do)\b/g;
export const KW_TS = /\b(import|export|from|const|let|var|function|return|class|extends|new|if|else|for|while|switch|case|break|continue|try|catch|finally|async|await|typeof|instanceof|in|of|default|null|undefined|true|false|this|super|static|interface|type|enum|namespace|declare|abstract|implements|readonly|as|keyof|never|any|unknown|void)\b/g;
export const KW_PY = /\b(import|from|def|class|return|if|else|elif|for|while|try|except|finally|with|as|pass|break|continue|and|or|not|in|is|None|True|False|lambda|yield|raise|del|global|nonlocal|async|await)\b/g;
export const KW_MAP = { js:KW_JS,jsx:KW_JS,mjs:KW_JS,cjs:KW_JS,ts:KW_TS,tsx:KW_TS,py:KW_PY };