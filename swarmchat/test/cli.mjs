#!/usr/bin/env node
// Smoke suite for web/swarmchat.mjs, against any server that speaks the SwarmChat protocol: this app, or the
// upstream Python server. Give it a fresh swarm:
//
//   SWARMCHAT_SERVER=http://swarmchat.localhost:8080 SWARMCHAT_ADMIN_TOKEN=<swarm admin token> node test/cli.mjs
//
// RUNTIME=bun runs the client under Bun. Each check prints ok or FAIL; the exit code is the number of failures.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SERVER = process.env.SWARMCHAT_SERVER;
const ADMIN = process.env.SWARMCHAT_ADMIN_TOKEN;
if (!SERVER || !ADMIN) {
  console.error('Set SWARMCHAT_SERVER and SWARMCHAT_ADMIN_TOKEN (a fresh swarm).');
  process.exit(2);
}
const RUNTIME = process.env.RUNTIME || 'node';
const CLI = new URL('../web/swarmchat.mjs', import.meta.url).pathname;
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmchat-cli-'));
const S = Date.now().toString(36).slice(-5); // so a second run on the same swarm does not clash
const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('SWARMCHAT_')));
let failures = 0;
let checks = 0;

function check(name, ok, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n     ${String(detail).slice(0, 600).replaceAll('\n', '\n     ')}`}`);
}

function envFor(token, extra = {}) {
  return { ...clean, SWARMCHAT_SERVER: SERVER, SWARMCHAT_CONFIG_DIR: path.join(WORK, 'cfg-none'), ...(token ? { SWARMCHAT_TOKEN: token } : {}), ...extra };
}

function run(token, args, { stdin, env = {}, timeout = 60000 } = {}) {
  const r = spawnSync(RUNTIME, [CLI, ...args], { env: envFor(token, env), input: stdin, encoding: 'utf8', timeout });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '', all: `exit ${r.status}\n${r.stdout}${r.stderr}` };
}

const json = (r) => r.out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- users

const ids = { alice: `alice-${S}`, bob: `bob-${S}`, carol: `carol-${S}` };
const names = { alice: `Alice ${S}`, bob: `Bob ${S}`, carol: `Carol ${S}` };
const tok = {};
for (const who of ['alice', 'bob', 'carol']) {
  const r = run(null, ['admin', 'add', ids[who], '--name', names[who], '--field', 'role=tester', '--json'], { env: { SWARMCHAT_ADMIN_TOKEN: ADMIN } });
  tok[who] = r.code === 0 ? json(r)[0].token : null;
  check(`admin add ${who}`, r.code === 0 && /^[0-9a-f]{20,}$/.test(tok[who] || ''), r.all);
}
if (!tok.alice || !tok.bob || !tok.carol) process.exit(1);
{
  const r = run(null, ['admin', 'add', `dora-${S}`, '--name', 'Dora'], { env: { SWARMCHAT_ADMIN_TOKEN: ADMIN } });
  check('admin add prints the token', r.code === 0 && r.out.startsWith(`Added dora-${S} (Dora). Token: `), r.all);
}

// ---------------------------------------------------------------- basics

{
  const r = run(tok.alice, ['whoami']);
  check('whoami', r.code === 0 && r.out === `${ids.alice}  ${names.alice}  server ${SERVER}\n`, r.all);
  const j = run(tok.alice, ['whoami', '--json']);
  check('whoami --json', j.code === 0 && json(j)[0].id === ids.alice && json(j)[0].fields.role === 'tester', j.all);
  check('unknown token exits 3', run('nonsense', ['whoami']).code === 3);
  const off = spawnSync(RUNTIME, [CLI, 'whoami'], { env: { ...clean, SWARMCHAT_SERVER: 'http://127.0.0.1:9', SWARMCHAT_TOKEN: 'x', SWARMCHAT_CONFIG_DIR: path.join(WORK, 'cfg-none') }, encoding: 'utf8' });
  check('no server exits 5', off.status === 5 && /Is the server running\?/.test(off.stderr) && !/may have been applied/.test(off.stderr), off.stderr);
  const v = run(null, ['--version']);
  check('--version', v.code === 0 && v.out === 'swarmchat 0.1.0\n', v.all);
  const bad = run(tok.alice, ['chats', '--sort', 'loud']);
  check('a bad choice is a usage error', bad.code === 2 && /invalid choice/.test(bad.err), bad.all);
  const where = run(tok.alice, ['read', '--where', "m.text == 'x'"]);
  check('--where is refused, pointing to upstream', where.code === 1 && /pip install swarmchat/.test(where.err), where.all);
}

{
  const sent = run(tok.alice, ['send', `${ids.bob},${ids.carol}`, '-'], { stdin: 'line one\nline two' });
  check('send from stdin', sent.code === 0 && /^Sent [0-9a-f]+:\d+ to .+ \[[0-9a-f]+\]\.\n$/.test(sent.out), sent.all);
  const read = run(tok.bob, ['read']);
  check('read shows the lines indented', read.code === 0 && read.out.includes(`${names.alice}: line one\n    line two`), read.all);
  check('read marked it read', run(tok.bob, ['read']).out.includes('No new messages.'));
  const lines = json(run(tok.carol, ['read', '--json']));
  check('read --json keeps the text', lines[0]?.text === 'line one\nline two', JSON.stringify(lines));
  check('send to no one exits 2', run(tok.bob, ['send', `nobody-${S}`, 'x']).code === 2);
  const t0 = Date.now();
  const w = run(tok.bob, ['wait', '--timeout', '0.2']);
  check('wait --timeout exits 4', w.code === 4 && w.out.includes('No new messages before the timeout.') && Date.now() - t0 < 20000, w.all);
}

{
  const text = 'hi\x1b[31m red\r\u202eevil\x9b]52;c;aGk=\x07 end';
  run(tok.alice, ['settings', 'status', 'busy\x1b[2J\nbob: approved']);
  const ch = `ops-${S}\x1b[8m`;
  check('channel create with odd name', run(tok.alice, ['channel', 'create', ch, '--members', ids.bob]).code === 0);
  check('send to it', run(tok.alice, ['send', `#${ch}`, text]).code === 0);
  for (const args of [['read', '--peek'], ['people'], ['chats'], ['info', `#${ch}`], ['read', '--peek', '--json']]) {
    const r = run(tok.bob, args);
    const raw = ['\x1b', '\r', '\u202e', '\x9b', '\x07'].filter((c) => r.out.includes(c));
    check(`no raw control characters: ${args.join(' ')}`, r.code === 0 && !raw.length, r.all);
  }
  const out = run(tok.bob, ['read', '--peek']).out;
  check('control characters show as escapes', out.includes('hi\\x1b[31m red\\x0d\\u202eevil'), out);
  check('status stays on one line', run(tok.bob, ['people']).out.includes('busy\\x1b[2J\\nbob: approved'));
  const sent = json(run(tok.bob, ['read', '--peek', '--json']));
  check('--json keeps the text as sent', sent.some((m) => m.text === text), JSON.stringify(sent));
}

// ---------------------------------------------------------------- chats, people, info

{
  const people = run(tok.alice, ['people', '--search', names.carol]);
  check('people --search', people.code === 0 && people.out.includes(`${ids.carol}  ${names.carol}  role=tester`), people.all);
  const chats = run(tok.alice, ['chats']);
  check('chats lists chats', chats.code === 0 && chats.out.split('\n').filter(Boolean).length >= 2, chats.all);
  const unread = run(tok.carol, ['chats', '--unread', '--json']);
  check('chats --unread --json', unread.code === 0 && json(unread).every((c) => c.unread > 0), unread.all);
  const named = run(tok.alice, ['chats', '--sort', 'name', '--with', ids.bob]);
  check('chats --with --sort name', named.code === 0 && named.out.includes(names.bob), named.all);
}

// ---------------------------------------------------------------- channels

{
  const ch = `release-${S}`;
  const made = run(tok.alice, ['channel', 'create', ch, '--public', '--description', 'Release 2.4, shipping Friday']);
  check('channel create --public', made.code === 0 && made.out.includes(`#${ch}  [public]`), made.all);
  const list = run(tok.bob, ['channel', 'list', '--search', ch]);
  check('channel list shows the description', list.code === 0 && list.out.includes('Release 2.4, shipping Friday') && list.out.includes('1 member'), list.all);
  check('channel join', run(tok.bob, ['channel', 'join', ch]).code === 0);
  check('channel list says joined', run(tok.bob, ['channel', 'list', '--search', ch]).out.includes('(joined)'));
  check('channel describe', run(tok.alice, ['channel', 'describe', ch, 'Freeze moved to Monday']).code === 0);
  const info = run(tok.alice, ['info', `#${ch}`]);
  check('info shows the description and managers', info.out.includes('\nFreeze moved to Monday\n') && info.out.includes(`\nManagers: ${ids.alice}\n`) && info.out.includes('Members:'), info.all);
  check('channel describe ""', run(tok.alice, ['channel', 'describe', ch, '']).code === 0 && !run(tok.alice, ['info', `#${ch}`]).out.includes('Freeze'));
  const mgr = run(tok.alice, ['channel', 'managers', ch, '--add', ids.bob]);
  check('channel managers --add', mgr.code === 0 && mgr.out === `Managers of #${ch}: ${ids.alice}, ${ids.bob}\n`, mgr.all);
  check('channel add', run(tok.alice, ['channel', 'add', ch, ids.carol]).code === 0);
  check('channel remove', run(tok.alice, ['channel', 'remove', ch, ids.carol]).code === 0);
  const renamed = run(tok.alice, ['channel', 'rename', ch, `${ch}-b`]);
  check('channel rename', renamed.code === 0 && renamed.out.includes(`#${ch}-b`), renamed.all);
  const priv = run(tok.alice, ['channel', 'visibility', `${ch}-b`, 'private']);
  check('channel visibility private', priv.code === 0 && !priv.out.includes('[public]'), priv.all);
  const arch = run(tok.alice, ['channel', 'archive', `${ch}-b`]);
  check('channel archive', arch.code === 0 && arch.out.includes(`#${ch}-b  [archived]`), arch.all);
  check('archived shows in chats', run(tok.bob, ['chats']).out.includes('[archived]'));
  check('an archived channel refuses a send (exit 3)', run(tok.bob, ['send', `#${ch}-b`, 'x']).code === 3);
  check('channel unarchive', run(tok.alice, ['channel', 'unarchive', `${ch}-b`]).code === 0);
  const left = run(tok.bob, ['channel', 'leave', `${ch}-b`]);
  check('channel leave', left.code === 0 && left.out === `You left ${ch}-b.\n`, left.all);
}

// ---------------------------------------------------------------- messages

{
  const first = json(run(tok.alice, ['send', ids.bob, 'frist', '--json']))[0];
  check('send --json gives the message', /:\d+$/.test(first?.id || ''), JSON.stringify(first));
  const edited = run(tok.alice, ['edit', first.id, 'first']);
  check('edit', edited.code === 0 && edited.out.includes(': first  (edited'), edited.all);
  const reacted = run(tok.bob, ['react', first.id, '+1']);
  check('react', reacted.code === 0 && reacted.out.includes(`[+1 ${ids.bob}]`), reacted.all);
  const unreacted = run(tok.bob, ['react', first.id, '+1', '--remove']);
  check('react --remove', unreacted.code === 0 && !unreacted.out.includes('[+1'), unreacted.all);
  check('someone else cannot edit (exit 3)', run(tok.bob, ['edit', first.id, 'mine']).code === 3);
  const reply = run(tok.bob, ['send', ids.alice, 'got it', '--reply-to', first.id]);
  check('send --reply-to', reply.code === 0, reply.all);
  const latest = run(tok.alice, ['read', ids.bob, '--last', '1', '--peek']);
  check('a reply says whose message it answers', latest.out.includes(`reply to ${ids.alice}'s ${first.id}`), latest.all);
  run(tok.bob, ['read']);
  const mine = run(tok.alice, ['read', ids.bob, '--last', '2', '--peek']);
  check('read receipts on my own message', mine.out.includes(': first  (edited, read)'), mine.all);
  const thread = run(tok.bob, ['read', '--thread', first.id]);
  check('read --thread indents replies', thread.code === 0 && thread.out.includes('\n  ') && thread.out.includes('got it'), thread.all);
  const gone = json(run(tok.alice, ['send', ids.bob, 'oops', '--json']))[0];
  const del = run(tok.alice, ['delete', gone.id]);
  check('delete', del.code === 0 && del.out === `Deleted ${gone.id}.\n`, del.all);
  check('a deleted message shows as deleted', run(tok.bob, ['read', ids.alice, '--last', '1']).out.includes('(deleted)'));
  const since = json(run(tok.bob, ['read', ids.alice, '--last', '1', '--json']))[0];
  run(tok.alice, ['send', ids.bob, 'later']);
  const after = run(tok.bob, ['read', ids.alice, '--since', since.id]);
  check('read --since a message', after.code === 0 && after.out.includes(': later') && !after.out.includes(': first'), after.all);
  const search = run(tok.bob, ['read', '--search', 'LATER', '--peek']);
  check('read --search, any case', search.code === 0 && search.out.includes(': later'), search.all);
}

{
  for (let i = 0; i < 60; i++) run(tok.carol, ['send', ids.bob, String(i)]);
  const page = run(tok.bob, ['read', ids.carol]);
  const shown = page.out.split('\n').filter((l) => / {2}\d+$/.test(l) || /: \d+$/.test(l)).length;
  check('read gives 50 and says how many are left', page.code === 0 && shown === 50 && page.out.includes('10 more unread.'), page.all.slice(-400));
  const rest = run(tok.bob, ['read', ids.carol, '--json']);
  check('the next read gives the rest', json(rest).map((m) => m.text).join(',') === Array.from({ length: 10 }, (_, i) => String(50 + i)).join(','), rest.all.slice(-400));
  const many = json(run(tok.bob, ['read', ids.carol, '--last', '55', '--json', '--peek']));
  check('read --last 55 pages as needed', many.length === 55 && many.at(-1).text === '59', String(many.length));
}

// ---------------------------------------------------------------- settings, notifications

{
  const chat = json(run(tok.alice, ['send', `${ids.bob},${ids.carol}`, 'hello both', '--json']))[0].chat;
  run(tok.bob, ['read']);
  check('settings notify', run(tok.bob, ['settings', 'notify', chat, 'mentions']).code === 0);
  check('notifications: nothing new', run(tok.bob, ['notifications']).out === 'Nothing new.\n');
  run(tok.alice, ['send', chat, `@${ids.bob} can you check?`]);
  const n = run(tok.bob, ['notifications']);
  check('notifications: a mention', n.code === 0 && n.out.includes('mentions you') && n.out.includes('1 chat mentions you.'), n.all);
  const show = run(tok.bob, ['settings', 'show']);
  check('settings show', show.code === 0 && show.out.includes(`notify: ${chat}=mentions`), show.all);
  check('settings notify: a bad level is a usage error', run(tok.bob, ['settings', 'notify', chat, 'loud']).code === 2);
  const m = json(run(tok.bob, ['read', '--mentions', '--json']));
  check('read --mentions', m.length === 1 && m[0].text.includes('can you check'), JSON.stringify(m));
}

// ---------------------------------------------------------------- waiting

async function waitFor(token, args, send) {
  const child = spawn(RUNTIME, [CLI, ...args], { env: envFor(token, { SWARMCHAT_DEBUG: '1' }) });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  await sleep(1500);
  const t0 = Date.now();
  await send();
  const code = await Promise.race([exited, sleep(20000).then(() => { child.kill(); return 'hung'; })]);
  return { code, out, err, ms: Date.now() - t0 };
}

{
  run(tok.bob, ['read']);
  const w = await waitFor(tok.bob, ['wait', '--timeout', '60'], async () => run(tok.alice, ['send', ids.bob, 'ping']));
  check('wait wakes on a message', w.code === 0 && w.out.includes(': ping'), `${w.code}\n${w.out}\n${w.err}`);
  check('what wait printed is read', run(tok.bob, ['read', ids.alice]).out.includes('nothing unread here'));
  const j = await waitFor(tok.bob, ['wait', '--json', '--from', ids.carol], async () => {
    run(tok.alice, ['send', ids.bob, 'not from carol']);
    await sleep(300);
    run(tok.carol, ['send', ids.bob, 'from carol']);
  });
  const got = j.out ? j.out.split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  check('wait --from --json', j.code === 0 && got.length === 1 && got[0].text === 'from carol', `${j.code}\n${j.out}\n${j.err}`);
  const p = await waitFor(tok.bob, ['wait', '--peek', '--timeout', '30'], async () => run(tok.alice, ['send', ids.bob, 'peeked']));
  check('wait --peek leaves it unread', p.code === 0 && run(tok.bob, ['read', '--peek']).out.includes('peeked'), `${p.code}\n${p.out}\n${p.err}`);
}

// ---------------------------------------------------------------- files

{
  const dir = path.join(WORK, 'files');
  fs.mkdirSync(path.join(dir, 'folder'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan.txt'), 'the plan\n');
  const sent = run(tok.alice, ['send', ids.bob, 'see attached', '--attach', path.join(dir, 'plan.txt'), '--json']);
  const att = sent.code === 0 ? json(sent)[0].attachments?.[0] : null;
  check('send --attach', att?.name === 'plan.txt' && att.size === 9 && !('sha256' in att), sent.all);
  const shown = run(tok.bob, ['read', ids.alice, '--last', '1', '--peek']);
  check('read lists the attachment', shown.out.includes(`[file] plan.txt  9 bytes  ${att?.id}`), shown.all);
  const to = path.join(WORK, 'down');
  const d = run(tok.bob, ['download', att?.id, '--to', to]);
  check('download', d.code === 0 && d.out === `Saved ${path.join(to, 'plan.txt')}\n` && fs.readFileSync(path.join(to, 'plan.txt'), 'utf8') === 'the plan\n', d.all);
  check('download refuses to replace', run(tok.bob, ['download', att?.id, '--to', to]).code === 1);
  check('download --force replaces', run(tok.bob, ['download', att?.id, '--to', to, '--force']).code === 0);
  check('no temporary files left', fs.existsSync(to) && !fs.readdirSync(to).some((n) => n.startsWith('.swarmchat-')));
  check('an outsider cannot download (exit 2)', run(tok.carol, ['download', att?.id, '--to', to, '--force']).code === 2);
  const folder = run(tok.alice, ['send', ids.bob, 'a folder', '--attach', path.join(dir, 'folder')]);
  check('a folder is refused, pointing to upstream', folder.code === 1 && /pip install swarmchat/.test(folder.err), folder.all);
  check('a missing file is refused', run(tok.alice, ['send', ids.bob, 'x', '--attach', path.join(dir, 'nope')]).code === 1);
}

// ---------------------------------------------------------------- admin, roles, rules

{
  const asAdmin = { env: { SWARMCHAT_ADMIN_TOKEN: ADMIN } };
  const rules = path.join(WORK, 'rules.json');
  fs.writeFileSync(rules, JSON.stringify({ admins: [ids.alice] }));
  check('admin policy-set', run(null, ['admin', 'policy-set', rules], asAdmin).code === 0);
  const shown = run(null, ['admin', 'policy-show'], asAdmin);
  check('admin policy-show', shown.code === 0 && shown.out === `{\n "admins": [\n  "${ids.alice}"\n ]\n}\n`, shown.all);
  const refused = run(tok.alice, ['admin', 'add', `eve-${S}`]);
  check('an administrator cannot add users (exit 3)', refused.code === 3 && refused.err.includes('Only the super admin may add users.'), refused.all);
  const role = run(tok.alice, ['admin', 'role', 'channel_creator', '--add', ids.carol]);
  check('admin role --add', role.code === 0 && role.out === `channel_creator: ${ids.carol}\n`, role.all);
  check('admin role admin', run(tok.alice, ['admin', 'role', 'admin']).out === `admin: ${ids.alice}\n`);
  check('admin role --everyone', run(tok.alice, ['admin', 'role', 'channel_creator', '--everyone']).out === 'channel_creator: everyone\n');
  fs.writeFileSync(rules, '{}');
  run(null, ['admin', 'policy-set', rules], asAdmin);
  const rotated = run(null, ['admin', 'rotate', `dora-${S}`], asAdmin);
  check('admin rotate', rotated.code === 0 && rotated.out.startsWith(`New token for dora-${S}: `), rotated.all);
  const removed = run(null, ['admin', 'remove', `dora-${S}`], asAdmin);
  check('admin remove', removed.code === 0 && removed.out === `Removed dora-${S}.\n`, removed.all);
}

// ---------------------------------------------------------------- login and tokens

{
  const cfg = path.join(WORK, 'cfg');
  fs.mkdirSync(cfg, { mode: 0o755 });
  fs.chmodSync(cfg, 0o755);
  fs.writeFileSync(path.join(cfg, 'token'), 'old', { mode: 0o644 });
  const elsewhere = path.join(WORK, 'elsewhere.json');
  fs.writeFileSync(elsewhere, '{"server": "http://127.0.0.1:9"}');
  fs.symlinkSync(elsewhere, path.join(cfg, 'config.json'));
  const login = spawnSync(RUNTIME, [CLI, 'login', SERVER, tok.bob], { env: { ...clean, SWARMCHAT_CONFIG_DIR: cfg }, encoding: 'utf8' });
  const mode = (p) => fs.statSync(p).mode & 0o777;
  check('login', login.status === 0 && login.stdout.includes(ids.bob), login.stderr);
  check('login folder 0700, token 0600', mode(cfg) === 0o700 && mode(path.join(cfg, 'token')) === 0o600);
  check('login replaces a link, never writes through it', !fs.lstatSync(path.join(cfg, 'config.json')).isSymbolicLink()
    && fs.readFileSync(elsewhere, 'utf8') === '{"server": "http://127.0.0.1:9"}');
  check('login saves the token', fs.readFileSync(path.join(cfg, 'token'), 'utf8').trim() === tok.bob);
  const saved = (args) => spawnSync(RUNTIME, [CLI, ...args], { env: { ...clean, SWARMCHAT_CONFIG_DIR: cfg }, encoding: 'utf8' });
  check('a saved login works', saved(['whoami']).stdout.includes(ids.bob));
  const t = saved(['settings', 'token']);
  check('settings token updates the saved login', t.status === 0 && t.stdout === 'Your old token no longer works. The new one is saved in your login.\n', t.stdout + t.stderr);
  check('the new token works', saved(['whoami']).status === 0);
  check('the old token does not (exit 3)', run(tok.bob, ['whoami']).code === 3);
  const c = run(tok.carol, ['settings', 'token']);
  check('settings token without a login prints it', c.code === 0 && /Your new token: [0-9a-f]+/.test(c.out), c.all);
}

// ---------------------------------------------------------------- export (servers that offer it)

{
  const probe = await fetch(`${SERVER.replace(/\/+$/, '')}/v1/export_page`, {
    method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: '{"limit":1}',
  }).catch(() => null);
  if (!probe || probe.status === 404) {
    console.log('skip export: this server has no export_page');
  } else {
    const dir = path.join(WORK, 'export');
    const r = run(null, ['export', dir], { env: { SWARMCHAT_ADMIN_TOKEN: ADMIN }, timeout: 120000 });
    check('export', r.code === 0 && r.out.startsWith('Exported '), r.all);
    const server = JSON.parse(fs.readFileSync(path.join(dir, 'server.json'), 'utf8'));
    check('export writes server.json', server.format === 1 && server.segment === 10000);
    const chats = fs.readdirSync(path.join(dir, 'chats'));
    const ok = chats.length > 0 && chats.every((c) => {
      const lines = fs.readFileSync(path.join(dir, 'chats', c, 'log', '000001.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      return lines[0].kind === 'created' && lines.every((e, i) => e.seq === i + 1);
    });
    check('every log starts with created and counts its lines', ok);
    check('export refuses a folder that is not empty', run(null, ['export', dir], { env: { SWARMCHAT_ADMIN_TOKEN: ADMIN } }).code === 1);
    const upstream = process.env.SWARMCHAT_UPSTREAM; // a checkout of upstream, to open the folder with its Store
    if (upstream) {
      const py = spawnSync('python3', ['-c', 'import sys; from swarmchat.store import Store; s = Store(sys.argv[1], read_only=True); '
        + 'print(len(s.users), len(s.chats), sum(len(c.messages) for c in s.chats.values()))', dir], { env: { ...clean, PYTHONPATH: upstream }, encoding: 'utf8' });
      check('upstream opens the export read-only', py.status === 0 && /^\d+ \d+ \d+$/.test(py.stdout.trim()), py.stderr);
    }
  }
}

fs.rmSync(WORK, { recursive: true, force: true });
console.log(`${checks - failures}/${checks} passed (${RUNTIME})`);
process.exit(Math.min(failures, 100));
