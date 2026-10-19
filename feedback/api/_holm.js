// Per-request `holm` and `respond` for server code written in Holm's original app format.
// ./main.js calls bind(env.holm) before each request; the original files import from here.

export let holm;
let responded;

export function bind(envHolm) {
  const store = envHolm.private;
  const path = (p) => "private/" + String(p).replace(/^\/+/, "");
  holm = Object.create(envHolm, {
    private: {
      enumerable: true,
      value: store && {
        read: (p) => store.read(path(p)),
        readJSON: (p) => store.readJSON(path(p)),
        exists: (p) => store.exists(path(p)),
        list: () => store.list().filter((p) => p.startsWith("private/")).map((p) => p.slice(8)),
      },
    },
  });
  responded = undefined;
  // Original-format code may also reach these as globals (globalThis.holm, typeof holm).
  globalThis.holm = holm;
  globalThis.respond = respond;
}

// respond(), respond(body), respond(status), respond(status, body[, headers])
export function respond(...args) {
  let out;
  if (args.length === 0) out = { status: 200, body: null };
  else if (args.length === 1) out = typeof args[0] === "number" ? { status: args[0], body: null } : { status: 200, body: args[0] };
  else out = { status: typeof args[0] === "number" ? args[0] : 200, body: args[1], headers: args.length > 2 ? args[2] : undefined };
  responded = out;
  return out;
}

export function takeResponded() {
  return responded;
}
