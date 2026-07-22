const { app, BrowserWindow } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = true;

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    title: 'Trading Journal',
    backgroundColor: '#0a0e1a',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setTitle('Trading Journal');

  if (isDev) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, '../build/index.html'));
  }
}

autoUpdater.on('update-downloaded', () => {
  log.info('Update downloaded; will install on quit.');
  autoUpdater.quitAndInstall(false, true);
});

autoUpdater.on('error', (err) => {
  log.error('Auto-updater error:', err);
});

app.whenReady().then(() => {
  createWindow();

  // Check for updates 5s after launch (production only)
  if (!isDev) {
    setTimeout(() => {
      log.info('Checking for updates...');
      autoUpdater.checkForUpdates();
    }, 5000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
