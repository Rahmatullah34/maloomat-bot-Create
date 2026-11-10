'use strict';

const DISTRICT_REFERENCE = require('./afghanistan-districts.json');
const DISTRICTS = Array.isArray(DISTRICT_REFERENCE.districts) ? DISTRICT_REFERENCE.districts : [];

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

const WEATHER_INTENT_RE = /(?:\bweather\b|\bforecast\b|\btemperature\b|\bhumidity\b|\bwind\b|\brain\b|\bsnow\b|آب\s*و\s*هوا|پیش[‌ ]?بینی\s*هوا|دمای|بارندگی|باران|برف|رطوبت|سرعت\s*باد|د\s*هوا|(?:^|\s)هوا(?:\s|$)|هوا\s*(?:حالت|احوال|څنګه|به|اوس|نن|سبا)|ورښت|واوره|تودوخه|یخني|توپان|باد)/iu;
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

  const localMatch = candidates.find((item) =>
    normalized.includes(normalizeWeatherText(item.alias))
  );
  if (localMatch) return localMatch;

  // د انګلیسي/لاتیني ولایت نومونه هم د ولسوالیو له دوه‌ژبيز لېست څخه پېژندل کېږي.
  const englishProvinceNames = [...new Set(DISTRICTS.map((item) => item.provinceEn).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  const englishMatch = englishProvinceNames.find((name) =>
    normalized.includes(normalizeWeatherText(name))
  );
  if (!englishMatch) return null;

  const districtRecord = DISTRICTS.find((item) =>
    normalizeWeatherText(item.provinceEn) === normalizeWeatherText(englishMatch)
  );
  if (!districtRecord) return null;

  const localProvince = PROVINCES.find((item) =>
    normalizeWeatherText(item.province) === normalizeWeatherText(districtRecord.provinceLocal)
  );
  return localProvince
    ? { ...localProvince, alias: englishMatch }
    : {
        province: districtRecord.provinceLocal,
        aliases: [districtRecord.provinceEn],
        alias: englishMatch,
        city: districtRecord.provinceEn,
      };
}

function findDistrictCandidates(value) {
  const normalized = normalizeWeatherText(value);
  const markerIndex = normalized.search(/\s+ولسوال(?:ۍ|ي|ی)/u);
  const searchContext = markerIndex >= 0 ? normalized.slice(0, markerIndex) : normalized;

  return [...new Map(DISTRICTS.filter((item) => {
    const aliases = [item.nameLocal, item.nameEn]
      .map(normalizeWeatherText)
      .filter((alias) => alias.length >= 2);
    return aliases.some((alias) => searchContext.includes(alias));
  }).map((item) => [item.id, item])).values()];
}

function findDistrictRecord(value, province = null) {
  const candidates = findDistrictCandidates(value);
  const scoped = province
    ? candidates.filter((item) =>
        normalizeWeatherText(item.provinceLocal) === normalizeWeatherText(province.province) ||
        normalizeWeatherText(item.provinceEn) === normalizeWeatherText(province.alias)
      )
    : candidates;

  return scoped.length === 1 ? scoped[0] : null;
}

function extractDistrict(value) {
  const normalized = normalizeWeatherText(value);
  const match = normalized.match(/(?:^|\s)(?:د\s+)?([\p{L}\p{M}][\p{L}\p{M}\s-]{1,45}?)\s+ولسوال(?:ۍ|ي|ی)(?=\s|$)/iu);
  if (!match) return '';

  let district = String(match[1] || '').trim();
  const province = findProvince(normalized);
  if (province) {
    const provinceAlias = normalizeWeatherText(province.alias);
    const provincePosition = district.lastIndexOf(provinceAlias);
    if (provincePosition >= 0) {
      district = district.slice(provincePosition + provinceAlias.length);
    }
  }

  return district.split(/\s+/u).filter((word) => word !== 'د' && word !== 'په').join(' ').trim();
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
  const districtCandidates = findDistrictCandidates(value);
  const matchedDistrict = findDistrictRecord(value, province);
  const hasDistrictMarker = /(?:^|\\s)ولسوال(?:ۍ|ي|ی)(?:\\s|$)/u.test(value);
  // که د ځای نوم د ولایت له نوم سره یو شان وي او کارن «ولسوالۍ» نه وي ویلی،
  // د ولایت مرکز وکاروه، نه د هم‌نومې ولسوالۍ نقطه.
  const districtRecord = matchedDistrict && (
    hasDistrictMarker ||
    !province ||
    normalizeWeatherText(matchedDistrict.nameLocal) !== normalizeWeatherText(province.province)
  ) ? matchedDistrict : null;

  if (districtRecord) {
    return {
      query: districtRecord.nameLocal + ', ' + districtRecord.provinceLocal,
      displayHint: districtRecord.nameLocal + ' ولسوالي، د ' + districtRecord.provinceLocal + ' ولایت',
      latitude: districtRecord.latitude,
      longitude: districtRecord.longitude,
      admin1: districtRecord.provinceLocal,
      timezone: 'Asia/Kabul',
      districtId: districtRecord.id,
      locationSource: 'Afghanistan Administrative Divisions Dataset',
      province,
    };
  }

  const district = extractDistrict(value);
  if (!province && districtCandidates.length > 1) {
    return { needsProvince: true, displayHint: districtCandidates[0].nameLocal + ' ولسوالي' };
  }
  if (district && !province) {
    return {
      needsProvince: true,
      displayHint: district + ' ولسوالي',
    };
  }

  if (district) {
    return {
      query: district + ', ' + province.province,
      displayHint: district + ' ولسوالي، د ' + province.province + ' ولایت',
      province,
      isDistrict: true,
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

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function formatNumber(value, decimals = 0) {
  if (!hasNumericValue(value)) return '—';
  return Number(value).toFixed(decimals);
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
    { pattern: /(?:اووه|اوه)\s*(?:ورځ|ورځې|ورځو)|(?:اوونۍ|اونۍ)|(?:week|weekly)/iu, days: 7 },
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
  const hourlyTimes = Array.isArray(hourly.time) ? hourly.time : [];
  let currentHourIndex = hourlyTimes.findIndex((time) => String(time) === String(current.time || ''));
  if (currentHourIndex < 0 && current.time) {
    const currentTimestamp = Date.parse(current.time);
    let closestDifference = Infinity;
    for (let index = 0; index < hourlyTimes.length; index += 1) {
      const timestamp = Date.parse(hourlyTimes[index]);
      const difference = Math.abs(timestamp - currentTimestamp);
      if (Number.isFinite(difference) && difference < closestDifference) {
        closestDifference = difference;
        currentHourIndex = index;
      }
    }
    if (closestDifference > 90 * 60 * 1000) currentHourIndex = -1;
  }
  const currentDewPoint = currentHourIndex >= 0 ? hourly.dew_point_2m?.[currentHourIndex] : null;
  const currentVisibility = currentHourIndex >= 0 ? hourly.visibility?.[currentHourIndex] : null;
  const currentUvIndex = currentHourIndex >= 0 ? hourly.uv_index?.[currentHourIndex] : null;
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
    '*اوسنی اټکلي حالت:* ' + getWeatherDescription(current.weather_code) + (Number(current.is_day) === 1 ? ' (ورځ)' : Number(current.is_day) === 0 ? ' (شپه)' : ''),
    '🌡️ تودوخه: ' + formatNumber(current.temperature_2m) + '°C؛ د احساس تودوخه: ' + formatNumber(current.apparent_temperature) + '°C؛ د شبنم ټکی: ' + formatNumber(currentDewPoint) + '°C',
    '💧 نسبي رطوبت: ' + formatNumber(current.relative_humidity_2m) + '%؛ ټول ورښت: ' + formatNumber(current.precipitation, 1) + ' mm (باران ' + formatNumber(current.rain, 1) + ' mm، لنډمهالی ورښت ' + formatNumber(current.showers, 1) + ' mm، واوره ' + formatNumber(current.snowfall, 1) + ' cm)',
    '💨 باد: ' + formatNumber(current.wind_speed_10m) + ' km/h، له ' + getWindDirection(current.wind_direction_10m) + ' لوري؛ د باد تېزه څپه: ' + formatNumber(current.wind_gusts_10m) + ' km/h',
    '☁️ وريځې: ' + formatNumber(current.cloud_cover) + '%؛ د هوا فشار: ' + formatNumber(current.pressure_msl) + ' hPa؛ لید: ' + (hasNumericValue(currentVisibility) ? formatNumber(Number(currentVisibility) / 1000, 1) + ' km' : '—') + '؛ د UV شاخص: ' + formatNumber(currentUvIndex, 1),
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
    const gusts = daily.wind_gusts_10m_max?.[index];
    const windDirection = daily.wind_direction_10m_dominant?.[index];
    const rainAmount = daily.rain_sum?.[index];
    const showersAmount = daily.showers_sum?.[index];
    const snowfallAmount = daily.snowfall_sum?.[index];
    const rainHours = daily.precipitation_hours?.[index];
    const uvMaximum = daily.uv_index_max?.[index];
    const sunshine = daily.sunshine_duration?.[index];
    const daylight = daily.daylight_duration?.[index];
    const sunrise = daily.sunrise?.[index];
    const sunset = daily.sunset?.[index];

    let line = '• ' + formatLocalDay(dates[index]) + ': ' + getWeatherDescription(code) +
      '؛ تودوخه ' + formatNumber(min) + ' تر ' + formatNumber(max) + '°C';
    if (hasNumericValue(rain)) line += '؛ ټول ورښت ' + formatNumber(rain, 1) + ' mm';
    if (hasNumericValue(rainAmount)) line += ' (باران ' + formatNumber(rainAmount, 1) + ' mm)';
    if (hasNumericValue(showersAmount)) line += '؛ لنډمهالی ورښت ' + formatNumber(showersAmount, 1) + ' mm';
    if (hasNumericValue(snowfallAmount)) line += '؛ واوره ' + formatNumber(snowfallAmount, 1) + ' cm';
    if (hasNumericValue(rainProbability)) line += '؛ د ورښت احتمال ' + formatNumber(rainProbability) + '%';
    if (hasNumericValue(rainHours)) line += '؛ د ورښت ساعتونه ' + formatNumber(rainHours, 1);
    if (hasNumericValue(wind)) line += '؛ باد ' + formatNumber(wind) + ' km/h';
    if (hasNumericValue(gusts)) line += '؛ تېزې څپې ' + formatNumber(gusts) + ' km/h';
    if (hasNumericValue(windDirection)) line += '؛ غالب لوری ' + getWindDirection(windDirection);
    if (hasNumericValue(uvMaximum)) line += '؛ د UV اعظمي شاخص ' + formatNumber(uvMaximum, 1);
    if (hasNumericValue(sunshine)) line += '؛ لمرینه رڼا ' + formatNumber(sunshine / 3600, 1) + ' ساعته';
    if (hasNumericValue(daylight)) line += '؛ د ورځې اوږدوالی ' + formatNumber(daylight / 3600, 1) + ' ساعته';
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

    const queryParts = String(locationQuery).split(',').map((part) => normalizeWeatherText(part.trim()));
    const requestedName = queryParts[0] || '';
    const requestedAdmin = queryParts[1] || '';
    const ranked = afghanResults.map((item) => {
      const itemName = normalizeWeatherText(item.name || '');
      const itemAdmin = normalizeWeatherText(item.admin1 || '');
      const nameScore = itemName === requestedName ? 4 : itemName.startsWith(requestedName) || requestedName.startsWith(itemName) ? 2 : 0;
      const adminScore = !requestedAdmin || itemAdmin === requestedAdmin ? 3 : itemAdmin.includes(requestedAdmin) || requestedAdmin.includes(itemAdmin) ? 1 : 0;
      return { item, score: nameScore + adminScore };
    }).sort((a, b) => b.score - a.score);
    if (requestedAdmin && ranked[0]?.score < 3) return null;

    const resolved = ranked[0].item;
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
      'rain',
      'showers',
      'snowfall',
      'weather_code',
      'is_day',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'cloud_cover',
      'pressure_msl',
    ].join(','));
    url.searchParams.set('hourly', [
      'temperature_2m',
      'dew_point_2m',
      'precipitation_probability',
      'precipitation',
      'rain',
      'showers',
      'snowfall',
      'weather_code',
      'visibility',
      'uv_index',
      'is_day',
    ].join(','));
    url.searchParams.set('forecast_hours', '24');
    url.searchParams.set('daily', [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'rain_sum',
      'showers_sum',
      'snowfall_sum',
      'precipitation_probability_max',
      'precipitation_hours',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'wind_direction_10m_dominant',
      'uv_index_max',
      'sunshine_duration',
      'daylight_duration',
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

    if (resolvedLocation.needsProvince) {
      return '📍 د «' + resolvedLocation.displayHint + '» لپاره د ولایت نوم هم ولیکئ؛ په افغانستان کې د یوه نوم ورته ولسوالۍ شته او بې له ولایته ناسم ځای نه ټاکم.';
    }

    const place = Number.isFinite(resolvedLocation.latitude) && Number.isFinite(resolvedLocation.longitude)
      ? {
          name: resolvedLocation.displayHint,
          latitude: resolvedLocation.latitude,
          longitude: resolvedLocation.longitude,
          admin1: resolvedLocation.admin1 || '',
          timezone: resolvedLocation.timezone || 'Asia/Kabul',
          locationSource: resolvedLocation.locationSource || '',
        }
      : await geocode(resolvedLocation.query);
    if (!place) {
      return '⚠️ د «' + resolvedLocation.displayHint + '» ځای مې په افغانستان کې د جغرافیایي لېست له مخې په ډاډه توګه ونه موند. مهرباني وکړئ د ولایت او ولسوالۍ نوم په روښانه ډول ولیکئ؛ ناسم ځای ته د هوا وړاندوینه نه وړاندې کوم.';
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
