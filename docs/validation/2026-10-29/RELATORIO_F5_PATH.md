# F5 — resolução Rust de atributos de caminho

Data: 29/10/2026. Continuação autorizada pelo pedido de avançar à próxima parte. A entrega executa a próxima fatia registrada no roadmap: atributos `#[path]`. F6 ainda não foi iniciada.

## Resultado funcional

Declarações como `#[path = "../shared/worker.rs"] mod worker;` agora apontam para o arquivo explícito, desde que ele pertença ao inventário permitido. O índice também acompanha redirecionamentos de módulos inline e o diretório dos módulos filhos. Imports com `crate`, `self` e `super` usam a árvore lógica do target, independentemente do nome físico do arquivo.

O painel existente de evidências recebe o caminho explícito na regra de resolução. O cache usa `syntax-v5`: mudar o atributo reconstrói o índice e elimina ligações obsoletas. Não houve alteração do contrato JSON/SQLite nem inclusão de dependências.

Arquivos alterados nesta entrega: `syntax.rs`, `rust_modules.rs`, `parser.rs` e o novo corpus `tests/path_attributes.rs`, dentro de `crates/beckarepo-core`, além da documentação. As correções visuais de rascunhos e arraste de imagens da rodada anterior foram preservadas.

## Como foi validado

Os testes usam entradas sintéticas com destinos esperados explicitamente e diretórios temporários exclusivos. O teste incremental percorre o scanner real, altera um atributo e analisa novamente. O corpus de diretórios é compilado por `rustc --edition=2021 --crate-type=lib --emit=metadata`; não executa o programa nem scripts de terceiros. Compilar esse corpus confirma que o layout de módulos é aceito pelo compilador; as asserções do analisador conferem o conjunto exato de 16 ligações.

| Teste novo | Verificação |
| --- | --- |
| Diretórios e rustc | Raiz, arquivo comum, mod.rs, módulos inline/redirecionados, filhos de arquivo carregado por path, raw strings, Unicode, espaços, comentários e identificador raw. Um arquivo alternativo com valor diferente detecta escolha incorreta do diretório filho. |
| Caminhos inválidos | Escape da raiz, absoluto, unidade Windows, destino ausente, atributo duplicado, cfg_attr, valor calculado, literal vazio/com escapes e inclusão recursiva não geram arestas falsas. |
| Contextos compartilhados | O mesmo fonte pertence a dois targets; resolução divergente de um import é diagnosticada, sem escolher um destino. |
| Ambiguidade inline | Módulos duplicados, condição não avaliada e atributos internos não deixam descendentes contornar o bloqueio. |
| Sem Cargo | Uma declaração path não recebe o arquivo convencional como fallback. |
| Cache incremental | Scan sem alteração reutiliza resultados; troca de a.rs para b.rs remove o destino antigo e invalida relações dependentes. |
| Raiz personalizada | Entrada fora de src, módulo físico redirecionado e imports crate/super mantêm os seis destinos esperados. |

A rodada completa passou: **47 testes Rust** (21 host, 15 fases/pipeline, 7 path, 2 contrato, 2 CLI) e **5 testes JavaScript**, sem falhas ou testes ignorados. Os testes de host voltaram a usar bancos SQLite e repositórios Git isolados. O banco de produção não foi restaurado nem migrado nesta entrega.

Medições auxiliares desta execução: o ensaio F0/F1 processou 44.003.000 bytes de fontes e gerou snapshot de 397.865 bytes; scan inicial 5.737 ms e incremental 1.732 ms. O ensaio geométrico isolado contabilizou 85.224 nós, 154 marcas gerais e 42 nós na região ampliada, em 112 ms, com pico do processo Node de 96.748 KiB. Essas medidas não representam FPS, renderização Canvas ou memória do aplicativo desktop.

## Compilação e entrega

`tests/run-validation.ps1 -Build` terminou com código 0. A sequência incluiu `cargo fmt --all -- --check`, todos os testes, ESLint completo e `npm run build`. O build produziu a interface, o executável Rust e o instalador NSIS x64, versão 1.1.0. Rust release: 1 min 38 s; instalador: aproximadamente 4,21 MiB. O instalador foi gerado, não instalado.

- Executável: `target/release/beckarepo.exe`.
- Instalador: `target/release/bundle/nsis/BeckaRepo_1.1.0_x64-setup.exe`.
- `beckarepo.exe` (19622400 bytes), SHA-256 `3DCE2ED287C086B8FCD9CAE757A8A3ED6D037DE45741D6AB3EBB0912ADE142D7`.
- `BeckaRepo_1.1.0_x64-setup.exe` (4411308 bytes), SHA-256 `5ED35D2DA85E93D4F552090E61E100ACE506ADD6BAAD8623C4A299750596F624`.

O aviso preexistente do identificador `com.beckarepo.app` para macOS não impediu o build Windows. `git diff --check`, considerando CRLF, passou nos arquivos rastreados. Arquivos novos de Rust foram incluídos na verificação de formatação do workspace.

## Limites e pendências

- Apenas destinos `.rs` existentes no inventário; caminhos portáveis relativos com `/`. Nenhum caminho fora da pasta autorizada é aberto pelo resolvedor.
- Literais com escapes, valores calculados, atributos internos e `cfg_attr` ainda não são interpretados. Atributos internos bloqueiam conservadoramente a resolução do arquivo. Sem target Cargo suportado, a presença de caminho/declaração bloqueada desabilita o fallback Rust daquele arquivo.
- A resolução associa arquivos e módulos. Não comprova existência/visibilidade de símbolos, não expande macros e não avalia `cfg` ou features.
- O corpus é sintético e limitado. Não comprova precisão/recall em todos os repositórios, nem equivalência integral à resolução do compilador.
- Não foi realizada nova interação na janela para estes atributos. O [relatório visual de 28/10](../2026-10-28/VALIDACAO_VISUAL.md) registra os fluxos aprovados e o que falta: conferência das notas após restauração, recuperação/reassociação/paginação pela interface e grafo grande com medições de renderização.

## Reprodução

Na raiz do projeto, com Rust e Node instalados:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-validation.ps1 -Build -OutputDirectory target/validation/recheck
```

Somente o novo corpus:

```powershell
cargo test -p beckarepo-core --offline --test path_attributes -- --nocapture
```

A suíte depende das ferramentas já usadas pelo projeto: Cargo/rustc, Git e Node. Não requer fork remoto. No teste de confinamento Windows, criação de symlink de arquivo não estava disponível; o teste verificou escape por junction de diretório, conforme registrado no log. O teste imprime o diretório temporário do corpus para inspeção.

Semântica consultada: [Rust Reference — path attribute](https://doc.rust-lang.org/reference/items/modules.html#the-path-attribute). Cobertura atual e limites completos: [ETAPA_F5.md](../../ETAPA_F5.md).
