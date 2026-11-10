"""Actual UI, synthetic ports only. Requires the isolated Vite preview on 5197."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright, expect


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 580, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        await page.goto('http://127.0.0.1:5197/?multi-target')
        await expect(page.locator('.gs-detail-title').first).to_contain_text('Target: /Projects/other-team/atlas')
        await expect(page.locator('.gs-header')).to_contain_text('Workspace · atlas')
        await page.get_by_text('Workspace and history', exact=True).click()
        await expect(page.locator('.gs-workspace')).to_contain_text('/Projects/atlas')
        await expect(page.locator('.gs-workspace')).to_contain_text('not a scan target or combined history')
        await page.locator('.gs-runs > summary').click()
        await expect(page.locator('.gs-runs')).to_contain_text('Target: /Projects/other-team/atlas')
        await expect(page.locator('.gs-runs')).to_contain_text('Target: /Projects/atlas')
        await page.get_by_role('button', name='Review webhook request validation', exact=False).click()
        await page.locator('.gs-findings details > summary').first.click()
        await page.get_by_role('button', name='Validate this finding', exact=True).first.click()
        await expect(page.get_by_role('textbox', name='Operation repository')).to_have_value('/Projects/other-team/atlas')
        await expect(page.get_by_role('textbox', name='Finding to assess')).not_to_have_value('')
        # Clicking the active Validate tab clears the seed without remounting the kind panel.
        await page.get_by_role('button', name='Validate', exact=True).click()
        await expect(page.get_by_role('textbox', name='Operation repository')).to_have_value('/Projects/atlas')
        await expect(page.get_by_role('textbox', name='Finding to assess')).to_have_value('')
        await page.get_by_role('button', name='Scans', exact=True).click()
        await page.get_by_role('button', name='New scan', exact=True).click()
        await expect(page.get_by_role('textbox', name='Repository', exact=True)).to_have_value('/Projects/atlas')
        await page.get_by_text('Scope and supporting documents', exact=True).click()
        await page.get_by_role('textbox', name='Scope paths', exact=True).fill('src/old-target')
        await page.get_by_role('textbox', name='Context files', exact=True).fill('docs/old-target.md')
        await page.get_by_role('textbox', name='Repository', exact=True).fill('/Projects/other-team/atlas')
        await expect(page.get_by_role('textbox', name='Scope paths', exact=True)).to_have_value('')
        await expect(page.get_by_role('textbox', name='Context files', exact=True)).to_have_value('')
        await page.get_by_role('button', name='Review scan', exact=True).click()
        await expect(page.locator('.gs-review').first).to_contain_text('/Projects/other-team/atlas')
        await page.get_by_role('button', name='Close', exact=True).click()
        await page.get_by_role('button', name='New scan', exact=True).click()
        await expect(page.get_by_role('textbox', name='Repository', exact=True)).to_have_value('/Projects/atlas')
        await page.get_by_role('button', name='Close', exact=True).click()
        await page.get_by_role('button', name='Review draft', exact=True).click()
        await expect(page.locator('.gs-review').first).to_contain_text('/Projects/other-team/atlas')
        await page.get_by_role('button', name='Policy', exact=True).click()
        await page.get_by_role('textbox', name='Operation repository').fill('/Projects/other-team/atlas')
        await page.get_by_role('button', name='Review policy draft', exact=True).click()
        await expect(page.get_by_role('article', name='Selected operation')).to_contain_text('Target: /Projects/other-team/atlas')
        await page.get_by_role('button', name='New draft', exact=True).click()
        await expect(page.get_by_role('textbox', name='Operation repository')).to_have_value('/Projects/atlas')
        await page.get_by_role('button', name='Validate', exact=True).click()
        await page.get_by_role('textbox', name='Finding to assess').fill('Finding from old project')
        await page.get_by_role('textbox', name='Operation repository').fill('/Projects/other-team/atlas')
        await expect(page.get_by_role('textbox', name='Finding to assess')).to_have_value('')
        await page.get_by_role('textbox', name='Finding to assess').fill('Finding for selected target')
        await page.get_by_role('button', name='Review validation', exact=True).click()
        await page.get_by_role('button', name='New validation', exact=True).click()
        await expect(page.get_by_role('textbox', name='Operation repository')).to_have_value('/Projects/atlas')
        await expect(page.get_by_role('textbox', name='Finding to assess')).to_have_value('')
        await page.get_by_role('button', name='Scans', exact=True).click()
        await page.evaluate("document.body.classList.add('narrow')")
        await page.set_viewport_size({'width': 390, 'height': 844})
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        out = Path(__file__).resolve().parents[2] / 'evidence' / 'run-details'
        out.mkdir(parents=True, exist_ok=True)
        await page.screenshot(path=str(out / 'repository-context-narrow.png'), full_page=True)
        assert not errors, errors
        await browser.close()
        print(json.dumps({'passed': ['workspace and same-basename targets distinguished', 'validation preserves finding target and clears removed seed', 'scope/context cleared on target change', 'new scan defaults to workspace', 'explicit prepared target preserved', 'new policy resets target', 'new validation resets target and finding', 'changing validation target clears finding', 'narrow no overflow', 'no browser errors']}))


asyncio.run(main())
