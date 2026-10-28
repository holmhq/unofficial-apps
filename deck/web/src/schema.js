// What each layout holds, for the studio's inspector, and a starting slide for each. Field
// types: text (one line), long (a few lines), lines (a list of short lines, one per line),
// link ({href, label}), color (a card accent), bool, image (from the library), number
// (0–100), select, and list (repeated items with their own fields, min/max items).

const kicker = { key: 'kicker', label: 'Tag', type: 'text', hint: 'A small label above the title' };
const title = { key: 'title', label: 'Title', type: 'text' };
const lead = { key: 'lead', label: 'Lead', type: 'long', hint: 'One line under the title' };

export const LAYOUTS = {
  title: {
    label: 'Cover', blurb: 'Title, a line on what this is for, who and when',
    fields: [kicker, title, { key: 'subtitle', label: 'Subtitle', type: 'long' }, { key: 'byline', label: 'Byline', type: 'text' }, { key: 'date', label: 'Date', type: 'text' },
      { key: 'preview', label: 'Show the next slides beside the title', type: 'bool', default: true }],
  },
  statement: {
    label: 'Statement', blurb: 'One sentence, with a few words highlighted',
    fields: [kicker, { key: 'text', label: 'Sentence', type: 'long', hint: 'Under about 140 characters' },
      { key: 'emphasis', label: 'Highlight', type: 'text', hint: 'Words from the sentence, exactly' }, { key: 'source', label: 'Source', type: 'text' }],
  },
  three: {
    label: 'Cards', blurb: 'Two to four side by side',
    fields: [kicker, title, lead, {
      key: 'cards', label: 'Cards', item: 'Card', type: 'list', min: 2, max: 4,
      fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'role', label: 'Role', type: 'text', hint: 'One line on its job' },
        { key: 'bullets', label: 'Points', type: 'lines', hint: 'One per line, up to three' }, { key: 'link', label: 'Link', type: 'link' }, { key: 'accent', label: 'Colour', type: 'color' }],
      make: () => ({ name: 'Another', role: 'What it does' }),
    }],
  },
  flow: {
    label: 'Flow', blurb: 'Steps in order, ending at the goal',
    fields: [kicker, title, lead, {
      key: 'steps', label: 'Steps', item: 'Step', type: 'list', min: 2, max: 6,
      fields: [{ key: 'label', label: 'Step', type: 'text' }, { key: 'detail', label: 'Detail', type: 'text' }],
      make: () => ({ label: 'Next step', detail: '' }),
    }],
  },
  shot: {
    label: 'Screenshot', blurb: 'A picture with boxes and pins that point',
    fields: [kicker, title, lead, { key: 'image', label: 'Picture', type: 'image' }, { key: 'alt', label: 'Describe the picture', type: 'text', hint: 'For people who can’t see it' },
      { key: 'caption', label: 'Caption', type: 'long' }, {
        key: 'callouts', label: 'Callouts', item: 'Callout', type: 'list', min: 0, max: 8, drag: true,
        fields: [{ key: 'label', label: 'Label', type: 'text' }, { key: 'x', label: 'Left %', type: 'number' }, { key: 'y', label: 'Top %', type: 'number' },
          { key: 'w', label: 'Width %', type: 'number', hint: 'Leave empty for a pin' }, { key: 'h', label: 'Height %', type: 'number' }],
        make: () => ({ x: 50, y: 50, label: 'What to notice' }),
      }],
  },
  numbers: {
    label: 'Numbers', blurb: 'Big figures that count up, with sources',
    fields: [kicker, title, lead, {
      key: 'stats', label: 'Numbers', item: 'Number', type: 'list', min: 1, max: 4,
      fields: [{ key: 'value', label: 'Value', type: 'text', hint: '42%, 3×, 12,000, 18 months' }, { key: 'label', label: 'What it measures', type: 'text' }, { key: 'source', label: 'Source', type: 'text' }],
      make: () => ({ value: '10×', label: 'What it measures', source: 'Where it comes from' }),
    }],
  },
  cta: {
    label: 'The ask', blurb: 'What should happen next, who and by when',
    fields: [kicker, { ...title, label: 'The ask' }, lead, {
      key: 'steps', label: 'Steps', item: 'Step', type: 'list', min: 0, max: 6,
      fields: [{ key: 'text', label: 'Step', type: 'text' }, { key: 'owner', label: 'Who', type: 'text' }, { key: 'date', label: 'When', type: 'text' }],
      make: () => ({ text: 'A concrete step', owner: 'Who', date: 'When' }),
    }, {
      key: 'buttons', label: 'Buttons', item: 'Button', type: 'list', min: 0, max: 2,
      fields: [{ key: 'label', label: 'Label', type: 'text' }, { key: 'href', label: 'Address', type: 'text', hint: 'https://…, mailto:…, or #3 for slide 3' },
        { key: 'style', label: 'Style', type: 'select', options: [['', 'Automatic'], ['primary', 'Filled'], ['secondary', 'Plain']] }],
      make: () => ({ label: 'Book a call', href: 'mailto:' }),
    }],
  },
};

export const TEMPLATES = {
  title: () => ({ layout: 'title', title: 'The title of this deck', subtitle: 'One sentence on what it is for.' }),
  statement: () => ({ layout: 'statement', text: 'One sentence the room should remember.', emphasis: 'remember' }),
  three: () => ({ layout: 'three', title: 'Three parts, one idea', cards: [{ name: 'First', role: 'What it does' }, { name: 'Second', role: 'What it does' }, { name: 'Third', role: 'What it does' }] }),
  flow: () => ({ layout: 'flow', title: 'How it works', steps: [{ label: 'Start', detail: 'One short line' }, { label: 'Then', detail: 'One short line' }, { label: 'Done', detail: 'One short line' }] }),
  shot: () => ({ layout: 'shot', title: 'Show it, then point at it', image: '/img/sample-shot.webp', alt: 'A slide from the sample deck', callouts: [{ x: 50, y: 50, label: 'What to notice' }] }),
  numbers: () => ({ layout: 'numbers', title: 'What changes', stats: [{ value: '42%', label: 'What it measures', source: 'Where it comes from' }, { value: '3×', label: 'What it measures', source: 'Where it comes from' }] }),
  cta: () => ({ layout: 'cta', kicker: 'The ask', title: 'What should happen next', steps: [{ text: 'A concrete step', owner: 'Who', date: 'When' }] }),
};

// Switching layout keeps the words that carry over and fills what the new one needs.
export function switchLayout(slide, layout) {
  const keep = {};
  for (const key of ['kicker', 'title', 'lead', 'notes']) if (slide[key]) keep[key] = slide[key];
  if (layout === 'statement' && !keep.text) keep.text = slide.text || slide.title || '';
  const base = TEMPLATES[layout]();
  if (layout === 'statement') { delete keep.title; if (!keep.text) delete keep.text; }
  return { ...base, ...keep, layout };
}

export const ACCENT_NAMES = { cobalt: 'Cobalt', pine: 'Pine', plum: 'Plum', amber: 'Amber', coral: 'Coral', graphite: 'Graphite' };
export const CARD_COLORS = ['#2f5bd8', '#1d7356', '#0f8a76', '#7a3fb0', '#b7791f', '#d2493a', '#3c4350'];
