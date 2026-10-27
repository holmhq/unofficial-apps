// Margin's own front page: what Margin is, two or three workspaces as examples (with their
// latest drawn cover, live under the pointer), how to start, and the way in. Not themed.
import { escapeHTML } from './lib/util.js';
import { marginSettings } from './settings.js';
import { blogByHandle, avatarURL } from './blogs.js';
import { allWorkspaces, workspaceBySlug, wsDTO, myWorkspaces, canCreateWorkspace } from './workspaces.js';
import { published, cardDTO } from './posts.js';
import { render as renderDrawing, describe } from './covers.js';

const MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M1.42 5.45h10.25a1.42 1.42 0 0 1 0 2.84H1.42a1.42 1.42 0 0 1 0-2.84Zm0 6.22h10.25a1.42 1.42 0 0 1 0 2.84H1.42a1.42 1.42 0 0 1 0-2.84Zm0 6.22h5.89a1.42 1.42 0 0 1 0 2.84H1.42a1.42 1.42 0 0 1 0-2.84ZM18 3.27h3.82Q24 3.27 24 5.45v5.46q0 2.18-2.18 2.18H19.2l-3.49 2.84.22-3.49q-.11-.44-.11-1.53V5.45q0-2.18 2.18-2.18Z"/></svg>';

function list(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// The workspaces to show: the admin's picks, else the sample ones, else any with posts.
function exampleWorkspaces(env, ctx) {
  const margin = marginSettings(env);
  let spaces = (margin.examples || []).map((s) => workspaceBySlug(env, s)).filter((w) => w && !w.suspended);
  if (!spaces.length) {
    const all = allWorkspaces(env).filter((w) => !w.suspended);
    spaces = all.filter((w) => w.sample);
    if (!spaces.length) spaces = all.filter((w) => published(env, ctx, w.slug).length).slice(0, 2);
  }
  return spaces.slice(0, 4);
}

function example(env, ctx, ws, host) {
  const posts = published(env, ctx, ws.slug);
  const lead = posts.find((p) => (ws.featured || []).includes(p.id)) || posts[0];
  const card = lead ? cardDTO(env, ctx, lead) : null;
  const writers = [];
  for (const p of posts) if (p.blog !== ws.slug && !writers.includes(p.blog)) writers.push(p.blog);
  const faces = writers.slice(0, 4).map((h) => blogByHandle(env, h)).filter(Boolean);
  const dto = wsDTO(ws);
  let cover = '';
  if (card && card.cover && card.cover.drawn) {
    cover = `<div class="l-cover" data-m-drawing="${escapeHTML(JSON.stringify(card.cover.drawing))}" role="img" aria-label="${escapeHTML(describe(card.cover.drawing))}">${renderDrawing(card.cover.drawing, null, {})}</div>`;
  } else if (card && card.cover) {
    cover = `<div class="l-cover"><img src="${escapeHTML(card.cover.url)}" alt="" loading="lazy"></div>`;
  }
  const logo = dto.logo ? `<img class="l-logo" src="${escapeHTML(dto.logo)}" alt="" width="36" height="36">` : `<span class="l-logo l-logo-letter" style="background:${dto.color}">${escapeHTML(dto.initial)}</span>`;
  return `<a class="l-card" href="${escapeHTML(dto.url)}">${cover}
    <span class="l-ws">${logo}<span class="l-ws-text"><span class="l-ws-name">${escapeHTML(dto.name)}</span><span class="l-ws-url">${escapeHTML(host)}/${escapeHTML(ws.slug)}</span></span></span>
    ${dto.tagline ? `<span class="l-tagline">${escapeHTML(dto.tagline)}</span>` : ''}
    ${card ? `<span class="l-post">${escapeHTML(card.title)}</span>` : ''}
    ${faces.length ? `<span class="l-faces"><span class="l-face-row">${faces.map((b) => `<img src="${escapeHTML(avatarURL(b))}" alt="" width="26" height="26" loading="lazy">`).join('')}</span><span>${escapeHTML(list(faces.map((b) => b.name.split(' ')[0])))}</span></span>` : ''}
  </a>`;
}

export async function landingPage(env, ctx, request, html) {
  const url = new URL(request.url);
  const margin = marginSettings(env);
  const v = await html.assetVersion(env, url.origin);
  const bits = await html.holmBits(env, url.origin);
  const mine = myWorkspaces(env, ctx);
  const canStart = !ctx.member || canCreateWorkspace(env, ctx);
  const spaces = exampleWorkspaces(env, ctx);
  const host = url.host;
  const primary = mine.length
    ? `<a class="l-btn l-primary" href="/studio">Open Studio</a>`
    : canStart ? `<a class="l-btn l-primary" href="/new">Start writing</a>` : '';
  const secondary = spaces.length ? `<a class="l-btn" href="#examples">See an example</a>` : '';
  const closed = !canStart && !mine.length
    ? `<p class="l-note">${margin.signups === 'invite' ? 'Margin is invite-only here. Open the invite link you were sent to join a workspace.' : 'New workspaces here are started by invitation. Anyone can sign in to read and comment.'}</p>` : '';
  const examples = spaces.length ? `<section class="l-section" id="examples">
      <div class="l-section-head"><h2>See it in use</h2>${spaces.some((w) => w.sample) ? '<p>Sample workspaces. The teams and their posts are made up.</p>' : ''}</div>
      <div class="l-grid">${spaces.map((w) => example(env, ctx, w, host)).join('')}</div>
    </section>` : '';
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHTML(margin.name)} — ${escapeHTML(margin.tagline || 'A place for your team to write')}</title>
<meta name="description" content="Start a workspace, invite the people who write, and let Claude help draft posts and answer comments.">
<link rel="canonical" href="${escapeHTML(url.origin)}/">
<meta property="og:site_name" content="${escapeHTML(margin.name)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(margin.name)}">
<meta property="og:description" content="A quiet place for your team to write.">
<meta property="og:image" content="${escapeHTML(url.origin)}/social_preview.png">
<meta name="twitter:card" content="summary_large_image">
${bits.head}
<link rel="preload" href="/v/${v}/themes/editorial/newsreader-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/v/${v}/margin/ui.css">
<link rel="stylesheet" href="/v/${v}/margin/landing.css">
<script>${html.THEME_SCRIPT}</script>
</head>
<body class="l-page">
<header class="l-bar">
  <a class="l-brand" href="/">${MARK}<span>${escapeHTML(margin.name)}</span></a>
  <nav class="l-nav">${spaces.length ? '<a href="#examples">Examples</a>' : ''}${html.ACCOUNT}</nav>
</header>
<main>
  <section class="l-hero" id="top">
    <h1>A quiet place for your team to write.</h1>
    <p class="l-lead">Start a workspace, invite the people who write, and let Claude help draft posts and answer comments.</p>
    <div class="l-ctas">${primary}${secondary}</div>
    ${closed}
    <p class="l-url">${escapeHTML(host)}/<em>yourteam</em>/@<em>you</em></p>
  </section>
  ${examples}
  <section class="l-section">
    <h2>Three steps</h2>
    <div class="l-steps">
      <div class="l-step"><span class="l-num">1</span><h3>Start a workspace</h3><p>Give it a name and it's live at its own address. Pick a theme and a cover style, or keep the defaults.</p><code>${escapeHTML(host)}/lumen</code></div>
      <div class="l-step"><span class="l-num">2</span><h3>Invite your team</h3><p>Send a link. Each writer gets a page of their own, and can write under a persona if they like.</p><code>/lumen/@maya</code></div>
      <div class="l-step"><span class="l-num">3</span><h3>Connect Claude</h3><p>Add Margin as a connector. Claude drafts and edits your posts and answers comments, as you.</p><code>posts_create</code></div>
    </div>
  </section>
  <section class="l-close">
    <h2>Your team has things to say.</h2>
    ${mine.length ? '<a class="l-btn l-primary" href="/studio">Open Studio</a>' : canStart ? '<a class="l-btn l-primary" href="/new">Start a workspace</a>' : ''}
  </section>
</main>
<footer class="l-foot">${html.HOLM_LINK}<a href="https://github.com/holmhq/unofficial-apps/tree/main/margin" target="_blank" rel="noopener">Source</a><a href="/llms.txt">For agents</a>${html.FEEDBACK_BUTTON}</footer>
${html.foot({ page: 'landing', signin: env.holm.auth.getLoginURL('/'), ws: null }, bits, v)}
</body>
</html>`;
  // The landing page knows who is reading (Open Studio or Start writing), so it is never cached.
  const policy = html.csp(await html.scriptHashes([html.THEME_SCRIPT, ...bits.scripts]), url.host, bits.origins);
  return new Response(page, { headers: { ...html.pageHeaders(null, policy), 'Cache-Control': 'private, no-cache' } });
}
