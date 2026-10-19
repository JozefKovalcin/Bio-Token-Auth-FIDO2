-- AlterTable
ALTER TABLE "User" ADD COLUMN     "securityVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Pending" ADD COLUMN     "oldSessionHash" TEXT,
ADD COLUMN     "passwordVerifiedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "securityVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "authTime" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "credentialId" UUID,
ADD COLUMN     "deviceId" UUID,
ADD COLUMN     "factors" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'A',
ADD COLUMN     "securityVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sourceTransactionId" UUID;

-- CreateTable
CREATE TABLE "WebAuthnCredential" (
    "id" UUID NOT NULL,
    "credentialId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "userHandle" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'CANDIDATE',
    "rpId" TEXT NOT NULL,
    "aaguid" TEXT NOT NULL,
    "transports" TEXT[],
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "deviceType" TEXT NOT NULL,
    "attestationVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proofAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthTransaction" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID,
    "mode" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "challenge" TEXT,
    "userHandle" TEXT,
    "credentialId" UUID,
    "deviceId" UUID,
    "securityVersion" INTEGER,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "passwordVerifiedAt" TIMESTAMPTZ(3),
    "webauthnVerifiedAt" TIMESTAMPTZ(3),
    "mobileVerifiedAt" TIMESTAMPTZ(3),
    "mobileChallenge" TEXT,
    "mobileTokenHash" TEXT,
    "sourceSessionHash" TEXT,
    "oldSessionHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReauthGrant" (
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "securityVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ReauthGrant_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "MobileDevice" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "approvalPublicJwk" JSONB NOT NULL,
    "authPublicJwk" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
    "trustLevel" TEXT NOT NULL,
    "trustEvidence" JSONB,
    "label" TEXT NOT NULL DEFAULT 'Android',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MobileDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairingRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "browserSessionHash" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pendingDeviceId" UUID,
    "challenge" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'PAIRING',
    "securityVersion" INTEGER NOT NULL,
    "confirmationCode" TEXT,

    CONSTRAINT "PairingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileChallenge" (
    "id" UUID NOT NULL,
    "deviceId" UUID,
    "pairingId" UUID,
    "transactionId" UUID,
    "purpose" TEXT NOT NULL,
    "signingInput" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "requestHash" TEXT,

    CONSTRAINT "MobileChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnCredential_userHandle_key" ON "WebAuthnCredential"("userHandle");

-- CreateIndex
CREATE INDEX "WebAuthnCredential_userId_profile_state_idx" ON "WebAuthnCredential"("userId", "profile", "state");

-- CreateIndex
CREATE UNIQUE INDEX "AuthTransaction_tokenHash_key" ON "AuthTransaction"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "AuthTransaction_mobileTokenHash_key" ON "AuthTransaction"("mobileTokenHash");

-- CreateIndex
CREATE INDEX "AuthTransaction_userId_state_idx" ON "AuthTransaction"("userId", "state");

-- CreateIndex
CREATE INDEX "AuthTransaction_expiresAt_idx" ON "AuthTransaction"("expiresAt");

-- CreateIndex
CREATE INDEX "ReauthGrant_expiresAt_idx" ON "ReauthGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "MobileDevice_userId_status_idx" ON "MobileDevice"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PairingRequest_tokenHash_key" ON "PairingRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "PairingRequest_userId_status_idx" ON "PairingRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "PairingRequest_expiresAt_idx" ON "PairingRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "MobileChallenge_expiresAt_idx" ON "MobileChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "MobileChallenge_deviceId_idx" ON "MobileChallenge"("deviceId");

-- CreateIndex
CREATE INDEX "MobileChallenge_transactionId_idx" ON "MobileChallenge"("transactionId");

-- CreateIndex
CREATE INDEX "MobileChallenge_pairingId_idx" ON "MobileChallenge"("pairingId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sourceTransactionId_key" ON "Session"("sourceTransactionId");

-- AddForeignKey
ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthTransaction" ADD CONSTRAINT "AuthTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReauthGrant" ADD CONSTRAINT "ReauthGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileDevice" ADD CONSTRAINT "MobileDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairingRequest" ADD CONSTRAINT "PairingRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileChallenge" ADD CONSTRAINT "MobileChallenge_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileChallenge" ADD CONSTRAINT "MobileChallenge_pairingId_fkey" FOREIGN KEY ("pairingId") REFERENCES "PairingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileChallenge" ADD CONSTRAINT "MobileChallenge_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "AuthTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing sessions contain no historical factor evidence. Require a new login.
DELETE FROM "Session";
DELETE FROM "Pending";

ALTER TABLE "User" ADD CONSTRAINT "User_allowedModes_check" CHECK
  (cardinality("allowedModes") BETWEEN 1 AND 3 AND "allowedModes" <@ ARRAY['A','B','C']::text[]);
ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_profile_check" CHECK ("profile" IN ('B','C')),
  ADD CONSTRAINT "WebAuthnCredential_state_check" CHECK ("state" IN ('CANDIDATE','ACTIVE','REVOKED')),
  ADD CONSTRAINT "WebAuthnCredential_counter_check" CHECK ("counter" >= 0 AND "version" > 0);
ALTER TABLE "AuthTransaction" ADD CONSTRAINT "AuthTransaction_mode_check" CHECK ("mode" IN ('B','C')),
  ADD CONSTRAINT "AuthTransaction_purpose_check" CHECK ("purpose" IN ('REGISTER','ACTIVATE','PAIRING','LOGIN','C_ACTIVATION')),
  ADD CONSTRAINT "AuthTransaction_state_check" CHECK ("state" IN ('PENDING_REGISTRATION','PENDING_YUBIKEY','PENDING_MOBILE','APPROVED','VERIFIED_YUBIKEY','VERIFIED_C','CONSUMED','EXPIRED','REJECTED','CANCELLED')),
  ADD CONSTRAINT "AuthTransaction_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5 AND "version" > 0);
ALTER TABLE "Session" ADD CONSTRAINT "Session_mode_check" CHECK ("mode" IN ('A','B','C'));
ALTER TABLE "ReauthGrant" ADD CONSTRAINT "ReauthGrant_scope_check" CHECK ("scope" IN ('ENROLL','REVOKE','POLICY'));
ALTER TABLE "MobileDevice" ADD CONSTRAINT "MobileDevice_status_check" CHECK ("status" IN ('CANDIDATE','AWAITING_PC_CONFIRMATION','ACTIVE','REVOKED'));
ALTER TABLE "PairingRequest" ADD CONSTRAINT "PairingRequest_status_check" CHECK ("status" IN ('PENDING','CANDIDATE','AWAITING_PC_CONFIRMATION','CONFIRMED','CANCELLED','EXPIRED'));

-- No account FK: retain a minimal security record after account deletion.
CREATE TABLE "AuditEvent" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" UUID,
  "event" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
