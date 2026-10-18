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

Everything in the prompts beyond what's quoted came from the agent: the
button in a shadow root and the form in an iframe, the carbon-copy tickets,
the public board and votes, the spam guards, the shape of the API and the
icon's credit.
