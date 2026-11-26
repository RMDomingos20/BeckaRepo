# F2 — Persistência local e anotações

Implementação de 26/10/2026. Compilação e análise estática estão registradas em [VALIDACAO.md](VALIDACAO.md); os fluxos interativos e de falha ainda precisam de validação de execução.

## Como usar

1. Abra a pasta com `npm run dev` ou pelo executável.
2. Selecione um arquivo e abra **Visão geral → Tags e notas**. Adicione tags, escreva a nota e clique em **Salvar**.
3. Rascunhos permanecem ao trocar de arquivo ou aba. A faixa **Rascunhos** permite voltar aos arquivos editados. Antes de atualizar, trocar de pasta ou fechar a janela, salve ou descarte esses rascunhos.
4. **Configurações → Dados locais** mostra o caminho do banco e permite criar/restaurar backups. Essas configurações também estão disponíveis na tela inicial.
5. **Atualizar** reconcilia o inventário da pasta e reaproveita relações que continuam válidas. A seleção do arquivo é conservada se ele ainda existir.

Os rascunhos ficam em memória até salvar. Encerrar o processo à força, recarregar a WebView ou uma falha do sistema pode perdê-los. A proteção de fechamento normal depende da notificação de estado enviada pela interface.

## Banco e identidade

- `rusqlite 0.38`, SQLite compilado junto com o aplicativo (`bundled`); não exige Java nem instalação separada do SQLite.
- `beckarepo.sqlite` no `app_local_data_dir` fornecido pelo Tauri. No Windows, normalmente `%LOCALAPPDATA%\com.beckarepo.app\beckarepo.sqlite`. O caminho efetivo aparece nas configurações. Não é gravado automaticamente na pasta analisada.
- Schema 2 após a continuação de F3, identificado por `application_id`, `user_version` e `schema_migrations`. Criação e migração 1 → 2 são transacionais; versões superiores são recusadas. O backup de inicialização precede a migração; backups v1/v2 são aceitos na restauração.
- IDs aleatórios persistentes de 128 bits para repositório e worktree; `locations` associa o caminho canônico à worktree. Anotações usam `(worktree_id, path)`.
- Cada localização nova começa com sua própria identidade de anotações. F3 associa identidades Git em tabelas separadas, sem fundir notas/tags. Reassociação explícita de pasta movida está disponível em Dados locais, com confirmação, backup e restrições descritas em F3. Substituir o conteúdo de uma pasta no mesmo caminho mantém sua identidade; não há fingerprint que reconheça essa troca.
- Tabelas: `repositories`, `worktrees`, `locations`, `annotations`, `tags`, `annotation_tags`, `preferences`, `imports` e `schema_migrations`.
- Fontes, resultados de busca e grafos não são gravados no SQLite. Cache de relações permanece na sessão em RAM. F3 acrescenta `git_repositories`, `git_worktrees`, `git_scopes` e `git_cache`, com cache de metadados Git limitado e regenerável, separado das anotações. Ver [F3](ETAPA_F3.md).
- Preferências persistidas: idioma e visibilidade dos painéis de árvore/detalhes. Larguras, filtros e posições do grafo ainda não são persistidos.

Gravações de notas conferem uma revisão numérica antes de atualizar, dentro de transação. Conflito retorna erro e conserva o rascunho. **Recarregar dados salvos** atualiza a versão salva sem descartar o rascunho; copie o texto que deseja conservar antes de descartar e reaplicar alterações conflitantes. Notas de arquivos removidos permanecem no banco, embora ainda não exista uma tela para consultar essas notas órfãs.

## Importação

O hook importa automaticamente a chave LocalStorage `beckarepo_tags_<raiz canônica>` correspondente à pasta atual. O idioma anterior também é importado se ainda não houver preferência no banco. A origem é mantida; não há limpeza automática do LocalStorage.

Para dados de versões que usavam só o nome da pasta, ou dados do antigo Electron, exporte o mapa de anotações para JSON e use **Configurações → Importar notas JSON**, com a pasta de destino aberta. Não é lido automaticamente o perfil do Electron. Formato:

```json
{
  "src/main.rs": {
    "tags": ["entrada", "revisar"],
    "note": "Conferir o fluxo de inicialização."
  }
}
```

- Máximo de 4 MiB de JSON e 2.000 entradas por importação.
- Caminhos relativos normalizados; caminhos sensíveis, absolutos ou com `..` são recusados.
- Nota até 64 KiB UTF-8; até 32 tags distintas, cada uma com até 80 bytes UTF-8. Tags vazias, controles e espaços nas extremidades são recusados.
- Validação ocorre antes da transação. Dados existentes são preservados; a importação só preenche entradas ausentes.
- Registro de importação e anotações são confirmados no mesmo commit. Importação manual é identificada por SHA-256 do JSON; repetir o mesmo conteúdo não duplica os dados.
- JSON inválido não impede carregar as anotações já salvas; a falha de importação fica visível no painel.

## Backups, recuperação e limites

- Cópias consistentes usam a [API de backup do SQLite via rusqlite](https://docs.rs/rusqlite/0.38.0/rusqlite/backup/index.html), com passos limitados e prazo cooperativo de 30 segundos entre passos.
- Um backup é feito na inicialização, antes de novas edições; o botão cria uma cópia do estado salvo atual. Rascunhos não entram no backup.
- Retenção de cinco arquivos `backups/beckarepo-<timestamp>.sqlite`, no diretório de dados do app. A origem de uma restauração é protegida durante a rotação. Para proteção contra perda do disco, copie um backup para outro dispositivo.
- A restauração solicita um arquivo e confirmação, valida identidade, versão, integridade, referências e tabelas, e cria backup de segurança antes da substituição. Fecha a sessão do repositório e recarrega a interface ao concluir.
- Se o banco não pôde ser aberto, a recuperação primeiro prepara e valida uma cópia do backup, preserva o banco original e seus sidecars em `recovery-<timestamp>/` e instala a cópia. Falhas de movimentação informam os caminhos preservados. Esses diretórios de recuperação não são removidos pela retenção e podem precisar de limpeza manual após conferir os dados.
- WAL, chaves estrangeiras, sincronização `FULL`, espera por lock de 2 segundos e teto aproximado de 256 MiB para páginas do banco. Backups de entrada têm teto de 256 MiB. Arquivos WAL, backups, índices e buffers têm custos adicionais: esse teto não é uma cota total de disco/RAM.
- Disco cheio, lock e corrupção retornam erro; não há confirmação de salvamento antes do commit. Falha na inicialização da persistência permite continuar a análise do grafo, com aviso e anotações indisponíveis.
- O banco e seus backups não são criptografados. A política de nomes sensíveis aplicada ao scanner não inspeciona o texto escrito manualmente nas notas.

## Próximos trabalhos

Validar reinício, importação repetida, cancelamento, mudança de arquivo, conflitos, locks, disco cheio, restauração e reassociação na janela. A associação de identidades Git de F3 já está implementada. Continuam pendentes consulta de notas órfãs, medições de memória e validação de instalação em máquina limpa.
