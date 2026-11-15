# Open TMT Station

Public web page for an ESP32 (Tasmota) weather station. Data comes from InfluxDB, where Telegraf's `mqtt_consumer` stores the station's MQTT telemetry. The page shows the same readings and calculations as the private Grafana dashboard (`grafana-dashboard-reference.json`).

```
ESP32 (Tasmota) ── MQTT ──> Telegraf ──> InfluxDB 1.x
                                            │  InfluxQL (read-only)
                                   ┌────────┴────────┐
                                   │  api  (Node.js) │  cache, rate limit, calculations
                                   └────────┬────────┘
                                   ┌────────┴────────┐
 visitors ── HTTP ───────────────> │  web  (nginx)   │  React + Tailwind build, proxies /api
                                   └─────────────────┘
```

| Folder      | Stack                                                    |
| ----------- | -------------------------------------------------------- |
| `backend/`  | Node.js 22, Express 5, plain HTTP client for InfluxQL     |
| `frontend/` | React 19, Vite, Tailwind CSS 4, Recharts, Lucide icons    |

## Quick start

```bash
cp .env.example .env
```

Edit `.env`: set `INFLUX_URL`, `INFLUX_DB`, credentials and `DEVICE_TOPIC_PREFIX`. Then:

```bash
docker compose up -d --build
```

The page is served at `http://<server>:8080` (change it with `WEB_PORT`).

To try it without a database, set `MOCK_DATA=true` in `.env`. The API then serves synthetic data with a day/night cycle.

> Inside a container, `localhost` points to the container itself. If InfluxDB runs on the same host outside Docker, use the host IP or enable `extra_hosts` in `docker-compose.yml` and set `INFLUX_URL=http://host.docker.internal:8086`. If InfluxDB runs in another compose project, attach the `api` service to that network.

### Read-only InfluxDB user (recommended)

```sql
CREATE USER "public_api" WITH PASSWORD '...';
GRANT READ ON "telegraf" TO "public_api";
```

## Local development

```bash
cd backend && npm install && MOCK_DATA=true npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

Vite runs on `http://localhost:5173` and proxies `/api` to `http://localhost:3001`. Backend tests:

```bash
cd backend && npm test
```

## Data source

Measurement `mqtt_consumer`, filtered with `"topic" =~ /^tele\/esp32_varanda\//`, which matches both Tasmota `SENSOR` and `STATE` messages.

| API metric            | InfluxDB field       | Unit | Sensor            |
| --------------------- | -------------------- | ---- | ----------------- |
| `temperature`         | `AM2301_Temperature` | °C   | AM2301            |
| `humidity`            | `AM2301_Humidity`    | %    | AM2301            |
| `pressure`            | `BMP280_Pressure`    | hPa  | BMP280            |
| `internalTemperature` | `BMP280_Temperature` | °C   | BMP280 (enclosure)|
| `illuminance`         | `BH1750_Illuminance` | lx   | BH1750            |
| `sourceVoltage`       | `ANALOG_Voltage1`    | V    | DC input (solar / USB) |
| `batteryVoltage`      | `ANALOG_Voltage2`    | V    | Li-ion battery    |
| `wifiSignal`          | `Wifi_Signal`        | dBm  | Tasmota STATE     |
| `loadAvg`             | `LoadAvg`            | %    | Tasmota STATE     |
| `uptime`              | `UptimeSec`          | s    | Tasmota STATE     |

The API runs one aggregated InfluxQL query per request type, for example (range `24h`):

```sql
SELECT mean("AM2301_Temperature") AS "temperature", mean("AM2301_Humidity") AS "humidity",
       mean("BMP280_Pressure") AS "pressure", ..., last("UptimeSec") AS "uptime"
FROM "mqtt_consumer"
WHERE "topic" =~ /^tele\/esp32_varanda\// AND time > now() - 24h
GROUP BY time(5m) fill(none)
```

Ranges and bucket sizes: `1h`/`3h` → 1m, `6h` → 2m, `12h`/`24h` → 5m, `7d` → 30m, `30d` → 2h. Only values from this fixed list reach the query, so user input is never interpolated.

## API

All endpoints are `GET` and return JSON. Full reference with response examples: [`docs/api.md`](docs/api.md).

| Endpoint                         | Description                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `/api/health`                    | API and InfluxDB status                                                                      |
| `/api/meta`                      | Station info, metrics, ranges and every threshold used by the calculations                   |
| `/api/snapshot?mode=`            | Current values with levels, trends and rates, plus battery, DC input, power flow and system    |
| `/api/history?range=&metrics=`   | Chart series (block-averaged to `maxPoints`) and min/max/avg per metric                       |
| `/api/metrics/:metric?range=`    | One metric: series and derived values over the range                                        |
| `/api/energy?range=&mode=`       | Energy over the range: time on battery and on source, discharge and charge rates, autonomy   |

`range`: `1h`, `3h`, `6h`, `12h`, `24h` (default), `7d`, `30d`. `mode`: `solar` or `psu` (default from `POWER_MODE`).

Responses are cached in memory (15 s for the snapshot, 60 s for ranges). Concurrent identical requests share one InfluxDB query. A rate limit of `RATE_LIMIT_PER_MINUTE` requests per IP applies.

## Calculations

Ported from the dashboard's HTML Graphics panels (`backend/src/lib/calculations.js`, covered by `backend/test/`). Rates come from least-squares linear regression over a recent window.

| Item | Method |
| --- | --- |
| Temperature trend | Slope over the last 30 min in °C/h. Rising / falling above ±0.3 °C/h |
| Humidity trend | Slope over 30 min in %/h, threshold ±1 %/h. Comfort band 40–60 % |
| Pressure tendency | Slope over 3 h × 3, in hPa/3h. Threshold ±0.5 hPa/3h. Barometer levels (stormy … very dry) |
| Light trend | Current value vs. mean of the 5 previous readings, threshold max(1 lx, 5 %). Also a 30 min slope in lx/h |
| Battery level | `(V − BAT_EMPTY) / (BAT_MAX − BAT_EMPTY) × 100`, clamped to 0–100 |
| Battery rate | Slope over 30 min in mV/h (and %/h). Charging / discharging above ±20 mV/h |
| Time to empty | Remaining mV divided by the discharge slope over 2 h (at least 10 points). Capped at 30 days |
| Time to full | Remaining mV divided by the current charge slope (linear estimate) |
| Power state | Source below 4.0 V (solar) or 4.5 V (PSU): **battery**. Battery rising above 8 mV/h (20 min window): **charging**. Battery at or above 4.06 V: **full**. Otherwise charging |
| Time in current state | Since the last state change. Shown as "for over" if no change happened inside the window |
| Time on battery / on source | Each interval between consecutive readings is assigned to the earlier state. Gaps longer than 10 min, or 2.5 buckets, are ignored |
| Consumption while discharging | Slope of every continuous battery-only segment (≥ 10 min, ≥ 3 points), weighted by duration, in mV/h and %/h |
| Charge rate | Same method on charging segments |
| Autonomy / full recharge | Battery capacity (`BAT_MAX − BAT_EMPTY`, in mV) divided by the average discharge / charge rate |
| DC input | Solar: charger active ≥ 4.3 V, limit ≥ 4.0 V, sun levels. PSU: USB spec 4.75–5.25 V. Ripple is the peak-to-peak value over 30 min. The charge window is the time spent at or above 4.3 V |
| Wi-Fi quality | `2 × (dBm + 100)`, clamped to 0–100 % |
| Uptime | Boot time = last report time − `UptimeSec`. A restart is counted when the counter drops by more than 5 s |

The charge level is estimated linearly from voltage, as in Grafana. Treat autonomy figures as approximations.
