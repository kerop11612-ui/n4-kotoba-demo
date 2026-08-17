import { AppServerClient, createAppServerModel } from "./app-server-client.mjs";
import { createChatAdapter } from "./chat-adapter.mjs";
import { createLearningAnalysisAdapter } from "./learning-analysis-adapter.mjs";
import { startAiBridgeServer } from "./server.mjs";

export async function startAiBridgeRuntime({
  client = new AppServerClient(),
  host = "127.0.0.1",
  port = 3765,
} = {}) {
  const model = createAppServerModel(client);
  const cache = createMemoryAnalysisCache();
  const adapter = createLearningAnalysisAdapter({ model, cache });
  const chatAdapter = createChatAdapter({ model });
  const bridge = await startAiBridgeServer({ adapter, chatAdapter, host, port });
  let closed = false;
  return {
    ...bridge,
    async close() {
      if (closed) return;
      closed = true;
      await bridge.close();
      await model.close();
    },
  };
}

function createMemoryAnalysisCache() {
  const values = new Map();
  return {
    async get(key) { return values.get(key) ?? null; },
    async put(value) { values.set(value.cacheKey, structuredClone(value)); },
  };
}
