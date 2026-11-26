# F8 — primeira entrega: navegação em grafos densos

## Motivo e escopo

A captura reportada contém 85.224 arquivos e 91.745 conexões. O Canvas anterior reduzia a opacidade dos nós conforme o zoom aumentava (`0.4 / escala`), ampliava raios/espessuras mínimos em coordenadas do mundo e desenhava todas as conexões elegíveis. Isso tornava os arquivos menos legíveis ao aproximar. A física do modo acima de 15 mil nós também usava links curtos sem repulsão, favorecendo concentração.

A primeira parte de F8 foi antecipada para tratar a navegação. O novo `DenseGraphCanvas.jsx` substitui o Canvas usado acima de 800 nós, incluindo o grafo de busca quando ultrapassa esse tamanho. A visualização SVG de até 800 nós continua disponível. Os dados e filtros do grafo não são truncados para produzir a redução visual.

## Como explorar

1. Abra **grafo global**. Use a roda ou os botões **+ / −** para aproximar/afastar.
2. Círculos com números representam arquivos próximos na tela. Clique para aproximar daquela região. O tooltip informa a contagem exata, inclusive quando o círculo mostra `999+`.
3. Clique em um arquivo, ou selecione pela árvore e use **Localizar selecionado**. O modo **Automáticas** destaca as conexões incidentes e seus vizinhos; sem seleção, passar sobre um arquivo também permite inspecioná-lo.
4. Use **Só do arquivo** para manter apenas conexões incidentes ao arquivo selecionado/sob o ponteiro. **Todas (até 12 mil)** oferece contexto mais amplo, ainda com limite de desenho indicado.
5. **Limpar seleção** retorna ao contexto geral. **Enquadrar tudo** ajusta a câmera aos arquivos do filtro atual, incluindo os isolados.
6. Arraste o fundo para navegar. Arraste um arquivo para fixar sua posição; dê duplo clique para liberá-lo.

Com foco no Canvas, `+`, `−`, setas, `Home` e `Escape` controlam zoom, câmera, enquadramento e seleção. Os botões também podem ser acessados por teclado. O caminho completo aparece no tooltip do arquivo e no painel de detalhes.

## Regras visuais

- Zoom de 0,002× a 64×. Raios, linhas, rótulos e tolerância do ponteiro são definidos em pixels CSS; a opacidade não diminui com o zoom. Arquivos fora da vizinhança selecionada ficam atenuados para destacar o foco.
- Acima de 3.000 arquivos na área consultada, arquivos próximos são agrupados em células de 24 × 24 pixels. A agregação permanece até cair para 2.000 ou menos, evitando alternância em torno de um único limiar.
- São grupos **espaciais de desenho**, não pastas nem comunidades arquiteturais. Seleção e extremos das conexões destacadas têm prioridade sobre a agregação.
- No grafo de busca, grupos que contêm resultados recebem borda na cor da busca e o tooltip informa quantos resultados contêm.
- Modo automático sem foco: até 1.200 conexões. Com foco: até 5.000 conexões incidentes. Modo todas: até 12.000. Acima do orçamento, uma amostra determinística da lista elegível é desenhada; a barra inferior mostra desenhadas/elegíveis e um aviso. Não há afirmação de que todas as conexões estejam visíveis.
- Conexões elegíveis cruzam a área visível e respeitam o filtro de tipos e o modo atual. O recorte também mantém linhas que atravessam a tela com ambos os extremos fora dela. Nós são consultados com uma pequena margem de 24 pixels para evitar desaparecimento nas bordas.
- Setas de direção aparecem nas conexões em foco quando há espaço suficiente. Rótulos de arquivos têm orçamento de 80 e rejeitam colisões. Nome selecionado, hover e vizinhos têm prioridade.
- No Canvas, **Mostrar grupos** exibe até 12 legendas dos clusters na visão geral. As legendas não crescem com o zoom e desaparecem na aproximação/foco; os grandes preenchimentos de hull não são desenhados nessa versão do Canvas.
- O índice espacial limita a consulta de nós à região visível e o hit-test aos marcadores desenhados. Grupos não podem selecionar um arquivo oculto arbitrário.

## Layout e ciclo de vida

O layout parte de uma distribuição determinística. Para mais de 15 mil nós, ligações mais fracas e forças de ancoragem mantêm a distribuição inicial mais aberta. Isso não resolve todos os casos de sobreposição nem garante qualidade espacial para qualquer grafo.

Redesenhos são agendados sob demanda por câmera, física, seleção ou tamanho. `ResizeObserver` ajusta o bitmap à área dos painéis, preservando o centro da câmera. A densidade de pixels do monitor também é considerada. Soltar o arraste fora do Canvas encerra o gesto; listeners, simulação, observador e frame pendente são liberados ao desmontar.

Dentro da mesma montagem do Canvas e do mesmo snapshot, mudanças de filtro preservam posições disponíveis e câmera. A troca para SVG, desmontagem da visão ou novo snapshot reinicia esse estado local. Seleção e rascunhos continuam sob controle do componente pai.

## O que ainda falta em F8

- Física do Canvas foi movida para Worker em 30/10 (seção abaixo). SVG pequeno e grafo local continuam na thread da interface; construção do índice espacial e desenho do Canvas ainda crescem com o número de nós.
- Agregação por pastas com expansão explícita disponível desde 31/10 (seção abaixo). Expansão automática por zoom e integração do zoom semântico de símbolos ao grafo global continuam pendentes.
- Persistência de posições/câmera entre visões e snapshots, rastro de navegação e medições de tempo/memória/frame.
- Experimentos comparativos com Worker/Rust/Wasm/GPU. Não foi adicionada dependência para GPU.

Não foram executados testes automatizados, testes interativos ou benchmarks nesta entrega. A captura orientou a correção; o conjunto de 85 mil arquivos não foi executado para medir a melhoria. O aceite pendente inclui: grafo denso real, aproximação/afastamento, seleção pela árvore, arquivo isolado, nó com muitas conexões, linha atravessando a tela, filtros, troca de idioma, resize dos painéis, arraste para fora do Canvas e retorno da visão.

As pendências de F3 (identidade persistente de worktrees, cache SQLite, hotspots, autoria e coalteração) continuam em [ROADMAP.md](ROADMAP.md). Esta entrega inicia a frente de visualização e não marca F3 ou F8 completas.

## Segunda entrega — física do Canvas em Worker, 30/10/2026

Após F6 e o piloto F7, o usuário autorizou continuar F8. `DenseGraphCanvas` usa um Worker de módulo para simular as mesmas forças D3. Isso abrange o grafo global e de busca acima de 800 nós e o Canvas da coalteração. Grafos SVG/local pequenos continuam com seu motor anterior.

Somente geometria numérica e índices de conexões são transferidos; caminhos, fontes, seleção e câmera ficam na interface. Inicialização: quatro Float64 por nó e dois Uint32 por conexão. Respostas: dois Float64 por nó, com buffers transferíveis, aproximadamente até um lote a cada 80 ms e no máximo um lote aguardando confirmação. Todos os nós, inclusive isolados, permanecem no layout.

Arraste fixa imediatamente a posição local e envia uma revisão ao Worker. Respostas anteriores a essa revisão são descartadas e confirmadas; duplo clique libera a posição e aquece a simulação. Troca de grafo/filtro encerra o Worker anterior, conserva posições/câmera no escopo já suportado e ignora respostas tardias. Desmontagem encerra timers e Worker. Falha de criação, protocolo, execução ou ausência de progresso por 30 segundos preserva as últimas posições, com aviso e navegação estática; não há fallback automático para física pesada na interface.

**Desempenho do grafo** mostra cálculo acumulado/iterações, aplicação do último lote, desenho mais recente e bytes de coordenadas recebidos. Desenho inclui índice espacial, recorte, rótulos e Canvas; não é FPS nem duração total da operação. A simulação ainda usa CPU e o transporte/índice/desenho têm custos próprios. `tests/benchmark-dense-layout.mjs` compara o mesmo algoritmo em Node na thread principal e em Worker, sem representar a WebView.

Validação e limites: [relatório F8](validation/2026-10-30/RELATORIO_F8_WORKER.md). Nenhuma dependência nova, alteração de banco ou execução de fontes analisados. VIS-01 continua parcial até medições reais e aceite completo; LOD por pastas, física SVG/local e comparações Wasm/GPU permanecem abertos.

## Terceira entrega — detalhamento por pastas, 31/10/2026

Nos grafos global/de busca que usam Canvas (mais de 800 nós), **Detalhamento → Pastas** produz uma projeção por diretórios. Quadrados representam pastas e círculos representam arquivos. Clique em uma pasta para revelar os arquivos imediatos e suas subpastas. **Navegar por pastas** oferece busca, lista paginada em 20 itens, contagens e botões para recolher ramos ou tudo. Arquivos da raiz continuam individuais.

Cada arquivo pertence a exatamente um representante. O selecionado é retirado do agregado e permanece individual, inclusive ao recolher seu ramo; não é contado duas vezes. Resultados de busca são somados por pasta. Grupos são identificados por caminho completo, sem depender do nome final. Relações entre representantes são somadas por tipo, direção e bidirecionalidade. Relações inteiramente dentro de uma pasta são contadas como internas; não se transformam em falsos laços visíveis. Autorreferências de arquivos individuais continuam relações do arquivo.

As linhas mostram tipo e multiplicidade quando há espaço (orçamento de 80 rótulos). A barra diferencia relações agregadas desenhadas de conexões originais representadas; a lista informa relações internas. A amostragem existente de linhas ainda se aplica. Esta é uma projeção visual: não substitui os dados de F4, não transforma contagem em risco e não comprova uso em execução.

Expansão e recolhimento são explícitos; zoom da câmera não troca o nível automaticamente. Isso evita mudanças oscilantes de hierarquia. A câmera é mantida na mesma montagem/snapshot, posições conhecidas são reaproveitadas e novos filhos nascem perto do ancestral previamente visível. O Worker reorganiza a projeção. **Enquadrar tudo** e **Localizar selecionado** continuam disponíveis. Pins dos arquivos já vistos são preservados. Pastas não são arquivos editáveis, arrastáveis ou alvos de anotações.

Limites: projeção síncrona na interface, com custo dependente de nós, profundidade dos caminhos e arestas a cada mudança de filtro/expansão/seleção; relações não são truncadas antes da agregação. Repositórios com muitos arquivos na raiz ou muitos irmãos continuam densos. Cache de posições dura apenas a montagem e o snapshot; transição para SVG, troca de visão/repositório e novos snapshots não prometem persistência. Métricas reais de RAM/p50/p95 e LOD automático ainda pendentes.

Evidências e reprodução: [relatório de pastas](validation/2026-10-31/RELATORIO_F8_PASTAS.md). Sem dependências novas ou alteração do banco.
