global.TextEncoder = require("util").TextEncoder;
global.TextDecoder = require("util").TextDecoder;
const express = require('express');
const cors = require('cors')
require('dotenv').config()
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 3000;
const eventsRouter = require('./src/routes/events');
const mongoose = require('mongoose');
const connectionString = process.env.ATLAS_URI;

mongoose.connect(connectionString);

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.use(cors()) // To handle cross-origin requests

app.get('/', (req, res) => {
  res.json({ 'message': 'ok' });
})

app.use('/events', eventsRouter);

/* Error handler middleware */
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  console.error(err.message, err.stack);
  res.status(statusCode).json({ 'message': err.message });

  return;
});

app.listen(port, async () => {
  console.log(`App listening at http://localhost:${port}`)
})