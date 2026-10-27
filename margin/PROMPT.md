# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted messages later are history, not additional
instructions or sources.

## Build from scratch

```text
Build "Margin", a writing platform for teams, using only
https://holmhq.com/llms-full.txt for Holm. Read its v1 sections 9–12 (with
"Use your app from ChatGPT or Claude" and "One page per document id") and
"Make an app feel finished" first. Make
holm.json, public web/ files and api/main.js exporting default
{ fetch(request, env) } plus named operations. Use env.holm for storage,
sign-in, realtime and email, return standard Responses, and fall back to
env.holm.web.fetch(request). No third-party runtime CDN: vendor libraries and
fonts with their licences. A locally built editor bundle is fine if its build
script is in the folder.

- A minimal, elegant front page: what Margin is, two example workspaces, and
  the way in. Anyone signs in, picks a name and handle, starts a workspace for
  their team (/<workspace>), and invites people with single-use links. Writers'
  posts live at /<workspace>/@<handle>/seo-slug; a workspace can post as
  itself. One person can be in many workspaces, with a role in each (owner,
  admin, writer). Old addresses keep redirecting.
- Everyone can keep personas: other names to write and comment under. Readers
  must not be able to tell personas are the same person; a workspace's owners
  see which names their members use there.
- Margin's admins (the node's) choose who can join (anyone; anyone to comment
  with workspaces by invitation; invited only), make the front page Margin's
  landing, one workspace or one writer, pick the examples, and suspend
  workspaces. A workspace's owners make its home the latest posts, a curated
  set of pinned posts, or one writer's page.
- Reading pages are rendered on the server, readable with no JavaScript,
  with feeds, a sitemap and social cards. Posts are Markdown underneath, with
  callouts, embeds from a bare link, cards for other posts, and figures.
- Every post without a photo gets a drawn cover: an isometric technical line
  drawing (one projection, three line weights, flat colour, small labels) in
  the workspace's style (paper, a flat tone, or blocks), with a subject the
  writer picks, that reacts to the pointer. Save a PNG of it for link previews.
- Comments like Medium: select a passage to comment on it (keep the quote
  with its surrounding words so it re-anchors), or respond to the whole post;
  one level of replies; anyone signed in comments anywhere, as any of their
  names; each workspace shows comments at once, holds those from outside its
  team, or holds all. Claps, up to 50 per person. Link previews for posts.
- Themes are swappable: theme.json, Mustache templates, partials and assets,
  with a validator that refuses scripts, outside URLs and raw HTML other than
  Margin's own hooks. Ship two (a clean Apple-like one with chat-style comment
  threads, and an editorial serif one with notes in the margin). Margin's
  admins add themes; each workspace picks one.
- A Notion-like editor: slash menu, a bar for formatting, block handles,
  dropped-in photos (shrunk in the browser) and short videos, autosave.
- Studio with a workspace switcher: posts, a comment inbox, team and invites,
  workspace settings, your names and personas, Claude, and Margin's settings
  for its admins. MCP tools for Claude that take a workspace: write and edit
  posts, answer only ordinary comments (asking about anything sensitive),
  comment under any of your names, manage personas, start and run workspaces,
  and work on themes. A short /llms.txt for agents.
- Sample content: two fictional teams with their own logos (made with
  holm app identity), writers, posts and comments, loaded from Studio.
- UI refined like Apple's apps: Inter, one accent, frosted bars, sheets on
  phones, a round avatar account button even when signed out, light, dark
  and auto. For this repository's store, use holm.json version,
  holm.symbol.svg and listing/listing.json with sample screenshots.

Run holm app validate --spec-v1 margin. With my approval, deploy with
holm @<peer> app deploy margin --spec-v1 --host <host>. Never replace an
occupied host without asking. Test as an admin, a workspace owner, an invited
writer, an outside reader and signed out, on mobile and desktop, in light and
dark. Report gaps honestly.
```

## The original requests

Margin was built from these messages, passed on to a coding agent. A handle
is replaced with `[handle]`, and example names of real people and companies
with placeholders.

**The first request**

> Let build a new app for unofficial: blog, which can create accounts for multiple people; pick user name: so that blog will look like blog.zyt.app/@[handle]/blog-slug-thats-good-for-seo/ […] we need aliases here also, so that i can post as say: blog.zyt.app/@holm/<slug> […] being admin, i can have my blog to be primary and host as the home page, if needed […] people should be able to comment on the blog like in medium, quoting regions of text and adding comments like annotations; owner can chose to approve every comment; the blog should be rendered at the server side & the html should be available in the slug so that no JS is needed to render it (if its possible); we should have super nice, content editor which can handle even media & wish it has a lite-notion like ui; can we also have a clap like component […] we need a remote mcp for this so that we can post blogs from claude; we can also ask claude to reply to comments, with sane ones if they are just ordinary reply-able ones; if not claude can ask us about it; the invitation to the app can be via owner only […] this is a blog system for a team, so a company will be able to use this and post content through say a team of 50 folks, who may be able to comment with each other; outside folks can also comment, if they create an account; folks will be able to write blogs either via ui or by asking claude to do it

**After three design directions were shown**

> I like both designs but, i wish to build this such that the themes can be swapped later; we can build this such that our theme is a simple html template or similar css system that can be downloaded too, via say mcp and validated too, so that we can later ask claude which connects & downloads the template files and see how its built […] then do a different design and update it; making this blog management almost effortless; same with the personas, so that we can simulate a ton of comments for a blog if need be, say for taking a screen shot on how it will look etc

> remember that this is a generic product […] The home page should be a landing page that can change or any user's blog as default; so that the team can freely create whats needed; i hope we can also have a standard way to access any blog's content in landing page or other pages, so that things like recommended stories, related, links to another blog that creates a nice popup with cover image and the snippet is possible

> pick a random team name, content and some personas

> Name: Margin

**Margin 0.2.0: from one team's blog to a place where any team writes**

> i want margin to be like this: it should have a minimal / elegant landing page; anyone can create an account and create a workspace, say for their team; then invite anyone from there team to post blogs; most of the behaviour stays the same; so that the structure of Margin will look like: margin.zyt.app/[company]/@[person] […] the admin of Margin can optionally close strangers from creating accounts; make the workspace's home the home of the app; or any individuals blog to be home; or curate the workspace;s home with blogs from any team member […] so anyone can land to a writing platform, create account, connect their claude, and start posting […] on home screen we can show two examples […] the same user can be part of multiple workspaces/companies/teams; a user can comment on any blog; the workspace owner can mandate for comments to land immediately or after approval; all users will be able to connect their account via claude mcp; all users will be able to maintain multiple personas optionally, to write & comment as; for the external user it will not be known these personas are same person

> i wish the covers could be a bit more interesting […] i wonder whether we can make hairline diagram also cover? making it interactive?

> I dont think hairline works well with gradients; it needs flat colors?

> can we make the diagrams more nuanced and nicer; specifically the copperline one looks a bit childish; but the concept is very good.

> use proper icons for the companies; may be use our logo generation stack or similar to get good ones […] I hope the blog will also get images of this? as we need that as cover images for each blog

> I like paper the best; but i think the two companies should have different styles: paper for lumen & coral for copper
