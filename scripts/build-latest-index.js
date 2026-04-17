const fs = require('node:fs')
const path = require('node:path')

const dashboardsRoot = path.resolve(__dirname, '..')
const latestRoot = path.join(dashboardsRoot, 'latest')
const outputPath = path.join(latestRoot, 'index.json')
const ARTIFACT_KIND_ORDER = new Map([
  ['summary-html', 0],
  ['summary-md', 1],
  ['framework-report', 2],
  ['raw-results', 3],
  ['lane-detail', 4],
])

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function walkSummaryFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return []
  }

  const results = []
  const stack = [rootDir]

  while (stack.length > 0) {
    const current = stack.pop()
    const entries = fs.readdirSync(current, { withFileTypes: true })

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(absolutePath)
        continue
      }

      if (entry.isFile() && entry.name === 'summary.json') {
        results.push(absolutePath)
      }
    }
  }

  return results
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/')
}

function buildArtifactEntry(summaryDir, artifact) {
  const relativePath = String(artifact.path).replace(/\\/g, '/')
  const publishedPath = path.join(summaryDir, relativePath)
  const href = fs.existsSync(publishedPath)
    ? normalizePath(path.relative(latestRoot, publishedPath))
    : null

  const entry = {
    name: artifact.name || relativePath,
    path: relativePath,
    href,
  }

  if (artifact.kind) {
    entry.kind = artifact.kind
  }

  return entry
}

function compareArtifacts(left, right) {
  const leftRank = ARTIFACT_KIND_ORDER.get(left.kind) ?? Number.MAX_SAFE_INTEGER
  const rightRank = ARTIFACT_KIND_ORDER.get(right.kind) ?? Number.MAX_SAFE_INTEGER

  return (
    leftRank - rightRank ||
    String(left.name || left.path || '').localeCompare(String(right.name || right.path || ''))
  )
}

function buildEntry(summaryPath) {
  const summary = readJson(summaryPath)
  const summaryDir = path.dirname(summaryPath)
  const summaryDirRelative = normalizePath(path.relative(latestRoot, summaryDir))
  const summaryJsonHref = normalizePath(path.relative(latestRoot, summaryPath))
  const summaryMdPath = path.join(summaryDir, 'summary.md')
  const summaryHtmlPath = path.join(summaryDir, 'summary.html')

  return {
    service: summary.service || null,
    lane: summary.lane || null,
    channel: summary.channel || null,
    environment: summary.environment || null,
    status: summary.status || null,
    generatedAt: summary.generatedAt || null,
    testsRun: summary.testsRun ?? null,
    failures: summary.failures ?? null,
    errors: summary.errors ?? null,
    durationSeconds: summary.durationSeconds ?? null,
    branch: summary.branch || null,
    commitSha: summary.commitSha || null,
    runUrl: summary.runUrl || null,
    location: {
      directory: summaryDirRelative,
      summaryJson: summaryJsonHref,
      summaryMd: fs.existsSync(summaryMdPath)
        ? normalizePath(path.relative(latestRoot, summaryMdPath))
        : null,
      summaryHtml: fs.existsSync(summaryHtmlPath)
        ? normalizePath(path.relative(latestRoot, summaryHtmlPath))
        : null,
    },
    artifacts: Array.isArray(summary.artifacts)
      ? summary.artifacts
          .filter(artifact => artifact?.path)
          .map(artifact => buildArtifactEntry(summaryDir, artifact))
          .sort(compareArtifacts)
      : [],
  }
}

function compareEntries(left, right) {
  return (
    String(left.service || '').localeCompare(String(right.service || '')) ||
    String(left.channel || '').localeCompare(String(right.channel || '')) ||
    String(left.lane || '').localeCompare(String(right.lane || '')) ||
    String(right.generatedAt || '').localeCompare(String(left.generatedAt || ''))
  )
}

function main() {
  ensureDir(latestRoot)

  const entries = walkSummaryFiles(latestRoot)
    .filter(filePath => normalizePath(path.relative(latestRoot, filePath)) !== 'index.json')
    .map(buildEntry)
    .sort(compareEntries)

  const payload = {
    generatedAt: new Date().toISOString(),
    totalEntries: entries.length,
    entries,
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`[build-latest-index] Wrote ${outputPath}`)
}

main()
