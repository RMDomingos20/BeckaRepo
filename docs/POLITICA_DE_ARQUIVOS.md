# Política de arquivos e limites

Atualização F1: o scanner de pasta trabalha por arquivo e devolve snapshot v2 sem texto. Leitor sob demanda e busca também aplicam esta política. O limite agregado de 256 MiB abaixo se aplica agora apenas ao pedido JSON v1. Veja [ETAPA_F1.md](ETAPA_F1.md).

Implementação: `crates/beckarepo-core/src/policy.rs`. Compartilhada pelo scanner, leitor de mídia e validador de pedidos do analisador. Não é configurável pela interface nesta etapa.

## Seleção

Atualização F6 (30/10/2026): `packages/` pode conter fontes de workspaces e passou a ser inventariado. Lockfiles npm/Cargo são lidos com limites e confinamento por uma passagem dedicada; não são incluídos na árvore de código, busca textual ou grafo de arquivos. Yarn/pnpm são identificados para diagnóstico de formato não suportado. Detalhes em [ETAPA_F6.md](ETAPA_F6.md).

A política tem duas partes: exclusão de nomes sensíveis e seleção de formatos úteis/diretórios gerados. Formatos reconhecidos e exclusões existentes foram extraídos de `repository.rs` para uma única fonte; a proteção de nomes sensíveis é nova.

A exclusão sensível avalia cada componente do caminho, sem distinguir caixa ASCII, aceitando `/` e `\` como separadores. Espaços e pontos finais são normalizados para a decisão conservadora de exclusão.

| Regra | Exemplos excluídos |
| --- | --- |
| `.env`, prefixo `.env.` ou sufixo `.env` | `.env`, `.env.production`, `.env.example`, `production.env` |
| Diretórios/arquivos de credenciais conhecidos | `.ssh`, `.aws`, `.azure`, `.kube`, `.gnupg`, `.npmrc`, `.pypirc`, `.netrc`, `_netrc`, `auth.json` |
| Extensões sensíveis | `.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.keystore` |
| Nome exato ou seguido de ponto | `credentials`, `secrets`, `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`, incluindo `credentials.json` e `secrets.yaml` |
| Prefixos de conta de serviço | `service-account*`, `service_account*` |

**Comportamento deliberadamente conservador:** exemplos, chaves públicas e arquivos legítimos que coincidam com essas regras também ficam excluídos. A pasta raiz selecionada é avaliada; escolher diretamente uma pasta sensível não contorna a proteção. Uma pasta cujo nome seja `secrets`, por exemplo, é excluída por inteiro.

No scanner, a exclusão ocorre antes de abrir o conteúdo. Na leitura sob demanda de texto e mídia, a validação verifica também o destino canônico. O scanner não percorre symlinks. Requests JSON com caminhos sensíveis são rejeitados integralmente antes do parsing do código, inclusive quando seu conteúdo é nulo.

Não é um detector universal de segredos: tokens em `config.js`, nomes diferentes dos conhecidos, hardlinks e alterações concorrentes maliciosas exigem medidas adicionais. A canonicalização seguida de abertura por caminho não elimina toda corrida de filesystem. Bytes fornecidos pelo usuário no stdin já são recebidos antes da validação do JSON; a política não promete apagamento seguro de RAM.

## Orçamentos atuais

| Recurso | Limite | Comportamento |
| --- | --- | --- |
| Arquivos aceitos | 100.000 | Falha ao exceder, tanto no scanner quanto no pedido de análise. |
| Conteúdo por arquivo | Menor que 500 KiB (512.000 bytes) | Scanner mantém nó sem texto; JSON com conteúdo excessivo é rejeitado. |
| Soma de texto UTF-8 no pedido JSON v1 | Até 256 MiB | Falha explícita ao exceder. |
| Mídia por prévia | Até 128 MiB | Leitura limitada e erro ao exceder. |
| Pedido JSON da CLI | Até 320 MiB | Leitura limitada antes da desserialização; demais limites continuam aplicados. |

A contagem de texto considera os bytes UTF-8 resultantes da conversão, inclusive expansão de entradas inválidas. Se o arquivo cresce durante a leitura e atinge o teto, seu prefixo não é enviado ao parser como se fosse conteúdo completo.

Esses números não são limites totais de RAM do processo: JSON, buffers temporários, índices, arestas, D3 e WebView também ocupam memória. Orçamento de arestas, diagnósticos, filas, tempo e cache são próximos trabalhos de F0/F1.

## Efeito sobre busca e exportação

Arquivos excluídos pelo scanner não entram no snapshot, na busca nem na árvore usada na exportação normal. A exportação Markdown atual continua recebendo uma string do renderer; esta mudança não implementa inspeção de segredos em texto arbitrário. O modo CLI com pasta agora imprime snapshot v2 sem conteúdo bruto; `--json` permanece v1.

## Compatibilidade e validação

Contrato de análise JSON v1 mantido; envelope de pasta migrado para v2; a validação ficou mais restritiva para caminhos sensíveis e pedidos grandes. Não há nova dependência nem alteração de arquivos no repositório analisado. Esta preparação não migra preferências, não cria banco SQLite e não executa Git.

Compilação: `cargo check --workspace --offline`. Testes de política e cenários de filesystem estão planejados em `VAL-01` do roadmap e não foram executados nesta etapa. Para usar os fontes atualizados, `npm run dev`; builds antigos precisam ser regenerados com `npm run build`.
