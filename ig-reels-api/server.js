// server.js - IG Reels Scraper API (免登入)
import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/api/ig/reels", async (req, res) => {
  const { url, limit = 20 } = req.query;
  if (!url) return res.status(400).json({ error: "請提供 ?url 參數" });

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });

  // 等待 IG 文章區載入
  await page.waitForSelector("article", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // 自動滑動載入更多
  let lastHeight = 0;
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.2));
    await page.waitForTimeout(1200);
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === lastHeight) break;
    lastHeight = newHeight;
  }

  const html = await page.content();

  // ✅ 新版 IG 結構
  const regex = /"shortcode":"(.*?)".*?"video_view_count":(\d+)/gs;
  const results = [];
  for (const match of html.matchAll(regex)) {
    const [_, code, views] = match;
    results.push({
      url: `https://www.instagram.com/reel/${code}/`,
      view_count: Number(views)
    });
    if (results.length >= limit) break;
  }

  await browser.close();
  res.json({ count: results.length, results });
});

app.listen(PORT, () => console.log(`✅ IG Reels API running on port ${PORT}`));
