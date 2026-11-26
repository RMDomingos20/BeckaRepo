# F4 — Métricas estruturais e ciclos em Rust

## Uso e escopo

Abra uma pasta e escolha **análises → Estrutura e ciclos**. O cálculo usa o snapshot completo, não o subconjunto visual do grafo global. É possível incluir `prototype-parent` junto das relações `import`, escolher betweenness desativada ou amostrada, ordenar as métricas e filtrar caminhos. O filtro de texto reduz a listagem, não o universo matemático.

Clique em um caminho para selecionar o arquivo no painel de detalhes. Os resultados são paginados em 100 linhas. Cada grupo cíclico pode ser expandido para mostrar um caminho fechado de dependências; clicar nos seus elementos permite inspecioná-los.

As análises são executadas por `src-tauri/src/structure.rs` em uma tarefa Rust bloqueante, com cancelamento e cache em RAM. Não há envio de fontes para a interface nem uso de serviço remoto.

## Projeção estrutural

- Universo: todos os nós do snapshot, incluindo isolados. Direção: consumidor → dependência.
- Tipos: `import`, `require` e `re-export` por padrão; `prototype-parent` opcional. Relações `reference`, `sibling`, RSI, visuais e coalteração Git não participam.
- Arestas repetidas entre o mesmo par são unificadas, independentemente da evidência ou tipo estrutural. A análise é dirigida e não ponderada.
- A cobertura depende do parser heurístico existente. Imports dinâmicos, aliases e dependências ainda não resolvidas podem faltar. Autoimportações descartadas pelo parser não podem ser reconstruídas a partir do snapshot; não interpretar sua ausência como prova de inexistência.

## Ciclos

Kosaraju iterativo calcula componentes fortemente conexos sem recursão sobre a cadeia de arquivos. Um componente com mais de um nó, ou com uma autoaresta efetivamente presente, é cíclico. Uma busca dentro de cada componente apresentado produz um caminho testemunha com fechamento.

A interface lista até os 100 maiores componentes cíclicos, indicando totais de grupos e arquivos. Ela não enumera todos os ciclos possíveis. Caminhos testemunha têm até 128 posições; quando maiores, o prefixo é explicitamente marcado como truncado, sem afirmar que ele fecha o ciclo. IDs de grupo valem para aquela projeção/snapshot e podem mudar na próxima análise.

## Métricas

| Métrica | Definição |
| --- | --- |
| Entrada | Número de arquivos distintos que dependem daquele arquivo na projeção. |
| Saída | Número de dependências distintas daquele arquivo na projeção. |
| PageRank | Iteração de potência na direção consumidor → dependência, amortecimento 0,85, teleporte uniforme e redistribuição uniforme de massa de nós sem saída. Inicialização 1/N. |
| Betweenness | Fração de caminhos mínimos dirigidos passando pelo nó, excluindo os extremos, calculada por Brandes e normalizada por `(N−1)(N−2)` quando N > 2. |

PageRank usa até 60 iterações e tolerância **absoluta** L1 de `1e-8`. Iterações, resíduo e aviso de não convergência são apresentados; o último vetor continua identificado como aproximação. Não se usa `N × tolerância` como critério de parada.

Betweenness considera como fontes elegíveis os nós com saída, pois os demais não contribuem. Com até 256 fontes elegíveis, usa todas elas e informa cálculo exato. Acima disso, usa 8/16/32 fontes (padrão 16), escolhidas em posições uniformemente espaçadas na lista ordenada de caminhos. As contribuições são escaladas por `fontesElegíveis/fontesConsultadas` antes da normalização. Essa amostra determinística é reproduzível, mas pode ser enviesada pela ordenação e não fornece garantia/intervalo estatístico. Os valores amostrados não são probabilidades. Overflow de contagem de caminhos retorna erro e permite refazer com betweenness desativada.

Centralidade alta não comprova fragilidade, bug ou qualidade. Grau, PageRank e betweenness são indicadores separados com universos visíveis.

## Evidência combinada com Git

Ao abrir **Git do projeto** e depois **Estrutura e ciclos**, a seleção de um arquivo mostra suas métricas estruturais ao lado de churn/frequência, caso esteja na última página de caminhos consultada no painel Git. A interface informa HEAD e janela. Ausência nessa página é exibida como indisponível, não como zero.

As métricas estruturais usam o snapshot da pasta, que pode incluir mudanças não commitadas; o churn usa o histórico de HEAD. O painel evidencia essa diferença e não gera um selo automático de risco. Os dados combinados são mantidos somente enquanto a visão Análises estiver montada.

## Limites e ciclo de vida

- Até 100 mil nós, 500 mil arestas de origem e 32 MiB de IDs/caminhos. Erro explícito ao ultrapassar orçamento; não há projeção silenciosamente truncada.
- Prazo cooperativo de 30 segundos após adquirir a fila; checagens durante projeção, SCC, PageRank, BFS e publicação. Não é um limite rígido de CPU/memória do processo.
- Uma tarefa estrutural por vez; nova solicitação cancela a anterior. Fila estrutural independente da fila Git.
- Um resultado completo em RAM por snapshot/parâmetros/versão (`structure-v2`), reutilizado na paginação, seleção e filtro. Não é persistido em SQLite. Fechar/trocar snapshot ou restaurar banco invalida o resultado.
- Páginas de 100 métricas e 20 componentes, sem o corte anterior de 100 componentes. Metadados de ciclos limitados a 64 MiB e resposta a 4 MiB. Requisições e respostas incluem snapshot e query ID, impedindo resultados de outra consulta de substituírem a atual.

## Continuação de 26/10/2026

Todos os componentes calculados ficam navegáveis por paginação; o buffer de pais usado na busca da testemunha é compartilhado entre componentes disjuntos, evitando inicializar um vetor de tamanho N para cada ciclo. Testemunhas continuam limitadas a 128 caminhos e os membros resumidos a 20.

A projeção passa a incluir `require` e `re-export`, além de `import` e da herança opcional. O piloto F5 conserva autoarestas sintáticas e acrescenta evidências em bytes/linha no painel do arquivo. As heurísticas antigas ainda podem descartar autoimportações. Coalteração permanece fora da projeção. Detalhes do parser em [ETAPA_F5.md](ETAPA_F5.md).

## Aceite pendente

A implementação foi compilada e integrada à UI; não foram adicionados ou executados testes automatizados, comparações de referência, testes interativos ou benchmarks. Permanecem: cadeias longas, ciclos simples/interligados, autoarestas presentes, grafos vazios/desconectados, simetria de graus, soma de PageRank, comparação de betweenness exata/amostrada, cancelamento, troca de snapshot, paginação e uso com o repositório grande reportado.

## Referências

- [Git log: formato, numstat e mailmap](https://git-scm.com/docs/git-log).
- [NetworkX: PageRank e parâmetros](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.link_analysis.pagerank_alg.pagerank.html). Referência conceitual; o critério de tolerância deste projeto está explicitado acima e não copia o default da biblioteca.
- [NetworkX: betweenness, normalização e referência de Brandes](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.centrality.betweenness_centrality.html). A seleção determinística e o fator de escala desta implementação são próprios; não foi demonstrada equivalência numérica com essa biblioteca.
