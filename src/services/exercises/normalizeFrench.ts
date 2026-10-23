/** Owns the pure French comparison key; no exercise contracts, grading or persistence. */
/**
 * French string comparison key. Every punctuation mark becomes an apostrophe
 * (not removed), so "bonjour." and "bonjour" differ on both sides alike; with
 * `strictAccents` off, diacritics are stripped as well.
 */
export const normalizeFrench = (str: string, strictAccents: boolean) => {
  let base = str
    .trim()
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?’]/g, "'")
    .replace(/\s+/g, ' ');
  if (!strictAccents) {
    base = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return base;
};
