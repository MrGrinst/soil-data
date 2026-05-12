const ECOWITT_URL = "https://api.ecowitt.net/api/v3/device/real_time";

function getNestedValue(source, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => value?.[key], source);
}

export async function fetchEcowittReading(config, fetchImpl = fetch) {
  const params = new URLSearchParams({
    application_key: config.ecowittApplicationKey,
    api_key: config.ecowittApiKey,
    mac: config.ecowittMac,
    call_back: "all"
  });

  const response = await fetchImpl(`${ECOWITT_URL}?${params.toString()}`, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Ecowitt API returned ${response.status}`);
  }

  const payload = await response.json();

  return parseEcowittReading(payload, config.sensorPath);
}

export function parseEcowittReading(payload, sensorPath) {
  if (!payload || payload.code !== 0 || !payload.data) {
    throw new Error("Ecowitt payload indicated failure");
  }

  const readingNode = getNestedValue(payload.data, sensorPath);

  if (!readingNode || readingNode.value == null) {
    throw new Error(`Sensor path ${sensorPath} was not present in Ecowitt payload`);
  }

  const moisturePercent = Number(readingNode.value);

  if (!Number.isFinite(moisturePercent)) {
    throw new Error(`Sensor value at ${sensorPath} was not numeric`);
  }

  const sourceEpoch = Number(readingNode.time || payload.time);

  if (!Number.isFinite(sourceEpoch)) {
    throw new Error("Ecowitt payload did not include a valid timestamp");
  }

  return {
    sensorChannel: sensorPath.split(".")[0],
    moisturePercent,
    sourceEpoch,
    recordedAt: new Date(sourceEpoch * 1000).toISOString(),
    rawPayload: payload
  };
}
