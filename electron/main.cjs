// Desktop wrapper for the Steam build. Loads the single-file web build.
// Build first: `npm run build:single`, then `npx electron electron/main.cjs` (or package with electron-builder).
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function create() {
  const win = new BrowserWindow({
    width: 1920, height: 1080, minWidth: 960, minHeight: 540,
    backgroundColor: '#07060d', autoHideMenuBar: true, show: false,
    title: '秒针 SECOND HAND',
    webPreferences: { contextIsolation: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'dist-single', 'index.html'));
  win.once('ready-to-show', () => { win.show(); win.setFullScreen(true); });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.alt && input.key === 'Enter'))) win.setFullScreen(!win.isFullScreen());
  });
}
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
