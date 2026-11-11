-- Printed cards (Nov 2026) carry https://society.prologuebooks.co.uk/m/<Airtable record ID>.
-- Accept those IDs as card codes, and allow spare cards that aren't yet given to a member.
alter table member_tokens drop constraint if exists member_tokens_token_check;
alter table member_tokens add constraint member_tokens_token_check
  check (token ~ '^(PS-[0-9A-Z]{8}|rec[A-Za-z0-9]{14})$');
alter table member_tokens alter column member_id drop not null;
alter table member_tokens add column if not exists label text;          -- e.g. "Spare card 07"
alter table member_tokens add column if not exists card_number integer;  -- member number printed on the card
create index if not exists member_tokens_spare on member_tokens (card_number) where member_id is null;
