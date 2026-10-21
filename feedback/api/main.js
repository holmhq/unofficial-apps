// Holm App Spec v1 entry for server code written in Holm's original app format, which is kept
// unchanged in ./_legacy_main.js. API paths go to that handler; everything else is web/.
import { bind, takeResponded } from "./_holm.js";
import handler from "./_legacy_main.js";
import { projectFactory, publicConfig } from "./projects.js";
import { itemFactory } from "./items.js";
import { statsFactory } from "./stats.js";
import { profile, reject } from "./lib.js";

export const contract = {
  "operations": {
    "projects.get": {
      "handler": "getProject", "auth": "public", "risk": "read",
      "summary": "Read a feedback widget's public configuration",
      "description": "Use a project id from an embed snippet to read the widget's appearance, kinds, contact rules, rating and questions before submitting. Never returns the owner, allowed sites or inbox.",
      "input": { "type": "object", "properties": { "projectId": { "type": "string" } }, "required": ["projectId"], "additionalProperties": false },
      "output": { "type": "object" },
      "errors": { "APP_NOT_FOUND": { "status": 404, "public": true } }
    },
    "feedback.submit": {
      "handler": "submitFeedback", "auth": "public", "risk": "write", "idempotency": "required", "sensitive": true,
      "summary": "Send text or rated feedback with safe keyed retries",
      "description": "Submit JSON feedback to a widget project using its current form rules, allowed sites and hourly spam cap. Read projects.get first. Supply the source page url when sites are restricted, and reuse one Idempotency-Key only for retries of the same input. No attachments; use the existing multipart widget route for files.",
      "input": {
        "type": "object",
        "properties": {
          "projectId": { "type": "string" }, "body": { "type": "string" }, "url": { "type": "string" },
          "kind": { "type": "string" }, "email": { "type": "string" }, "phone": { "type": "string" },
          "rating": { "type": ["number", "string"] }, "answers": { "type": ["object", "string"] },
          "title": { "type": "string" }, "viewport": { "type": "string" }, "website": { "type": "string" }
        },
        "required": ["projectId"], "additionalProperties": false
      },
      "output": { "type": "object" },
      "errors": {
        "APP_NOT_FOUND": { "status": 404, "public": true },
        "APP_SITE_NOT_ALLOWED": { "status": 403, "public": true },
        "APP_BUSY": { "status": 429, "public": true },
        "APP_INVALID_BODY": { "status": 400, "public": true },
        "APP_MISSING_ANSWER": { "status": 400, "public": true },
        "APP_INVALID_EMAIL": { "status": 400, "public": true },
        "APP_MISSING_EMAIL": { "status": 400, "public": true },
        "APP_INVALID_PHONE": { "status": 400, "public": true },
        "APP_MISSING_PHONE": { "status": 400, "public": true },
        "APP_MISSING_RATING": { "status": 400, "public": true }
      }
    },
    "items.list": {
      "handler": "listInbox", "auth": "member", "risk": "read", "sensitive": true,
      "summary": "Read your own project's private feedback inbox",
      "description": "Use while signed in as the project's owner to review its newest 1,000 items, including private contact details and file metadata. Optionally filter by open, new, planned, progress, done or closed. Other members cannot read this inbox.",
      "input": { "type": "object", "properties": { "projectId": { "type": "string" }, "status": { "type": "string" } }, "required": ["projectId"], "additionalProperties": false },
      "output": { "type": "object" },
      "errors": { "APP_NOT_FOUND": { "status": 404, "public": true }, "APP_UNAUTHORIZED": { "status": 401, "public": true } }
    },
    "items.done": {
      "handler": "markDone", "auth": "member", "risk": "write", "idempotency": "optional", "sensitive": true,
      "summary": "Mark an item in your own project as done",
      "description": "Use after resolving feedback while signed in as its project's owner. Changes only the status to done, records the same private thread event as dashboard triage, and returns the updated item. Optionally send an Idempotency-Key for safe retries.",
      "input": { "type": "object", "properties": { "itemId": { "type": "string" } }, "required": ["itemId"], "additionalProperties": false },
      "output": { "type": "object" },
      "errors": { "APP_NOT_FOUND": { "status": 404, "public": true }, "APP_UNAUTHORIZED": { "status": 401, "public": true } }
    },
    "stats.get": {
      "handler": "getStats", "auth": "member", "risk": "read", "sensitive": true,
      "summary": "Read your own project's dashboard counts",
      "description": "Use while signed in as the project's owner to inspect daily visits, QR scans, email visits, form opens, submissions, votes and comments, plus source pages, kinds and ratings. Choose 7, 30 or 90 days; the default is 30. Counts are events, not unique visitors.",
      "input": { "type": "object", "properties": { "projectId": { "type": "string" }, "days": { "type": "number" } }, "required": ["projectId"], "additionalProperties": false },
      "output": { "type": "object" },
      "errors": { "APP_NOT_FOUND": { "status": 404, "public": true }, "APP_UNAUTHORIZED": { "status": 401, "public": true }, "APP_INVALID_RANGE": { "status": 400, "public": true } }
    }
  }
};

// Only declared application errors are exposed; runtime failures stay private.
function operation(run) {
  try { return { ok: true, ...run() }; }
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

export function listInbox(input, env, ctx) {
  return operation(() => ({ items: itemFactory(env).listItems(signedInOwner(env), input.projectId, input.status) }));
}

export function markDone(input, env, ctx) {
  return operation(() => ({ item: itemFactory(env).updateItem(signedInOwner(env), input.itemId, { status: "done" }) }));
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
