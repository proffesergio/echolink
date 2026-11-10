# Start here

Read `docs/AGENT_HANDOFF.md` first. Use `docs/PROJECT_MEMORY.json` to find the
relevant files and decisions; do not reread historical setup logs by default.
Update both after changes to runtime, models, delivery or deployment status.

- The production application is `platform/`: React/Vite plus a persistent Node
  worker. Root `npm start` starts a historical service; it is not the current worker.
- Use `npm run platform:restart` for a graceful worker/bridge restart. Preserve
  active publishing and ambiguous delivery receipts; never blindly republish.
- Load credentials programmatically from the appropriate env file. Never print
  `.env*`, decrypted secrets, auth cookies, connection URIs or complete process
  environments. This repository is public. `.codex/` contains private artifacts.
- Keep factual, crisis, originality and tenant-isolation checks. A model review
  is not external fact verification or a promise of Meta monetization.
- CPU/RAM settings affect capacity and speed, not model knowledge. Keep one local
  inference call/model at a time. Do not disable the emergency memory guard.
- Run checks appropriate to the change. Real model QA must not submit synthetic
  news, website writes or social posts. Separate measured results from intentions.
