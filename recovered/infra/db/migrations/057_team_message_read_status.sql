-- SPDX-License-Identifier: MIT
-- Sender-side status polling reads a small explicit message batch, including
-- receipts that did not change the message's content cursor.
CREATE INDEX team_message_reads_message_version ON team_message_reads(message_id,message_version);
