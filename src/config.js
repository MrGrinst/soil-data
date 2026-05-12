import path from "node:path";

const DEFAULT_SENSOR_PATH = "soil_ch1.soilmoisture";
const DEFAULT_POLL_INTERVAL_MS = 120_000;
const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_DATABASE_PATH = "./data/soil-data.db";

function readRequired(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readPositiveNumber(name, fallback) {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }

  return parsed;
}

export function loadConfig() {
  return {
    ecowittApplicationKey: readRequired("ECOWITT_APPLICATION_KEY"),
    ecowittApiKey: readRequired("ECOWITT_API_KEY"),
    ecowittMac: readRequired("ECOWITT_MAC"),
    sensorPath: process.env.ECOWITT_SENSOR_PATH || DEFAULT_SENSOR_PATH,
    pollIntervalMs: readPositiveNumber("POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS),
    port: readPositiveNumber("PORT", DEFAULT_PORT),
    host: process.env.HOST || DEFAULT_HOST,
    databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH)
  };
}
