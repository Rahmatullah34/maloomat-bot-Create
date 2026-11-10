'use strict';

const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ATTRIBUTION = 'د هوا معلومات: Open-Meteo (https://open-meteo.com/)';

const WEATHER_CODE_TEXT = {
  0: 'اسمان صاف دی',
  1: 'هوا تر ډېره صافه ده',
  2: 'نیمه وريځ ده',
  3: 'اسمان وريځ دی',
  45: 'لوړه/غلیظه لوخړه ده',
  48: 'یخه لوخړه ده',
  51: 'سپک څاڅکي اوري',
  53: 'منځنی څاڅکی باران دی',
  55: 'دروند څاڅکی باران دی',
  56: 'یخ وهونکی سپک باران دی',
  57: 'یخ وهونکی دروند باران دی',
  61: 'سپک باران دی',
  63: 'منځنی باران دی',
  65: 'دروند باران دی',
  66: 'سپک یخ وهونکی باران دی',
  67: 'دروند یخ وهونکی باران دی',
  71: 'سپکه واوره اوري',
  73: 'منځنۍ واوره اوري',
  75: 'درنه واوره اوري',
  77: 'د واورې واړه دانې اوري',
  80: 'سپک لنډمهالی باران دی',
  81: 'منځنی لنډمهالی باران دی',
  82: 'شدید لنډمهالی باران دی',
  85: 'سپکې واورینې ورښتونه دي',
  86: 'درنې واورینې ورښتونه دي',
  95: 'تالنده او برېښنا ده',
  96: 'له لږ ږلۍ سره تالنده او برېښنا ده',
  97: 'شدیده تالنده او برېښنا ده',
  99: 'له درنې ږلۍ سره شدیده تالنده او برېښنا ده',
};

const PROVINCES = [
  { province: 'کابل', aliases: ['کابل', 'کابل ښار'], city: 'Kabul' },
  { province: 'کندهار', aliases: ['کندهار', 'قندهار'], city: 'Kandahar' },
  { province: 'هرات', aliases: ['هرات'], city: 'Herat' },
  { province: 'بلخ', aliases: ['بلخ', 'مزار شریف', 'مزارشریف'], city: 'Mazar-i-Sharif' },
  { province: 'ننګرهار', aliases: ['ننګرهار', 'جلال اباد', 'جلال‌آباد', 'جلالاباد'], city: 'Jalalabad' },
  { province: 'کندز', aliases: ['کندز'], city: 'Kunduz' },
  { province: 'بغلان', aliases: ['بغلان', 'پلخمري', 'پل خمري'], city: 'Pul-e Khumri' },
  { province: 'تخار', aliases: ['تخار', 'تالقان'], city: 'Taloqan' },
  { province: 'بدخشان', aliases: ['بدخشان', 'فیض اباد', 'فیض‌آباد', 'فیضاباد'], city: 'Fayzabad' },
  { province: 'بادغیس', aliases: ['بادغیس', 'قلعه نو', 'قلعه‌نو'], city: 'Qala-e Naw' },
  { province: 'فاریاب', aliases: ['فاریاب', 'میمنه'], city: 'Maymana' },
  { province: 'جوزجان', aliases: ['جوزجان', 'شبرغان'], city: 'Sheberghan' },
  { province: 'سمنگان', aliases: ['سمنگان', 'ایبک'], city: 'Aybak' },
  { province: 'سرپل', aliases: ['سرپل', 'سر پل'], city: 'Sar-e Pol' },
  { province: 'غور', aliases: ['غور', 'فیروزکوه', 'چغچران'], city: 'Firozkoh' },
  { province: 'بامیان', aliases: ['بامیان'], city: 'Bamyan' },
  { province: 'دایکندی', aliases: ['دایکندی', 'نیلی', 'نيلی'], city: 'Nili' },
  { province: 'ارزګان', aliases: ['ارزګان', 'اروزګان', 'ترینکوټ'], city: 'Tarinkot' },
  { province: 'زابل', aliases: ['زابل', 'قلات'], city: 'Qalat' },
  { province: 'پکتیکا', aliases: ['پکتیکا', 'ښرنه', 'شرنه'], city: 'Sharan' },
  { province: 'پکتیا', aliases: ['پکتیا', 'ګردېز', 'ګردیز'], city: 'Gardez' },
  { province: 'خوست', aliases: ['خوست'], city: 'Khost' },
  { province: 'لوګر', aliases: ['لوګر', 'پل علم', 'پل‌علم'], city: 'Pul-e Alam' },
  { province: 'میدان وردګ', aliases: ['میدان وردګ', 'میدان وردک', 'میدان ښار'], city: 'Maidan Shar' },
  { province: 'غزني', aliases: ['غزني'], city: 'Ghazni' },
  { province: 'پروان', aliases: ['پروان', 'چاریکار', 'چاریکا'], city: 'Charikar' },
  { province: 'کاپیسا', aliases: ['کاپیسا', 'محمود راقي', 'محمودراقي'], city: 'Mahmud-i-Raqi' },
  { province: 'پنجشیر', aliases: ['پنجشیر', 'بازارک'], city: 'Bazarak' },
  { province: 'لغمان', aliases: ['لغمان', 'مهترلام'], city: 'Mehtarlam' },
  { province: 'کونړ', aliases: ['کونړ', 'کنړ', 'اسعد اباد', 'اسعدآباد'], city: 'Asadabad' },
  { province: 'نورستان', aliases: ['نورستان', 'پارون'], city: 'Parun' },
  { province: 'فراه', aliases: ['فراه'], city: 'Farah' },
  { province: 'نیمروز', aliases: ['نیمروز', 'زرنج'], city: 'Zaranj' },
  { province: 'هلمند', aliases: ['هلمند', 'لښکرګاه'], city: 'Lashkar Gah' },
];

const WEATHER_INTENT_RE = /(?:\bweather\b|\bforecast\b|\btemperature\b|\bhumidity\b|\bwind\b|\brain\b|\bsnow\b|آب\s*و\s*هوا|پیش[‌ ]?بینی\s*هوا|دمای|بارندگی|باران|برف|رطوبت|سرعت\s*باد|د\s*هوا|هوا\s*(?:حالت|احوال|څنګه|به|اوس|نن|سبا)|ورښت|واوره|تودوخه|یخني|توپان|باد)/iu;
const WEATHER_DETAIL_RE = /(?:باران|ورښت|واوره|snow|rain|ساعت|hourly|باد|wind|تودوخه|temperature|درجه|humidity|رطوبت|سبا|نن|forecast|پیش[‌ ]?بینی|اوسنی|اوسنۍ)/iu;

function normalizeWeatherText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[يى]/gu, 'ی')
    .replace(/ك/gu, 'ک')
    .replace(/[ۀة]/gu, 'ه')
    .replace(/[\u200c\u200e\u200f]/gu, ' ')
    .replace(/[،,:؛؟?!]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase();
}

function isWeatherQuestion(question) {
  const value = normalizeWeatherText(question);
  if (!value || !WEATHER_INTENT_RE.test(value)) return false;
  if (/(?:ککړتیا|ککړتيا|آلودگی|pollution|air quality)/iu.test(value) && !WEATHER_DETAIL_RE.test(value)) {
    return false;
  }
  return true;
}

function findProvince(value) {
  const normalized = normalizeWeatherText(value);
  const candidates = PROVINCES.flatMap((item) =>
    item.aliases.map((alias) => ({ ...item, alias }))
  ).sort((a, b) => b.alias.length - a.alias.length);

  return candidates.find((item) => normalized.includes(normalizeWeatherText(item.alias))) || null;
}

function extractDistrict(value) {
  const normalized = normalizeWeatherText(value);
  const match = normalized.match(/(?:^|\s)(?:د\s+)?([\p{L}\p{M}][\p{L}\p{M}\s-]{1,45}?)\s+ولسوال(?:ۍ|ي|ی)(?=\s|$)/iu);
  if (!match) return '';

  let district = String(match[1] || '').trim();
  const province = findProvince(normalized);
  if (province) {
    const provincePosition = district.lastIndexOf(normalizeWeatherText(province.alias));
    if (provincePosition >= 0) {
      district = district.slice(provincePosition + normalizeWeatherText(province.alias).length);
    }
  }

  return district.replace(/^(?:د|په)\s+/u, '').trim();
}

function extractLoosePlace(value) {
  const normalized = normalizeWeatherText(value);
  const patterns = [
    /(?:په|د)\s+([\p{L}\p{M}][\p{L}\p{M}\s-]{1,55}?)\s+(?:کې|د\s*هوا|هوا|ولایت|ښار)/iu,
    /(?:weather|forecast|temperature)\s+(?:in|for)\s+([a-z][a-z\s-]{1,55})/iu,
    /(?:هوا|باران|ورښت|واوره)\s+(?:په|د)\s+([\p{L}\p{M}][\p{L}\p{M}\s-]{1,55}?)(?:\s+کې|$)/iu,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = String(match?.[1] || '').trim()
      .replace(/^(?:د|په)\s+/u, '')
      .replace(/\s+(?:ولایت|ښار)$/u, '')
      .trim();
    if (candidate && candidate.length >= 2) return candidate;
  }

  return '';
}

function resolveLocationQuery(question) {
  const value = normalizeWeatherText(question);
  const province = findProvince(value);
  const district = extractDistrict(value);

  if (district) {
    return {
      query: district + ', ' + (province?.province || 'Afghanistan'),
      displayHint: district + ' ولسوالي' + (province ? '، د ' + province.province + ' ولایت' : ''),
      province,
    };
  }

  if (province) {
    return {
      query: province.city + ', Afghanistan',
      displayHint: province.province + ' ولایت',
      province,
    };
  }

  const loosePlace = extractLoosePlace(question);
  if (!loosePlace || /^(?:افغانستان|afghanistan|افغانستان هېواد)$/iu.test(loosePlace)) {
    return null;
  }

  return {
    query: loosePlace + ', Afghanistan',
    displayHint: loosePlace,
    province: null,
  };
}

function formatNumber(value, decimals = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(decimals) : '—';
}

function getWeatherDescription(code) {
  const key = Number(code);
  return Object.prototype.hasOwnProperty.call(WEATHER_CODE_TEXT, key)
    ? WEATHER_CODE_TEXT[key]
    : 'د هوا حالت معلوم نه دی';
}

function getWindDirection(degrees) {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return 'نامعلوم';
  const directions = ['شمال', 'شمال ختیځ', 'ختیځ', 'سوېل ختیځ', 'سوېل', 'سوېل لوېدیځ', 'لوېدیځ', 'شمال لوېدیځ'];
  return directions[Math.round((((value % 360) + 360) % 360) / 45) % 8];
}

function formatLocalDay(dateValue) {
  const date = new Date(String(dateValue || '').slice(0, 10) + 'T12:00:00Z');
  if (Number.isNaN(date.getTime())) return String(dateValue || '');
  try {
    return new Intl.DateTimeFormat('ps-AF', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
  }
}

function formatLocalTime(dateValue) {
  const match = String(dateValue || '').match(/T(\d{2}:\d{2})/u);
  return match ? match[1] : '—';
}

function requestedForecastDays(question) {
  const value = normalizeWeatherText(question);
  const numeric = value.match(/(?:^|\s)([2-7])\s*(?:ورځ|ورځې|ورځو|days?)(?:\s|$)/iu);
  if (numeric) return Number(numeric[1]);
  const words = [
    { pattern: /(?:درې|دری)\s*(?:ورځ|ورځې|ورځو)/iu, days: 3 },
    { pattern: /(?:پنځه)\s*(?:ورځ|ورځې|ورځو)/iu, days: 5 },
    { pattern: /(?:اووه|اوه)\s*(?:ورځ|ورځې|ورځو)|(?:یوه)\s*(?:اوونۍ|اونۍ)|(?:week|weekly)/iu, days: 7 },
  ];
  const match = words.find((item) => item.pattern.test(value));
  if (match) return match.days;
  if (/(?:سبا|tomorrow)/iu.test(value) && !/(?:راتلونک|forecast|پیش[‌ ]?بینی)/iu.test(value)) return 2;
  return 5;
}

function makeWeatherReply(location, forecast, question) {
  const current = forecast?.current || {};
  const daily = forecast?.daily || {};
  const hourly = forecast?.hourly || {};
  const timezone = forecast?.timezone || location.timezone || 'Asia/Kabul';
  const locationName = [
    location.displayHint || location.name,
    location.admin1 && location.admin1 !== location.name ? location.admin1 : '',
    'افغانستان',
  ].filter(Boolean).join('، ');

  const currentTime = String(current.time || '');
  const lines = [
    '🌦️ *د ' + locationName + ' د هوا معلومات*',
    '🕒 د راپور محلي وخت: ' + (currentTime.replace('T', ' ') || 'نامعلوم') + ' (' + timezone + ')',
    '',
    '*اوسنی اټکلي حالت:* ' + getWeatherDescription(current.weather_code),
    '🌡️ تودوخه: ' + formatNumber(current.temperature_2m) + '°C؛ د احساس تودوخه: ' + formatNumber(current.apparent_temperature) + '°C',
    '💧 نسبي رطوبت: ' + formatNumber(current.relative_humidity_2m) + '%؛ ورښت: ' + formatNumber(current.precipitation, 1) + ' mm',
    '💨 باد: ' + formatNumber(current.wind_speed_10m) + ' km/h، له ' + getWindDirection(current.wind_direction_10m) + ' لوري؛ د باد تېزه څپه: ' + formatNumber(current.wind_gusts_10m) + ' km/h',
    '☁️ وريځې: ' + formatNumber(current.cloud_cover) + '%؛ د هوا فشار: ' + formatNumber(current.pressure_msl) + ' hPa',
    '',
    '*د راتلونکو ورځو وړاندوینه:*',
  ];

  const dates = Array.isArray(daily.time) ? daily.time : [];
  for (let index = 0; index < dates.length; index += 1) {
    const code = daily.weather_code?.[index];
    const min = daily.temperature_2m_min?.[index];
    const max = daily.temperature_2m_max?.[index];
    const rain = daily.precipitation_sum?.[index];
    const rainProbability = daily.precipitation_probability_max?.[index];
    const wind = daily.wind_speed_10m_max?.[index];
    const sunrise = daily.sunrise?.[index];
    const sunset = daily.sunset?.[index];

    let line = '• ' + formatLocalDay(dates[index]) + ': ' + getWeatherDescription(code) +
      '؛ تودوخه ' + formatNumber(min) + ' تر ' + formatNumber(max) + '°C';
    if (Number.isFinite(Number(rain))) line += '؛ ورښت ' + formatNumber(rain, 1) + ' mm';
    if (Number.isFinite(Number(rainProbability))) line += '؛ د ورښت احتمال ' + formatNumber(rainProbability) + '%';
    if (Number.isFinite(Number(wind))) line += '؛ تر ټولو چټک باد ' + formatNumber(wind) + ' km/h';
    if (sunrise && sunset) line += '؛ لمر خاته ' + formatLocalTime(sunrise) + '، لمر لوېدل ' + formatLocalTime(sunset);
    lines.push(line);
  }

  const asksHourly = /(?:ساعت\s*په\s*ساعت|هر\s*ساعت|hourly|باران\s*کله|ورښت\s*کله|په\s*کوم\s*وخت)/iu.test(question);
  const hours = Array.isArray(hourly.time) ? hourly.time : [];
  if (asksHourly && hours.length) {
    lines.push('', '*د راتلونکو ساعتونو لنډ جزیات:*');
    const currentTimestamp = Date.parse(current.time || '');
    const periods = [];
    for (let index = 0; index < hours.length && periods.length < 6; index += 1) {
      const timestamp = Date.parse(hours[index]);
      if (Number.isFinite(currentTimestamp) && Number.isFinite(timestamp) && timestamp < currentTimestamp) continue;
      const probability = hourly.precipitation_probability?.[index];
      const precipitation = hourly.precipitation?.[index];
      if (Number(probability) >= 30 || Number(precipitation) >= 0.2) {
        periods.push('• ' + formatLocalTime(hours[index]) + ' بجې: ' +
          getWeatherDescription(hourly.weather_code?.[index]) + '؛ تودوخه ' +
          formatNumber(hourly.temperature_2m?.[index]) + '°C؛ د ورښت احتمال ' +
          formatNumber(probability) + '%');
      }
    }
    lines.push(...(periods.length ? periods : ['• په راتلونکو ساعتونو کې د پام وړ باران یا واورې څرګنده نښه په دې وړاندوینه کې نه ښکاري.']));
  }

  lines.push(
    '',
    '⚠️ دا د هوايي ماډلونو وړاندوینه ده، نه د هرې ولسوالۍ د هوايي سټېشن مستقیمه اندازه؛ په غرنیو سیمو کې توپیر راتلای شي. د خطر رسمي خبرتیاوې له سیمه‌ییزو چارواکو هم تایید کړئ.',
    ATTRIBUTION
  );

  return lines.join('\n');
}

function createWeatherService(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const geocodingCache = new Map();
  const forecastCache = new Map();

  if (typeof fetchImpl !== 'function') {
    throw new TypeError('createWeatherService requires a fetch implementation');
  }

  async function fetchJson(url) {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });

    if (!response || !response.ok) {
      const error = new Error('Weather service returned HTTP ' + (response?.status || 'unknown'));
      error.code = 'WEATHER_HTTP_ERROR';
      throw error;
    }

    const data = await response.json();
    if (data?.error) {
      const error = new Error(String(data.reason || 'Weather service rejected the request'));
      error.code = 'WEATHER_API_ERROR';
      throw error;
    }

    return data;
  }

  async function geocode(locationQuery) {
    const cacheKey = normalizeWeatherText(locationQuery);
    const cached = geocodingCache.get(cacheKey);
    if (cached && now() - cached.savedAt < 24 * 60 * 60 * 1000) return cached.value;

    const url = new URL(OPEN_METEO_GEOCODING_URL);
    url.searchParams.set('name', locationQuery);
    url.searchParams.set('count', '8');
    url.searchParams.set('countryCode', 'AF');
    url.searchParams.set('language', 'ps');

    const data = await fetchJson(url.toString());
    const results = Array.isArray(data.results) ? data.results : [];
    const afghanResults = results.filter((item) => String(item.country_code || '').toUpperCase() === 'AF');

    if (!afghanResults.length) return null;

    const resolved = afghanResults[0];
    const value = {
      name: String(resolved.name || locationQuery),
      latitude: Number(resolved.latitude),
      longitude: Number(resolved.longitude),
      admin1: String(resolved.admin1 || ''),
      country: String(resolved.country || 'Afghanistan'),
      timezone: String(resolved.timezone || 'Asia/Kabul'),
    };

    if (!Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) return null;
    geocodingCache.set(cacheKey, { value, savedAt: now() });
    return value;
  }

  async function getForecast(location, days) {
    const cacheKey = [
      location.latitude.toFixed(4),
      location.longitude.toFixed(4),
      days,
    ].join(':');
    const cached = forecastCache.get(cacheKey);
    if (cached && now() - cached.savedAt < 5 * 60 * 1000) return cached.value;

    const url = new URL(OPEN_METEO_FORECAST_URL);
    url.searchParams.set('latitude', String(location.latitude));
    url.searchParams.set('longitude', String(location.longitude));
    url.searchParams.set('current', [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'cloud_cover',
      'pressure_msl',
    ].join(','));
    url.searchParams.set('hourly', [
      'temperature_2m',
      'precipitation_probability',
      'precipitation',
      'weather_code',
    ].join(','));
    url.searchParams.set('forecast_hours', '24');
    url.searchParams.set('daily', [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'sunrise',
      'sunset',
    ].join(','));
    url.searchParams.set('forecast_days', String(days));
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('temperature_unit', 'celsius');
    url.searchParams.set('wind_speed_unit', 'kmh');
    url.searchParams.set('precipitation_unit', 'mm');
    url.searchParams.set('cell_selection', 'land');

    const data = await fetchJson(url.toString());
    if (!data?.current || !Array.isArray(data?.daily?.time)) {
      const error = new Error('Weather service returned an incomplete forecast');
      error.code = 'WEATHER_DATA_INCOMPLETE';
      throw error;
    }

    forecastCache.set(cacheKey, { value: data, savedAt: now() });
    return data;
  }

  return async function getWeatherAnswer(question) {
    if (!isWeatherQuestion(question)) return null;

    const resolvedLocation = resolveLocationQuery(question);
    if (!resolvedLocation) {
      return '🌦️ د افغانستان د هوا پوښتنه د یوه مشخص ولایت، ښار یا ولسوالۍ نوم ته اړتیا لري. د بېلګې په توګه: «د زابل د شاه‌جوی ولسوالۍ د درې ورځو هوا»، «د کابل د نن ورځې هوا» یا «په هرات کې سبا باران کېږي؟».';
    }

    const place = await geocode(resolvedLocation.query);
    if (!place) {
      return '⚠️ د «' + resolvedLocation.displayHint + '» ځای مې د افغانستان په جغرافیایي لېست کې په ډاډه توګه ونه موند. مهرباني وکړئ د ولایت او ولسوالۍ نوم په روښانه ډول ولیکئ؛ ناسم ځای ته د هوا وړاندوینه نه وړاندې کوم.';
    }

    const forecast = await getForecast(place, requestedForecastDays(question));
    return makeWeatherReply({
      ...place,
      displayHint: resolvedLocation.displayHint,
    }, forecast, question);
  };
}

module.exports = {
  createWeatherService,
  isWeatherQuestion,
  resolveLocationQuery,
  requestedForecastDays,
  getWeatherDescription,
};
