export const otpSmsTemplate = (code: string, appName = 'Globecart') =>
  `🔐 Your ${appName} verification code is: ${code}\n` +
  `It expires in 5 minutes.\n` +
  `If you did not request this, ignore this message.`;