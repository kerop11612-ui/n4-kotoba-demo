import { startAiBridgeRuntime } from "./runtime.mjs";

let runtime;
try {
  runtime = await startAiBridgeRuntime();
  process.stdout.write(`N4 AI bridge ready at ${runtime.url}\n`);
} catch (error) {
  const code = error?.code === "ENOENT" ? "codex_not_installed" : "ai_bridge_start_failed";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}

if (runtime) {
  const shutdown = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}
