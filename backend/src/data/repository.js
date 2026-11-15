// Data access layer: real InfluxDB or synthetic generator.

import { InfluxClient, resultToSeries } from '../influx/client.js';
import { RANGES, METRIC_KEYS, buildSeriesQuery } from '../influx/queries.js';
import { mockSeries } from './mock.js';

export function createRepository(config) {
  const influx = new InfluxClient(config.influx);
  const { measurement, topicPrefix } = config.influx;

  return {
    mock: config.mock,

    /** Bucket-aggregated series for one of the RANGES. */
    async series(rangeKey, metrics = METRIC_KEYS) {
      const range = RANGES[rangeKey];
      if (!range) throw new Error(`invalid range: ${rangeKey}`);
      if (config.mock) return mockSeries({ rangeMs: range.ms, intervalMs: range.intervalMs, metrics });
      const q = buildSeriesQuery({ measurement, topicPrefix, rangeKey, metrics });
      const [result] = await influx.query(q);
      const series = resultToSeries(result);
      for (const m of metrics) series[m] ||= [];
      return series;
    },

    async ping() {
      if (config.mock) return true;
      return influx.ping();
    },
  };
}
