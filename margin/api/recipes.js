// A workspace's cover recipe: how a writer's own assistant should make a cover picture in the
// workspace's style. Margin makes no pictures; it keeps the recipe, picks the next background
// tone so neighbouring covers differ, and hands the whole thing out (covers_prompt). The
// workspace stores only the parts its owners changed; the rest follows its drawn-cover style.
import { reject } from './lib/util.js';
import { TONES, STRONG } from './covers.js';
import { mediaInfo, variantPath, fullPath, srcsetFor } from './media.js';

const LIMITS = { style: 3000, subjects: 1000, alt: 300, name: 30, tones: 8, references: 4 };
const HEX = /^#[0-9a-f]{6}$/i;
const FIELDS = ['style', 'subjects', 'tones', 'accent', 'references', 'alt'];

// Margin's own framing: where its pages crop a cover. Not part of the recipe, so it stays true.
export const FRAMING = 'One centred subject with generous empty space around it. Keep the whole subject inside the middle 60% of the frame\'s width and the middle 65% of its height, with clear background above and below, because the picture is cropped to 16:9 on pages and 1.9:1 in link previews. Landscape composition.';
export const IMAGE = { width: 1536, height: 1024, aspect: '3:2', format: 'PNG or JPEG', safe_area: 'middle 60% of the width × middle 65% of the height', crops: ['16:9 on pages and cards', '1.9:1 in link previews'] };

const STYLE = {
  paper: 'An editorial cover illustration, drawn as a precise isometric technical line drawing, like an engineer\'s exploded-view diagram. Clean ink lines in three weights: a heavier silhouette line, medium edge lines, fine detail lines. Objects have real thickness, with opaque, flat-coloured faces and one soft, flat shadow on the ground. The whole frame is one flat, solid background colour: {tone}. Restricted palette: that background, off-white, two warm greys, ink black (#20242A), and {accent} used sparingly on one small element. No gradients, no glow, no texture, no photorealism, no 3D-render look, no people or faces, nothing cartoonish or childish. No text, letters, numbers, labels or logos anywhere.',
  flat: 'An editorial cover illustration, drawn as a precise isometric technical line drawing in near-black ink (#14161A), in three line weights: a heavier silhouette line, medium edges, fine details. Objects have real thickness, with opaque faces in lighter and darker shades of the background colour and one soft, flat shadow on the ground. The whole frame is one flat, solid background colour: {tone}. {accent} picks out one small element. No gradients, no glow, no texture, no photorealism, no people or faces, nothing cartoonish or childish. No text, letters, numbers, labels or logos anywhere.',
  blocks: 'An editorial cover illustration made of bold, flat isometric blocks with crisp white edge lines, on one flat, solid background colour: {tone}. Objects have real thickness, with faces in lighter and darker shades of the background colour, and {accent} on one small element. Simple, graphic and calm. No gradients, no glow, no texture, no photorealism, no people or faces, nothing cartoonish or childish. No text, letters, numbers, labels or logos anywhere.',
};
const SUBJECTS = 'Pick one object or small scene that stands for the post\'s idea: a metaphor, not a picture of the title\'s words. Real things (tools, machines, instruments, buildings, everyday objects) read best. Make it this post\'s own; don\'t reuse a subject from another cover.';
const ALT = 'One plain sentence, under 120 characters, saying what the picture shows (not what the post is about).';

// What a workspace gets before its owners change anything: its drawn covers' look and tone.
export function defaultRecipe(ws) {
  const look = (ws.cover && ws.cover.look) || 'paper';
  const tone = (ws.cover && TONES[ws.cover.tone]) ? ws.cover.tone : 'lilac';
  const base = { subjects: SUBJECTS, references: [], alt: ALT, style: STYLE[look] || STYLE.paper };
  if (look === 'flat') return { ...base, tones: [{ name: tone, hex: TONES[tone].toUpperCase() }], accent: { name: 'white', hex: '#FFFFFF' } };
  if (look === 'blocks') return { ...base, tones: [{ name: tone, hex: STRONG[tone].toUpperCase() }], accent: { name: 'sunflower yellow', hex: '#FFD84D' } };
  return { ...base, tones: [{ name: 'warm paper', hex: '#F2EEE5' }], accent: { name: 'vermilion', hex: '#FF6A3D' } };
}

// The recipe in force: the workspace's own parts over the default.
export function effectiveRecipe(ws, origin = '') {
  const own = ws.coverRecipe && typeof ws.coverRecipe === 'object' ? ws.coverRecipe : {};
  const out = { ...defaultRecipe(ws) };
  for (const key of FIELDS) if (own[key] !== undefined && own[key] !== null) out[key] = own[key];
  return { ...out, references: out.references.map((id) => reference(id, origin)).filter(Boolean), framing: FRAMING, custom: FIELDS.filter((k) => own[k] !== undefined && own[k] !== null) };
}

const reference = (id, origin) => ({ id, url: `${origin}/media/${id}` });

// Changes from workspace_update / Studio: only the fields sent change; null resets one field
// (or, for the whole recipe, all of them) to the default.
export function cleanRecipe(env, input, current) {
  if (input === null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject(400, 'invalid_input', 'cover_recipe is an object with any of style, subjects, tones, accent, references and alt (null resets).');
  const unknown = Object.keys(input).filter((k) => !FIELDS.includes(k));
  if (unknown.length) reject(400, 'invalid_input', `cover_recipe has no ${unknown.join(', ')}. Its parts are ${FIELDS.join(', ')}.`);
  const next = { ...(current && typeof current === 'object' ? current : {}) };
  for (const key of FIELDS) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value === null) { delete next[key]; continue; }
    next[key] = CLEAN[key](env, value);
  }
  return Object.keys(next).length ? next : null;
}

const words = (value, max, label) => {
  if (typeof value !== 'string') reject(400, 'invalid_input', `${label} is text.`);
  const v = value.replace(/\r\n?/g, '\n').trim();
  if (!v) reject(400, 'invalid_input', `${label} is empty; send null to go back to the default.`);
  if (v.length > max) reject(400, 'invalid_input', `${label} is ${max} characters at most.`);
  return v;
};
const colour = (value, label) => {
  if (!value || typeof value !== 'object') reject(400, 'invalid_input', `${label} is { name, hex }, such as { "name": "warm sand", "hex": "#E6DCC8" }.`);
  const name = words(value.name, LIMITS.name, `${label} name`);
  const hex = String(value.hex || '').trim();
  if (!HEX.test(hex)) reject(400, 'invalid_input', `${label} hex is a colour like #E6DCC8.`);
  return { name, hex: hex.toUpperCase() };
};
const CLEAN = {
  style: (env, v) => words(v, LIMITS.style, 'style'),
  subjects: (env, v) => words(v, LIMITS.subjects, 'subjects'),
  alt: (env, v) => words(v, LIMITS.alt, 'alt'),
  accent: (env, v) => colour(v, 'accent'),
  tones: (env, v) => {
    if (!Array.isArray(v) || !v.length || v.length > LIMITS.tones) reject(400, 'invalid_input', `tones is a list of 1 to ${LIMITS.tones} colours, each { name, hex }.`);
    const list = v.map((t, i) => colour(t, `tones[${i}]`));
    const names = new Set(list.map((t) => t.name.toLowerCase()));
    if (names.size !== list.length) reject(400, 'invalid_input', 'Each tone needs its own name.');
    return list;
  },
  references: (env, v) => {
    if (!Array.isArray(v) || v.length > LIMITS.references) reject(400, 'invalid_input', `references is a list of up to ${LIMITS.references} pictures: /media addresses of covers in this style.`);
    const ids = [];
    for (const item of v) {
      const m = /^(?:https?:\/\/[^/]+)?(?:\/media\/)?([a-z0-9]{6,20})(?:-[a-z0-9]+)?(?:\.[a-z0-9]{2,5})?$/.exec(String(item || '').trim());
      const info = m && mediaInfo(env, m[1]);
      if (!info || !/^image\/(png|jpeg|webp|avif|gif)$/.test(info.mime)) reject(400, 'invalid_input', `${item} is not a picture uploaded here. Use a /media address from media_list or a post's cover.`);
      if (!ids.includes(m[1])) ids.push(m[1]);
    }
    return ids;
  },
};

// A tone named by a writer (posts' cover_tone): one of the recipe's, by name.
export function toneName(ws, value) {
  if (value === null || value === '') return null;
  const tones = effectiveRecipe(ws).tones;
  const hit = tones.find((t) => t.name.toLowerCase() === String(value || '').trim().toLowerCase());
  if (!hit) reject(400, 'invalid_input', `cover_tone is one of ${tones.map((t) => `"${t.name}"`).join(', ')} (from covers_prompt).`);
  return hit.name;
}

const fill = (text, tone, accent) => text.split('{tone}').join(`${tone.name} (${tone.hex})`).split('{accent}').join(`${accent.name} (${accent.hex})`);

// Next tone: a post keeps the one it has; otherwise the one used least recently on the
// workspace's latest posts, so covers side by side on the home page differ.
export function nextTone(tones, recent, post) {
  const own = post && post.coverTone && tones.find((t) => t.name === post.coverTone);
  if (own) return own;
  const lastSeen = new Map();
  recent.forEach((p, i) => { if (p.coverTone && !lastSeen.has(p.coverTone)) lastSeen.set(p.coverTone, i); });
  const unused = tones.find((t) => !lastSeen.has(t.name));
  if (unused) return unused;
  return tones.reduce((best, t) => (lastSeen.get(t.name) > lastSeen.get(best.name) ? t : best), tones[0]);
}

// What covers_prompt answers: everything a writer's assistant needs to make one cover.
export function coverPrompt(env, ws, { recent, post, subject, origin }) {
  const recipe = effectiveRecipe(ws, origin);
  const tone = nextTone(recipe.tones, recent, post);
  const style = fill(recipe.style, tone, recipe.accent);
  const idea = typeof subject === 'string' && subject.trim() ? subject.trim().slice(0, 600) : '';
  const references = recipe.references.map((r) => {
    const info = mediaInfo(env, r.id);
    if (!info) return null;
    const path = info.width > 1280 && srcsetFor(r.id, info) ? variantPath(r.id, info, 'w1280') : fullPath(r.id, info);
    return { url: origin + path, alt: info.alt || '' };
  }).filter(Boolean);
  return {
    workspace: ws.slug,
    tone,
    accent: recipe.accent,
    prompt: idea ? `Subject: ${idea}\n\n${style}\n\n${FRAMING}` : null,
    style,
    framing: FRAMING,
    subjects: recipe.subjects,
    references,
    image: IMAGE,
    alt: recipe.alt,
    post: post ? { id: post.id, title: post.title, cover_tone: post.coverTone || null } : null,
    steps: [
      idea ? 'Make the picture from prompt with your own image tool, at the size in image (use the references as style references if your tool takes them).' : 'Read the post, then choose its subject as subjects says. Call covers_prompt again with subject (one or two sentences) for the full prompt, or put "Subject: …" before style and framing yourself.',
      'Look at it before using it: one subject, nothing in the crop margins, no text, the background in the tone.',
      'Upload it: call media_link and send the file to that link (with a shell: curl -F file=@cover.png -F alt="…" <link>), or give the link to the writer.',
      `Attach it: posts_update with cover (the /media address), cover_alt (${recipe.alt.replace(/\.$/, '').toLowerCase()}), and cover_tone "${tone.name}".`,
    ],
  };
}
