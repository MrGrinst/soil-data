import { fetchEcowittReading } from "./ecowitt.js";

export function createPoller(config, database) {
  let timer = null;
  let running = false;

  const status = {
    running: false,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null
  };

  async function pollOnce() {
    if (running) {
      return;
    }

    running = true;
    status.lastAttemptAt = new Date().toISOString();

    try {
      const reading = await fetchEcowittReading(config);
      database.insertReading(reading);
      status.lastSuccessAt = new Date().toISOString();
      status.lastError = null;
    } catch (error) {
      status.lastError = error instanceof Error ? error.message : String(error);
      console.error(`[poller] ${status.lastError}`);
    } finally {
      running = false;
    }
  }

  return {
    status,
    async start() {
      if (timer) {
        return;
      }

      status.running = true;
      await pollOnce();
      timer = setInterval(() => {
        void pollOnce();
      }, config.pollIntervalMs);
    },
    stop() {
      status.running = false;

      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  };
}
