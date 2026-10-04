import asyncio, sys
sys.path.insert(0, '/home/claude/roadbook/tests/e2e')
from helpers import *

async def main():
    s = Session()
    async with async_playwright() as pw:
        b, ctx = await new_context(pw)
        page = await ctx.new_page(); watch(page, s)
        await page.add_init_script("window.__spoken=[]; const o=window.speechSynthesis; if(o){const sp=o.speak.bind(o); o.speak=(u)=>{window.__spoken.push(u.text); try{u.onend&&u.onend()}catch(e){}};}")
        await go(page, '/')
        s.check((await page.locator('#page-title').inner_text()).lower() == 'roadbook', 'home loads')
        s.check(await page.locator('.tab[aria-current=page]').inner_text() == 'Home', 'home tab highlighted')
        await shot(page, '01-home')

        # --- add expense by typing
        await page.click('text=Add expense')
        await page.wait_for_selector('#amt')
        await page.fill('#amt', '4500')
        await page.click('button.chip:has-text("Fuel")')
        await page.fill('#ven', 'Petcom Spanish Town')
        await page.fill('#lit', '30')
        await page.fill('#odo', '125400')
        await shot(page, '02-expense-form', full=True)
        await page.click('button:has-text("Save expense")')
        await page.wait_for_selector('text=Petcom Spanish Town')
        txt = await page.locator('main').inner_text()
        s.check('J$4,500' in txt, 'expense saved and shown as J$4,500')
        s.check(any('Expense saved' in x for x in await page.evaluate('window.__spoken')), 'voice confirmed the save')
        await shot(page, '03-expenses')

        # validation
        await go(page, '/expense/new')
        await page.click('button:has-text("Save expense")')
        s.check(await page.locator('.err:visible').count() == 1, 'empty amount shows an error')
        await page.fill('#amt', 'abc'); await page.click('button:has-text("Save expense")')
        s.check(await page.locator('.err:visible').count() == 1, 'non-number amount rejected')
        await page.fill('#amt', '1,250.50'); await page.click('button.chip:has-text("Toll")'); await page.click('button:has-text("Company paid")')
        await page.click('button:has-text("Save expense")')
        await page.wait_for_selector('text=J$1,250.50')
        s.check(True, 'comma/decimal amount accepted')

        # XSS
        await go(page, '/expense/new')
        await page.fill('#amt', '10'); await page.fill('#ven', '<img src=x onerror="window.__xss=1">'); await page.fill('#note', '<script>window.__xss=2</script>')
        await page.click('button:has-text("Save expense")')
        await page.wait_for_selector('text=<img src=x')
        s.check(await page.evaluate('window.__xss === undefined'), 'XSS in vendor/note is shown as text, not run')

        # open + edit + delete
        await page.click('text=Petcom Spanish Town')
        await page.wait_for_selector('#amt')
        s.check(await page.input_value('#amt') == '4500', 'edit form pre-filled')
        s.check(await page.input_value('#lit') == '30', 'litres pre-filled')
        await page.fill('#amt', '4600'); await page.click('button:has-text("Save expense")')
        await page.wait_for_selector('text=J$4,600')
        await page.click('text=Petcom Spanish Town'); await page.click('button:has-text("Delete")')
        await page.click('dialog button:has-text("Yes, delete")')
        await page.wait_for_selector('text=Petcom Spanish Town', state='detached')
        s.check(True, 'delete works')

        # legal pages exist, render under the strict CSP and pass axe in both colour schemes
        for name in ('privacy', 'accessibility'):
            r = await page.goto(f'http://localhost:8080/{name}.html')
            s.check(r.status == 200, f'{name}.html is served')
            s.check(await page.locator('h1').count() == 1, f'{name}.html has its heading')
            await axe(page, s, f'{name}.html')

        for e in s.errors: print('ERR', e)
        s.check(not s.errors, 'no console errors')
        await b.close()
    print(f'\n{s.passes} passed, {len(s.fails)} failed'); 
    sys.exit(1 if s.fails else 0)
asyncio.run(main())
