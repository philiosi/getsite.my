/* Assembles the hosting root the root firebase.json expects (`public/`):
     public/index.html  = the current live page (unchanged unless --root=v4)
     public/v3/         = v3 modules, order page, assets (v4 imports ../v3/)
     public/v4/         = this page
     public/v5/         = v4 with a simpler step 3
     public/motion/     = the hero motion samples (already live; embedded by the step 3 motion picker)
   Run: node scripts/v4-build.mjs [--root=v4|v5]   then   firebase hosting:channel:deploy <name> --project getsite-my
   Nothing here deploys; the deploy command is run by the operator. */
import { cpSync, rmSync, mkdirSync, existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(repo, 'public');
const rootArg = (process.argv.find((a) => a.startsWith('--root=')) || '').slice(7);
if (rootArg && !['v4', 'v5'].includes(rootArg)) throw new Error('--root must be v4 or v5');
const rootIsV4 = !!rootArg; // the root redirects to /<rootArg>/

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const skip = (src) => /\/(node_modules|\.DS_Store|backend)(\/|$)/.test(src);
cpSync(resolve(repo, 'v3'), resolve(out, 'v3'), { recursive: true, filter: (src) => !skip(src) });
cpSync(resolve(repo, 'v4'), resolve(out, 'v4'), { recursive: true, filter: (src) => !skip(src) });
// v5: the same order format with a simpler step 3 (structure only, motion as examples, gallery picked).
if (existsSync(resolve(repo, 'v5'))) cpSync(resolve(repo, 'v5'), resolve(out, 'v5'), { recursive: true, filter: (src) => !skip(src) });
// The live site serves /motion/ (the hero motion samples); the step 3 motion picker embeds it from the same
// origin. public/ is rebuilt from scratch, so leaving it out would take those pages off the site.
cpSync(resolve(repo, 'motion'), resolve(out, 'motion'), { recursive: true, filter: (src) => !skip(src) && !src.endsWith('README.md') });
if (rootIsV4) {
  // The page keeps its ./v4.css and ../v3 paths by staying under /v4/; the root only redirects.
  writeFileSync(resolve(out, 'index.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/${rootArg}/"><script>location.replace('/${rootArg}/' + location.search + location.hash)</script><title>getsite.my</title><a href="/${rootArg}/">getsite.my</a>`);
} else {
  copyFileSync(resolve(repo, 'index.html'), resolve(out, 'index.html'));
}
if (!existsSync(resolve(out, 'v4/index.html'))) throw new Error('v4/index.html missing');
if (!existsSync(resolve(out, 'motion/hwaga-hieoro-mosyeongeuraepig-saempeul-2.html'))) throw new Error('motion sample missing');
console.log(`public/ assembled (${rootIsV4 ? `root redirects to /${rootArg}/` : 'root = current live page'}). v3 backend files were not copied.`);
