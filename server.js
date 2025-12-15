const express = require('express');
const cors = require('cors');

const portfolioRoutes = require('./routes/portfolio.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', portfolioRoutes);
app.use('/', (req, res) => {
  res.send('Portfolio Manager API is running');
});

module.exports = app;
