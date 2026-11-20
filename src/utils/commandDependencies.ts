import type { Plugin } from 'rollup'
import path from 'node:path'
import ts from 'typescript'

const registry = '(globalThis[Symbol.for("nuxt-discord.hmr.modules")] ??= new Map())'
const livePrefix = '\0discord:live:'
export const registryEntry = '\0discord:hot-registry'

// Register lazy namespace getters inside the running Nitro graph. Reading exports
// here would break circular imports during worker startup.
export function captureCommandImports(rootDir: string, buildDir: string, runtimeDir: string, publish: (ids: Set<string>) => void): Plugin {
  const importsByModule = new Map<string, string[]>()
  return {
    name: 'discord:capture-command-imports',
    transform: {
      order: 'post',
      async handler(code, id) {
        const projectFile = id.startsWith(rootDir + path.sep) && !id.startsWith(buildDir + path.sep) && !id.includes('/node_modules/')
        if (!projectFile && !id.startsWith(runtimeDir + path.sep) && !id.endsWith('discord/slashCommands'))
          return
        // Nitro has already injected auto-imports. Include literal import()
        // expressions and re-exports as well as static imports.
        const sources = new Set(ts.preProcessFile(code, true).importedFiles.map(file => file.fileName))
        const lines: string[] = []
        const ids: string[] = []
        for (const source of sources) {
          const resolved = await this.resolve(source, id)
          if (!resolved || resolved.external)
            continue
          ids.push(resolved.id)
          lines.push(`;${registry}.set(${JSON.stringify(resolved.id)}, () => import(${JSON.stringify(source)}))`)
        }
        importsByModule.set(id, ids)
        if (lines.length)
          return { code: `${code}\n${lines.join('\n')}`, map: null }
      },
    },
    writeBundle() {
      const ids = new Set<string>()
      // Only advertise modules that actually ran at startup. For example, an
      // unrelated lazy API route may never have registered any of its imports.
      const visited = new Set<string>()
      const visit = (id: string) => {
        const info = this.getModuleInfo(id)
        if (visited.has(id) || !info?.isIncluded)
          return
        visited.add(id)
        importsByModule.get(id)?.forEach(dep => ids.add(dep))
        info.importedIds.forEach(visit)
      }
      for (const id of this.getModuleIds()) {
        if (id.endsWith('discord/slashCommands') || this.getModuleInfo(id)?.isEntry)
          visit(id)
      }
      publish(ids)
    },
  }
}

export function reuseCommandDependencies(entries: Set<string>, updated: Map<string, string>, changed: Set<string>): Plugin {
  return {
    name: 'discord:reuse-command-imports',
    resolveId: {
      order: 'pre',
      async handler(source, importer, options) {
        if (!importer || source.startsWith(livePrefix))
          return
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
        if (!resolved || resolved.id.startsWith(livePrefix) || changed.has(resolved.id))
          return resolved
        const url = updated.get(resolved.id)
        if (url)
          return { id: url, external: true }
        return entries.has(resolved.id) ? livePrefix + resolved.id : resolved
      },
    },
    load(id) {
      if (id.startsWith(livePrefix)) {
        return {
          code: `export const __discordNamespace = await ${registry}.get(${JSON.stringify(id.slice(livePrefix.length))})(); export default __discordNamespace.default`,
          syntheticNamedExports: '__discordNamespace',
        }
      }
    },
  }
}
