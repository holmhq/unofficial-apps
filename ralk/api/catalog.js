// What Ralk can play. The sounds are earshot's bank, rendered in the browser from code
// (web/vendor/earshot/earshot.js); each kind of notification has a default sound that a
// person can change in the app. The voices are fal.ai's Inworld TTS built-in voices.

export const KINDS = [
  { id: 'done', label: 'Done', blurb: 'A task finished well', sound: 'mallet/up4', icon: 'check', tone: 'green' },
  { id: 'attention', label: 'Needs you', blurb: 'Waiting on your input or approval', sound: 'notify/mid_tine', icon: 'hand', tone: 'amber' },
  { id: 'question', label: 'Question', blurb: 'Claude is asking something', sound: 'notify/mid_wood', icon: 'help', tone: 'blue' },
  { id: 'error', label: 'Problem', blurb: 'Something failed', sound: 'ui_pop/fall', icon: 'alert', tone: 'red' },
  { id: 'info', label: 'Note', blurb: 'For your information', sound: 'ui_pop/soft', icon: 'info', tone: 'grey' },
  { id: 'start', label: 'Started', blurb: 'A long task began', sound: 'swish/flick', icon: 'play', tone: 'violet' },
];
export const KIND_IDS = KINDS.map((k) => k.id);
// A spoken line with no sound of its own; the app shows it with the voice tone.
export const SAY_KIND = { id: 'say', label: 'Said', blurb: 'A spoken line', sound: 'none', icon: 'voice', tone: 'violet' };

export const GROUPS = [
  { id: 'chimes', label: 'Chimes', blurb: 'Rounded, musical; good for done and needs-you' },
  { id: 'pops', label: 'Pops', blurb: 'Soft and short; good for notes and small events' },
  { id: 'ticks', label: 'Ticks', blurb: 'Tiny; for taps and steps' },
  { id: 'keys', label: 'Keys', blurb: 'A single typing key' },
  { id: 'swishes', label: 'Swishes', blurb: 'Movement; good for starts' },
  { id: 'hits', label: 'Hits', blurb: 'Weight; for problems, sparingly' },
  { id: 'swells', label: 'Swells', blurb: 'A reverse rise into a stop' },
  { id: 'risers', label: 'Risers', blurb: 'Tension that builds' },
  { id: 'runs', label: 'Typing runs', blurb: 'A second and a half of typing' },
];

export const SOUNDS = [
  { id: 'mallet/up4', name: 'Rising chime', blurb: 'Four notes up a pentatonic scale', group: 'chimes', dur: 0.75 },
  { id: 'mallet/flourish', name: 'Flourish', blurb: 'A quick three-note arc', group: 'chimes', dur: 0.5 },
  { id: 'notify/mid_tine', name: 'Ding', blurb: 'A felt-struck tine with its octave', group: 'chimes', dur: 0.43 },
  { id: 'notify/mid_wood', name: 'Wood', blurb: 'A soft wooden bar, a step higher', group: 'chimes', dur: 0.32 },
  { id: 'mallet/glock', name: 'Glockenspiel', blurb: 'One bright note, doubled below', group: 'chimes', dur: 0.41 },
  { id: 'mallet/celesta', name: 'Celesta', blurb: 'A wide, gated G5', group: 'chimes', dur: 0.41 },
  { id: 'mallet/marimba', name: 'Marimba', blurb: 'A short dry wooden note', group: 'chimes', dur: 0.56 },
  { id: 'mallet/pluck', name: 'Pluck', blurb: 'A soft, felt-like low pluck', group: 'chimes', dur: 0.49 },
  { id: 'ui_pop/soft', name: 'Soft pop', blurb: 'A rounded mid pop', group: 'pops', dur: 0.18 },
  { id: 'ui_pop/step', name: 'Step', blurb: 'The soft pop a step higher, falling', group: 'pops', dur: 0.19 },
  { id: 'ui_pop/boop', name: 'Boop', blurb: 'A rounder boop that falls', group: 'pops', dur: 0.19 },
  { id: 'ui_pop/blip', name: 'Blip', blurb: 'A bright, wide blip', group: 'pops', dur: 0.12 },
  { id: 'ui_pop/fall', name: 'Fall', blurb: 'An eased fall with a faint second pop', group: 'pops', dur: 0.2 },
  { id: 'ui_pop/wide', name: 'Wide pop', blurb: 'A wide pop with a lip click', group: 'pops', dur: 0.19 },
  { id: 'hover_tick/high', name: 'High tick', blurb: 'The lightest tick', group: 'ticks', dur: 0.05 },
  { id: 'hover_tick/mid', name: 'Mid tick', blurb: 'A tick with a little body', group: 'ticks', dur: 0.09 },
  { id: 'hover_tick/ping', name: 'Ping tick', blurb: 'A tick with a ping on top', group: 'ticks', dur: 0.05 },
  { id: 'hover_tick/air', name: 'Air tick', blurb: 'A tick with a breath of air', group: 'ticks', dur: 0.07 },
  { id: 'hover_tick/detent', name: 'Detent', blurb: 'A mechanical click', group: 'ticks', dur: 0.08 },
  { id: 'pro_hover_tick/glass', name: 'Glass tick', blurb: 'A glassy tap', group: 'ticks', dur: 0.04 },
  { id: 'pro_hover_tick/soft', name: 'Soft tick', blurb: 'Barely there', group: 'ticks', dur: 0.03 },
  { id: 'pro_hover_tick/ping', name: 'Fine ping', blurb: 'A fine ping', group: 'ticks', dur: 0.04 },
  { id: 'pro_hover_tick/air', name: 'Fine air', blurb: 'A fine airy tick', group: 'ticks', dur: 0.06 },
  { id: 'pro_hover_tick/detent', name: 'Fine detent', blurb: 'A fine click', group: 'ticks', dur: 0.04 },
  { id: 'pro_typing_key/soft', name: 'Soft key', blurb: 'A quiet key press', group: 'keys', dur: 0.07 },
  { id: 'pro_typing_key/glass', name: 'Glass key', blurb: 'A glassy key press', group: 'keys', dur: 0.06 },
  { id: 'pro_typing_key/blip', name: 'Blip key', blurb: 'A key press with a blip', group: 'keys', dur: 0.08 },
  { id: 'pro_typing_key/double', name: 'Double key', blurb: 'Two key presses', group: 'keys', dur: 0.09 },
  { id: 'pro_typing_key/tick', name: 'Tick key', blurb: 'A clicky key press', group: 'keys', dur: 0.06 },
  { id: 'pro_typing_key/crackle', name: 'Crackle key', blurb: 'A key press with crackle', group: 'keys', dur: 0.07 },
  { id: 'swish/flick', name: 'Flick', blurb: 'A high flick that rises and stops', group: 'swishes', dur: 0.32 },
  { id: 'swish/bright', name: 'Bright swish', blurb: 'A quick bright swish', group: 'swishes', dur: 0.35 },
  { id: 'whoosh_fast/whip', name: 'Whip', blurb: 'A wide ring that falls', group: 'swishes', dur: 0.91 },
  { id: 'cut_hit/punch', name: 'Punch', blurb: 'A short punchy hit', group: 'hits', dur: 0.28 },
  { id: 'cut_hit/kick', name: 'Kick', blurb: 'A kick-led sub hit', group: 'hits', dur: 0.33 },
  { id: 'cut_hit/sub', name: 'Sub', blurb: 'A short sub hit with a kick', group: 'hits', dur: 0.29 },
  { id: 'cut_hit/air', name: 'Air hit', blurb: 'A sub hit under a bright band', group: 'hits', dur: 0.55 },
  { id: 'cut_hit/rumble', name: 'Rumble', blurb: 'A kick into a granular rumble', group: 'hits', dur: 1.4 },
  { id: 'reverse_swell/short', name: 'Short swell', blurb: 'A quick reverse cymbal', group: 'swells', dur: 0.65 },
  { id: 'reverse_swell/breath', name: 'Breath', blurb: 'A mid-band reverse breath', group: 'swells', dur: 1.24 },
  { id: 'reverse_swell/cymbal', name: 'Cymbal', blurb: 'A bright reverse cymbal', group: 'swells', dur: 0.9 },
  { id: 'reverse_swell/dark', name: 'Dark swell', blurb: 'A darker swell with a low body', group: 'swells', dur: 0.92 },
  { id: 'reverse_swell/ring', name: 'Ring', blurb: 'A swell that rings out', group: 'swells', dur: 1.68 },
  { id: 'riser/snatch', name: 'Snatch', blurb: 'A half-second stutter into a cut', group: 'risers', dur: 0.64 },
  { id: 'riser/dark', name: 'Dark riser', blurb: 'Noise, sub and a speeding stutter', group: 'risers', dur: 0.95 },
  { id: 'riser/build', name: 'Build', blurb: 'A sub-heavy build with crackle', group: 'risers', dur: 1.76 },
  { id: 'pro_typing_run/soft', name: 'Soft typing', blurb: 'Quiet keys for a moment', group: 'runs', dur: 1.75 },
  { id: 'pro_typing_run/standard', name: 'Typing', blurb: 'Ordinary keys for a moment', group: 'runs', dur: 1.44 },
  { id: 'pro_typing_run/glass', name: 'Glass typing', blurb: 'Glassy keys for a moment', group: 'runs', dur: 1.47 },
  { id: 'pro_typing_run/blip', name: 'Blip typing', blurb: 'Keys with blips', group: 'runs', dur: 1.51 },
  { id: 'pro_typing_run/double', name: 'Double typing', blurb: 'Doubled keys', group: 'runs', dur: 1.59 },
  { id: 'pro_typing_run/tick', name: 'Tick typing', blurb: 'Clicky keys', group: 'runs', dur: 1.27 },
];
export const SOUND_IDS = new Set(SOUNDS.map((s) => s.id));

// fal.ai Inworld TTS voices (built in; "Name (lang)" is the value the model takes).
export const VOICES = [
  ['en', 'English', ['Olivia', 'Ashley', 'Craig', 'Sarah', 'Alex', 'Elizabeth', 'Theodore', 'Wendy', 'Mark', 'Julia', 'Dennis', 'Edward', 'Deborah', 'Timothy', 'Ronald', 'Shaun', 'Priya', 'Hana', 'Luna', 'Pixie', 'Hades', 'Dominus', 'Clive', 'Carter', 'Blake', 'Loretta', 'Darlene', 'Marlene', 'Hank', 'Evelyn', 'Celeste', 'Pippa', 'Tessa', 'Liam', 'Callum', 'Hamish', 'Abby', 'Graham', 'Rupert', 'Mortimer', 'Snik', 'Anjali', 'Saanvi', 'Arjun', 'Claire', 'Oliver', 'Simon', 'Elliot', 'James', 'Serena', 'Gareth', 'Vinny', 'Lauren', 'Jessica', 'Ethan', 'Tyler', 'Jason', 'Chloe', 'Veronica', 'Victoria', 'Miranda', 'Sebastian', 'Victor', 'Malcolm', 'Kayla', 'Nate', 'Jake', 'Brian', 'Amina', 'Kelsey', 'Derek', 'Grant', 'Evan']],
  ['de', 'German', ['Johanna', 'Josef']],
  ['es', 'Spanish', ['Diego', 'Lupita', 'Miguel', 'Rafael']],
  ['fr', 'French', ['Alain', 'Hélène', 'Mathieu', 'Étienne']],
  ['it', 'Italian', ['Gianni', 'Orietta']],
  ['nl', 'Dutch', ['Erik', 'Katrien', 'Lennart', 'Lore']],
  ['pl', 'Polish', ['Szymon', 'Wojciech']],
  ['pt', 'Portuguese', ['Heitor', 'Maitê']],
  ['ru', 'Russian', ['Svetlana', 'Elena', 'Dmitry', 'Nikolai']],
  ['hi', 'Hindi', ['Riya', 'Manoj']],
  ['ja', 'Japanese', ['Asuka', 'Satoshi']],
  ['ko', 'Korean', ['Hyunwoo', 'Minji', 'Seojun', 'Yoona']],
  ['zh', 'Chinese', ['Yichen', 'Xiaoyin', 'Xinyi', 'Jing']],
  ['ar', 'Arabic', ['Nour', 'Omar']],
  ['he', 'Hebrew', ['Yael', 'Oren']],
].map(([code, language, names]) => ({ code, language, voices: names.map((name) => ({ id: `${name} (${code})`, name })) }));
export const VOICE_IDS = new Set(VOICES.flatMap((l) => l.voices.map((v) => v.id)));
export const DEFAULT_VOICE = 'Olivia (en)';

export function kindOf(id) { return id === 'say' ? SAY_KIND : KINDS.find((k) => k.id === id) || null; }
export function soundOf(id) { return SOUNDS.find((s) => s.id === id) || null; }
export function catalog() { return { kinds: KINDS, groups: GROUPS, sounds: SOUNDS, voices: VOICES, default_voice: DEFAULT_VOICE }; }
