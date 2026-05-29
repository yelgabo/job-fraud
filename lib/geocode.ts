export type GeocodeResult = {
  found: boolean
  lat: number | null
  lon: number | null
  displayName: string | null
  confidence: number | null
}

let lastCallAt = 0
let chain: Promise<void> = Promise.resolve()

async function rateLimit(): Promise<void> {
  const release = (chain = chain.then(async () => {
    const now = Date.now()
    const wait = Math.max(0, 1050 - (now - lastCallAt))
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCallAt = Date.now()
  }))
  await release
}

export async function geocode(addressRaw: string, userAgent: string): Promise<GeocodeResult> {
  if (!addressRaw || addressRaw.trim().length < 4) {
    return { found: false, lat: null, lon: null, displayName: null, confidence: null }
  }
  await rateLimit()
  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.searchParams.set("q", addressRaw)
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("limit", "1")
  url.searchParams.set("addressdetails", "0")
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "application/json" },
    })
    if (!res.ok) {
      return { found: false, lat: null, lon: null, displayName: null, confidence: null }
    }
    const arr = (await res.json()) as Array<{
      lat: string
      lon: string
      display_name: string
      importance?: number
    }>
    if (arr.length === 0) {
      return { found: false, lat: null, lon: null, displayName: null, confidence: null }
    }
    const h = arr[0]
    const importance = typeof h.importance === "number" ? h.importance : null
    const confidence = importance == null ? null : Math.max(0, Math.min(1, importance))
    return {
      found: true,
      lat: parseFloat(h.lat),
      lon: parseFloat(h.lon),
      displayName: h.display_name,
      confidence,
    }
  } catch {
    return { found: false, lat: null, lon: null, displayName: null, confidence: null }
  }
}
