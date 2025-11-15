/// <reference types="vitest" />

import { vi } from 'vitest'

const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>
env.VITE_API_BASE ??= 'http://localhost'

const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }))
vi.stubGlobal('fetch', fetchMock)
