-- Add face zone tracking to skin journal entries.
-- Stores selected zone IDs (e.g. 'chin', 'left_cheek') for each entry.
ALTER TABLE skin_journal
ADD COLUMN IF NOT EXISTS affected_zones TEXT[] DEFAULT '{}';
