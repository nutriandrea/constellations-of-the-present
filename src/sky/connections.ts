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

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Costruisce i fili della costellazione.
 *
 * Ogni stella guarda i k vicini più prossimi entro maxDist. Un filo nasce solo
 * se il legame è *reciproco* — se cioè entrambe le stelle si contano a vicenda
 * fra i propri vicini — oppure se per una delle due è il legame più vicino in
 * assoluto. Così il cielo forma gruppi leggibili invece di un groviglio attorno
 * alle zone dense, e nessuna stella resta orfana se ha qualcuno accanto.
 *
 * L'opacità cala con la distanza secondo una curva morbida (esponente 1.6):
 * i legami stretti sono nitidi, quelli al limite quasi impercettibili.
 */
export function buildLines(stars: StarPoint[], maxDist: number, k: number): Connection[] {
  const neighborsById = new Map<string, { b: StarPoint; d: number }[]>()

  for (const a of stars) {
    const neighbors = stars
      .filter((b) => b.id !== a.id)
      .map((b) => ({ b, d: distance(a, b) }))
      .filter(({ d }) => d <= maxDist)
      .sort((p, q) => p.d - q.d || (p.b.id < q.b.id ? -1 : 1))
      .slice(0, Math.max(1, k))
    neighborsById.set(a.id, neighbors)
  }

  const lines: Connection[] = []
  const seen = new Set<string>()

  for (const a of stars) {
    const neighbors = neighborsById.get(a.id) ?? []
    for (let i = 0; i < neighbors.length; i++) {
      const { b, d } = neighbors[i]
      const key = pairKey(a.id, b.id)
      if (seen.has(key)) continue

      const back = neighborsById.get(b.id) ?? []
      const mutual = back.some((n) => n.b.id === a.id)
      const nearestForA = i === 0
      const nearestForB = back.length > 0 && back[0].b.id === a.id
      if (!mutual && !nearestForA && !nearestForB) continue

      seen.add(key)
      const falloff = Math.max(0, 1 - d / maxDist)
      lines.push({
        a: a.id,
        b: b.id,
        ax: a.x,
        ay: a.y,
        az: a.z,
        bx: b.x,
        by: b.y,
        bz: b.z,
        opacity: Math.pow(falloff, 1.6),
      })
    }
  }

  // Ordine stabile: i legami più forti per primi, così il cap MAX_LINES
  // taglia i fili più deboli invece di quelli casuali.
  lines.sort((p, q) => q.opacity - p.opacity || (pairKey(p.a, p.b) < pairKey(q.a, q.b) ? -1 : 1))

  return lines
}
