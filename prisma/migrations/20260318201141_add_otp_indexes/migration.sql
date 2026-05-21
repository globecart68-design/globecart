-- CreateIndex
CREATE INDEX "OTPCode_phone_verified_expiresAt_idx" ON "OTPCode"("phone", "verified", "expiresAt");

-- CreateIndex
CREATE INDEX "OTPCode_email_verified_expiresAt_idx" ON "OTPCode"("email", "verified", "expiresAt");
