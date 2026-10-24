// Holm App Spec v1 entry for server code written in Holm's original app format, which is kept
// in ./_legacy_main.js. API paths go to that handler; pages get the store's data and their own
// link preview (see page below); everything else is web/.
import { bind, takeResponded } from "./_holm.js";
import handler, { boot } from "./_legacy_main.js";
import { REF } from "./index.js";

const API_PREFIXES = ["/api"];
const JSON_TYPE = /^application\/(?:[\w.-]+\+)?json\s*(?:;|$)/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!API_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
      const isPage = (request.method === "GET" || request.method === "HEAD") && !/\.[A-Za-z0-9]+$/.test(url.pathname);
      return isPage ? page(request, env, url) : env.holm.web.fetch(request);
    }
    bind(env.holm);
    const req = await originalRequest(request, url);
    if (req instanceof Response) return req;
    const result = await handler(req);
    return toResponse(result === undefined ? takeResponded() : result);
  },
};

// The request object of the original format: first value per query key and header,
// canonical header names, parsed JSON bodies, multipart fields and files.
async function originalRequest(request, url) {
  const query = {};
  for (const [k, v] of url.searchParams) if (!(k in query)) query[k] = v;
  const headers = {};
  for (const [k, v] of request.headers) {
    const name = k.replace(/(^|-)([a-z])/g, (_, d, c) => d + c.toUpperCase());
    if (!(name in headers)) headers[name] = v;
  }
  const out = { method: request.method, path: url.pathname, query, headers };
  if (request.method === "GET" || request.method === "HEAD") return out;
  const type = request.headers.get("content-type") || "";
  if (JSON_TYPE.test(type)) {
    const text = await request.text();
    try {
      out.body = text.trim() === "" ? undefined : JSON.parse(text);
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }
  } else if (/multipart\/form-data/i.test(type) && typeof request.formData === "function") {
    const form = await request.formData();
    const fields = {};
    const files = {};
    for (const [k, v] of form) {
      if (typeof v === "string") {
        if (!(k in fields)) fields[k] = v;
      } else if (!(k in files)) {
        files[k] = { name: v.name, type: v.type, size: v.size, data: await v.arrayBuffer() };
      }
    }
    if (Object.keys(fields).length) out.body = fields;
    out.files = files;
  }
  return out;
}

// The original format's answers: a Response, a { status, headers, body } object, or a bare body.
function toResponse(value) {
  if (value instanceof Response) return value;
  let status = 200;
  let headers = {};
  let body = value;
  if (value !== null && typeof value === "object" && !Array.isArray(value) &&
      !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value)) {
    status = typeof value.status === "number" ? Math.trunc(value.status) : 200;
    headers = value.headers && typeof value.headers === "object" ? value.headers : {};
    body = value.body;
  }
  const h = new Headers();
  for (const [k, v] of Object.entries(headers)) h.set(k, String(v));
  if (!h.has("content-type")) h.set("content-type", "application/json");
  const json = /application\/json/i.test(h.get("content-type"));
  if (body === undefined || body === null) return new Response(null, { status, headers: h });
  if (typeof body === "string") {
    return new Response(json ? body : base64OrText(body), { status, headers: h });
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return new Response(body, { status, headers: h });
  return new Response(JSON.stringify(body) + "\n", { status, headers: h });
}

// The original format decoded a non-JSON string body when it was valid standard base64.
function base64OrText(s) {
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return s;
  try {
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return s;
  }
}

// A page of the store: web/shell.html with the index, the tint and the viewer embedded as JSON,
// so the first paint needs no API call, and for /apps/<app> that app's title, description and
// cover as its link preview; /start, the guide, gets its own title and description. If the index can't be read, the page loads it from the API instead.
// The shell isn't called index.html because Holm serves a matching file before this handler runs.
async function page(request, env, url) {
  const response = await env.holm.web.fetch(new Request(new URL("/shell", url), request));
  if (!response.ok || !/text\/html/i.test(response.headers.get("content-type") || "")) return response;
  let html = await response.text();
  // Holm wrote the shell's own address into these; give them the page's.
  const here = url.origin + url.pathname;
  html = html.replace(/<link rel="canonical" href="[^"]*">/, () => `<link rel="canonical" href="${escapeHTML(here)}">`);
  html = meta(html, "property", "og:url", here);
  if (/^\/start\/?$/.test(url.pathname)) {
    html = text(html, "Get started with Holm – Unofficial Holm apps", "Get started with Holm",
      "Set up a Holm node in about ten minutes, then install any app in this store with one command, or build your own from a prompt.");
  }
  try {
    bind(env.holm);
    const ref = url.searchParams.get("ref") || "main";
    if (REF.test(ref)) {
      const data = boot(ref);
      const script = `<script type="application/json" id="boot">${scriptJSON(data)}</script>\n`;
      html = html.replace("</head>", () => script + "</head>");
      const match = /^\/apps\/([a-z0-9-]+)\/?$/.exec(url.pathname);
      const app = match && data.index.apps.find((a) => a.path === match[1]);
      if (app) html = describe(html, app, url.origin);
    }
  } catch {
    // The page still works without the embedded data.
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(request.method === "HEAD" ? null : html, { status: response.status, headers });
}

// JSON that is safe inside a <script> element.
function scriptJSON(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

// Set a <meta> tag's content, replacing the one Holm injected or adding it.
function meta(html, attr, key, value) {
  const tag = `<meta ${attr}="${key}" content="${escapeHTML(value)}">`;
  const pattern = new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, "\\$&")}" content="[^"]*">`);
  return pattern.test(html) ? html.replace(pattern, () => tag) : html.replace("</head>", () => tag + "\n</head>");
}

// A page's title, and its name and description in its link preview.
function text(html, title, name, description) {
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHTML(title)}</title>`);
  for (const [attr, key, value] of [
    ["name", "description", description],
    ["property", "og:title", name],
    ["property", "og:description", description],
    ["name", "twitter:title", name],
    ["name", "twitter:description", description],
  ]) html = meta(html, attr, key, value);
  return html;
}

// An app page's link preview: its name, the first paragraph of its listing and its cover.
function describe(html, app, origin) {
  const listing = app.listing || {};
  const first = String(listing.description || app.description || "").split(/\n\s*\n/)[0];
  const description = first.length > 200 ? first.slice(0, 199).replace(/\s+\S*$/, "") + "…" : first;
  html = text(html, `${app.title} – Unofficial Holm apps`, app.title, description);
  const cover = listing.cover;
  if (cover) {
    const image = `${origin}/api/media/${app.path}/cover.png${cover.hash ? `?v=${cover.hash}` : ""}`;
    const alt = `${app.title}: ${listing.subtitle || app.description || ""}`;
    for (const [attr, key, value] of [
      ["property", "og:image", image],
      ["property", "og:image:type", "image/png"],
      ["property", "og:image:width", String(cover.width)],
      ["property", "og:image:height", String(cover.height)],
      ["property", "og:image:alt", alt],
      ["name", "twitter:image", image],
      ["name", "twitter:image:alt", alt],
    ]) html = meta(html, attr, key, value);
  }
  return html;
}
