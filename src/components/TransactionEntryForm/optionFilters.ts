type CodeSearchOption = {
  code: string | null;
  name: string;
};

export function findExactCode<T extends CodeSearchOption>(options: T[], query: string): T | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return null;

  return options.find((option) => option.code?.toLowerCase() === normalizedQuery) ?? null;
}

export function filterCodeFirst<T extends CodeSearchOption>(options: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return options;

  const codeMatches = options.filter((option) => option.code?.toLowerCase().includes(normalizedQuery));
  if (codeMatches.length > 0) return codeMatches;

  return options.filter((option) => option.name.toLowerCase().includes(normalizedQuery));
}