const YahooFinance = require("yahoo-finance2").default;
const { getGoogleFinanceData } = require("./googleFinance.service");

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

function normalizeSymbol(symbol) {
  return symbol.includes(".") ? symbol : `${symbol}.NS`;
}

function baseSymbol(symbol) {
  return symbol.split(".")[0];
}

async function getStockData(symbol) {
  const normalized = normalizeSymbol(symbol);
  const base = baseSymbol(symbol);

  try {
    console.log(`\n🔍 Processing ${symbol} (${normalized})`);

    const quote = await yahooFinance.quote(normalized);
    if (!quote) return null;

    const cmp = quote.regularMarketPrice ?? 0;

    const yahooPeRatio =
      typeof quote.trailingPE === "number"
        ? quote.trailingPE
        : typeof quote.forwardPE === "number"
        ? quote.forwardPE
        : null;

    let googleData = { peRatio: null };

    try {
      googleData = await Promise.race([
        getGoogleFinanceData(base, "NSE"),
        new Promise((_, r) =>
          setTimeout(() => r(new Error("Google timeout")), 10000)
        ),
      ]);
    } catch (_) {}

    let peRatio = null;
    let earningsSource = "NO_DATA";

    if (typeof googleData.peRatio === "number") {
      peRatio = googleData.peRatio;
      earningsSource = "GOOGLE_FINANCE";
    } else if (typeof yahooPeRatio === "number") {
      peRatio = yahooPeRatio;
      earningsSource = "YAHOO_FINANCE";
    }

    const latestEarnings =
      peRatio && cmp ? Number((cmp / peRatio).toFixed(2)) : null;

    return {
      symbol: quote.symbol,
      cmp,
      peRatio,
      latestEarnings,
      earningsSource:
        latestEarnings !== null
          ? `${earningsSource}_CALCULATED_EPS`
          : earningsSource,
    };
  } catch (error) {
    console.error(`❌ Error fetching ${symbol}:`, error.message);
    return {
      symbol,
      cmp: 0,
      peRatio: null,
      latestEarnings: null,
      earningsSource: "ERROR",
    };
  }
}

module.exports = { getStockData };
