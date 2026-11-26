# Direção visual

Interface de ferramenta de trabalho: superfícies cinza, separadores discretos, texto legível e cores associadas a informação.

- `src/styles/theme.js`: tokens compartilhados dos painéis e controles.
- `src/styles/app.css`: controles, foco de teclado, barras de rolagem e redução de movimento.
- Fonte de sistema na interface; JetBrains Mono local apenas para código.
- Tela inicial com marca estática, descrição curta e ação principal. Foram removidos rede decorativa animada, física do logotipo, gradientes luminosos e sombras neon.
- Grafos mantêm cores por categoria em uma paleta menos saturada. Seleção e resultado de busca continuam distintos.
- Toolbar pode quebrar linhas; modais respeitam a área disponível. Textos dos controles pequenos receberam um piso de 11 px. A interface continua orientada ao desktop.

Próximas etapas: componentes compartilhados de botão/campo/modal, migração completa dos estilos inline para CSS, navegação por teclado da árvore e do grafo, contraste medido, redimensionamento observável do Canvas, legendas consistentes e revisão integral dos textos em português/inglês. Tipografia e acessibilidade devem ser avaliadas também no aplicativo Tauri empacotado.
