# Security checklist

This repo is public. Checklist for this and every personal project:

## GitHub (Settings → Code security, and Settings → Actions)
- [ ] Secret scanning **on**; push protection **on**
- [ ] Dependabot alerts **on**
- [ ] Actions → General → Workflow permissions: **Read repository contents** (the default token is read-only)
- [ ] Actions → General → Fork pull request workflows: **Require approval for all outside collaborators**
- [ ] Account: 2FA on, "Keep my email addresses private" on, "Block command line pushes that expose my email" on

## Workflows
- Every workflow sets `permissions:` explicitly. Only the job that commits projections gets `contents: write`.
- Third-party actions are pinned to full commit SHAs (the version is in a comment).
- No `pull_request_target`. No secrets are used by any workflow. No uploaded artifacts containing data.

## App
- No secrets or environment variables at all. If one is ever added, it goes in Vercel/GitHub encrypted settings only, never with a `NEXT_PUBLIC_` prefix for anything sensitive, and `.env.example` lists names only.
- API routes accept only a numeric team ID (`^\d{1,9}$`) and build FPL URLs from fixed templates.
- Security headers and CSP are set in `next.config.ts`. FPL team and manager names are user-entered text, so they're only ever rendered as escaped React text (no `dangerouslySetInnerHTML`).
- Nothing about visitors is stored server-side. The shortlist and plans stay in the visitor's browser.

## Local
- Enable the secret-scanning pre-commit hook once per clone: `git config core.hooksPath .githooks` (needs `brew install gitleaks`).

## If a secret leaks
Rotate it first, then clean the history. A leaked key is scraped within minutes of a push.
