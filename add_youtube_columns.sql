-- Add YouTube upload tracking columns to generated_clips table
ALTER TABLE generated_clips 
ADD COLUMN IF NOT EXISTS youtube_id VARCHAR,
ADD COLUMN IF NOT EXISTS uploaded_to_channel VARCHAR,
ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP WITH TIME ZONE;
