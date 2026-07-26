export type ReviewGrade = 'forgot' | 'hard' | 'remembered' | 'mastered';
export type LearningState = 'new' | 'learning' | 'review' | 'relearning' | 'mastered' | 'suspended' | 'archived';
export interface CardSchedule {
    state: LearningState;
    stabilityDays: number;
    difficulty: number;
    lapses: number;
    dueAt: Date;
}
/** Deterministic, conservative scheduling seam; replaceable without changing clients. */
export declare function scheduleReview(schedule: CardSchedule, grade: ReviewGrade, now: Date): CardSchedule;
