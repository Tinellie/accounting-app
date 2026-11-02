export type TaggedSelectionRow = { id: number; tags?: readonly { id: number }[] };
export type TagSelectionState = 'none' | 'some' | 'all';

export function getTagSelectionState(rows: readonly TaggedSelectionRow[], tagId: number): TagSelectionState {
  const count = rows.filter((row) => row.tags?.some((tag) => tag.id === tagId)).length;
  return count === 0 ? 'none' : count === rows.length ? 'all' : 'some';
}
