const { chromium } = require('playwright-core');
const fs = require('fs');

const OUT = '/home/skylight/ai-transport-platform/data/used_market_raw/carsome_listings.jsonl';
const BASE = 'https://www.carsome.my/buy-car?pageNo=';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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

const write = (list) => {
  for (const c of list) {
    fs.appendFileSync(OUT, JSON.stringify({
      carId: c.carId, carName: c.carName, price: c.price,
      expSellingPrice: c.expSellingPrice, carYear: c.carYear,
      carMileage: c.carMileage, carListingDate: c.carListingDate,
      fuelTypeName: c.fuelTypeName, transmissionName: c.transmissionName,
      location: c.location, place: c.place, carStateName: c.carStateName,
      carTypeName: c.carTypeName, vinCode: c.vinCode, carNo: c.carNo,
      url: 'https://www.carsome.my/car/' + c.carId,
    }) + '\n');
  }
};

(async () => {
  fs.writeFileSync(OUT, '');
  let { browser, page } = await makeBrowser();
  let total = 0, pageSize = 0, seen = 0;

  const getPage = async (p) => {
    try {
      await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);
      const n = await page.evaluate(() => {
        const el = [...document.querySelectorAll('script')].find(e => e.textContent.includes('window.__NUXT__='));
        return el ? el.textContent : null;
      });
      if (!n) return null;
      const w = {};
      globalThis.window = w;
      eval(n);
      return w.__NUXT__ || null;
    } catch (e) {
      return null;
    }
  };

  // page 1 to discover total
  for (let attempt = 0; attempt < 3; attempt++) {
    const d = await getPage(1);
    if (d && d.fetch && d.fetch[0] && d.fetch[0].carList) {
      total = d.fetch[0].total;
      pageSize = d.fetch[0].pageSize;
      write(d.fetch[0].carList);
      seen = d.fetch[0].carList.length;
      break;
    }
    await browser.close();
    ({ browser, page } = await makeBrowser());
  }
  if (!total) { console.error('could not load page 1'); process.exit(1); }
  console.log('total', total, 'pageSize', pageSize, 'pages', Math.ceil(total / pageSize));

  const pages = Math.ceil(total / pageSize);
  let failCount = 0;
  for (let p = 2; p <= pages; p++) {
    const d = await getPage(p);
    if (d && d.fetch && d.fetch[0] && Array.isArray(d.fetch[0].carList) && d.fetch[0].carList.length) {
      const list = d.fetch[0].carList;
      const first = list[0].carId;
      const isNew = !list.some(c => fs.existsSync(OUT) && false); // no-op
      write(list);
      seen += list.length;
      failCount = 0;
      if (p % 5 === 0) console.log('page', p, 'seen', seen);
    } else {
      failCount++;
      console.log('p', p, 'bad response, fail', failCount, 'restarting browser');
      try { await browser.close(); } catch (e) {}
      ({ browser, page } = await makeBrowser());
      if (failCount >= 3) {
        console.log('giving up at page', p, 'seen', seen);
        break;
      }
      p--;
    }
  }
  console.log('DONE seen', seen);
  try { await browser.close(); } catch (e) {}
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
