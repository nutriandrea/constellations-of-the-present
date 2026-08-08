export interface StarPoint {
  id: string
  x: number
  y: number
  z: number
}

export interface Connection {
  a: string
  b: string
  ax: number
  ay: number
  az: number
  bx: number
  by: number
  bz: number
  opacity: number
}

function distance(a: StarPoint, b: StarPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

export function buildLines(stars: StarPoint[], maxDist: number, k: number): Connection[] {
  const lines: Connection[] = []
  const seen = new Set<string>()

  for (const a of stars) {
    const neighbors = stars
      .filter((b) => b.id !== a.id)
      .map((b) => ({ b, d: distance(a, b) }))
      .filter(({ d }) => d <= maxDist)
      .sort((p, q) => p.d - q.d)
      .slice(0, k)

    for (const { b, d } of neighbors) {
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
      if (seen.has(key)) continue
      seen.add(key)
      lines.push({
        a: a.id,
        b: b.id,
        ax: a.x,
        ay: a.y,
        az: a.z,
        bx: b.x,
        by: b.y,
        bz: b.z,
        opacity: 1 - d / maxDist,
      })
    }
  }

  return lines
}
