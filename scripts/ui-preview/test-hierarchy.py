"""Opt-in browser QA of the actual panel with synthetic ports. Start Vite first.

python3 scripts/ui-preview/test-hierarchy.py
Requires Playwright and its Chromium browser. Never calls a real scan or auth flow.
"""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'evidence' / 'run-details'
BASE = 'http://127.0.0.1:5197/'


async def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 780, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        async def load(query=''):
            await page.goto(BASE + query)
            await expect(page.locator('.gs-detail')).to_be_visible()
            await expect(page.locator('.gs-runs')).not_to_have_attribute('open', '')

        async def shot(name):
            await page.screenshot(path=str(EVIDENCE / (name + '.png')), full_page=True)

        async def select(title):
            await page.locator('.gs-runs > summary').click()
            await page.get_by_role('button', name=title).click()
            await expect(page.locator('.gs-runs')).not_to_have_attribute('open', '')

        await load()
        await expect(page.get_by_role('heading', name='Reviewing source', exact=True)).to_be_visible()
        await expect(page.locator('progress')).to_have_attribute('value', '3')
        await expect(page.get_by_text('Partial estimate USD 0.24', exact=True).first).to_be_visible()
        await expect(page.locator('.gs-worker-activity')).not_to_be_visible()
        await expect(page.get_by_text('3 of 10 reviews', exact=True)).to_be_visible()
        await shot('hierarchy-running-desktop')
        await page.locator('.gs-activity > summary').focus()
        await page.keyboard.press('Enter')
        await expect(page.locator('.gs-worker-activity')).to_be_visible()
        await page.wait_for_timeout(1300)  # Disclosure survives ordinary RPC polling.
        await expect(page.locator('.gs-worker-activity')).to_be_visible()
        await page.locator('.gs-detail > .gs-advanced > summary').click()
        await expect(page.get_by_text('Measured subtotal only', exact=False)).to_be_visible()
        await select('Review webhook request validation')
        assert await page.locator('.gs-detail details[open]').count() == 0
        finding = page.locator('.gs-findings summary')
        await expect(finding).to_be_visible()
        assert (await finding.bounding_box())['y'] < 700
        await shot('hierarchy-findings-desktop')
        await finding.click()
        await expect(page.get_by_text('Suggested next step', exact=True)).to_be_visible()
        await page.wait_for_timeout(1300)
        await expect(page.locator('.gs-findings details')).to_have_attribute('open', '')
        await page.locator('.gs-coverage > summary').click()
        await expect(page.get_by_text('Production identity-provider configuration was not available', exact=False)).to_be_visible()
        await select('Review upload handling')
        assert await page.locator('.gs-detail details[open]').count() == 0
        assert await page.locator('progress').count() == 0
        await expect(page.get_by_role('heading', name='Building threat model')).to_be_visible()
        await page.get_by_role('button', name='New scan', exact=True).click()
        await page.get_by_role('button', name='Close', exact=True).click()
        await expect(page.get_by_role('heading', name='Building threat model')).to_be_visible()
        await page.get_by_role('button', name='Cancel scan', exact=True).click()
        await expect(page.get_by_role('heading', name='Scan cancelled')).to_be_visible()
        await expect(page.get_by_text('Cancelled. This scan is incomplete and is not a clean result.')).to_be_visible()
        await select('Review authorization and tenant isolation')
        await expect(page.get_by_role('heading', name='Reviewing source', exact=True)).to_be_visible()

        await page.set_viewport_size({'width': 390, 'height': 844})
        await load('?narrow')
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert await page.locator('.gill-security').evaluate('(el) => el.scrollWidth <= el.clientWidth')
        await shot('hierarchy-running-narrow')
        await select('Review webhook request validation')
        await shot('hierarchy-findings-narrow')
        await page.set_viewport_size({'width': 780, 'height': 900})
        for scenario, heading in [('finalizing', 'Finalizing results'), ('consolidating', 'Consolidating deep review')]:
            await load('?scenario=' + scenario)
            await expect(page.get_by_role('heading', name=heading, exact=True)).to_be_visible()
            assert await page.locator('progress').count() == 0
        await load('?scenario=informational')
        await expect(page.get_by_text('0 reportable · 2 informational', exact=True)).to_be_visible()
        await expect(page.get_by_text('No findings does not guarantee security. Check coverage below.')).to_be_visible()
        await load('?scenario=missing-coverage')
        await page.locator('.gs-coverage > summary').click()
        await expect(page.get_by_text('Coverage details unavailable', exact=True)).to_be_visible()
        assert not errors, errors
        print(json.dumps({'passed': ['running stage and phase progress', 'collapsed diagnostics', 'keyboard disclosure', 'poll preserves disclosure', 'selection resets disclosure', 'findings above fold', 'finding evidence', 'coverage details', 'unknown progress', 'new scan dismissal', 'cancel affects selected scan only', 'narrow no overflow', 'finalization', 'deep consolidation', 'informational-only result', 'missing coverage', 'no browser errors'], 'screenshots': str(EVIDENCE)}))
        await browser.close()


asyncio.run(main())
