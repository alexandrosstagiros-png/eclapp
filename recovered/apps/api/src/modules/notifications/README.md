# MAX urgent notifications

No sender runs by default. Set `MAX_NOTIFICATIONS_ENABLED=true`, the existing
`MAX_BOT_TOKEN`, and an independent random `MAX_WEBHOOK_SECRET` (32–256 URL-safe
characters) only after installing migrations 022 and 023. `MAX_CA_FILE` may point
to a PEM trust bundle; its CAs are added to Node's normal trust store for this
MAX HTTPS client only. TLS verification always remains enabled.

Register `https://<application-host>/api/v1/integrations/max/webhook` with MAX for
`bot_started`, `bot_stopped`, `dialog_muted`, `dialog_unmuted`, `dialog_removed`,
and `message_callback`. MAX must send `X-Max-Bot-Api-Secret`. The sender uses the
fixed origin `https://platform-api2.max.ru`; it never follows arbitrary URLs.
Do not put tokens, signed initData, webhook bodies or callback tokens in logs.

## Linking and employee interface

Authenticated routes share the normal application bearer session:

- `POST /notifications/max/link {initData}` validates fresh MAX-signed identity
  and binds it to the current approved employee. Existing matching binding is
  idempotent. Conflicts return 409. Invalid or expired MAX data returns 400,
  independently of a valid phone session. Expired application sessions return 401.
- `GET /notifications/status` returns
  `{enabled,maxLinked,botStarted,muted,pending,acked,failed,botUrl}`.
- `GET /notifications` returns the latest 20 currently accessible own notices as
  `{items:[{id,type,title,body,createdAt,acknowledgedAt,entityType,entityId,isEscalation,deliveryStatus}]}`.
- `POST /notifications/:id/ack` returns `{ok:true,acknowledgedAt}` idempotently.

Phone login does not bind or route by telephone. Signed lifecycle updates must
confirm that the user has started the bot before messages can be sent. A mute or
stop defers delivery. For mute, employees should open the MAX chat settings and
enable notifications; no custom unmute command is implemented.

## Dispatcher messages

Only current scoped `dispatcher` and `access_admin` actors may call:

- `GET /notifications/scopes` → `{items:[{id,legalEntityId,regionId,projectId,responsibilityScopeId,name,projectName,regionName,legalEntityName}]}`.
- `GET /notifications/recipients?scopeId=UUID` →
  `{items:[{id,displayName,role,maxLinked}]}`. Names are masked when the actor lacks
  personal-data visibility. Only active approved employees in the exact scope
  are listed.
- `POST /notifications/messages {recipientIds,responsibilityScopeId,title,body,idempotencyKey}`:
  explicitly select 1–50 employees, title 1–120 characters, body 1–2000 characters,
  UUID idempotency key. Returns `{eventId,notificationIds}`. Reusing a key with
  different content returns 409; disabled notifications return 503.

No implicit all-staff broadcast exists. Unlinked recipients can read and ACK in
the application; bot delivery waits for their verified binding and bot start.

## Transactional event contract

Call `enqueueNotification(client, {eventKey,type,recipientIds,scope,title,body,
entityType,entityId,actorId?,correlationId?,occurredAt?})` inside the domain
transaction. `scope` is the exact four-ID grant tuple. Public event types are
`trip_assigned`, `trip_changed`, `dispatcher_message`, `documents_overdue`.
The stable event key deduplicates retries and rejects different content.
Disabled sending is a no-op. Events before the persisted first enabled cutoff
are skipped; `MAX_NOTIFICATIONS_ENABLED_AT` optionally specifies that cutoff.
The helper and sender check current active/approved scope membership. Drivers
also need a current assignment for `entityType: 'trip'`.

## Delivery, acknowledgment and operational limits

The worker runs every 500 ms with database leases of 30 seconds and HTTPS
timeouts of 6 seconds. It sends to the verified MAX user ID with `notify:true`
and a `Принял` callback button. Per-dialog rate reservations enforce at most
two requests a second. User, notification, delivery and dialog locks protect
the final authorization check through the bounded HTTP call. Escalation delivery
locks the original notification before its own row and rechecks the original ACK
before HTTP, so an already acknowledged original cancels the escalation.

Successful MAX HTTP response records delivery, **not acknowledgment**. ACK needs
the recipient's signed webhook plus a random opaque token whose SHA-256 hash is
bound to that user and delivery, or the employee's own authenticated ACK route.
Hashes expire after seven days. ACK is idempotent and stops pending delivery.
Callbacks need no live mini-app session. Confirmations are queued separately for
up to 60 seconds and three attempts. Network uncertainty can produce duplicate
messages; genuine buttons from every attempt remain valid.

Each delivery has at most six attempts, exponential backoff starting at 10 s,
capped at 15 minutes, honoring bounded MAX `Retry-After`. Unlinked/stopped/muted
dialogs wait without spending HTTP attempts. Default expiry is 24 hours
(`MAX_NOTIFICATION_TTL_SECONDS`, 900–604800). A stopped chat or rejected bot token
returned by MAX terminates that delivery.

One reminder is queued 5 minutes after the first successful delivery
(`MAX_NOTIFICATION_REMINDER_SECONDS`, 60–3600). One escalation is queued
15 minutes after initial creation (`MAX_NOTIFICATION_ESCALATION_SECONDS`,
120–86400 and greater than reminder interval) to at most 20 active approved
MAX-linked dispatchers/access administrators in the same scope. Escalations
neither remind nor escalate recursively. If no supervisor is linked then,
the audit records zero recipients; no indefinite repeated broadcast is made.

`NODE_ENV=test` creates no network sender or timer; tests inject a fake port into
`NotificationsWorker.runOnce(port)`. The adapter itself also rejects network
requests in test mode. Source scans and tests must use synthetic users and tokens.

Official protocol references:
[send messages](https://dev.max.ru/docs-api/methods/POST/messages),
[subscriptions](https://dev.max.ru/docs-api/methods/POST/subscriptions),
[updates](https://dev.max.ru/docs-api/objects/Update),
[callback answers](https://dev.max.ru/docs-api/methods/POST/answers).
