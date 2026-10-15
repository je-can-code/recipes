/**
 * Builds the service worker into the website as sw.js, once Vite has built everything else. It's a step of
 * its own because the worker has to know every file the website is made of, and only a finished build
 * does. The worker is bundled into one plain script, since a service worker can't load modules of its own
 * in every browser.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appAddresses, isAppFile } from '../web/src/worker/policy';

/**
 * The built website, where Vite has just written everything else.
 */
const dist = 'server/internal/site/dist';

// every file in the built website, relative to its folder, in a fixed order.
const files = readdirSync(dist, { recursive: true, encoding: 'utf8' })
  .filter((file) => statSync(join(dist, file)).isFile())
  .sort();

// the build is named after its contents, so rebuilding without a change leaves every device's copy alone,
// and any change at all gives the worker new bytes, which is how browsers learn there's a new build.
const hash = createHash('sha256');
files.filter(isAppFile).forEach((file) =>
{
  hash.update(file);
  hash.update(readFileSync(join(dist, file)));
});
const buildId = hash.digest('hex').slice(0, 12);
const addresses = appAddresses(files);

const result = await Bun.build({
  entrypoints: [ 'web/src/worker/sw.ts' ],
  target: 'browser',
  format: 'iife',
  define: {
    __APP_FILES__: JSON.stringify(addresses),
    __BUILD_ID__: JSON.stringify(buildId),
  },
});
if (result.success === false)
{
  console.error(result.logs.join('\n'));
  process.exit(1);
}

// an import left in the worker would stop it from starting, and the browser would never say why.
const worker = await result.outputs[0].text();
if (/^\s*(import|export)\b/m.test(worker))
{
  console.error('The service worker came out with an import or export in it, which it can\'t run with.');
  process.exit(1);
}

writeFileSync(join(dist, 'sw.js'), worker);
console.log(`Built the service worker for build ${buildId}, saving ${addresses.length} files.`);
