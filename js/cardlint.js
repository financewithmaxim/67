// Pure, zero-dependency card validator mirroring card.schema.json plus deck-level rules.
const ID_RE = /^m[0-9]{2}\.[a-z]+\.[a-z0-9-]+$/;
const TYPES = ['numeric', 'cloze', 'deriveStep', 'discrimination', 'viva', 'freeRecall'];
const SPINES = ['reg', 'ors', 'boundary'];

export function validateCard(card) {
  const e = [];
  if (!card || typeof card !== 'object') return ['card is not an object'];
  if (!ID_RE.test(card.id || '')) e.push(`id "${card.id}" must match module.type.slug (e.g. m05.num.ul)`);
  if (!/^m[0-9]{2}$/.test(card.module || '')) e.push('module must be like m05');
  if (!TYPES.includes(card.type)) e.push(`type "${card.type}" is not one of ${TYPES.join('/')}`);
  if (!card.front) e.push('front is required');
  if (!card.tags || !SPINES.includes(card.tags.spine)) e.push(`tags.spine must be one of ${SPINES.join('/')}`);
  if (!card.version) e.push('version is required');
  if (!card.sourceRef || !card.sourceRef.anchor) e.push('sourceRef.anchor is required');

  if (card.type === 'numeric' && (!card.answer || typeof card.answer.value !== 'number')) e.push('numeric card needs answer.value (a number in base units)');
  if (card.type === 'cloze' && !(Array.isArray(card.blanks) && card.blanks.length)) e.push('cloze card needs blanks[]');
  if (card.type === 'deriveStep' && !(Array.isArray(card.steps) && card.steps.length)) e.push('deriveStep card needs steps[]');
  if (card.type === 'discrimination') {
    if (!['reg', 'ors', 'mixed'].includes(card.verdict)) e.push('discrimination card needs verdict reg/ors/mixed');
    if (!(Array.isArray(card.rubric) && card.rubric.length)) e.push('discrimination card needs a tradeoff rubric[]');
  }
  if (card.type === 'viva' && !(Array.isArray(card.rubric) && card.rubric.length && card.modelAnswer)) e.push('viva card needs rubric[] and modelAnswer');
  return e;
}

const MIX = { numeric: 2, deriveStep: 1, cloze: 2, discrimination: 2, viva: 2 };

export function lintDeck(cards) {
  const out = [];
  const seen = new Set();
  for (const c of cards) {
    const errs = validateCard(c);
    if (seen.has(c.id)) errs.push(`duplicate id "${c.id}"`);
    seen.add(c.id);
    if (errs.length) out.push({ id: c.id, errors: errs });
  }
  // deck-level mandated type mix
  const counts = {};
  for (const c of cards) counts[c.type] = (counts[c.type] || 0) + 1;
  for (const [t, min] of Object.entries(MIX)) {
    if ((counts[t] || 0) < min) out.push({ id: `<deck>`, errors: [`deck needs >= ${min} ${t} cards (has ${counts[t] || 0})`] });
  }
  return out;
}
