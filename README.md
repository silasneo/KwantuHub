# KwantuHub

KwantuHub is a TypeScript-first full-stack web application with separate client and server codebases, plus shared modules for cross-cutting types/utilities.

## Tech Stack

- **Language:** TypeScript (primary), HTML
- **Frontend:** Vite-based client (`/client`)
- **Backend:** Node.js TypeScript server (`/server`)
- **Shared code:** Common modules in `/shared`
- **Database tooling:** Drizzle ORM (`drizzle.config.ts`, `/drizzle`)
- **Package manager:** pnpm

## Project Structure

```txt
client/       Frontend application
server/       Backend API/server logic
shared/       Shared types/utilities used by client and server
drizzle/      Database migrations/schema artifacts
standalone/   Standalone scripts or isolated modules
patches/      Local dependency patches
```

## Getting Started

### Prerequisites

- Node.js (LTS recommended)
- pnpm

### Install dependencies

```bash
pnpm install
```

### Run in development

```bash
pnpm dev
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

> If these scripts differ, check `package.json` and adjust accordingly.

## Notes

- Drizzle configuration is defined in `drizzle.config.ts`.
- Additional planning docs exist in `ideas.md` and `todo.md`.
