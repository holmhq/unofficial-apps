# Prompt

Give this to a coding agent on a machine that has the `holm` CLI and a node to
deploy to. Its only source of Holm knowledge is the public reference at
<https://holmhq.com/llm.txt>.

## 1. Build it

```text
Build an embeddable feedback and issue tracker as a Holm app. Use
https://holmhq.com/llm.txt as your only reference for Holm.

- One script tag adds a feedback button to any website. It opens a small
  form: bug, idea or question, a message, and an optional email. Send the
  page's address along, without its query or fragment.
- Signed-in people make a project per site, with its snippet, a choice of
  button text, colour and position, and a live preview.
- An inbox per project: statuses (new, planned, in progress, done, closed),
  private notes, and where each item came from.
- An optional public board per project showing only the items I choose, with
  upvotes.
- Keep spam out without a captcha. Make it look good on mobile and desktop,
  light and dark.
- Deploy it to feedback.<my-domain>.
```

## 2. An API for agents

```text
Give the app an API, so I can hand a key to a coding agent and it can set up
feedback on a new site by itself: API keys made in the app (shown once,
stored hashed), accepted as bearer tokens on every owner route, and the
project's snippet in the reply.
```

## 3. Its icon

```text
Make this SVG, a smiling speech bubble from the Noun Project, the app's icon.
Turn it into one black path filling a 24 × 24 frame for holm.symbol.svg,
keeping its holes, and use the same shape in the header, the favicon and the
tile Holm's sign-in page shows. Credit its creator in the README.
```

## 4. A page of its own, files and stats

```text
- Make the set-up preview follow colour, label and position as they change.
- Give each project a public page that stands alone for someone arriving
  from a link or a QR code: the form first, then the items I make public,
  with votes and comments. Visitors' comments show only after I approve them.
- Let the form take files: screenshots, videos and PDFs.
- Let me pick a custom address for the page, and download its QR code.
- Let me rename and delete projects.
- Light, dark and system themes in the avatar menu.
- Light stats for each account and project: how many people saw a form and
  how many sent something, per day.
```

## 5. Polish

```text
- Give the button on sites the app's icon.
- Switching a project's tabs should change only what's below them, not
  redraw the page.
- When the app's link is shared, show feedback's own title, description and
  preview image, not Holm's.
```

## 6. In person: places and events

```text
- Make the link preview short and peppy, and say it works on a website or
  in a physical place.
- Let a project be for a place or an event, like a restaurant: kinds that
  suit people there, and a one-tap photo from a phone's camera. A photo on
  its own is enough to send.
- Give the public page a title, description, logo and cover, with defaults.
- Let me email the page's link, and have Stats count QR scans and email
  visits on their own.
```

## 7. A form of my own

```text
- Let me ask for an email or a phone number, optional or required.
- Let me add a few questions of my own: a short answer, a dropdown, one
  choice or checkboxes. Show the answers on each item and filter the inbox by
  them.
- Make each item a thread for my team: notes and every change, in order.
```

## 8. A button people want on their site

```text
- Make the button and form refined enough that people want them on their
  site: smooth transitions, and let me set the form's title, description,
  logo, colour and cover.
- Add an optional star rating with feed-stars, Holm's own component, from
  https://cdn.jsdelivr.net/gh/holmhq/cdn.
- Give the app a /changelog.
- Make the set-up screen smarter, join the copy button to the snippet's
  edge, and design the dropdowns properly.
- Say "Issue" instead of "Bug".
```

## 9. Room for hundreds

```text
- Use the app's own feedback button in the app itself.
- Make the projects page minimal: it never scrolls, the footer stays at the
  bottom, and the projects sit in a panel, each with the website it's on.
  No underline on hover.
- Give each project an icon, an open-source one like Lucide's, at random,
  and let me pick another.
- Assume hundreds of items arrive: give the inbox sane filters.
```

## 10. Your own computer isn't a site

```text
"Where it's live" offers pages on localhost and 127.0.0.1 as sites to
allow. They're a developer's copy: list them apart, and keep them out of a
project's sites.
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

Everything in the prompts beyond what's quoted came from the agent: the
button in a shadow root and the form in an iframe, the carbon-copy tickets,
the public board and votes, the spam guards, the shape of the API, the
icon's credit, in iteration 4 the page's layout, the file limits, the poster
and what the stats count, in iteration 5 changing an item's status in
place too, in iteration 7 the kinds for places, the scan tags and the
default cover, in iteration 8 the question types' details and the
inbox's filters, in iteration 9 the Design tab and its preview running
the real button, the panel's theme and button styles, a snippet that reads
the look as the page loads, "where it's live", and the rating's place in
the inbox and Stats, and in iteration 10 a Feedback link in the footer rather
than a floating button, the sites shown from allowed sites and where the
button is live, the icon on the form and the page too, the sort orders and
filters, fifty items at a time, and the filters folding away on a phone,
and in iteration 11 which addresses count as local, and keeping them a week
with a cap of their own.
