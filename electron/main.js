const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const { app, BrowserWindow, shell, Tray, Menu, ipcMain } = require('electron');

const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

let staticServer;
let tray;
let mainWindow;
const iconFileName = process.platform === 'win32' ? 'radiolla_icon.ico' : 'radiolla_icon.png';
const STATIC_HOST = '127.0.0.1';
const STATIC_PORT = 19573;

// Window state persistence
const getWindowStatePath = () => path.join(app.getPath('userData'), 'window-state.json');

const loadWindowState = () => {
  try {
    const data = fs.readFileSync(getWindowStatePath(), 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
};

const saveWindowState = (win) => {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const state = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save window state', err);
  }
};

const startStaticServer = (rootDir) =>
  new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const { pathname = '/' } = url.parse(req.url);
      const cleanedPath = decodeURIComponent(pathname.replace(/^\/+/, ''));
      const targetPath = path.normalize(path.join(rootDir, cleanedPath || 'index.html'));

      // Prevent path traversal outside of the web build directory.
      if (!targetPath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      let filePath = targetPath;

      try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }
      } catch {
        // Defer to readFile handler for 404.
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        res.end(data);
      });
    });

    const finish = () => {
      server.off('error', handleError);
      server.off('listening', finish);
      const { port } = server.address();
      resolve({ server, url: `http://${STATIC_HOST}:${port}` });
    };

    const handleError = (err) => {
      if (err.code === 'EADDRINUSE') {
        // Keep a stable origin for persisted storage; fall back only if the preferred port is busy.
        server.close(() => server.listen(0, STATIC_HOST));
        return;
      }
      reject(err);
    };

    server.on('error', handleError);
    server.on('listening', finish);
    server.listen(STATIC_PORT, STATIC_HOST);
  });

const ensureStaticServer = async (rootDir) => {
  if (staticServer) return staticServer;
  staticServer = await startStaticServer(rootDir);
  return staticServer;
};

const stopStaticServer = () => {
  if (staticServer?.server) {
    staticServer.server.close();
    staticServer = undefined;
  }
};

const createTray = (win) => {
  if (tray) return tray;
  const iconPath = path.join(__dirname, '..', 'assets', iconFileName);
  tray = new Tray(iconPath);
  tray.setToolTip('Radiolla');
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (!win.isDestroyed()) {
          win.show();
          win.focus();
        }
      },
    },
    {
      label: 'Play',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('playback-control', 'play');
        }
      }
    },
    {
      label: 'Mute',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('playback-control', 'mute');
        }
      }
    },
    {
      label: 'Stop',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('playback-control', 'stop');
        }
      }
    },
    {
      label: 'Always on top',
      type: 'checkbox',
      checked: win.isAlwaysOnTop(),
      click: (menuItem) => {
        if (win.isDestroyed()) return;
        win.setAlwaysOnTop(menuItem.checked);
      },
    },
    {
      label: 'Quit',
      click: () => {
        stopStaticServer();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });
  return tray;
};

const createWindow = async () => {
  const savedState = loadWindowState();

  // Create main window but keep it hidden initially
  const win = new BrowserWindow({
    width: savedState?.width || 390,
    height: savedState?.height || 600,
    x: savedState?.x,
    y: savedState?.y,
    maxHeight: 600,
    title: 'Radiolla',
    icon: path.join(__dirname, '..', 'assets', iconFileName),
    show: false, // Don't show until ready
    backgroundColor: '#0f1220', // Match app dark background to avoid white flash
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });
  mainWindow = win;

  // Save window state on move/resize
  win.on('moved', () => saveWindowState(win));
  win.on('resized', () => saveWindowState(win));

  // Remove the default menu bar from the main window.
  win.setMenu(null);
  win.setMenuBarVisibility(false);

  win.on('minimize', (event) => {
    event.preventDefault();
    win.hide();
  });

  win.on('close', (event) => {
    // Keep the app running in tray unless quitting explicitly.
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });

  const loadMainContent = async () => {
    try {
      const distPath = path.join(__dirname, '..', 'dist', 'index.html');
      const fallbackPath = path.join(__dirname, '..', 'web-build', 'index.html');
      const devUrl = process.env.EXPO_WEB_URL;

      let contentUrl;
      if (devUrl) {
        contentUrl = devUrl;
      } else if (fs.existsSync(distPath)) {
        const { url: staticUrl } = await ensureStaticServer(path.dirname(distPath));
        contentUrl = staticUrl;
      } else if (fs.existsSync(fallbackPath)) {
        const { url: staticUrl } = await ensureStaticServer(path.dirname(fallbackPath));
        contentUrl = staticUrl;
      } else {
        contentUrl = 'http://localhost:8082';
      }

      console.log('Loading content from:', contentUrl);
      await win.loadURL(contentUrl);
    } catch (err) {
      console.error('Failed to load main content', err);
    }
  };

  await win
    .loadFile(path.join(__dirname, 'loading.html'))
    .catch((err) => {
      // Navigating away from the loading screen can emit ERR_ABORTED; ignore it.
      if (err?.code !== 'ERR_ABORTED') {
        throw err;
      }
    });
  if (!savedState) win.center();
  win.show();
  // Start loading the main app after the spinner has been displayed.
  loadMainContent();

  win.webContents.once('dom-ready', () => {
    // Expose ipcRenderer to the renderer process
    win.webContents.executeJavaScript(`
      window.ipcRenderer = require('electron').ipcRenderer;
    `);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  createTray(win);
};

app.whenReady().then(() => {
  createWindow().catch((err) => {
    // Log startup failures instead of crashing silently.
    console.error('Failed to create window', err);
  });
});

app.on('window-all-closed', () => {
  stopStaticServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((err) => console.error('Failed to recreate window', err));
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
  stopStaticServer();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
