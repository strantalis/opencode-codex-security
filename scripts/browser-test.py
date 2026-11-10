import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
 async with async_playwright() as p:
  browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
  page = await browser.new_page(viewport={ 'width': 1440, 'height': 1050 }, device_scale_factor=1)
  errors=[]
  page.on('pageerror', lambda error: errors.append(str(error)))
  await page.goto('http://127.0.0.1:4173/')
  await page.get_by_role('button',name='Run local scan').click()
  await page.get_by_role('heading',name='Scan complete',exact=True).wait_for()
  assert await page.locator('.finding-row').count() == 4
  await page.locator('[data-severity="critical"]').first.click()
  assert await page.locator('.finding-row').count() == 1
  await page.get_by_role('button',name='Clear filters').click()
  await page.locator('#finding-search').fill('SQL')
  assert await page.locator('.finding-row').count() == 1
  await page.locator('#finding-search').fill('')
  await page.locator('.finding-row').nth(1).click()
  await page.screenshot(path='evidence/desktop-preview.png',full_page=True)
  await page.get_by_role('button',name='Run again').click()
  await page.get_by_role('button',name='Cancel scan').click()
  await page.get_by_role('heading',name='Scan cancelled',exact=True).wait_for()
  await page.get_by_role('button',name='Run again').click()
  await page.get_by_role('heading',name='Scan complete',exact=True).wait_for()
  assert await page.locator('.finding-row').count() == 4
  await page.reload()
  await page.get_by_role('heading',name='Scan complete',exact=True).wait_for()
  await page.set_viewport_size({'width':390,'height':844})
  await page.screenshot(path='evidence/mobile-preview.png',full_page=True)
  assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
  assert not errors, errors
  print(json.dumps({'browser':'Chromium','passed':['scan','four seeded candidates','severity filter','search','selection','cancel','rerun','reload','mobile no horizontal overflow','no page errors']}))
  await browser.close()
asyncio.run(main())
