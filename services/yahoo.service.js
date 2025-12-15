const YahooFinance = require("yahoo-finance2").default;

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});


function normalizeSymbol(symbol) {
  if (symbol.includes(".")) return symbol;

  return `${symbol}.NS`;
}

async function getStockData(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);

  const quote = await yahooFinance.quote(normalizedSymbol);


  if (!quote) {
    console.warn(`Yahoo returned no data for ${normalizedSymbol}`);
    return {
      symbol: normalizedSymbol,
      cmp: 0,
      peRatio: null,
      latestEarnings: null,
    };
  }

  return {
    symbol: quote.symbol,
    cmp: quote.regularMarketPrice ?? 0,
    peRatio: quote.trailingPE ?? null,
    latestEarnings: quote.trailingEps ?? null,
  };
}

module.exports = { getStockData };
