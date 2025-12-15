const express = require('express');
const cors = require('cors');

const portfolioRoutes = require('./routes/portfolio.routes');

const app = express();


const allowedOrigins = [
  "http://localhost:3000",
  "https://portfolio-management-client-33zz.vercel.app",
];


app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json());

app.use('/api', portfolioRoutes);
app.use('/', (req, res) => {
  res.send('Portfolio Manager API is running');
});

module.exports = app;
