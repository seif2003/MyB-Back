const bcrypt = require('bcrypt');
const env = require('../config/env');

const hashPassword = (password) => bcrypt.hash(`${password}${env.passwordPepper}`, 12);
const verifyPassword = (password, hash) => bcrypt.compare(`${password}${env.passwordPepper}`, hash);

module.exports = {
  hashPassword,
  verifyPassword
};
