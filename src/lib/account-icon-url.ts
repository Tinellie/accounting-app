export function accountIconSelection(icon: string | null): string {
  if (!icon) return '';
  if (icon.startsWith('preset:') || icon.startsWith('upload:')) return icon;
  return `upload:${icon}`;
}

export function accountIconUrl(icon: string | null): string | undefined {
  const selection = accountIconSelection(icon);
  if (!selection) return undefined;

  const separator = selection.indexOf(':');
  const source = selection.slice(0, separator);
  const filename = selection.slice(separator + 1);
  if ((source !== 'preset' && source !== 'upload') || !filename) return undefined;

  return `/account-icons/${encodeURIComponent(filename)}?source=${source}`;
}