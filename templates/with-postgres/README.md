# Praxis CMS with PostgreSQL Template

A production-ready Praxis CMS template with PostgreSQL database configuration.

## Features

- PostgreSQL database adapter with Drizzle ORM
- Local disk storage for uploads
- Pre-configured Users and Media collections
- TypeScript with auto-generated types
- Vitest for integration tests
- Playwright for E2E tests

## Quick Start

### Prerequisites

- Node.js 20.9.0+
- pnpm 9+
- PostgreSQL 14+ (or Docker)

### Setup

1. **Clone or create from template:**

   ```bash
   pnpm dlx create-praxis-app@latest my-app -t with-postgres
   cd my-app
   ```

2. **Start PostgreSQL with Docker:**

   ```bash
   docker-compose up -d
   ```

3. **Configure environment:**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your database connection:

   ```env
   DATABASE_URL=postgresql://praxis:praxis_password@localhost:5432/praxis_db
   PAYLOAD_SECRET=your-secret-key-min-32-chars
   ```

4. **Install dependencies:**

   ```bash
   pnpm install
   ```

5. **Start development server:**

   ```bash
   pnpm dev
   ```

6. **Visit the admin panel:**

   Open http://localhost:3000/admin and create your first user.

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── (frontend)/     # Your frontend routes
│   │   └── (payload)/      # Admin panel and API routes
│   ├── collections/        # Collection definitions
│   │   ├── Media.ts
│   │   └── Users.ts
│   ├── migrations/         # Database migrations
│   ├── payload.config.ts   # Praxis configuration
│   └── payload-types.ts    # Auto-generated types
├── tests/                  # Test files
├── docker-compose.yml      # PostgreSQL container
└── package.json
```

## Scripts

| Command                       | Description               |
| ----------------------------- | ------------------------- |
| `pnpm dev`                    | Start development server  |
| `pnpm build`                  | Build for production      |
| `pnpm start`                  | Start production server   |
| `pnpm generate:types`         | Generate TypeScript types |
| `pnpm payload migrate`        | Run database migrations   |
| `pnpm payload migrate:create` | Create a new migration    |
| `pnpm test`                   | Run all tests             |
| `pnpm test:int`               | Run integration tests     |
| `pnpm test:e2e`               | Run E2E tests             |

## Database

### Running Migrations

```bash
# Create a new migration
pnpm payload migrate:create

# Run pending migrations
pnpm payload migrate

# Reset database (development only)
pnpm payload migrate:reset
```

### Docker Commands

```bash
# Start PostgreSQL
docker-compose up -d

# Stop PostgreSQL
docker-compose down

# View logs
docker-compose logs -f postgres
```

## Customization

### Adding Collections

Create a new file in `src/collections/`:

```typescript
import type { CollectionConfig } from 'praxis'

export const Posts: CollectionConfig = {
  slug: 'posts',
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
      name: 'content',
      type: 'richText',
    },
  ],
}
```

Then add it to `payload.config.ts`:

```typescript
import { Posts } from './collections/Posts'

export default buildConfig({
  collections: [Users, Media, Posts],
  // ...
})
```

## Deployment

### Production Environment Variables

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
PAYLOAD_SECRET=your-production-secret-min-32-chars
NEXT_PUBLIC_SERVER_URL=https://your-domain.com
```

### Build and Deploy

```bash
# Run migrations
pnpm payload migrate

# Build
pnpm build

# Start
pnpm start
```

## Attributes

- **Database**: PostgreSQL
- **Storage Adapter**: localDisk
- **Rich Text Editor**: Lexical
