-- The owner remains fail-closed until an explicit canonical users.id is bound.
-- Bootstrap must be performed by a separately reviewed, owner-controlled operation.
ALTER TABLE admin_owner
  ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE admin_owner
  ADD CONSTRAINT admin_owner_user_id_unique UNIQUE (user_id);
