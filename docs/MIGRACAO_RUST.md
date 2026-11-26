# Migração para Rust

> Evolução em 26/10/2026: [F1](ETAPA_F1.md) agora inclui transporte em lotes e atualização incremental; [F2](ETAPA_F2.md) implementa SQLite, tags/notas e backups. Pendências abaixo refletem também o histórico da migração e devem ser lidas junto ao [roadmap atual](ROADMAP.md).


## Estado atual

F1 implementada: scanner por arquivo, snapshot v2 sem texto, prévia sob demanda e busca Rust paginada. Veja [ETAPA_F1.md](ETAPA_F1.md) para limites, compatibilidade e pendências.

O aplicativo desktop usa **Tauri 2 e Rust**. Electron, preload, Web Worker e o motor de análise JavaScript foram removidos. Não existe fallback de análise em JavaScript.

```text
React/D3 → analysisClient → comandos Tauri → beckarepo-core
                                           ├─ varredura de diretórios
                                           ├─ leitura e índice de referências
                                           └─ parser, relações e estatísticas
```

A interface continua em React/D3: árvore, gráficos SVG/Canvas, clustering visual, pesquisa no conteúdo já carregado e preferências. O executável, os diálogos de pasta/salvamento, a sessão de arquivos e o motor de análise são Rust. Não é uma reescrita da interface em uma biblioteca gráfica Rust.

## Organização

| Caminho | Responsabilidade |
| --- | --- |
| `crates/beckarepo-core/src/lib.rs` | Contrato JSON v1 e validação de caminhos/arestas. |
| `crates/beckarepo-core/src/parser.rs` | Índices e extração heurística de imports e referências. |
| `crates/beckarepo-core/src/analysis.rs` | Grafo, relações estruturais, deduplicação e estatísticas. |
| `crates/beckarepo-core/src/repository.rs` | Varredura, exclusões, leitura limitada, progresso e confinamento de caminhos. |
| `crates/beckarepo-core/src/bin/beckarepo-cli.rs` | Análise em terminal, sem React ou Node. |
| `src-tauri/src/main.rs` | Host desktop, comandos IPC, diálogo nativo, cancelamento, mídia e exportação. |
| `src-tauri/tauri.conf.json` | Janela, CSP, build e instalador NSIS. |
| `src/services/analysisClient.js` | Transporte IPC e adaptação dos dados para a interface. |

## Contrato e acesso a arquivos

- Caminhos de nós são relativos à raiz, com `/`, e IDs correspondem ao caminho.
- Arestas mantêm origem, destino, tipo, detalhe e direção. O ID serializa a tupla `(origem, destino, tipo)`.
- A seleção de pasta e o arraste nativo autorizam uma raiz. O renderer não fornece uma raiz arbitrária para leitura.
- Prévia de mídia exige o identificador da sessão e um caminho indexado; o destino canônico deve continuar dentro da raiz.
- Symlinks não são percorridos. Diretórios gerados, caches e dependências conhecidos são excluídos.
- Limites: 100.000 arquivos aceitos, conteúdo de texto menor que 500 KiB por arquivo, leitura por arquivo no scanner (256 MiB agregados apenas no pedido JSON v1) e mídia até 128 MiB por prévia. Os limites não representam garantia de consumo total de RAM: índices, grafo, serialização e interface também usam memória.
- Progresso é enviado nas etapas de varredura, leitura e análise. Cancelamento é cooperativo entre lotes/arquivos.
- Arquivos não legíveis geram avisos. Texto excedente ao limite por arquivo fica sem conteúdo; seu nó continua visível.
- Tags usam agora a raiz canônica como chave de repositório. Preferências/metadados do armazenamento do antigo Electron não são importados automaticamente.

## Regras de análise

Imports e referências em JS/TS, HTML, CSS, Python, Go, C/C++, C#/Java/PHP/Kotlin/Dart/Scala e Rust; protótipos YAML, sprites RSI e estados PNG; relações entre arquivos do mesmo módulo, Docker/Compose e CI/build.

As regras são heurísticas, não ASTs nem resolução de compilador. Aliases personalizados, macros, imports complexos, reexports e módulos condicionais podem não ser resolvidos. Comentários e referências ambíguas podem produzir falsos positivos. Rust tem resolução de formas comuns de `mod`, `crate`, `self` e `super`, sem semântica completa de Cargo.

## Execução

Na raiz do projeto:

```powershell
npm install
npm run dev
```

`npm run dev` inicia Vite e o executável Rust via Tauri. `npm run dev:vite` abre somente a interface; o navegador avisa que a análise requer o aplicativo desktop.

```powershell
npm run build
```

Gera a interface, o executável `target/release/beckarepo.exe` e o instalador em `target/release/bundle/nsis/`. `npm run build:exe` explicita o mesmo alvo NSIS. O app compilado usa WebView2 e não requer Node ou um servidor Vite para executar.

CLI totalmente Rust:

```powershell
cargo run -p beckarepo-core --bin beckarepo-cli -- "D:\caminho\do\repositorio"
```

Saída snapshot JSON v2 com metadados, grafo, estatísticas e avisos, sem conteúdo bruto. O modo `--json` recebe um `AnalysisRequest` v1 pelo stdin e devolve somente o resultado do grafo.

## Próximos trabalhos

O planejamento vigente está em [ROADMAP.md](ROADMAP.md). A política compartilhada de seleção/limites e exclusão de nomes sensíveis já está em `policy.rs`; veja [POLITICA_DE_ARQUIVOS.md](POLITICA_DE_ARQUIVOS.md).

Paridade automatizada do parser com os corpora legados, benchmarks, índices incrementais/watch, resolução semântica, migração de metadados, edição de tags/notas e distribuição assinada. Os testes de contrato existentes não comprovam paridade completa do novo parser. Fixtures históricas e o corpus multilíngue ficam em `tests/fixtures/` como referências.
