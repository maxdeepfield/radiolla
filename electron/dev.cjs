"use strict";
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const desktop = require(path.join(__dirname, "desktop.json"));
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === "win32")
      spawnSync("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    else child.kill("SIGTERM");
  }
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
const spawnChild = (bin, args, env) => {
  const child = spawn(bin, args, { cwd: root, stdio: "inherit", env });
  children.push(child);
  child.once("error", (err) => {
    console.error(err.message);
    stop(1);
  });
  child.once("exit", (code) => stop(code ?? 1));
  return child;
};
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
const ready = (url) =>
  new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.setTimeout(1000, () => req.destroy());
    req.on("error", () => resolve(false));
  });
(async () => {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const expoDir = path.dirname(
    require.resolve("expo/package.json", { paths: [root] }),
  );
  spawnChild(
    process.execPath,
    [
      path.join(expoDir, "bin/cli"),
      "start",
      "--web",
      "--host",
      "localhost",
      "--port",
      String(port),
    ],
    { ...process.env, EXPO_NO_WEB_BROWSER: "1" },
  );
  const deadline = Date.now() + 120000;
  while (!(await ready(url))) {
    if (Date.now() > deadline)
      throw new Error(`Expo did not become ready at ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const env = { ...process.env, EXPO_WEB_URL: url };
  delete env.ELECTRON_RUN_AS_NODE;
  console.log(`Starting Electron at ${url}`);
  spawnChild(
    require("electron"),
    [path.join(__dirname, desktop.main || "main.cjs")],
    env,
  );
})().catch((err) => {
  console.error(err.message);
  stop(1);
});
