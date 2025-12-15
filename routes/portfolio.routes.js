const express = require('express');
const router = express.Router();

const { getPortfolioData } = require('../services/portfolio.service');

router.get('/portfolio', async (req, res) => {
  try {
    const data = await getPortfolioData();
    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to load portfolio data'
    });
  }
});

module.exports = router;
