// Remove pastas de build de todos os pacotes (funciona em Windows, Linux e macOS).
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const pkg of ['shared', 'server', 'client']) {
  rmSync(join(root, pkg, 'dist'), { recursive: true, force: true });
  rmSync(join(root, pkg, 'tsconfig.tsbuildinfo'), { force: true });
}
console.log('Pastas dist removidas.');
