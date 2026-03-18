---
name: codex
description: Skill definitions for Codex-based agents working on this project
---

# Codex Agent Skill

## Project Context

This is an AI Agent Wallet Console (ACW) monorepo built on Base (EVM).

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **apps/web**: Next.js 14, App Router, TypeScript, Tailwind
- **apps/mobile**: Expo (blank TS template) — placeholder
- **packages/core** (`@warden/core`): Pure TypeScript — types, store, lib, config
- **packages/ui** (`@warden/ui`): Shared React components (no Next.js primitives)

## Conventions

- All shared logic lives in `packages/core`
- All shared UI components live in `packages/ui`
- Internal docs go in `docs/internal/` (gitignored from prod builds)
- Environment variables are defined in `.env.example`
