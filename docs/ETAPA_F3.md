# F3 — Histórico Git, persistência e análise do projeto

Implementado em 26/10/2026 e ampliado com identidade Git persistente, cache SQLite, hotspots, autoria opcional e coalteração. Validação de execução permanece pendente; as limitações abaixo fazem parte do escopo.

## Continuação: Análises → Git do projeto

A nova visão **análises** oferece **Git do projeto** e **Estrutura e ciclos** ([F4](ETAPA_F4.md)). No painel Git, escolha a janela, o limite de arquivos para excluir commits de massa e o suporte mínimo dos pares. A consulta usa o repositório que contém a pasta aberta; uma pasta superior contendo vários repositórios não é agregada como se fosse um só Git. Submódulos e repositórios aninhados precisam ser abertos separadamente para essa análise global.

- Até 1.000 commits não merge, solicitando um registro adicional para detectar truncamento; até 16 MiB de saída numstat, 20 mil caminhos e 200 mil pares candidatos. Estouro de bytes/caminhos/pares retorna erro com orientação para reduzir o escopo.
- Commits com mais de 10/20/50/100 arquivos no escopo consultado (padrão 50) são excluídos tanto de hotspots quanto da coalteração. A contagem para esse limite considera os registros antes da política de arquivos. Merges e alterações não commitadas não entram no cálculo.
- Caminhos históricos respeitam a política de nomes sensíveis, tipos e pastas excluídas. Caminhos ausentes do snapshot aparecem sem botão de navegação ativo: isso pode representar remoção, exclusão do scanner ou ausência do inventário, não uma classificação definitiva de exclusão no Git.
- Binários contam na frequência, mas não no churn de linhas. Renomes são registrados no caminho de destino; a análise global não unifica identidades históricas nem usa `--follow` para todos os arquivos. O histórico individual continua com `--follow`.
- Hotspots e pares são ordenados e devolvidos em páginas de 100, com totais visíveis. Resposta limitada a 4 MiB. O resultado respeita snapshot/query ID; cancelamento e prazo cooperativo continuam usando a fila Git comum.

### Fórmula de hotspot

Para cada caminho elegível, `churn = adições + remoções`, frequência é o número de commits elegíveis que alteram esse caminho e idade é o tempo entre a última alteração e o fim da janela.

`score = 100 × [0,45 × ln(1+churn)/ln(1+churnMáximo) + 0,35 × frequência/frequênciaMáxima + 0,20 × 2^(−idadeEmDias/30)]`.

Termos com máximo zero recebem zero. Os máximos vêm de todos os caminhos elegíveis antes da paginação, incluindo caminhos atualmente ausentes. Pesos e fórmula ficam visíveis na interface. O score é relativo à consulta, não uma probabilidade de bug nem uma comparação absoluta entre projetos.

### Coalteração e autoria

Cada par de caminhos distintos conta uma vez por commit. Suporte mínimo configurável: 2, 3, 5 ou 10. `P(B|A) = suporte(A,B)/frequência(A)` e `P(A|B) = suporte(A,B)/frequência(B)`, com o mesmo universo de commits elegíveis. A tabela histórica é separada das dependências estruturais; não gera ciclos de importação. Pares usam índices numéricos internamente, evitando duplicar caminhos longos para cada combinação.

Autoria fica desativada por padrão. Quando habilitada, `%aN/%aE` normalizam nomes/emails pela `.mailmap` local da worktree; overrides de `mailmap.file`/`mailmap.blob` são desabilitados. Não é uma análise de blame nem de propriedade atual do código. Até 16 identidades por caminho, em ordem alfabética; ocorrências omitidas são contabilizadas, sem afirmar número de pessoas distintas omitidas. Limites: 1 KiB por identidade e 8 MiB de identidades retidas. A consulta com autoria ignora o cache e não persiste seu resultado; o painel não classifica produtividade de pessoas. Mudanças locais na `.mailmap` podem alterar a normalização sem alterar HEAD.

### Identidades e cache persistentes

O schema 2 acrescenta `git_repositories` (diretório comum canônico), `git_worktrees` (diretório Git específico), `git_scopes` (localização anotada + raiz Git) e `git_cache`. Worktrees vinculadas compartilham a identidade Git do repositório, preservando identidades distintas de worktree. As identidades e chaves das notas/tags de F2 não são reescritas; analisar subpastas ou Git aninhado não funde anotações.

A migração 1 → 2 é transacional e precedida pelo backup de inicialização. Backups v1/v2 continuam aceitos; restaurar v1 aplica a migração antes de retomar o uso. Reconhecer uma localização movida/recriada continua fora deste escopo.

Cache regenerável separado das notas: até 64 entradas e 64 MiB de payload, 8 MiB por entrada, retenção de sete dias. A chave usa diretório de worktree, escopo/caminho, HEAD, limites/versão do algoritmo e intervalo; inclui o hash do arquivo `shallow` para invalidar aprofundamento do histórico. As chaves são armazenadas como SHA-256. O teto não inclui overhead/índices, WAL e backups; não há `VACUUM` automático. Falha/corrupção do payload do cache gera aviso e consulta normal, não impede abrir o grafo.

As janelas terminam no último múltiplo de cinco minutos, exibido explicitamente. Isso permite reutilizar o mesmo intervalo entre sessões: commits dos últimos minutos podem ficar fora até a próxima janela. **Atualizar análise/Git** ignora os caches, mas preserva esse alinhamento temporal. A configuração/atributos locais do Git podem afetar numstat sem mudar HEAD; após alterá-los, force a consulta. O cache de histórico individual em RAM continua limitado a 16 entradas/8 MiB.

## Uso

1. Abra uma pasta e selecione um arquivo.
2. No painel de detalhes, abra **Histórico Git**.
3. Escolha uma janela de 7, 30, 90 ou 365 dias. A consulta acontece somente ao abrir essa aba.
4. **Atualizar Git** ignora o cache da consulta. Se o arquivo mudou desde o inventário, use **Atualizar** na barra principal para renovar o snapshot primeiro.
5. **Cancelar**, trocar de arquivo/aba ou fechar a sessão interrompe a consulta obsoleta. Respostas de outra consulta não substituem o painel atual.

É necessário Git instalado no PATH; use uma versão atual que suporte `--since-as-filter` e `--path-format=absolute`. Ausência de Git ou de um repositório não impede a exploração do grafo. Repositórios bare não são tratados como pastas de código nesta entrega.

## Informações exibidas

- Branch ou HEAD destacado, hash do HEAD consultado e diretórios de raiz, Git e compartilhado.
- Reconhecimento de `.git` como diretório ou arquivo, incluindo worktrees vinculadas. A descoberta parte do arquivo selecionado, permitindo reconhecer repositórios aninhados e submódulos com worktree disponível.
- Presença do caminho no índice, indicação de alterações **staged** e comparação de bytes locais com o índice, conforme os limites descritos na continuação abaixo.
- Janela temporal exata, frequência de commits, adições, remoções, churn e data da última alteração observada na janela.
- Lista de hashes/datas com contagem de linhas por commit; caminhos anteriores quando a heurística do Git identifica uma mudança de caminho.
- Avisos para histórico raso, limite de commits e registros excluídos pela política de nomes sensíveis.

Identificar o diretório compartilhado associa identidades Git no schema 2, preservando as identidades de anotações de F2. Reassociação explícita de pastas movidas está disponível em Dados locais.

## Definição das métricas

O universo é o histórico do **caminho selecionado**, alcançável a partir do hash de HEAD capturado no início da consulta, dentro da janela informada. Merges são omitidos. A filtragem usa a data de commit (`%ct`), não a data de autoria.

- **Frequência:** quantidade de commits elegíveis com estatísticas para o caminho, depois das exclusões.
- **Churn:** soma de adições e remoções desses commits.
- **Última alteração:** maior timestamp entre os commits incluídos. Ausência na janela não significa ausência de histórico anterior.
- **Binários:** contam na frequência, mas não recebem contagem de linhas.
- **Mudanças de caminho:** registros com origem/destino produzidos pela heurística de `--follow` e detecção a 50%; não constituem identidade permanente de arquivo. Cópias/renomes ambíguos e históricos não lineares podem ter cobertura diferente da esperada.

São solicitados até 201 commits para detectar a ultrapassagem do teto de 200 exibidos. Quando o teto é atingido, as métricas são apenas da parte incluída; a interface sinaliza cobertura parcial. Recriar um arquivo no mesmo caminho pode reunir histórias de arquivos semanticamente diferentes. Os indicadores não são estimativas de bugs nem medidas de produtividade.

## Adaptador e limites

`src-tauri/src/git.rs` executa Git por `std::process::Command`, com argumentos separados, caminho absoluto do executável e janela de processo oculta no Windows. Não monta comandos de shell. O executável é procurado em entradas absolutas do PATH, excluindo o repositório Git consultado.

- Comandos: `rev-parse`, `symbolic-ref`, `ls-files`, diff **cached/raw** do índice e log **numstat**. Não há commit, checkout, reset, fetch, alteração do índice ou escrita de configuração Git.
- Configuração global/sistema e overrides `GIT_*` herdados são desconsiderados. Pager, hooks, fsmonitor, helpers de credenciais, diff externo, textconv e lazy fetch são desabilitados nos caminhos usados; protocolos remotos são bloqueados. O cálculo lê objetos já disponíveis localmente.
- `safe.directory` é limitado à raiz descoberta, apenas nos argumentos do processo que lê o repositório escolhido. Nenhuma exceção global ou `safe.directory=*` é gravada.
- Caminhos são passados depois de `--`, como pathspec literal. Caminhos históricos vêm delimitados por NUL, preservando tabs e quebras de linha no nome. Cabeçalhos de commit contêm somente hash e timestamp; assuntos, mensagens, nomes e emails de autores não são coletados.
- Até 8 MiB de stdout do log, 64 KiB de stderr por processo, saídas menores para metadados e até 4 KiB por caminho histórico. Formato inesperado, nomes não UTF-8 ou estouro de orçamento geram erro, sem apresentar dados truncados como completos.
- Prazo cooperativo de 30 segundos por consulta após adquirir a fila; cancelamento/timeout encerra e recolhe o processo Git. Existe uma consulta executando por vez.
- HEAD e a revisão do arquivo são conferidos antes/depois. Não é uma transação atômica da pasta, do índice e do Git; mudanças concorrentes ainda podem exigir nova consulta.
- Cache individual: RAM com até 16 históricos/8 MiB e persistência separada no SQLite conforme descrito acima. Fechar/trocar snapshot invalida RAM e consultas, preservando entradas persistentes válidas por HEAD/intervalo/versão. Overhead de alocações não está incluído nesse orçamento.

O teto de saída não limita a RAM interna usada pelo processo Git para abrir/diferenciar blobs grandes. O filtro de nomes sensíveis é aplicado aos registros exportados pelo Git; não impede o próprio Git de ler blobs históricos durante a detecção de renomes. Não há inspeção de segredos embutidos em blobs, apagamento de memória ou garantia de história completa.

## Pendências de F3

- Unificar renomes históricos na análise global e classificar deletados explicitamente.
- Ampliar comparação local para modos/permissões e tratamento de conversões de conteúdo, sem executar filtros do projeto.
- Validação de execução de renomes, worktrees, submódulos, histórico raso, HEAD alterado, limites e cancelamento. Não foram criados/executados testes nesta entrega.

## Continuação de 26/10/2026

- **Estado local:** o histórico por arquivo agora compara o blob do índice (`ls-files --stage -z`) com `hash-object --no-filters`, sem `-w`. Mostra igual/diferente, não rastreado, conflito ou tipo não suportado. É comparação de bytes: CRLF/LF também diferem; permissões não entram. O arquivo precisa corresponder à revisão do snapshot, portanto atualize o repositório após editar. Estado local não é guardado no cache histórico nem somado ao churn. [Semântica de hash-object](https://git-scm.com/docs/git-hash-object).
- **Navegação:** hotspots e pares deixam de ser truncados em 200. A agregação completa é paginada em respostas de 100 itens, preservando os limites de 1.000 commits, 20 mil caminhos e 200 mil pares candidatos. Metadados de pares têm teto adicional de 32 MiB. Cache do projeto passa a `repository-history-v2`. Resultados acima dos 8 MiB de uma entrada SQLite continuam disponíveis, mas são recalculados e exibem aviso de cache; autoria continua sem persistência.
- **Coalteração visual:** checkbox em Git do projeto abre um Canvas com os pares da página atual e ambos os extremos no inventário. Linha tracejada, sem seta causal; suporte/janela/limite de commits de massa usam os controles do painel. Quantidade desenhada e exclusões por ausência são visíveis. Essa camada não altera o grafo estrutural nem as métricas F4.
- **Pasta movida:** Configurações → Dados locais lista localizações salvas para reassociação. Só permite origem que deixou de existir e destino sem anotações salvas; bloqueia rascunhos/operações simultâneas. Confirmação nativa identifica as duas pastas e a quantidade de anotações; backup precede transação. Conserva IDs, notas e tags da origem, troca o vínculo de localização e invalida a sessão. Abra a pasta novamente. Não mescla notas de duas identidades, não move arquivos e não infere identidade por nome/remote. O schema continua v2.

Os fluxos ainda precisam de aceite em execução. O teto do histórico individual permanece em 200 commits; a paginação ampliada se aplica aos hotspots e pares do projeto.

## Referências técnicas

- [Git log: janelas, numstat, NUL e follow](https://git-scm.com/docs/git-log).
- [Git rev-parse: identificação da worktree e diretórios](https://git-scm.com/docs/git-rev-parse).
- [Implementação Git da restrição de pathspec de follow](https://github.com/git/git/blob/master/diff.c): permite as opções `top` e `literal` utilizadas pelo adaptador.
