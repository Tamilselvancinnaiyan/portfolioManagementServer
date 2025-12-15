const express = require('express');
const cors = require('cors');

const portfolioRoutes = require('./routes/portfolio.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', portfolioRoutes);

module.exports = app;
