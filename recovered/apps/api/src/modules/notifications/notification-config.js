'use strict';
function readNotificationConfig(env = process.env) {
  if (env.MAX_NOTIFICATIONS_ENABLED && !['true','false'].includes(env.MAX_NOTIFICATIONS_ENABLED)) throw new Error('Invalid MAX_NOTIFICATIONS_ENABLED');
  const enabled = env.MAX_NOTIFICATIONS_ENABLED === 'true';
  const integer = (name, fallback, min, max) => {
    const value = env[name] ?? String(fallback);
    if (!/^\d+$/.test(value) || Number(value)<min || Number(value)>max) throw new Error(`Invalid ${name}`);
    return Number(value);
  };
  const botToken = env.MAX_BOT_TOKEN;
  const webhookSecret = env.MAX_WEBHOOK_SECRET;
  if (enabled && (!botToken || /\s/.test(botToken))) throw new Error('MAX_BOT_TOKEN required');
  if (enabled && (!webhookSecret || !/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret) || webhookSecret===botToken)) throw new Error('Independent MAX_WEBHOOK_SECRET required');
  const botUsername = env.MAX_BOT_USERNAME || 'id890202734370_bot';
  if (!/^[A-Za-z0-9_]{5,64}$/.test(botUsername)) throw new Error('Invalid MAX_BOT_USERNAME');
  const reminderSeconds = integer('MAX_NOTIFICATION_REMINDER_SECONDS',300,60,3600);
  const escalationSeconds = integer('MAX_NOTIFICATION_ESCALATION_SECONDS',900,120,86400);
  if (escalationSeconds <= reminderSeconds) throw new Error('Escalation must follow reminder');
  const enabledAt = env.MAX_NOTIFICATIONS_ENABLED_AT ? new Date(env.MAX_NOTIFICATIONS_ENABLED_AT) : null;
  if (enabledAt && !Number.isFinite(enabledAt.getTime())) throw new Error('Invalid MAX_NOTIFICATIONS_ENABLED_AT');
  return {enabled,botToken,webhookSecret,botUsername,caFile:env.MAX_CA_FILE,enabledAt,reminderSeconds,escalationSeconds,
    deliveryTtlSeconds:integer('MAX_NOTIFICATION_TTL_SECONDS',86400,900,604800),
    nodeEnv:env.NODE_ENV,botUrl:`https://max.ru/${botUsername}?start=notify`};
}
module.exports={readNotificationConfig};
