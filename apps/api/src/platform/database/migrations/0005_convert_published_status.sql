-- Migration 0005: Convert 'published' status to 'approved' and clean duplicates
-- The bot no longer uses 'published' status since we switched to DM-only mode.
-- This migration converts any existing 'published' standups to 'approved'.
-- It also removes duplicate standups (keeping the one with highest updatedAt).

-- First, convert published to approved
UPDATE standups SET status = 'approved' WHERE status = 'published';

-- Remove duplicates, keeping the record with the highest updatedAt for each user_id/date
DELETE FROM standups WHERE id IN (
  SELECT s1.id FROM standups s1
  WHERE EXISTS (
    SELECT 1 FROM standups s2
    WHERE s2.user_id = s1.user_id
    AND s2.date = s1.date
    AND s2.updated_at > s1.updated_at
  )
);
