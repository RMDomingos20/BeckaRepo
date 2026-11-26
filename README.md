# BeckaRepo

[Manual ilustrado de uso](docs/MANUAL.md) · Também disponível no botão **Guia**, antes ou depois de abrir um projeto.

Aplicativo desktop para explorar arquivos, dependências e referências de um repositório local.

**O aplicativo agora usa Rust e Tauri 2.** Rust executa a análise, leitura de arquivos, diálogos nativos e exportação. React e D3 continuam responsáveis pela interface. Electron e o motor JavaScript antigo foram removidos.

## Rodar no terminal do VS Code

Pré-requisitos no Windows: Rust estável com toolchain MSVC, Visual Studio Build Tools com a carga **Desenvolvimento para desktop com C++** e Windows SDK, Node.js compatível com Vite 8 (20.19+ ou 22.12+) e Microsoft Edge WebView2 Runtime. Veja os [pré-requisitos oficiais do Tauri](https://v2.tauri.app/start/prerequisites/).

Na pasta raiz deste repositório:

```powershell
npm install
npm run dev
```

O comando inicia Vite e abre a janela nativa Tauri. A primeira compilação Rust pode demorar. Encerre com `Ctrl+C` no terminal. Se acabou de instalar Rust/Build Tools, reinicie o terminal do VS Code.

## Gerar o executável e instalador

```powershell
npm run build
```

- Executável: `target/release/beckarepo.exe`.
- Instalador Windows: `target/release/bundle/nsis/`.
- `npm run build:exe` também gera o instalador NSIS.

O executável compilado funciona sem Node, npm ou Vite; usa o WebView2 do Windows. A primeira geração do instalador pode baixar as ferramentas de empacotamento.

## Usar somente Rust no terminal

```powershell
cargo run -p beckarepo-core --bin beckarepo-cli -- "D:\caminho\do\repositorio"
```

A CLI retorna snapshot JSON v2 com metadados de arquivos, grafo e estatísticas, sem conteúdo bruto. O modo `--json` mantém o contrato de análise v1. Não precisa de Node ou da interface.

## Funcionalidades disponíveis

- Seleção nativa de pasta e arrastar/soltar diretórios na janela.
- Análise Rust em segundo plano com progresso, cancelamento e avisos de leitura.
- Árvore de arquivos, busca por nome/caminho e busca textual paginada em Rust, com cobertura e cancelamento.
- **Grafo global → Disposição** oferece Galáxia, Atlas e Livre em Canvas. Na Galáxia, o centro prioriza arquivos com mais vizinhos (cada entrada vale dois e cada saída vale um). O Atlas reserva a cada grupo uma área proporcional à quantidade de arquivos. Livre organiza os arquivos por forças. Clássico oferece SVG até 800 nós.
- No grafo global, círculos vazados indicam arquivos isolados e losangos indicam pelo menos oito conexões no filtro atual. Na visão geral densa, passe o cursor sobre um grupo para ver a contagem ou clique para aproximar. Use **Pastas** para explorar diretórios e **Só do arquivo** para seguir as ligações da seleção. O **Guia** do aplicativo traz a legenda e os controles.
- Filtros de relações, agrupamento por pasta, tipo, padrões de nome e conectividade.
- Inspeção de código e prévia de imagens, áudio e vídeo.
- Atualização incremental por botão, reaproveitando relações válidas, e transporte do grafo em lotes.
- Tags e notas por arquivo, preferências em SQLite, importação de anotações JSON, backups e restauração.
- Aba **Histórico Git** por arquivo: branch/HEAD, worktrees, commits, churn e frequência por janela, com cancelamento e cobertura. Requer Git no PATH.
- Exportação de árvore e estatísticas em Markdown com diálogo de salvamento.
- Interface em português e inglês, painéis redimensionáveis e paleta lilás. Em **Projeto → Configurações e dados**, altere a cor de destaque e o espaçamento. O Guia traz capturas ampliáveis de cada tarefa.

A extração usa Tree-sitter para o piloto JS/TS/JSX/TSX/Rust, com intervalos de evidência e diagnósticos no painel do arquivo. Outras linguagens, YAML/RSI e relações Docker/CI mantêm heurísticas/regex. A resolução inclui configurações locais tsconfig/jsconfig (paths, baseUrl e extends), bindings com intervalos, módulos Rust inline e dependências Cargo locais por path, com aliases e herança explícita de workspace.dependencies. Ligações Cargo apontam para a entrada da biblioteca; não comprovam a exportação do símbolo. Associação completa de targets/workspaces, features, cfg e references TS continuam pendentes. Texto com 500 KiB ou mais não é carregado; o scanner processa um arquivo por vez e aceita até 100 mil arquivos. O limite agregado de 256 MiB permanece apenas no pedido JSON v1. Mídia para prévia tem limite de 128 MiB. Não há garantia de análise completa de uma linguagem ou de desempenho para determinado número de arquivos.

A entrega mais recente de F5 resolve atributos `#[path]` literais em módulos Rust externos e inline, com destinos limitados ao inventário. A associação a targets Cargo preserva entradas personalizadas, fontes compartilhados e `src/bin`. O painel **Parsing e evidências** mostra targets, caminho lógico e regra de resolução. `crate`, `self` e `super` usam a árvore lógica; divergências entre targets geram diagnóstico. Features e cfg não são avaliados; cfg_attr e outros casos não suportados são diagnosticados. Uma alteração em fonte Rust pode reconstruir o índice completo de módulos. A rodada atual passou em 47 testes Rust e 5 JavaScript; cobertura, limites e pendências visuais estão no [relatório de F5](docs/validation/2026-10-29/RELATORIO_F5_PATH.md).

F6 acrescenta **análises → Dependências externas**: declarações npm/Cargo/Maven, versões observadas em locks suportados, consumidores com evidência e consulta de impacto indireto. F7 acrescenta **Símbolos** no painel do arquivo: extração Rust sob demanda para JS/TS/Rust, complexidade por função, chamadas lexicais locais e grafo expansível. A primeira rodada passou em 63 testes Rust e 7 JavaScript; veja o [relatório F6/F7](docs/validation/2026-10-30/RELATORIO_F6_F7.md). Resolução global de símbolos e chamadas entre arquivos permanece pendente.

No modo Livre, F8 calcula as posições do Canvas em um Worker, com transferência limitada de coordenadas e preservação dos nós fixados. A seção **Desempenho do grafo** separa cálculo, aplicação e desenho. O [relatório F8](docs/validation/2026-10-30/RELATORIO_F8_WORKER.md) registra 12 testes JavaScript e o ensaio sintético; não há garantia de FPS em repositórios grandes. LOD automático por zoom e medições completas na WebView continuam pendentes.

Nos grafos global/de busca acima de 800 arquivos, **Detalhamento → Pastas** permite expandir diretórios progressivamente e conferir conexões agregadas. O arquivo selecionado permanece individual. A lista **Navegar por pastas** oferece busca e recolhimento dos ramos. Veja o [relatório de 31/10](docs/validation/2026-10-31/RELATORIO_F8_PASTAS.md), com 17 testes JavaScript aprovados.

## Comandos adicionais

| Comando | Finalidade |
| --- | --- |
| `npm run dev:vite` | Somente interface no navegador; análise requer a janela Tauri. |
| `npm run build:ui` | Compilar apenas os recursos da interface. |
| `npm run check:rust` | Compilar/verificar os tipos do workspace Rust. |
| `npm run test:core` | Testes de contrato do núcleo Rust. |
| `npm run test:rust` | Testes do workspace Rust. |
| `npm run lint` | Análise estática da interface. |
| `cargo fmt --all` | Formatação dos fontes Rust. |

`Cargo.lock` e `package-lock.json` versionam as dependências. Em uma máquina nova, os downloads iniciais requerem rede. O lint possui dívida técnica herdada nos componentes React.

## Roadmap preparado

O briefing foi convertido em entregas para Rust/Tauri: segurança e memória, SQLite, Git, métricas, parsing sintático, dependências externas e zoom/LOD. A preparação já centraliza a política de arquivos e bloqueia nomes sensíveis conhecidos; a leitura sob demanda e a busca nativa de F1 já foram implementadas. A persistência SQLite de F2 e os controles de notas/backups também estão implementados. F3 inclui histórico por arquivo, associação persistente de worktrees, cache SQLite, hotspots, autoria opcional e coalteração. A visão **análises** também oferece F4: ciclos, graus, PageRank e betweenness calculados em Rust. F8 foi iniciada com zoom legível, agrupamento espacial e foco nas conexões do arquivo em grafos grandes. F3 agora inclui grafo de coalteração por página, comparação local e reassociação de pastas; F4 permite navegar por todos os componentes calculados. F5 iniciou o piloto sintático descrito abaixo. Resolução completa de configurações e LOD automático por zoom continuam planejados. Física do Canvas em Worker e detalhamento explícito por pastas já estão disponíveis; os relatórios recentes distinguem validação automatizada e visual.

- [Etapa F1 implementada: funcionamento e limitações](docs/ETAPA_F1.md)
- [Etapa F2: notas, banco local, importação e backups](docs/ETAPA_F2.md)
- [Etapa F3: histórico Git, persistência, hotspots e coalteração](docs/ETAPA_F3.md)
- [Etapa F4: ciclos e métricas estruturais em Rust](docs/ETAPA_F4.md)
- [Etapa F5: piloto sintático, evidências e limites](docs/ETAPA_F5.md)
- [Etapa F8: zoom, agrupamento e navegação em grafos densos](docs/ETAPA_F8.md)
- [Roadmap priorizado e critérios de entrega](docs/ROADMAP.md)
- [Arquitetura proposta e transição do contrato](docs/ARQUITETURA_ROADMAP.md)
- [Política de arquivos e limites atuais](docs/POLITICA_DE_ARQUIVOS.md)

## Arquitetura e próximos passos

- [Arquitetura Rust, limites e pendências](docs/MIGRACAO_RUST.md)
- [Diagnóstico histórico anterior à migração](docs/ANALISE_REPOSITORIO.md)
- [Direção visual](docs/INTERFACE.md)
- [Registro de compilação e limitações de validação](docs/VALIDACAO.md)

Núcleo nativo em `crates/beckarepo-core/`; host desktop em `src-tauri/`; transporte em `src/services/`; interface em `src/components/`.

Tags e notas são editadas em **Visão geral** e gravadas no banco do diretório de dados do app, fora da pasta analisada. **Configurações → Dados locais** mostra o caminho e os controles de backup/importação. IA, análise de risco, múltiplos repositórios, monitoramento ao vivo e anotações colaborativas continuam planejados. Clustering já está implementado. Metadados do antigo Electron exigem exportação para JSON e importação explícita, conforme o guia F2.

## Créditos

Criado com dedicação à engenharia de software, visualização e experiência de desenvolvimento.

### Mensagem para Rebecka

> "From one friend to another."
