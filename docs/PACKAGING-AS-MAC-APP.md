# Learn to package Builder Brock as a local macOS `.app`

This guide turns the current project into a self-contained application you can launch from Finder. It is deliberately written as a learning path: each stage explains what a desktop package needs, shows the code that supplies it, and gives you a small observation that proves the stage worked.

The target is your current Apple-silicon Mac (`arm64`). The result will be an unsigned local app at:

```text
release/mac-arm64/Builder Brock.app
```

This guide describes the changes; it does not apply them automatically.

## 1. Understand what is being packaged

Builder Brock is currently three cooperating pieces:

```text
React interface (Vite)
        │ requests /api/...
        ▼
Express API
        │ reads and writes
        ▼
Prisma → SQLite database
```

You can see those boundaries in the existing source:

- `package.json` builds the interface with `vite build` and runs the API separately with `tsx watch server/index.ts`.
- `lib/api.ts` sends requests to relative `/api` URLs.
- `server/index.ts` owns the Express API and currently listens on port `3001`.
- `prisma/schema.prisma` declares SQLite and obtains its database location from `DATABASE_URL`.

A `.app` cannot merely contain the Vite `dist` directory. That would display the interface, but `/api` would have no server and saved projects would fail. Instead, Electron will become the small native launcher around all three pieces:

```text
Builder Brock.app
  └─ Electron main process
       ├─ starts Express on a private, random localhost port
       ├─ lets Express serve dist/ and /api from one origin
       ├─ opens that origin in a native macOS window
       └─ points Prisma at Application Support/Builder Brock/data/
```

Electron calls this launcher the **main process** and the visible web interface the **renderer process**. A `BrowserWindow` is the bridge between them. Electron's own [packaging overview](https://www.electronjs.org/docs/latest/tutorial/application-distribution) explains the same main-file-plus-resources model.

Why use one private HTTP server instead of loading `dist/index.html` with `file://`? Your interface already assumes that `/api` shares its origin. Serving the interface and API together preserves that behavior, keeps artifact preview routes working, and avoids special-case URL logic.

## 2. Make a rollback point

Before changing packaging code, save the current continuous state of the project:

```bash
git status --short
git add -A
git commit -m "Checkpoint before macOS packaging"
git push
```

Read the first command's output before continuing. The point is to preserve all current work, not just files you expect to touch.

## 3. Add the desktop build tools

From the project directory, install three development dependencies:

```bash
npm install --save-dev electron electron-builder esbuild
```

They have distinct jobs:

- `electron` supplies Chromium, Node.js, and the native macOS application runtime.
- `esbuild` turns the new TypeScript main process and the local server source into executable JavaScript.
- `electron-builder` arranges that JavaScript, the Vite output, production packages, database engine, and app metadata into `Builder Brock.app`.

These are build-time tools, so they belong in `devDependencies`. Express, Prisma Client, and the other packages used while the app is open must remain in `dependencies`.

## 4. Turn the API into something Electron can start

The existing `server/index.ts` starts listening as soon as it is imported. Electron needs more control: first it chooses the writable database location, then it starts the server, then it opens the window.

Refactor `server/index.ts` into this shape. Keep the existing route imports and middleware, but expose a `startServer` function and make the static interface optional for normal development:

```ts
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Server } from 'node:http';
import projectRoutes from './routes/projects.js';
import artifactRoutes from './routes/artifacts.js';

type StartServerOptions = {
  port?: number;
  staticDir?: string;
};

export async function startServer({
  port = Number(process.env.API_PORT || 3001),
  staticDir,
}: StartServerOptions = {}) {
  const api = express();

  api.use(cors({ origin: true }));
  api.use(express.json({ limit: '50mb' }));

  api.use('/api/projects', projectRoutes);
  api.use('/api/artifacts', artifactRoutes);

  api.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  if (staticDir) {
    api.use(express.static(staticDir));

    // Let React handle interface routes that are not files or API calls.
    api.use((_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  const server = await new Promise<Server>((resolve, reject) => {
    const listener = api.listen(port, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('The local API did not receive a TCP port.');
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

// Preserve the current `npm run dev:server` behavior.
const isCommandEntry =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCommandEntry) {
  void startServer();
}
```

There are three details worth noticing:

1. Electron will pass `port: 0`. At the operating-system level, zero means “choose an unused port,” so Builder Brock does not fail just because another process owns port `3001`.
2. The listener binds to `127.0.0.1`, not every network interface. The API is internal to this Mac even when you are connected to a private network.
3. Express serves `dist` only in the packaged app. Vite continues to serve the interface during development, and its existing proxy continues to forward `/api` to port `3001`.

## 5. Create the Electron main process

Create `electron/main.ts` with the following code:

```ts
import { app, BrowserWindow, shell } from 'electron';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Server } from 'node:http';

let localServer: Server | undefined;
let localUrl = '';

function prepareDatabase() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  const databasePath = path.join(dataDir, 'builder-brock.db');
  mkdirSync(dataDir, { recursive: true });

  if (!existsSync(databasePath)) {
    const templatePath = path.join(
      process.resourcesPath,
      'db',
      'app-template.db',
    );
    copyFileSync(templatePath, databasePath);
  }

  // Prisma reads this when server/lib/db.ts first creates PrismaClient.
  process.env.DATABASE_URL = pathToFileURL(databasePath).href;
  process.env.NODE_ENV = 'production';
}

async function startLocalApp() {
  prepareDatabase();

  // This import must remain after prepareDatabase(). A static top-level import
  // could construct PrismaClient before DATABASE_URL has been assigned.
  const { startServer } = await import('../server/index.js');
  const started = await startServer({
    port: 0,
    staticDir: path.join(app.getAppPath(), 'dist'),
  });

  localServer = started.server;
  localUrl = started.url;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#111111',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  void window.loadURL(localUrl);
}

await app.whenReady();
await startLocalApp();
createWindow();

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  localServer?.close();
});
```

The database cannot live inside the `.app`: packaged resources should be treated as read-only, and replacing the app during an upgrade would replace them anyway. Electron's [`app.getPath('userData')` documentation](https://www.electronjs.org/docs/latest/api/app#appgetpathname) designates the per-user Application Support directory for app data. On this Mac, the database will end up beneath:

```text
~/Library/Application Support/Builder Brock/data/builder-brock.db
```

The renderer deliberately receives no Node.js access. Builder Brock can render AI-produced HTML previews, so preserving the renderer boundary is especially valuable. Electron recommends leaving Node integration off, context isolation on, and renderer sandboxing on in its [security checklist](https://www.electronjs.org/docs/latest/tutorial/security) and [sandboxing guide](https://www.electronjs.org/docs/latest/tutorial/sandbox).

## 6. Make an empty first-launch database

Prisma needs a real SQLite file with Builder Brock's tables on the first launch. The simplest first package is to create an empty template during every desktop build, place it inside the app, and copy it to Application Support only when the user database does not yet exist.

Run this manually once to understand the operation:

```bash
rm -f prisma/app-template.db
DATABASE_URL='file:./app-template.db' npx prisma db push --schema prisma/schema.prisma --skip-generate
```

The removal is intentionally scoped to the generated template, not your working database under `data/`. `prisma db push` synchronizes a database directly to the current schema without creating migration history; Prisma documents that distinction in its [`db push` reference](https://docs.prisma.io/docs/cli/db/push).

Inspect the result:

```bash
ls -lh prisma/app-template.db
```

The app copies this file only if `builder-brock.db` is absent. Rebuilding or replacing the `.app` therefore does **not** erase existing projects.

## 7. Teach `package.json` how to build the app

Add the desktop entry point near the existing package identity:

```json
{
  "name": "builder-brock",
  "productName": "Builder Brock",
  "version": "1.0.0",
  "main": "build-electron/main.js",
  "type": "module"
}
```

Merge these commands into the existing `scripts` object; retain all current development and database commands:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:frontend\" \"npm run dev:server\"",
    "dev:frontend": "vite",
    "dev:server": "tsx watch server/index.ts",
    "build": "vite build",
    "build:desktop-main": "esbuild electron/main.ts --bundle --platform=node --format=esm --packages=external --outfile=build-electron/main.js",
    "build:db-template": "rm -f prisma/app-template.db && DATABASE_URL='file:./app-template.db' prisma db push --schema prisma/schema.prisma --skip-generate",
    "package:mac": "npm run build && npm run build:desktop-main && npm run build:db-template && electron-builder --mac dir --arm64",
    "postinstall": "electron-builder install-app-deps"
  }
}
```

`--packages=external` is important. It bundles your local TypeScript server modules into the Electron entry point while leaving packages such as Express and Prisma to be loaded from the packaged `node_modules`. `postinstall` lets electron-builder align native dependencies with Electron after an install.

Finally, add this top-level `build` object alongside `scripts`, `dependencies`, and `devDependencies`:

```json
{
  "build": {
    "appId": "local.builderbrock.app",
    "productName": "Builder Brock",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "build-electron/**/*",
      "package.json",
      "node_modules/**/*"
    ],
    "extraResources": [
      {
        "from": "prisma/app-template.db",
        "to": "db/app-template.db"
      }
    ],
    "asarUnpack": [
      "node_modules/.prisma/**/*",
      "node_modules/@prisma/client/**/*"
    ],
    "mac": {
      "identity": null,
      "target": [
        {
          "target": "dir",
          "arch": ["arm64"]
        }
      ]
    }
  }
}
```

This configuration teaches electron-builder five things:

- the app's stable macOS identity;
- which generated and runtime files belong inside it;
- where to copy the first-launch database template;
- which Prisma native-engine files must remain unpacked from Electron's `asar` archive;
- that this local build should produce an Apple-silicon `.app` directory without looking for a signing identity.

The corresponding electron-builder concepts are documented under [`files`, `extraResources`, and `asarUnpack`](https://www.electron.build/configuration/contents) and its [macOS configuration](https://www.electron.build/configuration/mac).

Add generated desktop artifacts to `.gitignore`:

```gitignore
# Desktop packaging
build-electron/
release/
prisma/app-template.db
```

Do commit `electron/main.ts`, the server refactor, `package.json`, `package-lock.json`, and `.gitignore`. Do not commit the generated template or packaged app.

## 8. Build the first `.app`

Run one command from the project root:

```bash
npm run package:mac
```

Read the command as a pipeline:

```text
Vite compiles React
  → esbuild compiles Electron + local server source
  → Prisma creates a blank schema template
  → electron-builder assembles Builder Brock.app
```

When it completes, reveal the result in Finder:

```bash
open release/mac-arm64
```

Double-click `Builder Brock.app`. Because this copy was built locally and deliberately has no signing identity, it is meant for your own Mac rather than public distribution. If macOS blocks a copied build, use Finder's **Control-click → Open** flow or **System Settings → Privacy & Security → Open Anyway** after confirming that it is your build. Electron explains why signing becomes relevant when distributing to other people in its [distribution overview](https://www.electronjs.org/docs/latest/tutorial/distribution-overview).

The first build uses Electron's default icon. Once the runtime works, add a square macOS `.icns` file and set `"icon": "build/icon.icns"` inside the `mac` configuration. Do this after the acceptance pass so icon work cannot obscure a runtime packaging problem.

## 9. Prove that it is genuinely self-contained

Do this small acceptance pass after the first launch:

1. Leave `npm run dev` stopped.
2. Open `Builder Brock.app` from Finder.
3. Confirm the project list loads; that proves the internal Express API started.
4. Create a disposable project and quit the app completely with **Builder Brock → Quit Builder Brock**.
5. Reopen it and confirm the project remains; that proves SQLite is in writable Application Support rather than temporary package storage.
6. In Settings, configure the provider you use and make one generation; that proves external HTTPS calls still work from the packaged renderer.
7. Replace the `.app` with a newly built copy and confirm the disposable project still exists; that proves app replacement and user data are separate.

If the window opens but projects do not load, the failure is in the Electron → Express → Prisma half. If projects load but generation fails, the desktop shell is working and the problem is provider configuration or external API access.

## 10. Install it in Applications

After the acceptance pass, quit Builder Brock and drag `Builder Brock.app` from `release/mac-arm64` into `/Applications` in Finder. If an older copy exists, confirm that you intend to replace the application before doing so. Its database remains under your user Library and is not part of that replacement.

Each later local release follows the same cycle:

```bash
git add -A
git commit -m "Describe the completed change"
git push
npm run package:mac
```

Then quit the installed copy and replace it with the new one from `release/mac-arm64`.

## 11. Know where configuration and data live

There are two persistence systems in the current code:

- Projects, artifacts, and revisions live in the Prisma SQLite file under Application Support.
- Provider settings live in Chromium `localStorage`; `lib/providers/config.ts` uses the key `builderbrock.providerConfig`. Electron stores that browser state beneath its user-data directory too.

The Vite configuration currently substitutes `GEMINI_API_KEY` into the compiled renderer during `npm run build`. For a package that stays on your own Mac, that may be convenient. If you ever give the `.app` to someone else, do not build your personal key into it: remove the key from the build environment and let each person enter a key through Settings. The current source already notes that browser-side keys are visible in the bundle and local storage.

For a manual backup, quit the app first and copy this entire folder rather than copying only the `.app`:

```text
~/Library/Application Support/Builder Brock/
```

Copying the whole directory preserves the SQLite database and the browser profile that holds Settings.

## 12. The first-package boundary

The template approach is appropriate for learning and for the first local version. It does not migrate an existing database when `prisma/schema.prisma` changes later. Once you add, remove, or rename database fields, introduce versioned Prisma migrations and run only pending migrations against the Application Support database at startup. Never solve a schema update by overwriting `builder-brock.db`; that would erase saved work.

Likewise, `arm64` is correct for the Mac on which this guide was written. An Intel build needs an `x64` target and a matching Prisma engine; a universal build must contain both architectures. Treat those as later distribution work rather than complicating the first local package.

## Completion checklist

You are finished when all of these statements are true:

- `npm run dev` still behaves as it did before the server refactor.
- `npm run package:mac` produces `release/mac-arm64/Builder Brock.app`.
- The app opens from Finder while no development server is running.
- Projects and artifact previews load.
- A project survives a full quit, reopen, and `.app` replacement.
- Your source changes and `package-lock.json` are committed and pushed.
- Generated `release`, `build-electron`, and template-database files remain untracked.

At that point Builder Brock is not merely a website inside a window: it is a local desktop bundle with its own private runtime and durable macOS data location.
