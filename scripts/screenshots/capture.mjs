// Capture the console screenshots that the docs reference, in BOTH themes.
//
// For every screen we capture two PNGs:
//   - <name>.png       — light theme
//   - <name>-dark.png  — dark theme
// The docs `shot` shortcode picks the right one at render time based on the
// reader's current theme.
//
// Prereqs (handled by ./refresh.sh, but useful to know if you run this by hand):
//   1. The console repo (../../console) is on a clean working tree.
//   2. The mock-enrichment patch is applied: `git apply` it inside the console
//      repo so lists look like a real production project. The patch lives at
//      ../mock-enrichment.patch and is human-readable.
//   3. The console mock server is up: `cd console && bun dev:mock`. Default
//      port 5173. Set CONSOLE_URL if you ran it on a different port.
//
// Writes PNGs into ../../static/img/.
//
// Run from the console repo so node resolves @playwright/test:
//     cd ../../../console && node ../docs/scripts/screenshots/capture.mjs
// or via the helper: cd docs && ./scripts/screenshots/refresh.sh

import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
// SHOT_OUT is set by refresh.sh (this file gets copied around). Fall back to
// the standard layout for hand invocations from docs/scripts/screenshots/.
const OUT = process.env.SHOT_OUT || resolve(HERE, '../../static/img')
const BASE = process.env.CONSOLE_URL || 'http://localhost:5173'
const P = 'project=acme'
const LOC = 'location=gke.cluster-rcf2'

/** @type {Array<[name: string, path: string, opts?: { h?: number }]>} */
const screens = [
	['deployment-list',       `/deployment?${P}`],
	['deployment-detail',     `/deployment/detail?${P}&${LOC}&name=web`, { h: 1180 }],
	['deployment-metrics',    `/deployment/metrics?${P}&${LOC}&name=web`, { h: 1000 }],
	['domain-list',           `/domain?${P}`],
	['route-list',            `/route?${P}`],
	['disk-list',             `/disk?${P}`],
	['dropbox-list',          `/dropbox?${P}`],
	['registry-list',         `/registry?${P}`],
	['role-list',             `/role?${P}`],
	['service-account-list',  `/service-account?${P}`],
	['billing-report',        `/billing/report`],
	['project-list',          `/project`],
	['waf-list',              `/waf?${P}`],
	['cache-list',            `/cache?${P}`],
	['cache-manage',          `/cache/manage?${P}&${LOC}`, { h: 1150 }],
	['cache-metrics',         `/cache/metrics?${P}&${LOC}`, { h: 1150 }]
]

const browser = await chromium.launch()

/**
 * Capture one screen at the given theme.
 * @param {import('@playwright/test').BrowserContext} ctx
 * @param {string} name
 * @param {string} path
 * @param {{ h?: number }} opts
 * @param {string} suffix
 */
async function shot (ctx, name, path, opts, suffix) {
	const page = await ctx.newPage()
	await page.setViewportSize({ width: 1440, height: opts.h || 900 })
	await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 20000 })
	await page.waitForTimeout(700)
	await page.screenshot({ path: `${OUT}/${name}${suffix}.png` })
	await page.close()
}

/**
 * The deploy form's body is gated behind a Location select — open it, fill
 * a few realistic values, then capture so the docs screenshot shows the form
 * populated rather than the bare top row.
 * @param {import('@playwright/test').BrowserContext} ctx
 * @param {string} suffix
 */
async function shotDeployForm (ctx, suffix) {
	const page = await ctx.newPage()
	try {
		await page.setViewportSize({ width: 1440, height: 1050 })
		await page.goto(BASE + `/deployment/deploy?${P}`, { waitUntil: 'networkidle' })
		await page.waitForTimeout(500)
		await page.locator('[role=combobox]').first().click()
		await page.waitForTimeout(200)
		await page.getByRole('option', { name: 'gke.cluster-rcf2', exact: true }).click()
		await page.waitForTimeout(400)
		await page.fill('#input-name', 'web')
		await page.fill('#input-image', 'registry.deploys.app/acme/web:v2.4.1')
		const port = page.locator('#input-port')
		if (await port.count()) await port.fill('8080')
		await page.waitForTimeout(400)
		await page.screenshot({ path: `${OUT}/deploy-form${suffix}.png` })
		console.log(`ok   deploy-form${suffix} (filled)`)
	} catch (e) {
		console.log(`FAIL deploy-form${suffix}`, String(e).split('\n')[0])
	} finally {
		await page.close()
	}
}

// Warm up every route once before the timed captures. The dev server compiles
// routes on first visit; without this the first (light) pass pays that cost
// inside each capture's timeout — most visibly on the deploy form, whose
// combobox interaction would otherwise time out while the route is still
// compiling. A throwaway context with a generous timeout absorbs the compile.
{
	const warm = await browser.newContext()
	const page = await warm.newPage()
	for (const [, path] of [...screens, ['deploy-form', `/deployment/deploy?${P}`]]) {
		try {
			await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
		} catch { /* a slow warm-up visit is fine; the timed pass re-navigates */ }
	}
	await warm.close()
	console.log('---- warmed ----')
}

for (const theme of /** @type {const} */ (['light', 'dark'])) {
	const suffix = theme === 'dark' ? '-dark' : ''
	const ctx = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2
	})
	await ctx.addCookies([{ name: 'theme', value: theme, url: BASE }])

	console.log(`---- ${theme} ----`)
	for (const [name, path, opts = {}] of screens) {
		await shot(ctx, name, path, opts, suffix)
		console.log(`ok   ${name}${suffix}`)
	}
	await shotDeployForm(ctx, suffix)
	await ctx.close()
}

await browser.close()
