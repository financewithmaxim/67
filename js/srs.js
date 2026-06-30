// Pure SM-2-lite scheduler. No I/O, no Date.now, no Math.random — time is passed in.
// Returns ONLY scheduling fields; the store stamps rev/updatedAt/deviceId.
export const DAY_MS = 86_400_000;
export const LEARN_STEP_MS = 600_000; // 10 minutes
export const EASE_START = 2.5;
export const EASE_FLOOR = 1.30;
export const CAP_DAYS = 180;

const GRAD_GOOD_DAYS = 1;
const GRAD_EASY_DAYS = 6;
const clampEase = e => Math.max(EASE_FLOOR, e);
const capDays = d => Math.min(CAP_DAYS, d);
const LEECH_LAPSES = 6;

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

  if (sched.state === 'suspended') return out; // manual unsuspend is out of scope

  if (sched.state === 'relearn') {
    if (g === 'good' || g === 'easy') {
      const interval = capDays(Math.max(1, sched.pending || 1));
      return { ...out, state: 'review', interval, pending: 0, reps: sched.reps + 1, due: now + interval * DAY_MS };
    }
    return { ...out, state: 'relearn', due: now + LEARN_STEP_MS }; // again / hard
  }

  // state === 'review'
  if (g === 'again') {
    const lapses = sched.lapses + 1;
    const ease = clampEase(sched.ease - 0.20);
    if (lapses >= LEECH_LAPSES) return { ...out, state: 'suspended', ease, lapses };
    return { ...out, state: 'relearn', ease, lapses, pending: capDays(Math.max(1, sched.interval * 0.5)), due: now + LEARN_STEP_MS };
  }
  if (g === 'hard') {
    const interval = capDays(sched.interval * 1.2);
    return { ...out, ease: clampEase(sched.ease - 0.15), interval, reps: sched.reps + 1, due: now + interval * DAY_MS };
  }
  if (g === 'easy') {
    const interval = capDays(sched.interval * sched.ease * 1.3);
    return { ...out, ease: clampEase(sched.ease + 0.15), interval, reps: sched.reps + 1, due: now + interval * DAY_MS };
  }
  // good: credit overdue time, then grow by ease
  const overdueDays = Math.max(0, (now - sched.due) / DAY_MS);
  const interval = capDays((sched.interval + overdueDays) * sched.ease);
  return { ...out, interval, reps: sched.reps + 1, due: now + interval * DAY_MS };
}
