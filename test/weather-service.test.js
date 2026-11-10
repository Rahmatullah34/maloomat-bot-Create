'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createWeatherService,
  isWeatherQuestion,
  resolveLocationQuery,
  requestedForecastDays,
  getWeatherDescription,
} = require('../lib/weather-service');

test('recognizes Pashto, Dari, and English weather requests without treating air pollution as weather', () => {
  assert.equal(isWeatherQuestion('د افغانستان د هوا حالاتو معلومات راکړه'), true);
  assert.equal(isWeatherQuestion('د کابل د درې ورځو هوا'), true);
  assert.equal(isWeatherQuestion('در هرات فردا باران می‌شود؟'), true);
  assert.equal(isWeatherQuestion('weather forecast for Kabul'), true);
  assert.equal(isWeatherQuestion('د کابل د هوا ککړتیا څه ده؟'), false);
});

test('resolves province aliases and district names to Afghanistan-only geocoding queries', () => {
  assert.equal(resolveLocationQuery('د کابل د نن ورځې هوا').query, 'Kabul, Afghanistan');
  assert.equal(resolveLocationQuery('د کندهار د هوا حالاتو معلومات').query, 'Kandahar, Afghanistan');
  assert.equal(resolveLocationQuery('د زابل د شاه جوی ولسوالۍ د درې ورځو هوا').query, 'شاه جوی, زابل');
  assert.equal(resolveLocationQuery('د افغانستان د هوا حالاتو معلومات'), null);
});

test('limits forecast-day requests to supported forecast ranges', () => {
  assert.equal(requestedForecastDays('د درې ورځو هوا'), 3);
  assert.equal(requestedForecastDays('د پنځه ورځو هوا'), 5);
  assert.equal(requestedForecastDays('د اوونۍ هوا'), 7);
  assert.equal(requestedForecastDays('سبا د کابل هوا'), 2);
  assert.equal(requestedForecastDays('د کابل هوا'), 5);
});

test('maps WMO forecast codes to Pashto descriptions', () => {
  assert.match(getWeatherDescription(0), /صاف/);
  assert.match(getWeatherDescription(71), /واوره/);
  assert.match(getWeatherDescription(95), /برېښنا/);
  assert.match(getWeatherDescription(12345), /معلوم نه دی/);
});

test('asks for a province or city instead of guessing when Afghanistan is the only location', async () => {
  let calls = 0;
  const getWeatherAnswer = createWeatherService({
    fetchImpl: async () => {
      calls += 1;
      throw new Error('fetch must not run without a place');
    },
  });

  const answer = await getWeatherAnswer('د افغانستان د هوا حالاتو معلومات');
  assert.match(answer, /ولایت، ښار یا ولسوالۍ/);
  assert.equal(calls, 0);
});

test('geocodes within Afghanistan and returns a detailed local forecast in Pashto', async () => {
  const requests = [];
  const getWeatherAnswer = createWeatherService({
    now: () => 1000,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      requests.push(parsed);

      if (parsed.hostname === 'geocoding-api.open-meteo.com') {
        return {
          ok: true,
          json: async () => ({
            results: [
              { name: 'Kabul', country_code: 'US', latitude: 38.9, longitude: -77.0 },
              {
                name: 'Kabul',
                country_code: 'AF',
                country: 'Afghanistan',
                admin1: 'Kabul',
                latitude: 34.53,
                longitude: 69.17,
                timezone: 'Asia/Kabul',
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          timezone: 'Asia/Kabul',
          current: {
            time: '2026-11-10T14:00',
            temperature_2m: 12.4,
            relative_humidity_2m: 35,
            apparent_temperature: 11.1,
            precipitation: 0,
            weather_code: 1,
            wind_speed_10m: 9.2,
            wind_direction_10m: 90,
            wind_gusts_10m: 18,
            cloud_cover: 15,
            pressure_msl: 1017,
          },
          hourly: {
            time: ['2026-11-10T14:00', '2026-11-10T15:00'],
            temperature_2m: [12.4, 11.8],
            precipitation_probability: [0, 10],
            precipitation: [0, 0],
            weather_code: [1, 1],
          },
          daily: {
            time: ['2026-11-10', '2026-11-11', '2026-11-12'],
            weather_code: [1, 2, 3],
            temperature_2m_max: [15, 14, 12],
            temperature_2m_min: [4, 3, 2],
            precipitation_sum: [0, 0.5, 1.2],
            precipitation_probability_max: [0, 20, 40],
            wind_speed_10m_max: [14, 16, 22],
            sunrise: ['2026-11-10T06:30', '2026-11-11T06:31', '2026-11-12T06:32'],
            sunset: ['2026-11-10T17:00', '2026-11-11T16:59', '2026-11-12T16:58'],
          },
        }),
      };
    },
  });

  const answer = await getWeatherAnswer('د کابل د درې ورځو هوا');

  assert.match(answer, /د کابل ولایت/);
  assert.match(answer, /تودوخه: 12°C/);
  assert.match(answer, /نسبي رطوبت: 35%/);
  assert.match(answer, /د راتلونکو ورځو وړاندوینه/);
  assert.match(answer, /Open-Meteo/);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get('countryCode'), 'AF');
  assert.equal(requests[0].searchParams.get('name'), 'Kabul, Afghanistan');
  assert.equal(requests[1].searchParams.get('forecast_days'), '3');
  assert.equal(requests[1].searchParams.get('timezone'), 'auto');
});

test('does not return weather for a geocoding result outside Afghanistan', async () => {
  let calls = 0;
  const getWeatherAnswer = createWeatherService({
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => ({
          results: [
            { name: 'Kabul', country_code: 'US', latitude: 38.9, longitude: -77.0 },
          ],
        }),
      };
    },
  });

  const answer = await getWeatherAnswer('د کابل هوا');
  assert.match(answer, /په افغانستان کې/);
  assert.equal(calls, 1);
});
