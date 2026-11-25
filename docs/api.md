# API reference

Base path: `/api`. All endpoints are `GET` and return JSON. Timestamps are Unix epoch milliseconds. Errors return `{ "error": "message" }` with status 400 (bad parameter), 404 (unknown metric or endpoint), 429 (rate limited) or 502 (InfluxDB unavailable).

Parameters:

- `range`: `1h`, `3h`, `6h`, `12h`, `24h`, `7d`, `30d`
- `mode`: `solar` or `psu` (default from `POWER_MODE`)
- `metrics`: comma-separated list of `temperature`, `humidity`, `dewPoint`, `pressure`, `internalTemperature`, `illuminance`, `sourceVoltage`, `batteryVoltage`, `wifiSignal`, `loadAvg`, `uptime`, `deepSleep`

Common fields in derived metrics:

- `value`: latest reading. `min`, `max`, `avg`: over the window.
- `level`: slug for the value band (for example `comfortable`, `fair`, `daylight`).
- `rate`: slope per hour (pressure: per 3 h). `trend`: `up`, `down` or `flat`.
- `stale`: `true` when the last reading is older than 5 min (15 min for the enclosure sensor).

## GET /api/health

```json
{
  "status": "ok",
  "influx": "ok",
  "mock": true,
  "time": 1794717300179
}
```

Status 503 with `"status": "degraded"` when InfluxDB does not answer.

## GET /api/meta

Station configuration, ranges, metric-to-field map and every threshold used by the calculations (`thresholds`).

## GET /api/snapshot

Current conditions, derived from the last 3 h at 1 min resolution. Example, shortened:

```json
{
  "station": "Weather Station",
  "mode": "solar",
  "generatedAt": 1794717300149,
  "lastUpdate": 1794717300000,
  "online": true,
  "metrics": {
    "temperature": {
      "unit": "°C",
      "rateUnit": "°C/h",
      "value": 12.7,
      "min": 11.9,
      "max": 12.7,
      "avg": 12.2,
      "time": 1794717300000,
      "stale": false,
      "level": "cool",
      "rate": 0.68,
      "trend": "up"
    },
    "batteryVoltage": {
      "unit": "V",
      "voltage": 3.819,
      "percent": 72.2,
      "level": "good",
      "low": false,
      "min": 3.819,
      "max": 3.905,
      "rate": -29,
      "ratePercent": -2.56,
      "trend": "down",
      "toEmpty": {
        "hours": 28.89,
        "overMaxDays": null,
        "at": 1794821317872,
        "rateMvH": -28.3
      },
      "toFull": null,
      "empty": 3,
      "full": 4.135,
      "time": 1794717300000,
      "stale": false
    },
    "sourceVoltage": {
      "mode": "solar",
      "unit": "V",
      "voltage": 0.22,
      "level": "night",
      "status": "below_minimum",
      "min": 0.15,
      "max": 0.25,
      "avg": 0.2,
      "rippleMv": 93,
      "chargeWindowMs": 0,
      "sunIntensity": 0,
      "limits": {
        "min": 0,
        "max": 7.5,
        "chargerMin": 4,
        "chargerOk": 4.3,
        "nightBelow": 1
      },
      "time": 1794717300000,
      "stale": false
    },
    "wifiSignal": {
      "unit": "dBm",
      "value": -65,
      "min": -65,
      "max": -57,
      "avg": -60.8,
      "quality": 71,
      "level": "good",
      "bars": 2,
      "time": 1794717300000,
      "stale": false
    },
    "uptime": {
      "unit": "s",
      "value": 23700,
      "reported": 23700,
      "bootTime": 1794693600000,
      "restarts": 0,
      "recentBoot": false,
      "time": 1794717300000,
      "stale": false
    },
    "…": "humidity, pressure, illuminance, internalTemperature, loadAvg"
  },
  "flow": {
    "state": "battery",
    "sourceOn": false,
    "since": 1794706560000,
    "durationMs": 10740000,
    "atLeast": true
  }
}
```

`flow.state`: `battery` (running on battery), `charging`, or `full` (powered by the source, battery full). `flow.durationMs` is the time in that state. `flow.atLeast` is `true` when no change happened inside the 3 h window.

`batteryVoltage.toEmpty` appears while discharging: `hours`, estimated time `at`, and `overMaxDays` beyond 30 days. `toFull` appears while charging.

## GET /api/history?range=24h&metrics=temperature

Series for charts as `[timestamp, value]` pairs, block-averaged down to `maxPoints` (default 500, max 2000). The `summary` uses every bucket in the range. Requesting `batteryVoltage` also returns a derived `batteryPercent` series.

```json
{
  "range": "24h",
  "interval": "5m",
  "from": 1794630900165,
  "to": 1794717300165,
  "series": {
    "temperature": {
      "unit": "°C",
      "label": "Temperature",
      "summary": {
        "current": 12.67892793777649,
        "min": 11.930859228655997,
        "max": 26.065451706568943,
        "avg": 18.99550941313321,
        "time": 1794717300000,
        "count": 288
      },
      "points": [
        [
          1794639600000,
          13.932
        ],
        [
          1794648300000,
          17.651
        ],
        [
          1794657000000,
          21.886
        ],
        [
          1794665700000,
          25.025
        ],
        [
          1794674400000,
          25.821
        ],
        [
          1794683100000,
          23.964
        ],
        [
          1794691800000,
          20.186
        ],
        [
          1794700500000,
          15.96
        ],
        [
          1794709200000,
          12.885
        ],
        [
          1794717300000,
          12.176
        ]
      ]
    }
  }
}
```

## GET /api/metrics/:metric?range=6h

One metric with its derived values computed over the chosen range (default `3h`).

```json
{
  "metric": "pressure",
  "range": "6h",
  "unit": "hPa",
  "derived": {
    "unit": "hPa",
    "rateUnit": "hPa/3h",
    "value": 1015.2,
    "min": 1015.2,
    "max": 1016.2,
    "avg": 1015.9,
    "time": 1794717240000,
    "stale": false,
    "level": "fair",
    "rate": -0.94,
    "trend": "down",
    "standard": 1013.25
  },
  "points": [
    [
      1794695760000,
      1015.915
    ],
    [
      1794695880000,
      1015.869
    ],
    [
      1794696000000,
      1015.847
    ],
    "…"
  ]
}
```

## GET /api/energy?range=7d

Energy analysis over the range.

```json
{
  "range": "7d",
  "mode": "solar",
  "rangeMs": 604800000,
  "state": "battery",
  "stateSince": 1794677400000,
  "stateSinceMs": 39600000,
  "stateSinceAtLeast": false,
  "sourceOn": false,
  "totals": {
    "battery": 360000000,
    "charging": 180000000,
    "full": 63000000,
    "source": 243000000,
    "covered": 603000000
  },
  "shares": {
    "battery": 0.597,
    "source": 0.403
  },
  "discharge": {
    "rateMvH": -27.7,
    "ratePercentH": -2.44,
    "autonomyHours": 40.9,
    "sampledMs": 347400000,
    "segments": 8
  },
  "charge": {
    "rateMvH": 70.5,
    "ratePercentH": 6.21,
    "fullChargeHours": 16.1,
    "sampledMs": 167400000,
    "segments": 7
  },
  "transitions": 21,
  "power": "{ …same shape as snapshot.metrics.sourceVoltage }",
  "battery": "{ …same shape as snapshot.metrics.batteryVoltage }"
}
```

- `totals`: milliseconds per state. `source` = `charging` + `full`. `covered` excludes data gaps.
- `shares`: fraction of covered time on battery and on source.
- `discharge`: average battery slope while running on battery (`rateMvH`, `ratePercentH`), weighted by segment duration. `autonomyHours` is full to empty at that rate.
- `charge`: same method while charging. `fullChargeHours` is empty to full at that rate.
- `transitions`: number of state changes in the range.

## GET /api/outside

External weather from OpenWeather. This endpoint never calls OpenWeather: it returns the copy kept in memory by the background scheduler (every `OPENWEATHER_REFRESH_MINUTES`, default 60).

```json
{
  "enabled": true,
  "source": "OpenWeather",
  "location": { "name": "Campinas", "country": "BR", "lat": -22.9, "lon": -47.06 },
  "current": {
    "time": 1700000000000, "temp": 21.6, "feelsLike": 21.8, "tempMin": 19, "tempMax": 24,
    "humidity": 72, "pressure": 1015, "windSpeed": 8.4, "windGust": 14.4, "windDeg": 140,
    "clouds": 40, "visibilityKm": 10, "rain1h": null, "snow1h": null,
    "condition": { "id": 802, "main": "Clouds", "description": "scattered clouds", "icon": "03d" },
    "sunrise": 1699950000000, "sunset": 1699997000000, "timezoneOffsetS": -10800
  },
  "forecast": [
    { "time": 1700010800000, "temp": 20, "humidity": 60, "pop": 20, "windSpeed": 10.8, "condition": { "id": 802, "main": "Clouds", "description": "scattered clouds", "icon": "03d" } }
  ],
  "fetchedAt": 1700000100000,
  "nextUpdateAt": 1700003700000,
  "refreshMinutes": 60,
  "stale": false,
  "error": null
}
```

Wind speeds are in km/h, `pop` is the probability of precipitation in %, `forecast` has 8 entries (3 h steps, next 24 h). Returns `{ "enabled": false }` when no key or location is configured. In `MOCK_DATA` mode without a key it returns demo data.

### `metrics.deepSleep` (in `/api/snapshot`)

```json
{ "unit": "s", "value": 300, "enabled": true, "nextWakeAt": 1700000300000, "changedAt": null, "previous": null, "time": 1700000000000, "stale": false }
```

`value` is `DeepSleepTime` in seconds (`0` = disabled). `nextWakeAt` = last report + interval. `changedAt` / `previous` describe the most recent change of the setting within the last 3 h.

### Connection status (in `/api/snapshot`)

```json
{ "online": false, "status": "sleeping", "sleepingAt": 1700000300000, "offlineAt": 1700001890000, "nextWakeAt": 1700001800000 }
```

- `status`: `online` (last reading within `LIVE_WINDOW_SECONDS`), `sleeping` (past that window, deep sleep on, next wake-up not missed yet) or `offline`.
- `sleepingAt`: when `online` turns into `sleeping` (null when no sleeping phase applies).
- `offlineAt`: when the station counts as offline: the later of last reading + `LIVE_WINDOW_SECONDS` and last reading + deep sleep interval + `DEEP_SLEEP_GRACE_SECONDS`.
- `online` is kept for compatibility and is `true` only for `status: "online"`.

### `metrics.dewPoint` (in `/api/snapshot`)

```json
{
  "unit": "°C", "value": 13.6, "min": 12.9, "max": 13.8, "avg": 13.4, "rate": 0.1, "trend": "flat",
  "level": "comfortable", "temperature": 23.9, "humidity": 53, "spread": 10.3,
  "fog": { "level": "low", "saturationInHours": 8.2 },
  "frost": "unlikely", "nightLowFloor": 13.6,
  "storm": { "level": "low", "pressureFalling": false, "elevated": false },
  "absoluteHumidity": 11.4, "computed": false, "time": 1700000000000, "stale": false
}
```

- `level`: `dry` (< 10 °C), `comfortable` (10–16), `humid` (16–21), `oppressive` (> 21).
- `spread`: air temperature minus dew point. `fog.level`: `forming` (≤ 1 °C), `high` (≤ 2.5), `moderate` (≤ 4), `low`. `fog.saturationInHours`: when the air reaches the dew point at the current cooling rate (null if not cooling towards it or more than 12 h away).
- `frost`: `unlikely` (dew point ≥ 0 °C), `low`, `possible`, `likely`, `forming`.
- `storm.level`: `very_low`, `low`, `moderate`, `high`; `elevated` when moisture is moderate/high and pressure is falling.
- `computed`: true when the dew point was derived from temperature and humidity because `AM2301_DewPoint` was missing.

### `outlook` (in `/api/snapshot`)

```json
{
  "outlook": "clearing",
  "chance": { "1h": 4, "3h": 5, "6h": 3 },
  "storm": "none",
  "isDay": true,
  "cloudCover": 45,
  "pressureTendency": 1.1,
  "confidence": "medium",
  "lightReferenceDays": 7,
  "factors": [
    { "key": "very_dry_air", "effect": "lowers", "weight": -1.2, "group": "moisture", "value": 15.2, "unit": "°C" },
    { "key": "pressure_rising", "effect": "lowers", "weight": -0.7, "group": "pressure", "value": 1.1, "unit": "hPa/3h" }
  ],
  "time": 1700000000000
}
```

- `outlook`: `storm`, `rain`, `showers`, `fog`, `sunny`, `clearing`, `partly_cloudy`, `cloudy`, `clear_night`, `cloudy_night`, `unknown_day`, `unknown`.
- `chance`: estimated chance of rain (%) per horizon. `storm`: `none`, `watch` (hot and humid), `possible`, `likely`.
- `cloudCover`: % estimated from the light sensor (daytime only, null at night or twilight). `isDay`: null when there is no light history yet.
- `factors`: each rule that fired, sorted by weight; `effect` says whether it raises or lowers the chance of rain.
- Local estimate from the station's sensors, not a scientific forecast.
