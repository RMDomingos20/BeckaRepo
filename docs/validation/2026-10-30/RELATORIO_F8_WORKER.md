# F8 — física do Canvas em Worker — 30/10/2026

Entrega seguinte ao [piloto F7](RELATORIO_F6_F7.md), autorizada pelo usuário. O Canvas calcula forças em Worker de módulo, mantendo desenho e interação na interface. Abrange grafos global/de busca acima de 800 nós e Canvas de coalteração. Sem alteração de banco, dependência nova ou download de repositório externo.

## Implementação

- `src/workers/denseLayoutRuntime.js`: mesmas forças/limiares do Canvas anterior, simulação agendada e buffers transferíveis. Apenas um lote sem confirmação; envio aproximadamente a cada 80 ms ou ao estabilizar.
- `src/utils/denseLayoutClient.js`: topologia/posições numéricas sem fontes/caminhos, revisão de arrastes, descarte de respostas antigas, encerramento ao trocar grafo e fallback para posições estáticas em falha. Watchdog de 30 segundos sem progresso.
- `DenseGraphCanvas.jsx`: integra Worker, preserva seleção/câmera e posições no escopo anterior, fixa/libera nós e mostra medição de cálculo/aplicação/desenho.
- O Worker não recebe estado React, câmera, nomes de arquivos ou conteúdo do repositório. A interface ainda arca com montagem da topologia, aplicação das posições, índice espacial, recorte e desenho.

## Verificações

| Verificação | Resultado |
| --- | --- |
| JavaScript | **12 testes passaram**, sem falhas: 7 existentes e 5 novos. |
| Worker real | Transferência de ownership de buffers, limite de um lote sem ack, 1.000 nós com pin/unpin e estabilização; 85.224 nós com isolados; topologia inválida recusada. |
| Cliente do renderer | Respostas anteriores ao arraste/liberação ou posteriores à desmontagem ignoradas; coordenadas não finitas e falha de inicialização preservam layout estático. |
| Rust | **63 testes passaram na rodada F6/F7**, imediatamente anterior. Nenhum fonte Rust alterado em F8; não repetidos por alteração exclusivamente da interface. |
| Formatação | `cargo fmt --all -- --check` passou novamente. |
| ESLint | Sem erros. |
| Build Windows | `npm run build` concluiu: bundle do Worker 50,48 kB, executável Rust release e NSIS x64 1.1.0 de 4,31 MiB. Instalador não executado. |

- `beckarepo.exe` (19949568 bytes), SHA-256 `C74AD93A4F4174CB85B537BBCBE233783C5A5B28BFB10537E77D4299BB7A0834`.
- `BeckaRepo_1.1.0_x64-setup.exe` (4515570 bytes), SHA-256 `00AEE18E07E1B40FBEC1A4778765C743DE2A213AC59B749711EB0D49F6A044A6`.

## Ensaio sintético comparativo

Executado `node tests/benchmark-dense-layout.mjs`. Ryzen 5 2600, 16 GiB, Node v22.22.2. Uma execução por cenário/modo, algoritmo e agendamento idênticos, sem desenho de Canvas. As datas UTC nos logs correspondem à noite de 30/10 no fuso America/Sao_Paulo.

| Nós / conexões | Tempo total principal / Worker | Cálculo principal / Worker | Maior intervalo do temporizador principal / Worker |
| --- | --- | --- | --- |
| 1.000 / 1.500 | 4.724 / 5.788 ms | 852 / 868 ms | 44 / 32 ms |
| 10.000 / 15.000 | 20.867 / 21.208 ms | 17.155 / 16.713 ms | 309 / 32 ms |
| 85.224 / 91.745 | 2.452 / 3.853 ms | 819 / 1.159 ms | 101 / 32 ms |

O modo acima de 15 mil nós usa forças simplificadas, por isso o cenário maior pode terminar antes do de 10 mil. Worker aumenta custo de inicialização/transporte e não promete terminar antes. O ensaio indica redução de bloqueio do event loop pelo cálculo; não comprova FPS, p95, memória, latência total ou legibilidade no repositório real.

## Validação visual nativa

Janela **BeckaRepo Validation**, identidade `com.beckarepo.validation`, iniciada com `npm run tauri -- dev --config tests/validation.tauri.json --no-watch`. Pasta sintética isolada `target/validation/f8-ui-repo`, com 1.001 fontes JS, cada um importando o seguinte em um anel; resultado: **1.001 arquivos e 1.001 conexões**.

Observado pela skill Computer Use na janela Tauri:

- Abertura e renderização do grafo global, sem tela de erro.
- Worker estabilizado em 151 iterações; cálculo acumulado 988 ms e 516 KiB recebidos nessa execução. Uma captura mostrou desenho de 1,6 ms e aplicação de 0,1 ms; são amostras, não percentis.
- Seleção de file0.js pela árvore: somente suas duas conexões destacadas, com file1.js e file1000.js, coerentes com o painel de importação/consumo.
- **Localizar selecionado**: câmera de 62,2% para 200%, seleção e conexões preservadas.
- Arraste do nó selecionado: posição alterada imediatamente, seleção preservada e simulação retomada em segundo plano. Duplo clique liberou o nó, que voltou a se movimentar sob as forças.
- Desativação/restauração de import: conexões passaram de duas para zero e retornaram; seleção de file0.js e zoom de 200% preservados durante a reinicialização do Worker.

Capturas foram inspecionadas na conversa; não foram exportadas como PNG. Banco de produção não utilizado e nenhuma restauração executada nesta entrega.

## Limites e próxima entrega

VIS-01 permanece parcial. Faltam benchmark real na WebView (p50/p95 de frames, pico de RAM Rust/WebView, frio/quente), aceite do repositório de 85 mil arquivos, instalação em máquina limpa e todos os cenários de teclado, perda de foco, troca de idioma e reinício. SVG pequeno e grafo local ainda calculam forças na thread principal.

Próxima entrega de F8: LOD hierárquico por pastas e arestas agregadas, com seleção/câmera preservadas e medições na WebView. Resolução global de símbolos F7 e pendências de aceite das fases anteriores continuam registradas no roadmap. Esta entrega não declara F8 concluída.

## Reprodução

```powershell
node --test tests/ui-utils.test.mjs tests/dense-layout.test.mjs
node tests/benchmark-dense-layout.mjs
npm run lint
npm run build
```

`tests/run-validation.ps1 -Build` inclui agora os cinco testes do Worker, além das suítes anteriores.
