import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/api/ig/reels", async (req, res) => {
  try {
    const { url, limit = 20 } = req.query;
    if (!url) return res.status(400).json({ error: "請提供 ?url 參數" });

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--single-process"],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });

    // 自動滑動載入
    let lastHeight = 0;
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.2));
      await page.waitForTimeout(1200);
      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === lastHeight) break;
      lastHeight = newHeight;
    }

    const html = await page.content();
    const regex = /"video_view_count":(\d+).*?"shortcode":"(.*?)"/g;
    const results = [];
    for (const match of html.matchAll(regex)) {
      const [_, views, code] = match;
      results.push({
        url: `https://www.instagram.com/reel/${code}/`,
        view_count: Number(views),
      });
      if (results.length >= limit) break;
    }

    await browser.close();
    res.json({ count: results.length, results });
  } catch (error) {
    console.error("❌ 錯誤：", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ IG Reels API running on port ${PORT}`);
});
