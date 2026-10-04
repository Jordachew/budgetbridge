import asyncio, pathlib, json
from playwright.async_api import async_playwright

BASE = 'http://localhost:8080/'
SHOTS = pathlib.Path('/tmp/shots'); SHOTS.mkdir(exist_ok=True)
AXE = pathlib.Path('/home/claude/roadbook/node_modules/axe-core/axe.min.js').read_text()

class Session:
    def __init__(self):
        self.errors = []
        self.fails = []
        self.passes = 0
    def check(self, cond, msg):
        if cond: self.passes += 1; print('  ok  ', msg)
        else: self.fails.append(msg); print('  FAIL', msg)

async def new_context(pw, **kw):
    b = await pw.chromium.launch(args=['--use-fake-ui-for-media-stream'])
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, geolocation={'latitude': 18.0, 'longitude': -76.8}, permissions=['geolocation', 'notifications'], locale='en-GB', timezone_id='America/Jamaica', accept_downloads=True, **kw)
    # tests of the no-account mode use an empty config (the real one points at the live backend)
    return b, ctx

def watch(page, s):
    page.on('console', lambda m: s.errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: s.errors.append(f'PAGEERROR: {e}'))
    page.on('requestfailed', lambda r: s.errors.append(f'REQFAILED: {r.url} {r.failure}') if ('localhost' in r.url and 'ERR_ABORTED' not in str(r.failure)) else None)

async def go(page, path):
    await page.goto(BASE + '#' + path)
    await page.wait_for_selector('#page-title')
    await page.wait_for_timeout(250)

async def shot(page, name, full=False):
    await page.screenshot(path=str(SHOTS / f'{name}.png'), full_page=full)

async def axe(page, s, label):
    await page.evaluate(AXE)
    res = await page.evaluate("axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})")
    bad = [v for v in res['violations']]
    for v in bad:
        print('     axe', label, v['id'], v['impact'], [n['target'] for n in v['nodes']][:3])
    s.check(not bad, f'axe: no WCAG A/AA violations on {label}')
    return bad
