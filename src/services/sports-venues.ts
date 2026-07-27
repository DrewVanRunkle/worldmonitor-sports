// Personal-use widget (VITE_ENABLE_SPORTS): best-effort static city → lat/lon
// lookup for plotting game venues on the Sports Venue Map. ESPN's venue data
// only gives city/state text, not coordinates, so this is a curated table
// covering the venue cities used by NFL/NBA/MLB/NHL/MLS/Premier League teams
// (including stadium-suburb names ESPN reports, e.g. "Foxborough" for the
// Patriots, not just the metro's headline city). Not exhaustive — a game
// whose venue city isn't in this table is simply skipped by the map panel.

interface Coords {
  lat: number;
  lon: number;
}

function key(city: string, state?: string): string {
  const c = city.trim().toLowerCase();
  return state ? `${c}|${state.trim().toLowerCase()}` : c;
}

// US/Canada entries keyed "city|state" (state as ESPN reports it — usually a
// 2-letter code). UK/Europe entries keyed by city alone (no state in ESPN's
// address for those venues).
const CITY_COORDS: Record<string, Coords> = {
  // NFL
  'glendale|az': { lat: 33.5387, lon: -112.2608 },
  'atlanta|ga': { lat: 33.7550, lon: -84.3900 },
  'baltimore|md': { lat: 39.2780, lon: -76.6227 },
  'orchard park|ny': { lat: 42.7738, lon: -78.7870 },
  'charlotte|nc': { lat: 35.2258, lon: -80.8528 },
  'chicago|il': { lat: 41.8623, lon: -87.6167 },
  'cincinnati|oh': { lat: 39.0955, lon: -84.5160 },
  'cleveland|oh': { lat: 41.5061, lon: -81.6995 },
  'arlington|tx': { lat: 32.7473, lon: -97.0945 },
  'denver|co': { lat: 39.7439, lon: -105.0201 },
  'detroit|mi': { lat: 42.3400, lon: -83.0456 },
  'green bay|wi': { lat: 44.5013, lon: -88.0622 },
  'houston|tx': { lat: 29.6847, lon: -95.4107 },
  'indianapolis|in': { lat: 39.7601, lon: -86.1639 },
  'jacksonville|fl': { lat: 30.3239, lon: -81.6373 },
  'kansas city|mo': { lat: 39.0489, lon: -94.4839 },
  'las vegas|nv': { lat: 36.0909, lon: -115.1833 },
  'inglewood|ca': { lat: 33.9535, lon: -118.3392 },
  'miami gardens|fl': { lat: 25.9580, lon: -80.2389 },
  'minneapolis|mn': { lat: 44.9738, lon: -93.2581 },
  'foxborough|ma': { lat: 42.0909, lon: -71.2643 },
  'new orleans|la': { lat: 29.9509, lon: -90.0815 },
  'east rutherford|nj': { lat: 40.8135, lon: -74.0745 },
  'philadelphia|pa': { lat: 39.9008, lon: -75.1675 },
  'pittsburgh|pa': { lat: 40.4468, lon: -80.0158 },
  'santa clara|ca': { lat: 37.4032, lon: -121.9698 },
  'seattle|wa': { lat: 47.5952, lon: -122.3316 },
  'tampa|fl': { lat: 27.9759, lon: -82.5033 },
  'nashville|tn': { lat: 36.1665, lon: -86.7713 },
  'landover|md': { lat: 38.9077, lon: -76.8645 },

  // NBA / MLB additions not already covered above
  'boston|ma': { lat: 42.3662, lon: -71.0621 },
  'brooklyn|ny': { lat: 40.6826, lon: -73.9754 },
  'new york|ny': { lat: 40.7505, lon: -73.9934 },
  'dallas|tx': { lat: 32.7905, lon: -96.8103 },
  'san francisco|ca': { lat: 37.7680, lon: -122.3877 },
  'los angeles|ca': { lat: 34.0430, lon: -118.2673 },
  'memphis|tn': { lat: 35.1382, lon: -90.0505 },
  'miami|fl': { lat: 25.7814, lon: -80.1870 },
  'milwaukee|wi': { lat: 43.0451, lon: -87.9172 },
  'oklahoma city|ok': { lat: 35.4634, lon: -97.5151 },
  'orlando|fl': { lat: 28.5392, lon: -81.3839 },
  'phoenix|az': { lat: 33.4457, lon: -112.0712 },
  'portland|or': { lat: 45.5316, lon: -122.6668 },
  'sacramento|ca': { lat: 38.5802, lon: -121.4997 },
  'san antonio|tx': { lat: 29.4269, lon: -98.4375 },
  'salt lake city|ut': { lat: 40.7683, lon: -111.9011 },
  'washington|dc': { lat: 38.8981, lon: -77.0209 },
  'san diego|ca': { lat: 32.7073, lon: -117.1566 },
  'st. louis|mo': { lat: 38.6226, lon: -90.1928 },
  'saint louis|mo': { lat: 38.6226, lon: -90.1928 },
  'toronto|on': { lat: 43.6414, lon: -79.3894 },

  // NHL additions
  'anaheim|ca': { lat: 33.8078, lon: -117.8765 },
  'buffalo|ny': { lat: 42.8750, lon: -78.8765 },
  'calgary|ab': { lat: 51.0374, lon: -114.0519 },
  'raleigh|nc': { lat: 35.8033, lon: -78.7219 },
  'columbus|oh': { lat: 39.9694, lon: -83.0061 },
  'edmonton|ab': { lat: 53.5469, lon: -113.4979 },
  'sunrise|fl': { lat: 26.1584, lon: -80.3255 },
  'saint paul|mn': { lat: 44.9447, lon: -93.1010 },
  'st. paul|mn': { lat: 44.9447, lon: -93.1010 },
  'montreal|qc': { lat: 45.4961, lon: -73.5693 },
  'newark|nj': { lat: 40.7336, lon: -74.1711 },
  'ottawa|on': { lat: 45.2969, lon: -75.9291 },
  'san jose|ca': { lat: 37.3327, lon: -121.9012 },
  'vancouver|bc': { lat: 49.2778, lon: -123.1089 },
  'winnipeg|mb': { lat: 49.8928, lon: -97.1436 },

  // MLS additions
  'austin|tx': { lat: 30.2758, lon: -97.7217 },
  'frisco|tx': { lat: 33.1536, lon: -96.8354 },
  'commerce city|co': { lat: 39.8064, lon: -104.8927 },
  'fort lauderdale|fl': { lat: 26.1621, lon: -80.1520 },
  'chester|pa': { lat: 39.8399, lon: -75.3789 },

  // Premier League (city-only keys, no state)
  'london': { lat: 51.5074, lon: -0.1278 },
  'manchester': { lat: 53.4831, lon: -2.2004 },
  'liverpool': { lat: 53.4308, lon: -2.9608 },
  'newcastle upon tyne': { lat: 54.9756, lon: -1.6216 },
  'newcastle': { lat: 54.9756, lon: -1.6216 },
  'birmingham': { lat: 52.5090, lon: -1.8683 },
  'leeds': { lat: 53.7778, lon: -1.5721 },
  'brighton': { lat: 50.8615, lon: -0.0836 },
  'wolverhampton': { lat: 52.5902, lon: -2.1301 },
  'nottingham': { lat: 52.9399, lon: -1.1329 },
  'bournemouth': { lat: 50.7352, lon: -1.8388 },
  'leicester': { lat: 52.6203, lon: -1.1422 },
  'southampton': { lat: 50.9058, lon: -1.3910 },
  'sunderland': { lat: 54.9144, lon: -1.3874 },
  'burnley': { lat: 53.7889, lon: -2.2308 },
};

export function resolveVenueCoords(city?: string, state?: string): Coords | null {
  if (!city) return null;
  if (state) {
    const withState = CITY_COORDS[key(city, state)];
    if (withState) return withState;
  }
  return CITY_COORDS[key(city)] ?? null;
}
