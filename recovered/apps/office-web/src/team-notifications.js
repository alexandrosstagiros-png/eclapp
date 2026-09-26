// In-app notifications only. Message text and access tokens are never persisted here.
export function createTeamNotificationCenter(React, { request }) {
  const { createElement: h, useState, useEffect, useRef } = React;
  return function TeamNotificationCenter({
    token,
    actor,
    onExpired,
    onOpenConversation,
  }) {
    const [open, setOpen] = useState(false),
      [snapshot, setSnapshot] = useState({
        items: [],
        count: 0,
        mentions: 0,
        hasMore: false,
      }),
      [toasts, setToasts] = useState([]),
      [error, setError] = useState("");
    const callbacks = useRef({ onExpired, onOpenConversation }),
      audioRef = useRef(null),
      wrapper = useRef(null);
    callbacks.current = { onExpired, onOpenConversation };
    useEffect(() => {
      const unlock = () => {
        try {
          if (!audioRef.current) {
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (Audio) audioRef.current = new Audio();
          }
          if (audioRef.current?.state === "suspended")
            audioRef.current.resume().catch(() => {});
        } catch {}
      };
      document.addEventListener("pointerdown", unlock);
      document.addEventListener("keydown", unlock);
      return () => {
        document.removeEventListener("pointerdown", unlock);
        document.removeEventListener("keydown", unlock);
        audioRef.current?.close().catch(() => {});
        audioRef.current = null;
      };
    }, []);
    function play(mention) {
      const context = audioRef.current;
      if (!context || context.state !== "running") return;
      try {
        const o = context.createOscillator(),
          g = context.createGain(),
          now = context.currentTime;
        o.type = "sine";
        o.frequency.setValueAtTime(mention ? 740 : 520, now);
        o.frequency.setValueAtTime(mention ? 880 : 660, now + 0.1);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.055, now + 0.018);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        o.connect(g);
        g.connect(context.destination);
        o.start(now);
        o.stop(now + 0.26);
      } catch {}
    }
    useEffect(() => {
      let active = true,
        inFlight = false,
        controller;
      const known = new Map();
      setSnapshot({ items: [], count: 0, mentions: 0, hasMore: false });
      setToasts([]);
      setError("");
      async function update() {
        if (inFlight || !active) return;
        inFlight = true;
        controller = new AbortController();
        try {
          const scopes = [
              { responsibilityScopeId: "company", name: "Команда" },
            ],
            results = await Promise.allSettled([
              request(
                "/team/unread",
                { signal: controller.signal },
                token,
              ).then((result) => ({ scope: scopes[0], result })),
            ]);
          if (!active || controller.signal.aborted) return;
          const allowed = new Set(scopes.map((s) => s.responsibilityScopeId));
          for (const key of known.keys())
            if (!allowed.has(key)) known.delete(key);
          const items = [],
            fresh = [];
          let count = 0,
            mentions = 0,
            hasMore = false,
            partial = false;
          results.forEach((entry, index) => {
            const id = scopes[index].responsibilityScopeId;
            if (entry.status !== "fulfilled") {
              partial = true;
              if ([401, 403, 404].includes(entry.reason?.status))
                known.delete(id);
              if (entry.reason?.status === 401) callbacks.current.onExpired?.();
              return;
            }
            const { scope, result } = entry.value,
              rows = result.notifications || [],
              prior = known.get(id),
              cursor = rows.reduce((value, row) => {
                const next = BigInt(row.changeCursor || 0);
                return next > value ? next : value;
              }, prior?.cursor || 0n);
            for (const row of rows) {
              const item = {
                ...row,
                scopeId: row.responsibilityScopeId,
                scopeName: "Команда",
                key: `${row.responsibilityScopeId}:${row.notificationId}`,
              };
              items.push(item);
              if (
                prior &&
                !prior.ids.has(row.notificationId) &&
                BigInt(row.changeCursor || 0) > prior.cursor
              )
                fresh.push(item);
            }
            known.set(id, {
              cursor,
              ids: new Set(rows.map((row) => row.notificationId)),
            });
            count += result.totalUnreadCount || 0;
            mentions += result.totalUnreadMentionCount || 0;
            hasMore = hasMore || result.hasMore;
          });
          items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          setSnapshot({ items, count, mentions, hasMore });
          setError(
            partial
              ? "Часть уведомлений пока недоступна. Повторяем проверку…"
              : "",
          );
          const liveKeys = new Set(items.map((item) => item.key));
          setToasts((previous) =>
            [
              ...previous.filter(
                (item) => liveKeys.has(item.key) && item.expires > Date.now(),
              ),
              ...fresh
                .filter((item) => item.shouldNotify)
                .map((item) => ({ ...item, expires: Date.now() + 8000 })),
            ].slice(-3),
          );
          const sound = fresh.filter((item) => item.shouldPlaySound);
          if (sound.length) play(sound.some((item) => item.isMention));
        } catch (reason) {
          if (active && !controller.signal.aborted) {
            setSnapshot({ items: [], count: 0, mentions: 0, hasMore: false });
            setToasts([]);
            setError("Не удалось обновить уведомления.");
            if (reason.status === 401) callbacks.current.onExpired?.();
            if ([401, 403].includes(reason.status)) known.clear();
          }
        } finally {
          inFlight = false;
        }
      }
      update();
      const timer = setInterval(update, 12000),
        expire = setInterval(
          () =>
            setToasts((previous) =>
              previous.filter((item) => item.expires > Date.now()),
            ),
          1000,
        );
      window.addEventListener("team-notifications-changed", update);
      window.addEventListener("focus", update);
      return () => {
        active = false;
        controller?.abort();
        clearInterval(timer);
        clearInterval(expire);
        window.removeEventListener("team-notifications-changed", update);
        window.removeEventListener("focus", update);
      };
    }, [token, actor.id]);
    useEffect(() => {
      if (!open) return;
      const outside = (e) => {
        if (!wrapper.current?.contains(e.target)) setOpen(false);
      };
      const key = (e) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("pointerdown", outside);
      document.addEventListener("keydown", key);
      return () => {
        document.removeEventListener("pointerdown", outside);
        document.removeEventListener("keydown", key);
      };
    }, [open]);
    function openItem(item) {
      callbacks.current.onOpenConversation?.({
        scopeId: item.scopeId,
        conversationId: item.conversationId,
        messageId: item.messageId,
        parentId: item.parentId,
      });
      setOpen(false);
      setToasts((value) => value.filter((row) => row.key !== item.key));
    }
    const preview = (item) => item.text?.slice(0, 140) || "Вложение";
    return h(
      "div",
      { className: "team-notification-center", ref: wrapper },
      h(
        "button",
        {
          type: "button",
          className: "icon-button team-notification-trigger",
          "aria-label": `Уведомления команды: ${snapshot.count} непрочитанных, ${snapshot.mentions} упоминаний`,
          "aria-expanded": open,
          onClick: () => setOpen((value) => !value),
        },
        h(
          "svg",
          {
            width: 18,
            height: 18,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.7,
            "aria-hidden": true,
          },
          h("path", {
            d: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
          }),
        ),
        h("span", { className: "team-bell-label" }, "Команда"),
        snapshot.count > 0 &&
          h(
            "span",
            { className: "team-unread-count" },
            snapshot.count > 999 ? "999+" : snapshot.count,
          ),
        snapshot.mentions > 0 &&
          h(
            "span",
            { className: "team-unread-mentions" },
            `@${snapshot.mentions}`,
          ),
      ),
      open &&
        h(
          "section",
          {
            className: "team-notification-dropdown",
            "aria-label": "Непрочитанные сообщения команды",
          },
          h(
            "header",
            null,
            h("strong", null, "Непрочитанное"),
            h(
              "button",
              {
                type: "button",
                className: "button",
                onClick: () => setOpen(false),
                "aria-label": "Закрыть уведомления",
              },
              "×",
            ),
          ),
          error &&
            h(
              "p",
              { className: "team-notification-error", role: "status" },
              error,
            ),
          !snapshot.items.length &&
            h(
              "p",
              { className: "team-notification-quiet" },
              "Новых сообщений нет",
            ),
          ...snapshot.items.map((item) =>
            h(
              "button",
              {
                type: "button",
                key: item.key,
                className: `team-notification-entry${item.isMention ? " is-mention" : ""}`,
                onClick: () => openItem(item),
              },
              h(
                "strong",
                null,
                item.isMention
                  ? "@ Вас упомянули"
                  : item.authorName || "Сообщение",
              ),
              h("span", null, preview(item)),
              h(
                "small",
                null,
                `${item.authorName || "Сотрудник"} · ${new Date(item.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
              ),
            ),
          ),
          snapshot.hasMore &&
            h(
              "p",
              { className: "team-notification-quiet" },
              "Показаны последние уведомления. Полные счётчики доступны у каждого чата.",
            ),
        ),
      toasts.length > 0 &&
        h(
          "div",
          { className: "team-toast-stack", "aria-live": "polite" },
          ...toasts.map((item) =>
            h(
              "div",
              {
                key: item.key,
                className: `team-toast${item.isMention ? " is-mention" : ""}`,
              },
              h(
                "button",
                { type: "button", onClick: () => openItem(item) },
                h(
                  "strong",
                  null,
                  item.isMention
                    ? "@ Вас упомянули"
                    : item.authorName || "Новое сообщение",
                ),
                h("p", null, preview(item)),
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "team-toast-dismiss",
                  onClick: () =>
                    setToasts((value) =>
                      value.filter((row) => row.key !== item.key),
                    ),
                },
                "Скрыть",
              ),
            ),
          ),
        ),
    );
  };
}
