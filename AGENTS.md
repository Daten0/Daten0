# GitHub Dynamic Profile

## Project Goal

Build an automatically updated GitHub Profile README that reflects recent
software development activity.

The profile should dynamically display:

1. Recently used programming languages and technologies.
2. Coding time.
3. The project currently being worked on.

The existing profile README contains manually maintained content.
Dynamic sections must be updated without unnecessarily rewriting static
profile content.

---

# Technology Stack

Runtime:
- Bun

Language:
- TypeScript

External services:
- GitHub REST API
- WakaTime API

Automation:
- GitHub Actions

Testing:
- Bun Test

Do not introduce a backend web framework.

This application runs as a scheduled script and does not require an
always-running HTTP server.

---

# Architecture

Prefer a small modular structure:

src/
├── clients/
├── services/
├── renderers/
├── types/
├── config.ts
└── index.ts

## Clients

API clients are responsible only for communication with external services.

Examples:

- GitHubClient
- WakaTimeClient

Responsibilities include:

- HTTP requests
- authentication headers
- external response handling
- API-specific errors

Clients should not contain README rendering logic.

---

## Services

Services contain application logic.

Primary services:

- TechStackService
- CodingTimeService
- CurrentProjectService

Services may combine data from multiple clients.

Services should return application-level data structures instead of raw
external API responses.

---

## Renderers

Renderers transform application data into Markdown.

README rendering logic must remain separate from API communication.

The renderer should update only explicitly managed dynamic sections.

---

# README Dynamic Sections

Use HTML comment markers to define generated regions.

Expected markers:

<!-- CURRENT_PROJECT:START -->
<!-- CURRENT_PROJECT:END -->

<!-- TECH_STACK:START -->
<!-- TECH_STACK:END -->

<!-- CODING_TIME:START -->
<!-- CODING_TIME:END -->

Content outside these regions must not be modified automatically.

The generator must fail safely if required markers are missing rather than
silently overwriting unrelated README content.

---

# Activity Rules

## Coding Time

Coding-time data comes primarily from WakaTime.

Default reporting window:

7 days.

Do not infer coding time from Git commit count.

---

## Current Project

Prefer recent WakaTime project activity as the indication of what is
currently being worked on.

When a matching GitHub repository exists, enrich the project with GitHub
metadata.

Do not assume the most recently updated GitHub repository is necessarily
the current coding project.

---

## Tech Stack

Programming languages may come from:

- WakaTime activity
- GitHub repository language information

Frameworks and tools may be detected from known project manifests where
appropriate.

Examples:

package.json
Cargo.toml
pom.xml
build.gradle
go.mod
pyproject.toml
Dockerfile
compose.yaml

Do not describe detected technology usage as programming proficiency.

Prefer labels such as:

- Recently Used
- Recent Activity
- Technologies Used

rather than:

- Skills
- Expertise

unless manually specified.

---

# Security

Never commit:

- WAKATIME_API_KEY
- personal access tokens
- API secrets
- private credentials

Secrets used by GitHub Actions must come from GitHub Actions Secrets.

Do not print secrets to logs.

GitHub's built-in workflow token should be preferred where sufficient.

---

# Error Handling

External API failures must not corrupt README.md.

If one data source is unavailable:

1. report the failure clearly,
2. avoid replacing valid existing content with broken content,
3. preserve README integrity.

Never silently generate misleading statistics.

---

# Testing

Use:

bun test

Important behavior to test:

- marker replacement
- missing markers
- Markdown rendering
- malformed API responses
- empty activity data
- current-project selection
- technology aggregation

External APIs should not be required for every unit test.

---

# Definition of Done

A feature is complete when:

- TypeScript type checking succeeds
- relevant tests pass
- README static content remains intact
- generated sections are deterministic
- API errors are handled
- secrets are not exposed
- generated output is valid Markdown

---

# Noted 

Don't erased/change anything regardings of Links to my socials account
