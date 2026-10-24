// Relay — realtime client. Vanilla WebSocket to Holm's /_ws endpoint.
// Channel-based pub/sub. Auto (re)subscribes on reconnect, exp-backoff, heartbeat.

let ws = null;
let attempts = 0;
let pingTimer = null;
let reconnectTimer = null;
let manualClose = false;

const channels = new Map();      // channel -> Set<handler(data)>
const stateCbs = new Set();
let state = 'disconnected';

function setState(s) { state = s; stateCbs.forEach((cb) => { try { cb(s); } catch (_e) {} }); }
export function onState(cb) { stateCbs.add(cb); cb(state); return () => stateCbs.delete(cb); }

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return proto + '//' + location.host + '/_ws';
}
function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch (_e) {}
  }
}
function subscribe(channel) { send({ type: 'subscribe', channel: channel }); }
function unsubscribe(channel) { send({ type: 'unsubscribe', channel: channel }); }

export function connect() {
  if (manualClose) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  setState('connecting');
  try {
    ws = new WebSocket(wsUrl());
  } catch (_e) {
    scheduleReconnect();
    return;
  }
  ws.onopen = function () {
    attempts = 0;
    setState('connected');
    channels.forEach(function (_h, ch) { subscribe(ch); });
    startPing();
  };
  ws.onmessage = function (event) {
    var lines = typeof event.data === 'string' ? event.data.split('\n') : [event.data];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line || !line.trim()) continue;
      var msg;
      try { msg = JSON.parse(line); } catch (_e) { continue; }
      handleMessage(msg);
    }
  };
  ws.onclose = function () {
    stopPing();
    setState('disconnected');
    if (!manualClose) scheduleReconnect();
  };
  ws.onerror = function () { /* onclose will handle reconnect */ };
}

function handleMessage(msg) {
  if (!msg) return;
  // Heartbeat protocol: answer server pings, ignore pongs.
  if (msg.type === 'ping') { send({ type: 'pong' }); return; }
  if (msg.type === 'pong' || msg.type === 'subscribed' || msg.type === 'welcome' || msg.type === 'error') return;

  var ch = msg.channel;
  var payload = (msg.data !== undefined && msg.data !== null) ? msg.data : msg;
  if (ch && channels.has(ch)) {
    channels.get(ch).forEach(function (h) { try { h(payload); } catch (e) { console.error('[relay rt]', e); } });
  }
}

function startPing() {
  stopPing();
  pingTimer = setInterval(function () { send({ type: 'ping' }); }, 25000);
}
function stopPing() { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } }

function scheduleReconnect() {
  if (reconnectTimer) return;
  var delay = Math.min(1000 * Math.pow(2, attempts), 16000);
  attempts++;
  reconnectTimer = setTimeout(function () {
    reconnectTimer = null;
    connect();
  }, delay);
}

// Subscribe to a channel with a handler. Returns an unsubscribe that also
// drops the channel subscription when the last handler is removed.
export function channel(name, handler) {
  if (!channels.has(name)) channels.set(name, new Set());
  channels.get(name).add(handler);
  if (ws && ws.readyState === WebSocket.OPEN) subscribe(name);
  else connect();
  return function () {
    var set = channels.get(name);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      channels.delete(name);
      if (ws && ws.readyState === WebSocket.OPEN) unsubscribe(name);
    }
  };
}

export function disconnect() {
  manualClose = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  stopPing();
  if (ws) { ws.onclose = null; try { ws.close(); } catch (_e) {} ws = null; }
  setState('disconnected');
}

export function getState() { return state; }
