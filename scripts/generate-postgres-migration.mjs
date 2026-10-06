import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const schema = await readFile('prisma/schema.prisma', 'utf8');
const target = 'prisma/postgres/schema.prisma';
await mkdir('prisma/postgres/migrations/20261006000000_init', { recursive: true });
await writeFile(
  target,
  schema
    .replace('provider = "sqlite"', 'provider = "postgresql"')
    .replace(
      'url = env("DATABASE_URL")',
      'url = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")',
    ),
);
const result = spawnSync(
  process.execPath,
  [
    'node_modules/prisma/build/index.js',
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema-datamodel',
    target,
    '--script',
  ],
  {
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://offline:offline@localhost:5432/offline',
      DIRECT_URL: 'postgresql://offline:offline@localhost:5432/offline',
    },
  },
);
if (result.status !== 0) throw new Error(result.stderr);
await writeFile('prisma/postgres/migrations/20261006000000_init/migration.sql', result.stdout);
await writeFile('prisma/postgres/migrations/migration_lock.toml', 'provider = "postgresql"\n');
console.log('PostgreSQL initial migration generated without a database connection.');
