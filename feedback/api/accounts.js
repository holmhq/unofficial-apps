// Agent accounts: an agent adding feedback to a site it builds makes an
// account with no sign-in. Holm makes it solve a challenge first and allows
// ten a minute from one address (the accounts.create contract in main.js).
// One account is one project, and its key reaches only that project.
//
// Until someone keeps it, a project takes no files and at most
// DAILY_LIMIT items a day, and it is deleted after 90 days nobody used its
// key or its inbox links. Anyone who opens one of its inbox links may keep it
// in their own account, once (claimLink).
import { ds, now, text, reject, random, requireMember, profile } from './lib.js'
import { createProject, findProject, projectDTO, deleteProject } from './projects.js'
import { issueKey } from './keys.js'

export const DAILY_LIMIT = 100
const UNUSED_MS = 90 * 86400000

const avatarOf = id => '/auth/avatar?seed=' + encodeURIComponent(id)

// Without a schedule to run on, the sweep runs when an account is made, a
// few at a time.
function prune() {
  const old = ds().find('accounts', { claimedBy: '', lastUsedAt: { $lt: now() - UNUSED_MS } }, { limit: 5 })
  for (const account of old) {
    const who = { id: account.id }
    if (findProject(account.project)) deleteProject(who, account.project)
    ds().delete('apikeys', { ownerId: account.id })
    ds().delete('links', { ownerId: account.id })
    ds().delete('accounts', { id: account.id })
  }
}

export async function createAccount(input) {
  prune()
  const name = text(input.name, 60)
  if (!name) reject(400, 'invalid_name', 'Name the project: the site or app it is for.')
  const id = 'acct_' + random(20)
  const who = { id, name, avatar: avatarOf(id) }
  const made = createProject(who, { name, origins: input.origins || [], ...(input.color ? { color: input.color } : {}) })
  ds().update('projects', { id: made.id }, { $set: { account: id } })
  ds().insert('accounts', { id, project: made.id, createdAt: now(), lastUsedAt: now(), claimedBy: '', claimedAt: null })
  const { key } = await issueKey(who, name, made.id)
  return { account: id, key, project: projectDTO(findProject(made.id)) }
}

// An inbox link's session keeps its project in the signed-in member's
// account. Only the first claim wins.
export function claim(user) {
  const member = profile(requireMember())
  const project = findProject(user.project)
  const account = project?.account && ds().findOne('accounts', { id: project.account })
  const taken = () => reject(409, 'claimed', 'This inbox is already in someone’s account.')
  if (!account || account.claimedBy) taken()
  const won = ds().update('accounts', { id: account.id }, { $set: { claimedBy: member.id, claimedAt: now() } }, { ifRevision: account._rev })
  if (!won.ok || !won.count) taken()
  const owner = { ownerId: member.id, ownerName: member.name, ownerAvatar: member.avatar }
  ds().update('projects', { id: project.id }, { $set: { ownerId: member.id, account: '' } })
  ds().update('apikeys', { ownerId: account.id }, { $set: owner })
  ds().update('links', { ownerId: account.id }, { $set: owner })
  return { project: project.id }
}

// Whether a project still waits for someone to keep it.
export const claimable = projectId => !!findProject(projectId)?.account
