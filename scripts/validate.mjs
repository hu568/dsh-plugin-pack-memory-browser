// DSH Plugin Pack Schema v1 校验器 + 本插件包的额外自检。
//
// 用法：node scripts/validate.mjs      （在插件包根目录或任意目录均可）
//
// 校验内容：
//   1. dsh-plugin-pack.json 的 Schema v1 核心字段（id / name / version / description / license / plugins[]）
//   2. 每个插件的 id 唯一且合法、kind 在允许集合内、spec 形态合法（github:owner/repo 或包内相对路径）
//   3. requires 引用存在的插件 id，且不自引用
//   4. spec 为包内相对路径时文件确实存在
//   5. 随包 tarball 能被解压、内含 package/package.json，且其 name 能对应到某个清单条目
//
// 仅用 node 内置模块，无第三方依赖。
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const packRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(packRoot, 'dsh-plugin-pack.json')

const idPattern = /^[a-z0-9][a-z0-9._-]*$/
const semverPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/
const kinds = ['plugin', 'extension', 'theme', 'tool']
const githubSpec = /^github:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

const problems = []
const notes = []
const fail = (message) => problems.push(message)

let manifest
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
} catch (error) {
  console.error(`无法读取或解析 dsh-plugin-pack.json: ${error.message}`)
  process.exit(1)
}

// ---- Schema v1 核心字段 ----
if (manifest.schemaVersion !== 1) fail(`schemaVersion 必须是 1，实际为 ${JSON.stringify(manifest.schemaVersion)}`)
for (const field of ['id', 'name', 'version', 'description', 'license']) {
  if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') fail(`顶层字段 ${field} 缺失或不是非空字符串`)
}
if (typeof manifest.id === 'string' && !idPattern.test(manifest.id)) fail(`顶层 id 格式不合法: ${manifest.id}`)
if (typeof manifest.version === 'string' && !semverPattern.test(manifest.version)) fail(`顶层 version 不是 semver: ${manifest.version}`)

if (!Array.isArray(manifest.plugins) || manifest.plugins.length === 0) {
  fail('plugins 必须是非空数组')
} else {
  const seen = new Set()
  for (const [index, plugin] of manifest.plugins.entries()) {
    const at = `plugins[${index}]`
    if (plugin === null || typeof plugin !== 'object') { fail(`${at} 不是对象`); continue }
    if (typeof plugin.id !== 'string' || !idPattern.test(plugin.id)) fail(`${at}.id 格式不合法: ${JSON.stringify(plugin.id)}`)
    else if (seen.has(plugin.id)) fail(`${at}.id 重复: ${plugin.id}`)
    else seen.add(plugin.id)
    if (typeof plugin.name !== 'string' || plugin.name.trim() === '') fail(`${at}.name 缺失`)
    if (!kinds.includes(plugin.kind)) fail(`${at}.kind 必须是 ${kinds.join(' / ')} 之一，实际为 ${JSON.stringify(plugin.kind)}`)
    if (typeof plugin.spec !== 'string' || plugin.spec.trim() === '') fail(`${at}.spec 缺失`)
    if (plugin.repository !== undefined && !/^https:\/\//.test(plugin.repository)) fail(`${at}.repository 应是 https URL`)
  }

  // spec 形态 + requires 引用
  for (const plugin of manifest.plugins) {
    if (typeof plugin.spec !== 'string') continue
    const spec = plugin.spec
    if (githubSpec.test(spec)) {
      const repo = spec.slice('github:'.length).split('/')[1]
      if (plugin.repository && !plugin.repository.endsWith(`/${repo}`)) {
        fail(`${plugin.id}: spec 的仓库名 (${repo}) 与 repository 不一致`)
      }
    } else if (spec.startsWith('./') || spec.startsWith('.\\')) {
      const target = resolve(packRoot, spec)
      if (isAbsolute(spec) ) fail(`${plugin.id}: spec 不应是绝对路径`)
      if (!target.startsWith(packRoot + sep)) fail(`${plugin.id}: spec 逃逸出插件包目录`)
      try {
        const info = await stat(target)
        if (!info.isFile() || info.size === 0) fail(`${plugin.id}: spec 指向的文件为空或不是普通文件: ${spec}`)
      } catch {
        fail(`${plugin.id}: spec 指向的文件不存在: ${spec}`)
      }
    } else {
      fail(`${plugin.id}: spec 形态无法识别（应为 github:owner/repo 或 ./包内路径）: ${spec}`)
    }

    for (const required of plugin.requires ?? []) {
      if (required === plugin.id) fail(`${plugin.id}: requires 不能引用自身`)
      else if (!seen.has(required)) fail(`${plugin.id}: requires 引用了不存在的插件 id: ${required}`)
    }
  }
}

// ---- 随包 tarball 自检 ----
// 最小 tar 读取：只要 package/package.json 一个条目，够用且不引第三方依赖。
function readTarEntry(gzBuffer, wanted) {
  const raw = gunzipSync(gzBuffer)
  let offset = 0
  while (offset + 512 <= raw.length) {
    const header = raw.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    if (name === '') break
    const sizeField = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim()
    const size = parseInt(sizeField, 8)
    if (!Number.isFinite(size)) throw new Error(`无法解析 tar 条目大小: ${name}`)
    const body = raw.subarray(offset + 512, offset + 512 + size)
    if (name === wanted) return body.toString('utf8')
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return undefined
}

// 清单若用包内相对路径作 spec，其存在性已在上面的 spec 形态检查里验证过。
const pluginsDir = join(packRoot, 'plugins')
let tgzFiles = []
try {
  tgzFiles = (await readdir(pluginsDir)).filter((name) => name.endsWith('.tgz')).sort()
} catch {
  fail('plugins/ 目录不存在（本包承诺随包附带离线 tarball）')
}

const tarballs = []
for (const file of tgzFiles) {
  const path = join(pluginsDir, file)
  let pkg
  try {
    const text = readTarEntry(await readFile(path), 'package/package.json')
    if (text === undefined) throw new Error('tarball 内没有 package/package.json')
    pkg = JSON.parse(text)
  } catch (error) {
    fail(`无法读取 tarball ${file}: ${error.message}`)
    continue
  }
  const owner = (manifest.plugins ?? []).find(
    (plugin) => pkg.name === plugin.id || String(pkg.name).endsWith(`/${plugin.id}`),
  )
  if (owner === undefined) {
    fail(`${file}: 包名 ${JSON.stringify(pkg.name)} 不对应清单中的任何插件 id`)
    continue
  }
  tarballs.push({ pluginId: owner.id, path, manifest: pkg })
}

for (const plugin of manifest.plugins ?? []) {
  if (!tarballs.some((entry) => entry.pluginId === plugin.id)) fail(`${plugin.id}: plugins/ 下没有对应的 tarball`)
}

for (const { pluginId, path, manifest: pkg } of tarballs) {
  const file = path.split(sep).pop()
  if (typeof pkg.name !== 'string') fail(`${pluginId}: ${file} 的 package.json 缺少 name`)
  else if (pkg.name !== pluginId && !pkg.name.endsWith(`/${pluginId}`)) {
    fail(`${pluginId}: ${file} 的包名 ${pkg.name} 对不上清单 id`)
  }
  if (!semverPattern.test(pkg.version ?? '')) fail(`${pluginId}: ${file} 的 version 不是 semver: ${JSON.stringify(pkg.version)}`)
  if (pkg.license !== 'MIT') fail(`${pluginId}: ${file} 的 license 应为 MIT，实际为 ${JSON.stringify(pkg.license)}`)
  if (pkg.private === true) fail(`${pluginId}: ${file} 仍标记 private: true`)
  if (pkg.dsh === undefined) fail(`${pluginId}: ${file} 缺少 dsh 段（不是 DSH 插件包）`)
  notes.push(`  ${pluginId}: ${pkg.name}@${pkg.version} (${file})`)
}

// ---- 输出 ----
if (problems.length > 0) {
  console.error(`✗ 插件包校验失败，共 ${problems.length} 个问题：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`✓ Valid DSH plugin pack (${manifest.plugins.length} plugins)`)
console.log(`  id=${manifest.id}  version=${manifest.version}  license=${manifest.license}`)
if (notes.length > 0) {
  console.log('  随包 tarball：')
  for (const note of notes) console.log(note)
}
