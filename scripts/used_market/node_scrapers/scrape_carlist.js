const { chromium } = require('playwright-core');
const fs = require('fs');

const OUT = '/home/skylight/ai-transport-platform/data/used_market_raw/carlist_listings.jsonl';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// catalog: read from python-generated JSON to avoid duplicating
let catalog = [];
try {
  catalog = JSON.parse(fs.readFileSync('/home/skylight/ai-transport-platform/data/used_market_raw/catalog_flat.json', 'utf8'));
} catch (e) {
  console.error('need catalog_flat.json:', e.message);
  process.exit(1);
}

async function makeBrowser() {
  const browser = await chromium.launch({
    executablePath: '/home/skylight/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
  return { browser, page: await ctx.newPage() };
}

const write = (listings) => {
  for (const l of listings) {
    fs.appendFileSync(OUT, JSON.stringify(l) + '\n');
  }
};

async function scrapeMakeModel(page, make, model, maxPages) {
  const seen = [];
  for (let p = 1; p <= maxPages; p++) {
    const url = `https://www.carlist.my/cars-for-sale/malaysia?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&page_number=${p}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2500);
    } catch (e) {
      return seen;
    }
    const listings = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.js--listing')];
      return els.map(el => {
        const wa = el.getAttribute('data-default-whatsapp-text') || '';
        let decoded = wa;
        try { decoded = decodeURIComponent(wa); } catch (e) {}
        const price = (decoded.match(/\(RM\s*([\d,]+)\)/) || [])[1];
        return {
          listingId: el.getAttribute('data-listing-id'),
          title: el.getAttribute('data-display-title') || el.getAttribute('data-title'),
          year: el.getAttribute('data-year'),
          make: el.getAttribute('data-make'),
          model: el.getAttribute('data-model'),
          mileage: el.getAttribute('data-mileage'),
          price,
          url: el.querySelector('a[href*="/used-cars/"]')?.getAttribute('href'),
        };
      }).filter(l => l.listingId && l.title);
    });
    if (!listings.length) break;
    seen.push(...listings);
    if (listings.length < 20) break; // last page
  }
  return seen;
}

(async () => {
  fs.writeFileSync(OUT, '');
  let { browser, page } = await makeBrowser();
  let totalSeen = 0;
  for (const v of catalog) {
    const make = v.brand.toLowerCase();
    const model = v.model.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    // e.g. "eMas 5" -> "emas-5"; "Omoda E5" -> "omoda-e5"
    let listings = [];
    try {
      listings = await scrapeMakeModel(page, make, model, 3);
    } catch (e) {
      console.log('ERR', make, model, e.message.slice(0, 80));
    }
    if (listings.length) {
      write(listings);
      totalSeen += listings.length;
      console.log('carlist', make, model, 'seen', listings.length, 'total', totalSeen);
    }
    await page.waitForTimeout(800);
  }
  console.log('DONE total seen', totalSeen);
  try { await browser.close(); } catch (e) {}
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
