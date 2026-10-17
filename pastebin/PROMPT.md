# Prompt

Give these to a coding agent on a machine that has the `holm` CLI and a node
to deploy to. Its only source of Holm knowledge is the public reference at
<https://holmhq.com/llm.txt>. Send them in order, one message each.

## 1. Build it

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

## 2. Make it minimal

```text
Make the UI minimal.

- Put API keys and the theme switch in the avatar menu.
- Make the create button one split button that reads as a sentence:
  "Create [one-time] link [with] my name for [1h] ▾". Clicking an italic
  word crosses it out to turn it off, so the layout never shifts. The right
  segment opens a menu to pick the expiry.
- Make attaching files a single icon at the top right of the editor.
- Centre the create button.
- Add a small footer with the Holm mark ("A Holm app") and a GitHub mark
  linking to the source.
```

## The original requests

The app in this folder came from these messages, typed as-is to a coding
agent.

**Iteration 1**

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

**Iteration 2**, plus a message sent while the agent was working on it:

> Can we make the UI minimal?
> - get API keys & theme selector in Avatar popup?
> - Create Link button could be a segment button with the right segment a
>   button that opens a dropdown to select expiry something like:
>
>   `[Create _one_time_ Link _with_ my name for _1h_ \/ ]`
>
>   so that one time / with can be clicked to cross it off
> - why cross off: so that layout shift wont happen
> - attachment button should be just an icon at the top right part of the
>   input panel
> - if it makes sense, make the create link centered?
> - also update prompt with this one as the second iteration of the prompt

> Provide GH icon at the footer explaining that this is a holm-app & the source
> is in the repo
> - may holm icon & GH icon can be used nicely for a small nice footer

The prompts above are those messages with the machine-specific parts removed
and one line added: use only holmhq.com. Everything else came from the agent:
the visual design, the data model, how burn after reading works, the security
headers, the CLI, and bugs it found in its own live testing. The other
messages in that conversation stored the API key and asked for documentation.
