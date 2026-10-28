function normalize(text: string) { return text.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' '); }
export function includesEnglishExpression(original: string, expression: string) {
  const target = normalize(expression);
  if (!target) return false;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{M}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{M}\\p{N}_])`, 'u').test(normalize(original));
}
