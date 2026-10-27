// Lists the sample posts' drawn covers as URLs on a running Margin, one per line with the
// file name to save, so a headless browser can screenshot each at 1280×720 into
// web/samples/drawn/<key>.png (their social images and feed pictures):
//   node margin/tools/cover-pngs.mjs http://margin.localhost:8080
import { WORKSPACES, POSTS } from '../api/samples/content.js';

const base = (process.argv[2] || 'http://margin.localhost:8080').replace(/\/$/, '');
for (const post of POSTS) {
  const ws = WORKSPACES.find((w) => w.slug === post.ws);
  const d = { look: ws.cover.look, tone: ws.cover.tone, ...post.drawing };
  console.log(`${post.key} ${base}/c/${d.motif}-${d.look}-${d.tone}-${d.seed}.svg`);
}
