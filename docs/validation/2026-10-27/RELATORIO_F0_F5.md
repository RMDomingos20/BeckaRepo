# Validação F0–F5 — BeckaRepo

Data: **27/10/2026**, fuso America/Sao_Paulo. Versão do aplicativo: **1.1.0**.

Continuações posteriores: [validação visual em 28/10](../2026-10-28/VALIDACAO_VISUAL.md), com acesso nativo restabelecido, e [entrega de atributos Rust em 29/10](../2026-10-29/RELATORIO_F5_PATH.md), autorizada pelo usuário. Este documento preserva o estado e os resultados da rodada de 27/10.

## Parecer

**A suíte automatizada passou. O aceite completo da aplicação permanece parcial.**

- **40 testes Rust passaram**, sem falhas ou testes ignorados: 21 no host, 15 no corpus/pipeline, 2 de contrato e 2 de CLI/limites.
- **5 testes JavaScript passaram**, cobrindo utilitários usados pela interface e geometria do grafo denso.
- ESLint de todo o projeto e verificação de formatação Rust passaram.
- Build de produção concluído: interface, executável Rust e instalador NSIS x64 (aproximadamente 4,20 MiB). O instalador foi gerado, não instalado.
- A CLI executou análises reais de um repositório sintético e deste próprio projeto.
- Foram criados bancos SQLite, repositórios Git, worktree e clone raso locais exclusivos para os testes.
- **Validação visual pendente:** o controle de computador recusou acesso à janela com `Computer Use was not approved to use beckarepo`. Na continuação, o usuário salvou a autorização documentada no `config.toml`, primeiro por executável e depois pelo identificador completo retornado pelo controle de computador. A configuração foi conferida como TOML válido, mas a sessão atual continuou recusando acesso. É necessário retomar após reiniciar o Codex para verificar o carregamento da alteração; não há confirmação de que isso resolverá a recusa. Não foram aprovados fluxos interativos sem observação.

Não há falha restante nos cenários automatizados executados. Isso não equivale a declarar F0–F5 integralmente concluídas: há critérios do roadmap e fluxos de integração ainda sem cobertura. **A próxima implementação não foi iniciada**, respeitando a condição de avançar somente após a validação. A preparação e os critérios de liberação estão ao final.

## Continuação: integrações e autorização do desktop

Após o pedido para resolver a autorização, foram acrescentados **seis testes Rust e dois JavaScript**. Os resultados de 40/5 acima substituem os totais iniciais de 34/3; não são contagens de execuções repetidas.

| Teste adicional | Resultado comprovado |
| --- | --- |
| Transferência completa de snapshot | Quatro seções, múltiplos lotes, rejeição de IDs/cursores incorretos e repetidos, publicação somente ao completar, cancelamento bloqueia publicação e sessão antiga expira ao concluir. |
| Cache Git persistente | Sobrevive à reabertura do SQLite, distingue chave de HEAD, expira após sete dias, limita a 64 entradas e recusa payload superior a 8 MiB. |
| Restauração com banco disponível | Revalida rascunhos, restaura notas, conserva backup de segurança e invalida a sessão anterior. Executada a função de produção após a confirmação, sem automatizar diálogos. |
| Recuperação de banco indisponível | Instala cópia validada e preserva bytes originais do banco corrompido e dos sidecars em `recovery-*`; nota recuperada conferida. |
| Reassociação de localização | Recusa pasta antiga existente/reaparecida, rascunho, notas no destino e identidade antiga alterada; caminho válido é reassociado em transação, notas antigas ficam preservadas e sessão expira. |
| Comparação Git local/staged | Distingue igual, modificado, staged, modificado após staging e untracked com colchetes no nome; CRLF/LF conta como diferença; filtro obrigatório indisponível não é executado pela comparação. |
| Geometria e rótulos | Segmento com duas pontas fora da tela ainda aparece ao atravessar a área visível; rótulos sobrepostos/fora da área são recusados. |
| Geometria com 85.224 nós | Todos os nós são contabilizados na visão geral; agrupamento gera 154 marcas; seleção fica acima dos grupos; zoom mantém a seleção e retorna exatamente os 42 nós esperados na região. |

O último teste levou **99 ms** e o processo Node registrou pico de RSS de **104.308 KiB** nessa execução. É uma medição isolada de funções geométricas, incluindo criação do índice, e do processo de teste Node; **não mede um frame, a simulação D3, o Canvas, a WebView nem a memória do app desktop**. A legibilidade das 91.745 conexões do exemplo continua sem aceite visual.

Foram corrigidas duas lacunas encontradas ao tornar essas operações testáveis:

- A restauração agora confere novamente o estado de rascunhos depois do diálogo, antes de substituir dados.
- A reassociação verifica novamente a existência da pasta antiga e sua identidade depois da confirmação.

As rotinas internas extraídas são chamadas pelos comandos reais; os testes não mantêm uma cópia alternativa da lógica. Diálogos, ponte IPC da WebView e interação humana seguem fora da cobertura automatizada desta rodada.

Build de produção novamente concluído, etapa Rust em 1 min 01 s e instalador de aproximadamente 4,20 MiB. A instância isolada de validação foi encerrada explicitamente ao terminar as tentativas, sem interação ou edição de dados pela janela.

## Ambiente e método

Windows 11 Home 64 bits, versão 10.0.26100; AMD Ryzen 5 2600. Rust/Cargo 1.96.0, Node 22.22.2, npm 10.9.7, Git 2.49.0.windows.1. Dependências existentes e Cargo offline; nenhuma instalação adicional de dependências foi necessária.

Os testes usam as funções de produção: scanner/resolvedores, transporte, métricas, adaptador Git e SQLite. A gravação/importação de anotações foi separada em funções internas compartilhadas pelos comandos Tauri e testes, mantendo as transações reais. Os testes de utilitários não montam componentes React nem simulam a ponte Tauri.

Foram usados três níveis de evidência:

1. Casos determinísticos com resultados esperados explícitos, incluindo falhas deliberadas.
2. Integração com filesystem, subprocessos Git, CLI e bancos SQLite reais isolados.
3. Compilação/lint e tentativa de execução desktop. O terceiro nível **não substitui** a interação visual bloqueada.

### Isolamento

- Fixtures Rust: `%TEMP%\beckarepo-validation-<caso>-<pid>-<timestamp>`, preservadas para inspeção.
- Fixture para aceite visual: `target/validation/ui-repo`, com histórico Git local, módulos Rust, imports TypeScript, texto, imagem e `.env` sintético excluído do inventário.
- Desktop de validação: `tests/validation.tauri.json`, identidade **com.beckarepo.validation** e janela **BeckaRepo Validation**.
- Confirmado no disco: `%LOCALAPPDATA%\com.beckarepo.validation\beckarepo.sqlite` (73.728 bytes ao verificar). O processo abriu uma janela, mas sua renderização e interações não puderam ser inspecionadas.
- Os testes não abriram nem restauraram o banco de produção `com.beckarepo.app`. Nenhum fork remoto foi necessário: repositórios sintéticos, worktree e clone raso local permitem conhecer os resultados esperados sem executar código de terceiros.

## Matriz por fase

| Fase | Evidência executada | Resultado e limite |
| --- | --- | --- |
| F0 — política e limites | Nomes sensíveis, caixa/separadores, caminhos absolutos/`..`, confinamento, junction apontando para fora da raiz, limite de 500 KiB, 100.000 arquivos aceitos/100.001 recusados, entradas CLI inválidas | **Passou no escopo automatizado.** Symlink de arquivo não pôde ser criado por falta de privilégio Windows; o teste verificou escape por junction. Não certifica todos os limites agregados nem todas as corridas de filesystem. |
| F1 — pipeline e conteúdo | Snapshot sem fontes, prévia Unicode/UTF-8 inválido, revisão alterada, busca paginada/cancelada, leitura de asset, cache incremental, invalidação por configuração, cancelamento, uma repetição após alteração e erro após três tentativas instáveis, sessões expiradas/estrangeiras, páginas IPC por bytes/itens e transição completa do transporte no host | **Passou no escopo automatizado.** Montagem da UI, fluxo IPC completo pela WebView, respostas tardias no cliente e desempenho de desenho não foram exercitados. |
| F2 — persistência | Schema, reabertura, notas/tags/preferência, isolamento por worktree, migração de banco v1 preenchido para v2, conflitos de revisão, importação idempotente/atômica, backup/restauração/recuperação/rotação/reassociação, corrupção/versão futura/view recusadas, rollback, lock e cota SQLite esgotada | **Passou no escopo automatizado.** Operações de restauração/recuperação e reassociação foram executadas em bancos isolados; diálogos e acionamento pela WebView continuam pendentes. Falta de espaço foi simulada por `max_page_count`, sem encher o disco do usuário. |
| F3 — Git | Repositório real com commits conhecidos, renome com espaço/colchetes, frequência/churn, `.git` em arquivo de worktree, clone raso, pasta sem Git, cancelamento/limite de saída, registro binário/sensível/inválido, invalidação, coalteração/autoria, exclusão de commits em massa, cache SQLite por reinício/expiração e comparação local/staged | **Passou no escopo automatizado.** Consulta completa via AppHandle/WebView, exibição e interação ainda precisam de aceite. |
| F4 — estrutura | Graus, PageRank e Brandes em cadeia com valores de referência; componentes cíclicos e autoaresta; projeção com/sem herança; grafo vazio, cancelamento e amostragem em 300 nós | **Passou no escopo automatizado.** Paginação, seleção, camada de coalteração e explicação dos ciclos na janela não foram exercitadas. |
| F5 — parser/resolução | Corpus JS/TS com JSONC, extends, paths, extensão substituída, import/require/re-export, evidências; Rust com targets personalizados, inline, crate/super, biblioteca própria, workspace/alias, ambiguidade, contexto compartilhado e identificador raw; diagnósticos para condições não resolvidas | **Piloto passou no corpus limitado.** Não equivale à resolução completa do compilador. `#[path]`, cfg/macros, símbolos/reexports e dependências externas continuam fora do aceite completo. |

## Resultados numéricos

### F1 — volume de fontes e atualização

Medições da rodada inicial em perfil debug, com outros processos ativos.

| Medida | Resultado |
| --- | ---: |
| Arquivos de texto no corpus | 1.000 |
| Bytes de fontes | 44.003.000 |
| Snapshot JSON serializado | 397.867 bytes |
| Primeira análise | 6.559 ms |
| Atualização sem mudanças | 1.879 ms |
| Relações/resultados reaproveitados | 1.000 arquivos |

O snapshot corresponde a aproximadamente 0,90% dos bytes de fontes desse corpus. Isso comprova ausência de transporte indiscriminado do texto nessa amostra; **não é uma medição do pico de RAM**, de throughput garantido ou do desenho de 85 mil nós. O corpus contém comentários e não representa a densidade de conexões da imagem reportada anteriormente.

### CLI real

| Origem | Arquivos/nós | Arestas | JSON | Tempo observado |
| --- | ---: | ---: | ---: | ---: |
| Fixture local | 9 | 5 | 6.114 bytes | 174 ms |
| Este projeto, inventário selecionado pela política | 89 | 126 | 124.751 bytes | 2.115 ms |

Conferidos schema v2, ausência do campo `content` nas entradas do inventário, exclusão de `.env` e existência de ambas as pontas de todas as arestas. O número de arquivos corresponde à política do scanner, não a todos os arquivos no disco. Estes valores foram capturados antes de concluir a documentação desta rodada.

### F3/F4 — oráculos controlados

- Histórico com renome: frequência 3, churn 2, um renome.
- Coalteração: um par de arquivos com suporte 2 e probabilidade condicional 1,0 na fixture; limite de massa igual a 1 exclui os dois commits.
- Cadeia dirigida `a → b → c`: PageRank aproximado 0,18441678 / 0,34117105 / 0,47441217; soma 1, betweenness normalizada de `b` igual a 0,5.
- Componente de dois nós mais autoaresta: dois componentes cíclicos, caminhos fechados. Modo amostrado em 300 nós: oito origens e resultados finitos.

### F5 — precisão no corpus

| Corpus | Verdadeiros positivos | Falsos positivos | Falsos negativos | Precisão / recall |
| --- | ---: | ---: | ---: | ---: |
| JS/TS: três tipos de aresta estrutural esperados | 3 | 0 | 0 | 1,0 / 1,0 |
| Rust: cinco ligações entre arquivos/targets esperadas | 5 | 0 | 0 | 1,0 / 1,0 |

Contagem por tupla única `(origem, destino, tipo)` no corpus sintético; importações repetidas da mesma tupla são consolidadas. Referências genéricas de arquivos de configuração não entram nessas três categorias JS/TS. São **oito exemplos positivos**, além dos testes negativos e de workspace; não se extrapola precisão de 100% para repositórios arbitrários. Existência de símbolos não foi verificada por compiladores.

## Problemas encontrados e correções

1. **Backups SQLite geravam sidecars fora da retenção.** A cópia herdava modo WAL; sua validação somente leitura criava arquivos `-wal`/`-shm` que não eram contados na rotação. Novos backups passam para `journal_mode=DELETE` antes da validação. O teste gera mais de cinco cópias, protege a origem da restauração e verifica o total de arquivos. Sidecars antigos do usuário não foram removidos.
2. **Pastas com nomes como `__proto__`, `constructor` e `toString` colidiam com propriedades de objetos.** Todos os níveis da árvore agora usam objetos sem protótipo. O teste confere contagem e estrutura desses nomes.
3. **Destaque de código podia interpretar texto como placeholders e tratar marcadores de comentário dentro de strings incorretamente.** A tokenização agora preserva a sequência original, inclusive NUL/Unicode, sem substituição por placeholders. Testes verificam reconstrução exata e strings com URLs.
4. **Estado de imagem e ordenação da árvore precisavam de correção.** Prévia de imagem isolada, captura/liberação de ponteiro e estado de arraste; ordenação copia o array antes de ordenar. ESLint passou. Zoom/pan e mudanças de seleção continuam aguardando teste visual.
5. **Teste de contrato antigo exigia igualdade literal sem campos aditivos.** A comparação foi ajustada para aceitar `parsing`/`evidence`, mantendo a verificação dos valores padrão e do restante do contrato. Expectativas iniciais que confundiam referências de configuração com imports também foram corrigidas; não foi alterada a análise para satisfazer uma expectativa incorreta.

## Como reproduzir

Na raiz, no terminal PowerShell do VS Code:

```powershell
.\tests\run-validation.ps1 -Build
```

O script interrompe em erro, grava logs em `target/validation/latest` e executa:

```powershell
cargo fmt --all -- --check
cargo test --workspace --offline -- --nocapture
node --test tests/ui-utils.test.mjs
npm run lint
npm run build
```

As fixtures e bancos temporários são recriados por execução. A suíte requer dependências Cargo já disponíveis para `--offline`. O script não executa instalação do pacote nem aceite visual. Não muda política de execução do PowerShell.

A verificação `git diff --check` considerando CRLF passou nos arquivos rastreados; não cobre arquivos ainda não rastreados. Formatação Rust foi verificada em todo o workspace.

### Artefatos de produção

- Executável: `target/release/beckarepo.exe`.
- Instalador: `target/release/bundle/nsis/BeckaRepo_1.1.0_x64-setup.exe`.
- `beckarepo.exe` (19596800 bytes), SHA-256 `1753abac1696437c98e4a7d9172a26926971c3b8c47655670b6ebf5c6d5b95a6`.
- `BeckaRepo_1.1.0_x64-setup.exe` (4402740 bytes), SHA-256 `a54b5ee95484e068579af45eef127b3ee2c87c4b2030827f52ba690204a9407c`.
- Configuração normal de produção (`com.beckarepo.app`); a identidade isolada foi usada somente no lançamento de validação.
- Avisos não bloqueantes do build inicial: identificador terminado em `.app` não recomendado no macOS e tempo elevado em plugin de resolução do Vite. Build release Rust inicial concluído em 1 min 24 s; não houve falha na geração do pacote. A continuação também concluiu o build, conforme seu log próprio acima.

## Pendências para liberar a próxima etapa

1. Abrir a versão isolada com `npm run tauri -- dev --config tests/validation.tauri.json --no-watch` e selecionar um repositório de testes local com histórico Git.
2. Confirmar inicialização sem erro de render, árvore/grafo/seleção, busca por `needle`, prévia de código e imagem com zoom/arraste.
3. Salvar nota/tag e preferência; fechar/reabrir normalmente; conferir persistência e proteção de rascunhos.
4. Exercitar histórico Git, hotspots, coalteração, ciclos/métricas e evidências F5 na janela, inclusive filtros/paginação/cancelamento.
5. Validar os diálogos e o acionamento pela interface de restauração, recuperação, reassociação, comparação local/staged e cache Git. As operações internas desses cenários já passaram na continuação automatizada.
6. Medir pico de memória, latência e legibilidade/frame no grafo denso real. O corpus de 1.000 textos e o limite de 100.000 entradas não validam a renderização do cenário de 85.224 arquivos.

Instalação em máquina limpa, colisões adversariais extensas, todos os tetos agregados, permissões de filesystem e mudanças concorrentes sob carga continuam fora desta rodada. As pendências de produto já listadas no roadmap não são marcadas como concluídas por testes de um subconjunto.

### Próxima implementação preparada: F5, atributos Rust `#[path]`

Após fechar os pontos de aceite acima, a próxima entrega deve:

- Extrair o atributo pelo AST e armazenar seu caminho no resumo compacto de declarações, sem reter fonte/árvore sintática.
- Resolver em `rust_modules.rs` considerando raiz, arquivo comum, `mod.rs` e escopo inline; normalizar e exigir destino dentro do inventário autorizado.
- Diagnosticar caminho absoluto/escape, destino ausente, atributos conflitantes e `cfg_attr` sem avaliação; não inventar associações.
- Cobrir módulos aninhados, targets compartilhados com resoluções divergentes, caracteres especiais, mudanças no atributo e invalidação de cache.
- Incrementar a versão do cache sintático e acrescentar corpus com destinos exatos esperados, antes de iniciar F6 (entidades de pacotes externos/lockfiles).

Esse é o plano de continuação; `#[path]` e F6 **não foram implementados nesta validação**.
