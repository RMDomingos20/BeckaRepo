// Presentation-only tokenizer: preserve source bytes/characters without placeholder substitution.
export function tokenizeCode(code, keywordPattern) {
  if (!code) return [];
  const tokens = [];
  const literals = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|#[^\n]*)/g;
  const plain = text => {
    const pattern = new RegExp(`${keywordPattern ? `(?:${keywordPattern.source})|` : ''}\\b\\d+(?:\\.\\d+)?\\b`, 'g');
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > offset) tokens.push({ type: '', text: text.slice(offset, match.index) });
      tokens.push({ type: /^\d/.test(match[0]) ? 'nm' : 'kw', text: match[0] });
      offset = match.index + match[0].length;
    }
    if (offset < text.length) tokens.push({ type: '', text: text.slice(offset) });
  };
  let offset = 0;
  for (const match of code.matchAll(literals)) {
    plain(code.slice(offset, match.index));
    tokens.push({ type: match[1] === undefined ? 'cm' : 'st', text: match[0] });
    offset = match.index + match[0].length;
  }
  plain(code.slice(offset));
  return tokens;
}
