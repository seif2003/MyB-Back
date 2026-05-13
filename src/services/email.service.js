const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465,
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass
  }
});

const sendOtpEmail = async (to, code) => {
  const subject = 'MYB security code';
  const text = `Your MYB verification code is: ${code}. It expires in ${env.otpExpiresMinutes} minutes.`;

  if (env.nodeEnv !== 'production') {
    console.log(`[DEV OTP] ${to}: ${code}`);
  }

  try {
    await transporter.sendMail({
      from: env.smtp.from,
      to,
      subject,
      text
    });
  } catch (err) {
    console.warn('OTP email failed:', err.message);
  }
};

module.exports = {
  sendOtpEmail
};
