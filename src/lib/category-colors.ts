export const categoryColorPalette = [
  '#E4572E',
  '#F3A712',
  '#2E86AB',
  '#4C956C',
  '#9B5DE5',
  '#D1495B',
  '#00A6A6',
  '#FF6B35',
  '#6C8E3F',
  '#C4458A',
] as const;

export function chooseCategoryColor(existingColors: (string | null)[]): string {
  const usedColors = new Set(existingColors.filter((color): color is string => color !== null).map(normalizeColor));
  const unusedColor = categoryColorPalette.find((color) => !usedColors.has(color));
  if (unusedColor) return unusedColor;

  const counts = new Map<string, number>();
  for (const color of existingColors) {
    if (color !== null) {
      const normalized = normalizeColor(color);
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return categoryColorPalette.reduce((leastUsed, color) => (
    (counts.get(color) ?? 0) < (counts.get(leastUsed) ?? 0) ? color : leastUsed
  ));
}

export function fallbackCategoryColor(categoryId: number): string {
  const index = (categoryId - 1) % categoryColorPalette.length;
  return categoryColorPalette[index < 0 ? index + categoryColorPalette.length : index];
}

function normalizeColor(color: string): string {
  return color.toUpperCase();
}