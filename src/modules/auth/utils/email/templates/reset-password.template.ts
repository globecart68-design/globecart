export const resetPasswordEmailTemplate = (code: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Reset your Globecart password</title>
</head>
<body style="margin:0; padding:40px 16px; background:#0f0f0f; font-family: Arial, sans-serif;">
  <div style="max-width:500px; margin:0 auto; background:#1a1a1a; border-radius:16px; padding:40px 30px; text-align:center; color:#ffffff;">

    <div style="font-size:36px; margin-bottom:16px;">🔑</div>
    <h2 style="margin:0 0 8px; font-size:22px; color:#ffffff;">Reset your password</h2>
    <p style="color:#aaaaaa; font-size:14px; margin:0 0 30px;">
      Enter the code below in the app to choose a new password.
    </p>

    <!-- RESET CODE BOX -->
    <div style="margin:0 0 24px; padding:24px 20px; background:#000000; border-radius:12px; border:1px solid #2a2a2a;">
      <span style="font-size:36px; letter-spacing:10px; font-weight:bold; color:#ffffff;">
        ${code}
      </span>
    </div>

    <p style="font-size:13px; color:#888888; margin:0 0 30px;">
      ⏱ This code expires in <strong style="color:#aaaaaa;">30 minutes</strong>.
    </p>

    <hr style="border:none; border-top:1px solid #2a2a2a; margin:0 0 24px;" />

    <p style="font-size:12px; color:#666666; margin:0 0 16px;">
      If you didn't request a password reset, you can safely ignore this email — your password won't change.
    </p>
    <p style="font-size:12px; color:#444444; margin:0;">
      © ${new Date().getFullYear()} Globecart. All rights reserved.
    </p>

  </div>
</body>
</html>
`;