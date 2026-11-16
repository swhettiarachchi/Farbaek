-- Farbaek schema v99: searching your own chat messages reads only your rows (stage 199, ADR 0213).
--
-- The sidebar's search looks for words in a person's messages (row level security shows only their own).
-- Without an index on the owner, each search read every chat message in the database first. v98 was
-- applied before this index was added, so it comes as its own migration.

create index if not exists chat_messages_owner_idx on public.chat_messages (owner_id, created_at desc);
