// Generate src/version.ts from package.json so the runtime version
// (read for `--version`, the User-Agent header, and `doctor`) can never
// drift from the package metadata. Runs as the `prebuild` npm step.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));

const out = `// Auto-generated from package.json by scripts/sync-version.mjs.
// Do not edit by hand — run \`npm run build\` (or \`npm run sync-version\`) to refresh.
export const VERSION = '${pkg.version}';
export const USER_AGENT = \`ccctl/\${VERSION}\`;
`;

writeFileSync(join(repoRoot, 'src', 'version.ts'), out);
console.log(`synced src/version.ts → ${pkg.version}`);
