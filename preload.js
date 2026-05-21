const { contextBridge, ipcRenderer } = require('electron');

// Expõe APIs seguras para o processo de renderização (React)
contextBridge.exposeInMainWorld('electronAPI', {
  // Enviar mensagens do React para o Main (Unidirecional)
  send: (channel, data) => {
    let validChannels = ['app-close', 'minimize-window']; // Canais permitidos
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  
  // Receber mensagens do Main no React
  on: (channel, func) => {
    let validChannels = ['repo-analysed', 'load-progress'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },

  // Pedir algo ao Main e esperar resposta (Assíncrono/Invoke)
  invoke: async (channel, data) => {
    let validChannels = ['open-directory-dialog', 'read-file-content'];
    if (validChannels.includes(channel)) {
      return await ipcRenderer.invoke(channel, data);
    }
  }
});