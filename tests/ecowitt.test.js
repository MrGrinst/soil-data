import test from "node:test";
import assert from "node:assert/strict";
import { parseEcowittReading } from "../src/ecowitt.js";

const fixture = {
  code: 0,
  data: {
    soil_ch1: {
      soilmoisture: {
        time: "1778559613",
        unit: "%",
        value: "36"
      }
    }
  },
  time: "1778559637"
};

test("parseEcowittReading extracts the configured sensor reading", () => {
  const reading = parseEcowittReading(fixture, "soil_ch1.soilmoisture");

  assert.equal(reading.sensorChannel, "soil_ch1");
  assert.equal(reading.moisturePercent, 36);
  assert.equal(reading.sourceEpoch, 1778559613);
  assert.equal(reading.recordedAt, "2026-05-12T04:20:13.000Z");
});

test("parseEcowittReading fails when the sensor path is missing", () => {
  assert.throws(
    () => parseEcowittReading(fixture, "soil_ch2.soilmoisture"),
    /Sensor path soil_ch2\.soilmoisture was not present/
  );
});
