export function includesJapaneseExpression(original: string, expression: string) {
  const target = expression.normalize('NFKC').trim();
  return !!target && original.normalize('NFKC').includes(target);
}
