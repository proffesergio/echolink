# Adapter inventory

Implemented directly: Airtable REST, Facebook Graph publishing and post
engagement counts, OpenAI-compatible local inference, optional Neon AI Gateway,
local embeddings stored in PostgreSQL, and an optional Neon storage/Function
companion. The primary workflow uses deterministic API calls; an AI model does
not choose publishing tools.

## Optional MCP integrations — not yet installed or wired

These are extension points, not working dependencies of the current workflows.
Do not enter an invented endpoint or tool schema. Run `tools/list` on the actual
server version before wiring tools. Keep secrets in n8n credentials. n8n's MCP
Client Tool is intended for an AI tool connection; deterministic queue publishing
requires a separately validated MCP adapter or the direct API path used here.

| Provider | Verified configuration / next step |
| --- | --- |
| Facebook Pages MCP | `npx -y @node2flow/facebook-pages-mcp --http`; Streamable HTTP at `http://localhost:3000/mcp`; server env `FACEBOOK_PAGE_ACCESS_TOKEN`, optional `FACEBOOK_PAGE_ID`. From Docker use `host.docker.internal`. Isolate one token-bound server per page; verify installed version and tool arguments before use. |
| MAD Qdrant MCP | Package documents `mcp-server-qdrant --transport streamable-http`, env `QDRANT_URL`, `COLLECTION_NAME`; hosted endpoint `https://qdrant-mcp.madpanda3d.com/mcp` with Streamable HTTP and `X-Qdrant-Url`, `X-Collection-Name`, `X-Qdrant-Api-Key`. A hosted server cannot reach a local Qdrant URL. Local bind port and installed tool schemas still need validation. |
| Postiz | Retained for future self-hosted scheduling/fan-out. No server endpoint, transport or credentials have been configured. Verify the deployed Postiz version's official MCP documentation before enabling. |
| Bright Data / Decodo | Retained as paid extraction fallbacks. No account keys or scraping jobs are configured; validate provider endpoint and result schema when credentials are available. |

Sources inspected during setup:

- https://github.com/node2flow-th/facebook-pages-mcp-community
- https://pypi.org/project/mad-mcp-qdrant/1.3.0/
- https://neon.com/docs/reference/neon-ts.md
- https://neon.com/docs/connect/choose-connection.md
- https://neon.com/docs/compute/functions/overview.md
- https://neon.com/docs/ai-gateway/get-started.md

The initial analytics job records counts in PostgreSQL. Page-level insights,
Airtable analytics mirroring and automated performance tuning remain future work;
the system never changes posting limits or editorial policy from engagement data.

The native `07-ai-adapter.json` is an optional n8n HTTP Request example and is not
called by the six main workflows. Its expected input is
`{page:{endpoint,model,temperature,language},article:{title,body}}`. Only invoke it
with trusted configuration. Add an n8n Header Auth credential if the chosen model
server requires a bearer token. Per-page token aliases and endpoint allowlists
are implemented in the worker used by the main workflows.
