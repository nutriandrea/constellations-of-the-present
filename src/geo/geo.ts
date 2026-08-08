export interface GeoReading {
  lat: number | null
  lon: number | null
  coarse: string
}

export async function requestCoarseGeo(): Promise<GeoReading> {
  if (!('geolocation' in navigator)) return { lat: null, lon: null, coarse: 'unknown' }
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 8000 })
    })
    const lat = pos.coords.latitude
    const lon = pos.coords.longitude
    return {
      lat,
      lon,
      coarse: `${lat.toFixed(1)},${lon.toFixed(1)}`,
    }
  } catch {
    return { lat: null, lon: null, coarse: 'unknown' }
  }
}
