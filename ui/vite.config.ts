import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import type { Plugin, ResolvedConfig, UserConfig } from 'vite'
import type { UserConfig as VitestUserConfig } from 'vitest/config'

const isTest = Boolean(process.env.VITEST)
const svelteFileIdRegex = /\.svelte(?:$|\?)/
const svelteModuleIdRegex = /\.svelte\.[^/?]+(?:$|\?)?/

type ClientEnvironment = ResolvedConfig['environments'] extends Record<string, infer Env> ? Env : never

const baseTestEnvironment: Record<string, unknown> = {
  consumer: 'client',
  command: 'test',
  mode: 'test',
  root: process.cwd(),
  base: '/',
  publicDir: 'public',
  envDir: process.cwd(),
  assetsInclude: () => false,
  build: { watch: false },
  env: 'client',
}

const sveltePlugins = svelte({
  hot: !isTest,
  emitCss: !isTest,
  compilerOptions: {
    dev: !isTest,
    hmr: !isTest,
  },
  exclude: isTest ? [/vite\/dist\/client\/env\.mjs($|\?)/] : undefined,
})

const config = {
  plugins: isTest ? sveltePlugins.map((plugin) => wrapForVitest(plugin)) : sveltePlugins,
  resolve: isTest
    ? {
        conditions: ['browser', 'module', 'import', 'default'],
      }
    : undefined,
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    setupFiles: 'src/setupTests.ts',
  },
} as UserConfig & VitestUserConfig

export default defineConfig(config)

function wrapForVitest(plugin: Plugin): Plugin {
  const wrapped = plugin
  let resolvedConfig: ResolvedConfig | undefined

  const guardId = (id: unknown, key: keyof Plugin) => {
    if (typeof id !== 'string') {
      return true
    }
    if (id.includes('/vite/dist/client/env.mjs')) {
      return false
    }
    if (plugin.name?.includes('compile-module')) {
      return svelteModuleIdRegex.test(id)
    }
    if (plugin.name?.includes('load-compiled-css')) {
      return svelteFileIdRegex.test(id) && id.includes('type=style')
    }
    if (plugin.name?.includes('hot-update') && key === 'handleHotUpdate') {
      return true
    }
    return svelteFileIdRegex.test(id)
  }

  const ensureContextEnv = (context: any, config?: ResolvedConfig) => {
    if (!context.environment) {
      context.environment = {}
    }
    const envConfig = {
      ...(config ?? context.environment.config ?? baseTestEnvironment),
      consumer: 'client',
      env: 'client',
    }
    if (!context.environment.config) {
      context.environment.config = envConfig
    }
    if (!context.environment.client) {
      context.environment.client = { config: envConfig }
    }
    const clientEnv = config?.environments?.client ?? context.environment.client
    context.environment.client = {
      ...clientEnv,
      config: envConfig,
    }
    context.config = context.environment.config
  }

  const wrapHook = (key: keyof Plugin) => {
    const original = wrapped[key]
    if (!original) {
      return
    }

    const handler = typeof original === 'function' ? original : (original.handler as any)

    if (typeof handler !== 'function') {
      return
    }

    const wrapper = function (this: any, ...args: any[]) {
      const id = hookId(key, args)
      if (!guardId(id, key)) {
        return null
      }
        ensureContextEnv(this ?? wrapped, resolvedConfig)
      return handler.apply(this ?? wrapped, args)
    }

    if (typeof original === 'function') {
      wrapped[key] = wrapper
    } else {
      wrapped[key] = { ...original, handler: wrapper }
    }
  }

  if (plugin.configResolved) {
    const original = plugin.configResolved
    const handler = typeof original === 'function' ? original : (original.handler as any)
    const wrapper = function (this: any, config: ResolvedConfig, ...args: any[]) {
      const normalized = ensureResolvedConfigHasEnvironments(config)
      resolvedConfig = normalized
      ensureContextEnv(this ?? wrapped, normalized)
      return handler.apply(this ?? wrapped, [normalized, ...args])
    }

    if (typeof original === 'function') {
      wrapped.configResolved = wrapper
    } else {
      wrapped.configResolved = { ...original, handler: wrapper }
    }
  }

  ;['load', 'transform', 'resolveId', 'hotUpdate'].forEach((key) => wrapHook(key as keyof Plugin))

  wrapped.configureServer = undefined

  return wrapped
}

function hookId(key: keyof Plugin, args: unknown[]): unknown {
  if (!args.length) {
    return undefined
  }
  if (key === 'transform') {
    return args[1]
  }
  if (key === 'load' || key === 'resolveId' || key === 'hotUpdate') {
    return args[0]
  }
  return undefined
}

function ensureResolvedConfigHasEnvironments(config: ResolvedConfig): ResolvedConfig {
  if (config.environments?.client) {
    return config
  }
  const clientEnvironment = {
    ...(config.environments?.client ?? {}),
    config,
  } as unknown as ClientEnvironment

  return {
    ...config,
    environments: {
      ...(config.environments ?? {}),
      client: clientEnvironment,
    },
  }
}
