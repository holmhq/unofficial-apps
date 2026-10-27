// Sample content: two made-up teams, each in its own workspace, so a new Margin has
// something to show on its landing page. Lumen makes a calm calendar; Copperline builds a
// quiet home battery. Everyone here is fictional. Avatars and logos are in web/samples/.

export const WORKSPACES = [
  {
    slug: 'lumen', name: 'Lumen', logo: 'logo-lumen.png', theme: 'editorial', home: 'curated', moderation: 'outsiders',
    cover: { look: 'paper', tone: 'lilac' },
    tagline: 'A small team making a calm calendar',
    description: 'Lumen is a small team making a calm calendar. This is where we write about design, engineering and how we work. (Sample content: the team and posts are made up.)',
    team: ['maya', 'theo', 'ines', 'noah'], owner: 'maya',
  },
  {
    slug: 'copperline', name: 'Copperline', logo: 'logo-copperline.png', theme: 'quiet', home: 'latest', moderation: 'outsiders',
    cover: { look: 'flat', tone: 'coral' },
    tagline: 'A small team building a quiet home battery',
    description: 'Copperline makes a home battery you can forget about. Field notes, hardware and the odd mistake. (Sample content: the team and posts are made up.)',
    team: ['elena', 'jonah', 'kofi'], owner: 'elena',
  },
];

// Readers (no workspace) comment from outside. avatar: web/samples/avatar-<n>.jpg.
export const PEOPLE = [
  { handle: 'maya', name: 'Maya Chen', bio: 'Design lead at Lumen. Thinks in weeks, not days.', avatar: 2 },
  { handle: 'theo', name: 'Theo Brandt', bio: 'Engineer at Lumen. Sync, storage and the parts nobody should notice.', avatar: 3 },
  { handle: 'ines', name: 'Inés Duarte', bio: 'Research at Lumen. Asks people how they really plan.', avatar: 4 },
  { handle: 'noah', name: 'Noah Park', bio: 'Support at Lumen. Reads every message we get.', avatar: 5 },
  { handle: 'elena', name: 'Elena Voss', bio: 'Field engineering at Copperline. Has seen a lot of garages.', avatar: 9 },
  { handle: 'jonah', name: 'Jonah Reyes', bio: 'Industrial design at Copperline. Fewer parts, fewer lights.', avatar: 10 },
  { handle: 'kofi', name: 'Kofi Mensah', bio: 'Acoustics and thermal at Copperline. Measures silence for a living.', avatar: 11 },
  { handle: 'rio', name: 'Rio Tanaka', bio: 'Plans a small bakery around early mornings.', avatar: 6 },
  { handle: 'alex', name: 'Alex Rivera', bio: 'Product designer, early Lumen user.', avatar: 7 },
  { handle: 'june', name: 'June Hale', bio: 'Engineer at a design studio.', avatar: 8 },
];

// days: how long ago it was published. drawing: the drawn cover (api/covers.js); its look
// and tone come from the workspace.
export const POSTS = [
  {
    key: 'launch', ws: 'lumen', as: 'lumen', days: 2, drawing: { motif: 'week', seed: 1203 }, featured: true, claps: 214,
    title: 'Introducing Lumen 2: a calendar that leaves room',
    subtitle: 'Fewer boxes, more breathing space, and a week view that finally fits a phone.',
    tags: ['product', 'design'],
    markdown: `Most calendars are built to fill. Every gap looks like an invitation, and by Wednesday the week has no air left in it. Lumen 2 is our answer: a calendar that treats empty time as something worth protecting.

## What's new

- **The week view, rebuilt.** Seven days fit on a phone without squinting. Long days fold, quiet days shrink, and today always stays in view.
- **Quiet hours.** Mark the hours you keep for yourself. Lumen won't suggest them for meetings, and invites that land there arrive softly.
- **Plans, not just events.** Drop a loose plan on a day ("draft the talk") without giving it a time. It waits there until you're ready.
- **Offline for real.** Everything works on a plane. Changes sync when you land, and nothing is ever lost. Theo explains how below.

> [!TIP]
> Long-press any empty stretch of the week to turn it into quiet hours. Tap it again to give the time back.

## Why we changed so much

We spent the spring talking to people about how they plan, and one thing came up again and again: the calendar was never the problem, the pressure was. A full grid feels like a to-do list you can't finish. Inés wrote up what we heard.

/@ines/what-40-people-told-us-about-their-weeks

So we started from the empty week and worked backwards. Maya has the story of how that went, including the three designs we threw away.

/@maya/designing-the-empty-week

Lumen 2 is rolling out today on every platform. Your existing calendars, colors and reminders come across as they are. Tell us what you think: reply here, or write to Noah, who reads every message.`,
  },
  {
    key: 'empty', ws: 'lumen', as: 'maya', days: 4, drawing: { motif: 'week', seed: 1204 }, claps: 132,
    title: 'Designing the empty week',
    subtitle: 'We threw away three designs before we learned to draw nothing.',
    tags: ['design'],
    markdown: `The hardest screen in a calendar is the one with nothing on it. Get it wrong and people feel lazy. Get it right and they feel free.

Our first three attempts all made the same mistake: they tried to help. An empty Tuesday got a cheerful illustration, then a list of suggestions, then a gentle "plan your week?" prompt. Every version tested worse than a blank grid.

## Drawing nothing

The fourth design drew nothing at all, and it made people uneasy in a different way: it looked broken. Empty space only feels intentional when everything around it is precise.

So we tightened the frame instead of filling the picture. Day headers got quieter. The hour lines faded to a hairline. Today's column picked up the faintest tint, so the eye always knows where it is, and then we left the rest alone.

![The week view with two quiet days](/samples/cover-1.jpg "A week with room in it")

## What we kept

1. **Precision at the edges.** Headers, times and today's marker do the work, so the middle doesn't have to.
2. **No empty-state copy.** If a day has nothing, it says nothing.
3. **Soft density.** Busy days compress gently instead of scrolling, so a full day looks full without looking like an emergency.

> [!NOTE]
> We still show a hint the very first time you open an empty week. After that, the calendar stays quiet.

The result is the screen we're proudest of, and the one we hope you never think about.`,
  },
  {
    key: 'research', ws: 'lumen', as: 'ines', days: 9, drawing: { motif: 'people', seed: 2210 }, claps: 176,
    title: 'What 40 people told us about their weeks',
    subtitle: 'Six weeks of interviews, and the one finding that changed Lumen 2.',
    tags: ['research', 'product'],
    markdown: `This spring we sat down with forty people who plan for a living, or at least feel like they do: teachers, nurses, founders, a choir director and a man who runs three food trucks. We asked them to walk us through last week, day by day.

## What we expected

We expected to hear about features. Better recurring events, smarter invites, a nicer dark mode. Some of that came up. Mostly it didn't.

## What we heard instead

People didn't struggle to put things in their calendar. They struggled with how the calendar made them feel once things were in it.

> "When I open it on Sunday night and it's solid blue, I just close it again."

Three patterns came up in almost every conversation:

- **The Sunday dread.** Looking at a full week ahead was worse than living it.
- **Invisible work.** The most important things (writing, thinking, resting) had no place in the grid, so they lost to anything with a time attached.
- **Defensive booking.** Half our participants put fake meetings in their own calendar to protect time. Several called them "lies I tell my coworkers".

## What changed

That last one stopped us. If people need to lie to their calendar to protect their time, the calendar is on the wrong side. Quiet hours in Lumen 2 came straight out of these conversations, and so did plans without times.

| Finding | What we built |
| --- | --- |
| Sunday dread | A softer week view that shows space, not just slots |
| Invisible work | Plans you can drop on a day without a time |
| Defensive booking | Quiet hours that others see as "busy" |

Thank you to everyone who let us into their week. We learned more from your Tuesdays than from any survey.`,
  },
  {
    key: 'offline', ws: 'lumen', as: 'theo', days: 6, drawing: { motif: 'network', seed: 3317 }, claps: 98,
    title: 'Offline first, for real this time',
    subtitle: 'How Lumen 2 keeps working on a plane and never loses a change.',
    tags: ['engineering'],
    markdown: `Lumen 1 worked offline in the way most apps do: until you edited something. Then you got a spinner, a retry, and sometimes a conflict dialog nobody understood. For Lumen 2 we rebuilt sync around one rule: the device is the source of truth, and the server is a very patient friend.

## Every change is an operation

Instead of syncing whole events, each device keeps a small log of operations: "move this event to 3 pm", "rename this plan". When you're offline, the log just grows. When you reconnect, the device sends its log and pulls everyone else's.

\`\`\`js
// One change, as it travels between devices.
const op = {
  id: crypto.randomUUID(),
  event: 'ev_92ab',
  field: 'start',
  value: '2026-11-03T15:00',
  clock: [device, ++counter],
};
\`\`\`

## Who wins a conflict

Two people moving the same meeting while both on a train is rarer than it sounds, but it happens. We settle it field by field, so the person who changed the title and the person who changed the time both keep their work.

| Change | Rule |
| --- | --- |
| Same field, two devices | The later clock wins, quietly |
| Different fields | Both apply |
| Delete vs. edit | The edit wins, and the event comes back |

> [!WARNING]
> "The edit wins" surprised us in testing: people expect a delete to be final. We kept it, because losing work feels far worse than seeing a deleted event return.

## What it cost

The sync engine is about 1,400 lines, less than the code it replaced. Most of the work was in the tests: we replay a few thousand random histories on every build and check that every device ends up in the same place. It's the most boring part of Lumen 2, which is exactly what we wanted.`,
  },
  {
    key: 'reviews', ws: 'lumen', as: 'maya', days: 13, drawing: { motif: 'stack', seed: 4421 }, claps: 87,
    title: 'How we run design reviews',
    subtitle: 'Short, written, and always ending in a decision.',
    tags: ['design', 'process'],
    markdown: `We used to book an hour every Friday for design review. Six people, one screen, a lot of nodding. Decisions drifted to the following week, and the people who think best in writing never got a word in.

Now reviews happen in the document, and the meeting only exists when the document can't settle it.

## How it works

1. **The designer writes a one-page brief:** the problem, two or three options, and the one they'd pick.
2. **Everyone comments on the passages they care about,** within two working days.
3. **The designer decides.** Not the loudest reviewer, not a vote. The decision and the reason go at the top of the page.
4. **If something is truly stuck,** we meet for fifteen minutes, with the comments as the agenda.

> The goal of a review isn't agreement. It's a decision everyone understands.

## What changed

Reviews take about a day less from brief to decision. Quieter people comment more. And because every decision is written down with its reason, new teammates can read why the app looks the way it does instead of asking.

The one thing we miss is the Friday energy, so we kept a monthly show-and-tell with no decisions allowed. That one stays a meeting.`,
  },
  {
    key: 'support', ws: 'lumen', as: 'noah', days: 18, drawing: { motif: 'inbox', seed: 5533 }, claps: 64,
    title: 'The support inbox is a product',
    subtitle: 'What a year of answering every message taught a small team.',
    tags: ['support', 'process'],
    markdown: `We answer every message, usually within a day, with a person and a name. It's one of the few promises a small team can make that a big one can't.

After a year, the inbox has become one of our best design tools. Here's how we keep it that way.

## Our checklist for every reply

- [x] Use the person's words back to them, so they know we read it.
- [x] Fix the problem first, explain second.
- [x] Say what we'll change, or honestly that we won't.
- [ ] Follow up when it ships. (We're still bad at this one.)

## Tagging, lightly

Every conversation gets one tag, never more: **bug**, **confusing**, **wish**, or **love**. Once a month we read the confusing pile together. It's humbling, and it's where most of Lumen 2's small fixes came from.

> [!IMPORTANT]
> A "confusing" message is never the customer's fault. If one person writes in, a hundred more gave up quietly.

If you've ever written to us: thank you. You've designed more of this app than you know.`,
  },
  {
    key: 'builds', ws: 'lumen', as: 'theo', days: 24, drawing: { motif: 'bars', seed: 6649 }, claps: 71,
    title: 'Keeping our builds under a minute',
    subtitle: 'Small habits that kept a growing app fast to work on.',
    tags: ['engineering', 'process'],
    markdown: `A slow build is a tax on every idea. When ours crept past four minutes last winter, we noticed people batching changes to avoid waiting, which meant bigger changes and harder reviews. So we set a rule: a full build and test run stays under a minute, or fixing it becomes the next task.

## Where the time went

| Step | Before | After |
| --- | --- | --- |
| Install | 48 s | 6 s |
| Type check | 71 s | 19 s |
| Tests | 112 s | 28 s |
| Bundle | 23 s | 4 s |

## What made the difference

- **Cache the install by lockfile.** Obvious, and we'd still let it lapse.
- **Check types per package.** Only what changed, plus what depends on it.
- **Run tests in parallel, by file size.** The slowest files start first.
- **Delete tests that only test the framework.** We removed 140 of them and lost nothing.

\`\`\`sh
# What runs on every push, start to finish.
npm ci --prefer-offline
npm run check -- --changed
npm test -- --shard=$SHARD
npm run bundle
\`\`\`

It's now 57 seconds on a cold machine. The real win isn't the minute, though: it's that nobody batches changes anymore.`,
  },
  {
    key: 'winter', ws: 'copperline', as: 'copperline', days: 3, drawing: { motif: 'energy', seed: 7434 }, featured: true, claps: 156,
    title: 'Notes from our first winter',
    subtitle: 'What the cold did to charging, and what we changed in the spring update.',
    tags: ['field', 'product'],
    markdown: `Our first batteries went into homes in late autumn, which meant their first real test was a winter. We had modelled it. We had a cold room at the lab. Neither prepared us for a garage at minus eight with the door left open overnight.

## What happened

Lithium cells don't like to charge when they're cold. Below freezing, our firmware slowed charging right down to protect them, exactly as designed. The trouble was the timing: the sun is weakest in winter, and the few good hours of it arrived while the garage was still at its coldest. Batteries sat half empty on clear days, waiting to warm up, while the panels on the roof had power to spare.

> [!NOTE]
> Nothing was ever unsafe. The cells were doing what they should. They were just being too careful at the wrong hour.

## What we changed

- **Warm before you need to.** The battery now looks at the forecast and the panels' output, and starts warming its cells a little before the sun comes up, using a sliver of what's stored overnight.
- **Charge in steps.** Instead of waiting for one temperature, it charges gently as the cells warm, faster as they reach their comfortable range.
- **Say less, mean it.** The app used to show "charging paused: low temperature" all morning. Now it tells you once, in plain words, and only if the battery will end the day lower than usual.

The spring update brings all three to every battery out there. Elena has more on what the installs themselves taught us:

/@elena/what-our-first-installs-taught-us

If your battery lives somewhere cold and you've noticed anything odd, reply here. We read everything, and the winter taught us that the people living with these boxes notice things our sensors don't.`,
  },
  {
    key: 'screen', ws: 'copperline', as: 'jonah', days: 7, drawing: { motif: 'energy', seed: 7101 }, claps: 121,
    title: 'Why our battery has no screen',
    subtitle: 'Four small lights, an app you rarely open, and a box you can forget.',
    tags: ['design', 'hardware'],
    markdown: `Every early drawing of our battery had a screen on it. A nice one, with a little animation of energy flowing from the roof to the house. We kept drawing it because that's what a modern appliance looks like. Then we asked ourselves when anyone would actually look at it.

The honest answer was: twice. Once on the day it was installed, and once when something went wrong. The rest of the time it would be glowing in a garage or a utility cupboard, using power to show a number nobody was there to read.

## Four lights

So the front of the battery has four small lights instead. They count up as it charges and count down as the house uses it. If one blinks amber, there's something you should know, and the app will tell you what. That's the whole interface on the box.

We tested it with people who had never seen a home battery. Nearly all of them understood it in a few seconds, and nobody asked for more. Several asked if they could turn the lights off.

## The app does less, too

The app opens to one sentence: how long the battery could run the house right now. History, settings and the clever graphs are a swipe away for the people who want them. Most people never swipe.

> [!TIP]
> Hold the button under the lights for two seconds to dim them for the night. They come back at dawn.

A product you can forget about is the goal, not a failure. The best compliment we've had so far came from a homeowner during a power cut: "I forgot we had it until the lights stayed on."`,
  },
  {
    key: 'installs', ws: 'copperline', as: 'elena', days: 11, drawing: { motif: 'people', seed: 7212 }, claps: 94,
    title: 'What our first installs taught us',
    subtitle: 'Garages are colder, walls are weaker and people are kinder than we planned for.',
    tags: ['field', 'engineering'],
    markdown: `I spent most of the autumn on installs, with a van, a laser level and a notebook. Here is what went into the notebook that the drawings didn't have.

## Walls are not what the drawings say

We designed the bracket for a solid wall. Fewer than half of the walls we mounted on were solid. We met plasterboard over air, old brick that crumbled under the drill, and one beautiful oak beam that we were not allowed to touch. The bracket now comes with three sets of fixings and a short guide for each, and installers carry a small backing plate for the worst cases.

## People want to watch

We planned installs as a job for the installer alone. In practice, the people who live there want to see where it goes, what the lights mean, and how to switch it off. Now every install ends with ten minutes at the battery together, and a printed card stuck inside the cupboard door.

## The cupboard matters more than the battery

Batteries ended up in garages, hallways, under stairs and once in a wardrobe. Where it goes decides how warm it stays, how quiet it needs to be, and whether anyone sees the lights. We now ask about the space before we ship, not on the day.

> [!IMPORTANT]
> If you're getting a battery, tell your installer where you hope it will go, and where it absolutely mustn't. It saves everyone a day.

The winter added its own lessons, which the team wrote up here:

/copperline/notes-from-our-first-winter`,
  },
  {
    key: 'quiet', ws: 'copperline', as: 'kofi', days: 16, drawing: { motif: 'rings', seed: 7323 }, claps: 88,
    title: 'Designing for the quietest room in the house',
    subtitle: 'A battery lives where people sleep, so it has to be quieter than the fridge.',
    tags: ['engineering', 'sound'],
    markdown: `A battery makes two kinds of noise: the hum of its electronics and the fan that keeps them cool. In a garage, nobody minds either. In a hallway outside a child's bedroom, both matter a great deal.

## Measure the room, not the box

Our first target was a number for the battery on its own. It was the wrong target. A quiet hum in a quiet house at night is louder than a noisy fan in a busy kitchen at noon. So we started measuring in real homes, at night, from where people sleep.

## What we changed

- **No fan at night.** The battery plans its heavy work, charging from the grid when that's cheapest, for hours when the house is awake, and coasts silently on its heat sink overnight.
- **A slower, larger fan.** When it does need air, a bigger fan turning slowly is far quieter than a small fast one, and much less noticeable.
- **Soft mounts.** The electronics sit on rubber, so the wall doesn't carry the hum into the next room.

> [!NOTE]
> Sound is personal. If yours is ever noticeable, tell us where it is and when you hear it. We adjust the quiet hours remotely.

The best test we found is the simplest: stand outside the bedroom door at midnight. If you can hear it, we're not done.`,
  },
];

// quote.exact must appear word for word in the post.
export const COMMENTS = [
  { post: 'launch', as: 'alex', quote: 'a calendar that treats empty time as something worth protecting', body: `This is the line that sold me. Every other calendar treats a gap as a bug.` },
  { post: 'launch', as: 'lumen', reply: 0, body: `That was exactly the feeling we started from. Thanks for being here since the early days, Alex.` },
  { post: 'launch', as: 'rio', quote: 'Quiet hours.', body: `I mark 5 to 7 am as quiet hours for baking. Will people inviting me see why, or just that I’m busy?` },
  { post: 'launch', as: 'lumen', reply: 2, body: `Just "busy". Quiet hours are yours, and we never show what they’re for.` },
  { post: 'launch', as: 'june', body: `Offline that actually works is the feature I didn’t know I needed. Planning a week of site visits with no signal was painless.` },
  { post: 'offline', as: 'june', quote: 'The edit wins, and the event comes back', body: `Bold choice. We went the other way at work and regretted it. Do you show any hint when a deleted event comes back?` },
  { post: 'offline', as: 'theo', reply: 5, body: `Yes: it comes back with a small "restored" label for a day, and one tap undoes it. People found that much less alarming than a dialog.` },
  { post: 'research', as: 'alex', quote: 'Half our participants put fake meetings in their own calendar to protect time.', body: `Guilty. I have a weekly "sync" that is just me with headphones on.` },
  { post: 'reviews', as: 'june', quote: 'The designer decides.', body: `How do you handle it when the decision lands badly with someone senior?` },
  { post: 'reviews', as: 'maya', reply: 8, body: `They write their objection on the page, and it stays there next to the decision. Most of the time that’s enough. If not, that’s when the fifteen minutes happen.` },
  { post: 'empty', as: 'rio', body: `The faint tint on today’s column is such a small thing, and I notice it every morning.` },
  { post: 'screen', as: 'maya', quote: 'A product you can forget about is the goal, not a failure.', body: `As someone who designs a calendar, I wish more products were brave enough to want to be ignored.` },
  { post: 'screen', as: 'jonah', reply: 11, body: `Thank you. It took a while to convince ourselves, too. The first prototype without a screen felt broken for about a week.` },
  { post: 'quiet', as: 'june', body: `How quiet is quiet? Do you publish a number, or just the midnight test?` },
  { post: 'quiet', as: 'kofi', reply: 13, body: `Both. Under 25 dB a metre away at night, which is quieter than most fridges. But the midnight test is the one we trust.` },
  { post: 'winter', as: 'rio', quote: 'starts warming its cells a little before the sun comes up', body: `Our bakery runs the ovens from 5 am, so this is exactly when we need it. Does warming the cells eat into that?` },
  { post: 'winter', as: 'copperline', reply: 15, body: `A little, on the coldest mornings: about what a kettle uses. If you set your early hours in the app, the battery keeps that much aside before it warms anything.` },
  { post: 'installs', as: 'theo', body: `The printed card inside the cupboard door is a great idea. Software teams could learn from that.` },
];
