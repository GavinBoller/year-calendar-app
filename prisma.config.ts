import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: './prisma/schema.prisma',
  accelerateUrl: process.env.DATABASE_URL,
})
