import assert from 'node:assert/strict'
import { join } from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const app = process.argv[2]
const nuxt = join(app, '.nuxt')
const config = ts.getParsedCommandLineOfConfigFile(join(nuxt, 'tsconfig.server.json'), { noEmit: true }, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic(diagnostic) {
    throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
  },
})
assert.ok(config)
const fixture = join(app, 'consumer-types.ts')
const roots = [...config.fileNames, fixture]

// Check the consumer project with its own Nuxt settings, then check each
// generated public declaration with library checking enabled.
let program = ts.createProgram(roots, config.options)
const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)]
program = ts.createProgram(roots, { ...config.options, skipLibCheck: false })
for (const name of ['types.d.ts', 'augmentations.d.ts']) {
  const generated = program.getSourceFile(join(nuxt, 'discord', name))
  assert.ok(generated, `Nuxt includes discord/${name} in its server types`)
  diagnostics.push(...program.getSyntacticDiagnostics(generated), ...program.getSemanticDiagnostics(generated))
}
if (diagnostics.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => app,
    getNewLine: () => '\n',
  }))
}
