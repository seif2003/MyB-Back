const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const env = require('./config/env');
const apiRateLimit = require('./middleware/rateLimit');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true
  })
);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));
app.use(apiRateLimit);

app.use('/api', routes);

app.use(errorHandler);

module.exports = app;
