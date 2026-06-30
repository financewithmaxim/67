// Pure SM-2-lite scheduler. No I/O, no Date.now, no Math.random — time is passed in.
// Returns ONLY scheduling fields; the store stamps rev/updatedAt/deviceId.
export const DAY_MS = 86_400_000;
export const LEARN_STEP_MS = 600_000; // 10 minutes
export const EASE_START = 2.5;
export const EASE_FLOOR = 1.30;
export const CAP_DAYS = 180;

const GRAD_GOOD_DAYS = 1;
const GRAD_EASY_DAYS = 6;

export function newSched() {
  return { state: 'new', interval: 0, ease: EASE_START, reps: 0, lapses: 0, lastGrade: null, pending: 0 };
}

function graduate(sched, intervalDays, now) {
  return { ...sched, state: 'review', interval: intervalDays, reps: sched.reps + 1, due: now + intervalDays * DAY_MS };
}

export function grade(sched, g, now) {
  const out = { ...sched, lastGrade: g };

  if (sched.state === 'new' || sched.state === 'learning') {
    if (g === 'good') return graduate(out, GRAD_GOOD_DAYS, now);
    if (g === 'easy') return graduate(out, GRAD_EASY_DAYS, now);
    // again / hard → stay in learning, re-show after one step
    return { ...out, state: 'learning', due: now + LEARN_STEP_MS };
  }

  // review / relearn / suspended transitions are added in Task 2.
  return out;
}
