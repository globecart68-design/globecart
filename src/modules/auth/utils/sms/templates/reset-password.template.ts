export const resetPasswordSmsTemplate = (code: string, appName = 'Globecart') =>
  `🔑 Your ${appName} password reset code is: ${code}\n` +
  `It expires in 30 minutes.\n` +
  `If you did not request this, ignore this message — your password won't change.`;