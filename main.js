import { app, BrowserWindow, nativeTheme } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// Correção para ES Modules no Node
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Verifica se estamos em modo de desenvolvimento (Vite) ou produção (Compilado)
const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
nativeTheme.themeSource = 'dark'; // Força o tema escuro para manter a estética consistente
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'BeckaRepo',
    icon: path.join(__dirname, 'public', 'icon.png'),
    backgroundColor: '#050810', // Mantém a estética escura enquanto carrega
    autoHideMenuBar: true,      // Esconde aquela barra chata do Windows (Arquivo, Editar...)
    titleBarOverlay: {
      color: '#020408', // Cor de fundo da barra
      symbolColor: '#f0e6ff', // Cor dos ícones (fechar, minimizar)
      height: 35
    },
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  if (isDev) {
    // Em desenvolvimento, o Electron abre o localhost do Vite
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // Em produção (no .exe), ele lê o HTML gerado na pasta dist
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// Quando o Electron estiver pronto, abra a janela
app.whenReady().then(createWindow);

// No Windows/Linux, fechar todas as janelas encerra o programa
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Tratamento para MacOS
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});