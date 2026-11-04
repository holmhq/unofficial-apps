// Writes api/contract.json, the tools Claude sees through Holm's MCP endpoint:
// node tools/contract.mjs. Each error code the tools can return is declared once here.
import { writeFileSync } from 'node:fs'

const errors = {}
for (const [code, status] of Object.entries({ APP_UNAUTHORIZED: 401, APP_FORBIDDEN: 403, APP_NOT_FOUND: 404, APP_INVALID_INPUT: 400, APP_CONFLICT: 409, APP_INVALID: 422, APP_RATE_LIMITED: 429 })) {
  errors[code] = { status, public: true }
}
const obj = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false })
const tool = (handler, risk, summary, description, input, extra = {}) => ({ handler, auth: 'user', risk, summary, description, input, output: { type: 'object' }, errors, ...extra })

const operations = {
  'items.list': tool('opList', 'read', 'List what’s on your shelf',
    'Lists saved links, newest first: unread by default, or archived, favourites, all, or feed (new posts from the sites and channels the person follows, not yet saved). Each has an id, title, site, reading time in minutes, reading progress, tags and a link to open it in Shelf. Use items_read with an id to read one, and items_update with state "unread" to save a feed post to the reading list.',
    obj({
      show: { type: 'string', enum: ['unread', 'archived', 'favourites', 'all', 'feed'], description: 'Which links: unread (the reading list, default), archived (finished), favourites, all, or feed (posts from followed feeds, unseen first).' },
      tag: { type: 'string', maxLength: 40, description: 'Only links with this tag.' },
      max_minutes: { type: 'integer', minimum: 1, maximum: 600, description: 'Only articles that take at most this many minutes to read.' },
      longest_first: { type: 'boolean', description: 'Sort by length instead of by when they were saved.' },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'How many to return (default 30).' }
    })),
  'items.read': tool('opRead', 'read', 'Read a saved article',
    'Returns the readable text of a saved article with its title, site, summary if one was made, and the person’s highlights and notes. Long articles come in parts: pass next_offset as offset to read on.',
    obj({
      id: { type: 'string', minLength: 6, maxLength: 64, description: 'The item id from items_list or items_search.' },
      offset: { type: 'integer', minimum: 0, description: 'Character to start from (default 0).' },
      length: { type: 'integer', minimum: 2000, maximum: 60000, description: 'Characters to return (default 30000).' }
    }, ['id'])),
  'items.search': tool('opSearch', 'read', 'Search your shelf',
    'Full-text search through saved articles, titles, sites, tags, notes and highlights. Returns matching items with the passage that matched, and matching highlights.',
    obj({
      query: { type: 'string', minLength: 1, maxLength: 120, description: 'Words to look for.' },
      limit: { type: 'integer', minimum: 1, maximum: 30, description: 'How many items to return (default 10).' }
    }, ['query'])),
  'items.save': tool('opSave', 'write', 'Save a link to read later',
    'Saves an https link to the person’s reading list, optionally with tags and a note saying why. Saving a link that’s already there brings it back to the top. Pass the article’s text if you have read it, and it is readable at once; otherwise Shelf fetches the article the next time it’s open on any of their devices.',
    obj({
      url: { type: 'string', minLength: 8, maxLength: 2000, description: 'The full https:// address.' },
      title: { type: 'string', maxLength: 300, description: 'Its title, if you know it; Shelf reads the real one when it fetches the page.' },
      note: { type: 'string', maxLength: 2000, description: 'Why it’s worth reading, shown with the link.' },
      tags: { type: 'array', items: { type: 'string', maxLength: 32 }, maxItems: 8, description: 'Short lowercase tags, such as "design" or "rust".' },
      text: { type: 'string', maxLength: 200000, description: 'The article itself, if you have already read it: paragraphs separated by blank lines, with # headings, - lists, > quotes and [links](https://…) if you like. With it the article is readable at once; without it Shelf fetches the page later.' },
      author: { type: 'string', maxLength: 120, description: 'Who wrote it, if you pass text.' },
      site: { type: 'string', maxLength: 80, description: 'The site or publication, if you pass text.' }
    }, ['url']), { idempotency: 'optional' }),
  'items.update': tool('opUpdate', 'write', 'Archive, favourite or tag a saved link',
    'Moves a link to the archive (finished) or back to the reading list, marks it a favourite, or replaces its tags or note. Only the fields you pass change.',
    obj({
      id: { type: 'string', minLength: 6, maxLength: 64, description: 'The item id.' },
      state: { type: 'string', enum: ['unread', 'archived'], description: 'unread puts it on the reading list; archived files it as finished.' },
      favourite: { type: 'boolean' },
      tags: { type: 'array', items: { type: 'string', maxLength: 32 }, maxItems: 12, description: 'The full new list of tags.' },
      note: { type: 'string', maxLength: 2000 }
    }, ['id']), { idempotency: 'optional' }),
  'highlights.list': tool('opHighlights', 'read', 'Read your highlights',
    'Returns the passages the person highlighted, with their notes and which article each came from: from one article (pass its id) or the most recent from all of them.',
    obj({
      id: { type: 'string', minLength: 6, maxLength: 64, description: 'Only this article’s highlights.' },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'How many (default 50).' }
    }))
}
for (const op of Object.values(operations)) if (op.risk === 'read') op.sensitive = true

writeFileSync(new URL('../api/contract.json', import.meta.url), JSON.stringify({ operations }, null, 1) + '\n')
console.log('contract.json: ' + Object.keys(operations).length + ' operations')
