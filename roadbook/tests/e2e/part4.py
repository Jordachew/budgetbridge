import asyncio, sys
sys.path.insert(0, '/home/claude/roadbook/tests/e2e')
from helpers import *

async def main():
    s = Session()
    async with async_playwright() as pw:
        b, ctx = await new_context(pw)
        page = await ctx.new_page(); watch(page, s)
        await go(page, '/')
        await page.evaluate("navigator.serviceWorker.ready")
        await page.wait_for_function("navigator.serviceWorker.controller !== null || true")
        await page.reload(); await page.wait_for_selector('#page-title')
        s.check(await page.evaluate("!!navigator.serviceWorker.controller"), 'service worker is controlling the page')
        keys = await page.evaluate("caches.keys()")
        s.check(any(k.startswith('roadbook-core-') for k in keys), 'app files cached for offline')
        # manifest sanity
        man = await page.evaluate("fetch('manifest.webmanifest').then(r=>r.json())")
        s.check(man['display']=='standalone' and any(i['purpose']=='maskable' for i in man['icons']), 'manifest installable (standalone + maskable icon)')
        for i in man['icons']:
            r = await page.evaluate("u=>fetch(u).then(r=>r.status)", i['src']); s.check(r==200, f"icon {i['src']} exists")
        await ctx.set_offline(True)
        await page.goto(BASE + '?source=pwa#/expense/new')     # cold open with no signal
        await page.wait_for_selector('#amt')
        s.check(True, 'app opens with no signal')
        await page.fill('#amt', '2500'); await page.click('button.chip:has-text("Food")'); await page.click('button:has-text("Save expense")')
        await page.wait_for_selector('text=J$2,500')
        s.check(True, 'expense saved with no signal')
        await go(page, '/loads'); await go(page, '/money'); await go(page, '/help')
        s.check(True, 'other screens load offline')
        await ctx.set_offline(False)
        await page.reload(); await go(page, '/expenses'); await page.wait_for_selector('text=J$2,500')
        s.check(True, 'record survives reload')
        # settings: text size / theme / export / erase
        await go(page, '/settings')
        await page.click('button:has-text("Huge")'); 
        s.check(await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim()") == '1.3', 'huge text applied')
        await page.click('button:has-text("Night")')
        s.check(await page.evaluate("document.documentElement.dataset.theme") == 'dark', 'night theme applied')
        await shot(page, '40-settings-huge-dark', full=True)
        await axe(page, s, 'settings (night, huge text)')
        await go(page, '/'); await shot(page, '41-home-dark-huge')
        await axe(page, s, 'home (night, huge text)')
        await go(page, '/settings')
        async with page.expect_download() as dl:
            await page.click('button:has-text("Download all my records")')
        d = await dl.value
        import json; data = json.loads(open(await d.path()).read())
        s.check(len(data['expenses'])==1 and data['expenses'][0]['amount_cents']==250000 and not any(k.startswith('_') for k in data['expenses'][0]), 'export has records and no internal fields')
        await page.click('button:has-text("Erase everything")'); await page.fill('#del', 'DELETE'); await page.click('dialog button:has-text("Erase everything")')
        await page.wait_for_timeout(2500)
        await go(page, '/expenses')
        s.check(await page.locator('text=No expenses yet').count()==1, 'erase removes everything')
        for e in s.errors: print('ERR', e)
        s.check(not s.errors, 'no console errors')
        await b.close()
    print(f'\n{s.passes} passed, {len(s.fails)} failed'); sys.exit(1 if s.fails else 0)
asyncio.run(main())
