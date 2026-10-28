# Deck: how to write a deck

A deck is one JSON object. It shows as 16:9 slides that scale to any screen (stacked as a
scroll on portrait phones), presents with keys, clicks and swipes, prints one slide per page,
and can be shared by link or embedded. Every save is a revision; the person sees your saves
at once if they have the deck open.

## Workflow

1. `me_get` for the workspace id. `decks_list` to find a deck, or `decks_create` for a new one.
2. `deck_get` before every change: it returns the content, an outline, the check, and `base`.
3. Small change: `slides_edit` with `base`. Larger rewrite: `deck_save` with the whole content
   and `base`. A 409 means the person (or another session) changed the deck: read it again and
   redo your change on top of theirs; never overwrite their words without asking.
4. Read the check that comes back. Errors block a save (422); warnings are advice.
5. Give every save a short `message` for the history ("Tightened the ask", not "update").
6. `studio_show` points their open deck at a slide with a question or a note.
7. Pictures: `assets_list` for the workspace's library; `assets_put` for a drawing (SVG) or a
   small picture; `assets_link` gives the person a link to add screenshots from their phone.
   A library picture can become the workspace's logo with `workspaces_update`, when asked.
8. Share only when asked: `share_set` with `latest` (the link follows every save) or `pinned`.
9. `deck_stats` says who opened a shared deck and where they stopped: use it to suggest which
   slides to cut or tighten.

## Writing well

- One argument, told in order. Write the sentence the deck defends before the slides.
- One idea per slide. A slide's title says its point, not its topic ("Case time halves", not
  "Results").
- Few words: titles under 8 words, leads one line, bullets under 10 words, at most 3 per card.
- Numbers round and sourced. Every stat has a `source`.
- End on the ask: a `cta` slide with concrete steps, owners and dates.
- Write `notes` for each slide: what to say, in the speaker's voice. Line breaks work there.
- Text is plain: no Markdown, no HTML. Line breaks show only in `notes`.

## Format

```json
{
  "title": "Shown in the tab and in link previews",
  "description": "Shown in link previews",
  "lang": "en",
  "brand": "Short label on the cover and in each slide footer (optional)",
  "accent": "cobalt",
  "slides": [ { "layout": "title", "title": "…" } ]
}
```

`accent` colours the deck: cobalt (default), pine, plum, amber, coral or graphite.
At most 60 slides and 200 KB. Every slide has a `layout` and may have `notes`. Most layouts
also take an optional `kicker` (a small tag above the heading), `title` and `lead`.

### title — the cover

The next three slides appear beside it as a fanned preview; `"preview": false` hides it.

```json
{ "layout": "title", "kicker": "Board update", "title": "One story, three products",
  "subtitle": "One sentence on what this deck is for.", "byline": "Presented by …", "date": "28 October 2026" }
```

### statement — one large sentence

`emphasis` must appear word for word in `text`; it gets a highlighter stroke. Keep `text` under
about 140 characters. `source` is an optional attribution line.

```json
{ "layout": "statement", "text": "A deck is one argument told in order.", "emphasis": "one argument",
  "source": "Where the claim comes from" }
```

### three — cards (2–4; 3 is the design)

`accent` is any CSS colour (default: the deck's). `link` is a URL or `{ "href", "label" }`;
links may be `https://…`, `mailto:`, `/path` or `#n` (slide n).

```json
{ "layout": "three", "kicker": "Products", "title": "Three tools, one flow", "lead": "Optional line.",
  "cards": [
    { "name": "Intake", "role": "One line on its job", "bullets": ["Up to three", "short bullets"],
      "link": { "href": "https://example.com", "label": "Open Intake" } },
    { "name": "Review", "role": "…", "bullets": ["…"], "accent": "#0f8a76" },
    { "name": "Decide", "role": "…", "bullets": ["…"], "accent": "#b7791f" }
  ] }
```

### flow — connected steps (3–5 work best, 2–6 allowed)

Left to right (top to bottom on phones). The last step is filled as the destination.

```json
{ "layout": "flow", "title": "How a case moves", "steps": [
  { "label": "Apply", "detail": "One short line" }, { "label": "Assess", "detail": "…" }, { "label": "Decide", "detail": "…" } ] }
```

### shot — a screenshot with callouts

`image` is a `/media/…` address from the workspace's library (`assets_list`), `/img/sample-shot.webp`,
or an `https://` URL. Callout `x`, `y`, `w`, `h` are percent of the image (0–100): with `w`
and `h` it draws a box; without them, a numbered pin centred on `x`, `y`. Labels are listed
beside the image with `caption`. Up to 8 callouts.

```json
{ "layout": "shot", "title": "The case page shows what matters", "image": "/media/abc123def456gh.png",
  "alt": "The case page with its summary panel", "caption": "What to notice",
  "callouts": [ { "x": 8, "y": 44, "w": 18, "h": 7, "label": "A boxed area" }, { "x": 66, "y": 72, "label": "A pin" } ] }
```

Look at the picture's pixel size (`assets_list`) when placing callouts; a box should hug the
thing it marks.

### numbers — 1–4 big stats (2–4 is the design)

The leading number counts up when the slide appears. One-character affixes (`%`, `×`, `+`)
stay full size; longer ones (`sec`, `NOK`) are set small. Write thousands as `12,000`.

```json
{ "layout": "numbers", "title": "What changes", "stats": [
  { "value": "42%", "label": "Shorter case time", "source": "Pilot, 2026" }, { "value": "3×", "label": "…", "source": "…" } ] }
```

### cta — the ask

Concrete steps (up to 6) with an owner and a date, and up to two buttons. The first button is
primary unless one sets `"style": "primary"` or `"secondary"`.

```json
{ "layout": "cta", "kicker": "The ask", "title": "Start a pilot in November", "lead": "Optional line.",
  "steps": [ { "text": "Agree the pilot scope", "owner": "Partner team", "date": "4 Nov" } ],
  "buttons": [ { "label": "Book the kickoff", "href": "mailto:someone@example.com" }, { "label": "See the plan", "href": "#3" } ] }
```

## A good first deck

title → statement (the one sentence) → three (the parts) → flow (how it works) → shot
(evidence, if there is a screenshot) → numbers (what changes) → cta (the ask). Seven slides
present in about seven minutes.

## Present and share

People present from the deck's page: arrows, space, click or swipe; `F` full screen; `N` notes
with the next slide and a clock; `#4` in the address opens slide 4. A shared link shows the
deck to anyone, without the workspace or its people; `/e/…` is the same deck for an iframe.
