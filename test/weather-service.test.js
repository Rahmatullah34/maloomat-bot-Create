'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const districts = require('../lib/afghanistan-districts.json');

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
  assert.equal(isWeatherQuestion('د کابل د هوا ککړتیا څه ده؟'), true);
  assert.equal(isWeatherQuestion('په کابل کې د PM2.5 کچه څومره ده؟'), true);
});

test('resolves province aliases and district names to Afghanistan-only geocoding queries', () => {
  assert.equal(resolveLocationQuery('د کابل د نن ورځې هوا').query, 'Kabul, Afghanistan');
  assert.equal(resolveLocationQuery('د کندهار د هوا حالاتو معلومات').query, 'Kandahar, Afghanistan');
  const shahJoy = resolveLocationQuery('د زابل د شاه جوی ولسوالۍ د درې ورځو هوا');
  assert.equal(shahJoy.query, 'شاه جوی, زابل');
  assert.equal(shahJoy.districtId, 'AF2606');
  assert.equal(shahJoy.latitude, 32.498);
  assert.equal(shahJoy.longitude, 67.395);

  for (const query of [
    'د زابل ولايت دشاجوی ولسوالي دهوا حالات؟',
    'د زابل ولایت د شاهجوی ولسوالۍ هوا',
    'د شاه‌جوی ولسوالۍ هوا په زابل کې؟',
    'Weather in Shajoy district, Zabul',
  ]) {
    const resolved = resolveLocationQuery(query);
    assert.equal(resolved.districtId, 'AF2606', query);
    assert.equal(resolved.latitude, 32.498, query);
    assert.equal(resolved.longitude, 67.395, query);
  }
  assert.equal(resolveLocationQuery('د ارزګان د خاص ارزګان ولسوالۍ هوا').districtId, 'AF2505');
  assert.equal(resolveLocationQuery('د کونړ د چوکي ولسوالۍ هوا').districtId, 'AF1509');
  assert.equal(districts.districts.length, 401);
  assert.equal(resolveLocationQuery('د سروبي ولسوالۍ هوا').needsProvince, true);
  assert.equal(resolveLocationQuery('د افغانستان د هوا حالاتو معلومات'), null);
});

test('limits forecast-day requests to supported forecast ranges', () => {
  assert.equal(requestedForecastDays('د درې ورځو هوا'), 3);
  assert.equal(requestedForecastDays('د پنځه ورځو هوا'), 5);
  assert.equal(requestedForecastDays('د اوونۍ هوا'), 7);
  assert.equal(requestedForecastDays('سبا د کابل هوا'), 2);
  assert.equal(requestedForecastDays('د کابل هوا'), 7);
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

      if (parsed.hostname === 'air-quality-api.open-meteo.com') {
        return { ok: true, json: async () => ({ timezone: 'Asia/Kabul', current: { time: '2026-11-10T14:00', european_aqi: 35, us_aqi: 42, pm2_5: 8.4, pm10: 17.2 } }) };
      }

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
            rain: 0,
            showers: 0,
            snowfall: 0,
            is_day: 1,
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
            dew_point_2m: [2.1, 2.4],
            precipitation_probability: [0, 10],
            precipitation: [0, 0],
            rain: [0, 0],
            showers: [0, 0],
            snowfall: [0, 0],
            weather_code: [1, 1],
            visibility: [24000, 23000],
            uv_index: [2.5, 3.1],
            is_day: [1, 1],
          },
          daily: {
            time: ['2026-11-10', '2026-11-11', '2026-11-12'],
            weather_code: [1, 2, 3],
            temperature_2m_max: [15, 14, 12],
            temperature_2m_min: [4, 3, 2],
            precipitation_sum: [0, 0.5, 1.2],
            rain_sum: [0, 0.5, 1.2],
            showers_sum: [0, 0, 0],
            snowfall_sum: [0, 0, 0],
            precipitation_probability_max: [0, 20, 40],
            precipitation_hours: [0, 1, 2],
            wind_speed_10m_max: [14, 16, 22],
            wind_gusts_10m_max: [20, 22, 30],
            wind_direction_10m_dominant: [90, 180, 270],
            uv_index_max: [3.1, 3.4, 2.8],
            sunshine_duration: [21600, 18000, 14400],
            daylight_duration: [37800, 37800, 37800],
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
  assert.match(answer, /د شبنم ټکی: 2\.1°C/);
  assert.match(answer, /لید: 24\.0 km/);
  assert.match(answer, /د UV شاخص: 2\.5/);
  assert.match(answer, /واوره 0\.0 cm/);
  assert.match(answer, /د UV اعظمي شاخص/);
  assert.match(answer, /د راتلونکو ورځو وړاندوینه/);
  assert.match(answer, /لږترلږه تودوخه/);
  assert.ok(answer.indexOf('*د راتلونکو ورځو وړاندوینه:*') < answer.indexOf('لږترلږه تودوخه'));
  assert.ok(answer.indexOf('لږترلږه تودوخه') < answer.indexOf('*د هوا کیفیت (ماډلي اټکل):*'));
  assert.ok(answer.lastIndexOf('Open-Meteo') > answer.indexOf('*د هوا کیفیت'));
  assert.match(answer, /اروپايي AQI: 35 \(د منلو وړ\)/);
  assert.match(answer, /PM2\.5: 8\.4 µg\/m³/);
  assert.match(answer, /PM10: 17\.2 µg\/m³/);
  assert.match(answer, /CAMS نړیوال ماډل/);
  assert.match(answer, /Open-Meteo/);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].searchParams.get('countryCode'), 'AF');
  assert.equal(requests[0].searchParams.get('name'), 'Kabul, Afghanistan');
  const forecastRequest = requests.find(request => request.hostname === 'api.open-meteo.com');
  const airRequest = requests.find(request => request.hostname === 'air-quality-api.open-meteo.com');
  assert.equal(forecastRequest.searchParams.get('forecast_days'), '3');
  assert.equal(forecastRequest.searchParams.get('timezone'), 'auto');
  assert.equal(airRequest.searchParams.get('current'), 'european_aqi,us_aqi,pm10,pm2_5');
});


test('uses the checked Shah Joy district coordinates without a fuzzy geocoding guess', async () => {
  let forecastUrl = null;
  const getWeatherAnswer = createWeatherService({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'air-quality-api.open-meteo.com') {
        return { ok: true, json: async () => ({ current: { time: '2026-11-10T14:00', european_aqi: 22, pm2_5: 5.1, pm10: 11 } }) };
      }
      forecastUrl = parsed;
      return {
        ok: true,
        json: async () => ({
          timezone: 'Asia/Kabul',
          current: {
            time: '2026-11-10T14:00',
            temperature_2m: 10,
            relative_humidity_2m: 30,
            apparent_temperature: 9,
            precipitation: 0,
            rain: 0,
            showers: 0,
            snowfall: 0,
            weather_code: 0,
            wind_speed_10m: 5,
            wind_direction_10m: 90,
            wind_gusts_10m: 8,
            cloud_cover: 0,
            pressure_msl: 1018,
            is_day: 1,
          },
          hourly: {
            time: ['2026-11-10T14:00'],
            dew_point_2m: [1],
            visibility: [30000],
            uv_index: [3],
          },
          daily: { time: [] },
        }),
      };
    },
  });

  const answer = await getWeatherAnswer('د زابل د شاه جوی ولسوالۍ د هوا حالاتو معلومات');
  assert.equal(forecastUrl.hostname, 'api.open-meteo.com');
  assert.equal(Number(forecastUrl.searchParams.get('latitude')), 32.498);
  assert.equal(Number(forecastUrl.searchParams.get('longitude')), 67.395);
  assert.match(answer, /شاه جوی ولسوالي/);
  assert.match(answer, /اروپايي AQI: 22/);
  assert.match(answer, /Open-Meteo/);
  assert.match(answer, /Open Admin Data/);
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


test('keeps the weather forecast when air-quality data are temporarily unavailable', async () => {
  const getWeatherAnswer = createWeatherService({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'geocoding-api.open-meteo.com') {
        return { ok: true, json: async () => ({ results: [{ name: 'Kabul', country_code: 'AF', admin1: 'Kabul', latitude: 34.53, longitude: 69.17, timezone: 'Asia/Kabul' }] }) };
      }
      if (parsed.hostname === 'air-quality-api.open-meteo.com') throw new Error('temporary AQI outage');
      return { ok: true, json: async () => ({
        timezone: 'Asia/Kabul',
        current: { time: '2026-11-10T14:00', temperature_2m: 12, relative_humidity_2m: 30, apparent_temperature: 11, precipitation: 0, rain: 0, showers: 0, snowfall: 0, weather_code: 0, is_day: 1, wind_speed_10m: 5, wind_direction_10m: 90, wind_gusts_10m: 8, cloud_cover: 0, pressure_msl: 1018 },
        hourly: { time: ['2026-11-10T14:00'], dew_point_2m: [1], visibility: [30000], uv_index: [3] },
        daily: { time: ['2026-11-10'], temperature_2m_min: [4], temperature_2m_max: [15], weather_code: [0] },
      }) };
    },
  });
  const answer = await getWeatherAnswer('د کابل هوا');
  assert.match(answer, /اسمان صاف/);
  assert.match(answer, /د هوا د کیفیت شاخص دا ځل له سرچینې ترلاسه نه شو/);
});
