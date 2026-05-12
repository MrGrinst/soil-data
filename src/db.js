import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function createDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS soil_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sensor_channel TEXT NOT NULL,
      moisture_percent REAL NOT NULL,
      source_epoch INTEGER NOT NULL,
      recorded_at TEXT NOT NULL,
      raw_payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sensor_channel, source_epoch)
    );

    CREATE INDEX IF NOT EXISTS idx_soil_readings_recorded_at
      ON soil_readings(recorded_at DESC);
  `);

  const insertReading = db.prepare(`
    INSERT OR IGNORE INTO soil_readings (
      sensor_channel,
      moisture_percent,
      source_epoch,
      recorded_at,
      raw_payload
    ) VALUES (
      @sensorChannel,
      @moisturePercent,
      @sourceEpoch,
      @recordedAt,
      @rawPayloadJson
    )
  `);

  const latestReading = db.prepare(`
    SELECT
      sensor_channel AS sensorChannel,
      moisture_percent AS moisturePercent,
      source_epoch AS sourceEpoch,
      recorded_at AS recordedAt
    FROM soil_readings
    ORDER BY source_epoch DESC
    LIMIT 1
  `);

  const historyQuery = db.prepare(`
    SELECT
      sensor_channel AS sensorChannel,
      moisture_percent AS moisturePercent,
      source_epoch AS sourceEpoch,
      recorded_at AS recordedAt
    FROM soil_readings
    WHERE source_epoch >= ?
    ORDER BY source_epoch ASC
  `);

  return {
    close() {
      db.close();
    },
    insertReading(reading) {
      return insertReading.run({
        sensorChannel: reading.sensorChannel,
        moisturePercent: reading.moisturePercent,
        sourceEpoch: reading.sourceEpoch,
        recordedAt: reading.recordedAt,
        rawPayloadJson: JSON.stringify(reading.rawPayload)
      });
    },
    getLatestReading() {
      return latestReading.get() || null;
    },
    getHistory(hours) {
      const sinceEpoch = Math.floor(Date.now() / 1000) - hours * 60 * 60;
      return historyQuery.all(sinceEpoch);
    }
  };
}
