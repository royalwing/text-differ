const { app, BrowserWindow } = require('electron');
const path = require('path');
const { startServer } = require('./server');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    // icon: path.join(__dirname, 'public/favicon.ico') 
  });

  // Construct argv for server.js (which expects [node, script, ...args])
  // In packaged app: process.argv = ['path/to/exe', 'arg1', 'arg2'] -> we want ['arg1', 'arg2']
  // In dev: process.argv = ['path/to/electron', 'path/to/main.js', 'arg1'] -> we want ['arg1']
  
  const realArgs = app.isPackaged 
    ? process.argv.slice(1) 
    : process.argv.slice(2);
  
  const serverArgv = ['node', 'server.js', ...realArgs];

  const server = startServer(0, serverArgv);
  const port = server.address().port;

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
