-- Storage bucket for project preview screenshots
-- Run via: supabase storage create previews (or apply via dashboard)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'previews',
  'previews',
  true,              -- public bucket so preview URLs work without auth
  524288,            -- 512 KB max per file (thumbnails are tiny)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to previews/projects/<their-user-id>/
CREATE POLICY "users can upload own previews"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'previews'
    AND (storage.foldername(name))[1] = 'projects'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Public read
CREATE POLICY "previews are public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'previews');

-- Users can update / delete their own previews
CREATE POLICY "users can manage own previews"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'previews'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
