import express from 'express';
import { chromium } from 'playwright';

const app = express();
const PORT = process.env.PORT || 3000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseShortCodeFromUrl(link) {
  if (!link) return '';
  const m = link.match(/\/reel\/([^\/?]+)/);
  return m ? m[1] : '';
}

async function withRetry(task, times = 2, baseDelayMs = 800) {
  let lastErr;
  for (let i = 0; i <= times; i++) {
    try {
      return await task();
    } catch (err) {
      lastErr = err;
      await sleep(baseDelayMs * (i + 1));
    }
  }
  throw lastErr;
}

async function getViewCountText(page) {
  const text = await page.evaluate(() => document.body.innerText).catch(() => '');
  if (!text) return '';
  const m = text.match(/([0-9][0-9,\.]*)\s*(次觀看|views|visualizzazioni|visitas|visualizações)/i);
  return m ? m[1].replace(/[^\d]/g, '') : '';
}

app.get('/api/ig/reels', async (req, res) => {
  const { url, limit: rawLimit } = req.query;
  const limit = Math.max(1, Math.min(Number(rawLimit || 20), 100));
  if (!url || !/^https?:\/\/(www\.)?instagram\.com\/.*\/reels\/?/.test(String(url))) {
    return res.status(400).json({ error: '請提供合法 IG reels 列表頁網址，如 https://www.instagram.com/<account>/reels/' });
  }

  let browser;
  const reels = [];
  let error = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-setuid-sandbox',
      ],
    });

    const context = await browser.newContext({
      locale: 'zh-TW',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(45000);

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    });

    // 阻擋非必要資源（加速＋穩定）
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'font', 'stylesheet', 'media'].includes(type)) return route.abort();
      return route.continue();
    });

    await withRetry(() => page.goto(String(url), { waitUntil: 'networkidle' }), 2);

    // 動態滾動直到不再增加或達上限
    async function scrollUntil(target, maxRounds = 24) {
      let lastCount = 0;
      for (let i = 0; i < maxRounds; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
        await sleep(900 + Math.floor(Math.random() * 500));
        const count = await page.$$eval('article [role="presentation"] a', (els) => els.length).catch(() => 0);
        if (count >= target) break;
        if (count === lastCount) break;
        lastCount = count;
      }
    }
    await scrollUntil(limit);

    // 擷取主列表連結
    const links = await page.$$eval('article [role="presentation"] a', (as) =>
      Array.from(new Set(as.map((a) => a.href)))
    ).catch(() => []);
    const uniqueLinks = links.filter((l) => /\/reel\//.test(l)).slice(0, limit);

    // 逐一擷取（避免高併發被風控）
    for (const link of uniqueLinks) {
      try {
        await withRetry(() => page.goto(link, { waitUntil: 'networkidle' }), 2);

        const shortCode = parseShortCodeFromUrl(link);
        const videoUrl =
          (await page.$eval('video', (el) => el?.src).catch(() => '')) ||
          (await page.$eval('meta[property="og:video"]', (el) => el?.content).catch(() => '')) ||
          '';

        const viewCount = await getViewCountText(page);
        reels.push({ shortCode, videoUrl, link, viewCount });
      } catch (e) {
        reels.push({ shortCode: '', videoUrl: '', link, viewCount: '', error: String(e) });
      }
    }

    return res.json({
      url,
      crawledAt: new Date().toISOString(),
      count: reels.length,
      reels,
      error,
    });
  } catch (err) {
    error = String(err);
    return res.status(500).json({
      url,
      crawledAt: new Date().toISOString(),
      count: reels.length,
      reels,
      error,
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/', (_req, res) => {
  res.status(200).send('IG Reels Scraper API Healthy!');
});

app.listen(PORT, () => {
  console.log(`IG Reels API running on port ${PORT}`);
});
