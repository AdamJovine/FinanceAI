const express = require('express');
const cors = require('cors');
const sentimentRouter = require('./routes/sentiment');

const app = express();
app.use(cors());

app.use('/api/sentiment', sentimentRouter);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
