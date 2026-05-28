// Capture the console screenshots that the docs reference.
//
// Prereqs (handled by ./refresh.sh, but useful to know if you run this by hand):
//   1. The console repo (../../console) is on a clean working tree.
//   2. The mock-enrichment patch is applied: `git apply` it inside the console
//      repo so lists look like a real production project. The patch lives at
//      ../mock-enrichment.patch and is human-readable.
//   3. The console mock server is up: `cd console && bun dev:mock`. Default
//      port 5173. Set CONSOLE_URL if you ran it on a different port.
//
// This script writes PNGs into ../../static/img/, which is what the docs
// shortcodes reference ({{< shot src="/img/…" >}}).
//
// Run from the console repo so node resolves @playwright/test:
//     cd ../../../console && node ../docs/scripts/screenshots/capture.mjs
// or via the helper: cd docs && ./scripts/screenshots/refresh.sh

import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../../static/img')   // docs/static/img
const BASE = process.env.CONSOLE_URL || 'http://localhost:5173'
const P = 'project=acme'
const LOC = 'location=gke.cluster-rcf2'

const browser = await chromium.launch()
const ctx = await browser.newContext({
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 2
})
await ctx.addCookies([{ name: 'theme', value: 'light', url: BASE }])
const page = await ctx.newPage()

/** @param {string} name @param {string} path @param {{ h?: number }} [opts] */
async function shot (name, path, { h = 900 } = {}) {
	await page.setViewportSize({ width: 1440, height: h })
	await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 20000 })
	await page.waitForTimeout(700)
	await page.screenshot({ path: `${OUT}/${name}.png` })
	console.log('ok  ', name)
}

// list and chart screens
await shot('deployment-list',       `/deployment?${P}`)
await shot('deployment-detail',     `/deployment/detail?${P}&${LOC}&name=web`, { h: 1180 })
await shot('deployment-metrics',    `/deployment/metrics?${P}&${LOC}&name=web`, { h: 1000 })
await shot('domain-list',           `/domain?${P}`)
await shot('route-list',            `/route?${P}`)
await shot('disk-list',             `/disk?${P}`)
await shot('registry-list',         `/registry?${P}`)
await shot('role-list',             `/role?${P}`)
await shot('service-account-list',  `/service-account?${P}`)
await shot('billing-report',        `/billing/report`)
await shot('project-list',          `/project`)
await shot('waf-list',              `/waf?${P}`)

// deploy form — reveal & fill the gated fields
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
	await page.screenshot({ path: `${OUT}/deploy-form.png` })
	console.log('ok   deploy-form (filled)')
} catch (e) {
	console.log('FAIL deploy-form', String(e).split('\n')[0])
}

await browser.close()
