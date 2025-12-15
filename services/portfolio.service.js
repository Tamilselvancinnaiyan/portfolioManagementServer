const portfolio = require("../data/portfolio.json");
const { getStockData } = require("./yahoo.service");
const cache = require("../cache/memoryCache");

async function getPortfolioData() {
  const cached = cache.get("portfolio");
  if (cached) return cached;

  const totalInvestment = portfolio.reduce(
    (sum, s) => sum + s.purchasePrice * s.quantity,
    0
  );

  const enriched = await Promise.all(
    portfolio.map(async (stock) => {
      const market = await getStockData(stock.symbol);

      const investment = stock.purchasePrice * stock.quantity;
      const presentValue = (market?.cmp ?? 0) * stock.quantity;
      const gainLoss = presentValue - investment;

      return {
        ...stock,
        investment,
        cmp: market?.cmp ?? 0,
        presentValue: Number(presentValue.toFixed(2)),
        gainLoss: Number(gainLoss.toFixed(2)),
        peRatio: market?.peRatio ?? null,
        latestEarnings: market?.latestEarnings ?? null, 
        earningsSource: market?.earningsSource ?? null,
      };
    })
  );

  const result = enriched.map((s) => ({
    ...s,
    portfolioPercent: Number(
      ((s.investment / totalInvestment) * 100).toFixed(2)
    ),
  }));

  cache.set("portfolio", result);
  return result;
}

module.exports = { getPortfolioData };
