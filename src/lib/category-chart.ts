type GroupedCategoryAmount = {
  groupId: number | null;
  amount: number;
};

export function groupCategoryChartEntries<T extends GroupedCategoryAmount>(entries: T[]) {
  const groups = new Map<number | null, { total: number; entries: T[] }>();
  for (const entry of entries) {
    const group = groups.get(entry.groupId);
    if (group) {
      group.total += entry.amount;
      group.entries.push(entry);
    } else {
      groups.set(entry.groupId, { total: entry.amount, entries: [entry] });
    }
  }

  return [...groups.values()]
    .sort((left, right) => right.total - left.total)
    .map((group) => ({
      ...group,
      entries: group.entries.sort((left, right) => right.amount - left.amount),
    }));
}

export function sortCategoryChartEntries<T extends GroupedCategoryAmount>(entries: T[]): T[] {
  return groupCategoryChartEntries(entries).flatMap((group) => group.entries);
}
