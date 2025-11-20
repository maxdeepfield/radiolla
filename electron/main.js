const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const { app, BrowserWindow, shell, Tray, Menu } = require('electron');

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

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
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
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
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
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    title: 'Radiolla',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
    },
  });
  mainWindow = win;

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

  const distPath = path.join(__dirname, '..', 'dist', 'index.html');
  const fallbackPath = path.join(__dirname, '..', 'web-build', 'index.html');
  const localPath = fs.existsSync(distPath) ? distPath : fallbackPath;
  const startUrl = process.env.EXPO_WEB_URL || localPath;

  if (startUrl.startsWith('http')) {
    await win.loadURL(startUrl);
  } else {
    const { url: staticUrl } = await ensureStaticServer(path.dirname(localPath));
    await win.loadURL(staticUrl);
  }

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
