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
        journal = page.locator('#journal')
        await page.goto('http://127.0.0.1:5197/?multi-target')
        await expect(page.locator('.gs-detail-title').first).to_contain_text('/Projects/other-team/atlas')
        await expect(page.locator('.gs-header')).to_contain_text('atlas')

        # Setup card: profile switch calls setProfile.
        await expect(page.locator('.gs-setup')).to_contain_text('Codex Security sign-in')
        await page.locator('.gs-setup > summary').click()
        await page.get_by_role('combobox', name='Profile').select_option('work')
        await expect(journal).to_have_text('Profile work')
        await expect(page.get_by_role('combobox', name='Profile')).to_have_value('work')

        # History distinguishes targets with the same basename.
        await page.locator('.gs-runs > summary').click()
        await expect(page.locator('.gs-runs')).to_contain_text('/Projects/other-team/atlas')
        await expect(page.locator('.gs-runs')).to_contain_text('/Projects/atlas')

        # Validation starts from the finding and its result stays with the finding.
        await page.get_by_role('button', name='Review webhook request validation', exact=False).click()
        await page.locator('.gs-finding > summary').first.click()
        await page.get_by_role('button', name='Validate finding', exact=True).click()
        await expect(journal).to_have_text('Prepared validation; 0 model calls')
        validation = page.locator('.gs-finding-validation').first
        await expect(validation).to_contain_text('Ready to start')
        await validation.get_by_role('button', name='Start mock run').click()
        await expect(validation).to_contain_text('Confirmed in source')
        await expect(validation.get_by_role('button', name='Validate again')).to_be_visible()

        # New scan: target defaults to the workspace; changing it clears scope and context.
        await page.get_by_role('button', name='New scan', exact=True).click()
        await expect(page.get_by_role('textbox', name='Repository', exact=True)).to_have_value('/Projects/atlas')
        await page.get_by_role('combobox', name='Scope').select_option('paths')
        await page.get_by_role('textbox', name='Scope paths', exact=True).fill('src/old-target')
        await page.get_by_text('Context files', exact=True).first.click()
        await page.get_by_role('textbox', name='Context files', exact=True).fill('docs/old-target.md')
        await page.get_by_role('textbox', name='Repository', exact=True).fill('/Projects/other-team/atlas')
        await expect(page.get_by_role('combobox', name='Scope')).to_have_value('repository')
        await expect(page.get_by_role('textbox', name='Context files', exact=True)).to_have_value('')
        await page.get_by_role('button', name='Review scan', exact=True).click()
        await expect(page.locator('.gs-review').first).to_contain_text('/Projects/other-team/atlas')
        await page.get_by_role('button', name='Close', exact=True).click()
        await page.get_by_role('button', name='New scan', exact=True).click()
        await expect(page.get_by_role('textbox', name='Repository', exact=True)).to_have_value('/Projects/atlas')
        await page.get_by_role('button', name='Close', exact=True).click()
        # The prepared draft is offered back with its own target.
        await page.locator('.gs-banner').get_by_role('button', name='Review', exact=True).click()
        await expect(page.locator('.gs-review').first).to_contain_text('/Projects/other-team/atlas')
        await page.get_by_role('button', name='Close', exact=True).click()

        # Policy and validation area: the validation is listed; a policy draft asks questions.
        await page.get_by_role('button', name='Policy and reviews').click()
        await expect(page.get_by_role('article', name='Selected operation')).to_contain_text('Confirmed in source')
        await page.get_by_role('button', name='New policy draft', exact=True).click()
        await page.get_by_role('textbox', name='Operation repository').fill('/Projects/other-team/atlas')
        await page.get_by_role('button', name='Review policy draft', exact=True).click()
        detail = page.get_by_role('article', name='Selected operation')
        await expect(detail).to_contain_text('/Projects/other-team/atlas')
        await detail.get_by_role('button', name='Start mock run').click()
        await expect(page.locator('.gs-tabs .gs-badge')).to_have_text('1')
        await page.get_by_role('textbox', name='Answer security questions').fill('Admins only; uploads need sign-in.')
        await page.get_by_role('button', name='Send answer', exact=True).click()
        await expect(detail).to_contain_text('Not written to disk')
        await expect(page.locator('.gs-tabs .gs-badge')).to_have_count(0)
        await page.get_by_role('button', name='New policy draft', exact=True).click()
        await expect(page.get_by_role('textbox', name='Operation repository')).to_have_value('/Projects/atlas')
        await page.get_by_role('button', name='Back', exact=True).click()
        await page.get_by_role('button', name='Scans', exact=True).click()

        await page.evaluate("document.body.classList.add('narrow')")
        await page.set_viewport_size({'width': 360, 'height': 844})
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert await page.locator('.codex-security').evaluate('(el) => el.scrollWidth <= el.clientWidth')
        out = Path(__file__).resolve().parents[2] / 'evidence' / 'run-details'
        out.mkdir(parents=True, exist_ok=True)
        await page.screenshot(path=str(out / 'repository-context-narrow.png'), full_page=True)
        assert not errors, errors
        await browser.close()
        print(json.dumps({'passed': ['setup card profile switch', 'same-basename targets distinguished', 'validation from finding shows result inline', 'scope/context cleared on target change', 'new scan defaults to workspace', 'prepared draft keeps its target', 'validation listed under policy and validation', 'policy questions, answer and draft', 'new policy resets target', 'narrow no overflow', 'no browser errors']}))


asyncio.run(main())
