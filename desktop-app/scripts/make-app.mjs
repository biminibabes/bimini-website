// Builds "BIMINI studio.app" and puts it in your Applications folder.
// Run with: npm run make-app
//
// The app is signed "ad-hoc" (for this Mac only, no Apple developer account).
// That's enough to open an app you built yourself; it's not for sending to others.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'BIMINI studio';
const onMac = process.platform === 'darwin';
// --platform=linux lets the build be tested away from a Mac.
const platform = (process.argv.find(a => a.startsWith('--platform=')) || '').split('=')[1] || 'darwin';

const say = msg => console.log(`\n▶ ${msg}`);

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`\nYour Node.js is ${process.versions.node}. Building the app needs 22.12 or newer.
Install the LTS version from https://nodejs.org, then run: npm run make-app\n`);
  process.exit(1);
}
const { packager } = await import('@electron/packager');

say(`Packaging ${NAME} for ${platform} (${process.arch})…`);
const [appDir] = await packager({
  dir: root,
  name: NAME,
  platform,
  arch: process.arch,
  out: path.join(root, 'out'),
  overwrite: true,
  asar: true,
  icon: path.join(root, 'build', 'icon'),
  appBundleId: 'com.biminicreative.studio',
  appCategoryType: 'public.app-category.developer-tools',
  ignore: [/^\/out($|\/)/, /^\/test($|\/)/, /^\/scripts($|\/)/, /^\/README\.md$/, /^\/\.gitignore$/],
});

if (platform !== 'darwin' || !onMac) {
  say(`Built at ${appDir}\nSkipping signing and install: those only run on a Mac.`);
  process.exit(0);
}

const built = path.join(appDir, `${NAME}.app`);

say('Signing it for this Mac…');
execFileSync('codesign', ['--force', '--deep', '--sign', '-', built], { stdio: 'inherit' });

// /Applications if we can write there, otherwise your own ~/Applications.
let dest = '/Applications';
try { fs.accessSync(dest, fs.constants.W_OK); } catch {
  dest = path.join(os.homedir(), 'Applications');
  fs.mkdirSync(dest, { recursive: true });
}
const target = path.join(dest, `${NAME}.app`);

say(`Installing to ${target}…`);
fs.rmSync(target, { recursive: true, force: true });
execFileSync('ditto', [built, target], { stdio: 'inherit' });

say(`Done. Open "${NAME}" from Launchpad, Spotlight (⌘Space), or ${dest}.
  To keep it in your Dock: open it, right-click its Dock icon, then Options → Keep in Dock.`);
