-- Reuse configured model profiles and the existing durable usage ledger.
ALTER TABLE neural_usage DROP CONSTRAINT neural_usage_task_check;
ALTER TABLE neural_usage ADD CONSTRAINT neural_usage_task_check
  CHECK(task IN ('conversation_summary','work_order_prices','finance_classification'));
