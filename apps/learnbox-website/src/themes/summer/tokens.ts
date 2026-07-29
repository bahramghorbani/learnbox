export const summerTheme = {
  colors: {
    sky: '#61bff2',
    cloud: '#fffdf6',
    sunlight: '#ffd36a',
    leaf: '#23784a',
    flower: '#e54d94',
    learnboxPurple: '#6c3ad6',
    ink: '#17233d',
    surface: '#fffdf8',
  },
  motion: {
    arrive: 'cubic-bezier(0.16, 1, 0.3, 1)',
    immediate: 140,
    state: 240,
    scene: 720,
  },
} as const;

export type SummerScene = 'berlin' | 'rhine';
