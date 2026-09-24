// Electron shell around ../prototype. The prototype stays a plain static page
// that still runs in a browser; everything window-specific lives here and in
// shell.css, which is injected so the prototype files never need to know.

const { app, BrowserWindow, nativeTheme, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const PROTOTYPE = path.join(__dirname, "..", "prototype", "index.html");
const SHELL_CSS = fs.readFileSync(path.join(__dirname, "shell.css"), "utf8");

app.setName("Meta Harness");

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    title: "Meta Harness",
    show: false,
    // native macOS traffic lights, drawn over our own 38px chrome row
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 13 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1a1a1c" : "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Inject before first paint so the fake window frame never flashes.
  win.webContents.on("dom-ready", () => {
    win.webContents.insertCSS(SHELL_CSS);
  });
  win.once("ready-to-show", () => win.show());

  // Preview / live URLs in the prototype open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file:")) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadFile(PROTOTYPE);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
