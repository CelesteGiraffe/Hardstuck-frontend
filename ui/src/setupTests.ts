/// <reference types="vitest" />

import { expect, vi } from 'vitest'

type VitestExpect = typeof expect

declare global {
	var expect: VitestExpect
}

globalThis.expect = expect
// @ts-ignore: jest-dom is a global matcher-only module without exports
void import('@testing-library/jest-dom')

const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>
env.VITE_API_BASE ??= 'http://localhost'

const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }))
vi.stubGlobal('fetch', fetchMock)
