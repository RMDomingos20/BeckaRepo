# F5 — Piloto de parsing sintático

## Entrega de 26/10/2026

Tree-sitter roda no núcleo Rust, tanto no desktop quanto na CLI. Versões fixadas no Cargo.lock: runtime 0.25.10, JavaScript 0.25.0, TypeScript/TSX 0.23.2 e Rust 0.24.2. As gramáticas são compiladas no executável; o aplicativo distribuído não baixa gramáticas.

- JavaScript/JSX (`js`, `jsx`, `mjs`, `cjs`) e TypeScript/TSX (`ts`, `tsx`, `mts`, `cts`): import estático, reexport com origem e chamadas `require`/`import` com argumento literal.
- Rust: declaração externa `mod nome;`, `use` local com `crate`, `self`, `super`, listas agrupadas e aliases. Resolução de caminhos de arquivos, sem comprovação da existência dos símbolos importados.
- Comentários, strings e árvores de tokens de macros não são tratados como código de dependências. Expressões dinâmicas e módulos não resolvidos produzem diagnósticos.
- YAML/RSI e outras linguagens conservam o extrator anterior, identificado como `regex`.

## Contrato e interface

`syntax.rs` recebe linguagem/conteúdo limitado e emite fatos com módulo, tipo e evidência. `parser::Index` resolve esses fatos no inventário. Não há dependência de D3 no parser.

Cada nó ganha `parsing`: mecanismo, versão, diagnósticos, quantidade omitida, configuração local e contador de importações Rust internas ao arquivo. `targets` registra até 16 contextos Cargo (manifest, nome, tipo, entrada e módulo lógico), limitado também a 32 KiB de strings; `targetsOmitted` conta os demais. Cada aresta ganha `evidence` opcional: mecanismo, intervalo UTF-8 `[startByte,endByte)`, linha iniciando em 1, regra de resolução e até 16 bindings com nome, alias, tipo e intervalo. Nomes/aliases são limitados a 120 caracteres. As descrições textuais antigas continuam disponíveis. Não é um índice completo de símbolos. Arestas repetidas por origem/destino/tipo preservam a primeira evidência na ordem do arquivo.

Os campos são aditivos: JSON de análise continua v1 e snapshot desktop v2. Campos ausentes são aceitos ao desserializar resultados antigos. Em **Visão geral → Parsing e evidências**, o usuário consulta configuração, regra, bindings, diagnósticos e páginas de 20 relações. Autoimportações JS/TS são preservadas; importações Rust resolvidas dentro do mesmo arquivo são contadas separadamente e não criam ciclos entre arquivos. F4 inclui `import`, `require` e `re-export` na projeção estrutural. As heurísticas antigas ainda podem omitir autoarestas.

## Resolução e limites conhecidos

- JS/TS: caminhos relativos, aliases `paths` e `baseUrl` de configurações locais, com extensões conhecidas ou `index.*`. Em consumidores TS, tenta substituições `.js` → `.ts`/`.tsx`/`.d.ts`, `.jsx` → `.tsx`/`.ts`, `.mjs` → `.mts`/`.d.mts` e `.cjs` → `.cts`/`.d.cts` antes do caminho original. Ainda não implementa todos os modos de moduleResolution, include/exclude, references, workspaces, exports/imports de package.json ou pacotes externos.
- Rust: com Cargo, acompanha declarações `mod` a partir das entradas dos targets, incluindo raízes personalizadas fora de `src`, módulos inline e atributos `#[path]` literais. Mantém os contextos de arquivos compartilhados; destinos divergentes ficam não resolvidos. Sem Cargo, conserva a heurística física sob `src` somente quando o arquivo não exige resolução de caminhos/condições. Pode subir do símbolo até um módulo declarado, sem comprovar sua exportação. Dois arquivos possíveis para o mesmo módulo são tratados como não resolvidos. Módulos dentro de blocos continuam diagnosticados e não indexados. Dependências Cargo locais têm resolução separada, descrita abaixo. Não interpreta `cfg`, macros, reexports encadeados ou toda a semântica da linguagem.
- `require` é reconhecido pela sintaxe, sem resolver sombreamento lexical do identificador. Literais com escapes, expressões de módulo dinâmicas e formas especiais de importação TS não são resolvidos. Arquivos Vue/Svelte seguem no fallback regex, sem parser de linguagem embutida.
- O parser não substitui o compilador da linguagem e não executa código do projeto.

## Orçamentos e recuperação

Mantém o limite de texto abaixo de 500 KiB por arquivo. O callback cooperativo de Tree-sitter pede interrupção após 250 ms; a caminhada dos fatos observa 500 ms e 2.048 fatos por arquivo. Esses tempos não são garantias rígidas de latência do sistema. Até 32 diagnósticos por arquivo; o restante é contado como omitido. Módulos têm até 512 bytes. Relações e diagnósticos entram no orçamento agregado de 128 MiB de metadados do parser.

Falha ao carregar gramática ou interrupção do parsing usa `regex-fallback`, com diagnóstico. Erro de sintaxe conserva os fatos recuperados da árvore e indica cobertura parcial, sem declarar que o arquivo não tem dependências. Cancelamento do scan é observado entre arquivos; o callback de tempo limita a espera dentro do parsing. Não há promessa de interromper uma thread bloqueada por timeout de future.

O cache incremental guarda fatos resolvidos, resumos de declarações de módulos e diagnósticos, sem fontes ou árvores sintáticas. A versão `syntax-v5/ts-0.25.10/js-0.25.0/ts-0.23.2/rs-0.24.2` participa da validade do cache; mudanças no índice/revisão ou nas configurações carregadas, incluindo bases herdadas e manifests Cargo, também invalidam a reutilização. Revisões dos fontes Rust invalidam o índice compartilhado de módulos. Não há cache AST persistente em SQLite.

## Configurações locais — entrega concluída em 27/10/2026

O scanner procura `tsconfig.json` e `jsconfig.json` no inventário permitido. Carrega somente esses arquivos e as bases declaradas por `extends` relativo, inclusive bases com outros nomes terminados em `.json`. A leitura passa pelos mesmos limites, confinamento e conferência de revisão dos demais textos. Nada é lido fora da pasta aberta; configurações em pacotes/node_modules não são buscadas.

O leitor aceita JSONC com comentários, vírgula final e BOM. `extends` aceita uma base ou uma lista ordenada, com substituição das opções pelas bases posteriores e depois pelo arquivo local. Bases têm seus caminhos relativos vinculados ao diretório de origem; caminhos `paths` usam `baseUrl` quando configurado, ou o diretório onde foram declarados. Configuração por pasta mais próxima, preferindo tsconfig sobre jsconfig no mesmo diretório, é uma aproximação explícita de associação de projeto.

`paths` aceita nomes exatos e um curinga `*`, com candidatos em ordem. Padrão exato tem prioridade; em seguida vale o maior prefixo anterior ao curinga. Empates de padrões são diagnosticados, sem escolher silenciosamente uma alternativa. Configuração inválida, herança circular, base ausente ou references não suportadas bloqueiam a resolução por configuração e geram diagnósticos; imports relativos continuam disponíveis.

Orçamentos: 256 configurações e 8 MiB de entrada no conjunto; 8 bases por arquivo, 16 níveis e 512 visitas por configuração efetiva; 128 padrões e 8 candidatos por padrão; caminhos declarados até 512 bytes. Mapas herdados compartilham metadados em memória. A resolução não executa scripts nem usa a rede. No Rust inline, até 32 níveis, 1.024 bytes de escopo e 2.048 módulos por arquivo. Diagnósticos têm até 1.024 caracteres cada.

## Cargo local — terceira entrega de F5 em 27/10/2026

`cargo_resolution.rs` lê `Cargo.toml` disponíveis no inventário usando TOML 0.8.2, já presente no lockfile. Não executa Cargo, build scripts ou código do repositório analisado. O scanner aplica sua política de leitura, confinamento e revisões aos manifests; arquivos fora da pasta aberta ou em diretórios ignorados continuam indisponíveis. A associação entre arquivo Rust e manifest usa a pasta mais próxima, sem reconstruir a árvore de todos os targets.

- `[dependencies]` com `path` aponta para o manifest exato da dependência. O nome do pacote deve coincidir com a declaração. A biblioteca usa `[lib].path` ou `src/lib.rs`, respeitando `autolib = false`; o destino precisa existir no inventário.
- Imports usam o alias declarado com `package`, ou o nome da biblioteca (`[lib].name` quando presente), normalizando hífens em underscores. Arestas continuam do tipo `import`, com o manifest de origem, a declaração herdada quando houver e o manifest de destino na evidência. A ligação indica a entrada da biblioteca, sem validar a existência, visibilidade ou reexportação do símbolo importado.
- `workspace = true` em dependências e `edition.workspace = true` são interpretados para membros explícitos. A raiz vem de `package.workspace` ou do primeiro workspace ancestral. Suporta membros/exclusões com caminhos exatos e curinga terminal `/*`; membros implícitos por dependência path e outros globs ainda não são inferidos. Caminhos herdados são relativos à raiz do workspace.
- A resolução de dependências requer edição conhecida 2018, 2021 ou 2024. Edição 2015, `extern crate`, dependências opcionais, dev/build/target e overrides patch/replace ficam fora da cobertura. Não há avaliação de features, versões, lockfile, configuração `.cargo`, downloads ou pacotes de registry/Git. A entrada de build script padrão ou declarada não recebe ligações de dependências normais.
- Nomes em conflito com módulos declarados na raiz do arquivo e aliases Cargo duplicados não são resolvidos. Em módulos inline, imports de dependências precisam de caminho absoluto `::nome`; formas não qualificadas recebem diagnóstico. Sombreamento por outros bindings, helpers de build scripts e a associação exata de fontes a targets ainda exigem o índice global de módulos/símbolos.

Orçamentos específicos: 256 manifests, 8 MiB de entrada agregada, 256 entradas por tabela de dependências ou lista de membros/exclusões e 512 bytes por string interpretada. Metadados de dependências resolvidas têm limite agregado de 32 MiB. Estouro encerra a análise com erro explícito. Os limites JS/TS são independentes. Revisão de qualquer manifest carregado invalida as relações em cache. O painel de evidências apresenta orientação específica para Cargo em português e inglês.

## Targets e raízes de módulos — quarta entrega de F5 em 27/10/2026

O índice `rust_modules.rs` liga os fontes às entradas de targets Cargo pelas declarações `mod`, com os nomes lógicos separados dos caminhos físicos. Essa associação substitui a dedução por pasta para a resolução Rust quando há Cargo. A configuração por diretório continua visível como contexto; os targets listados no painel são os proprietários usados na resolução, inclusive para entradas declaradas fora da pasta do manifest mas dentro do inventário aberto.

- Entradas: biblioteca, `src/main.rs`, executáveis de `src/bin`, exemplos, testes de integração, benches e build script. Arrays `[[bin]]`, `[[example]]`, `[[test]]` e `[[bench]]` aceitam nome/path; caminhos omitidos dependem de candidato único no layout convencional. Flags `auto*` controlam descoberta. Raízes declaradas substituem a descoberta do mesmo nome/caminho. Targets ausentes ou ambíguos não recebem associação inventada; fontes sem target apresentam diagnóstico.
- `src/bin` passa pela política do scanner e dos agregados Git; outros diretórios `bin` continuam ignorados. Os demais limites e bloqueios de arquivos permanecem em vigor.
- `mod`, `crate`, `self` e `super` seguem a árvore de cada target. A entrada personalizada é tratada como raiz, independentemente de seu nome de arquivo. Módulos externos podem usar `nome.rs` ou `nome/mod.rs`. Nomes duplicados ou ambas as alternativas geram associação ambígua. Módulos inline de outros arquivos agora participam do índice.
- Fontes compartilhados guardam múltiplos contextos. Uma ligação só é emitida quando todos os contextos resolvem para o mesmo arquivo. Declarações ausentes/ambíguas e `super` acima da raiz não são convertidos em uma escolha arbitrária. A busca pode terminar no módulo que contém um possível símbolo, inclusive na raiz; isso não comprova que o símbolo exista.
- Dependências entre pacotes usam os manifests dos targets proprietários. Targets executáveis, exemplos, testes e benches podem apontar para a biblioteca do próprio pacote pelo nome da crate. Fontes alcançados por build scripts não recebem as dependências normais do pacote. Dependências dev/build/por plataforma continuam pendentes.
- Nesta quarta entrega, `cfg`, ativação de `required-features`, macros, `#[path]`, edições sobrescritas por target, módulos dentro de blocos e resolução completa de bindings/reexports ficaram fora da cobertura; `#[path]` avançou na quinta entrega abaixo. A árvore descreve declarações encontradas, sem afirmar quais targets/módulos estão ativos numa compilação. Overrides de edição por target invalidam a configuração com diagnóstico.

O scanner faz uma passagem adicional de parsing dos fontes Rust quando o índice precisa ser reconstruído, retendo somente resumos compactos de módulos. Depois resolve as relações durante a passagem habitual. Mudanças em qualquer fonte Rust textual invalidam o índice e as relações dependentes; isso privilegia consistência e pode aumentar o custo de uma atualização. A otimização por resumo de arquivo alterado e as medições de desempenho ficam pendentes.

Limites adicionais: 128 targets declarados por tipo/manifest; 4.096 targets no inventário; 32 MiB contabilizados para declarações; 100 mil entradas e 32 MiB contabilizados para associações de módulos. Cada contexto de arquivo aceita até 64 segmentos de módulo, incluindo ancestrais inline; os escopos inline do próprio arquivo seguem o limite sintático anterior. São orçamentos de metadados, não medição exata da memória do processo. Cancelamento permanece observado entre leituras; parsing mantém os limites cooperativos anteriores. Não se armazenam fontes ou ASTs no cache.

## Atributos de caminho — quinta entrega de F5 em 29/10/2026

O índice de módulos interpreta `#[path = "arquivo.rs"]` em declarações externas e `#[path = "diretorio"]` em módulos inline. Aceita literais simples sem escapes e literais raw, incluindo espaços e Unicode. Comentários entre atributos e declarações, ou dentro do atributo, não mudam sua associação.

- Caminhos externos são exatos: não há tentativa de acrescentar `.rs` ou `mod.rs` ao destino explícito. O arquivo deve ser Rust e pertencer ao inventário permitido. `..` pode navegar dentro desse inventário; escape da raiz, caminhos absolutos, unidades Windows e barras invertidas são recusados.
- A base considera o arquivo que contém a declaração, módulos inline e seus redirecionamentos. Arquivos carregados por `#[path]` usam seu diretório para módulos filhos. `crate`, `self` e `super` continuam seguindo os nomes lógicos, mesmo quando a localização física muda.
- A evidência de uma declaração externa mostra seu atributo explícito e a restrição ao inventário. Fontes compartilhados continuam exigindo consenso entre todos os contextos Cargo. Atributos duplicados, módulos duplicados, destinos ausentes e ciclos de inclusão não produzem uma associação arbitrária.
- `cfg_attr` em módulos não é avaliado: a subárvore fica bloqueada com diagnóstico. Atributos internos `#![path]`/`#![cfg_attr]` conservadoramente bloqueiam a resolução Rust do arquivo. Literais com escapes, valores calculados e destinos sem extensão `.rs` continuam fora da cobertura. `cfg` não determina quais declarações estão ativas.
- Sem target Cargo suportado, arquivos com caminhos explícitos ou declarações bloqueadas não usam o fallback por diretório para suas relações Rust. Essa restrição evita inventar a localização padrão de um módulo redirecionado.

Não há leitura adicional fora do scanner, execução de código analisado, dependência nova nem migração de banco. Os resumos compactos incluem caminho e estado de resolução nos orçamentos existentes. O cache passa a `syntax-v5`; alteração do atributo reconstrói o índice e invalida relações dependentes.

Sete testes de integração específicos cobrem essas regras. Um corpus de 16 ligações esperadas também é compilado por `rustc --emit=metadata`, sem executar seu código, para conferir as regras de diretório. Resultados da rodada completa estão no [relatório desta entrega](validation/2026-10-29/RELATORIO_F5_PATH.md).

## Continuação e aceite

F5 segue em desenvolvimento. Permanecem: ampliar o corpus por construção/linguagem, precisão/recall em projetos reais, associação completa de projetos/references e targets/workspaces Cargo, condições/atributos ainda não suportados, índice global de símbolos/reexports, medição de memória/latência e conclusão do aceite interativo. Bindings estruturados, módulos inline, dependências Cargo locais limitadas e atributos `#[path]` literais já estão disponíveis. Os testes sintéticos e a compilação do corpus não comprovam equivalência completa ao compilador. F6 (entidades de pacotes externos e lockfiles) foi implementada em 29–30/10 na cobertura documentada.

## Referências

Continuação em 30/10: [F6 — dependências externas](ETAPA_F6.md) foi implementada e o [piloto F7](ETAPA_F7.md) foi iniciado por solicitação do usuário. As pendências específicas de F5 permanecem registradas acima.

- [API do parser Tree-sitter](https://docs.rs/tree-sitter/0.25.10/tree_sitter/struct.Parser.html).
- [Gramática JavaScript](https://docs.rs/tree-sitter-javascript/0.25.0/tree_sitter_javascript/).
- [Gramática TypeScript/TSX](https://docs.rs/tree-sitter-typescript/0.23.2/tree_sitter_typescript/).
- [Gramática Rust](https://docs.rs/tree-sitter-rust/0.24.2/tree_sitter_rust/).
- [TypeScript: configuração, paths, baseUrl e extends](https://www.typescriptlang.org/tsconfig/).
- [TypeScript: referência de resolução de módulos](https://www.typescriptlang.org/docs/handbook/modules/reference).
- [Rust: módulos e caminhos](https://doc.rust-lang.org/reference/items/modules.html).
- [Cargo: dependências por caminho, renomeadas e herdadas](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html).
- [Cargo: workspaces e membros](https://doc.rust-lang.org/cargo/reference/workspaces.html).
- [Cargo: biblioteca e demais targets](https://doc.rust-lang.org/cargo/reference/cargo-targets.html).
