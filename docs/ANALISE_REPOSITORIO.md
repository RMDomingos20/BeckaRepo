# Diagnóstico do BeckaRepo

> Registro histórico da preparação anterior à migração. Electron, Worker e parser JavaScript descritos abaixo já foram substituídos. Para o estado atual, consulte [MIGRACAO_RUST.md](MIGRACAO_RUST.md).

Análise em 25/10/2026. Foram lidos os fontes de `src/`, entrada HTML, configuração de build/lint, Electron, preload, manifesto de dependências e README. `node_modules/`, `dist/` e `release/` são dependências ou produtos gerados, não implementações independentes a migrar. O projeto chegou com alterações locais em `package.json` e `package-lock.json`, preservadas nesta preparação.

## O que o aplicativo faz

| Área | Implementação e limites |
| --- | --- |
| Abertura de repositório | Seleção de diretório pelo navegador. A preparação adiciona travessia recursiva no arrastar e soltar, com leitura de todas as páginas de entradas do Chromium. |
| Leitura | Lotes de 80 arquivos; texto somente abaixo de 500 KiB; binários mantêm referência local para preview. Diretórios gerados e nomes específicos são ignorados. Não há interpretação de `.gitignore`. |
| Dependências | Expressões regulares para JS/TS, HTML, CSS, Python, Go, C/C++ e alguns imports de C#/Java/PHP/Kotlin/Dart/Scala/Rust. Reconhecer uma extensão não significa analisar toda a linguagem. |
| Referências específicas | IDs YAML, `parent`, sprites RSI, `meta.json → states[].name.png`, além de caminhos de arquivos detectados genericamente. |
| Relações estruturais | Arquivos com nome-base semelhante, Dockerfile/Compose e workflow/build da raiz. São inferências, não provas de dependência de execução. |
| Explorador | Árvore expansível, busca por nome/caminho, seleção sincronizada e painéis redimensionáveis. |
| Busca no conteúdo | Comparação textual sem diferenciar maiúsculas, após 600 ms e pelo menos dois caracteres; inclui vizinhos diretos dos resultados. Não usa embeddings nem análise semântica. |
| Grafo global | SVG até 800 nós; Canvas 2D acima disso; modo simplificado acima de 15 mil. D3 executa a física no renderer. Zoom, arraste, seleção e menu de contexto. |
| Grafo local | Vizinhança de primeiro e segundo nível. O contador limita 50 expansões de arestas no segundo nível; não limita todos os nós do grafo. |
| Agrupamentos | Pasta/profundidade, tipo, padrões de nome e conectividade por propagação de rótulos. Contornos, força de agrupamento e isolamento de grupo. |
| Detalhes | Tamanho, relações de entrada/saída, conteúdo com realce, imagem com zoom/pan, áudio/vídeo e grafo local. |
| Exportação | Markdown com árvore e contagens. Não exporta o conjunto completo de arestas, layout, tags ou notas. |
| Idiomas | Português e inglês em contexto React com preferência em localStorage. Ainda existem textos e rótulos fixos em português. |
| Desktop | Electron abre a interface Vite ou `dist/index.html`; build Windows NSIS via electron-builder. |

## Mapa dos arquivos

| Arquivo ou grupo | Responsabilidade |
| --- | --- |
| `src/RepoVisualizer.jsx` | Fluxo de abertura, estado do projeto, busca, seleção, filtros, exportação e composição dos painéis. A construção do grafo foi extraída nesta etapa. |
| `src/core/analyzeRepository.js`, `contract.js`, `paths.js` | Motor independente, validação/versionamento e operações de caminho. Sem React, Electron, D3 ou filesystem. |
| `src/services/repositoryFiles.js` | Entrada de arquivos, filtros, limite de leitura e travessia de diretórios. |
| `src/services/analysisClient.js` | Transporte por Worker e adaptação da resposta para a UI: `File`, conteúdo, cores, Map e árvore. |
| `src/utils/parser.js` | Resolução heurística e extração de relações. |
| `src/utils/graphWorker.js` | Antes era um esboço com variáveis inexistentes; agora executa o motor e retorna sucesso/erro. |
| `src/utils/clustering.js` | Quatro estratégias de agrupamento e índice nó/grupo. |
| `src/utils/constants.js` | Extensões, filtros, classificação visual e palavras-chave de realce. A separação entre política de leitura e cores ainda pode avançar. |
| `src/utils/helpers.jsx` | Formatação, árvore e realce de código React. |
| `CanvasGlobalGraph.jsx`, `MiniGraph.jsx` | Renderização, física e interação D3. |
| `TreeNode.jsx`, `FilePanel.jsx` | Navegação por arquivo e inspeção. |
| `ConnectionFilter.jsx`, `ClusteringControls.jsx`, `ContextMenu.jsx` | Filtros, agrupamentos e ações contextuais. |
| `SettingsModal.jsx`, `ManualModal.jsx` | Preferência de idioma e documentação interna. |
| `useTags.js` | Armazenamento preparado para tags/notas; o painel ainda não consome as propriedades recebidas. |
| `useLayout.js`, `useResizable.js` | Visibilidade e tamanho dos painéis. |
| `useTranslation.jsx` | Dicionários e persistência de idioma. |
| `main.jsx`, `ErrorBoundary.jsx` | Inicialização React, fontes locais e tratamento de falha de renderização. |
| `main.js`, `preload.js` | Janela Electron e API declarada. Os canais do preload não têm handlers correspondentes no processo principal. |
| `vite.config.js`, `eslint.config.js`, `index.html` | Build, lint e entrada/CSP. |
| `public/icon.png` | Ícone da interface. |
| `crates/beckarepo-core/` | Nova base Rust: DTOs Serde e validação do contrato. Ainda não executa parsing. |
| `tests/` | Casos de regressão da fronteira de análise e fixtures JSON compartilhadas com Rust. |

## Planejado, incompleto ou descrito além da implementação

| Item encontrado | Estado real | Próxima ação |
| --- | --- | --- |
| IA para arquitetura | Apenas meta no README original | Definir casos de uso, consentimento para envio de código e saída verificável, depois do motor local. |
| Detecção de risco | Meta sem módulo implementado | Começar por ciclos, fan-in/fan-out e dependências não resolvidas; separar heurística de diagnóstico confirmado. |
| Repository clustering | Já implementado | Medir qualidade/estabilidade e tornar a estratégia de conectividade determinística. |
| Multi-repositório | Não há modelo de múltiplas raízes | Definir identidade e namespace antes de juntar grafos. |
| Monitoramento ao vivo | Não há watcher, cache incremental ou invalidadores | Implementar no futuro serviço Rust, com debounce e cancelamento. |
| Anotações colaborativas | Não há servidor/sincronização | Primeiro concluir anotações locais e formato de armazenamento. |
| Tags e notas locais | Hook existe; editor ausente | Conectar painel, impedir estado herdado ao trocar de repo e migrar chaves antigas. |
| APIs do preload | Canais permitidos, mas sem handlers | Substituir por comandos explícitos e implementados na futura ponte nativa. |
| Worker | Esboço desconectado | Resolvido nesta preparação. |
| AST, WebGL e 85 mil nós a 60 FPS | Afirmações sem implementação/benchmark correspondente | Documentação corrigida para regex/índices e Canvas 2D; medir antes de prometer escala. |

## Problemas e prioridades

**Resolvidos na preparação:** análise síncrona dentro de React; Worker vazio; caminhos com prefixo da pasta prejudicando resolução da raiz/CI; perda de tipos e direções por fusão de arestas; arrastar pasta sem percorrer diretórios; fundo animado e paletas privadas divergentes. O agrupamento por pasta foi ajustado para os caminhos relativos. Setas SVG passaram a seguir origem → destino.

**Prioridade alta antes de ativar Rust:** corpus de compatibilidade multilíngue; referências não resolvidas com diagnóstico; identidade persistente do repositório; migração de metadados; leitura nativa com raiz autorizada, cancelamento e limites totais de memória. O limite de 500 KiB é por arquivo: muitos arquivos pequenos ainda podem consumir muita RAM, inclusive durante a cópia para o Worker.

**Parsing:** não há AST, resolução completa de aliases/tsconfig/workspaces, nem semântica completa de `crate`, `super`, `mod` e `use` de Rust. Python não cobre todas as formas de import absoluto. O fallback por nome pode gerar falsos positivos. A varredura genérica pode reconhecer texto de comentário como referência. Esses limites devem permanecer explícitos na UI/documentação.

**Grafos:** layout inicial e LPA usam aleatoriedade; isso dificulta comparação de sessões. O SVG original omitia arquivos sem conexões, corrigido nesta etapa. Falta tratar redimensionamento do canvas com ResizeObserver. A troca de agrupamento no Canvas deve atualizar também os dados capturados pela força física. O grafo de termo não aplica todos os filtros do grafo global. Ações de menu e arraste precisam de testes de acessibilidade e teclado.

**Estado:** `useTags` pode manter dados do repositório anterior quando não existe entrada salva; chaves baseadas apenas no nome colidem. O hook ainda não está exposto como recurso funcional. Preferências e metadados precisam de tratamento de falhas de storage. Há efeitos React e refs que o lint atual sinaliza.

**Empacotamento:** validar instalador limpo e ambiente sem servidor Vite. O manifesto de build não lista `public/icon.png` entre os arquivos da aplicação, embora `main.js` use esse caminho. O preload CommonJS em projeto ESM merece conferência no runtime Electron utilizado. Não foi feita atualização de dependências nem auditoria de vulnerabilidades nesta preparação.

## Direção recomendada

Migrar primeiro análise, leitura de disco, índices e persistência para uma biblioteca Rust. React/D3 continuam como consumidores de um contrato de dados. Depois, avaliar a troca de Electron por Tauri 2. Uma UI escrita integralmente em Rust seria outro projeto de renderização, com substituição dos componentes React e interações D3.

Essa divisão acompanha o modelo de core Rust e WebView documentado pelo [Tauri](https://v2.tauri.app/concept/process-model/). O formato compartilhado usa [Serde](https://serde.rs/derive.html). O roteiro concreto está em [MIGRACAO_RUST.md](MIGRACAO_RUST.md).
