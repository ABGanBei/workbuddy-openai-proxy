/**
 * esbuild 打包:把 plugin 入口打成 ST Server Plugin 单文件。
 *
 * 产物:
 *   dist/plugin/workbuddy-gateway.js   (CommonJS,约 80KB)
 *
 * 部署(在 <SillyTavern>/ 下):
 *   mkdir -p plugins
 *   cp dist/plugin/workbuddy-gateway.js plugins/
 *   # 或直接:
 *   node scripts/build-plugin.mjs && cp dist/plugin/workbuddy-gateway.js ../SillyTavern/plugins/
 *
 * external 规则:
 *   - express:cjs → 用 ST 自带的 express(plugin-loader 场景必然有);
 *   - dotenv → 打包进去(独立小包,避免 Termux 用户 npm install)。
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

await build({
  entryPoints: [join(root, 'src', 'plugin', 'plugin-entry.ts')],
  outfile: join(root, 'dist', 'plugin', 'workbuddy-gateway.cjs'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['express', 'cors'],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
  banner: {
    js: '/* workbuddy-gateway server plugin — bundled single file. Do not edit. */',
  },
})

mkdirSync(join(root, 'dist', 'plugin'), { recursive: true })
console.log('✅ dist/plugin/workbuddy-gateway.cjs')
