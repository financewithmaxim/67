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
  if (!card.sourceRef || !card.sourceRef.anchor || !card.sourceRef.module) e.push('sourceRef.module and sourceRef.anchor are required');
  if (card.module && card.id && !card.id.startsWith(card.module + '.')) e.push(`id must be namespaced to its module (start with "${card.module}.")`);

  if (card.type === 'numeric' && (!card.answer || typeof card.answer.value !== 'number')) e.push('numeric card needs answer.value (a number in base units)');
  if (card.type === 'cloze' && !(Array.isArray(card.blanks) && card.blanks.length)) e.push('cloze card needs blanks[]');
  if (card.type === 'deriveStep' && !(Array.isArray(card.steps) && card.steps.length)) e.push('deriveStep card needs steps[]');
  if (card.type === 'discrimination') {
    if (!['reg', 'ors', 'mixed'].includes(card.verdict)) e.push('discrimination card needs verdict reg/ors/mixed');
    if (!(Array.isArray(card.rubric) && card.rubric.length)) e.push('discrimination card needs a tradeoff rubric[]');
  }
  if (card.type === 'viva') {
    if (!(Array.isArray(card.rubric) && card.rubric.length)) e.push('viva card needs a rubric[]');
    if (!card.modelAnswer) e.push('viva card needs a modelAnswer');
  }
  return e;
}

const MIX = { numeric: 2, deriveStep: 1, cloze: 2, discrimination: 2, viva: 2 };

export function lintDeck(cards) {
  const out = [];
  if (!Array.isArray(cards)) return [{ id: '<deck>', errors: ['deck must be an array of cards'] }];
  const seen = new Set();
  for (const c of cards) {
    const errs = validateCard(c);
    const id = (c && c.id) || '<invalid>';
    if (c && seen.has(c.id)) errs.push(`duplicate id "${c.id}"`);
    if (c) seen.add(c.id);
    if (errs.length) out.push({ id, errors: errs });
  }
  // deck-level mandated type mix
  const counts = {};
  for (const c of cards) if (c) counts[c.type] = (counts[c.type] || 0) + 1;
  const deckErrs = [];
  for (const [t, min] of Object.entries(MIX)) {
    if ((counts[t] || 0) < min) deckErrs.push(`deck needs >= ${min} ${t} cards (has ${counts[t] || 0})`);
  }
  if (deckErrs.length) out.push({ id: '<deck>', errors: deckErrs });
  return out;
}
