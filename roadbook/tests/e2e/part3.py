import asyncio, sys, datetime
sys.path.insert(0, '/home/claude/roadbook/tests/e2e')
from helpers import *
from fakesb import FakeServer, attach

SPEAK = "window.__spoken=[]; const o=window.speechSynthesis; if(o){o.speak=(u)=>{window.__spoken.push(u.text); try{u.onend&&u.onend()}catch(e){}};}"

async def signup(page, name, email):
    await page.goto(BASE)
    await page.wait_for_selector('text=Use without an account')
    await page.click('button:has-text("New here")')
    await page.fill('#a-name', name); await page.fill('#a-email', email); await page.fill('#a-pw', 'correct-horse-9')
    await page.click('button:has-text("Create my account")')
    await page.wait_for_selector('#page-title')

async def sync_now(page):
    await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    await page.wait_for_timeout(700)

async def main():
    s = Session(); srv = FakeServer()
    async with async_playwright() as pw:
        bo, co = await new_context(pw, service_workers='block'); bd, cd = await new_context(pw, service_workers='block')
        await attach(co, srv); await attach(cd, srv)
        owner = await co.new_page(); driver = await cd.new_page()
        watch(owner, s); watch(driver, s)
        await owner.add_init_script(SPEAK); await driver.add_init_script(SPEAK)

        # wrong password message
        await driver.goto(BASE); await driver.wait_for_selector('text=Use without an account')
        await driver.fill('#a-email', 'nobody@example.com'); await driver.fill('#a-pw', 'whatever1'); await driver.click('form button[type=submit]')
        await driver.wait_for_selector('text=not right')
        s.check(True, 'wrong password gives a plain-words message')
        await shot(driver, '30-welcome')

        await signup(owner, 'Boss Marley', 'boss@example.com'); await signup(driver, 'Winston Brown', 'winston@example.com')
        s.check(len(srv.users) == 2, 'both accounts created')

        # owner creates crew
        await go(owner, '/crew')
        await owner.fill('#cn', 'Kingston Haulage'); await owner.click('button:has-text("Create my crew")')
        await owner.wait_for_selector('text=You run this company')
        await owner.click('button:has-text("Show code")')
        code = (await owner.locator('.big-num.mono.center').inner_text()).strip()
        s.check(len(code) == 6 and code.isalnum(), f'owner sees join code {code}')
        await shot(owner, '31-crew-owner', full=True)

        # driver joins with wrong then right code
        await go(driver, '/crew')
        await driver.fill('#jc', 'WRONG1'); await driver.click('button:has-text("Join")')
        await driver.wait_for_selector('text=code is not right')
        await driver.fill('#jc', code.lower()); await driver.click('[role=switch]'); await driver.click('form button:has-text("Join")')
        await driver.wait_for_selector('text=Kingston Haulage')
        s.check(any(m['share_data'] for m in srv.members if m['role']=='driver'), 'driver joined sharing numbers (code typed in lower case)')
        await shot(driver, '32-crew-driver', full=True)

        # owner dispatches a load to the driver
        await owner.evaluate("location.reload()"); await owner.wait_for_selector('#page-title'); await go(owner, '/crew'); await owner.wait_for_selector('text=Winston Brown')
        await go(owner, '/load/new/edit')
        await owner.fill('#ref', 'JOB-77'); await owner.fill('#pl', 'Portmore'); await owner.fill('#dl', 'Mandeville')
        await owner.select_option('#asg', label='Winston Brown')
        await owner.click('button:has-text("Save load")'); await owner.wait_for_selector('text=For Winston Brown')
        await sync_now(owner)
        await sync_now(driver); await go(driver, '/loads'); await driver.wait_for_selector('text=JOB-77', timeout=8000)
        s.check('From dispatcher' in await driver.locator('main').inner_text(), 'driver sees dispatched load')
        await shot(driver, '33-driver-loads')

        # chat both ways
        await go(driver, '/chat'); await driver.fill('input[aria-label="Type a message"]', 'On my way to Portmore, boss'); await driver.press('input[aria-label="Type a message"]', 'Enter')
        await driver.wait_for_selector('.msg.me')
        await sync_now(driver); await sync_now(owner)
        await go(owner, '/chat'); await owner.wait_for_selector('text=On my way to Portmore, boss')
        await owner.fill('input[aria-label="Type a message"]', 'Good. Watch the flooding near Bog Walk.'); await owner.press('input[aria-label="Type a message"]', 'Enter')
        await sync_now(owner); await sync_now(driver)
        await driver.wait_for_selector('text=Watch the flooding', timeout=8000)
        s.check(True, 'chat works in both directions')
        await shot(driver, '34-chat')

        # road alert from owner -> driver hears it
        await go(driver, '/')    # driver on home screen, app open
        await go(owner, '/alert/new')
        await owner.wait_for_selector('text=Got your position')
        await owner.click('button.chip:has-text("Flooding")'); await owner.fill('#an', 'Water over the road at Bog Walk')
        await owner.click('button:has-text("Warn the crew")'); await owner.wait_for_selector('text=Road alerts')
        await sync_now(owner); await sync_now(driver)
        await driver.wait_for_selector('.alert-overlay', timeout=8000)
        spoken = await driver.evaluate('window.__spoken')
        s.check(any('Flooding reported' in x and 'Water over the road' in x for x in spoken), 'driver hears the road warning')
        await shot(driver, '35-alert-overlay')
        await driver.click('.alert-overlay button:has-text("See all alerts")')
        await driver.wait_for_selector('text=Water over the road at Bog Walk')
        await shot(driver, '36-alerts')
        await driver.click('button:has-text("It is cleared")'); await driver.wait_for_selector('text=All clear')
        s.check(True, 'alert can be cleared')

        # driver records data; owner report
        await go(driver, '/expense/new'); await driver.fill('#amt', '7000'); await driver.click('button:has-text("Save expense")'); await driver.wait_for_selector('text=J$7,000')
        await go(driver, '/trip/odometer'); await driver.fill('#so', '100'); await driver.fill('#eo', '180'); await driver.click('button:has-text("Save")'); await driver.wait_for_timeout(1200); print('DBG', driver.url, (await driver.locator('main').inner_text())[:300].replace(chr(10),' | ')); await shot(driver,'dbg3'); await driver.wait_for_selector('text=80.0 km')
        await sync_now(driver); await driver.wait_for_timeout(1500)
        s.check(len(srv.t['expenses']) == 1 and len(srv.t['trips']) == 1, 'driver data reached the server')
        await go(owner, '/crew/report'); await owner.wait_for_selector('text=Winston Brown')
        rt = await owner.locator('main').inner_text()
        s.check('80.0 km' in rt and 'J$7,000' in rt, 'owner report shows shared totals')
        await shot(owner, '37-report', full=True)

        # multi-tenant: owner promotes the driver to admin and brands the company
        await go(owner, '/crew'); await owner.wait_for_selector('text=Winston Brown')
        await owner.click('button:has-text("Make admin")'); await owner.click('dialog button:has-text("Yes")')
        await owner.wait_for_selector('text=Admin (dispatcher)')
        await owner.fill('#co-color', '#0b5cad'); await owner.fill('#co-phone', '876 555 0100'); await owner.click('button:has-text("Save details")')
        await owner.wait_for_selector('text=Company details saved')
        s.check(srv.crews[next(iter(srv.crews))].get('brand_color') == '#0b5cad', 'company colour saved')
        await go(driver, '/crew'); await driver.evaluate("location.reload()"); await driver.wait_for_selector('#page-title'); await go(driver, '/crew')
        await driver.wait_for_selector('text=Admin')
        s.check(await driver.locator('text=Team report').count() >= 1, 'admin sees the team report')
        s.check(await driver.locator('text=Code for drivers').count() == 1, 'admin can see the join code')
        s.check(await driver.locator('text=Delete this crew').count() == 0, 'admin cannot delete the company')
        await shot(owner, '36b-company', full=True); await shot(driver, '36c-admin', full=True)
        await axe(owner, s, 'company page (owner)')
        # join link remembers the code
        await driver.evaluate("location.hash = '#/join/ab12-cd34'"); await driver.wait_for_timeout(400)
        s.check(await driver.evaluate("localStorage.getItem('roadbook.joinCode')") == 'AB12CD34', 'join link keeps the code')

        # offline then online
        await cd.set_offline(True)
        await go(driver, '/expense/new'); await driver.fill('#amt', '300'); await driver.click('button:has-text("Save expense")'); await driver.wait_for_selector('text=J$300')
        await driver.wait_for_timeout(800)
        s.check(len(srv.t['expenses']) == 1, 'offline expense is not on the server yet')
        s.check(await driver.locator('text=Not uploaded yet').count() == 1, 'offline expense is marked as waiting')
        await shot(driver, '38-offline-pending')
        await cd.set_offline(False)
        await driver.evaluate("window.dispatchEvent(new Event('online'))"); await driver.wait_for_timeout(2500)
        s.check(len(srv.t['expenses']) == 2, 'expense uploaded when signal returned')

        # sign out / sign in keeps data
        await go(driver, '/settings'); await driver.click('button:has-text("Sign out")')
        await driver.wait_for_selector('text=Use without an account')
        await driver.fill('#a-email', 'winston@example.com'); await driver.fill('#a-pw', 'correct-horse-9'); await driver.click('form button[type=submit]')
        await driver.wait_for_selector('#page-title'); await go(driver, '/expenses'); await driver.wait_for_selector('text=J$7,000')
        s.check(True, 'sign out and back in restores records')

        # delete account
        await go(driver, '/settings')
        await driver.click('button:has-text("Delete all my Roadbook data")'); await driver.fill('#del', 'DELETE'); await driver.click('dialog button:has-text("Delete everything")')
        await driver.wait_for_timeout(2500)
        s.check('winston@example.com' not in srv.users and not srv.t['expenses'], 'account and data deleted on the server')

        for e in s.errors: print('ERR', e)
        s.check(not s.errors, 'no console errors')
        await bo.close(); await bd.close()
    print(f'\n{s.passes} passed, {len(s.fails)} failed')
    sys.exit(1 if s.fails else 0)
asyncio.run(main())
