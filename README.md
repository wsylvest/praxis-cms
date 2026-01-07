# Praxis CMS

<p align="left">
  <a href="https://github.com/praxis-cms/praxis/actions"><img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/praxis-cms/praxis/main.yml?style=flat-square"></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/praxis-cms"><img alt="npm" src="https://img.shields.io/npm/v/praxis-cms?style=flat-square" /></a>
</p>

---

**Praxis CMS** is a modern, Next.js native content management system built for developers who need full control over their backend, frontend, and admin experiences.

## Features

- **Next.js Native** - Installs directly in your `/app` folder
- **PostgreSQL First** - Production-ready with Postgres out of the box
- **Full TypeScript** - Complete type safety with auto-generated types
- **React Server Components** - Modern admin UI built with RSC
- **REST & GraphQL APIs** - Automatic API generation
- **Authentication** - Built-in auth with customizable strategies
- **Access Control** - Granular, field-level permissions
- **File Storage** - Integrated media management with image processing
- **Live Preview** - See content changes in real-time
- **Open Source** - MIT licensed, deploy anywhere

## Quick Start (From Scratch with Postgres)

This guide walks you through setting up a complete Praxis CMS installation with:

- **Backend**: API and database layer with PostgreSQL
- **Admin**: Full-featured admin panel
- **Frontend**: Next.js frontend with React Server Components

### Prerequisites

- Node.js 20.9.0 or higher
- pnpm (recommended) or npm
- PostgreSQL 14 or higher (local or cloud-hosted)
- Docker (optional, for local PostgreSQL)

### Step 1: Create a New Project

```bash
# Create a new Next.js project
pnpm create next-app@latest my-praxis-app
cd my-praxis-app

# Or use the Praxis starter template
pnpm dlx create-praxis-app@latest my-praxis-app
cd my-praxis-app
```

### Step 2: Install Dependencies

```bash
# Core Praxis packages
pnpm add praxis @praxiscms/next @praxiscms/richtext-lexical sharp graphql

# PostgreSQL adapter
pnpm add @praxiscms/db-postgres
```

### Step 3: Set Up PostgreSQL

**Option A: Using Docker (Recommended for Development)**

Create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: praxis
      POSTGRES_PASSWORD: praxis_password
      POSTGRES_DB: praxis_db
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Start PostgreSQL:

```bash
docker-compose up -d
```

**Option B: Using a Cloud Provider**

Use your preferred PostgreSQL provider (Neon, Supabase, AWS RDS, etc.) and obtain your connection string.

### Step 4: Configure Environment Variables

Create a `.env` file in your project root:

```env
# Database
DATABASE_URL=postgresql://praxis:praxis_password@localhost:5432/praxis_db

# Praxis Secret (generate a secure random string)
PAYLOAD_SECRET=your-super-secret-key-min-32-characters

# Optional: Server URL for production
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

### Step 5: Create the Praxis Configuration

Create `src/payload.config.ts`:

```typescript
import { postgresAdapter } from '@praxiscms/db-postgres'
import { lexicalEditor } from '@praxiscms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'praxis'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: 'users',
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    {
      slug: 'users',
      auth: true,
      admin: {
        useAsTitle: 'email',
      },
      fields: [
        {
          name: 'name',
          type: 'text',
        },
      ],
    },
    {
      slug: 'media',
      upload: {
        staticDir: 'media',
        mimeTypes: ['image/*', 'application/pdf'],
      },
      fields: [
        {
          name: 'alt',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      slug: 'pages',
      admin: {
        useAsTitle: 'title',
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'slug',
          type: 'text',
          required: true,
          unique: true,
        },
        {
          name: 'content',
          type: 'richText',
        },
        {
          name: 'publishedAt',
          type: 'date',
        },
      ],
    },
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
})
```

### Step 6: Set Up the App Directory Structure

Create the following directory structure in `src/app/`:

```
src/app/
├── (frontend)/
│   ├── layout.tsx      # Frontend layout
│   ├── page.tsx        # Homepage
│   └── [slug]/
│       └── page.tsx    # Dynamic pages
├── (payload)/
│   ├── admin/
│   │   ├── [[...segments]]/
│   │   │   ├── page.tsx
│   │   │   └── not-found.tsx
│   │   └── importMap.js
│   ├── api/
│   │   ├── [...slug]/
│   │   │   └── route.ts
│   │   ├── graphql/
│   │   │   └── route.ts
│   │   └── graphql-playground/
│   │       └── route.ts
│   ├── layout.tsx
│   └── custom.scss
```

**Create `src/app/(payload)/layout.tsx`:**

```tsx
import type { ServerFunctionClient } from 'praxis'
import config from '@payload-config'
import { RootLayout } from '@praxiscms/next/layouts'
import React from 'react'
import { importMap } from './admin/importMap'
import './custom.scss'

type Args = {
  children: React.ReactNode
}

const Layout = ({ children }: Args) => (
  <RootLayout config={config} importMap={importMap}>
    {children}
  </RootLayout>
)

export default Layout
```

**Create `src/app/(payload)/admin/[[...segments]]/page.tsx`:**

```tsx
import type { AdminViewServerProps } from 'praxis'
import config from '@payload-config'
import { RootPage, generatePageMetadata } from '@praxiscms/next/views'
import { importMap } from '../importMap'

type Args = {
  params: Promise<{
    segments: string[]
  }>
  searchParams: Promise<{
    [key: string]: string | string[]
  }>
}

export const generateMetadata = ({ params, searchParams }: Args) =>
  generatePageMetadata({ config, params, searchParams })

const Page = ({ params, searchParams }: Args) =>
  RootPage({ config, importMap, params, searchParams })

export default Page
```

**Create `src/app/(payload)/api/[...slug]/route.ts`:**

```typescript
import config from '@payload-config'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@praxiscms/next/routes'

export const GET = REST_GET(config)
export const POST = REST_POST(config)
export const DELETE = REST_DELETE(config)
export const PATCH = REST_PATCH(config)
export const PUT = REST_PUT(config)
export const OPTIONS = REST_OPTIONS(config)
```

### Step 7: Update Next.js Configuration

Update `next.config.mjs`:

```javascript
import { withPayload } from '@praxiscms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    reactCompiler: false,
  },
}

export default withPayload(nextConfig)
```

### Step 8: Update TypeScript Configuration

Add the path alias to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@payload-config": ["./src/payload.config.ts"]
    }
  }
}
```

### Step 9: Start Development

```bash
# Start the development server
pnpm dev
```

Visit:

- **Admin Panel**: http://localhost:3000/admin
- **Frontend**: http://localhost:3000
- **REST API**: http://localhost:3000/api
- **GraphQL Playground**: http://localhost:3000/api/graphql-playground

On first visit to the admin panel, you'll be prompted to create your first admin user.

## Project Structure

```
my-praxis-app/
├── src/
│   ├── app/
│   │   ├── (frontend)/       # Your frontend routes
│   │   └── (payload)/        # Admin panel and API routes
│   ├── collections/          # Collection definitions (optional)
│   ├── payload.config.ts     # Praxis configuration
│   └── payload-types.ts      # Auto-generated TypeScript types
├── media/                    # Uploaded files
├── .env                      # Environment variables
├── docker-compose.yml        # PostgreSQL container
├── next.config.mjs          # Next.js configuration
├── package.json
└── tsconfig.json
```

## Database Commands

```bash
# Generate TypeScript types from your collections
pnpm praxis generate:types

# Create a new migration
pnpm praxis migrate:create

# Run pending migrations
pnpm praxis migrate

# Reset the database (development only)
pnpm praxis migrate:reset
```

## Production Deployment

### Environment Variables for Production

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
PAYLOAD_SECRET=your-production-secret-min-32-characters
NEXT_PUBLIC_SERVER_URL=https://your-domain.com
```

### Build and Deploy

```bash
# Build for production
pnpm build

# Start production server
pnpm start
```

## Documentation

- [Configuration Guide](./docs/configuration/overview.mdx)
- [Collections](./docs/configuration/collections.mdx)
- [Fields](./docs/fields/overview.mdx)
- [Authentication](./docs/authentication/overview.mdx)
- [Access Control](./docs/access-control/overview.mdx)
- [Hooks](./docs/hooks/overview.mdx)
- [REST API](./docs/rest-api/overview.mdx)
- [GraphQL API](./docs/graphql/overview.mdx)
- [Admin Panel Customization](./docs/admin/overview.mdx)

## Examples

The [examples directory](./examples) contains various implementation patterns:

- [Authentication](./examples/auth)
- [Custom Components](./examples/custom-components)
- [Live Preview](./examples/live-preview)
- [Multi-tenant](./examples/multi-tenant)
- [Form Builder](./examples/form-builder)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE.md](./LICENSE.md)
