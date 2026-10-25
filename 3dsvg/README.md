# 3dsvg

Turn an SVG, a word or a bit of pixel art into a 3D object you can spin,
light and dress in metal, glass or wood, on [Holm](https://holmhq.com).
Export it as a 4K picture, a video or a 3D model. Sign in to keep your
shapes, open them on any device and share each one by a link you can turn
off.

It is a port of [3dsvg](https://github.com/renatoworks/3dsvg), an MIT
licensed editor built with Next.js and React Three Fiber, rewritten here
without a build step. The request that started it is quoted in
[`PROMPT.md`](PROMPT.md), which also has a reusable version.

## Holm App Spec v1

3dsvg follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings, `web/` holds public
files, and `api/main.js` exports `default { fetch(request, env) }`. The
handler returns standard `Response` objects and uses `env.holm` for storage
and sign-in. `web.spa` is on; the node runs no build. Every deploy needs
`--spec-v1`. Only `web/` is served as files: `api/` and `holm.json` are not
public URLs.

## What it does

- **Four ways in:** draw on a 16 × 16 pixel grid, type text in one of ten
  fonts, paste SVG code, or upload or drop an SVG file anywhere on the page.
  Filled paths extrude as they are; strokes become solid ribbons.
- **Settings:** colour, depth, smoothness and zoom; the backdrop colour; ten
  materials (plastic, metal, glass, chrome, gold, clay, holographic and
  more) with metalness, roughness, opacity and wireframe; ten drawn
  textures or your own image, with repeat, rotation and offset; seven
  animations; cursor follow and reset on idle; the key light's position and
  strength, the ambient light and the contact shadow. Drag to turn the
  shape, scroll or pinch to zoom.
- **Pictures:** a shutter takes a still at 720p to 4K, with or without the
  backdrop (a transparent PNG is cropped to the shape), in the screen's
  shape or 1:1, 16:9 or 9:16.
- **Video:** record the stage, or exactly one, two or three loops of the
  animation. The preview has a filmstrip to trim the ends; download MP4
  (H.264) or WebM at 720p to 4K, cropped to the chosen frame.
- **3D models:** GLB with colour, material and texture, STL for printing,
  OBJ or PLY.
- **Embed:** copy-ready code for the original project's `3dsvg` React
  component on npm, with every setting that differs from its defaults.
- **No account needed:** the design on screen stays in the browser between
  visits.
- **Signed in:** the round avatar at the top right holds the appearance
  (light, dark or the device's), feedback and sign-out. Save keeps the
  shape in My shapes with a thumbnail; open, rename or delete it there. A
  dot on Save marks unsaved changes to the open shape.
- **Share links:** any saved shape can get a read-only link,
  `/s/<token>`, where anyone can turn and zoom it and open a copy in their
  own editor. Saving again updates what the link shows; turning the link off
  deletes the shared copy. The page carries the shape's name and picture for
  link previews, and asks search engines not to index it.

## How it is built

```text
holm.json               identity, web.spa, what stays out of deploy
holm.symbol.svg         app icon: the pixel invader
holm.generated.json     record of the icons Holm generated from the symbol
api/main.js             sign-in, saved shapes, share links and share pages
web/index.html          the page shell, an import map for three.js, the feedback tag
web/sw.js               network-first offline cache of the page's files
web/src/app.js          start-up: the editor, or a shared shape at /s/<token>
web/src/editor.js       wires the stage, panels, camera and drag and drop
web/src/scene.js        the 3D view: lights, environment, contact shadow, controls, exports
web/src/geometry.js     SVG to extruded geometry, in batches that never freeze the page
web/src/materials.js    the ten material presets
web/src/textures.js     the ten drawn textures
web/src/fonts.js        text to SVG with opentype.js and the ten fonts
web/src/pixels.js       pixel art to one traced outline
web/src/design.js       a design's defaults, checks and the embed code
web/src/state.js        the editor's state, kept in this browser
web/src/tools.js        the tool rail: draw, text, code, file, My shapes
web/src/settings.js     the settings panel
web/src/capture.js      the camera bar, picture and video previews, the trimmer
web/src/ffmpeg.js       trims, crops, scales and converts recordings
web/src/dialogs.js      3D model download and embed
web/src/shapes.js       saving, My shapes and share links
web/src/share.js        the shared-shape page
web/src/account.js      sign-in and the avatar menu
web/src/ui.js           elements, bound controls, dialogs and toasts
web/src/icons.js        the Lucide icons it uses, copied in
web/fonts/              Geist for the interface; the ten text fonts in text/
web/vendor/             three.js, opentype.js, ffmpeg.wasm, the feedback embed, licences
listing/                store listing and screenshots (not deployed)
```

The Holm primitives it uses, all described in
<https://holmhq.com/llms-full.txt>:

- **Member storage, `env.holm.app.member`:** each saved shape is a
  document in member DS (`shapes`: name, settings, share token) and its SVG,
  thumbnail and any texture image are in member S3 under `shapes/<id>/`.
  Nobody else can read them.
- **Shared storage, `env.holm.app.ds` and `.s3`:** a share is a document in
  `shares` and a copy of the files under `shares/<token>/`, readable by
  anyone with the token.
- **Sign-in, `env.holm.auth`:** `/api/me` returns the member with
  `getLoginURL()` and `getLogoutURL()`. Sign-in happens on the node's own
  page; sign-out is a POST.
- **Uploads, `request.formData()`:** a save is one multipart form with the
  settings, the SVG, the thumbnail and the texture.
- **`env.holm.web.fetch`:** serves the static files, and the share page:
  `/s/<token>` fetches `index.html` and swaps in the shape's title and
  preview image.
- **App identity:** `holm app identity generate` made the icons, manifest,
  social card and 404 page from `holm.symbol.svg`.

There is no bundler. The page loads three.js through an import map, as ES
modules from `web/vendor/`. FFmpeg's 32 MB core loads only when a video
needs converting, from the same folder; its module worker needs the
`'unsafe-eval'` that Holm's default page policy allows. Uploaded SVGs are
parsed by three.js's loader, never put into the page, and the file preview
is an `<img>`, so scripts inside an SVG never run. Images are served only
as the type their first bytes prove, with `nosniff`.

### Differences from the original

The 3D scene, materials, animations, controls, textures and exports follow
the original's code. A few things changed on the way:

- Recordings convert at a steady 60 frames a second. A browser recording
  counts time in milliseconds, and without a set rate FFmpeg wrote a
  thousand frames for every second, which made conversion very slow and ran
  VP9 out of memory. MP4s are H.264, not MPEG-4 Part 2, so they play
  everywhere; the recorder uses whatever the browser supports (Safari makes
  MP4).
- On a portrait screen the opening zoom ends where the shape fits, instead
  of overshooting and backing out.
- Texture Repeat Y works; it used to follow Repeat X.
- Exported models have their triangles facing outwards. Mirroring the
  SVG's y axis had turned them inside out.
- Stills render at exactly the chosen width, whatever the screen's pixel
  density, and a still in another shape than the screen (a square on a
  phone, say) frames the object for that shape.
- On phones the panels move clear of the top buttons, and the settings rise
  from the bottom and lift the stage so the shape stays in view.
- Accounts, saved shapes, share links and the avatar menu are new. The
  original's feedback button and GitHub badge are gone; Send feedback is in
  the menu.

## Deploy your own

```bash
holm app validate --spec-v1 ./3dsvg
holm @<peer> app deploy ./3dsvg --spec-v1 --host 3dsvg.<your-domain>
```

Check the peer and that the host is unused first. To ship a change, run the
same deploy with `--force`. The editor works for everyone without an
account. Saving needs a sign-in method on the node (email links or an OAuth
provider). With the app id printed by the deploy:

- **Upload size:** a save with an image texture can pass the node's default
  1 MiB request body limit. Raise
  `settings.node.policy.runtime.request_body_max_bytes` (for example to
  `8388608`) if your members use their own textures.
- **Feedback:** Send feedback opens a form from the owner's
  [feedback](../feedback/) app through a local copy of its `embed.js`. Set
  `data-project` and `data-origin` in `web/index.html` to your own project,
  or remove that tag. The site must be allowed to frame it:
  `holm @<peer> policy set security.csp.frame_src "https://feedback.example.com" --app <app-id>`.
- **Sign-in branding:** inspect the settings schema, then set
  `settings.apps.<app-id>.brand.name` to `3dsvg`, `brand.icon_url` to
  `/icon-192.png` and `theme.accent` to `#4f46e5` on the peer.

## Known limits

- High smoothness makes dense meshes. Text at the default 60% runs to about
  800,000 triangles, so its STL is tens of megabytes and a GLB can take a
  minute to build, as in the original.
- Converting video runs FFmpeg in the browser on one thread. The first
  conversion downloads 32 MB, and a few seconds of 4K can take a minute. A
  WebM that is neither trimmed nor cropped downloads as recorded, at the
  stage's own size.
- A shape's SVG is limited to 2 MB and a texture image to 6 MB (it shrinks
  to 1024 px before upload). A member keeps up to 500 shapes.
- A share link shows the shape as last saved, not unsaved changes. Its
  token is the only secret; anyone who has the link can see the shape until
  it is turned off.
- Signed out, the design lives in one browser. There is one design on
  screen at a time and no undo.
- Service workers need HTTPS (or `localhost`), so the offline copy only
  works there. Video conversion and saving need the network.

## Testing

On a scratch node, `holm test create-user` and `holm test create-session
--host <exact host:port>` give two members a session each. Check, on a
phone and a desktop in light and dark:

- each input, material, texture, animation and light;
- a picture with and without the backdrop;
- a recording of one loop, trimmed, as MP4 and WebM;
- the four model formats;
- save, save as new, reopen, rename and delete, with the unsaved dot;
- a share link signed out, Edit a copy, and the link after turning it off;
- that the second member gets 404 for the first member's shapes.

## Licenses

- App code: MIT, like the rest of this repository. The editor is ported
  from 3dsvg, MIT, in [`web/src/LICENSE`](web/src/LICENSE); the contact
  shadow and studio environment follow @react-three/drei, MIT, in
  [`web/src/LICENSE-drei`](web/src/LICENSE-drei).
- three.js 0.183.2 and the addons used: MIT, in
  [`web/vendor/three/LICENSE`](web/vendor/three/LICENSE).
- opentype.js 1.3.4: MIT, in
  [`web/vendor/opentype/LICENSE`](web/vendor/opentype/LICENSE).
- ffmpeg.wasm (`@ffmpeg/ffmpeg` 0.12.15): MIT, in
  [`web/vendor/ffmpeg/LICENSE`](web/vendor/ffmpeg/LICENSE). Its core,
  `@ffmpeg/core` 0.12.10, is GPL-2.0-or-later; see
  [`web/vendor/ffmpeg/core/NOTICE`](web/vendor/ffmpeg/core/NOTICE) for the
  licence and where its source is.
- Fonts: Geist (SIL OFL 1.1) for the interface; for text, DM Sans, Bebas
  Neue, Playfair Display, Righteous, Black Ops One, Rubik Mono One,
  Pacifico, Oswald and Archivo Black (SIL OFL 1.1) and Permanent Marker
  (Apache 2.0). Each licence is beside its font in
  [`web/fonts/`](web/fonts/).
- Lucide icons: ISC, with those from Feather under MIT, in
  [`web/vendor/lucide/LICENSE`](web/vendor/lucide/LICENSE).
- The feedback embed is this repository's own [feedback](../feedback/) app
  (MIT).
- The icon is the original editor's default pixel drawing.
