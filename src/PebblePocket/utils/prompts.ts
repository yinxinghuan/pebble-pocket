// Each daily stone gets a randomly-rolled kind + mood. The prompt template
// keeps the FRAMING constant (top-down macro, isolated, dark sand) so visually
// the pocket reads as a coherent collection — but the SUBJECT varies enough
// that no two stones feel like duplicates.

export const KINDS = [
  'milky quartz', 'rose quartz', 'smoky quartz', 'amethyst',
  'pink granite', 'grey granite', 'black basalt',
  'slate', 'sandstone', 'limestone',
  'banded agate', 'moss agate', 'jasper', 'carnelian',
  'amber with a tiny inclusion', 'jet',
  'obsidian', 'flint', 'serpentine', 'jade',
  'pumice', 'chalcedony', 'sodalite', 'malachite',
  'iron-stained quartzite', 'fool\'s gold pyrite',
];

export const MOODS = [
  'water-polished smooth', 'wave-tumbled rounded', 'sun-bleached',
  'lichen-flecked', 'salt-crusted edges', 'freshly-broken sharp facet',
  'wet from the sea', 'weathered with tiny pits',
  'a single white quartz vein crossing it',
  'half-buried in the dark wet sand',
];

export interface StoneRecipe {
  kind: string;
  mood: string;
  prompt: string;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function newStoneRecipe(): StoneRecipe {
  const kind = pick(KINDS);
  const mood = pick(MOODS);
  const prompt = [
    `a single ${kind} pebble, ${mood},`,
    'top-down macro photograph, hyperreal natural detail,',
    'isolated on dark wet sand with subtle grains,',
    'soft overcast natural daylight, gentle shadow,',
    'no human elements, no text, no other stones,',
    'centered composition, 1:1 square crop',
  ].join(' ');
  return { kind, mood, prompt };
}
