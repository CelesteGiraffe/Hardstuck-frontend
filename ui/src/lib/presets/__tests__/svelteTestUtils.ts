import fs from 'node:fs'
import path from 'node:path'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import { compile } from 'svelte/compiler'
import type { Component } from 'svelte'

const cache = new Map<string, Promise<Component>>()
const dependencyCache = new Map<string, Promise<SyntheticModule>>()

type ModuleNamespace = Record<string, unknown>
type ModuleOverrides = Record<string, ModuleNamespace>

function resolveFilePath(url: URL) {
  let filePath = url.pathname
  if (!fs.existsSync(filePath)) {
    const relativePath = filePath.startsWith('/') ? filePath.slice(1) : filePath
    filePath = path.join(process.cwd(), relativePath)
  }
  return filePath
}

export async function loadSvelteComponent(url: URL, overrides: ModuleOverrides = {}) {
  if (!cache.has(url.href)) {
    const promise = (async () => {
      const filePath = resolveFilePath(url)
      const source = await fs.promises.readFile(filePath, 'utf8')
      const { js } = compile(source, { filename: filePath, generate: 'client' })
      const module = new SourceTextModule(js.code, { identifier: url.href })
      await module.link(async (specifier, referencingModule) => {
        const resolvedUrl = resolveSpecifier(specifier, referencingModule.identifier)
        const override = findOverride(specifier, resolvedUrl, overrides)
        return instantiateModule(resolvedUrl, override)
      })
      await module.evaluate()
      return (module.namespace as { default?: Component }).default ?? (module.namespace as Component)
    })()
    cache.set(url.href, promise)
  }
  return cache.get(url.href)!
}

async function instantiateModule(resolvedUrl: string, namespaceOverride?: ModuleNamespace) {
  const cacheKey = namespaceOverride ? `${resolvedUrl}#override` : resolvedUrl
  if (!dependencyCache.has(cacheKey)) {
    const modulePromise = (async () => {
      const namespace = namespaceOverride ?? (await import(resolvedUrl))
      const exportNames = Object.keys(namespace)
      const synthetic = new SyntheticModule(
        exportNames,
        function () {
          for (const name of exportNames) {
            this.setExport(name, namespace[name as keyof typeof namespace])
          }
        },
        { identifier: resolvedUrl }
      )

      await synthetic.evaluate()
      return synthetic
    })()
    dependencyCache.set(cacheKey, modulePromise)
  }
  return dependencyCache.get(cacheKey)!
}

function resolveSpecifier(specifier: string, baseIdentifier: string) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return new URL(specifier, baseIdentifier).href
  }
  return specifier
}

function findOverride(specifier: string, resolvedUrl: string, overrides: ModuleOverrides) {
  return overrides[specifier] ?? overrides[resolvedUrl]
}
