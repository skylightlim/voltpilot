const { chromium } = require('playwright-core');
const fs = require('fs');

const BRANDS = ['bmw', 'toyota', 'perodua', 'mazda', 'mercedes_benz', 'mini', 'hyundai', 'proton', 'honda', 'byd', 'lexus'];
const BASE = 'https://autoselection.simemotors.com.my';
const OUT = '/home/skylight/ai-transport-platform/data/used_market_raw/autoselection_listings.jsonl';
const LOG = '/home/skylight/ai-transport-platform/data/used_market_raw/autoselection_run.log';

function log(msg) {
  fs.appendFileSync(LOG, new Date().toISOString() + ' ' + msg + '\n');
}

async function main() {
  const browser = await chromium.launch({
    executablePath: '/home/skylight/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);

  fs.writeFileSync(OUT, '');
  const seen = new Set();

  for (const brand of BRANDS) {
    let pageNum = 1;
    let done = false;
    while (!done) {
      const url = pageNum === 1 ? `${BASE}/${brand}` : `${BASE}/${brand}?p=${pageNum}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        const cards = await page.evaluate(() => {
          const items = [...document.querySelectorAll('.product-item, .item.product')];
          return items.map(it => {
            const a = it.querySelector('a[href$=".html"]');
            const price = it.querySelector('[data-price-amount]');
            const attrs = [...it.querySelectorAll('.product-item-attribute-name')].map(e => e.innerText.trim());
            const brandEl = it.querySelector('.product-item-brand');
            const modelEl = it.querySelector('.product-item-model');
            const text = it.innerText.replace(/\s+/g, ' ');
            const mileM = text.match(/([\d,]+)\s*KM/);
            const locM = text.match(/•\s*([A-Z][A-Z\s]+)\s*$/);
            const dateM = text.match(/(\d{1,2}\s+\w+\s+\d{4})/);
            return {
              href: a ? a.getAttribute('href') : null,
              price: price ? price.getAttribute('data-price-amount') : null,
              brand: brandEl ? (brandEl.innerText.replace(/Year & Brand:|Model/gi, '').match(/([A-Z][a-zA-Z]+)\s*$/)?.[1] || '') : '',
              model: modelEl ? modelEl.innerText.replace(/Model/gi, '').trim() : '',
              year: attrs[0] || '',
              mileage: mileM ? parseInt(mileM[1].replace(/,/g, '')) : null,
              date: dateM ? dateM[1] : null,
              location: locM ? locM[1].trim() : null,
            };
          }).filter(c => c.href && c.price);
        });
        if (cards.length === 0) { log(`${brand} page ${pageNum}: no cards, stop`); break; }
        let newCount = 0;
        for (const c of cards) {
          const carId = c.href.split('/').pop().replace('.html', '');
          if (seen.has(carId)) continue;
          seen.add(carId);
          newCount++;
          const rec = {
            carId,
            title: `${c.year} ${c.brand} ${c.model}`.trim(),
            price: c.price,
            year: c.year,
            make: c.brand,
            model: c.model,
            mileage: c.mileage,
            date: c.date,
            location: c.location,
            url: c.href,
          };
          fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
        }
        log(`${brand} p${pageNum}: ${cards.length} cards, ${newCount} new (seen total ${seen.size})`);
        if (cards.length < 12) { done = true; }
        else pageNum++;
      } catch (e) {
        log(`ERR ${brand} p${pageNum}: ${e.message.slice(0, 120)}`);
        done = true;
      }
    }
  }
  log(`DONE seen=${seen.size}`);
  await browser.close();
  process.exit(0);
}

main().catch(e => { log('FATAL ' + e.message); process.exit(1); });
