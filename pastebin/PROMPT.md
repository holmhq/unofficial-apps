# Prompt

Give this to a coding agent on a machine that has the `holm` CLI and a node to
deploy to. Its only source of Holm knowledge is the public reference at
<https://holmhq.com/llm.txt>.

```text
Build a pastebin as a Holm app. Use https://holmhq.com/llm.txt as your only
reference for Holm, and read its app-building sections before you write code.

- Make it really aesthetic, with light, dark and system themes.
- The UX should be excellent on mobile and desktop.
- Highlight syntax.
- A paste can hold text and media: images, video, audio or any file.
- Every link can expire, open only once, or be revoked by me.
- Hide my name on shared links by default; let me choose to show my name and avatar.
- After I sign in, let me create API keys, so scripts and agents can create
  pastes over HTTP. Include a small CLI.
- Deploy it to pastebin.<my-domain>.
```

## The original request

The app in this folder started from this message, typed as-is to a coding
agent:

> Build me a pastebin
> - it needs to be really aesthetic
> - light/dark/system themes
> - super good in UX
> - should be possible to paste content via api
> - should work in mobile/desktop
> - should have syntax highlighting
> - should enable one-time-keys, expiry, should be possible to share media
> - we will store an API key here after i make an account, so that when i say:
>   file something private, you can store there & give me a url: that i can
>   revoke, or onetime key? or an expiry, so that after a set time it becomes
>   unavailable
> - when sharing links, optionally, i can hide my credentials; by default is
>   hiding, i can make it with it so that my avatar / name can be seen
> - host in pastebin.zyt.app

The prompt above is that request with the machine-specific parts removed and
one line added: use only holmhq.com. Everything else came from the agent: the
visual design, the data model, how burn after reading works, the security
headers, the CLI, and bugs it found in its own live testing. Later messages
in that conversation only stored the API key and asked for documentation.
