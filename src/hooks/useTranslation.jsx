import { palette } from '../styles/theme.js';
import { createContext, useContext, useCallback, useLayoutEffect, useMemo } from 'react';
import { usePreferences } from './usePreferences.js';
import { roadmapStrings } from '../utils/roadmapStrings.js';
import { gitStrings } from '../utils/gitStrings.js';
import { graphStrings } from '../utils/graphStrings.js';
import { insightStrings } from '../utils/insightStrings.js';

const DICTIONARY = {
  pt: {
    ...roadmapStrings.pt,
    ...gitStrings.pt,
    ...graphStrings.pt,
    ...insightStrings.pt,
    content_loading: "Carregando conteúdo…",
    content_changed: "O arquivo mudou desde a análise. Use Atualizar para reconciliar o grafo e o conteúdo.",
    content_large: "Conteúdo acima do limite de 500 KiB.",
    search_running: "Buscando…",
    search_results: "Resultados:",
    search_scanned: "Arquivos percorridos:",
    search_coverage: "Textos pesquisados:",
    search_skipped: "Sem pesquisa textual:",
    search_changed: "Alterados:",
    search_unreadable: "Falhas de leitura:",
    search_more: "Carregar mais resultados",
    search_cap: "Limite de 2.000 resultados. Refine a busca para continuar.",
    search_failed: "Não foi possível concluir a busca:",
    desktop_required: "Abra pelo terminal com npm run dev para usar o aplicativo desktop.",
    load_cancel: "Cancelar",
    load_warnings: "Avisos da análise:",
    // RepoVisualizer (Telas Globais)
    drop_title: "BECKAREPO",
    drop_sub: "Explore arquivos, dependências e conexões.",
    drop_drag: "Solte para analisar",
    drop_hint: "Solte sua pasta aqui ou selecione manualmente.",
    drop_btn: "Selecionar pasta",
    load_title: "Analisando repositório",
    load_empty: "Nenhum arquivo compatível foi encontrado nesta pasta.",
    load_error: "Não foi possível analisar o repositório.",
    load_filter: "Filtrando arquivos...",
    load_read: "Lendo arquivos",
    load_map: "Mapeando conexões...",
    
    // Header & Views
    hdr_files: "arqs",
    hdr_edges: "conexões",
    hdr_search: "Buscar arquivo...",
    hdr_incode: "Buscar no conteúdo...",
    hdr_map: "Exportar",
    hdr_guide: "Guia",
    hdr_swap: "Trocar",
    view_tree: "árvore",
    view_global: "grafo global",
    view_term: "grafo termo",

    // Placeholders & Sidebar
    tree_explorer: "Explorador",
    tree_filtered: "filtrado",
    empty_term_1: "Nenhum arquivo contém",
    empty_term_2: "Tente outro termo.",
    term_active: "Termo buscado",
    term_in: "Em",
    term_files: "arquivo(s)",

    // Configurações
    cfg_title: "Configurações",
    cfg_lang: "Idioma / Language",
    cfg_close: "Fechar",

    // FilePanel (Painel Lateral)
    fp_empty: "Selecione um arquivo",
    fp_tab_overview: "visão geral",
    fp_tab_code: "código/conteúdo",
    fp_tab_graph: "grafo local",
    fp_size: "Tamanho",
    fp_imports: "Importa",
    fp_importedBy: "Usado Por",
    fp_coupling: "Acoplamento",
    fp_unavailable: "Conteúdo indisponível (Arquivo não lido em RAM ou grande demais)",
    fp_img_hint: "Scroll: Zoom · Drag: Pan",

    // Clustering & Filters
    cf_title: "Conexões",
    cf_all: "Todos",
    cc_title: "Clusters",
    cc_folder: "Pasta",
    cc_semantic: "Arquitetura",
    cc_modules: "Módulos",
    cc_type: "Tipo",
    cc_hulls: "Mostrar grupos",
    cc_isolate_all: "-- Ver Todo o Grafo --",
    cc_isolate: "Isolar:",

    // Context Menu
    ctx_file: "Ações do Arquivo",
    ctx_copy: "Copiar caminho",
    ctx_iso_cluster: "Isolar grupo",
    ctx_inspect: "Inspecionar arquivo",
    ctx_global: "Visão Global",
    ctx_show_all: "Mostrar grafo completo",
    ctx_toggle_hulls: "Alternar grupos",
    ctx_export: "Exportar Markdown",

},
  en: {
    ...roadmapStrings.en,
    ...gitStrings.en,
    ...graphStrings.en,
    ...insightStrings.en,
    content_loading: "Loading content…",
    content_changed: "The file changed since analysis. Reopen the repository to update its graph and content.",
    content_large: "Content exceeds the 500 KiB limit.",
    search_running: "Searching…",
    search_results: "Results:",
    search_scanned: "Files scanned:",
    search_coverage: "Texts searched:",
    search_skipped: "Without text search:",
    search_changed: "Changed:",
    search_unreadable: "Read failures:",
    search_more: "Load more results",
    search_cap: "2,000 result limit. Refine the search to continue.",
    search_failed: "Search could not be completed:",
    desktop_required: "Run npm run dev in the terminal to use the desktop app.",
    load_cancel: "Cancel",
    load_warnings: "Analysis warnings:",
    load_empty: "No supported files were found in this folder.",
    load_error: "Unable to analyze the repository.",
    // RepoVisualizer (Global Screens)
    drop_title: "BECKAREPO",
    drop_sub: "Explore files, dependencies and connections.",
    drop_drag: "Drop to analyze",
    drop_hint: "Drop your folder here or select manually.",
    drop_btn: "Select folder",
    load_title: "Analyzing repository",
    load_filter: "Filtering files...",
    load_read: "Reading files",
    load_map: "Mapping connections...",
    
    // Header & Views
    hdr_files: "files",
    hdr_edges: "edges",
    hdr_search: "Search files...",
    hdr_incode: "Search content...",
    hdr_map: "Export",
    hdr_guide: "Guide",
    hdr_swap: "Switch",
    view_tree: "tree",
    view_global: "global graph",
    view_term: "term graph",

    // Placeholders & Sidebar
    tree_explorer: "Explorer",
    tree_filtered: "filtered",
    empty_term_1: "No files contain",
    empty_term_2: "Try another term.",
    term_active: "Search term",
    term_in: "In",
    term_files: "file(s)",

    // Settings
    cfg_title: "Settings",
    cfg_lang: "Language / Idioma",
    cfg_close: "Close",

    // FilePanel (Sidebar)
    fp_empty: "Select a file",
    fp_tab_overview: "overview",
    fp_tab_code: "code/content",
    fp_tab_graph: "local graph",
    fp_size: "Size",
    fp_imports: "Imports",
    fp_importedBy: "Used By",
    fp_coupling: "Coupling",
    fp_unavailable: "Content unavailable (Not read in RAM or too large)",
    fp_img_hint: "Scroll: Zoom · Drag: Pan",

    // Clustering & Filters
    cf_title: "Connections",
    cf_all: "ALL",
    cc_title: "Clusters",
    cc_folder: "Folder",
    cc_semantic: "Architecture",
    cc_modules: "Modules",
    cc_type: "Type",
    cc_hulls: "Show groups",
    cc_isolate_all: "-- View Entire Graph --",
    cc_isolate: "Isolate:",

    // Context Menu
    ctx_file: "File Actions",
    ctx_copy: "Copy path",
    ctx_iso_cluster: "Isolate group",
    ctx_inspect: "Inspect file",
    ctx_global: "Global View",
    ctx_show_all: "Show entire graph",
    ctx_toggle_hulls: "Toggle groups",
    ctx_export: "Export Markdown",

}
};

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const settings = usePreferences();
  const colors = useMemo(() => palette(settings.preferences.accent), [settings.preferences.accent]);
  const density = settings.preferences.density === 'compact' ? 'compact' : 'comfortable';
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [key, color] of Object.entries(colors)) root.style.setProperty('--' + key, color);
    root.dataset.density = density;
  }, [colors, density]);
  const lang = settings.preferences.language === 'en' ? 'en' : 'pt';
  const setLang = value => settings.setPreference('language', value);

  const t = useCallback((key) => {
    if (!DICTIONARY[lang]) return key;
    return DICTIONARY[lang][key] || key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, colors, density, ...settings }}>
      {children}
    </LanguageContext.Provider>
  );
}

// The provider and hook intentionally share the existing public module.
// eslint-disable-next-line react-refresh/only-export-components
export const useTranslation = () => useContext(LanguageContext);
