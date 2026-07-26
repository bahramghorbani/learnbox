const factors = {
    forgot: 0.3,
    hard: 0.8,
    remembered: 1.8,
    mastered: 3,
};
/** Deterministic, conservative scheduling seam; replaceable without changing clients. */
export function scheduleReview(schedule, grade, now) {
    const isLapse = grade === 'forgot';
    const stabilityDays = Math.max(1 / 24, schedule.stabilityDays * factors[grade]);
    const state = isLapse
        ? 'relearning'
        : grade === 'mastered'
            ? 'mastered'
            : 'review';
    return {
        ...schedule,
        state,
        stabilityDays,
        difficulty: Math.min(10, Math.max(1, schedule.difficulty + (isLapse ? 0.5 : -0.1))),
        lapses: schedule.lapses + Number(isLapse),
        dueAt: new Date(now.getTime() + stabilityDays * 86_400_000),
    };
}
