# F1 — Conteúdo sob demanda, transporte e atualização incremental

Atualização: 26/10/2026. MEM-01 a MEM-06 implementados; validação de execução e medições continuam pendentes.

## Implementado

- O scanner inventaria metadados, caminhos e revisões (tamanho + mtime).
- Uma passagem lê somente os conteúdos necessários para índices YAML/RSI; o índice conserva identificadores, não fontes completos.
- A extração de relações carrega, analisa e libera um arquivo por vez. O analisador JSON v1 reaproveita a mesma construção de grafo.
- Snapshot de pasta **v2** contém `schemaVersion`, `snapshotId`, `repositoryId`, `name`, `files`, `graph`, `warnings` e `changes`. Cada entrada em `files` tem `path`, `name`, `size`, `revision` e `contentState`; não tem `content`.
- O objeto `graph` mantém seu contrato **v1** de nós/arestas. A versão do envelope não altera a versão do grafo.
- `read_file_content` lê texto apenas quando solicitado pela aba de conteúdo. Mídia também exige a sessão atual e a revisão do arquivo.
- `search_repository` faz busca literal sem distinguir maiúsculas/minúsculas nos caminhos do snapshot e nos textos elegíveis. Não aceita regex do usuário.
- A interface descarta respostas de arquivos/consultas anteriores. Nova consulta, fechamento e troca de repositório cancelam o trabalho obsoleto; o botão Cancelar da busca limpa o termo.

## Comandos e limites

| Comando | Entrada | Resultado |
| --- | --- | --- |
| `read_file_content` | `snapshotId`, `path` | `status`, `revision`, `content` opcional. |
| `read_asset` | `snapshotId`, `path` | Bytes, com limite e revisão verificados. |
| `search_repository` | `snapshotId`, `queryId`, `query`, `cursor`, `limit` | Hits, próximo cursor e cobertura do lote. |
| `cancel_search` | `queryId` | Cancela somente a consulta correspondente. |

A sessão no backend conserva metadados, grafo, relações derivadas e a lista de caminhos autorizados. IDs recebidos do renderer não autorizam raízes arbitrárias. A paginação vincula cursor à consulta e à sessão; não é um índice persistente.

- Texto individual: menor que 500 KiB, incluindo resultado UTF-8 da conversão.
- Arquivos: até 100.000. Mídia: até 128 MiB por prévia.
- Busca: 2 ou mais caracteres; máximo de 512 bytes no backend e 128 unidades UTF-16 no campo da interface.
- Página nativa: até 256 arquivos percorridos e até 200 arquivos correspondentes; no máximo um hit por arquivo, com a primeira linha correspondente e trecho de até 240 caracteres.
- A interface percorre páginas até obter 200 resultados ou terminar a pasta. “Carregar mais resultados” busca mais 200; teto de 2.000 arquivos correspondentes por consulta, com aviso para refinar o termo. Nós de contexto conectados não contam nesse teto de correspondências.
- Cobertura mostra arquivos percorridos, textos pesquisados, arquivos sem pesquisa textual, alterações de revisão e falhas de leitura. Resultado por nome pode existir mesmo quando o conteúdo não pôde ser pesquisado.
- Busca e leitura de prévia têm filas separadas no host e uma operação ativa por fila. O texto não entra em um cache global; o painel mantém somente sua última prévia.

O limite agregado de 256 MiB continua no pedido JSON v1, mas não limita a soma dos textos processados pelo scanner de pasta: esses textos não ficam todos retidos. O grafo e o cache de relações têm, cada um, limites de 500.000 entradas e 128 MiB de strings; exceder aborta com erro explícito. Índices, metadados, alocações auxiliares e a representação da interface ainda têm custos adicionais. Não há limite global de RAM nem comprovação de ganhos quantitativos.

## Alterações de arquivos

Texto é comparado com tamanho/mtime antes e depois da leitura. O scanner confere novamente as revisões dos arquivos ao terminar a análise. Alterações detectadas causam nova tentativa, até três inventários ao todo; instabilidade persistente retorna erro sem substituir a sessão anterior. Falhas de leitura geram avisos e impedem reutilizar o cache correspondente.

**Atualizar** executa novo inventário. Se os caminhos e as revisões dos arquivos que fornecem IDs YAML/RSI continuam iguais, reutiliza o índice e as relações dos arquivos inalterados. Reanalisa arquivos com revisão diferente. Inclusão/remoção de caminhos ou mudança nos arquivos de IDs invalida a resolução global e refaz as relações. As relações estruturais e pesos são sempre reconstruídos. `changes` informa `parsed`, `reused`, `added` e `removed`; `parsed` inclui entradas sem texto cujo resultado vazio foi recalculado.

Não há watcher, polling ou hash de conteúdo. A pasta continua viva: inclusões após o inventário e alterações que preservam tamanho/mtime podem não ser detectadas; as verificações não fornecem uma fotografia atômica. Na prévia, `changed` pede atualização; na busca, texto alterado é omitido e entra na contagem de alterações.

## Transporte desktop

`open_repository` recebe `analysisId`, pasta autorizada opcional ou `refreshSnapshotId` da sessão atual. Retorna um manifesto com contagens, sem as coleções inteiras. O progresso inclui `analysisId`; o renderer ignora eventos de outra operação.

O cliente pede `snapshot_batch` sequencialmente para arquivos, nós, arestas e avisos, com `snapshotId`, `analysisId`, seção e cursor. Cada resposta contém até 256 itens e 256 KiB (com espaço reservado ao envelope). Um item isolado maior que o orçamento causa erro. O backend exige a próxima seção/cursor exatos: o produtor só avança quando o cliente pede o próximo lote.

Após consumir e validar todos os lotes, o cliente chama `finish_snapshot`. Só então o backend troca a sessão e invalida leituras/buscas antigas. Cancelamento ou erro descarta o snapshot pendente, preservando o anterior durante uma atualização. A sessão anterior e a construção nova coexistem durante esse processo; os limites por estrutura não são um limite agregado de RAM. Um renderer interrompido pode deixar uma transferência pendente até cancelamento/fechamento do app; expiração automática ainda não existe.

A identidade SQLite aparece no manifesto desktop como `repositoryId`/`worktreeId`; `legacyKey` conserva a raiz para migração de anotações. A CLI não usa SQLite e continua identificando a pasta pela raiz canônica.

## Compatibilidade da CLI

```powershell
cargo run -p beckarepo-core --bin beckarepo-cli -- "D:\caminho\do\repositorio"
```

A saída com pasta agora é snapshot v2 **sem conteúdo bruto**. Consumidores anteriores que esperavam `files[].content` precisam se adaptar. O modo `--json` continua aceitando `AnalysisRequest` v1 pelo stdin e devolvendo `AnalysisResult` v1, com os limites e a política de arquivos existentes.

## Ainda pendente

- Orçamentos globais de índices/diagnósticos e prazo rígido de análise.
- Validação de regressão, medições de memória, cancelamento durante lotes e interações completas na janela.
- Observação automática de mudanças, expiração de transferência abandonada e hash de conteúdo, se necessários nas próximas fatias.

Não foram adicionados ou executados testes nesta entrega. Compilação e análise estática não comprovam paridade funcional nem desempenho.

## Arquivos principais

`repository.rs`: inventário, leitura, snapshots e busca; `parser.rs`: índice alimentado incrementalmente; `analysis.rs`: construção compartilhada com leitor por arquivo; `src-tauri/src/main.rs`: autorização, sessão e cancelamento; `transport.rs` e `analysisClient.js`: manifesto, lotes e confirmação; `useRepositorySearch.js`: paginação e descarte de respostas; `FilePanel.jsx`: prévia sob demanda.
