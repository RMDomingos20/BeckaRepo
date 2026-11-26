# Abertura do Gaby-CMU e navegação no grafo

O conjunto de medição contém 85.224 arquivos e 91.744 conexões. Os ensaios leram a pasta do usuário.

## Motor Rust

O exemplo `profile_scan` mede a varredura com o perfil release. A compilação, a serialização do snapshot, o transporte para a WebView e a renderização ficam fora do cronômetro de varredura. É possível repetir a medição no terminal com:

```powershell
cargo run --release --offline -p beckarepo-core --example profile_scan -- "D:\caminho\do\repositorio"
```

| Etapa (segundos) | Versão intermediária | Versão final |
| --- | ---: | ---: |
| Inventário | 44,36 | 37,43 |
| Leitura e índice | 7,60 | 39,95 |
| Extração de conexões | 262,85 | 149,50 |
| Conferência de revisões | 36,40 | 9,11 |
| **Total** | **351,21** | **235,99** |

Os dois executáveis rodaram em sequência, na mesma pasta, na sessão normal do Windows. A versão intermediária já evitava buscas por nomes inexistentes. A final também compartilha o conjunto de caminhos entre resolvedores e confere revisões em lotes com até quatro tarefas simultâneas. A reabertura incremental reutiliza o índice quando ele segue válido.

O segundo ensaio levou 32,8% menos tempo. A conferência de revisões teve redução de 75%. Cada medição teve uma única passagem, sem controle do cache de disco. Havia outros trabalhos de compilação e leitura na máquina durante parte do ensaio. A variação nas fases de leitura e extração impede atribuir toda a diferença à alteração de código. Em outra dupla de execuções sob o sandbox, os respectivos totais foram 516,22 s e 408,96 s.

Medições anteriores de 31/10, em segundos, com 85.224 arquivos, 91.744 conexões e snapshots de 89.381.332 bytes em ambas as execuções.

| Execução | Inventário | Leitura | Análise | Conferência | Varredura total | Serialização |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Antes | 49,64 | 9,01 | 31,51 | 51,62 | 141,77 | 0,29 |
| Depois | 24,19 | 6,6 | 26,5 | 22,01 | 79,3 | 0,18 |

As quatro varreduras recentes produziram 85.224 arquivos, 91.744 arestas, zero avisos e a mesma assinatura das arestas ordenadas (`cb2308b63c9d8a13`). A extração continua sendo a etapa mais demorada nessa pasta.

## Interface e manual

Na janela **BeckaRepo Validation**, com o banco de testes e o mesmo comando de desenvolvimento do projeto, o seletor do Windows abriu o Gaby-CMU. A interface passou por leitura, mapeamento e transferência até exibir a árvore com **85.224 arquivos e 91.744 conexões**. Em 25/11, havia um marco de tempo às 18h16min32s, antes do clique de abertura, e a árvore já estava visível às 18h21min13s. Isso dá um limite superior de **4min41s** para essa abertura. O ensaio incluiu o processo Rust, o IPC real e a WebView. O estado do cache do Windows pode afetar novas aberturas.

Na mesma sessão, decorreram **2,0 s** entre o clique em **grafo global** e a observação do contador de 85.224 arquivos na área. Galáxia mostrou 214 grupos por proximidade. Após selecionar Atlas, a janela mostrou os mesmos arquivos em 584 grupos. Nas duas disposições, o modo automático desenhou 1.200 das 91.744 conexões elegíveis na área. O limite mantém os detalhes acessíveis por zoom e seleção.

No Edge, o teste abriu a interface compilada com o snapshot real e uma implementação local de teste dos comandos Tauri. A árvore ficou disponível em cerca de 2,1 s depois do clique, com os dados previamente analisados. Foram exercitados Galáxia, Atlas, Pastas e Livre e a abertura do Guia em português. Um grafo pequeno também exercitou Atlas, Clássico, retorno a Arquivos e o Guia em inglês.

Galáxia e Atlas calculam posições estáveis. O modo Livre continua usando um Worker para a simulação. A galáxia prioriza vizinhos distintos e dá peso duplo a entradas. Os filtros alteram a conectividade considerada. O atlas separa os grupos por área e ordena os arquivos por caminho. O guia do aplicativo e o README descrevem as escolhas e os símbolos.

## Verificações

Passaram os 63 testes Rust, os 19 testes JavaScript, o lint e a compilação do instalador Windows x64. Os testes cobrem a política de arquivos, as revisões, o cancelamento, os limites, os cursores do transporte e a integridade das relações. Os novos casos verificam a posição relativa de arquivos centrais e isolados e a separação de grupos no atlas.
