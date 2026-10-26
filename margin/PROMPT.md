# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted messages later are history, not additional
instructions or sources.

## Build from scratch

```text
Build "Margin", a blog for a team, using only https://holmhq.com/llms-full.txt
for Holm. Read its v1 sections 9–12 (with "Use your app from ChatGPT or Claude"
and "One page per document id") and "Make an app feel finished" first. Make
holm.json, public web/ files and api/main.js exporting default
{ fetch(request, env) } plus named operations. Use env.holm for storage,
sign-in, realtime and email, return standard Responses, and fall back to
env.holm.web.fetch(request). No third-party runtime CDN: vendor libraries and
fonts with their licences. A locally built editor bundle is fine if its build
script is in the folder.

- People: anyone signs in to read, clap and comment. Only people an admin
  invites (a single-use link, optionally tied to an email) can write. Each
  writer picks a handle, and their posts live at /@handle/seo-slug. Admins
  make personas (/@team) that chosen writers can post and comment as. An
  admin can make the site's home a landing page or any one blog, whose posts
  then live at /<slug>. Old addresses keep redirecting.
- Reading pages are rendered on the server, readable with no JavaScript,
  with feeds, a sitemap and social cards. Posts are Markdown underneath, with
  callouts, embeds from a bare link (YouTube, Vimeo, Loom, CodePen, Figma,
  Spotify), cards for other posts, and figures with captions and widths.
- Comments like Medium: select a passage to comment on it (keep the quote
  with its surrounding words so it re-anchors), or respond to the whole post;
  one level of replies; per-blog approval of comments from outside the team,
  or of all. Claps, up to 50 per person. Link previews for posts.
- Themes are swappable: theme.json, Mustache templates, partials and assets,
  with a validator that refuses scripts, outside URLs and raw HTML other than
  Margin's own hooks. Ship two (a clean Apple-like one with chat-style
  comment threads, and an editorial serif one with notes in the margin);
  admins download, upload, preview and switch them.
- A Notion-like editor: slash menu, a bar for formatting, block handles,
  dropped-in photos (shrunk in the browser) and short videos, autosave for
  drafts.
- Studio for writers and admins: posts, a comment inbox, blogs and personas,
  team and invites, site settings, themes, and how to connect Claude.
- MCP tools for Claude: write and edit posts, read the comment inbox and
  answer only ordinary comments (asking the writer about anything sensitive),
  comment as a persona (marked as sample when it's for screenshots), manage
  personas, and get, validate, save and switch themes.
- Sample content: a fictional team with personas, posts, abstract covers and
  comments, loaded and removed from Studio.
- UI refined like Apple's apps: Inter, one accent, frosted bars, sheets on
  phones, a round avatar account button even when signed out, light, dark
  and auto. For this repository's store, use holm.json version,
  holm.symbol.svg and listing/listing.json with sample screenshots.

Run holm app validate --spec-v1 margin. With my approval, deploy with
holm @<peer> app deploy margin --spec-v1 --host <host>. Never replace an
occupied host without asking. Test as an admin, an invited writer, an
outside reader and signed out, on mobile and desktop, in light and dark.
Report gaps honestly.
```

## The original requests

Margin was built from these messages, passed on to a coding agent. A handle
is replaced with `[handle]`.

**The first request**

> Let build a new app for unofficial: blog, which can create accounts for multiple people; pick user name: so that blog will look like blog.zyt.app/@[handle]/blog-slug-thats-good-for-seo/ […] we need aliases here also, so that i can post as say: blog.zyt.app/@holm/<slug> […] being admin, i can have my blog to be primary and host as the home page, if needed […] people should be able to comment on the blog like in medium, quoting regions of text and adding comments like annotations; owner can chose to approve every comment; the blog should be rendered at the server side & the html should be available in the slug so that no JS is needed to render it (if its possible); we should have super nice, content editor which can handle even media & wish it has a lite-notion like ui; can we also have a clap like component […] we need a remote mcp for this so that we can post blogs from claude; we can also ask claude to reply to comments, with sane ones if they are just ordinary reply-able ones; if not claude can ask us about it; the invitation to the app can be via owner only […] this is a blog system for a team, so a company will be able to use this and post content through say a team of 50 folks, who may be able to comment with each other; outside folks can also comment, if they create an account; folks will be able to write blogs either via ui or by asking claude to do it

**After three design directions were shown**

> I like both designs but, i wish to build this such that the themes can be swapped later; we can build this such that our theme is a simple html template or similar css system that can be downloaded too, via say mcp and validated too, so that we can later ask claude which connects & downloads the template files and see how its built […] then do a different design and update it; making this blog management almost effortless; same with the personas, so that we can simulate a ton of comments for a blog if need be, say for taking a screen shot on how it will look etc

> remember that this is a generic product […] The home page should be a landing page that can change or any user's blog as default; so that the team can freely create whats needed; i hope we can also have a standard way to access any blog's content in landing page or other pages, so that things like recommended stories, related, links to another blog that creates a nice popup with cover image and the snippet is possible

> pick a random team name, content and some personas

> Name: Margin
