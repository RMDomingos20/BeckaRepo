# F7 — Símbolos e navegação dentro do arquivo

Primeira entrega em 30/10/2026, após autorização para avançar além de F6. Piloto para JavaScript/JSX, TypeScript/TSX e Rust. Resolução global de símbolos, tipos e chamadas entre arquivos permanece fora desta entrega.

## Uso e identidade

Selecione um arquivo e abra **Símbolos** no painel de detalhes. A análise roda no núcleo Rust somente ao abrir a aba. Há filtro por nome, complexidade/decisões, chamadas, trecho do símbolo selecionado e grafo expansível. Zoom altera a escala; recolher o grafo preserva a seleção. A seleção principal continua sendo o arquivo.

O grafo representa até 40 símbolos da página e 80 relações resolvidas. Listas de símbolos/chamadas têm páginas de 40. Chamadas não resolvidas ficam na lista, sem aresta de destino. A prévia usa offsets UTF-8 e limite de 24 KiB, com truncamento indicado.

Cada identidade contém caminho, revisão, versão do extrator, nome qualificado e intervalo `[startByte,endByte)`. Linhas começam em 1. Funções, métodos, classes, interfaces, structs, enums, traits, módulos e tipos nomeados têm cobertura sintática conforme a gramática. Funções anônimas recebem linha/coluna no nome; funções atribuídas a identificador simples usam esse identificador.

IDs não são âncoras permanentes de notas. `file_symbols` exige sessão/arquivo autorizados, usa o leitor limitado de F1 e confere a revisão após o parsing. Alteração no disco exige Atualizar. O renderer descarta respostas abandonadas. Fontes/ASTs não entram no snapshot ou cache global; apenas a prévia atual permanece no painel.

## Chamadas e cobertura

A ligação resolvida no piloto é chamada com identificador simples para função declarada, única e em escopo lexical ancestral do mesmo arquivo. Parâmetros, bindings, imports e atribuições com o mesmo nome bloqueiam conservadoramente a resolução em todo o arquivo. Métodos/receptores, qualificações, chamadas dinâmicas, construtores, imports e símbolos externos não são deduzidos por semelhança de nomes. Erro sintático ou extração parcial desabilita as arestas de chamadas resolvidas.

Isso descreve vínculo lexical observado, não execução, despacho ou resultado de compilação. cfg/features, macros e mutações dinâmicas não são avaliados. Funções de impl/trait não recebem ligações como funções livres.

**Sem chamadas locais conhecidas** é uma hipótese restrita ao arquivo. Exports/visibilidade pública e possível main Rust são sinalizados; callbacks e consumidores externos podem existir. Não há diagnóstico automático de código morto nem exclusão de código.

## Complexidade de decisões v1

Cada função começa em 1. Somam 1: if, for/while/do com condição, catch, ternário, case de switch, &&/|| e propagação `?` Rust. Match Rust soma braços menos 1. Comentários, strings e tokens de macros não são decisões. Funções aninhadas são contadas separadamente. Classes/interfaces/tipos não recebem escore de função.

O painel mostra contribuição, linha e intervalo de cada regra. É uma métrica sintática versionada; não promete equivalência a todos os analisadores de complexidade ou aos caminhos executáveis do compilador.

## Limites e continuação

Menos de 500 KiB de fonte; interrupção cooperativa do parsing em 250 ms e extração em 750 ms; 1.024 símbolos, 2.048 chamadas e 64 escopos. Até 128 evidências de decisões por função e 32 diagnósticos, com contagem de omissões. Resposta serializada até 2 MiB. Os tempos não são garantias rígidas de escalonamento do sistema. Cobertura parcial/linguagem não suportada são estados explícitos.

Sem dependência nova, migração de banco ou execução do código analisado. Implementados SYM-01, SYM-02, SYM-04 e a apresentação conservadora de SYM-05. SYM-03 permanece parcial: há chamadas lexicais locais; resolução completa de usos, tipos, dispatch e relações entre arquivos continua pendente.

Validação: [relatório F6/F7](validation/2026-10-30/RELATORIO_F6_F7.md), com 63 testes Rust/7 JavaScript aprovados, lint/build e observações na janela nativa. O usuário autorizou prosseguir para F8, sem encerrar as limitações de cobertura registradas acima.
