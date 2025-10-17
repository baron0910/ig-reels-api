import express from 'express';
import { chromium } from 'playwright';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/ig/reels', async (req, res) => {
  // 支援多帳號 input，input: url, limit, batch（建議由 n8n 流程提供）
  const { url, limit = 20 } = req.query;
  if (!url || !/^https?:\/\/www\.instagram\.com\/.*\/reels\/?$/.test(url)) {
    return res.status(400).json({ error: '請提供合法 IG reels 列表頁網址' });
  }

  let reels = [];
  let error = null;
  let browser;

  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    // 滚动页面，充分加载所有 reels
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await page.waitForTimeout(1200);
    }

    // 获取所有 reels 格式连结 (主列表)
    const reelsLinks = await page.$$eval('article [role="presentation"] a', links =>
      links.map(a => a.href)
    );
    // 去重复，并限制数量
    const uniqueLinks = [...new Set(reelsLinks)].slice(0, limit);

    // 批量进入每个 reels，获取 shortCode, 影片链接与浏览数
    for (const link of uniqueLinks) {
      try {
        await page.goto(link, { waitUntil: 'networkidle' });
        // ShortCode（可能直接可从URL提取）
        const shortCode = (link.match(/\/reel\/([^\/]+)\//) || [])[1] || '';
        // 影片连结（通常可用video标签取）
        const videoUrl = await page.$eval('video', el => el.src).catch(() => '');
        // 浏览数（Instagram新结构通常不再有直接数字，需抓页面文本，找“次觀看”字樣）
        const viewCount = await page.$eval('span:has-text("次觀看")', el => el.textContent.replace(/[^\d]/g, '')).catch(() => '');

        reels.push({ shortCode, videoUrl, link, viewCount });
      } catch (err) {
        reels.push({ shortCode: '', videoUrl: '', link, viewCount: '', error: String(err) });
      }
    }
  } catch (err) {
    error = String(err);
  } finally {
    if (browser) await browser.close();
  }

  return res.json({
    url,
    crawledAt: new Date().toISOString(),
    count: reels.length,
    reels,
    error,
  });
});

app.get('/', (req, res) => {
  res.send('IG Reels Scraper API Healthy!');
});

app.listen(PORT, () => {
  console.log(`IG Reels API running on port ${PORT}`);
});
