import { readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const projectRequire = createRequire(join(process.cwd(), 'package.json'));
const iconDirectory = dirname(projectRequire.resolve('@mui/icons-material'));
const files = await readdir(iconDirectory);
const moduleNames = new Set(
  files
    .filter((file) => file.endsWith('.js'))
    .map((file) => file.slice(0, -3)),
);
const variantSuffixes = ['Outlined', 'Rounded', 'Sharp', 'TwoTone'];
const iconNames = [...moduleNames]
  .filter((name) => name !== 'index' && name !== 'createSvgIcon')
  .filter((name) => !variantSuffixes.some((suffix) => name.endsWith(suffix)))
  .sort((left, right) => left.localeCompare(right));

await writeFile(
  join(process.cwd(), 'src', 'lib', 'category-icon-names.json'),
  `${JSON.stringify(iconNames, null, 2)}\n`,
);