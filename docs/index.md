# Documentation

Everything you need to run, deploy, and understand this project.

## Where to start

| If you want to... | Read this |
|--------------------|-----------|
| Run the script on your local machine | [RUNBOOK.md](RUNBOOK.md) |
| Set up automatic updates via GitHub Actions | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Understand how the code is organized | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Fix an error or unexpected behavior | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| Look up environment variable details | [SECRETS.md](SECRETS.md) |

## Quick reference

**Local run:**
```bash
bun install
cp .env.example .env  # then edit
bun start
```

**GitHub Actions:** Push to `main`, set `WAKATIME_API_KEY` in repository secrets, done.

**Tests:**
```bash
bun test
bun typecheck
```

## File index

- [RUNBOOK.md](RUNBOOK.md) — step-by-step local run guide
- [DEPLOYMENT.md](DEPLOYMENT.md) — step-by-step GitHub Actions setup
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design and module structure
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — common issues and fixes
- [SECRETS.md](SECRETS.md) — environment variable reference
