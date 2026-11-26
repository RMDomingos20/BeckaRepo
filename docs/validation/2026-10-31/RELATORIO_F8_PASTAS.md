# F8 — detalhamento por pastas — 31/10/2026

Continuação autorizada pelo usuário após a entrega do Worker. Implementado modo **Detalhamento → Pastas** no Canvas dos grafos global/de busca com mais de 800 arquivos. A expansão é explícita; não depende de limiares automáticos de zoom.

## O que mudou

- Partição visual por caminho de pasta, arquivos da raiz individuais e subpastas reveladas progressivamente. Cada arquivo tem exatamente um representante.
- Arquivo selecionado permanece individual, mesmo dentro de ramo recolhido. Sua contribuição é retirada da contagem da pasta. Resultados da busca são somados por grupo.
- Arestas agregadas por extremos, tipo e direção; coalteração bidirecional é mantida distinta. Relações internas ficam na contagem da pasta. Autorreferências de arquivos não viram relações de pasta.
- Pastas quadradas, arquivos circulares, multiplicidades nas linhas quando há espaço. Lista de pastas com busca, páginas de 20 e recolhimento de ramo/tudo oferece alternativa aos cliques no Canvas.
- Câmera e posições conhecidas mantidas na mesma montagem/snapshot; filhos novos começam perto do ancestral previamente visível. O Worker continua calculando as posições da projeção. Os dados originais e as métricas F4 permanecem separados.

Fontes principais: `src/utils/folderProjection.js`, `src/components/FolderGraphCanvas.jsx`, integração em `CanvasGlobalGraph.jsx` e `DenseGraphCanvas.jsx`. Sem nova dependência ou migração SQLite.

## Testes executados

| Verificação | Resultado |
| --- | --- |
| JavaScript | **17 testes aprovados**, zero falhas: 7 utilitários, 5 Worker, 5 projeção por pastas. |
| Conservação | Direção, tipos, bidirecionalidade, multiplicidade, ciclos internos, autorreferência, nó selecionado e contagem de resultados verificados. |
| Identidade/hierarquia | Caminhos Unicode e nomes especiais, recolhimento exato de descendentes, posições herdadas e pins previamente conhecidos. |
| Escala sintética | 85.224 arquivos e 91.745 relações conservados em dois níveis. Projeções em 597 ms nesta execução Node; não é FPS nem benchmark da WebView. |
| Lint | `npm run lint` sem erros. |
| Build | `npm run build` concluiu Vite, executável Rust release e NSIS 1.1.0 x64 (~4,31 MiB). |
| Rust | Fontes Rust não alterados nesta entrega. Última rodada: 63 aprovados em [30/10](../2026-10-30/RELATORIO_F6_F7.md); não repetidos para esta alteração da interface. |

- `beckarepo.exe` (19951616 bytes), SHA-256 `982EF98F2255A738E81553996C62AF8CC45D73D8E08A3AD00F3AC783A24E8D8D`.
- `BeckaRepo_1.1.0_x64-setup.exe` (4516074 bytes), SHA-256 `175D4F2092C08CDE8A38E012AFA273077CD4D12EFB6DF477591803CFC2AAC8B0`.

Instalador não executado; arquivos de saída substituem os builds anteriores.

## Validação visual

Usada a janela **BeckaRepo Validation**, identidade `com.beckarepo.validation`, com banco de teste. Fixture `target/validation/f8-folder-repo`: 1.001 arquivos e 1.000 imports para root.js; lib=250, src=500 (250 diretos e 250 em src/deep), tests=250, além de root.js.

Observado na janela nativa pela skill Computer Use:

- Análise da fixture e abertura do grafo sem erro após carga limpa.
- Modo Pastas reduzindo a cena a quatro representantes e três relações agregadas, conservando 1.000 conexões.
- Enquadramento mostrando lib=250, src=500 e tests=250, setas para root.js e multiplicidades import ×250/×500/×250.
- Lista de pastas com as mesmas contagens; expansão de src revelou src/deep=250 e os 250 arquivos imediatos, mantendo o zoom em 200%.
- Seleção de src/file0.js pela árvore e recolhimento de src: detalhe do arquivo preservado, pasta passou de 500 para 499 arquivos, sem duplicação. Localizar selecionado recentrou o arquivo individual e sua conexão para root.js com zoom de 200%.

O app que estava aberto durante a atualização de desenvolvimento apresentou `Cannot destructure property 'preferences' of 'useTranslation(...)' as it is undefined`. Recarregar pelo botão **Reiniciar Aplicativo** restabeleceu a tela inicial, e a carga limpa da fixture funcionou. A hipótese é invalidação do contexto durante hot reload; a causa não foi diagnosticada integralmente nem declarada corrigida. O cenário deve ser acompanhado no fluxo de desenvolvimento.

Houve também uma falha de geometria no controle de computador ao clicar no seletor de pasta; a recaptura do diálogo e clique com coordenadas observadas funcionaram. Nenhuma configuração de permissão foi alterada. Capturas foram inspecionadas na conversa, sem PNG exportado.

## Limites e pendências

VIS-02 entregue no escopo explícito descrito. VIS-01/VIS-03 e F8 globalmente continuam parciais. Projeção ocorre na interface a cada mudança relevante, com custo de nós, caminhos e arestas; muitos arquivos na raiz ou muitos irmãos ainda podem produzir uma cena densa. Orçamentos anteriores de linhas/rótulos permanecem, com redução indicada.

Não medidos: FPS p50/p95 e memória no repositório real de 85 mil arquivos, instalação limpa, todos os casos de busca/idioma/teclado e navegação em grafos reais. Contagens e escala sintéticas não substituem esse aceite. Persistência entre visões/snapshots, expansão automática por zoom, física SVG/local fora da interface e comparações GPU/Wasm permanecem pendentes.

## Reprodução

```powershell
node --test tests/ui-utils.test.mjs tests/dense-layout.test.mjs tests/folder-projection.test.mjs
npm run lint
npm run build
```

`tests/run-validation.ps1 -Build` inclui a suíte nova. Abra o app com `npm run dev`, selecione um repositório com mais de 800 arquivos, abra **grafo global → Detalhamento → Pastas** e use **Navegar por pastas** para abrir/recolher ramos.
