const express = require('express');
const cors = require('cors');

const portfolioRoutes = require('./routes/portfolio.routes');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/', portfolioRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
