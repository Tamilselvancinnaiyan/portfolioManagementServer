// server/services/googleFinance.service.js
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

async function getGoogleFinanceDataWithFetch(symbol, exchange = "NSE") {
  const url = `https://www.google.com/finance/quote/${symbol}:${exchange}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);

    let peRatio = null;

    $("div").each((_, el) => {
      const text = $(el).text();
      const match = text.match(/P\/E\s*(\d+\.?\d*)/i);
      if (match && !peRatio) peRatio = parseFloat(match[1]);
    });

    return { peRatio };
  } catch (err) {
    console.warn(`Google fetch error: ${err.message}`);
    return { peRatio: null };
  }
}

async function getGoogleFinanceDataWithPuppeteer(symbol, exchange = "NSE") {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto(
      `https://www.google.com/finance/quote/${symbol}:${exchange}`,
      { waitUntil: "networkidle0", timeout: 30000 }
    );

    const peRatio = await page.evaluate(() => {
      const els = document.querySelectorAll("div, span");
      for (const el of els) {
        const t = el.textContent;
        const m = t.match(/P\/E\s*(\d+\.?\d*)/i);
        if (m) return parseFloat(m[1]);
      }
      return null;
    });

    return { peRatio };
  } catch (err) {
    console.error(`Puppeteer error: ${err.message}`);
    return { peRatio: null };
  } finally {
    if (browser) await browser.close();
  }
}


async function getGoogleFinanceData(symbol, exchange = "NSE") {
  const puppeteerResult = await getGoogleFinanceDataWithPuppeteer(
    symbol,
    exchange
  );
  if (puppeteerResult.peRatio !== null) return puppeteerResult;

  return getGoogleFinanceDataWithFetch(symbol, exchange);
}

module.exports = { getGoogleFinanceData };
