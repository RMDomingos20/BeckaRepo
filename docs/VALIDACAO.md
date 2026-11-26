# Compilação da migração — 25/10/2026

31/10/2026: [F8 — agrupamento por pastas](validation/2026-10-31/RELATORIO_F8_PASTAS.md), 17 testes JavaScript, lint e build Windows aprovados. Relatórios anteriores abaixo preservam seu contexto histórico.

Estado mais recente, 30/10/2026: [relatório F6/F7](validation/2026-10-30/RELATORIO_F6_F7.md) (63 testes Rust, 7 JavaScript) e [entrega F8 em Worker](validation/2026-10-30/RELATORIO_F8_WORKER.md) (JavaScript ampliado para 12 testes). Os registros abaixo são históricos e preservam as pendências daquela data. Consulte os relatórios recentes para o estado atual e os limites do aceite visual.

## Estado da entrega

| Etapa | Resultado |
| --- | --- |
| `npm run build:ui` | Compilação da interface concluída com integração Tauri. |
| `cargo check --workspace --offline` | Workspace Rust compilado sem erros, incluindo motor, CLI e host desktop. |
| ESLint de `analysisClient.js`, `contract.js` e `RepoVisualizer.jsx` | Sem erros após os ajustes de integração. |
| `cargo fmt --all` | Formatação aplicada. |
| `npm run build` | Concluído e regenerado após F1: executável Rust e instalador NSIS x64 de 2,74 MiB. |

Não foram executados testes automatizados nesta etapa. Os testes existentes em `crates/beckarepo-core/tests/contract.rs` cobrem o contrato JSON; não são prova de paridade funcional do parser portado. O corpus multilíngue em `tests/fixtures/` registra resultados de referência da implementação anterior.

A navegação completa na janela Tauri, instalação em uma máquina limpa, mídia, cancelamento, arraste nativo, Canvas acima de 800 nós e benchmarks ainda precisam de validação de execução. Compilação bem-sucedida não substitui essas verificações.

O lint dos componentes herdados ainda aponta problemas de refs, efeitos e memoização React e organização de exports. A migração não é uma revisão integral dessa dívida técnica.

## Artefatos gerados

- `target/release/beckarepo.exe`
- `target/release/bundle/nsis/BeckaRepo_1.1.0_x64-setup.exe`

A primeira tentativa de empacotamento encontrou uma restrição de rede ao baixar NSIS. A repetição com acesso autorizado à rede concluiu o download, a verificação de hash das ferramentas e o empacotamento. O instalador foi gerado, mas não executado.

## Limpeza realizada

- Removidos `electron`, `electron-builder`, `concurrently` e `wait-on` do manifesto e da instalação npm.
- Removidos `main.js`, `preload.js`, parser JavaScript, Worker e leitura de diretórios pelo navegador.
- Removidos scripts/configuração de empacotamento Electron e os artefatos antigos de `release/`.
- Mantidos React, D3, Vite e ferramentas necessárias à interface.
- `electron-to-chromium` pode aparecer como dependência transitiva de Browserslist: é uma tabela de compatibilidade de navegadores, não o runtime Electron.

## Histórico

O diagnóstico de preparação e suas verificações de interface no navegador referiam-se ao antigo motor JavaScript. Esse motor foi removido. Para uso atual, abra a janela desktop com `npm run dev`; `npm run dev:vite` serve somente para trabalhar na interface.

## Preparação do roadmap — 25/10/2026

Política de arquivos extraída para `policy.rs`, proteção de nomes sensíveis aplicada ao scanner/leitura e validação, limites de entrada JSON centralizados e contagem de texto retido corrigida. `cargo check --workspace --offline` concluiu sem erros; o filesystem emitiu avisos de fallback de hardlink para cópia no cache incremental. Não foram criados ou executados testes novos nesta etapa. O desenho de Git, SQLite, AST, métricas e LOD está documentado, não implementado.

`npm run build` também concluiu após esta preparação, regenerando o executável e o instalador NSIS. A tentativa em ambiente restrito não encontrou as ferramentas NSIS; a repetição com acesso autorizado utilizou o cache e terminou com sucesso. O instalador não foi executado e a navegação na janela não foi testada nesta revisão.

## F1 — leitura sob demanda e busca Rust

Implementados MEM-01 a MEM-04: scanner em duas passagens, envelope v2 sem texto, leitura individual autorizada/revisada, busca literal paginada e cancelável. `cargo check --workspace --offline` e `npm run build:ui` concluíram. O filesystem voltou a emitir avisos de fallback de hardlink para cópia no cache Rust. Não foram adicionados/executados testes automatizados nem testes interativos; paridade do grafo, corrida de cancelamento, paginação e redução de memória ainda precisam de validação de execução. Ver [ETAPA_F1.md](ETAPA_F1.md) para a mudança de contrato da CLI com pasta e as pendências MEM-05/MEM-06.

Build final de F1: `npm run build` concluído, executável e instalador NSIS regenerados (2,74 MiB). ESLint passou para `useRepositorySearch.js`, `analysisClient.js` e `RepoVisualizer.jsx` após o ajuste das dependências do callback. O lint global e os fluxos de execução não foram validados nesta etapa.

## F1 complementar e F2 — 26/10/2026

Implementados transporte de snapshot por manifesto/lotes com confirmação, atualização manual com reutilização de relações, reconciliação de revisões e até três tentativas em pasta instável. Acrescentados SQLite embutido, identidades persistentes, edição de tags/notas, migração do LocalStorage, importação JSON explícita, preferências e controles de backup/restauração.

Checagens desta entrega:

- `cargo fmt --all`: aplicado.
- `cargo check --workspace --offline`: concluído, incluindo os ajustes finais de sessão e persistência. Avisos do filesystem sobre hardlinks do cache incremental continuam; o compilador usa cópias.
- ESLint: sem erros em `RepoVisualizer.jsx`, `AnnotationEditor.jsx`, `DataSettings.jsx`, `SettingsModal.jsx`, `useTags.js`, `usePreferences.js`, `useLayout.js`, `useTranslation.jsx`, `analysisClient.js` e `roadmapStrings.js`.
- `npm run build`: compilação da interface e do host Rust e empacotamento NSIS concluídos. Instalador de aproximadamente 3,57 MiB, mantendo a versão 1.1.0. O aviso sobre o sufixo `.app` no identificador refere-se ao empacotamento macOS; a identidade existente foi preservada.
- `git diff --check`: sem erros de whitespace nos arquivos rastreados; avisos de conversão LF/CRLF do checkout Windows.

Não foram adicionados ou executados testes automatizados, testes interativos, simulações de corrupção/disco cheio, instalação do pacote ou benchmarks. A geração do instalador não comprova esses fluxos. O lint global não foi executado; os componentes herdados continuam com a dívida descrita acima.

Guias atuais: [F1](ETAPA_F1.md), [F2](ETAPA_F2.md) e [roadmap](ROADMAP.md). Para aceite funcional, permanecem as verificações de cancelamento durante transferência, atualização com inclusão/remoção, notas após reinício, importação repetida, conflito de revisões, backup/restauração e recuperação do banco indisponível.

## F3 — primeira entrega de histórico Git — 26/10/2026

Implementados descoberta do repositório/worktree, consulta de histórico por arquivo em Rust e painel Histórico Git. A consulta oferece janelas de 7, 30, 90 e 365 dias, frequência, linhas adicionadas/removidas, churn, mudanças de caminho observadas, cancelamento e cache limitado em memória. A interface sinaliza histórico raso, truncamento e registros excluídos pela política de caminhos sensíveis.

Checagens desta entrega:

- `cargo fmt --all`: aplicado.
- `cargo check --workspace --offline`: concluído após os ajustes finais de descoberta de caminhos. Permanecem apenas os avisos de fallback de hardlink para cópia no cache incremental.
- ESLint: sem erros em `GitHistoryPanel.jsx`, `gitStrings.js` e `useTranslation.jsx`.
- `npm run build`: interface, executável Rust e instalador NSIS gerados com sucesso. Instalador `BeckaRepo_1.1.0_x64-setup.exe` de aproximadamente 3,60 MiB. Permanece o aviso existente sobre o sufixo `.app` do identificador para macOS.
- `git diff --check`, reconhecendo CRLF com `core.whitespace=cr-at-eol`: sem erros nos arquivos rastreados; avisos de conversão LF/CRLF do checkout Windows.

Não foram adicionados ou executados testes automatizados, consultas funcionais do novo módulo Git, navegação interativa, instalação ou benchmarks. O lint global não foi executado. Ainda precisam de validação em execução: arquivos renomeados, repositórios rasos, worktrees vinculadas, submódulos, cancelamento, caminhos incomuns e mudanças de HEAD durante uma consulta.

Esta é uma entrega parcial de F3. Associação persistente de worktrees, cache Git em SQLite, hotspots globais, autoria/mailmap e coalteração continuam pendentes. Escopo, limites e requisitos estão em [ETAPA_F3.md](ETAPA_F3.md).

## Correção da falha de inicialização — 26/10/2026

O usuário reportou a tela de erro `Cannot read properties of null (reading 'ready')`. A inspeção localizou a causa em `useTags.js`: no primeiro render, `load` é `null` e os argumentos de snapshot/caminho são `undefined`; as comparações com optional chaining resultavam em igualdade, permitindo o acesso direto a `load.ready`. A expressão seguinte também podia acessar `load.error` da mesma forma.

A correção exige um carregamento existente e uma seleção válida antes de consultar prontidão/erro. O resultado também precisa corresponder à worktree, snapshot, caminho e tentativa de recarga atuais. Recarregar desabilita a edição até a nova resposta, preservando os rascunhos; editar/descartar também respeitam prontidão e salvamento em andamento no hook.

- ESLint de `useTags.js`, `AnnotationEditor.jsx` e `GitHistoryPanel.jsx`: concluído sem erros.
- `git diff --check` de `useTags.js`, com reconhecimento de CRLF: sem erros; permanece o aviso de conversão LF/CRLF.
- `npm run build`: compilação de produção da interface, executável Rust e instalador NSIS concluída. `BeckaRepo_1.1.0_x64-setup.exe` regenerado com a correção (3,59 MiB); permanece o aviso existente do identificador `.app` para macOS.

Não foram adicionados/executados testes automatizados nem exercitada a janela desktop nesta correção. A causa foi identificada por inspeção do código a partir do erro reportado; a compilação não comprova o aceite interativo. Antes da próxima entrega, permanecem os cenários de abertura vazia, primeira seleção, desseleção, troca de arquivo/worktree, recarga após falha e preservação dos rascunhos. A sequência de continuação está no [roadmap](ROADMAP.md#próxima-fatia-concreta).

## F8 — legibilidade e navegação no Canvas — 26/10/2026

Antecipada a primeira parte de F8 após o relato de perda de legibilidade em um grafo com 85.224 arquivos e 91.745 conexões. A inspeção identificou a opacidade decrescente com o zoom e a sobreposição sem orçamento de desenho no Canvas anterior.

Implementados `DenseGraphCanvas.jsx`, utilitários de recorte/agrupamento/colisão de rótulos e traduções PT/EN. Incluem raios/linhas em pixels CSS, grupos espaciais com contagem, limiares distintos para entrar/sair da agregação, foco nas conexões incidentes, limites explícitos de desenho, índice espacial, comandos de câmera, resize e limpeza dos eventos. Ajustado o efeito do menu de contexto SVG para usar callback atualizado sem reconstruir a simulação a cada seleção.

- ESLint de `CanvasGlobalGraph.jsx`, `DenseGraphCanvas.jsx`, `graphViewport.js`, `graphStrings.js` e `useTranslation.jsx`: sem erros ou avisos após os ajustes finais.
- `npm run build`: interface e host Rust compilados e instalador NSIS gerado. Mantida a versão 1.1.0 e o aviso existente sobre o identificador `.app` para macOS.
- `git diff --check`, com reconhecimento de CRLF: sem erros nos arquivos rastreados; avisos habituais de conversão LF/CRLF.

Não foram adicionados ou executados testes automatizados, testes interativos ou benchmarks. O repositório de 85 mil arquivos da imagem não foi carregado nesta entrega; não há medição de FPS, latência ou memória que comprove desempenho nessa escala. A física continua na thread da interface e precisa de separação/medição na continuação de F8. Limites e roteiro de aceite estão em [ETAPA_F8.md](ETAPA_F8.md).

## Continuação de F3 e implementação de F4 — 26/10/2026

Implementados:

- Schema 2, associação de diretório Git comum/worktrees/localizações sem reescrever as anotações existentes, migração transacional e compatibilidade de restauração com schemas 1/2.
- Cache Git persistente limitado, com intervalo explícito, HEAD, versão e fronteira shallow na chave; falhas do cache não bloqueiam a análise.
- Histórico agregado com hotspots, filtro de commits de massa, autoria mailmap opcional sem persistência e pares de coalteração com suporte/proporções condicionais. Resumos limitados a 200 arquivos/200 pares, com totais e cobertura visíveis.
- Projeção estrutural em Rust, Kosaraju iterativo com testemunhas de ciclo, graus, PageRank e betweenness exata/amostrada. Paginação de 100 linhas, cancelamento, cache por snapshot e orçamento de resposta.
- Visão **análises**, com **Git do projeto** e **Estrutura e ciclos**, seleção de arquivos e comparação explícita entre estrutura atual e evidência histórica consultada.

Checagens:

- `cargo fmt --all`: aplicado.
- `cargo check --workspace --offline`: concluído após os ajustes de registro dos comandos Tauri e limites de memória. Somente avisos de hardlink → cópia no cache incremental do filesystem.
- ESLint de `RepositoryInsights.jsx`, `GitHistoryPanel.jsx`, `useNativeAnalysis.js`, `useTranslation.jsx`, `insightStrings.js`, `gitStrings.js` e `RepoVisualizer.jsx`: sem erros/avisos.
- `npm run build`: interface, executável Rust e instalador NSIS gerados. Versão mantida em 1.1.0; pacote de aproximadamente 3,71 MiB. Permanece o aviso existente do identificador `.app` para macOS.

Não foram adicionados/executados testes automatizados, consultas funcionais Git, migração/restauração de banco de usuário, navegação interativa, instalação ou benchmarks. O banco real não foi aberto/modificado pelos comandos de compilação. Build e lint não comprovam os novos fluxos nem a exatidão numérica; os roteiros de aceite estão em [F3](ETAPA_F3.md) e [F4](ETAPA_F4.md).

Continuam pendentes diferenças Git locais fora do índice, camada de coalteração no grafo, reassociação de localizações movidas e navegação além dos limites resumidos. A marcação de implementação no roadmap não equivale a aceite funcional das etapas.

## Pendências F3/F4 e piloto F5 — 26/10/2026

Esta continuação substitui as pendências funcionais listadas no parágrafo anterior:

- Comparação de bytes locais com o índice, sem filtros Git ou escrita de objetos; CRLF/LF contam como diferença, conforme aviso na UI.
- Reassociação explícita de pasta movida com seleção de localização anterior, confirmação nativa, backup, transação e invalidação de sessão. Bloqueia mistura com anotações do destino.
- Hotspots/pares em páginas de 100, camada de coalteração tracejada da página e componentes cíclicos em páginas de 20, sem os cortes anteriores de 200/100 resultados.
- Tree-sitter no núcleo Rust para JS/TS/JSX/TSX/Rust, resolução relativa conservadora, evidências em bytes/linha, diagnósticos, limites e fallback rotulado. F4 passa a incluir require/re-export e autoarestas sintáticas.

Checagens realizadas:

- Dependências Tree-sitter baixadas do crates.io e fixadas no Cargo.lock.
- `cargo fmt --all` e `cargo check --workspace --offline`: concluídos; avisos de fallback de hardlink no cache incremental.
- ESLint de RepositoryInsights, DataSettings, GitHistoryPanel, ParsingEvidence, DenseGraphCanvas e insightStrings: concluído sem erros. Foi corrigida a ordem de declaração do estado em DataSettings identificada na primeira passagem.
- Build da interface, host Rust e instalador NSIS: concluído, versão 1.1.0, aproximadamente 4,03 MiB. Uma falha intermediária de codificação em RepositoryInsights foi corrigida para UTF-8 antes da geração bem-sucedida. Aviso preexistente sobre identificador `.app` no macOS permanece.
- `git diff --check` com configuração CRLF: sem erros nos arquivos rastreados.

Não foram adicionados/executados testes, benchmarks, instalação, interação na janela ou operações no banco do usuário. A comparação Git, reassociação, paginação, gramáticas/resolução e cancelamento precisam de aceite em execução. A etapa F5 permanece parcial: corpus/precisão/recall, configuração de projetos, workspaces e resolução de símbolos ainda pendentes. Detalhes em [ETAPA_F5.md](ETAPA_F5.md).

## Segunda entrega F5 — conclusão em 27/10/2026

Implementados: resolução local de tsconfig/jsconfig com JSONC, paths/baseUrl e extends relativo; substituição de extensões em consumidores TS; escopos Rust inline; bindings estruturados e regra de resolução na interface; invalidação do cache por revisão das configurações herdadas. Importações Rust resolvidas dentro do próprio arquivo são contadas sem criar ciclos entre arquivos.

Checagens:

- `cargo fmt --all`: aplicado durante a implementação.
- `cargo check --workspace --offline`: concluído na retomada de 27/10, somente avisos de cópia no cache incremental por indisponibilidade de hardlinks.
- ESLint de `ParsingEvidence.jsx` e `insightStrings.js`: sem erros.
- `npm run build`: resultado da execução iniciada em 26/10 recuperado e confirmado na retomada; UI, executável e instalador NSIS gerados, versão 1.1.0, aproximadamente 4,06 MiB. Aviso preexistente do identificador `.app` permanece.
- `git diff --check`, considerando CRLF: sem erros nos arquivos rastreados.

A atualização da documentação ficou interrompida por limite de uso na revisão automática de aprovação e foi concluída em 27/10. Não houve rejeição por insegurança da alteração. Nenhum teste funcional, corpus, benchmark ou instalação foi executado; compilação/lint não comprovam equivalência à resolução dos compiladores TypeScript ou Rust. Cobertura, limites e pendências estão em [ETAPA_F5.md](ETAPA_F5.md).

## Terceira entrega F5 — Cargo local, 27/10/2026

Implementados: índice limitado de manifests Cargo, dependências normais por path, aliases/package, entrada/nome da biblioteca, herança de dependências e edição em membros explícitos do workspace. O painel apresenta a origem da resolução e seus limites. Cache atualizado para syntax-v3, com invalidação por revisão dos manifests. A associação por diretório e os casos não suportados estão detalhados em [ETAPA_F5.md](ETAPA_F5.md).

Checagens realizadas:

- `cargo fmt --all`: aplicado.
- `cargo check --workspace --offline`: concluído; somente avisos de cópia em vez de hardlinks no cache incremental.
- ESLint de `ParsingEvidence.jsx` e `insightStrings.js`: concluído sem erros.
- `npm run build`: UI, executável Rust e instalador NSIS gerados, versão 1.1.0, aproximadamente 4,16 MiB. Aviso preexistente do identificador `.app` permanece.
- `git diff --check` com configuração CRLF: sem erros nos arquivos rastreados.

Não foram criados/executados testes, corpus, benchmarks, instalação, interação na janela ou operações no banco do usuário. A compilação não comprova a precisão semântica das novas ligações. Próxima implementação: associação de targets Cargo e raízes de módulos; validação funcional e precisão/recall continuam pendentes.

## Quarta entrega F5 — targets e módulos Cargo, 27/10/2026

Implementados: descoberta limitada de targets Cargo declarados/convencionais, vínculo de fontes pelas declarações mod, raízes personalizadas, contextos compartilhados e consenso de destino para crate/self/super. Dependências usam o manifest proprietário; targets não biblioteca podem referenciar a biblioteca do próprio pacote. Fontes de build scripts não recebem dependências normais. O painel apresenta targets/módulos, o cache passou a syntax-v4 e src/bin foi incluído no inventário e nos agregados Git.

Checagens realizadas:

- `cargo fmt --all`: aplicado.
- `cargo check --workspace --offline`: concluído; avisos de cópia em vez de hardlinks no cache incremental.
- ESLint de `ParsingEvidence.jsx` e `insightStrings.js`: concluído sem erros.
- `npm run build`: interface, executável Rust e instalador NSIS gerados; versão 1.1.0, aproximadamente 4,20 MiB. Avisos sobre identificador `.app` e tempo do plugin CSS do Vite, sem impedir a geração.
- `git diff --check`, considerando CRLF: sem erros nos arquivos rastreados.

Não foram criados/executados testes, corpus, benchmarks, instalação, interação na janela ou operações no banco do usuário. Compilação e lint não comprovam precisão das associações nem desempenho. A reconstrução agora inclui uma passagem adicional pelos fontes Rust; o custo e a melhoria incremental por arquivo precisam de medição. Limites, cobertura e casos pendentes estão em [ETAPA_F5.md](ETAPA_F5.md). Próxima implementação: atributos de caminho Rust com confinamento e condições diagnosticadas.


## Validação funcional automatizada F0–F5 — 27/10/2026

Foi executada a rodada solicitada pelo usuário, com 34 testes Rust e 3 testes JavaScript aprovados, bancos SQLite isolados, repositórios Git sintéticos, worktree e clone raso local. ESLint completo, formatação Rust e análises reais pela CLI passaram. O [relatório completo](validation/2026-10-27/RELATORIO_F0_F5.md) contém matriz por fase, logs, medidas, falhas encontradas/corrigidas e instruções de reprodução.

A validação visual permanece pendente: o controle de computador recusou acesso ao BeckaRepo e o usuário orientou registrar essa limitação. Não se declara aceite integral das fases nem se inicia a próxima implementação sob a condição “se tudo ok”. A entrega de atributos Rust `#[path]` está preparada no relatório; F6 continua não iniciada. Os registros anteriores descrevem suas próprias entregas e não substituem esta rodada.


## Continuidade da validação e autorização Computer Use — 27/10/2026

A suíte passou a 40 testes Rust e 5 JavaScript, todos aprovados. Foram acrescentados testes de transferência completa, cache Git persistente/expiração, comparação local/staged sem filtros, restauração com backup de segurança, recuperação de banco corrompido e reassociação. Também foi testada a geometria com 85.224 nós, sem medir o Canvas ou afirmar FPS. Corrigidas revalidações de rascunhos na restauração e da localização antiga na reassociação após seus diálogos. Os comandos usam as mesmas rotinas internas exercitadas nos testes.

O usuário salvou a autorização documentada no config.toml, com o identificador completo informado pelo controle de computador. A configuração foi conferida, mas a sessão continuou retornando a recusa. O próximo diagnóstico requer reiniciar o Codex e retomar a tentativa suportada. Não houve contorno da recusa ou liberação de outros aplicativos. O [relatório atualizado](validation/2026-10-27/RELATORIO_F0_F5.md) separa integrações automatizadas aprovadas, medidas geométricas e aceite visual pendente; a próxima implementação permanece condicionada à validação.

## Validação nativa — 28/10/2026

O acesso funcionou após o reinício. Foram observados na janela isolada: seleção/análise, árvore, código, grafo local, notas/tags com persistência, histórico e agregados Git, métricas/ciclos F4, busca, evidências F5, prévia de imagem, idioma persistente, criação/restauração de backup e cancelamento durante leitura de um repositório grande. Corrigidos e retestados aviso de rascunho obsoleto e seleção de texto durante arraste de imagem. ESLint, build da interface e cinco testes JavaScript passaram.

O [relatório visual](validation/2026-10-28/VALIDACAO_VISUAL.md) distingue resultados observados de pendências: notas após restauração, recuperação/reassociação/paginação na interface e renderização do grafo grande. O ensaio não aprova FPS ou memória do grafo completo.

## Quinta entrega F5 — atributos Rust, 29/10/2026

O usuário autorizou avançar à próxima parte. Implementados atributos `#[path]` literais externos/inline no índice Cargo, com caminhos confinados ao inventário, árvores lógicas preservadas, ambiguidades/recursão bloqueadas e condições não interpretadas diagnosticadas. Cache syntax-v5. Nenhuma dependência nova ou migração de banco.

Passaram 47 testes Rust e cinco JavaScript, formatação Rust e ESLint completo. Os sete testes novos incluem comparação de 16 arestas esperadas em corpus compilado por rustc, casos inválidos/ambíguos e invalidação incremental. Resultados do build, logs, reprodução e limitações estão no [relatório desta entrega](validation/2026-10-29/RELATORIO_F5_PATH.md). As pendências visuais foram preservadas; F5 permanece parcial e F6 não foi iniciada.
