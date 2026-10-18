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

## The original request

The app in this folder came from this message, typed as-is to a coding agent
while it was working on the repository's store:

> offtopic:
> - lets build a embeddable issue/feedback tracker as next app in unofficial store?

Everything in the prompt above beyond "embeddable issue/feedback tracker"
came from the agent: the button in a shadow root and the form in an iframe,
the carbon-copy tickets, the public board and votes, and the spam guards.
