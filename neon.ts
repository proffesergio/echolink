import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Enable only after confirming the project region and paid gateway access.
  // Local n8n/AI do not require these optional cloud companion services.
  ...(process.env.ECHOLINK_ENABLE_CLOUD === "true" ? {
    aiGateway: true,
    buckets: { "echolink-archives": { access: "private" as const } },
    functions: {
      echolinkapi: {
        name: "EchoLink telemetry API",
        source: "src/cloud.mjs",
        env: {
          WORKER_API_KEY: process.env.WORKER_API_KEY!,
          STORAGE_BUCKET: "echolink-archives",
        },
      },
    },
  } : {}),
  auth: false,
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
