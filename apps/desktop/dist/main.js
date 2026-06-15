"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
// Remote server URL — change to your Render URL for production builds
// Set to '' to use embedded local server instead
const REMOTE_URL = process.env.VORTEX_SERVER_URL || 'https://talktop-zkta.onrender.com';
let mainWindow = null;
let serverProcess = null;
let tray = null;
let trayMenuWindow = null;
let isQuitting = false;
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}
async function waitForServer(maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch('http://127.0.0.1:3001/api/health');
            if (response.ok) {
                console.log('Server is ready!');
                return true;
            }
        }
        catch (e) {
            console.log(`Waiting for server... attempt ${i + 1}/${maxAttempts}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
}
function createTrayMenu() {
    if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
        trayMenuWindow.close();
        trayMenuWindow = null;
        return;
    }
    const isDev = !electron_1.app.isPackaged;
    const trayBounds = tray?.getBounds();
    if (!trayBounds)
        return;
    const menuHeight = 192;
    const menuWidth = 232;
    const gap = 8;
    let x;
    let y;
    const cursorPoint = electron_1.screen.getCursorScreenPoint();
    const display = electron_1.screen.getDisplayNearestPoint(cursorPoint);
    const { x: workX, y: workY, width: workWidth, height: workHeight } = display.workArea;
    x = Math.round(cursorPoint.x - menuWidth / 2);
    y = Math.round(cursorPoint.y - menuHeight - gap);
    if (x < workX + 4)
        x = workX + 4;
    if (x + menuWidth > workX + workWidth - 4)
        x = workX + workWidth - menuWidth - 4;
    if (y < workY + 4)
        y = Math.round(cursorPoint.y + gap);
    trayMenuWindow = new electron_1.BrowserWindow({
        width: menuWidth,
        height: menuHeight,
        x,
        y,
        frame: false,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        transparent: true,
        hasShadow: false,
        focusable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    trayMenuWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const menuPath = isDev
        ? path.join(__dirname, '../tray-menu.html')
        : path.join(process.resourcesPath, 'tray-menu.html');
    trayMenuWindow.loadFile(menuPath);
    trayMenuWindow.webContents.on('did-finish-load', () => {
        const iconPath = isDev
            ? path.join(__dirname, '../build/icon.png')
            : path.join(process.resourcesPath, 'build', 'icon.png');
        if (fs.existsSync(iconPath)) {
            const iconUrl = iconPath.replace(/\\/g, '/');
            trayMenuWindow?.webContents.executeJavaScript(`document.getElementById('appIcon').src = 'file:///${iconUrl}';`);
        }
    });
    trayMenuWindow.on('blur', () => {
        if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
            trayMenuWindow.close();
        }
        trayMenuWindow = null;
    });
    trayMenuWindow.on('closed', () => {
        trayMenuWindow = null;
    });
}
function createTray() {
    const isDev = !electron_1.app.isPackaged;
    const iconPath = isDev
        ? path.join(__dirname, '../build/icon.png')
        : path.join(process.resourcesPath, 'build', 'icon.png');
    let trayIcon;
    if (fs.existsSync(iconPath)) {
        const image = electron_1.nativeImage.createFromPath(iconPath);
        trayIcon = image.resize({ width: 16, height: 16, quality: 'best' });
    }
    else {
        console.error('Tray icon not found:', iconPath);
        trayIcon = electron_1.nativeImage.createEmpty();
    }
    tray = new electron_1.Tray(trayIcon);
    tray.setToolTip('Talk Messenger');
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            }
            else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });
    tray.on('right-click', () => {
        createTrayMenu();
    });
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}
async function startServer() {
    const isDev = !electron_1.app.isPackaged;
    if (isDev) {
        console.log('Development mode: server should be running separately');
        await waitForServer(5);
        return;
    }
    const userDataPath = electron_1.app.getPath('userData');
    const dataDir = path.join(userDataPath, 'vortex-data');
    const uploadsDir = path.join(dataDir, 'uploads');
    const dbPath = path.join(dataDir, 'database.db');
    ensureDir(dataDir);
    ensureDir(uploadsDir);
    ensureDir(path.join(uploadsDir, 'avatars'));
    const envPath = path.join(dataDir, '.env');
    if (!fs.existsSync(envPath)) {
        const envSourcePath = path.join(process.resourcesPath, 'server', '.env.production');
        if (fs.existsSync(envSourcePath)) {
            fs.copyFileSync(envSourcePath, envPath);
            console.log('Created .env file in userData');
        }
    }
    const prismaDir = path.join(dataDir, 'prisma');
    ensureDir(prismaDir);
    const schemaPath = path.join(prismaDir, 'schema.prisma');
    if (!fs.existsSync(schemaPath)) {
        const schemaSourcePath = path.join(process.resourcesPath, 'server', 'prisma', 'schema.prisma');
        if (fs.existsSync(schemaSourcePath)) {
            fs.copyFileSync(schemaSourcePath, schemaPath);
            console.log('Copied Prisma schema to userData');
        }
    }
    const serverPath = path.join(process.resourcesPath, 'server', 'dist', 'index.js');
    console.log('Starting server from:', serverPath);
    serverProcess = (0, child_process_1.spawn)('node', [serverPath], {
        cwd: path.join(process.resourcesPath, 'server'),
        env: {
            ...process.env,
            NODE_ENV: 'production',
            ENV_PATH: envPath,
            DATABASE_URL: `file:${dbPath}`,
            UPLOADS_PATH: uploadsDir,
        }
    });
    serverProcess.stdout?.on('data', (data) => {
        console.log(`Server: ${data}`);
    });
    serverProcess.stderr?.on('data', (data) => {
        console.error(`Server Error: ${data}`);
    });
    serverProcess.on('error', (error) => {
        console.error('Failed to start server:', error);
    });
    serverProcess.on('exit', (code) => {
        console.log(`Server process exited with code ${code}`);
    });
    console.log('Waiting for server to be ready...');
    const serverReady = await waitForServer(15);
    if (!serverReady) {
        console.error('Server failed to start in time!');
    }
}
function createWindow() {
    const isDev = !electron_1.app.isPackaged;
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: true,
        frame: false, // Убираем стандартный titlebar
        titleBarStyle: 'hidden',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        icon: isDev
            ? path.join(__dirname, '../build/icon.png')
            : path.join(process.resourcesPath, 'build', 'icon.png'),
        title: 'Talk',
        backgroundColor: '#0a0e27',
    });
    const splashPath = isDev
        ? path.join(__dirname, '../splash.html')
        : path.join(process.resourcesPath, 'splash.html');
    if (fs.existsSync(splashPath)) {
        mainWindow.loadFile(splashPath);
    }
    else {
        mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-family: sans-serif;
            color: white;
          }
          .loader { text-align: center; }
          h1 { font-size: 32px; margin-bottom: 20px; }
          .spinner {
            width: 40px;
            height: 40px;
            margin: 20px auto;
            border: 3px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="loader">
          <h1>Talk Messenger</h1>
          <div class="spinner"></div>
          <p>Загрузка...</p>
        </div>
      </body>
      </html>
    `)}`);
    }
    // DevTools открываются только в dev режиме после загрузки приложения
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        console.error('Render process gone:', details);
        // Do NOT auto-reload; let the user see the error or restart manually
    });
    mainWindow.webContents.on('unresponsive', () => {
        console.error('Window became unresponsive');
    });
    electron_1.Menu.setApplicationMenu(null);
    // Grant media permissions (microphone, camera) for calls
    mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
        const allowedPermissions = ['media', 'microphone', 'camera', 'display-capture', 'desktop-capture'];
        if (allowedPermissions.includes(permission)) {
            callback(true);
        }
        else {
            callback(false);
        }
    });
    mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission, _requestingOrigin, _details) => {
        const allowedPermissions = ['media', 'microphone', 'camera', 'display-capture', 'desktop-capture'];
        return allowedPermissions.includes(permission);
    });
}
async function loadMainApp() {
    if (!mainWindow)
        return;
    const isDev = !electron_1.app.isPackaged;
    if (isDev) {
        const viteUrl = 'http://127.0.0.1:5173';
        console.log(`Loading Vite from: ${viteUrl}`);
        let ready = false;
        for (let i = 0; i < 30; i++) {
            try {
                const resp = await fetch(viteUrl, { method: 'HEAD' });
                if (resp.ok || resp.status < 500) {
                    ready = true;
                    break;
                }
            }
            catch { }
            await new Promise(r => setTimeout(r, 500));
        }
        if (!ready) {
            console.error('Vite dev server not ready after 15s!');
        }
        await mainWindow.webContents.session.clearCache();
        await mainWindow.webContents.session.clearStorageData();
        await mainWindow.loadURL(viteUrl);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.openDevTools();
        }
    }
    else if (REMOTE_URL) {
        // Remote server mode (Render, VPS, etc.)
        console.log(`Loading from remote: ${REMOTE_URL}`);
        // Show connecting screen while server wakes up
        mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            background: #0a0e27;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: white;
          }
          .loader { text-align: center; }
          h1 { font-size: 24px; margin-bottom: 10px; }
          p { color: #888; font-size: 14px; }
          .spinner {
            width: 32px; height: 32px;
            margin: 20px auto;
            border: 3px solid rgba(255,255,255,0.1);
            border-top-color: #8b5cf6;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="loader">
          <h1>Talk</h1>
          <div class="spinner"></div>
          <p>Подключение к серверу...</p>
        </div>
      </body>
      </html>
    `)}`);
        // Retry loading until server is ready
        let loaded = false;
        for (let i = 0; i < 60; i++) {
            try {
                const resp = await fetch(REMOTE_URL, { method: 'HEAD' });
                if (resp.ok || resp.status < 500) {
                    loaded = true;
                    break;
                }
            }
            catch { }
            await new Promise(r => setTimeout(r, 1000));
        }
        if (loaded && mainWindow && !mainWindow.isDestroyed()) {
            await mainWindow.loadURL(REMOTE_URL);
            mainWindow.webContents.openDevTools();
            // Log console errors from the page
            mainWindow.webContents.on('console-message', (_event, level, message) => {
                if (level >= 2)
                    console.log(`[PAGE ${level}] ${message}`);
            });
        }
        else if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { background: #0a0e27; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: sans-serif; color: white; }
            .loader { text-align: center; }
            h1 { font-size: 24px; } p { color: #888; }
            button { margin-top: 20px; padding: 10px 30px; background: #8b5cf6; border: none; color: white; border-radius: 8px; cursor: pointer; font-size: 14px; }
            button:hover { background: #7c3aed; }
          </style>
        </head>
        <body>
          <div class="loader">
            <h1>Talk</h1>
            <p>Сервер недоступен. Попробуйте позже.</p>
            <button onclick="location.href='${REMOTE_URL}'">Повторить</button>
          </div>
        </body>
        </html>
      `)}`);
        }
    }
    else {
        // Embedded server mode (offline / LAN)
        const indexPath = path.join(process.resourcesPath, 'web', 'dist', 'index.html');
        console.log('Loading from:', indexPath);
        await mainWindow.loadFile(indexPath);
    }
    mainWindow.focus();
}
electron_1.app.whenReady().then(async () => {
    console.log('App is ready');
    // Setup IPC handlers
    electron_1.ipcMain.handle('get-screen-sources', async () => {
        const sources = await electron_1.desktopCapturer.getSources({
            types: ['window', 'screen'],
            thumbnailSize: { width: 150, height: 150 }
        });
        return sources.map(source => ({
            id: source.id,
            name: source.name,
            thumbnail: source.thumbnail.toDataURL()
        }));
    });
    // Window controls
    electron_1.ipcMain.on('window-minimize', () => {
        mainWindow?.minimize();
    });
    electron_1.ipcMain.on('window-maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        }
        else {
            mainWindow?.maximize();
        }
    });
    electron_1.ipcMain.on('window-close', () => {
        mainWindow?.close();
    });
    electron_1.ipcMain.on('tray-action', (_event, action) => {
        if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
            trayMenuWindow.close();
            trayMenuWindow = null;
        }
        switch (action) {
            case 'show':
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
                break;
            case 'minimize':
                mainWindow?.hide();
                break;
            case 'quit':
                isQuitting = true;
                electron_1.app.quit();
                break;
        }
    });
    createWindow();
    createTray();
    if (REMOTE_URL) {
        // Remote server mode — no local server needed
        console.log(`Remote mode: ${REMOTE_URL}`);
        await loadMainApp();
    }
    else {
        // Embedded server mode
        startServer().then(async () => {
            console.log('Server ready, loading app...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            await loadMainApp();
        }).catch(err => {
            console.error('Failed to start:', err);
        });
    }
});
electron_1.app.on('window-all-closed', () => {
    // Работаем в трее
});
electron_1.app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
    else {
        mainWindow.show();
        mainWindow.focus();
    }
});
electron_1.app.on('before-quit', () => {
    isQuitting = true;
});
electron_1.app.on('quit', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
});
process.on('SIGTERM', () => {
    if (serverProcess)
        serverProcess.kill();
    electron_1.app.quit();
});
process.on('SIGINT', () => {
    if (serverProcess)
        serverProcess.kill();
    electron_1.app.quit();
});
