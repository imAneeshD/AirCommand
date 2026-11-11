const NM_PER_DEG_LAT = 60;

export function latLonToLocalNm(
  lat: number,
  lon: number,
  refLat: number,
  refLon: number
): { x: number; y: number } {
  const cosLat = Math.max(0.1, Math.cos((refLat * Math.PI) / 180));
  return {
    x: (lon - refLon) * NM_PER_DEG_LAT * cosLat,
    y: (lat - refLat) * NM_PER_DEG_LAT,
  };
}

export function localNmToLatLon(
  xNm: number,
  yNm: number,
  refLat: number,
  refLon: number
): { lat: number; lon: number } {
  const cosLat = Math.max(0.1, Math.cos((refLat * Math.PI) / 180));
  return {
    lat: refLat + yNm / NM_PER_DEG_LAT,
    lon: refLon + xNm / (NM_PER_DEG_LAT * cosLat),
  };
}

export function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  const earthRadiusNm = 3440.065;
  return 2 * earthRadiusNm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingBetweenLatLon(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = Math.PI / 180;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const dLam = (lon2 - lon1) * toRad;
  const y = Math.sin(dLam) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return deg === 0 ? 360 : deg;
}

export function boundingBoxAround(
  lat: number,
  lon: number,
  radiusNm: number
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const dLat = radiusNm / NM_PER_DEG_LAT;
  const cosLat = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const dLon = radiusNm / (NM_PER_DEG_LAT * cosLat);
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLon: lon - dLon,
    maxLon: lon + dLon,
  };
}
