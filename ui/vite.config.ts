import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import type { Plugin, UserConfig } from 'vite'
import type { UserConfig as VitestUserConfig } from 'vitest/config'

const isTest = Boolean(process.env.VITEST)

const sveltePlugins = svelte({
  emitCss: !isTest,
  compilerOptions: {
    hmr: !isTest,
  },
  exclude: isTest ? [/vite\/dist\/client\/env\.mjs($|\?)/] : undefined,
})

const plugins = isTest ? sveltePlugins.map((plugin) => wrapPluginForVitest(plugin)) : sveltePlugins

const config = {
  plugins,
  server: {
    hmr: {},
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

const testEnvironmentBaseConfig: Record<string, unknown> = {
  consumer: 'client',
  command: 'test',
  build: { watch: false },
  assetsInclude: () => false,
}

function wrapPluginForVitest(plugin: Plugin): Plugin {
  if (!isTest) {
    return plugin
  }

  const wrapped: Plugin = { ...plugin }

  if (plugin.configResolved) {
    const original = plugin.configResolved
    const handler = (typeof original === 'function' ? original : original.handler) as (...args: any[]) => any
    const wrapper = function (this: any, config: any, ...args: any[]) {
      const context = this ?? wrapped
      ensureEnvironment(context)
      context.environment.config = config
      return handler.apply(this ?? wrapped, [config, ...args])
    }
    if (typeof original === 'function') {
      wrapped.configResolved = wrapper
    } else {
      wrapped.configResolved = { ...original, handler: wrapper }
    }
  }

  applyHookWrap(wrapped, 'buildStart')
  applyHookWrap(wrapped, 'load')
  applyHookWrap(wrapped, 'transform')
  applyHookWrap(wrapped, 'resolveId')
  applyHookWrap(wrapped, 'hotUpdate')

  wrapped.configureServer = undefined

  return wrapped
}

const svelteIdRegex = /\.svelte($|\?)/

function hookIdArg(key: string, args: unknown[]) {
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

function shouldSkipVitestModule(value: unknown) {
  if (typeof value !== 'string') {
    return false
  }
  if (value.includes('/vite/dist/client/env.mjs')) {
    return true
  }
  return !svelteIdRegex.test(value)
}

function applyHookWrap(target: Plugin, key: string) {
  const typedKey = key as keyof Plugin
  const hook = target[typedKey]
  if (!hook) {
    return
  }
  if (typeof hook === 'function') {
    target[typedKey] = function (this: any, ...args: any[]) {
      const context = this ?? target
      ensureEnvironment(context)
        const idArg = hookIdArg(key, args)
        if (shouldSkipVitestModule(idArg)) {
          return
        }
        return hook.apply(this ?? target, args)
    }
  } else if (typeof hook === 'object' && typeof hook.handler === 'function') {
    target[typedKey] = {
      ...hook,
      handler: function (this: any, ...args: any[]) {
        const context = this ?? target
        ensureEnvironment(context)
          const idArg = hookIdArg(key, args)
          if (shouldSkipVitestModule(idArg)) {
            return
          }
          return hook.handler.apply(this ?? target, args)
      },
    }
  }
}

function ensureEnvironment(context: any) {
  if (!context) {
    return
  }

  if (!context.environment) {
    context.environment = {
      config: { ...testEnvironmentBaseConfig },
    }
  } else if (!context.environment.config) {
    context.environment.config = { ...testEnvironmentBaseConfig }
  }
}
