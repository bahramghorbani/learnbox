import productExperienceJson from '../../../config/product-experience.json';

export const productExperience = productExperienceJson;
export const startTierExperience = productExperience.tiers.learnbox_start;
export const defaultSuggestedNewWords = startTierExperience.recommendedNewWordsPerDay.default;
export const personalWordLimit = startTierExperience.personalWordLimit;
