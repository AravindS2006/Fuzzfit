import { access, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
try {
  await access('.env');
  console.log('Existing environment preserved.');
} catch {
  await writeFile(
    '.env',
    `DATABASE_URL="file:./dev.db"\nDATABASE_PROVIDER="sqlite"\nBETTER_AUTH_URL="http://localhost:3000"\nBETTER_AUTH_SECRET="${randomBytes(48).toString('hex')}"\n`,
  );
  console.log('Local environment initialized with a random secret.');
}
