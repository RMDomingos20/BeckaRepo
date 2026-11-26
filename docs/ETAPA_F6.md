# F6 — Dependências externas

Entrega implementada em 29/10, consolidada em 30/10/2026. A fase abrange leitores locais, entidades e relações de pacotes, consulta de consumidores e visualização. Não executa gerenciadores de pacotes, scripts ou downloads.

## Cobertura

- npm: package.json, dependências normais/dev/opcionais/peer, aliases npm, subpaths de imports, caminhos locais e workspaces explícitos. package-lock.json e npm-shrinkwrap.json v2/v3 fornecem versões e relações entre localizações instaladas. Uma declaração divergente do lock não recebe versão resolvida.
- Cargo: Cargo.toml, nomes renomeados, categorias normal/dev/build/target/opcional e herança de workspace.dependencies em membros explícitos. Cargo.lock v3/v4 é interpretado separadamente. Associação de versão declarada usa candidato único de crates.io compatível com semver. Git, registry customizado, patch/replace e condições não avaliadas não recebem resolução inventada.
- Maven: dependências diretas de pom.xml, grupo/artefato/tipo/classificador, escopo e versão declarada. dependencyManagement, parent/BOM, profiles, interpolação de propriedades e associação entre imports Java e artefatos não são avaliados. DTD e entidades são recusados.
- Yarn/pnpm e versões de lockfile fora da cobertura produzem diagnóstico. Ausência de versão resolvida não significa ausência de declaração.

## Contrato e interface

`AnalysisResult.packages` é aditivo ao contrato v1, com nodes, edges e diagnósticos. O grafo de arquivos, contagem de arquivos, árvore e métricas F4 continuam representando arquivos. Pacotes têm identidade por ecossistema, manifest, categoria e alias; registros de lock têm identidade própria para distinguir múltiplas versões/localizações.

Relações: `declares` (manifest → declaração), `imports-package` (fonte → declaração, com linha/bytes), `resolves-to` (declaração → registro observado no lock) e `lock-dependency` (entre registros do lock). Declarar um pacote não cria consumidores. Transitividade do lock não demonstra uso em execução.

O desktop transfere as três novas seções em lotes com os limites anteriores de 256 itens/256 KiB. A publicação continua atômica após todas as sete seções. Respostas legadas sem packages permanecem legíveis. A interface **análises → Dependências externas** oferece filtros de nome/manifest, ecossistema, estado e categoria, páginas de 20, consumidores diretos/impacto indireto e evidências. Uma vizinhança limitada a 12 relações usa retângulos para pacotes e círculos para arquivos; a lista completa é paginada.

## Política, cache e limites

Lockfiles são lidos por uma passagem dedicada e não entram como código, arquivos pesquisáveis ou nós comuns. Aplicam-se confinamento, nomes sensíveis, revisão antes/depois da leitura e reconciliação final. `packages/` deixa de ser exclusão genérica, pois pode conter fontes de monorepos; node_modules, target, diretórios gerados e exclusões sensíveis continuam bloqueados.

Metadados: menos de 500 KiB por arquivo, 512 documentos e 32 MiB agregados de entrada; 20 mil nós e 100 mil relações de pacotes; 64 MiB serializados de saída; 128 diagnósticos de até 1.024 caracteres, com contagem dos omitidos. São orçamentos de dados, não limites exatos de RAM. O parser XML limita profundidade a 64. Cancelamento é cooperativo entre documentos, lotes e fontes.

Metadados de pacotes são reconstruídos em cada análise; fatos de imports derivados do parser são reaproveitados pelo cache. Mudança somente no lockfile atualiza versões/relações mesmo quando nenhum fonte precisa ser reanalisado. Sem cache de fontes/ASTs e sem migração SQLite. quick-xml 0.42.0 e semver passam a dependências diretas do núcleo; ambas já existiam no lockfile.

## Validação e continuação

55 testes Rust e 7 JavaScript passaram, incluindo oito testes específicos de F6, transferência completa com pacotes, contratos legados e consulta de impacto com ciclos. ESLint, formatação e build completo passaram. Na janela nativa isolada foram conferidos lista, alias/versões, duas páginas de 28 declarações e zero consumidores para pacote sem import. A navegação automática para o detalhe recebeu um ajuste posterior, incluído na rodada de F7.

Build Windows NSIS 1.1.0, aproximadamente 4,27 MiB, gerado sem instalação. Casos visuais ainda não observados não são aprovados implicitamente pelos testes automatizados.

Esta entrega fecha EXT-01 a EXT-04 para a cobertura explicitada acima. Resolução completa de todos os gerenciadores e compiladores permanece fora desse escopo. F7 foi autorizada pelo usuário em 30/10 e começa pelos símbolos sob demanda e complexidade por função.

Referências: [npm package-lock](https://docs.npmjs.com/files/package-lock.json/), [manifest Cargo](https://doc.rust-lang.org/cargo/reference/manifest.html), [POM Maven](https://maven.apache.org/pom.html).
