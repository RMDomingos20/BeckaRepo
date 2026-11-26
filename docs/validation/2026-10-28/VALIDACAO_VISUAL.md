# Validação visual F0–F5 — 28/10/2026

Continuação do [relatório automatizado](../2026-10-27/RELATORIO_F0_F5.md). O acesso por Computer Use funcionou após o reinício informado pelo usuário. Ensaios na janela nativa **BeckaRepo Validation**, configuração `tests/validation.tauri.json`, WebView2, 1280 × 800. Banco exclusivo `com.beckarepo.validation`; nenhuma restauração no banco de produção.

## Evidências observadas

| Fluxo | Resultado observado |
| --- | --- |
| Inicialização e seleção nativa de pasta | Tela inicial sem erro; seleção de `target/validation/ui-repo`; progresso de análise e transferência; inventário de 9 arquivos e 5 conexões. `.env` ausente. |
| Árvore e detalhes | Expansão de `src`, seleção de `alpha.rs`; importação de beta e consumidores beta/lib. |
| Código sob demanda | Prévia exibiu `use crate::beta::Beta;`, `pub struct Alpha;` e comentário do segundo commit. |
| Grafo local | Três nós (alpha, beta, lib) e relações direcionadas visíveis; sem crash. |
| Anotações | Nota `Validação visual 28/10: nota persistente.` e tag `validacao-visual` salvas; botões de salvar/descartar desabilitados e mensagem de dados salvos. |
| Rascunhos | Atualizar foi bloqueado enquanto havia edição não salva. Encontrado aviso obsoleto após salvar; correção separa esse aviso dos erros de carregamento e encerra-o com a sessão de rascunhos. Reteste registrado abaixo quando concluído. |
| Histórico Git | Branch validation, HEAD `148f8032103b`, dois commits, churn 3 (+3/−0), conteúdo local idêntico ao índice. |
| Hotspots | Nove arquivos; alpha/beta com dois commits e churn 3; um registro excluído pela política. |
| Coalteração | Suporte mínimo alterado de 3 para 2; um par alpha/beta, suporte 2, probabilidades 100% em ambas as direções. Grafo opcional mostrou os dois nós ligados por linha tracejada. |
| Métricas F4 | Nove nós, cinco arestas, PageRank convergiu em 36 iterações, resíduo 8,593e-9; alpha/beta com grau de entrada 2 e saída 1. Cruzamento apresentou churn 3 e dois commits. |
| Ciclos | Um componente cíclico com dois arquivos; expansão mostrou alpha → beta → alpha. |
| Busca textual | `needle`: um resultado README.txt; 9/9 arquivos percorridos, oito textos, um asset sem pesquisa textual, zero erros/alterações. Nó de resultado visível. |
| Persistência | Após reabrir o processo e selecionar a mesma pasta, nota/tag foram recuperadas. Mudança para inglês, fechamento pelo botão da janela e novo lançamento mantiveram o idioma inglês. |
| Reteste de rascunhos | Edição da nota, tentativa de Atualizar, bloqueio com aviso, Salvar: aviso desapareceu imediatamente e status voltou a dados salvos. |
| Evidências F5 | Painel expandido mostrou syntax-v4, Cargo.toml, target validation_demo/lib, raiz src/lib.rs, contexto crate::alpha e import crate::beta::Beta → src/beta.rs, linha 1, bytes [0,22). |
| Imagem | Carregamento de preview.png, ampliação por roda e arraste funcionaram. Encontrada seleção azul indevida durante o arraste; corrigida com userSelect:none e preventDefault no pointerdown. Reteste ampliou e moveu a imagem sem seleção azul. Ao sair e voltar à prévia, enquadramento reiniciado. |
| Backup nativo | Botão Criar backup gerou `com.beckarepo.validation/backups/beckarepo-1793211592254095200.sqlite`; caminho mostrado no status. Seleção dessa cópia abriu a confirmação final de restauração, aguardando autorização pontual exigida pelo controle de computador. |
| Restauração autorizada | Após confirmação explícita do usuário, Sim executou a restauração: WebView recarregada na tela inicial, preferência retornou de inglês para português. Backup de segurança adicional presente no diretório. Banco com.beckarepo.app não foi usado. |
| Cancelamento sob carga | Abertura de Gaby-CMU-master, cancelamento durante leitura e retorno à tela inicial sem mensagem de erro; nova seleção e análise permitidas. |

Os resultados acima foram lidos na interface real por captura visual e árvore de acessibilidade. Não são inferências a partir dos testes Rust. Capturas foram exibidas durante a execução, sem criação de arquivos de screenshot neste relatório.

Nas 60 amostras de processos da sessão, o maior conjunto de trabalho observado do processo BeckaRepo foi de 90,2 MiB. A leitura abrange apenas o processo do aplicativo e os instantes amostrados.

## Situação

**Aceite visual ainda parcial.** A restauração autorizada foi executada e o idioma restaurado; falta reabrir as anotações para conferir seu conteúdo após essa restauração. Recuperação de corrupção, reassociação e paginação real com múltiplas páginas ainda precisam de aceite pela interface. O cancelamento sob carga passou. A segunda análise de Gaby-CMU-master foi observada durante a leitura, sem confirmação visual do grafo completo: legibilidade do grafo grande, frames e memória durante sua renderização continuam pendentes. Os testes automatizados anteriores dessas operações permanecem documentados separadamente.

Após as duas correções visuais, ESLint, build de produção da interface e os cinco testes JavaScript passaram (geometria isolada: 108 ms; não é tempo de frame). Nenhuma lógica Rust foi alterada nesta continuação.

Em 29/10/2026, o usuário pediu explicitamente para avançar à próxima parte. A implementação de `#[path]` Rust prosseguiu conforme esse pedido, preservando as pendências visuais acima. Isso não converte os ensaios pendentes em aprovados. Continuação: [relatório de F5 — atributos de caminho](../2026-10-29/RELATORIO_F5_PATH.md).
