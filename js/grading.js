import { gradeNumeric } from './normalize.js';

export function normEq(a, b) {
  const norm = x => String(x ?? '').trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ');
  return norm(a) === norm(b);
}

export function gradeAnswer(card, response = {}) {
  response = response || {};
  switch (card.type) {
    case 'numeric': {
      const ok = gradeNumeric(response.text ?? '', card.answer || {});
      return { objective: ok, suggestedGrade: ok ? 'good' : 'again' };
    }
    case 'cloze': {
      const ok = (card.blanks || []).every(b => (b.accept || []).some(a => normEq(a, (response.blanks || {})[b.id])));
      return { objective: ok, suggestedGrade: ok ? 'good' : 'again' };
    }
    case 'deriveStep': {
      const ok = (card.steps || []).every((st, i) => normEq(st.expected, (response.steps || [])[i]));
      return { objective: ok, suggestedGrade: ok ? 'good' : 'again' };
    }
    case 'discrimination': {
      const verdictOk = response.verdict === card.verdict;
      const ticks = response.ticks || [];
      const allTradeoff = (card.rubric || []).every((_, i) => ticks.includes(i));
      const ok = verdictOk && allTradeoff;
      return { objective: ok, suggestedGrade: ok ? 'good' : 'again', verdictOk };
    }
    case 'viva': {
      const ticks = response.ticks || [];
      const rubric = card.rubric || [];
      const missedRequired = rubric.some((r, i) => r.required && !ticks.includes(i));
      const hitAnti = (response.antiTicks || []).length > 0;
      let suggestedGrade;
      if (missedRequired || hitAnti) suggestedGrade = 'again';
      else if (rubric.every((_, i) => ticks.includes(i))) suggestedGrade = 'good';
      else suggestedGrade = 'hard';
      return { objective: null, suggestedGrade, missedRequired, hitAnti };
    }
    default:
      return { objective: null, suggestedGrade: 'good' };
  }
}
