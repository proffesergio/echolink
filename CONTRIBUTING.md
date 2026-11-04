# Contributing to EchoLink

Thanks for helping make a dependable newsroom that people can run on their own machines.

## Start here

Check [open issues](https://github.com/proffesergio/echolink/issues) or open a focused proposal. Useful areas include Bangla model quality, RSS reliability, accessible editorial controls, publishing diagnostics, integration adapters and Windows setup documentation. A star or a reproducible bug report also helps others discover and improve the project.

## Development

1. Fork and clone the repository. Install Node.js 22+ (CI uses Node.js 24).
2. Run `npm ci`, `npm test` and `npm run build`. Unit tests do not need live Facebook, Airtable, Google or Neon credentials.
3. For the full worker, create a private `.env.local` from `.env.example`, configure your own services, keep `DRY_RUN=true`, then follow [Windows setup](docs/WINDOWS_GUIDE.md).
4. Use a feature branch. Keep changes focused and update the relevant guide when behavior changes.

## Before opening a pull request

- Explain the concrete problem, resulting behavior and relevant validation. Include a screenshot for a visible UI change, using synthetic data.
- Run `npm test` and `npm run build`. Add meaningful tests for delivery, permissions, state transitions or concurrency changes.
- Test additive SQL migrations against a disposable Neon branch first. Never change a migration that has already been applied. Use `node scripts/validate-migration.mjs` only with your own configured Neon project; it creates and removes a test branch.
- Keep live publishing, ambiguous-write holds, human approval, quiet hours, daily caps and token isolation intact. Do not run tests against another person's real Page or include a live publishing probe in CI.
- Never commit `.env.local`, tokens, service-account keys, database URLs, n8n credential exports or screenshots showing secrets. Read [security guidance](SECURITY.md).

## Integration ideas

Propose an adapter boundary, required credentials, configuration UI, failure behavior and test strategy. Postiz, Qdrant and scraper/MCP integrations remain roadmap items until they are wired and tested. Label optional paid dependencies clearly and preserve a local-inference path.

## Model and feed reports

For model issues, include model ID, runner, language, approximate hardware, a short source-supported example and the specific factual error. Do not include private articles or copied full copyrighted reports. For feeds, include the public feed URL, expected publisher and a sanitized error.
