// What the panel page may ask of its window: the colors of the Windows buttons.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  setTheme: (theme) => ipcRenderer.send('theme', theme === 'dark' ? 'dark' : 'light'),
})
