// 🗺️ Where a story happens: place names found in headlines and summaries (case-sensitive, whole words).
// Countries use ISO codes so their names show in your language; cities keep their English names.
// Off-planet spots (the Moon, Mars, orbit, deep space) get their own row under the map.
const C = (cc, lat, lon, words) => ({ id: cc, cc, lat, lon, re: words });
const T = (id, name, cc, lat, lon, words) => ({ id, name, cc, lat, lon, re: words });

export const PLACES = [
  // ---- cities and regions (checked first; they win over their country) ----
  T('valley', 'Silicon Valley', 'US', 37.4, -122.1, 'Silicon Valley|San Francisco|Bay Area|Palo Alto|Mountain View|Cupertino|Menlo Park|San Jose'),
  T('seattle', 'Seattle', 'US', 47.6, -122.3, 'Seattle|Redmond'),
  T('nyc', 'New York', 'US', 40.7, -74.0, 'New York|NYC|Manhattan|Brooklyn|Wall Street'),
  T('la', 'Los Angeles', 'US', 34.05, -118.25, 'Los Angeles|Hollywood'),
  T('texas', 'Texas', 'US', 30.3, -97.7, 'Texas|Austin|Houston|Dallas|Starbase'),
  T('boston', 'Boston', 'US', 42.36, -71.06, 'Boston|MIT|Harvard'),
  T('dc', 'Washington, D.C.', 'US', 38.9, -77.04, 'Washington,? D\\.?C\\.?|White House|Congress|Senate|Pentagon|FTC|FCC|Supreme Court|Capitol Hill'),
  T('florida', 'Florida', 'US', 28.4, -80.6, 'Florida|Cape Canaveral|Kennedy Space Center|Miami'),
  T('chicago', 'Chicago', 'US', 41.88, -87.63, 'Chicago'),
  T('cali', 'California', 'US', 36.8, -119.4, 'California|Californian'),
  T('london', 'London', 'GB', 51.5, -0.13, 'London'),
  T('paris', 'Paris', 'FR', 48.86, 2.35, 'Paris'),
  T('berlin', 'Berlin', 'DE', 52.52, 13.4, 'Berlin'),
  T('munich', 'Munich', 'DE', 48.14, 11.58, 'Munich|München'),
  T('amsterdam', 'Amsterdam', 'NL', 52.37, 4.9, 'Amsterdam'),
  T('stockholm', 'Stockholm', 'SE', 59.33, 18.07, 'Stockholm'),
  T('dublin', 'Dublin', 'IE', 53.35, -6.26, 'Dublin'),
  T('geneva', 'Geneva', 'CH', 46.2, 6.15, 'Geneva|CERN'),
  T('zurich', 'Zurich', 'CH', 47.37, 8.54, 'Zurich|Zürich'),
  T('moscow', 'Moscow', 'RU', 55.75, 37.62, 'Moscow|Kremlin'),
  T('kyiv', 'Kyiv', 'UA', 50.45, 30.52, 'Kyiv|Kiev'),
  T('telaviv', 'Tel Aviv', 'IL', 32.08, 34.78, 'Tel Aviv'),
  T('cairo', 'Cairo', 'EG', 30.04, 31.24, 'Cairo|Giza'),
  T('dubai', 'Dubai', 'AE', 25.2, 55.27, 'Dubai|Abu Dhabi'),
  T('riyadh', 'Riyadh', 'SA', 24.71, 46.68, 'Riyadh|NEOM'),
  T('lagos', 'Lagos', 'NG', 6.52, 3.38, 'Lagos'),
  T('nairobi', 'Nairobi', 'KE', -1.29, 36.82, 'Nairobi'),
  T('capetown', 'Cape Town', 'ZA', -33.92, 18.42, 'Cape Town'),
  T('beijing', 'Beijing', 'CN', 39.9, 116.4, 'Beijing'),
  T('shanghai', 'Shanghai', 'CN', 31.23, 121.47, 'Shanghai'),
  T('shenzhen', 'Shenzhen', 'CN', 22.54, 114.06, 'Shenzhen'),
  T('hongkong', 'Hong Kong', 'HK', 22.32, 114.17, 'Hong Kong'),
  T('tokyo', 'Tokyo', 'JP', 35.68, 139.69, 'Tokyo'),
  T('osaka', 'Osaka', 'JP', 34.69, 135.5, 'Osaka|Kyoto'),
  T('seoul', 'Seoul', 'KR', 37.57, 126.98, 'Seoul'),
  T('bengaluru', 'Bengaluru', 'IN', 12.97, 77.59, 'Bengaluru|Bangalore'),
  T('mumbai', 'Mumbai', 'IN', 19.08, 72.88, 'Mumbai'),
  T('delhi', 'Delhi', 'IN', 28.61, 77.21, 'New Delhi|Delhi'),
  T('taipei', 'Taipei', 'TW', 25.03, 121.57, 'Taipei|Hsinchu'),
  T('manila', 'Manila', 'PH', 14.6, 120.98, 'Manila|Quezon City|Cebu'),
  T('jakarta', 'Jakarta', 'ID', -6.2, 106.85, 'Jakarta'),
  T('sydney', 'Sydney', 'AU', -33.87, 151.21, 'Sydney'),
  T('melbourne', 'Melbourne', 'AU', -37.81, 144.96, 'Melbourne'),
  T('toronto', 'Toronto', 'CA', 43.65, -79.38, 'Toronto'),
  T('vancouver', 'Vancouver', 'CA', 49.28, -123.12, 'Vancouver'),
  T('montreal', 'Montreal', 'CA', 45.5, -73.57, 'Montreal|Montréal'),
  T('saopaulo', 'São Paulo', 'BR', -23.55, -46.63, 'São Paulo|Sao Paulo'),
  T('mexicocity', 'Mexico City', 'MX', 19.43, -99.13, 'Mexico City'),
  T('buenosaires', 'Buenos Aires', 'AR', -34.6, -58.38, 'Buenos Aires'),
  // ---- countries and unions ----
  C('EU', 50.85, 4.35, 'EU|European Union|European Commission|Europe|European|Brussels|GDPR'),
  C('US', 39.5, -98.35, 'US|U\\.S\\.|USA|United States|America|American|Americans|NASA'),
  C('GB', 54.0, -2.0, 'UK|U\\.K\\.|Britain|British|England|Scotland|Scottish|Wales|Welsh'),
  C('CN', 35.0, 105.0, 'China|Chinese'),
  C('JP', 36.2, 138.25, 'Japan|Japanese'),
  C('KP', 40.0, 127.0, 'North Korea|North Korean|Pyongyang'),
  C('KR', 36.5, 127.9, '(?<!North )Korea|(?<!North )Korean|South Korea|South Korean'),
  C('IN', 22.0, 79.0, 'India|Indian(?! Ocean)'),
  C('DE', 51.0, 10.0, 'Germany|German'),
  C('FR', 46.6, 2.4, 'France|French'),
  C('CA', 56.0, -106.0, 'Canada|Canadian'),
  C('AU', -25.0, 134.0, 'Australia|Australian'),
  C('BR', -10.0, -52.0, 'Brazil|Brazilian'),
  C('RU', 61.0, 96.0, 'Russia|Russian'),
  C('UA', 49.0, 32.0, 'Ukraine|Ukrainian'),
  C('IL', 31.4, 35.0, 'Israel|Israeli'),
  C('EG', 26.8, 30.8, 'Egypt|Egyptian'),
  C('SA', 24.0, 45.0, 'Saudi Arabia|Saudi'),
  C('AE', 24.0, 54.0, 'UAE|United Arab Emirates|Emirati'),
  C('QA', 25.3, 51.2, 'Qatar'),
  C('TR', 39.0, 35.0, 'Türkiye|Turkiye|Turkish|Istanbul|Ankara'),
  C('IR', 32.0, 53.0, 'Iran|Iranian|Tehran'),
  C('PK', 30.0, 70.0, 'Pakistan|Pakistani'),
  C('BD', 23.7, 90.4, 'Bangladesh'),
  C('NG', 9.0, 8.0, 'Nigeria|Nigerian'),
  C('KE', 0.2, 38.0, 'Kenya|Kenyan'),
  C('ZA', -29.0, 25.0, 'South Africa|South African'),
  C('ET', 9.0, 40.0, 'Ethiopia|Ethiopian'),
  C('GH', 7.9, -1.0, 'Ghana|Ghanaian'),
  C('MA', 31.8, -7.0, 'Morocco|Moroccan'),
  C('MX', 23.0, -102.0, '(?<!New )Mexico|Mexican'),
  C('AR', -34.0, -64.0, 'Argentina|Argentine|Argentinian'),
  C('CL', -35.0, -71.0, 'Chile|Chilean'),
  C('CO', 4.6, -74.0, 'Colombia|Colombian'),
  C('PE', -9.0, -75.0, 'Peru|Peruvian'),
  C('NL', 52.2, 5.3, 'Netherlands|Dutch|Holland'),
  C('BE', 50.6, 4.6, 'Belgium|Belgian'),
  C('SE', 62.0, 15.0, 'Sweden|Swedish'),
  C('NO', 61.0, 9.0, 'Norway|Norwegian'),
  C('FI', 64.0, 26.0, 'Finland|Finnish|Helsinki'),
  C('DK', 56.0, 10.0, 'Denmark|Danish|Copenhagen'),
  C('IS', 65.0, -18.0, 'Iceland|Icelandic'),
  C('ES', 40.0, -3.7, 'Spain|Spanish|Madrid|Barcelona'),
  C('PT', 39.5, -8.0, 'Portugal|Portuguese|Lisbon'),
  C('IT', 42.8, 12.5, 'Italy|Italian|Rome|Milan'),
  C('CH', 46.8, 8.2, 'Switzerland|Swiss'),
  C('AT', 47.5, 14.5, 'Austria|Austrian|Vienna'),
  C('PL', 52.0, 19.0, 'Poland|Warsaw'),
  C('CZ', 49.8, 15.5, 'Czechia|Czech|Prague'),
  C('RO', 46.0, 25.0, 'Romania|Romanian'),
  C('GR', 39.0, 22.0, 'Greece|Greek|Athens'),
  C('EE', 58.6, 25.0, 'Estonia|Estonian|Tallinn'),
  C('IE', 53.4, -8.0, 'Ireland|Irish'),
  C('SG', 1.35, 103.82, 'Singapore|Singaporean'),
  C('TW', 23.7, 121.0, 'Taiwan|Taiwanese|TSMC'),
  C('VN', 16.0, 107.0, 'Vietnam|Vietnamese'),
  C('TH', 15.0, 101.0, 'Thailand|Thai|Bangkok'),
  C('MY', 4.0, 102.0, 'Malaysia|Malaysian|Kuala Lumpur'),
  C('ID', -2.5, 118.0, 'Indonesia|Indonesian'),
  C('PH', 12.9, 122.0, 'Philippines|Philippine|Filipino'),
  C('NZ', -41.0, 174.0, 'New Zealand'),
];

// Not on the map at all 🚀
export const SPACE = [
  { id: 'moon', emoji: '🌙', name: 'The Moon', re: 'Moon|lunar|Lunar|Artemis' },
  { id: 'mars', emoji: '🔴', name: 'Mars', re: 'Mars|Martian' },
  { id: 'orbit', emoji: '🛰️', name: 'In orbit', re: 'ISS|International Space Station|space station|orbit|Orbit|orbital|Orbital|Starlink|Starship|satellite|satellites|Satellite' },
  { id: 'deep', emoji: '🪐', name: 'Deep space', re: 'Jupiter|Saturn|Venus|asteroid|Asteroid|comet|Comet|black hole|Black hole|galaxy|Galaxy|James Webb|exoplanet|Exoplanet' },
];

const compile = (list) => list.map((p) => ({ ...p, rx: new RegExp(`(?<![\\p{L}\\p{N}])(?:${p.re})(?![\\p{L}\\p{N}])`, 'u') }));
const PLACES_RX = compile(PLACES);
const SPACE_RX = compile(SPACE);

/** The places a story mentions (a city beats its own country, so "Tokyo, Japan" is just Tokyo). */
export function placesOf(text) {
  const s = String(text || '');
  const hits = PLACES_RX.filter((p) => p.rx.test(s));
  const cityCountries = new Set(hits.filter((p) => p.id !== p.cc).map((p) => p.cc));
  const earth = hits.filter((p) => p.id !== p.cc || !cityCountries.has(p.cc));
  const space = SPACE_RX.filter((p) => p.rx.test(s));
  return { earth, space };
}

/** A flag emoji from a country code (🇪🇺 works too). */
export const flag = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((ch) => 0x1f1a5 + ch.charCodeAt(0))) : '');
