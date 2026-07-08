-- AlterEnum
-- This will fail if there are rows in the `Business` table with the old enum values.
-- We need to handle any existing data first, if necessary.

BEGIN;

-- Step 1: Create the new enum type
CREATE TYPE "BusinessType_new" AS ENUM (
  'grocery_food',
  'fashion',
  'electronics',
  'home_and_living',
  'automotive',
  'books_and_education',
  'pets',
  'sports_and_outdoor',
  'health_and_beauty',
  'other'
);

-- Step 2: Update the column type (cast to new enum)
-- For existing records, we'll convert old enum values to 'other'
ALTER TABLE "Business" 
  ALTER COLUMN "businessType" DROP DEFAULT;

ALTER TABLE "Business"
  ALTER COLUMN "businessType" TYPE "BusinessType_new" USING 
    CASE 
      WHEN "businessType"::text = 'restaurant' THEN 'grocery_food'::"BusinessType_new"
      WHEN "businessType"::text = 'retail' THEN 'other'::"BusinessType_new"
      WHEN "businessType"::text = 'service' THEN 'other'::"BusinessType_new"
      WHEN "businessType"::text = 'logistics' THEN 'other'::"BusinessType_new"
      WHEN "businessType"::text = 'other' THEN 'other'::"BusinessType_new"
      ELSE 'other'::"BusinessType_new"
    END;

-- Step 3: Drop the old enum
DROP TYPE "BusinessType";

-- Step 4: Rename the new enum to match the original name
ALTER TYPE "BusinessType_new" RENAME TO "BusinessType";

COMMIT;
