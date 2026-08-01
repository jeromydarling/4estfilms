-- Optional first name on the signup form. Nullable on purpose: every row
-- written before this migration has no name, and the form never requires one.
ALTER TABLE subscribers ADD COLUMN first_name TEXT;
