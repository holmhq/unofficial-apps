// Who may do what: a straight port of upstream SwarmChat's policy.py (5ee0c0e, MIT).
//
// Roles: the super admin (the swarm's admin token, or a workspace owner or admin acting on the swarm),
// administrators and channel creators (users the rules name), a channel's managers, and members.
// Each action lists the roles that may take it; the rules' `allow` replaces that list. Until the rules
// name administrators the swarm is open: any member also does what a manager does (OPEN).
// Rules: {admins, channel_creators, contacts, symmetric, posters, history, allow}.

export const SUPER = 'superadmin', ADMIN = 'admin', CREATOR = 'channel_creator', MANAGER = 'manager', MEMBER = 'member';
export const ROLES = {
  [SUPER]: 'the super admin', [ADMIN]: 'an administrator', [CREATOR]: 'someone chosen to create channels',
  [MANAGER]: 'a channel manager', [MEMBER]: 'a member',
};

export const ACTIONS = {
  add_user: ['add users', [SUPER]],
  remove_user: ['remove users', [SUPER]],
  rotate_token: ['give someone else a new token', [SUPER]],
  show_rules: ['see the rules', [SUPER, ADMIN]],
  edit_admins: ['choose the administrators', [SUPER]],
  edit_channel_creators: ['choose who may create channels', [SUPER, ADMIN]],
  create_channel: ['create a channel', [CREATOR, ADMIN]],
  add_members: ['add people to a channel', [MEMBER]],
  remove_members: ['remove someone else from a channel', [MANAGER, ADMIN]],
  rename_channel: ['rename a channel', [MANAGER, ADMIN]],
  describe_channel: ["change a channel's description", [MANAGER, ADMIN]],
  make_private: ['make a channel private', [MANAGER, ADMIN]],
  make_public: ['make a private channel public', [ADMIN]],
  archive_channel: ['archive or unarchive a channel', [MANAGER, ADMIN]],
  set_managers: ["choose a channel's managers", [MANAGER, ADMIN]],
  delete_message: ["delete another person's message", [ADMIN]],
};
const OPEN = ['remove_members', 'rename_channel', 'describe_channel', 'make_private', 'make_public', 'archive_channel', 'set_managers'];

export class RuleError extends Error {}

function users(rules, key) {
  const list = rules[key];
  if (list === undefined || list === null) return null;
  if (!Array.isArray(list) || !list.every((u) => typeof u === 'string')) throw new RuleError(`${key} is a list of user ids.`);
  return new Set(list.map((u) => u.trim().toLowerCase()));
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export class Policy {
  constructor(rules) {
    this.rules = rules || {};
    const r = this.rules;
    this.contacts = null;
    if (r.contacts !== undefined && r.contacts !== null) {
      if (!isObject(r.contacts)) throw new RuleError('contacts maps each user id to a list of user ids.');
      this.contacts = new Map();
      for (const [user, others] of Object.entries(r.contacts)) {
        if (!Array.isArray(others)) throw new RuleError('contacts maps each user id to a list of user ids.');
        this.contacts.set(user, new Set(others));
      }
      if (r.symmetric ?? true) {
        for (const [user, others] of [...this.contacts]) {
          for (const other of others) {
            if (!this.contacts.has(other)) this.contacts.set(other, new Set());
            this.contacts.get(other).add(user);
          }
        }
      }
    }
    this.posters = null;
    if (r.posters !== undefined && r.posters !== null) {
      if (!isObject(r.posters)) throw new RuleError('posters maps channels to lists of user ids.');
      this.posters = new Map();
      for (const [chat, list] of Object.entries(r.posters)) {
        if (!Array.isArray(list)) throw new RuleError('posters maps channels to lists of user ids.');
        this.posters.set(chat.trim().replace(/^#+/, '').trim().toLowerCase(), new Set(list));
      }
    }
    this.admins = users(r, 'admins');
    this.creators = users(r, 'channel_creators');
    this.history = r.history ?? 'all';
    if (this.history !== 'all' && this.history !== 'while_member') throw new RuleError('history is "all" or "while_member".');
    const allow = r.allow ?? {};
    if (!isObject(allow)) throw new RuleError('allow maps actions to lists of roles.');
    for (const [action, roles] of Object.entries(allow)) {
      if (!(action in ACTIONS)) throw new RuleError(`There is no action '${action}'. The actions are ${Object.keys(ACTIONS).join(', ')}.`);
      if (!Array.isArray(roles) || !roles.every((x) => x in ROLES)) {
        throw new RuleError(`allow.${action} is a list of roles: ${Object.keys(ROLES).join(', ')}.`);
      }
    }
    this.allow = {};
    for (const [action, [, roles]] of Object.entries(ACTIONS)) this.allow[action] = roles;
    if (this.admins === null) for (const action of OPEN) this.allow[action] = [MEMBER];
    for (const [action, roles] of Object.entries(allow)) this.allow[action] = [...new Set(roles)];
  }

  admin(user) { return this.admins !== null && this.admins.has(user); }

  roles(user, managers) {
    if (user === null) return new Set([SUPER]);
    const roles = new Set([MEMBER]);
    if (this.admin(user)) roles.add(ADMIN);
    if (this.creators === null || this.creators.has(user)) roles.add(CREATOR);
    if (managers && managers.includes(user)) roles.add(MANAGER);
    return roles;
  }

  check(action, roles) {
    const allowed = this.allow[action];
    if (allowed.some((r) => roles.has(r))) return null;
    const what = ACTIONS[action][0];
    if (!allowed.length) return `No one may ${what}.`;
    return `Only ${allowed.map((r) => ROLES[r]).join(' or ')} may ${what}.`;
  }

  reach(user, others) {
    if (this.contacts === null) return null;
    const mine = this.contacts.get(user) || new Set();
    const blocked = others.filter((o) => o !== user && !mine.has(o)).sort();
    return blocked.length ? `${user} may not contact ${blocked.join(', ')}.` : null;
  }

  // Posting or editing. `channel` is the channel's name, or null in a direct chat.
  send(user, members, channel, chatId) {
    if (!channel) return this.reach(user, members);
    if (this.posters === null) return null;
    const allowed = this.posters.get(channel.toLowerCase()) ?? this.posters.get(chatId || '');
    if (!allowed || allowed.has(user)) return null;
    return `Only ${[...allowed].sort().join(', ')} may post in #${channel}.`;
  }

  react(user, members, channel) { return channel ? null : this.reach(user, members); }
  create(user, members) { return this.reach(user, members); }
  add(user, members, added) { return this.reach(user, added); }
  join() { return null; }
}
