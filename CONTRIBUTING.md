# Contributing to AI Dev Platform

Thanks for your interest in contributing!

## Getting Started

1. Fork the repo
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/ai-dev-system.git`
3. Install dependencies: `npm install`
4. Start infrastructure: `docker compose up -d postgres redis`
5. Init database: `npm run db:generate && npm run db:push`
6. Create a branch: `git checkout -b feat/my-feature`

## Development

```bash
# Terminal 1 — API (auto-reload with nodemon recommended)
npm start

# Terminal 2 — Worker
npm run worker
```

Open http://localhost:3000

## Project Structure

See [docs/architecture.md](docs/architecture.md) for the full system design.

## Commit Convention

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation
- `refactor:` — code restructuring
- `test:` — adding tests
- `chore:` — build/config changes

## Pull Request Checklist

- [ ] Code follows existing patterns
- [ ] No breaking changes to API routes
- [ ] Backward compatible with existing database schema
- [ ] Tested locally (`npm start` + `npm run worker`)
- [ ] PR description explains what and why

## Code Style

- CommonJS modules (`require`/`module.exports`)
- 2-space indentation
- JSDoc comments for public APIs
- Single quotes for strings
- Trailing commas in objects/arrays

## Questions?

Open an issue or start a discussion.
