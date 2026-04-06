-- Migration 0005: Convert 'published' status to 'approved'
-- The bot no longer uses 'published' status since we switched to DM-only mode.
-- This migration converts any existing 'published' standups to 'approved'.

UPDATE standups SET status = 'approved' WHERE status = 'published';
