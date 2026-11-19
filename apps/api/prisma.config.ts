/**
 * Prisma CLI configuration (Prisma 7): where the schema and migrations live, and which database
 * the CLI uses. Prisma 7 no longer reads `.env` itself; devkit, the npm scripts and the
 * production container pass DATABASE_URL. Without one, a placeholder lets `prisma generate` and
 * `prisma validate` run (the image build and `npm run validate` have no database); a command
 * that needs a database fails against it.
 */
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://validate-only@localhost:5432/validate-only',
  },
})
