export type LaunchExperience = {
  id: string;
  imagePath: string;
  durationMs: number;
};

/**
 * The approved, publishable launch experience. Until the authenticated admin
 * publisher is connected, this deliberate local selection is the only source.
 */
export const activeLaunchExperience: LaunchExperience = {
  id: 'germany-welcome-v1',
  imagePath: '/images/launch/germany-welcome-v1.png',
  durationMs: 1700,
};
