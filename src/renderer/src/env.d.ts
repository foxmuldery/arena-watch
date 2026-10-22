import type { ArenaApi } from '../../preload'

declare global {
  interface Window {
    arena: ArenaApi
  }
}

export {}
