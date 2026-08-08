import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RemoteStar, StarChannel } from './StarChannel'

export interface ChannelEnv {
  url?: string
  key?: string
}

export function pickChannelKind(env: ChannelEnv): 'supabase' | 'broadcast' | 'noop' {
  if (env.url && env.key) return 'supabase'
  if (typeof BroadcastChannel !== 'undefined') return 'broadcast'
  return 'noop'
}

export function createSupabaseChannel(url: string, key: string, client?: SupabaseClient): StarChannel {
  const supabase = client ?? createClient(url, key)
  const ownId = crypto.randomUUID()
  const listeners = new Set<(stars: RemoteStar[]) => void>()
  const channelName = 'sky'
  let subscribed = false

  const channel = supabase.channel(channelName)

  const emit = (): void => {
    const state = channel.presenceState() as Record<string, RemoteStar[]>
    const stars: RemoteStar[] = []
    for (const ref of Object.keys(state)) {
      for (const value of state[ref] ?? []) {
        if (value?.hash && value.id && value.id !== ownId) stars.push(value)
      }
    }
    for (const cb of listeners) cb(stars)
  }

  return {
    kind: 'supabase',
    ownId,
    connect() {
      if (subscribed) return
      channel
        .on('presence', { event: 'sync' }, emit)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') subscribed = true
        })
    },
    onStars(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    publish(star: RemoteStar) {
      if (!subscribed) return
      void channel.track({ ...star, id: ownId })
    },
    dispose() {
      if (subscribed) {
        void channel.untrack()
        void channel.unsubscribe()
      }
      subscribed = false
      listeners.clear()
    },
  }
}

export function createBroadcastChannel(name = 'copt-sky'): StarChannel {
  const ownId = crypto.randomUUID()
  const listeners = new Set<(stars: RemoteStar[]) => void>()
  const bc = new BroadcastChannel(name)

  bc.onmessage = (event: MessageEvent<RemoteStar>) => {
    const star = event.data
    if (!star || !star.hash || star.id === ownId) return
    for (const cb of listeners) cb([star])
  }

  return {
    kind: 'broadcast',
    ownId,
    connect() {
      /* noop: BroadcastChannel is always live */
    },
    onStars(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    publish(star: RemoteStar) {
      bc.postMessage({ ...star, id: ownId })
    },
    dispose() {
      listeners.clear()
      bc.close()
    },
  }
}

export function createNoopChannel(): StarChannel {
  return {
    kind: 'noop',
    ownId: crypto.randomUUID(),
    connect() {
      /* offline sky */
    },
    onStars() {
      return () => undefined
    },
    publish() {
      /* nothing leaves the device */
    },
    dispose() {
      /* noop */
    },
  }
}

export function createStarChannel(env: ChannelEnv): StarChannel {
  switch (pickChannelKind(env)) {
    case 'supabase':
      return createSupabaseChannel(env.url!, env.key!)
    case 'broadcast':
      return createBroadcastChannel()
    default:
      return createNoopChannel()
  }
}
