import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const template = await readFile('index.html', 'utf8');
await writeFile('local.html', template
  .replaceAll('wa-split-panel', 'div')
  .replace('id="split"', 'id="split" class="local-split"')
  .replace('id="split-right"', 'id="split-right" class="local-split"')
  .replace('build/pilot.js', 'build/local-panel.js')
  .replace('Web Awesome', 'Local panel')
  .replace('<link rel="stylesheet" href="pilot.css">', '<link rel="stylesheet" href="pilot.css"><link rel="stylesheet" href="local-panel.css">'));

const local = await readFile('local.html', 'utf8');
const help = (await readFile('popover.html', 'utf8')).split('<section aria-labelledby="keyboard-heading">')[1].split('</section>')[0];
await writeFile('shell.html', local
  .replace('build/local-panel.js', 'build/shell-pilot.js')
  .replace('build/grid-fixture.js', 'build/shell-grid.js')
  .replace('</head>', '<link rel="stylesheet" href="popover.css"><link rel="stylesheet" href="shell.css"></head>')
  .replace(/<header class="app-bar">.*?<\/header>/, '<header class="app-bar"><strong>Clip Sandbox</strong><nav aria-label="Main screens"><button id="collection-screen" aria-pressed="true">Collection</button><button id="settings-screen" aria-pressed="false">Settings</button></nav><div class="utilities"><button id="keyboard-trigger" aria-haspopup="dialog" aria-expanded="false">Keyboard shortcuts</button><button id="activity-trigger" aria-haspopup="dialog" aria-expanded="false">Activity <span aria-label="1 unresolved error">●</span></button></div></header>')
  .replace('<div id="tiles"', '<div id="collection-view"><div id="tiles"')
  .replace('    </main>', '</div><section id="settings-view" hidden inert><h2>Settings</h2><p>Prototype screen · no command bar</p><label>Pipelines top folder <input id="folder-setting" value="D:\\Clips" readonly></label></section></main>')
  .replace('<div class="utilities">', '<div class="utilities" id="utility-anchor">')
  .replace('</body>', `<wa-popover id="utility" for="utility-anchor" placement="bottom-end" without-arrow distance="10"><section id="keyboard-content" aria-labelledby="keyboard-heading">${help}</section><section id="activity-content" aria-labelledby="activity-heading" hidden><div class="help-heading"><h2 id="activity-heading">Activity and Errors</h2><button data-popover="close" aria-label="Close Activity">Close</button></div><p class="hint">Representative history · no operations are executed</p><div class="activity-history" tabindex="0" role="region" aria-label="Recent activity"><article class="error"><strong>Could not prepare sample clip</strong><p>Sample 03.mp4 · source unavailable</p><p>Choose an available source and retry.</p><details><summary>Technical details</summary><code>Fixture: source file unavailable</code></details></article><article>Collection loaded · 8 clips</article><article>Settings saved</article><article>Preview prepared</article><article>Collection saved</article><article>Folder scanned</article></div></section></wa-popover></body>`));

await build({
  entryPoints: { pilot: 'src/pilot.ts', 'local-panel': 'src/local-panel.ts', 'popover-pilot': 'src/popover-pilot.ts', 'spectrum-popover': 'src/spectrum-popover.ts', 'shell-pilot': 'src/shell-pilot.ts', 'shell-grid': 'shell-grid.mjs', 'grid-fixture': 'grid-fixture.mjs' },
  outdir: 'build',
  bundle: true,
  format: 'esm',
  target: 'chrome138',
  minify: true,
  legalComments: 'eof',
});
