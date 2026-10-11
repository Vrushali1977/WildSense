export type MissionDifficulty = 'Gentle' | 'Easy' | 'A little curious';

export interface NatureMission {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  difficulty: MissionDifficulty;
  instructions: string[];
  prompt: string;
  category: string;
}

export const missions: NatureMission[] = [
  { id: 'leaf-shapes', title: 'Three kinds of leaf', description: 'Find three different leaf shapes, leaving each one where it grows or fell.', durationMinutes: 5, difficulty: 'Gentle', instructions: ['Look for leaves at different heights or on different plants.', 'Compare their outlines: round, pointed, lobed, long, or something else.', 'Notice one small detail on each leaf without picking it.'], prompt: 'Are the edges smooth or serrated? Which shape surprised you?', category: 'Plants' },
  { id: 'cloud-minute', title: 'Clouds on the move', description: 'Watch the sky for five unhurried minutes and notice how it changes.', durationMinutes: 5, difficulty: 'Gentle', instructions: ['Choose a safe place with a view of the sky.', 'Pick one cloud and watch its edges or movement.', 'Notice whether the light or shapes shift while you wait.'], prompt: 'What changed first: the cloud, the light, or your attention?', category: 'Sky' },
  { id: 'green-shades', title: 'A palette of green', description: 'Notice five different shades of green in the living world.', durationMinutes: 5, difficulty: 'Easy', instructions: ['Look around without touching plants.', 'Find five greens, from pale to deep or yellow-green to blue-green.', 'Notice what light or shade does to each colour.'], prompt: 'Which shade was easiest to miss at first?', category: 'Plants' },
  { id: 'listen-outside', title: 'Two minutes of listening', description: 'Let the outdoor soundscape come to you for two minutes.', durationMinutes: 2, difficulty: 'Gentle', instructions: ['Pause somewhere safe and comfortable.', 'Listen for near sounds, far sounds, and quiet gaps.', 'Count or describe the different sounds you notice.'], prompt: 'What did you hear after the first sound?', category: 'Sound' },
  { id: 'natural-textures', title: 'Three natural textures', description: 'Find three different textures with your eyes; leave nature undisturbed.', durationMinutes: 6, difficulty: 'Easy', instructions: ['Notice bark, stone, soil, a fallen leaf, or grass.', 'Describe each texture with a few words.', 'Compare rough, smooth, ridged, soft, or patterned surfaces.'], prompt: 'Which texture changes most when you look from another angle?', category: 'Textures' },
  { id: 'bark-patterns', title: 'A tree’s quiet patterns', description: 'Look closely at one tree’s bark and trace its patterns with your eyes.', durationMinutes: 4, difficulty: 'Gentle', instructions: ['Choose a tree you can observe without damaging it.', 'Follow a line, ridge, colour change, or tiny patch of lichen.', 'Notice how the pattern changes as you look higher or lower.'], prompt: 'Can you find a repeated shape or a place where the pattern changes?', category: 'Patterns' },
  { id: 'insect-watch', title: 'A respectful insect watch', description: 'Observe an insect from a comfortable distance without touching or disturbing it.', durationMinutes: 5, difficulty: 'A little curious', instructions: ['Wait for an insect to appear in a safe, accessible spot.', 'Watch its path or pauses from a respectful distance.', 'Let it move on naturally; never handle or block it.'], prompt: 'What did it do that you might have missed in a quick glance?', category: 'Small life' },
  { id: 'phone-free-stroll', title: 'A pocket-free stroll', description: 'Take a short, familiar walk without checking your phone.', durationMinutes: 10, difficulty: 'A little curious', instructions: ['Choose a safe, familiar route and put your phone away.', 'Stay aware of traffic, paths, weather, and people around you.', 'Notice one small thing on the way back.'], prompt: 'What did your attention settle on when your phone was away?', category: 'Walking' },
  { id: 'natural-pattern', title: 'A pattern in the wild', description: 'Find an interesting natural pattern in a branch, stone, seed, or ripple.', durationMinutes: 5, difficulty: 'Easy', instructions: ['Look for repeated lines, spirals, symmetry, or branching.', 'Try viewing the pattern from a slightly different angle.', 'Do not remove or disturb what you find.'], prompt: 'Does the pattern feel symmetrical, repeating, or completely its own?', category: 'Patterns' },
  { id: 'quiet-note', title: 'One thing you noticed', description: 'Sit quietly outdoors and make room for one detail you would usually pass by.', durationMinutes: 5, difficulty: 'Gentle', instructions: ['Find a safe, comfortable place to pause.', 'Take a few calm breaths and look around.', 'Choose one small sound, colour, movement, or texture to remember.'], prompt: 'What did you notice that you might normally overlook?', category: 'Reflection' },
];

export const observationPrompts = [
  'Are the edges smooth or serrated?',
  'What patterns can you see on the surface?',
  'Does it seem symmetrical?',
  'Which colours or textures stand out?',
  'What changes when you look from another angle?',
  'What did you notice that you might normally overlook?',
];

export const environments = ['Garden', 'Park', 'Forest', 'Lakeside', 'Mountains'] as const;
export type Environment = typeof environments[number];
