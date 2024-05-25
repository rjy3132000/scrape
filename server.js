const express = require("express");
const cors = require("cors");
const connectDb = require("./utlis/databaseConnection");
const { setupCronJobs } = require('./utlis/scheduler');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


app.use(cors());
app.use(express.json());

const TIMEOUT_DURATION = 1000 * 60 * 10; // 10 minutes
app.use((req, res, next) => {
  res.setTimeout(TIMEOUT_DURATION, () => {
    console.error('Request has timed out.');
    res.status(503).send('Request timed out');
  });
  next();
});

// Connect to MongoDB
connectDb();

app.use("/api", require("./routes/allProductsRoute"));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Call the function that sets up the cron job
setupCronJobs();
