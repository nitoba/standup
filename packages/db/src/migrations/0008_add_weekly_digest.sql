-- Add email_theme preference to user_settings
ALTER TABLE user_settings
ADD COLUMN email_theme TEXT NOT NULL DEFAULT 'dark';
--> statement-breakpoint
-- Weekly digest tracking table
CREATE TABLE IF NOT EXISTS weekly_digests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user (id),
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    standup_ids TEXT NOT NULL DEFAULT '[]',
    insights TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN (
            'pending',
            'sending',
            'sent',
            'unknown',
            'failed',
            'skipped'
        )
    ),
    error TEXT,
    sent_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);