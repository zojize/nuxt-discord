import ts from 'typescript'
import { resolveMiddlewareTags } from '../runtime/middleware'

export function readMiddlewareTags(file: ts.SourceFile, definition?: ts.Node) {
  const statement = file.statements.find(node => ts.isExportAssignment(node)
    || (ts.isFunctionDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)))
  // getJSDocTags only reads the last block when several comments precede the export.
  const blocks = (statement as (ts.Node & { jsDoc?: ts.JSDoc[] }) | undefined)?.jsDoc ?? []
  const tags = new Set([...blocks.flatMap(block => [...block.tags ?? []]), ...definition ? ts.getJSDocTags(definition) : []])
  const names = [...tags].filter(tag => tag.tagName.text === 'middleware').map(tag => tag.comment?.toString().trim() ?? '')
  resolveMiddlewareTags(names, file.fileName)
  return names
}
