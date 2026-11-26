# Validação F6 e piloto F7 — 30/10/2026

F6 implementada para a cobertura de [dependências externas](../../ETAPA_F6.md). Piloto de [símbolos F7](../../ETAPA_F7.md) implementado para JS/TS/Rust. SYM-03 permanece parcial: resolução lexical local não equivale a resolução global de símbolos, tipos ou chamadas entre arquivos.

## Validação automatizada

Executado `tests/run-validation.ps1 -Build -OutputDirectory docs/validation/2026-10-30/f7-logs`, com bancos e repositórios de testes isolados. Nenhum banco de produção foi restaurado ou migrado nesta rodada.

| Verificação | Resultado e evidência |
| --- | --- |
| Rust, workspace offline | **63 aprovados**, zero falhas: 22 host, 2 CLI, 2 contrato, 8 pacotes, 7 caminhos Rust, 15 fases anteriores, 7 símbolos. |
| Utilitários JavaScript | **7 aprovados**, zero falhas. Contrato de pacotes legado/atual, ciclos no impacto indireto, árvore, texto Unicode e geometria com 85.224 nós. |
| Formatação Rust | `cargo fmt --all -- --check` passou na rodada. |
| ESLint final | Sem erros. |
| Build final | Vite, executável Rust release e instalador NSIS 1.1.0 x64 gerados; aproximadamente 4,29 MiB. Não instalado. |

F6 foi validada também em rodada anterior com 55 testes Rust/7 JS. A suíte atual incorpora esses testes. Os registros Cargo em stderr são progresso de compilação, não falhas: o resultado de cada suíte e o código de saída determinam o sucesso.

Os testes F7 verificam decisões reais, funções aninhadas, recursão, shadowing, chamadas dinâmicas sem aresta inventada, Unicode/intervalos UTF-8, identidades vinculadas à revisão, TSX, erros sintáticos, macros/strings/comentários, cancelamento e limites. O host rejeita arquivos ausentes, caminhos externos, revisão alterada e sessão expirada.

## Aceite visual nativo

Usado `npm run tauri -- dev --config tests/validation.tauri.json --no-watch`, janela **BeckaRepo Validation**, identidade `com.beckarepo.validation`. Inspeção pela skill de controle de computador com capturas e árvore de acessibilidade da janela Tauri; não foi um mock no navegador.

Fixture local `target/validation/f6-ui-repo`: package.json, package-lock v3, dois fontes TypeScript e, em 30/10, symbols.rs. As capturas foram inspecionadas na conversa, sem exportação de PNG para este relatório.

| Cenário observado | Resultado |
| --- | --- |
| F6 lista de 28 declarações | Paginação 1/2 e 2/2, 20 itens por página. |
| Alias e versões | `alias → real` em 1.2.0 e `@scope/lib` em 3.0.0 apresentados. |
| Declaração sem import | `unused`, declaração ^2 e lock 2.0.0, zero consumidores; relações declares/resolves-to distintas. |
| F7 extração nativa | 4 símbolos: ação, auxiliar, sem_chamadas e main; 2 chamadas resolvidas. |
| Complexidade | ação=3, auxiliar=2, sem_chamadas=1 e main=1; público/possível entrypoint sinalizados. |
| Fonte Unicode | ação em linhas 2–4, UTF-8 [46,122), trecho legível e evidências disponíveis. |
| Grafo | main → auxiliar → ação; sem_chamadas isolado. Ajustado de quatro para duas colunas para caber no painel de 380 px. |
| Zoom/recolhimento | Zoom observado de 1 para 1,5; recolhimento retorna à lista. Persistência da seleção após recolher não teve aceite visual completo. |

## Limitações do aceite

Não aprovados implicitamente: filtro visual de zero chamadas, paginação visual de 40 símbolos, todos os tipos de linguagem, consumidores indiretos na UI, navegação automática ao detalhe F6 e instalação em máquina limpa. A lógica de impacto indireto está coberta por testes automatizados. O grafo de 85.224 nós foi exercitado em geometria sintética, não como benchmark de FPS do repositório real.

Permanecem as pendências históricas do [aceite F0–F5](../2026-10-28/VALIDACAO_VISUAL.md), incluindo fluxos de recuperação/reassociação e medições de escala. Esta rodada não marca essas pendências como concluídas.

Por solicitação posterior do usuário, o trabalho prosseguiu para uma entrega de F8: física do Canvas em Worker e medição separada de cálculo/desenho. O build de F8 substitui os binários no mesmo caminho; este relatório registra o build F6/F7 observado, não um arquivo imutável separado.
