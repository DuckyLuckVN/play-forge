// The app version shown on the launcher: MAJOR.MINOR from package.json, and the
// git commit count as the patch, so every commit merged (and deployed) bumps it.
// Raise MAJOR/MINOR by hand in package.json for big releases. Beside it, when the
// shown code was last updated: the HEAD commit's time (stable across rebuilds).
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * @param {string} pkgVersion  package.json version, e.g. "1.0.0"
 * @param {number | null} commits  git commit count, or null without git history
 * @param {boolean} dev  a dev-server build
 */
export function formatVersion(pkgVersion, commits, dev) {
  const [major = '0', minor = '0'] = pkgVersion.split('.')
  const base = commits === null ? pkgVersion : `${major}.${minor}.${commits}`
  return dev ? `${base}-dev` : base
}

/** Commits reachable from HEAD, or null outside a git checkout. */
function commitCount() {
  try {
    return Number(
      execSync('git rev-list --count HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim(),
    )
  } catch {
    return null
  }
}

/** The version for this build. */
export function appVersion(dev = false) {
  const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))
  return formatVersion(pkg.version ?? '0.0.0', commitCount(), dev)
}

/** HEAD's commit time as an ISO 8601 string, or '' outside a git checkout. */
export function appUpdated() {
  try {
    return execSync('git log -1 --format=%cI', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}
