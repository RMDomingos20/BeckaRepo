import React, { useState } from 'react';

const T = {
  bg: '#050810', bgDeep: '#020408', bgPanel: '#03060d', border: '#1a1f35',
  accent: '#c084fc', teal: '#00d4aa', rose: '#f43f5e', amber: '#f59e0b',
  purple: '#a855f7', blue: '#3b82f6', green: '#4ade80',
  textHi: '#f0e6ff', textMid: '#8b7aa8', textLow: '#3d3550',
  mono: "'JetBrains Mono', monospace",
};

// --- COMPONENTES VISUAIS PARA O MANUAL ---
const NodeEx = ({ c, r, label, outline = false }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#1a1f3544', padding:'2px 8px', borderRadius:12 }}>
    <span style={{ width:r, height:r, borderRadius:'50%', background: outline ? 'transparent' : c, border: outline ? `2px solid ${c}` : 'none', boxShadow: outline ? 'none' : `0 0 8px ${c}66` }} />
    <span style={{ color:T.textHi, fontSize:10 }}>{label}</span>
  </span>
);

const EdgeEx = ({ c, label, dashed = false }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#1a1f3544', padding:'2px 8px', borderRadius:12 }}>
    <svg width="24" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={c} strokeWidth="2" strokeDasharray={dashed ? "3,3" : "none"} /><polygon points="20,2 24,5 20,8" fill={c} /></svg>
    <span style={{ color:T.textHi, fontSize:10 }}>{label}</span>
  </span>
);

const PillEx = ({ c, label }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:`${c}18`, border:`1px solid ${c}`, padding:'2px 8px', borderRadius:10, color:c, fontSize:'9px', fontWeight:700 }}>
    <span style={{ width:4, height:4, borderRadius:'50%', background:c }} /> {label}
  </span>
);

const BtnEx = ({ label, color = T.teal }) => (
  <span style={{ display:'inline-block', padding:'2px 8px', border:`1px solid ${color}`, borderRadius:4, color:color, fontSize:9, fontWeight:800, background:`${color}18` }}>
    {label}
  </span>
);

const CodeTag = ({ children }) => (
  <code style={{ background:'#0d1326', color:T.accent, padding:'2px 6px', borderRadius:4, fontSize:'0.9em', border:`1px solid ${T.border}` }}>
    {children}
  </code>
);

export function ManualModal({ onClose }) {
  const [tab, setTab] = useState('interface');

  const tabs = [
    { id: 'interface',   label: '1. Controles e Interface' },
    { id: 'painel',      label: '2. Painel Lateral & Tags' },
    { id: 'fundamentos', label: '3. Lendo o Grafo Visual' },
    { id: 'clusters',    label: '4. Nuvens e Clusters' },
    { id: 'conexoes',    label: '5. Como o Parser Lê?' },
    { id: 'render',      label: '6. Performance da Engine' },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: '#020408ee', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        width: 1000, height: 700, background: T.bg, border: `1px solid ${T.accent}55`, borderRadius: 12,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: `0 0 80px ${T.accent}1a`
      }}>
        {/* HEADER */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.border}`, background: T.bgDeep, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, color: T.accent }}>✦</span>
            <span style={{ color: T.textHi, fontSize: 16, fontWeight: 800, letterSpacing: '1px' }}>DOCUMENTAÇÃO TÉCNICA E MANUAL</span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.textMid, borderRadius: 6, width: 32, height: 32, cursor: 'pointer', transition: 'all 0.2s' }}
             onMouseEnter={e => { e.target.style.color = T.rose; e.target.style.borderColor = T.rose; }} onMouseLeave={e => { e.target.style.color = T.textMid; e.target.style.borderColor = T.border; }}>✕</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* MENU LATERAL */}
          <div style={{ width: 240, borderRight: `1px solid ${T.border}`, background: T.bgPanel, display: 'flex', flexDirection: 'column', padding: 16, gap: 8 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                background: tab === t.id ? T.accent + '22' : 'transparent', border: '1px solid', borderColor: tab === t.id ? T.accent : 'transparent',
                color: tab === t.id ? T.accent : T.textMid, padding: '10px 14px', borderRadius: 6, textAlign: 'left', fontSize: 11, cursor: 'pointer',
                fontWeight: tab === t.id ? 700 : 400, transition: 'all 0.2s', letterSpacing: '0.5px'
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* CONTEÚDO SCROLLÁVEL */}
          <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto', color: T.textMid, fontSize: 12, lineHeight: 1.7 }}>
            
            {/* 1. INTERFACE E CONTROLES */}
            {tab === 'interface' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <h2 style={{ color: T.textHi, marginBottom: 16 }}>Navegação e Comandos Globais</h2>
                <p>O BeckaRepo possui ferramentas no topo da tela para filtrar o "ruído" visual e extrair relatórios.</p>

                <h4 style={{ color: T.textHi, marginTop: 24 }}>1. Barra de Ações Rápidas (Header Superior)</h4>
                <ul style={{ paddingLeft: 20, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <li><BtnEx label="MAPA MD" /> Exporta toda a árvore de diretórios atual e estatísticas do projeto para um arquivo <strong>Markdown (.md)</strong>. Ideal para gerar rascunhos automáticos de Wikis ou atualizações para o <code>README.md</code> do repositório.</li>
                  <li><strong>Modos de Visão:</strong> Alterne entre a <CodeTag>ÁRVORE</CodeTag> (leitura limpa de pastas) e <CodeTag>GRAFO GLOBAL</CodeTag> (visão arquitetural da rede).</li>
                  <li><strong>Buscas:</strong> O campo 🔍 filtra arquivos na árvore lateral. O campo ✦ <strong>In-Code</strong> faz uma varredura interna (Regex) lendo o conteúdo dos arquivos e ativa o modo <em>Grafo Termo</em>, isolando na tela apenas quem tem aquela palavra exata (ex: <code>useState</code>).</li>
                </ul>

                <h4 style={{ color: T.textHi, marginTop: 24 }}>2. Filtro de Conexões (Arestas)</h4>
                <p>Em projetos gigantes, as linhas do grafo podem formar uma massa opaca ininteligível. A barra logo abaixo do Header permite ligar ou desligar os <strong>Tipos de Relacionamento</strong> detectados:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, background: '#0d1326', padding: 16, borderRadius: 8, border: `1px solid ${T.border}` }}>
                  <PillEx c={T.accent} label="import" />
                  <PillEx c="#38bdf8" label="sibling" />
                  <PillEx c="#22d3ee" label="docker" />
                  <PillEx c="#e2e8f0" label="prototype-parent" />
                  <PillEx c="#f97316" label="rsi-ref" />
                </div>
                <p style={{ marginTop: 12 }}>
                  <strong>Exemplos:</strong> Desativar <CodeTag>sibling</CodeTag> (arquivos na mesma pasta) ajuda a ver apenas dependências de código reais (<CodeTag>import</CodeTag>). Filtrar por <CodeTag>prototype-parent</CodeTag> isola apenas as árvores de herança de entidades YAML.
                </p>
              </div>
            )}

            {/* 2. PAINEL LATERAL DIREITO & TAGS */}
            {tab === 'painel' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <h2 style={{ color: T.textHi, marginBottom: 16 }}>Análise de Arquivo (Painel Direito)</h2>
                <p>Ao clicar em um nó ou em um item na árvore, o inspetor detalhado se abre. Ele é sua ferramenta de auditoria focada.</p>
                
                <h4 style={{ color: T.textHi, marginTop: 24 }}>Abas de Contexto</h4>
                <ul style={{ paddingLeft: 20, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <li><strong>Visão Geral:</strong> Mostra o Nível de Acoplamento. <strong>Importa (↑)</strong> são dependências requeridas por este arquivo. <strong>Usado Por (↓)</strong> revela o impacto: se este número for alto, alterar este arquivo pode quebrar o projeto inteiro.</li>
                  <li><strong>Código/Conteúdo:</strong> Visualizador Raw com <em>Syntax Highlighting</em>. Se o arquivo for uma mídia (MP4, PNG, MP3), o player nativo será renderizado. Se ativou a <em>Busca In-Code</em>, a palavra-chave é grifada em <span style={{color:'#fff', background:T.rose, padding:'0 2px'}}>vermelho</span>.</li>
                  <li><strong>Grafo Local:</strong> Ver explicação detalhada no final deste manual (N-Hop Analysis).</li>
                </ul>

                <h4 style={{ color: T.amber, marginTop: 24 }}>🏷️ Tags e Anotações (Audit State)</h4>
                <div style={{ background: '#f59e0b11', border: `1px solid ${T.amber}44`, padding: 16, borderRadius: 8, marginTop: 12 }}>
                  <p>O BeckaRepo possui um sistema embutido (<code>useTags.js</code>) para facilitar a auditoria de código (Code Review). Você pode classificar os nós manualmente.</p>
                  <p style={{ marginTop: 8 }}><strong>Como funciona:</strong> Adicione tags como <CodeTag>refatorar</CodeTag>, <CodeTag>core</CodeTag> ou <CodeTag>legado</CodeTag>, e adicione Notas textuais para si mesmo. Essas informações são salvas localmente no <strong>Cache do seu Navegador (LocalStorage)</strong> associadas ao caminho do arquivo, então elas persistem mesmo se você recarregar a página!</p>
                </div>
              </div>
            )}

            {/* 3. FUNDAMENTOS VISUAIS (Antigo 1) */}
            {tab === 'fundamentos' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <h2 style={{ color: T.textHi, marginBottom: 16 }}>Fundamentos Visuais (Teoria dos Grafos)</h2>
                <p>O BeckaRepo modela o código como um <strong>Grafo Direcionado</strong>. Os elementos não são aleatórios; eles mapeiam métricas diretas.</p>
                
                <h4 style={{ color: T.textHi, marginTop: 24, marginBottom: 12 }}>Nós (Vértices)</h4>
                <p>O <strong>raio de um nó</strong> é baseado na <CodeTag>Centralidade de Grau (Degree Centrality)</CodeTag> — arquivos muito importados ficam enormes (ex: Utils e Core), enquanto arquivos finais (UI views) ficam pequenos nas bordas.</p>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
                  <NodeEx c={T.amber} r={8} label="Código-fonte (JS, TS, C#, etc)" />
                  <NodeEx c={T.rose} r={8} label="Markup/Estilos (HTML, CSS)" />
                  <NodeEx c={T.green} r={8} label="Assets (Imagens, Mídias)" />
                  <NodeEx c={T.teal} r={14} outline label="Nó Selecionado/Foco" />
                </div>

                <h4 style={{ color: T.textHi, marginTop: 32, marginBottom: 12 }}>Arestas (Edges)</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16, background: '#0d1326', padding: 16, borderRadius: 8, border: `1px solid ${T.border}` }}>
                  <EdgeEx c="#1e3a5f" label="Acoplamento Comum" />
                  <EdgeEx c={T.teal} label="Aresta conectada ao Foco" />
                  <EdgeEx c={T.rose} label="Aresta do Grafo Termo" />
                </div>
              </div>
            )}

            {/* 4. CLUSTERS E FÍSICA */}
            {tab === 'clusters' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <h2 style={{ color: T.textHi, marginBottom: 16 }}>Nuvens, Agrupamentos e Física Magnética</h2>
                <p>A barra de "Clusters" pinta "regiões lógicas" usando algoritmos pesados (<CodeTag>Clustering</CodeTag>).</p>

                <h4 style={{ color: T.textHi, marginTop: 24 }}>As 4 Estratégias:</h4>
                <ul style={{ paddingLeft: 20, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <li><strong style={{color:T.accent}}>Pasta:</strong> Separa por diretórios. Ajuste o <CodeTag>Lvl 1, 2...</CodeTag> para quebrar pastas profundas (ex: <CodeTag>src/controllers</CodeTag>).</li>
                  <li><strong style={{color:T.accent}}>Arquitetura:</strong> Usa Regex nos nomes para agrupar padrões de projeto (Controllers, Services, Models, Mocks, UI).</li>
                  <li><strong style={{color:T.accent}}>Módulos (LPA):</strong> Aplica o <em>Label Propagation Algorithm</em> de Redes Complexas. Ele detecta quem se importa muito e deduz "Módulos Naturais" que conversam muito internamente. Ideal para destrinchar <em>Código Espaguete</em>.</li>
                  <li><strong style={{color:T.accent}}>Tipos:</strong> Separa código rígido, arquivos de configuração e mídias.</li>
                </ul>

                <h4 style={{ color: T.teal, marginTop: 24 }}>◉ Física Ativa e Isolamento O(1)</h4>
                <p>Ao ativar as <strong>Nuvens Físicas</strong>, a simulação Barnes-Hut do D3 cria um atrator gravitacional. O código força arquivos do mesmo cluster a voarem para o mesmo ponto, enquanto um <strong>Casco Convexo (Convex Hull)</strong> desenha uma bolha em volta deles.</p>
                <div style={{ background: '#00d4aa11', border: `1px solid ${T.teal}44`, padding: 16, borderRadius: 8, marginTop: 12 }}>
                  <strong>A Ferramenta de Isolar:</strong> Use o <em>Dropdown</em> (Select) no final da barra de Clusters para "Isolar" um grupo específico. A engine vai suspender o render de todos os outros arquivos instantaneamente, deixando você focar no micro-sistema.
                </div>
              </div>
            )}

            {/* 5. PARSER / CONEXÕES */}
            {tab === 'conexoes' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <h2 style={{ color: T.textHi, marginBottom: 16 }}>Como a Extração é Feita?</h2>
                <p>O Parser não requer compilação. Usa um modelo híbrido de <strong>AST-Regex e Índices Semânticos Hash</strong>.</p>

                <h4 style={{ color: T.textHi, marginTop: 24 }}>Linguagens e CI/CD</h4>
                <p>Mapeia desde Web (<CodeTag>import</CodeTag>, <CodeTag>require</CodeTag>) até linguagens pesadas (<CodeTag>#include</CodeTag> C++, <CodeTag>use</CodeTag> Rust). Além disso, vincula lógicas DevOps: YAMLs de Actions são magneticamente ligados ao <CodeTag>package.json</CodeTag> ou <CodeTag>Makefile</CodeTag> via a aresta sintética <CodeTag>ci-ref</CodeTag>.</p>

                <h4 style={{ color: T.textHi, marginTop: 24 }}>A Garra Nuclear e Projetos Específicos (RSI)</h4>
                <p>Para ler arquivos sem padrão forte (JSON, Strings em C#), a ferramenta usa uma varredura profunda que captura qualquer string que se pareça com o caminho de um asset (Imagens, Áudios, YAMLs).</p>
                <p style={{ marginTop: 8 }}>Em Engines de jogos com estruturas <CodeTag>.rsi</CodeTag>, o sistema possui um motor Fuzzy capaz de entender que se um C# invocar <CodeTag>sprite: Mobs/Joe.rsi</CodeTag>, ele deve criar a aresta não para a pasta, mas escavar até encontrar o arquivo <CodeTag>meta.json</CodeTag> real dessa entidade.</p>
              </div>
            )}

            {/* 6. RENDERIZAÇÃO E MINI-GRAFO */}
            {tab === 'render' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <h2 style={{ color: T.textHi, marginBottom: 16 }}>Performance Extrema e Estudo de Escopo</h2>
                
                <h4 style={{ color: T.textHi }}>Motor Duplo (SVG ⇄ WebGL Canvas)</h4>
                <p>O BeckaRepo transita dinamicamente sua renderização. Até 800 nós, ele usa SVG puro para permitir hiper-nitidez e CSS. Ao ultrapassar, injeta a <strong>Engine Canvas</strong> otimizada com matrizes matemáticas de <em>Culling</em> (desenhando apenas os pixels e textos do que está visível na tela). Permite rodar grafos massivos de 15 a 50 mil nós a 60FPS constantes.</p>

                <h4 style={{ color: T.amber, marginTop: 32 }}>Mini-Grafo (N-Hop Neighborhood Analysis)</h4>
                <p>A aba "Grafo Local" no painel direito roda sua própria física separada. Seu objetivo é ajudar no rastreamento de bugs isolando a <em>Árvore de Dependência</em>.</p>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '24px 0', border:`1px dashed ${T.border}`, padding: 20, borderRadius:8 }}>
                  <svg width="400" height="120" viewBox="0 0 400 120">
                    <line x1="200" y1="60" x2="100" y2="60" stroke="#f59e0b66" strokeWidth="2" />
                    <line x1="200" y1="60" x2="300" y2="30" stroke="#f59e0b66" strokeWidth="2" />
                    <line x1="200" y1="60" x2="300" y2="90" stroke="#f59e0b66" strokeWidth="2" />
                    <line x1="300" y1="30" x2="380" y2="10" stroke="#2a1f45" strokeWidth="1" strokeDasharray="3,3" />
                    <line x1="100" y1="60" x2="20" y2="60" stroke="#2a1f45" strokeWidth="1" strokeDasharray="3,3" />
                    
                    <circle cx="200" cy="60" r="16" fill={T.amber} stroke="#fff" strokeWidth="2" />
                    <text x="200" y="85" textAnchor="middle" fill="#fff" fontSize="10">Arquivo Alvo</text>

                    <circle cx="100" cy="60" r="10" fill={T.purple} />
                    <text x="100" y="85" textAnchor="middle" fill={T.purple} fontSize="10">Hop 1 (Chama o Alvo)</text>

                    <circle cx="300" cy="30" r="10" fill={T.purple} />
                    <circle cx="300" cy="90" r="10" fill={T.purple} />
                    <text x="320" y="60" fill={T.purple} fontSize="10">Hop 1 (Alvo Chama)</text>

                    <circle cx="380" cy="10" r="6" fill="#64748b" />
                    <circle cx="20" cy="60" r="6" fill="#64748b" />
                    <text x="20" y="80" textAnchor="middle" fill="#64748b" fontSize="9">Hop 2</text>
                  </svg>
                </div>
                <p>O algoritmo puxa o <strong>Hop 1</strong> (quem depende diretamente de mim e de quem eu dependo). Depois puxa o <strong>Hop 2</strong> (o efeito dominó 1 nível à frente) aplicando um filtro de massa limitador (50 nós) para evitar que a tela quebre caso um dos vizinhos seja o <CodeTag>utils.js</CodeTag> do repositório inteiro.</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}