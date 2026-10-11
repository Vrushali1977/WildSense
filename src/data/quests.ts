export interface NatureQuest {
  id: string;
  title: string;
  category: string;
  duration: string;
  description: string;
  steps: string[];
  reflection: string;
}

export const quests: NatureQuest[] = [
  { id: 'leaf-shapes', title: 'Meet a leaf', category: 'Look closer', duration: '5 min', description: 'Find a fallen leaf and notice what makes its shape its own.', steps: ['Look for a leaf already on the ground.', 'Trace its outline with your eyes.', 'Notice the veins, edges, and any tiny changes in colour.'], reflection: 'What detail did you notice only after slowing down?' },
  { id: 'bird-listen', title: 'A minute of birdsong', category: 'Listen in', duration: '2 min', description: 'Pause outside and listen for the different layers of sound.', steps: ['Find a comfortable place to stand or sit.', 'Listen quietly for one full minute.', 'Count distinct calls or describe their rhythm.'], reflection: 'Which sound was nearest? Which was farthest away?' },
  { id: 'cloud-watch', title: 'Watch the sky change', category: 'Look up', duration: '3 min', description: 'Notice the shapes and movement of clouds above you.', steps: ['Find a safe view of the sky.', 'Choose one cloud to watch.', 'Notice its edges or how it changes as it moves.'], reflection: 'Did the sky feel still, busy, or somewhere in between?' },
  { id: 'textures', title: 'A little texture hunt', category: 'Feel curious', duration: '8 min', description: 'Find three different natural textures without picking anything.', steps: ['Notice bark, stone, soil, or a leaf.', 'Describe each texture with a few words.', 'Leave everything where you found it.'], reflection: 'Which texture surprised you most?' },
  { id: 'tiny-life', title: 'Look for the small things', category: 'Look closer', duration: '6 min', description: 'Explore a small patch of ground as if it were a whole landscape.', steps: ['Choose a patch without disturbing it.', 'Look for tiny plants, patterns, or movement.', 'Give the little landscape a name.'], reflection: 'What might you have missed if you had walked past?' },
  { id: 'nature-colours', title: 'Collect colours with your eyes', category: 'Notice', duration: '5 min', description: 'Find a handful of different colours in the living world.', steps: ['Spot five natural colours nearby.', 'Notice whether each is bright, muted, warm, or cool.', 'Leave flowers and leaves growing where they are.'], reflection: 'Which colour felt most unexpected today?' },
  { id: 'wind-watch', title: 'Find the invisible wind', category: 'Feel curious', duration: '4 min', description: 'Look for clues that the wind is moving around you.', steps: ['Watch grass, branches, or loose leaves.', 'Notice how the air feels on your skin.', 'See if the breeze comes and goes.'], reflection: 'What moved first when the wind arrived?' },
];

export function getQuestOfTheDay(date = new Date()): NatureQuest {
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return quests[((dayNumber % quests.length) + quests.length) % quests.length]!;
}

export function countCompletedQuestIds(completedIds: string[]): number {
  const knownIds = new Set(quests.map((quest) => quest.id));
  return new Set(completedIds.filter((id) => knownIds.has(id))).size;
}
