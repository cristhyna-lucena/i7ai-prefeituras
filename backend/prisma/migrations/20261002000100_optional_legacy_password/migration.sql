-- New module identities do not have local credentials. Preserve legacy hashes.
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;
