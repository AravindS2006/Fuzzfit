import { spawnSync } from 'node:child_process';
if (process.env.DATABASE_PROVIDER !== 'postgresql') {
  console.error(
    'This check requires explicit DATABASE_PROVIDER=postgresql and the production connection values.',
  );
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  [
    'node_modules/prisma/build/index.js',
    'db',
    'execute',
    '--stdin',
    '--schema=prisma/postgres/schema.prisma',
  ],
  {
    input:
      'SELECT 1; SELECT "id" FROM "User" LIMIT 1; SELECT "id" FROM "Session" LIMIT 1; SELECT "id" FROM "ClassSession" LIMIT 1; SELECT "key" FROM "RateLimit" LIMIT 1;',
    encoding: 'utf8',
    env: process.env,
  },
);
if (result.status !== 0) {
  // Prisma diagnostics can include connection details. Keep this operator check secret-safe.
  console.error(
    'PostgreSQL read check failed. Check connectivity, migration status, and credentials in the secure release environment.',
  );
  process.exit(result.status ?? 1);
}
console.log(
  'PostgreSQL connectivity and reads from auth, class, and rate-limit tables passed. No application records were created.',
);
