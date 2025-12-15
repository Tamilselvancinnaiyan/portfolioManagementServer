const portfolio = require('../data/portfolio.json');
const { getStockData } = require('./yahoo.service');
const cache = require('../cache/memoryCache');

let limit; 

async function getLimit() {
  if (!limit) {
    const pLimit = (await import('p-limit')).default;
    limit = pLimit(2); 
  }
  return limit;
}

async function getPortfolioData() {
  try {
    const cached = cache.get('portfolio');
    if (cached) return cached;

    const totalInvestment = portfolio.reduce(
      (sum, stock) => sum + stock.purchasePrice * stock.quantity,
      0
    );

    const limiter = await getLimit();

    const enriched = await Promise.all(
      portfolio.map((stock) =>
        limiter(async () => {
          const investment = stock.purchasePrice * stock.quantity;

          const {
            cmp,
            peRatio,
            latestEarnings,
          } = await getStockData(stock.symbol);

          const presentValue = Number((cmp * stock.quantity).toFixed(2));
          const gainLoss = Number((presentValue - investment).toFixed(2));

          return {
            ...stock,
            investment,
            cmp,
            presentValue,
            gainLoss,
            peRatio,
            latestEarnings,
          };
        })
      )
    );

    const withPortfolioPercent = enriched.map(stock => ({
      ...stock,
      portfolioPercent: Number(
        ((stock.investment / totalInvestment) * 100).toFixed(2)
      ),
    }));

    cache.set('portfolio', withPortfolioPercent);
    return withPortfolioPercent;

  } catch (error) {
    console.error('Error building portfolio:', error);
    throw error;
  }
}

module.exports = { getPortfolioData };
