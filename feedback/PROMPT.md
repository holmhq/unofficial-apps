# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted messages later are history, not extra sources.

## Build from scratch

```text
Build a feedback app using https://holmhq.com/llms-full.txt as the only Holm
reference; Holm's own https://github.com/holmhq/cdn is allowed for feed-stars.
Read the v1 sections 9–12 first. Use holm.json with web.spa true, public web/
files and api/main.js exporting default { async fetch(request, env) }.
Use env.holm auth/DS/KV/S3/image, standard Request/Response and same-origin
browser API calls; fall back to env.holm.web.fetch(request). No build step.
Use relative server imports, request.formData() and File.arrayBuffer() for
uploads; no global holm/request/respond and no request.files API.

- Signed-in people make one project per website, shop or event. Supply a
  one-tag widget: a button in a shadow root opens an iframe form; also a
  stand-alone feedback page at a custom address, with SVG QR code/poster.
- Design/Form tabs customize title, words, colour, logo, cover, icon, button
  label/corner/style and theme, with a live preview. Website kinds: Issue,
  Idea, Question; places: Praise, Problem, Idea. Add optional/required stars,
  contact email/phone and up to eight text/select/radio/checkbox questions.
  Support four files, 8 MiB total, and a one-tap phone photo; photo or rating
  alone can send. Shrink big photos in the browser before upload (at most
  2048 px, JPEG quality 0.82), and turn iPhone HEIC photos into JPEG. Strip query/fragment from the sending page's address.
- One private inbox per project: ticket numbers, statuses, notes and a team
  thread, sort/search/filter for hundreds of items. Only the owner sees
  files/contact details. The optional public page shows selected items,
  votes once per browser, and comments only after owner approval.
- Keep spam out with a trap field, project caps and allowed sites, honestly
  described as casual-misuse guards, not strong sender authentication.
  Track daily visits, QR/email-link visits, opens, sends, votes and comments
  in app KV; no visitor tracking. “Where it's live” separates local copies.
- Add typed operations for public widget settings and JSON feedback with keyed retries, plus a signed-in owner's private inbox, mark-done action and dashboard counts; keep all existing routes and file flows.
- API keys: show once, hash SHA-256, accept bearer tokens on owner routes,
  check project ownership, return the setup snippet; keys cannot mint keys.
- Make it refined on phones/desktop, light/dark/system, a fixed footer and
  scrolling projects panel, avatar menu for keys/theme/stats, /changelog,
  and an optional footer Feedback link to a project I supply.
- Vendor fonts, QR code code and icons with licenses. For feed-stars use
  Holm's CDN pinned to a commit and v-X.Y.Z folder with integrity, plus plain
  stars as fallback. Copy embed.js into other Holm sites when their CSP
  requires it and allow the feedback origin in the site's frame-src.
  The guide does not guarantee frame-ancestors defaults: set deliberate
  web.headers for framing, inspect both responses and test the iframe.
- Make holm.symbol.svg and run holm app identity generate for the icons,
  manifest and social card; author og:image tags only to keep a hand-made
  social preview. Add authored social metadata in web/index.html. Make
  listing/listing.json plus sample screenshots; these are repo conventions,
  not a Holm store schema documented by the guide. Use holm.json version.

Run holm app validate --spec-v1 feedback. With my approval, deploy with
holm @<peer> app deploy feedback --spec-v1 --host feedback.<my-domain>.
Ask before replacing a host or moving an older-format app. Validation does
not run the app: test cross-site embedding, uploads, ownership, comments,
votes/stats and mobile/desktop light/dark. Inspect the target settings schema
before setting sign-in branding. Report any guide or runtime gaps honestly.
```

## The original requests

**Iteration 1** came from this message, typed as-is to a coding agent while
it was working on the repository's store:

> offtopic:
> - lets build a embeddable issue/feedback tracker as next app in unofficial store?

**Iteration 2**, part of a message whose other points were about Holm's
sign-in page:

> - can feedback app have a api system that i can then provide you so that when asked to add it to a new site, you can simply go & set it up?

**Iteration 3**, with the path to a downloaded icon file and to Holm's
documentation removed:

> can you see if the icon downloaded from thenounproject can be normalised (perhaps manually as described in holm) and set as the icon in feedback app

**Iteration 4**, right after; "it worked" is the new icon:

> Great, it worked!
> - changing colors doesnt update preview in real time
> - the public board should be designed better: assume someone just lands on it from say a QR code / link
> - the page should look fully contained to provide feedback
> - i think the page should be able to accept files?
> - we need to also be able to set custom urls?
> - and get QR codes
> - comments can be made public, but it only appears after approving
> - we need abilities to edit/delete the projects (if its not there yet)
> - also give light/dark/system theme options in avatar popup
> - build a light analytics system for each account to see how many people click/post

**Iteration 5:**

> May be feedback button's icon needs to match the logo?
> - also the whole page re-renders when i tab
> - anyway to make it such taht only that details change

**Iteration 6:**

> I shared feedback app in WhatsApp
> - and it shows holm's preview images
> - and metadata of holm
> - can we change it to feedback's?

**Iteration 7**, three messages sent while the agent worked:

> I feel we should make the meta info shorter & peppy
> - realise that it can be used in a website or for a physical store easily

> think about a restaurant using this for their feedback system
> - someone can quickly take a photo & upload

> an event can also use it
> - or any place where people can scan
> - its actually a powerful way to also measure engagement
> - you can send it via email
> - may be a title, description, logo & cover (provide default if none) will make it much nicer?

**Iteration 8**, a message sent while the agent worked; asked, the owner
chose a thread for the team only, and no email for now:

> we can ask for phone number/email if needed
> - each one the feedback should actually create a thread?
> - so that manager can easily filter / see?
> - if possible we can even think of a super simple form?
> - field, dropdown, radio, checkbox etc only?

**Iteration 9**, with the path to the component on the owner's machine
removed. Asked how to credit the vendored component, the owner chose loading
it from jsDelivr, then added: "jsdelvr is our own one; that project is
maintained by us".

> Refinements to feedback
> - any chance you can make the feedback component more refined visually?
> - so that the component looks and behaves elegantly in a page?
> - take a look at this component we have: [the feed-stars component]
> - make sure the cdn works before using it or vendor it if its difficult
> - perhaps nice transitions, and refined ability to customise the widget?
> - say: set title, description, logo, color, cover?
> - make it super elegant that people want to use it their website
> - can we have a "/changelog" in our site?
> - will using the same id for project & embed have any security implications?
> - can we make the setup screen smarter?
> - make the copy snippet as a segment button at the right edge of the snippet?
> - saving space
> - all the drop downs is too lame, design it well
> - instead of Bug, say issue? that may be more generic?

**Iteration 10**, with a line about another site's feedback project removed:

> Lets do some feedback app refinements:
> - Can we use a feedback widget in the feedback app itself
> - then in main page, can we do some minimal designs:
> - make the page never scroll
> - the footer stays put at the bottom
> - the projects appear in a panel
> - the projects should show the website it links in, if available
> - avoid underline on hover
> - set some random icon (say lucide or so) for a project / or enable them to set an icon
> - assume 100s of feedback happens, provide sane filters

**Iteration 11** was a copy of a project's "Where it's live" list, pasted
without a word: one real site, and three pages on `localhost` and
`127.0.0.1`, each offered as a site to allow.

**Iteration 12**, about this app and another one that uploads photos:

> for feedback & relay, cant we optimise the images in frontend itself?

and, after the agent found that iPhone HEIC photos skipped the existing
shrink:

> yes, fix both and start the recipes


**Iteration 13** moved the build request to the renamed public guide; the
owner's message (`llms-full.txt` is the full guide's name):

> I think we should move to llms.txt & llm-full.txt; and update all apps which points to old links


**Iteration 14** lowered the photo quality after a 1 MB upload was measured:

> i wonder 1MB is even needed?
> - whats a saner size? that can be saved for web like needs?
> - is that configurable so that agents building these systems will auto pick the size?

and, to the agent's proposal of 2048 px at JPEG quality 0.82:

> Yes do all of that


**Iteration 15** made feedback the pilot for Holm's identity generator:

> Perhaps feedback is a great place to test it
> - we can remove the hand made assets and see if this works well
> - one caveat: i sort of like its social preview images, may we can then replace that back on the generated assets as an over ride?
> - we can use the current shape & generate it?

**Iteration 16** played videos on the item page, after a phone video sent
through the form would not play when its link was opened: the inbox now shows
a player, and says plainly when the browser can't play the file.

The build request now uses the current public v1 guide, keeps stats inside
app storage, and makes CSP and runtime checks explicit. It needs no private
documentation, downloaded icon attachment or pre-existing feedback app.
The quoted history records the requested experience; its detailed design
and implementation were the agent's work.
