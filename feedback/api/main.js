// Holm App Spec v1 entry for server code written in Holm's original app format, which is kept
// unchanged in ./_legacy_main.js. API paths go to that handler; everything else is web/.
import { bind, takeResponded } from "./_holm.js";
import handler from "./_legacy_main.js";
import { projectFactory, publicConfig, listProjects } from "./projects.js";
import { itemFactory } from "./items.js";
import { statsFactory } from "./stats.js";
import { profile, reject } from "./lib.js";
import { createAccount as makeAccount } from "./accounts.js";
import { sendCode as mailCode, verifyCode as checkCode } from "./follow.js";

// Only declared application errors are exposed; runtime failures stay private.
function operation(run) {
  try { return { ok: true, ...run() }; }
  catch (error) {
    if (error.public) error.code = "APP_" + error.code.toUpperCase();
    throw error;
  }
}

// The same, for handlers that wait on hashing.
async function operationAsync(run) {
  try { return { ok: true, ...(await run()) }; }
  catch (error) {
    if (error.public) error.code = "APP_" + error.code.toUpperCase();
    throw error;
  }
}

function signedInOwner(env) {
  const member = env.holm.auth.getMember();
  if (!member?.id || env.holm.auth.isAnonymous()) reject(401, "unauthorized", "Sign in first.");
  return profile(member);
}

// The original-format helpers it reuses read `holm` bound per call.
export function createAccount(input, env, ctx) {
  bind(env.holm);
  return operationAsync(() => makeAccount(input));
}

export function sendCode(input, env, ctx) {
  bind(env.holm);
  return operationAsync(() => mailCode(input));
}

export function verifyCode(input, env, ctx) {
  bind(env.holm);
  return operationAsync(() => checkCode(input));
}

export function getProject(input, env, ctx) {
  return operation(() => {
    const doc = projectFactory(env).findProject(input.projectId);
    if (!doc) reject(404, "not_found", "This feedback form isn’t set up.");
    return { project: publicConfig(doc) };
  });
}

export function submitFeedback(input, env, ctx) {
  return operation(() => itemFactory(env).submitToWidget(input.projectId, input, { headers: {}, files: {} }));
}

// The projects the caller owns, with what waits in each: what Claude reads first.
export function listOwnProjects(input, env, ctx) {
  bind(env.holm);
  return operation(() => ({
    projects: listProjects(signedInOwner(env)).map(p => ({
      id: p.id, name: p.name, for: p.for, page: p.board, sites: p.sites, waiting: p.waiting, createdAt: p.createdAt
    }))
  }));
}

export function listInbox(input, env, ctx) {
  return operation(() => ({ items: itemFactory(env).listItems(signedInOwner(env), input.projectId, input.status, input.limit ?? 100) }));
}

export function markDone(input, env, ctx) {
  return operation(() => ({ item: itemFactory(env).updateItem(signedInOwner(env), input.itemId, { status: "done" }) }));
}

export function createItem(input, env, ctx) {
  return operation(() => ({ item: itemFactory(env).fileItem(signedInOwner(env), input.projectId, input) }));
}

export function shareItem(input, env, ctx) {
  return operation(() => ({ item: itemFactory(env).updateItem(signedInOwner(env), input.itemId, { share: input.share }) }));
}

export function getStats(input, env, ctx) {
  return operation(() => {
    const project = projectFactory(env).ownProject(signedInOwner(env), input.projectId);
    // Read operations must not prune storage. Raw stats routes still do.
    return statsFactory(env, { prune: false }).projectStats(project, input.days);
  });
}


const API_PREFIXES = ["/api"];
const JSON_TYPE = /^application\/(?:[\w.-]+\+)?json\s*(?:;|$)/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!API_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
      return env.holm.web.fetch(request);
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
  const out = { method: request.method, path: url.pathname, origin: url.origin, query, headers };
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
