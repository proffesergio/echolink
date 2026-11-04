# Security and credential handling

Do not paste access tokens, private keys or connection strings into public issues, pull requests or screenshots. Use `.env.local` or the authenticated dashboard; secret values must stay on the worker and out of browser responses and workflow exports. Rotate a credential at its provider immediately if exposed.

Keep the worker bound to loopback. The public dashboard reaches a restricted, separately authenticated bridge; do not expose the worker job routes, n8n editor, Ollama or the database directly to the internet.

For a suspected vulnerability, use the repository's **Security → Report a vulnerability** option if available. If private reporting is unavailable, open a minimal issue requesting a private contact without posting exploit details or credentials. This community project does not promise a fixed response time.

Publishing with an unknown remote outcome must remain held for reconciliation. Security and reliability changes must preserve this protection and explicit human approval where configured.
