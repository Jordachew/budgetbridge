import asyncio, pathlib
from playwright.async_api import async_playwright
root = pathlib.Path('/home/claude/roadbook/app/icons')
svg = (root / 'icon.svg').read_text()
# maskable: full-bleed green with art scaled into the safe zone
mask_svg = svg.replace('<rect width="512" height="512" rx="96" fill="#0a6638"/>', '<rect width="512" height="512" fill="#0a6638"/>')
inner = mask_svg.split('>', 1)[1].rsplit('</svg>', 1)[0]
inner = inner.replace('<rect x="28" y="28" width="456" height="456" rx="72" fill="none" stroke="#fff" stroke-width="10"/>', '')
mask = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0a6638"/><g transform="translate(51 51) scale(.8)">' + inner.split('/>', 1)[1] + '</g></svg>'
async def render(page, markup, size, out):
    await page.set_viewport_size({'width': size, 'height': size})
    await page.set_content(f'<html><body style="margin:0;background:transparent">{markup.replace("<svg ", f"<svg width=\"{size}\" height=\"{size}\" ", 1)}</body></html>')
    await page.screenshot(path=str(root / out), omit_background=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page()
        for size, name in [(192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'icon-180.png')]:
            await render(page, svg, size, name)
        await render(page, mask, 512, 'icon-maskable-512.png')
        await b.close()
asyncio.run(main())
