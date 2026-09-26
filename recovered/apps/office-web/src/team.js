import { createCompanyWorkRequest } from "./company-work-request.js";
// Company conversations retain their source scope for storage and audit; the directory is shared.
import { preparePhoto, createTeamMedia } from "./team-media.js";
import { createTeamResponseMetrics } from "./team-response-metrics.js";

const CATEGORIES = [
  ["task", "Задачи"],
  ["growth", "Возможности роста"],
  ["optimization", "Оптимизация"],
  ["risk", "Угрозы"],
];
const POLICY =
  "Корпоративная переписка, включая личные чаты, доступна уполномоченному администратору. Содержание может включаться в сводки, которыми администратор делится с сотрудниками.";
const scopeLabel = (scope) =>
  [
    scope.projectName,
    scope.regionName,
    scope.scopeName || scope.responsibilityScopeName,
  ]
    .filter(Boolean)
    .join(" · ") || "Проект";
const dateLabel = (value) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";
const uid = () => crypto.randomUUID();
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const EMOJIS = [
  "🙂",
  "😀",
  "😅",
  "😂",
  "😉",
  "😍",
  "👍",
  "👎",
  "👏",
  "🙏",
  "🎉",
  "🚀",
  "✅",
  "❗",
  "❓",
  "💡",
  "🔥",
  "💪",
  "❤️",
  "👀",
  "🤝",
  "📌",
  "📝",
  "😎",
];
const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅", "🙏"];
const COMMANDS = [
  ["task", "Задача", "Задача: "],
  ["decision", "Решение", "Решение: "],
  ["question", "Вопрос", "Вопрос: "],
  ["shrug", "Пожать плечами", "¯\\_(ツ)_/¯"],
  ["help", "Помощь по редактору", ""],
];
const mentionsFromText = (text) => ({
  userIds: [
    ...new Set(
      [...text.matchAll(/@\[[^\]\r\n]+\]\(user:([0-9a-f-]{36})\)/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort(),
  all: /(^|[\s(])@all(?=$|[\s.,!?;:)\]])/.test(text),
});
const safeLink = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};
const fileSize = (bytes) =>
  bytes < 1024
    ? `${bytes} Б`
    : bytes < 1024 * 1024
      ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(bytes / 1024)} КБ`
      : `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} МБ`;
const messageLabel = (message) =>
  message.deletedAt
    ? "Удалённое сообщение"
    : message.text || message.attachments?.[0]?.filename || "Сообщение";
const knowledgeSort = new Intl.Collator("ru", {
  numeric: true,
  sensitivity: "base",
});
const articleFolderPath = (article) =>
  String(article.folderPath || "")
    .split("/")
    .filter(Boolean)
    .join("/");
const compareFolderPaths = (a, b) => {
  const left = a.split("/"),
    right = b.split("/");
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const order = knowledgeSort.compare(left[index], right[index]);
    if (order) return order;
  }
  return left.length - right.length;
};
const articleInFolder = (article, folder) => {
  const path = articleFolderPath(article);
  return (
    !folder ||
    (folder === "/" ? !path : path === folder || path.startsWith(`${folder}/`))
  );
};
const compareArticles = (a, b) =>
  knowledgeSort.compare(a.title, b.title) ||
  compareFolderPaths(articleFolderPath(a), articleFolderPath(b)) ||
  a.id.localeCompare(b.id);
const ARTICLE_PAGE_SIZE = 12;
const articleDraftValues = (article) => ({
  title: article.title || "",
  body: article.body || "",
  reason: article.reason || "",
  purpose: article.purpose || "",
  result: article.result || "",
  audiencePositionIds: [...(article.audiencePositionIds || [])].sort(),
  responsibilityScopeId: article.responsibilityScopeId || "",
});
const readAttachment = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.includes(","))
        reject(new Error("Не удалось прочитать файл. Выберите его заново."));
      else resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reader.onabort = () =>
      reject(new Error("Не удалось прочитать файл. Выберите его заново."));
    reader.readAsDataURL(file);
  });
const normal = (value) =>
  String(value || "")
    .toLocaleLowerCase("ru")
    .trim();
const retainChangedRows = (current, incoming) => {
  const known = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !known.has(item.id))];
};
const mergeMessages = (before, after) => {
  const merged = new Map(before.map((item) => [item.id, item]));
  after.forEach((item) => {
    const previous = merged.get(item.id),
      beforeCursor = String(previous?.changeCursor || ""),
      afterCursor = String(item.changeCursor || "");
    if (
      previous &&
      /^\d+$/.test(beforeCursor) &&
      /^\d+$/.test(afterCursor) &&
      (beforeCursor.length > afterCursor.length ||
        (beforeCursor.length === afterCursor.length &&
          beforeCursor > afterCursor))
    )
      return;
    if (previous && Number(previous.version || 0) > Number(item.version || 0))
      return;
    merged.set(item.id, item);
  });
  return [...merged.values()].sort(
    (a, b) =>
      String(a.createdAt).localeCompare(String(b.createdAt)) ||
      a.id.localeCompare(b.id),
  );
};
const dateInput = (value) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
};

export function createTeamWorkspace(
  React,
  {
    request,
    download,
    loadFile,
    DriverRequests,
    TeamTasks,
    TeamOutcomes,
    ProfileAvatar,
    ProfileCard,
  },
) {
  const { createElement: h, useState, useRef, useEffect } = React;
  const { CaptureDialog, MediaAttachment } = createTeamMedia(React);
  const TeamResponseMetrics = createTeamResponseMetrics(React);
  const button = (label, onClick, props = {}) =>
    h(
      "button",
      { type: "button", className: "button", onClick, ...props },
      label,
    );
  const field = (label, input, hint) =>
    h(
      "label",
      { className: "team-field" },
      h("span", null, label),
      React.cloneElement(input, {
        "aria-label": input.props["aria-label"] || label,
      }),
      hint && h("small", null, hint),
    );
  const empty = (title, text, action) =>
    h(
      "div",
      { className: "team-empty" },
      h("span", { className: "team-empty-symbol", "aria-hidden": true }, "◇"),
      h("h2", null, title),
      h("p", null, text),
      action,
    );
  const errorBox = (text) =>
    text && h("div", { className: "team-error", role: "alert" }, text);

  function ActionMenu({ label, items, disabled = false, resetKey }) {
    const [open, setOpen] = useState(false),
      root = useRef(null),
      trigger = useRef(null),
      popup = useRef(null),
      menuId = React.useId();
    const actions = items.filter(Boolean);
    const close = (restoreFocus = false) => {
      if (restoreFocus) trigger.current?.focus();
      setOpen(false);
    };
    React.useLayoutEffect(() => {
      if (!open) return;
      const element = popup.current;
      // The top layer keeps menus out of the message list's scroll clipping.
      element.showPopover?.();
      const anchor = trigger.current.getBoundingClientRect(),
        bounds = element.getBoundingClientRect(),
        viewport = window.visualViewport,
        left = viewport?.offsetLeft || 0,
        top = viewport?.offsetTop || 0,
        right = left + (viewport?.width || window.innerWidth),
        bottom = top + (viewport?.height || window.innerHeight);
      element.style.left = `${Math.max(left + 8, Math.min(anchor.right - bounds.width, right - bounds.width - 8))}px`;
      element.style.top = `${Math.max(top + 8, Math.min(anchor.bottom + bounds.height + 6 <= bottom - 8 ? anchor.bottom + 6 : anchor.top - bounds.height - 6, bottom - bounds.height - 8))}px`;
      element.querySelector("button:not(:disabled)")?.focus();
      const outside = (event) => {
        if (!root.current?.contains(event.target)) close();
      };
      const scroll = (event) => {
        if (!element.contains(event.target)) close();
      };
      const resize = () => close();
      document.addEventListener("pointerdown", outside);
      document.addEventListener("scroll", scroll, true);
      window.addEventListener("resize", resize);
      viewport?.addEventListener("resize", resize);
      return () => {
        document.removeEventListener("pointerdown", outside);
        document.removeEventListener("scroll", scroll, true);
        window.removeEventListener("resize", resize);
        viewport?.removeEventListener("resize", resize);
      };
    }, [open]);
    useEffect(() => {
      if (disabled) setOpen(false);
    }, [disabled]);
    useEffect(() => {
      if (popup.current?.contains(document.activeElement))
        trigger.current?.focus();
      setOpen(false);
    }, [resetKey]);
    if (!actions.length) return null;
    return h(
      "div",
      {
        className: "team-action-menu",
        ref: root,
        onBlur: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) close();
        },
        onKeyDown: (event) => {
          if (!open) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close(true);
          } else if (event.key === "Tab") {
            close(true);
          } else if (
            ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
          ) {
            event.preventDefault();
            const choices = [
                ...popup.current.querySelectorAll("button:not(:disabled)"),
              ],
              index = choices.indexOf(document.activeElement),
              next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? choices.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        choices.length) %
                      choices.length;
            choices[next]?.focus();
          }
        },
      },
      button(h("span", { "aria-hidden": true }, "⋯"), () => setOpen(!open), {
        className: "team-more-button",
        ref: trigger,
        disabled,
        title: label,
        "aria-label": label,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? menuId : undefined,
        onKeyDown: (event) => {
          if (!open && ["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        },
      }),
      open &&
        h(
          "div",
          {
            className: "team-action-popup",
            id: menuId,
            ref: popup,
            role: "menu",
            "aria-label": label,
            popover: "manual",
          },
          ...actions.map((action) =>
            button(
              h(
                React.Fragment,
                null,
                h(
                  "svg",
                  {
                    className: "team-action-icon",
                    width: 18,
                    height: 18,
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: 1.7,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    "aria-hidden": true,
                  },
                  h("path", {
                    d: {
                      reply: "M9 10 4 15l5 5M4 15h9a7 7 0 0 0 7-7V4",
                      edit: "m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z",
                      trash:
                        "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
                      bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
                      users:
                        "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
                      clock:
                        "M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
                      up: "m6 10 6-6 6 6M12 4v16",
                      down: "m6 14 6 6 6-6M12 4v16",
                      archive: "M3 3h18v5H3zM5 8v13h14V8M10 12h4",
                      restore: "M3 3h18v5H3zM5 8v13h14V8M9 15l3-3 3 3M12 12v6",
                    }[action.icon],
                  }),
                ),
                h("span", null, action.label),
              ),
              () => {
                close(true);
                action.onClick();
              },
              {
                key: action.icon,
                role: "menuitem",
                tabIndex: -1,
                "aria-label": action.ariaLabel || action.label,
                className: `team-action-item${action.danger ? " is-danger" : ""}${action.active ? " is-active" : ""}`,
                disabled: disabled || action.disabled,
              },
            ),
          ),
        ),
    );
  }

  function useChannelReorder({ enabled, items, onMove, resetKey }) {
    const [drag, setDrag] = useState(null),
      gesture = useRef(null),
      suppressedClick = useRef(null),
      callbacks = useRef({ enabled, items, onMove });
    callbacks.current = { enabled, items, onMove };
    const stop = () => {
      const current = gesture.current;
      if (!current) return null;
      clearTimeout(current.timer);
      cancelAnimationFrame(current.frame);
      gesture.current = null;
      document.body.classList.remove("team-channel-dragging");
      if (current.active) {
        suppressedClick.current = { until: Date.now() + 700 };
        setDrag(null);
      }
      return current;
    };
    useEffect(() => {
      const targetAt = (current) => {
        const node = document
            .elementFromPoint(current.x, current.y)
            ?.closest("[data-reorder-channel]"),
          target =
            node &&
            callbacks.current.items.find(
              (row) => row.id === node.dataset.reorderChannel,
            );
        let placement = null;
        if (
          target &&
          target.id !== current.item.id &&
          target.canManageChannel &&
          !target.archivedAt &&
          target.legalEntityId === current.item.legalEntityId
        ) {
          const bounds = node.getBoundingClientRect();
          placement =
            current.y < bounds.top + bounds.height / 2 ? "before" : "after";
        }
        const nextTarget = placement ? target : null;
        if (
          current.target?.id !== nextTarget?.id ||
          current.placement !== placement
        ) {
          current.target = nextTarget;
          current.placement = placement;
          setDrag({
            id: current.item.id,
            title: current.item.title,
            targetId: nextTarget?.id,
            placement,
          });
        }
      };
      const activate = (current) => {
        if (gesture.current !== current || !callbacks.current.enabled) return;
        current.active = true;
        clearTimeout(current.timer);
        current.node.focus({ preventScroll: true });
        document.body.classList.add("team-channel-dragging");
        setDrag({ id: current.item.id, title: current.item.title });
        let scrollParent = current.node.parentElement;
        while (
          scrollParent &&
          !(
            scrollParent.scrollHeight > scrollParent.clientHeight &&
            /auto|scroll/.test(getComputedStyle(scrollParent).overflowY)
          )
        )
          scrollParent = scrollParent.parentElement;
        current.scrollParent = scrollParent || document.scrollingElement;
        const tick = () => {
          if (gesture.current !== current || !current.active) return;
          const scroller = current.scrollParent,
            isPage = scroller === document.scrollingElement,
            rect = isPage
              ? { top: 0, bottom: innerHeight }
              : scroller.getBoundingClientRect(),
            top = Math.max(0, rect.top),
            bottom = Math.min(innerHeight, rect.bottom),
            step =
              current.y < top + 44 ? -10 : current.y > bottom - 44 ? 10 : 0;
          if (step) {
            scroller.scrollTop += step;
            targetAt(current);
          }
          current.frame = requestAnimationFrame(tick);
        };
        current.frame = requestAnimationFrame(tick);
      };
      const move = (event) => {
        const current = gesture.current;
        if (!current) return;
        if (
          current.touchId == null &&
          event.type === "mousemove" &&
          event.buttons === 0
        ) {
          stop();
          return;
        }
        if (event.type === "touchmove" && event.touches.length !== 1) {
          stop();
          return;
        }
        const point =
          current.touchId == null
            ? event
            : [...(event.touches || [])].find(
                (touch) => touch.identifier === current.touchId,
              );
        if (!point) return;
        current.x = point.clientX;
        current.y = point.clientY;
        const distance = Math.hypot(
          current.x - current.startX,
          current.y - current.startY,
        );
        if (!current.active) {
          if (current.touchId != null) {
            if (distance > 8) stop(); // A swipe scrolls; only a held touch reorders.
            return;
          }
          if (distance < 5) return;
          activate(current);
        }
        if (event.cancelable) event.preventDefault();
        targetAt(current);
      };
      const finish = (event) => {
        const current = gesture.current;
        if (!current) return;
        if (current.touchId != null && event.type === "mouseup") return;
        if (
          current.touchId != null &&
          ![...(event.changedTouches || [])].some(
            (touch) => touch.identifier === current.touchId,
          )
        )
          return;
        if (current.active && event.cancelable) event.preventDefault();
        const result = stop();
        if (result?.active && result.target && callbacks.current.enabled)
          callbacks.current.onMove(result.item, {
            targetId: result.target.id,
            targetVersion: result.target.version,
            placement: result.placement,
          });
      };
      const key = (event) => {
        if (event.key === "Escape" && gesture.current) {
          event.preventDefault();
          event.stopPropagation();
          stop();
        }
      };
      const cancel = () => stop();
      const scroll = () => {
        if (gesture.current && !gesture.current.active) stop();
      };
      const visibility = () => {
        if (document.hidden) stop();
      };
      const begin = (event) => {
        if (event.type === "touchstart" && event.touches.length !== 1) {
          stop();
          return;
        }
        const node = event.target.closest?.("[data-reorder-channel]");
        if (!node || !callbacks.current.enabled || gesture.current) return;
        const touch = event.type === "touchstart";
        if (touch ? event.touches.length !== 1 : event.button !== 0) return;
        const item = callbacks.current.items.find(
          (row) => row.id === node.dataset.reorderChannel,
        );
        if (!item?.canManageChannel || item.archivedAt) return;
        const point = touch ? event.touches[0] : event;
        const current = {
          item,
          node,
          touchId: touch ? point.identifier : null,
          x: point.clientX,
          y: point.clientY,
          startX: point.clientX,
          startY: point.clientY,
          active: false,
        };
        gesture.current = current;
        if (touch) current.timer = setTimeout(() => activate(current), 450);
      };
      document.addEventListener("mousedown", begin);
      document.addEventListener("touchstart", begin, { passive: true });
      document.addEventListener("mousemove", move);
      document.addEventListener("touchmove", move, { passive: false });
      document.addEventListener("mouseup", finish);
      document.addEventListener("touchend", finish, { passive: false });
      document.addEventListener("touchcancel", cancel);
      document.addEventListener("keydown", key, true);
      document.addEventListener("scroll", scroll, true);
      document.addEventListener("visibilitychange", visibility);
      window.addEventListener("blur", cancel);
      return () => {
        stop();
        document.removeEventListener("mousedown", begin);
        document.removeEventListener("touchstart", begin);
        document.removeEventListener("mousemove", move);
        document.removeEventListener("touchmove", move);
        document.removeEventListener("mouseup", finish);
        document.removeEventListener("touchend", finish);
        document.removeEventListener("touchcancel", cancel);
        document.removeEventListener("keydown", key, true);
        document.removeEventListener("scroll", scroll, true);
        document.removeEventListener("visibilitychange", visibility);
        window.removeEventListener("blur", cancel);
      };
    }, []);
    useEffect(() => {
      stop();
    }, [enabled, resetKey]);
    return {
      drag,
      suppressClick(event) {
        if (suppressedClick.current?.until > Date.now()) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
    };
  }

  function Dialog({ title, onClose, busy, children, className = "" }) {
    const ref = useRef(null),
      callbacks = useRef({ onClose, busy });
    callbacks.current = { onClose, busy };
    useEffect(() => {
      const previous = document.activeElement,
        element = ref.current,
        overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      (
        element.querySelector("input,select,textarea") ||
        element.querySelector("button")
      )?.focus();
      const keydown = (event) => {
        if (event.key === "Escape" && !callbacks.current.busy) {
          event.preventDefault();
          callbacks.current.onClose();
        }
        if (event.key !== "Tab") return;
        const nodes = [
          ...element.querySelectorAll(
            "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
          ),
        ].filter(
          (node) => node.offsetParent !== null && !node.matches(":disabled"),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (!first) {
          event.preventDefault();
          element.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === element)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === element)
        ) {
          event.preventDefault();
          first.focus();
        }
      };
      element.addEventListener("keydown", keydown);
      return () => {
        document.body.style.overflow = overflow;
        element.removeEventListener("keydown", keydown);
        if (previous?.isConnected) previous.focus();
      };
    }, []);
    return h(
      "div",
      { className: "team-overlay" },
      h(
        "section",
        {
          className: `team-dialog ${className}`,
          role: "dialog",
          "aria-modal": true,
          "aria-labelledby": "team-dialog-title",
          ref,
          tabIndex: -1,
        },
        h(
          "header",
          null,
          h("h2", { id: "team-dialog-title" }, title),
          button("Закрыть", onClose, { disabled: busy }),
        ),
        children,
      ),
    );
  }

  function inlineMessage(text, actorId, depth = 0) {
    if (depth > 3) return text;
    const pattern =
      /@\[(?<mention>[^\]\r\n]+)\]\(user:(?<user>[0-9a-f-]{36})\)|(?<prefix>^|[\s(])(?<all>@all)(?=$|[\s.,!?;:)\]])|`(?<code>[^`\n]+)`|\*\*(?<bold>[^\n]+?)\*\*|~~(?<strike>[^\n]+?)~~|_(?<italic>[^_\n]+)_|\[(?<label>[^\]\n]+)\]\((?<url>[^\s)]+)\)/g;
    const output = [];
    let cursor = 0,
      match;
    while ((match = pattern.exec(text))) {
      if (match.index > cursor) output.push(text.slice(cursor, match.index));
      const value = match.groups,
        key = `${match.index}:${depth}`;
      if (value.user)
        output.push(
          h(
            "span",
            {
              key,
              className: `team-mention${value.user === actorId ? " is-me" : ""}`,
            },
            `@${value.mention}`,
          ),
        );
      else if (value.all) {
        output.push(value.prefix);
        output.push(h("span", { key, className: "team-mention" }, "@all"));
      } else if (value.code) output.push(h("code", { key }, value.code));
      else if (value.bold)
        output.push(
          h("strong", { key }, inlineMessage(value.bold, actorId, depth + 1)),
        );
      else if (value.strike)
        output.push(
          h("s", { key }, inlineMessage(value.strike, actorId, depth + 1)),
        );
      else if (value.italic)
        output.push(
          h("em", { key }, inlineMessage(value.italic, actorId, depth + 1)),
        );
      else if (value.url) {
        const href = safeLink(value.url);
        output.push(
          href
            ? h(
                "a",
                { key, href, target: "_blank", rel: "noopener noreferrer" },
                value.label,
              )
            : match[0],
        );
      }
      cursor = pattern.lastIndex;
    }
    if (cursor < text.length) output.push(text.slice(cursor));
    return output;
  }
  function richMessage(text, actorId) {
    const lines = text.split("\n"),
      blocks = [];
    for (let index = 0; index < lines.length; ) {
      const line = lines[index],
        key = index;
      if (!line.trim()) {
        index++;
        continue;
      }
      const kind = /^>\s?/.test(line)
        ? "quote"
        : /^[-*]\s/.test(line)
          ? "ul"
          : /^\d+\.\s/.test(line)
            ? "ol"
            : "p";
      const matches =
        kind === "quote"
          ? /^>\s?/
          : kind === "ul"
            ? /^[-*]\s/
            : kind === "ol"
              ? /^\d+\.\s/
              : null;
      const group = [];
      while (
        index < lines.length &&
        lines[index].trim() &&
        (matches
          ? matches.test(lines[index])
          : !/^(?:>\s?|[-*]\s|\d+\.\s)/.test(lines[index]))
      ) {
        group.push(matches ? lines[index].replace(matches, "") : lines[index]);
        index++;
      }
      blocks.push(
        kind === "ul" || kind === "ol"
          ? h(
              kind,
              { key },
              ...group.map((value, item) =>
                h("li", { key: item }, inlineMessage(value, actorId)),
              ),
            )
          : h(
              kind === "quote" ? "blockquote" : "p",
              { key },
              inlineMessage(group.join("\n"), actorId),
            ),
      );
    }
    return h("div", { className: "team-rich-message" }, ...blocks);
  }
  const toolbarIcon = (name) => {
    const paths = {
      plus: "M12 5v14M5 12h14",
      smile: "M8 14s1 3 4 3 4-3 4-3M8 9h.01M16 9h.01",
      camera:
        "M14 8l6-3v14l-6-3M4 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z",
      microphone:
        "M8 5a4 4 0 0 1 8 0v7a4 4 0 0 1-8 0V5ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8",
      send: "m3 3 18 9-18 9 4-9-4-9Zm4 9h14",
    };
    return h(
      "svg",
      {
        viewBox: "0 0 24 24",
        width: 19,
        height: 19,
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.7,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
      },
      name === "smile" && h("circle", { cx: 12, cy: 12, r: 9 }),
      h("path", { d: paths[name] }),
    );
  };

  function Composer({
    draft,
    parentId,
    people,
    busy,
    sending,
    sendBlocked,
    sendRestriction,
    onText,
    onFiles,
    onRemove,
    onSubmit,
    validTarget,
  }) {
    const [menu, setMenu] = useState(""),
      [formatting, setFormatting] = useState(false),
      [capture, setCapture] = useState(""),
      [mentionQuery, setMentionQuery] = useState(""),
      [commandQuery, setCommandQuery] = useState(""),
      [linkLabel, setLinkLabel] = useState(""),
      [linkUrl, setLinkUrl] = useState(""),
      [localError, setLocalError] = useState("");
    const formRef = useRef(null),
      textarea = useRef(null),
      menuRef = useRef(null),
      fileInput = useRef(null),
      originalInput = useRef(null),
      mounted = useRef(true),
      selection = useRef({ start: 0, end: 0 }),
      trigger = useRef(null),
      focusMenu = useRef(false),
      opener = useRef(null);
    const attachments = draft.attachments || [],
      preparing = attachments.some((file) => file.preparing),
      totalBytes = attachments.reduce((sum, file) => sum + file.byteSize, 0),
      tooLarge = totalBytes > MAX_ATTACHMENT_BYTES,
      invalid = attachments.some((file) => file.error),
      disabled =
        busy ||
        sendBlocked ||
        preparing ||
        invalid ||
        tooLarge ||
        (!draft.text.trim() && !attachments.length);
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);
    useEffect(() => {
      if (!menu) return;
      if (focusMenu.current) {
        focusMenu.current = false;
        menuRef.current
          ?.querySelector(
            "input,.team-composer-menu-item,.team-emoji-option,.team-link-editor button",
          )
          ?.focus();
      }
      const outside = (event) => {
        if (!formRef.current?.contains(event.target)) {
          setMenu("");
          trigger.current = null;
        }
      };
      document.addEventListener("pointerdown", outside);
      return () => document.removeEventListener("pointerdown", outside);
    }, [menu]);
    const rememberSelection = () => {
      if (textarea.current)
        selection.current = {
          start: textarea.current.selectionStart,
          end: textarea.current.selectionEnd,
        };
    };
    const closeMenu = (restore = false) => {
      setMenu("");
      trigger.current = null;
      if (restore)
        (opener.current?.isConnected
          ? opener.current
          : textarea.current
        )?.focus();
    };
    const toggleMenu = (value) => {
      rememberSelection();
      trigger.current = null;
      setLocalError("");
      opener.current = document.activeElement;
      focusMenu.current = true;
      setMentionQuery("");
      setCommandQuery("");
      setMenu((before) => (before === value ? "" : value));
    };
    const insert = (
      value,
      range = trigger.current || selection.current,
      selectStart,
      selectEnd,
    ) => {
      const start = range.start,
        end = range.end;
      const next = draft.text.slice(0, start) + value + draft.text.slice(end);
      if (next.length > 12000) {
        setLocalError("Сообщение не может быть длиннее 12 000 символов.");
        return false;
      }
      onText(next);
      closeMenu();
      setLocalError("");
      const left = selectStart ?? start + value.length,
        right = selectEnd ?? left;
      selection.current = { start: left, end: right };
      requestAnimationFrame(() => {
        if (mounted.current && textarea.current) {
          textarea.current.focus();
          textarea.current.setSelectionRange(left, right);
        }
      });
      return true;
    };
    const wrap = (prefix, suffix = prefix) => {
      const range = selection.current,
        selected = draft.text.slice(range.start, range.end) || "текст";
      insert(
        prefix + selected + suffix,
        range,
        range.start + prefix.length,
        range.start + prefix.length + selected.length,
      );
    };
    const lineFormat = (prefix) => {
      const range = selection.current,
        start = draft.text.lastIndexOf("\n", Math.max(0, range.start - 1)) + 1;
      const text = draft.text.slice(start, range.end) || "текст";
      insert(
        text
          .split("\n")
          .map(
            (line, index) =>
              (prefix === "number" ? `${index + 1}. ` : prefix) + line,
          )
          .join("\n"),
        { start, end: range.end },
      );
    };
    const chooseMention = (person) => {
      const label =
          person?.displayName?.replace(/[\[\]\\\r\n]/g, " ").trim() ||
          "Сотрудник",
        range = trigger.current || selection.current,
        before = draft.text.slice(0, range.start),
        spacing = before && !/[\s(]$/.test(before) ? " " : "";
      insert(
        spacing +
          (person ? `@[${label}](user:${person.id.toLowerCase()}) ` : "@all "),
        range,
      );
    };
    const chooseCommand = (command) => {
      if (command[0] === "help") {
        insert("");
        setMenu("help");
        focusMenu.current = true;
      } else insert(command[2]);
    };
    const changeText = (event) => {
      const text = event.target.value,
        cursor = event.target.selectionStart;
      onText(text);
      selection.current = { start: cursor, end: event.target.selectionEnd };
      setLocalError("");
      const before = text.slice(0, cursor),
        mention = /(^|\s)@([^\s@\[\]]*)$/.exec(before),
        command = /(^|\n)\/([a-z]*)$/i.exec(before);
      focusMenu.current = false;
      if (mention) {
        trigger.current = {
          start: cursor - mention[2].length - 1,
          end: cursor,
        };
        setMentionQuery(mention[2]);
        setMenu("mentions");
      } else if (command) {
        trigger.current = {
          start: cursor - command[2].length - 1,
          end: cursor,
        };
        setCommandQuery(command[2]);
        setMenu("commands");
      } else if (trigger.current) {
        trigger.current = null;
        setMenu("");
      }
    };
    const openCapture = (mode) => {
      closeMenu();
      if (mode !== "dictation") {
        if (preparing) {
          setLocalError(
            "Дождитесь подготовки прикреплённых файлов перед записью.",
          );
          return;
        }
        if (attachments.length >= MAX_ATTACHMENTS) {
          setLocalError(
            "Уже прикреплено 5 файлов. Удалите один из них перед записью.",
          );
          return;
        }
        if (totalBytes >= MAX_ATTACHMENT_BYTES) {
          setLocalError(
            "Вложения занимают 25 МБ. Освободите место перед записью.",
          );
          return;
        }
      }
      setCapture(mode);
    };
    const iconButton = (label, icon, action, extra = {}) =>
      button(icon, action, {
        className: "team-composer-icon",
        "aria-label": label,
        title: label,
        disabled: busy,
        ...extra,
      });
    const menuButton = (label, action, hint) =>
      button(
        h(
          React.Fragment,
          null,
          h("span", null, label),
          hint && h("small", null, hint),
        ),
        action,
        { className: "team-composer-menu-item", "aria-label": label },
      );
    const popupTitle = {
      files: "Вложения",
      emoji: "Эмодзи",
      mentions: "Упоминания",
      commands: "Команды",
      camera: "Видео",
      microphone: "Голос и диктовка",
      link: "Добавить ссылку",
      help: "Помощь по редактору",
    }[menu];
    const mentionPeople = people.filter((person) =>
      normal(person.displayName).includes(normal(mentionQuery)),
    );
    return h(
      "form",
      {
        className: "team-composer team-composer-rich",
        ref: formRef,
        onSubmit: (event) => {
          if (disabled) event.preventDefault();
          else {
            closeMenu();
            onSubmit(event);
          }
        },
        onKeyDown: (event) => {
          if (event.key === "Escape" && menu) {
            event.preventDefault();
            event.stopPropagation();
            closeMenu(true);
          }
          if (
            event.key === "Enter" &&
            menu &&
            menuRef.current?.contains(event.target) &&
            event.target.tagName === "INPUT"
          ) {
            event.preventDefault();
            menuRef.current
              .querySelector(
                menu === "link"
                  ? ".team-link-editor button"
                  : ".team-composer-menu-item",
              )
              ?.click();
          }
          if (menu && ["ArrowDown", "ArrowUp"].includes(event.key)) {
            const controls = [
              ...(menuRef.current?.querySelectorAll(
                "input,.team-composer-menu-item:not([disabled]),.team-emoji-option:not([disabled]),.team-link-editor button:not([disabled])",
              ) || []),
            ];
            if (!controls.length) return;
            const current = controls.indexOf(document.activeElement),
              next = event.key === "ArrowDown" ? current + 1 : current - 1;
            controls[(next + controls.length) % controls.length]?.focus();
            event.preventDefault();
          }
        },
      },
      formatting &&
        h(
          "div",
          {
            className: "team-format-toolbar",
            role: "toolbar",
            "aria-label": "Форматирование",
          },
          iconButton("Жирный", h("strong", null, "B"), () => wrap("**")),
          iconButton("Курсив", h("em", null, "I"), () => wrap("_")),
          iconButton("Зачёркнутый", h("s", null, "S"), () => wrap("~~")),
          iconButton("Код", "</>", () => wrap("`")),
          iconButton("Цитата", "❞", () => lineFormat("> ")),
          iconButton("Список", "• ≡", () => lineFormat("- ")),
          iconButton("Нумерованный список", "1. ≡", () => lineFormat("number")),
          iconButton("Вставить ссылку", "↗", () => {
            rememberSelection();
            setLinkLabel(
              draft.text.slice(selection.current.start, selection.current.end),
            );
            setLinkUrl("");
            toggleMenu("link");
          }),
        ),
      field(
        parentId ? "Ответ в ветке" : "Сообщение в чат",
        h("textarea", {
          ref: textarea,
          rows: 3,
          maxLength: 12000,
          placeholder: parentId ? "Ответьте в ветке…" : "Напишите сообщение…",
          value: draft.text,
          disabled: busy,
          onChange: changeText,
          onSelect: rememberSelection,
          onClick: rememberSelection,
          onKeyUp: rememberSelection,
          onKeyDown: (event) => {
            if (event.nativeEvent?.isComposing || event.keyCode === 229) return;
            if (
              (event.ctrlKey || event.metaKey) &&
              ["b", "i"].includes(event.key.toLowerCase())
            ) {
              event.preventDefault();
              rememberSelection();
              wrap(event.key.toLowerCase() === "b" ? "**" : "_");
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (trigger.current && menu)
                menuRef.current
                  ?.querySelector(".team-composer-menu-item")
                  ?.click();
              else if (!disabled) onSubmit(event);
            }
          },
        }),
      ),
      attachments.length > 0 &&
        h(
          "ul",
          {
            className: "team-draft-files",
            "aria-label": "Прикреплённые файлы",
          },
          ...attachments.map((file) =>
            h(
              "li",
              { key: file.id },
              h(
                "div",
                null,
                h(
                  "span",
                  { className: "team-draft-file-kind", "aria-hidden": true },
                  { image: "▧", audio: "♫", video: "▷", round: "◉" }[
                    file.kind
                  ] || "▤",
                ),
                h("span", null, file.filename),
                h(
                  "small",
                  { className: "team-muted" },
                  file.preparing
                    ? fileSize(file.originalSize ?? file.byteSize)
                    : fileSize(file.byteSize),
                ),
                file.preparing &&
                  h(
                    "small",
                    { className: "team-muted", role: "status" },
                    "Подготовка…",
                  ),
                file.compressed &&
                  h(
                    "small",
                    { className: "team-muted" },
                    `${fileSize(file.originalSize)} → ${fileSize(file.byteSize)}`,
                  ),
                file.note && h("small", { className: "team-muted" }, file.note),
                file.error &&
                  h(
                    "small",
                    { className: "team-file-error", role: "alert" },
                    file.error,
                  ),
              ),
              button("×", () => onRemove(file.id), {
                className: "team-composer-icon",
                "aria-label": `Удалить файл ${file.filename}`,
                disabled: busy,
              }),
            ),
          ),
        ),
      errorBox(
        draft.error ||
          (tooLarge
            ? "Общий размер файлов в сообщении не должен превышать 25 МБ."
            : "") ||
          localError,
      ),
      sendRestriction &&
        h(
          "p",
          {
            className: "team-send-restriction",
            role: "status",
            "aria-live": "off",
          },
          sendRestriction,
        ),
      h(
        "div",
        {
          className: "team-composer-toolbar",
          role: "toolbar",
          "aria-label": "Инструменты сообщения",
        },
        iconButton(
          "Добавить вложение",
          toolbarIcon("plus"),
          () => toggleMenu("files"),
          { "aria-expanded": menu === "files" },
        ),
        iconButton(
          "Форматирование текста",
          "Aa",
          () => {
            rememberSelection();
            setFormatting(!formatting);
            closeMenu();
          },
          { "aria-pressed": formatting },
        ),
        iconButton(
          "Добавить эмодзи",
          toolbarIcon("smile"),
          () => toggleMenu("emoji"),
          { "aria-expanded": menu === "emoji" },
        ),
        iconButton("Упомянуть сотрудника", "@", () => toggleMenu("mentions"), {
          "aria-expanded": menu === "mentions",
        }),
        h("span", { className: "team-toolbar-divider", "aria-hidden": true }),
        iconButton(
          "Записать видео",
          toolbarIcon("camera"),
          () => toggleMenu("camera"),
          { "aria-expanded": menu === "camera" },
        ),
        iconButton(
          "Голос и диктовка",
          toolbarIcon("microphone"),
          () => toggleMenu("microphone"),
          { "aria-expanded": menu === "microphone" },
        ),
        iconButton("Команды", "/", () => toggleMenu("commands"), {
          "aria-expanded": menu === "commands",
        }),
        h(
          "button",
          {
            type: "submit",
            className: "button team-primary team-send-button",
            disabled,
            "aria-label": "Отправить",
            title: "Отправить · Enter",
          },
          sending
            ? "Отправляем…"
            : preparing
              ? "Подготовка…"
              : h(
                  React.Fragment,
                  null,
                  toolbarIcon("send"),
                  h("span", null, "Отправить"),
                ),
        ),
      ),
      h("input", {
        ref: fileInput,
        className: "team-hidden-file-input",
        type: "file",
        multiple: true,
        tabIndex: -1,
        disabled: busy,
        "aria-label": parentId
          ? "Прикрепить файлы к ответу"
          : "Прикрепить файлы к сообщению",
        onChange: (event) => {
          onFiles(Array.from(event.target.files || []), { original: false });
          event.target.value = "";
        },
      }),
      h("input", {
        ref: originalInput,
        className: "team-hidden-file-input",
        type: "file",
        multiple: true,
        tabIndex: -1,
        disabled: busy,
        "aria-label": parentId
          ? "Прикрепить файлы без сжатия к ответу"
          : "Прикрепить файлы без сжатия к сообщению",
        onChange: (event) => {
          onFiles(Array.from(event.target.files || []), { original: true });
          event.target.value = "";
        },
      }),
      h(
        "small",
        { className: "team-composer-hint" },
        "Shift + Enter — новая строка · До 5 файлов, 25 МБ · Переписка доступна администратору",
      ),
      menu &&
        h(
          "div",
          {
            className: `team-composer-popover${menu === "emoji" ? " is-emoji" : ""}`,
            role: "dialog",
            "aria-label": popupTitle,
            ref: menuRef,
          },
          h(
            "div",
            { className: "team-composer-popover-heading" },
            h("strong", null, popupTitle),
            button("×", () => closeMenu(true), {
              className: "team-composer-icon",
              "aria-label": "Закрыть меню",
            }),
          ),
          menu === "files" &&
            h(
              React.Fragment,
              null,
              menuButton(
                "Фото и файлы",
                () => {
                  closeMenu();
                  fileInput.current?.click();
                },
                "Фото оптимизируются для отправки",
              ),
              menuButton(
                "Файл без сжатия",
                () => {
                  closeMenu();
                  originalInput.current?.click();
                },
                "Оригинальное качество и размер",
              ),
            ),
          menu === "emoji" &&
            h(
              "div",
              { className: "team-emoji-grid" },
              ...EMOJIS.map((emoji) =>
                button(emoji, () => insert(emoji), {
                  key: emoji,
                  className: "team-emoji-option",
                  "aria-label": `Эмодзи ${emoji}`,
                }),
              ),
            ),
          menu === "mentions" &&
            h(
              React.Fragment,
              null,
              h("input", {
                type: "search",
                placeholder: "Найти сотрудника…",
                "aria-label": "Поиск сотрудника для упоминания",
                value: mentionQuery,
                onChange: (event) => setMentionQuery(event.target.value),
              }),
              (!mentionQuery ||
                normal("all все").includes(normal(mentionQuery))) &&
                menuButton(
                  "Упомянуть всех — @all",
                  () => chooseMention(null),
                  "Участники этого чата",
                ),
              ...mentionPeople.map((person) =>
                h(
                  React.Fragment,
                  { key: person.id },
                  menuButton(
                    person.displayName,
                    () => chooseMention(person),
                    "Упомянуть в сообщении",
                  ),
                ),
              ),
              !mentionPeople.length &&
                h("p", { className: "team-muted" }, "Сотрудники не найдены."),
            ),
          menu === "commands" &&
            h(
              React.Fragment,
              null,
              ...COMMANDS.filter((command) =>
                command[0].startsWith(commandQuery.toLowerCase()),
              ).map((command) =>
                h(
                  React.Fragment,
                  { key: command[0] },
                  menuButton(
                    `/${command[0]}`,
                    () => chooseCommand(command),
                    command[1],
                  ),
                ),
              ),
            ),
          menu === "camera" &&
            h(
              React.Fragment,
              null,
              menuButton(
                "Видеосообщение",
                () => openCapture("video"),
                "Записать видео с камеры",
              ),
              menuButton(
                "Круглое видео",
                () => openCapture("round"),
                "Короткое видео в круглом формате",
              ),
            ),
          menu === "microphone" &&
            h(
              React.Fragment,
              null,
              menuButton(
                "Голосовое сообщение",
                () => openCapture("voice"),
                "Записать и прослушать перед отправкой",
              ),
              menuButton(
                "Диктовка в текст",
                () => openCapture("dictation"),
                "Проверить распознанный текст перед вставкой",
              ),
            ),
          menu === "link" &&
            h(
              "div",
              { className: "team-link-editor" },
              field(
                "Текст ссылки",
                h("input", {
                  value: linkLabel,
                  onChange: (event) => setLinkLabel(event.target.value),
                }),
              ),
              field(
                "Адрес ссылки",
                h("input", {
                  type: "url",
                  placeholder: "https://…",
                  value: linkUrl,
                  onChange: (event) => setLinkUrl(event.target.value),
                }),
              ),
              errorBox(localError),
              button(
                "Вставить ссылку",
                () => {
                  const href = safeLink(linkUrl);
                  if (!href) {
                    setLocalError("Укажите полный адрес http:// или https://.");
                    return;
                  }
                  insert(
                    `[${(linkLabel || href).replace(/[\[\]\r\n]/g, " ")}](${href.replaceAll("(", "%28").replaceAll(")", "%29")})`,
                    selection.current,
                  );
                },
                { className: "button team-primary" },
              ),
            ),
          menu === "help" &&
            h(
              "p",
              { className: "team-composer-help" },
              "Enter отправляет сообщение, Shift + Enter добавляет строку. Выделите текст и используйте Aa для оформления. @ упоминает сотрудника или всех участников. /task, /decision и /question вставляют заголовок; /shrug — жест. Команда сама ничего не отправляет.",
            ),
        ),
      capture &&
        h(CaptureDialog, {
          mode: capture,
          onClose: () => setCapture(""),
          onComplete: (file, kind) => {
            if (!mounted.current || !validTarget()) return;
            if (preparing)
              throw new Error(
                "Дождитесь подготовки прикреплённых файлов и повторите добавление записи.",
              );
            if (attachments.length >= MAX_ATTACHMENTS)
              throw new Error(
                "В сообщении уже 5 файлов. Запись остаётся в предпросмотре; добавить её сейчас нельзя.",
              );
            if (totalBytes + file.size > MAX_ATTACHMENT_BYTES)
              throw new Error(
                "Запись вместе с вложениями превышает 25 МБ. Запишите более короткую запись; текущая остаётся в предпросмотре.",
              );
            if (!onFiles([file], { original: true, kind }))
              throw new Error("Не удалось добавить запись. Повторите попытку.");
            setCapture("");
          },
          onTranscript: (text) => {
            if (!mounted.current || !validTarget()) return;
            if (!insert(text))
              throw new Error(
                "Текст не поместился в сообщение: сократите его до 12 000 символов.",
              );
            setCapture("");
          },
        }),
    );
  }

  function MessageReactions({ reactions = [], actorId, disabled, onToggle }) {
    const [open, setOpen] = useState(false),
      ref = useRef(null),
      trigger = useRef(null),
      popup = useRef(null);
    useEffect(() => {
      if (!open) return;
      popup.current?.querySelector("button")?.focus();
      const outside = (event) => {
        if (!ref.current?.contains(event.target)) setOpen(false);
      };
      document.addEventListener("pointerdown", outside);
      return () => document.removeEventListener("pointerdown", outside);
    }, [open]);
    return h(
      "div",
      {
        className: "team-message-reactions",
        ref,
        onKeyDown: (event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            trigger.current?.focus();
          }
          if (
            open &&
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              event.key,
            )
          ) {
            const choices = [
                ...(popup.current?.querySelectorAll("button") || []),
              ],
              index = choices.indexOf(document.activeElement),
              delta =
                event.key === "ArrowLeft"
                  ? -1
                  : event.key === "ArrowRight"
                    ? 1
                    : event.key === "ArrowUp"
                      ? -4
                      : 4;
            if (choices.length) {
              event.preventDefault();
              choices[
                (Math.max(0, index) + delta + choices.length) % choices.length
              ]?.focus();
            }
          }
        },
      },
      ...reactions.map((reaction) => {
        const mine =
          reaction.mine === true ||
          reaction.userIds?.includes(actorId) ||
          reaction.reacted === true;
        return button(
          `${reaction.emoji} ${reaction.count ?? reaction.userIds?.length ?? 0}`,
          () => onToggle(reaction.emoji, !mine),
          {
            key: reaction.emoji,
            className: `team-reaction-chip${mine ? " is-mine" : ""}`,
            disabled,
            "aria-label": `Реакция ${reaction.emoji}: ${reaction.count ?? reaction.userIds?.length ?? 0}`,
            "aria-pressed": mine,
            title: mine ? "Убрать вашу реакцию" : "Добавить такую реакцию",
          },
        );
      }),
      button("☺ +", () => setOpen(!open), {
        className: "team-reaction-add",
        ref: trigger,
        disabled,
        "aria-label": "Добавить реакцию",
        "aria-expanded": open,
      }),
      open &&
        h(
          "div",
          {
            className: "team-reaction-picker",
            role: "dialog",
            "aria-label": "Выбрать реакцию",
            ref: popup,
          },
          ...REACTION_EMOJIS.map((emoji) =>
            button(
              emoji,
              () => {
                const existing = reactions.find(
                  (reaction) => reaction.emoji === emoji,
                );
                const mine =
                  existing?.mine === true ||
                  existing?.userIds?.includes(actorId) ||
                  existing?.reacted === true;
                onToggle(emoji, !mine);
                setOpen(false);
                trigger.current?.focus();
              },
              {
                key: emoji,
                className: "team-emoji-option",
                "aria-label": `Поставить реакцию ${emoji}`,
                disabled,
              },
            ),
          ),
        ),
    );
  }

  function RecipientPicker({
    people,
    selected,
    onChange,
    disabled,
    label = "Кому доступна сводка",
  }) {
    return h(
      "fieldset",
      { className: "team-recipients", disabled },
      h("legend", null, label),
      h(
        "p",
        { className: "team-muted" },
        "Сводка может включать закрытые каналы и личные сообщения. Выбранные сотрудники увидят её текст, но не получат доступ к исходной переписке.",
      ),
      h(
        "div",
        null,
        people.length
          ? people.map((person) =>
              h(
                "label",
                { key: person.id },
                h("input", {
                  type: "checkbox",
                  checked: selected.includes(person.id),
                  onChange: (event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, person.id]
                        : selected.filter((id) => id !== person.id),
                    ),
                }),
                h("span", null, person.displayName),
              ),
            )
          : h("p", { className: "team-muted" }, "Нет доступных сотрудников."),
      ),
      h(
        "small",
        null,
        selected.length
          ? `Выбрано: ${selected.length}`
          : "Только администраторы области",
      ),
    );
  }

  function ChannelAccessFields({
    people,
    value,
    creatorId,
    onChange,
    disabled,
  }) {
    const [search, setSearch] = useState("");
    const members =
      creatorId && !people.some((person) => person.id === creatorId)
        ? [
            {
              id: creatorId,
              displayName: "Создатель канала",
            },
            ...people,
          ]
        : people;
    return h(
      React.Fragment,
      null,
      h(
        "label",
        { className: "team-channel-visibility" },
        h("input", {
          type: "checkbox",
          "aria-label": "Закрытый канал",
          checked: value.visibility === "private",
          disabled,
          onChange: (event) =>
            onChange({
              ...value,
              visibility: event.target.checked ? "private" : "public",
            }),
        }),
        h(
          "span",
          null,
          h("strong", null, "Закрытый канал"),
          h(
            "small",
            null,
            value.visibility === "private"
              ? "Доступен выбранным участникам и администратору"
              : "Доступен всем сотрудникам компании",
          ),
        ),
      ),
      value.visibility === "private" &&
        h(
          "fieldset",
          { className: "team-channel-members", disabled },
          h("legend", null, "Участники закрытого чата"),
          field(
            "Найти участника чата",
            h("input", {
              type: "search",
              value: search,
              placeholder: "Имя сотрудника…",
              onChange: (event) => setSearch(event.target.value),
            }),
          ),
          h(
            "div",
            { className: "team-channel-member-list" },
            ...members
              .filter((person) =>
                normal(person.displayName).includes(normal(search)),
              )
              .map((person) =>
                h(
                  "label",
                  { key: person.id },
                  h("input", {
                    type: "checkbox",
                    "aria-label": person.displayName,
                    checked: value.memberIds.includes(person.id),
                    disabled,
                    onChange: (event) =>
                      onChange({
                        ...value,
                        memberIds: event.target.checked
                          ? [...value.memberIds, person.id]
                          : value.memberIds.filter((id) => id !== person.id),
                      }),
                  }),
                  h(
                    "span",
                    null,
                    person.displayName,
                    person.id === creatorId &&
                      h("small", null, "Создатель канала"),
                  ),
                ),
              ),
          ),
          h(
            "small",
            { className: "team-muted" },
            `Выбрано: ${value.memberIds.length} из 200. Администратор может изменить любого участника.`,
          ),
          h(
            "p",
            { className: "team-muted" },
            "Переписку видят выбранные участники и администратор. Администратор может делиться выдержками в сводках.",
          ),
        ),
    );
  }

  return function TeamWorkspace({
    token,
    actor,
    onExpired,
    onDirtyChange,
    initialTab = "chat",
    initialScopeId = "",
    onAdaptationComplete,
    navigationRequest,
  }) {
    const [scopes, setScopes] = useState([]),
      [scopeId, setScopeId] = useState(""),
      [workScopes, setWorkScopes] = useState([]),
      [canManage, setCanManage] = useState(false),
      [contextLoading, setContextLoading] = useState(true),
      [revision, setRevision] = useState(0),
      [driverRequestsRefresh, setDriverRequestsRefresh] = useState(0),
      [metricsRefresh, setMetricsRefresh] = useState(0);
    const [tab, setTab] = useState(initialTab),
      [people, setPeople] = useState([]),
      [conversations, setConversations] = useState([]),
      [conversationId, setConversationId] = useState("");
    const [messages, setMessages] = useState([]),
      [mentionInbox, setMentionInbox] = useState({
        mentions: [],
        unreadCount: 0,
        hasMore: false,
        nextBefore: null,
      }),
      [threadId, setThreadId] = useState(null),
      [pagination, setPagination] = useState({
        hasMore: false,
        nextBefore: null,
      }),
      [detailLoading, setDetailLoading] = useState(false);
    const [articles, setArticles] = useState([]),
      [articleId, setArticleId] = useState(""),
      [articleFolder, setArticleFolder] = useState(""),
      [articlePage, setArticlePage] = useState(0),
      [articleForm, setArticleForm] = useState(null),
      [articlePositions, setArticlePositions] = useState({
        scopeId: "",
        items: [],
        loading: false,
        error: "",
      }),
      [articlePositionDraft, setArticlePositionDraft] = useState(null),
      [articleToDelete, setArticleToDelete] = useState(null),
      [conflict, setConflict] = useState(null),
      [knowledgeAccess, setKnowledgeAccess] = useState({
        canCreate: false,
        canEdit: false,
        canManage: false,
      }),
      [permissionPanel, setPermissionPanel] = useState(null),
      [adaptation, setAdaptation] = useState(null),
      [adaptationArticleId, setAdaptationArticleId] = useState("");
    const [summaries, setSummaries] = useState([]),
      [summaryId, setSummaryId] = useState(""),
      [sharing, setSharing] = useState(null),
      [schedules, setSchedules] = useState([]),
      [scheduleForm, setScheduleForm] = useState(null);
    const [periodStart, setPeriodStart] = useState(() =>
        dateInput(Date.now() - 86400000),
      ),
      [periodEnd, setPeriodEnd] = useState(() => dateInput(Date.now()));
    const [tasksDirty, setTasksDirty] = useState(false),
      [outcomesDirty, setOutcomesDirty] = useState(false),
      [taskOpen, setTaskOpen] = useState(null),
      [recognition, setRecognition] = useState({}),
      [profileDirectory, setProfileDirectory] = useState({}),
      [profileCard, setProfileCard] = useState(null),
      [notificationDialog, setNotificationDialog] = useState(null),
      [metadataRevision, setMetadataRevision] = useState(0);
    const workspaceRef = useRef(null),
      handledNavigation = useRef(null),
      navigationSourceVersion = useRef(0);
    const crown = (id) =>
      recognition[id] > 0
        ? h(
            "span",
            {
              className: "team-crown",
              title: `Благодарностей: ${recognition[id]}`,
              "aria-label": `Благодарностей: ${recognition[id]}`,
            },
            "👑",
          )
        : null;
    const [drafts, setDrafts] = useState({}),
      [driverRequestsDirty, setDriverRequestsDirty] = useState(false),
      [messageEditor, setMessageEditor] = useState(null),
      [messageToDelete, setMessageToDelete] = useState(null),
      [moderationDialog, setModerationDialog] = useState(null),
      [accessDialog, setAccessDialog] = useState(null),
      [channelDialog, setChannelDialog] = useState(null),
      [archiveExpanded, setArchiveExpanded] = useState(false),
      [clockNow, setClockNow] = useState(Date.now),
      [rateLimit, setRateLimit] = useState(null),
      [dialog, setDialog] = useState(null),
      [source, setSource] = useState(null),
      [query, setQuery] = useState(""),
      [loading, setLoading] = useState(false),
      [error, setError] = useState(""),
      [notice, setNotice] = useState(""),
      [busy, setBusy] = useState("");
    const alive = useRef(true),
      scopeRef = useRef(""),
      scopeAccessRef = useRef(new Set()),
      accountRef = useRef(""),
      selectedRef = useRef(""),
      threadRef = useRef(threadId),
      tokenRef = useRef(token),
      messagesRef = useRef(messages),
      conversationsRef = useRef(conversations),
      revokedConversations = useRef(new Set()),
      mentionInboxRef = useRef(mentionInbox),
      changeCursorRef = useRef(null),
      callbacks = useRef({ onExpired, onDirtyChange, onAdaptationComplete }),
      busyRef = useRef(false),
      generation = useRef(0),
      detailGeneration = useRef(0),
      mentionGeneration = useRef(0),
      knowledgeGeneration = useRef(0),
      listGeneration = useRef(0),
      summaryGeneration = useRef(0),
      scheduleGeneration = useRef(0),
      initialView = useRef({ initialTab, initialScopeId }),
      previousCredentials = useRef({ token, account: actor?.id });
    scopeRef.current = scopeId;
    scopeAccessRef.current = new Set(
      scopes.map((scope) => scope.responsibilityScopeId),
    );
    accountRef.current = actor?.id || "";
    selectedRef.current = conversationId;
    threadRef.current = threadId;
    tokenRef.current = token;
    messagesRef.current = messages;
    conversationsRef.current = conversations;
    mentionInboxRef.current = mentionInbox;
    callbacks.current = { onExpired, onDirtyChange, onAdaptationComplete };
    initialView.current = { initialTab, initialScopeId };
    const current = (scope, account) =>
      alive.current &&
      scopeRef.current === scope &&
      scopeAccessRef.current.has(scope) &&
      accountRef.current === account;
    // Existing records keep their original scope. Never send a cross-project
    // chat mutation using the unrelated project selected in a legacy work tab.
    const recordScope = (path, body = {}) => {
      const pathname = path.split("?")[0];
      const conversationKey =
        /^\/team\/conversations\/([^/]+)/.exec(pathname)?.[1] ||
        body.conversationId;
      const messageKey = /^\/team\/messages\/([^/]+)/.exec(pathname)?.[1];
      const message =
        messageKey &&
        (messagesRef.current.find((row) => row.id === messageKey) ||
          (source?.message?.id === messageKey ? source.message : null) ||
          source?.ancestors?.find((row) => row.id === messageKey) ||
          mentionInboxRef.current.mentions.find(
            (row) => row.messageId === messageKey,
          ));
      const conversationKeyForMessage =
        conversationKey || message?.conversationId;
      const chat =
        conversationsRef.current.find(
          (row) => row.id === conversationKeyForMessage,
        ) ||
        (conversationKeyForMessage &&
        source?.conversation?.id === conversationKeyForMessage
          ? source.conversation
          : null);
      const articleKey =
        /^\/team\/articles\/([^/]+)/.exec(pathname)?.[1] ||
        (pathname === "/team/articles" ? body.id : null);
      const article =
        articleKey && articles.find((row) => row.id === articleKey);
      return (
        chat?.responsibilityScopeId ||
        message?.responsibilityScopeId ||
        article?.responsibilityScopeId ||
        body.responsibilityScopeId ||
        new URLSearchParams(path.split("?")[1] || "").get(
          "responsibilityScopeId",
        ) ||
        scopeId
      );
    };
    const workScopesRef = useRef(workScopes);
    workScopesRef.current = workScopes;
    const companyWorkRequest = useRef(null);
    if (!companyWorkRequest.current) companyWorkRequest.current = createCompanyWorkRequest(request, () => workScopesRef.current);
    const api = (path, options = {}) => {
      const method = options.method || "GET";
      const url = new URL(path, "http://team.local");
      const companyLists = [
        "/team/people",
        "/team/conversations",
        "/team/mentions",
        "/team/articles",
        "/team/profile-directory",
        "/team/response-metrics",
      ];
      let body = options.body ? JSON.parse(options.body) : null;
      if (method === "GET" && companyLists.includes(url.pathname)) {
        url.searchParams.delete("responsibilityScopeId");
      } else {
        const targetScope = recordScope(path, body || {});
        if (url.searchParams.has("responsibilityScopeId"))
          url.searchParams.set("responsibilityScopeId", targetScope);
        if (body?.responsibilityScopeId)
          body = { ...body, responsibilityScopeId: targetScope };
      }
      return (/^\/team\/(summaries|schedules)(\/|$)/.test(url.pathname) ? companyWorkRequest.current : request)(
        `${url.pathname}${url.search}`,
        { ...options, ...(body ? { body: JSON.stringify(body) } : {}) },
        tokenRef.current,
      );
    };
    const scoped = (path) =>
      `${path}?responsibilityScopeId=${encodeURIComponent(recordScope(path))}`;
    const fail = (reason) => {
      if (reason?.status === 401) callbacks.current.onExpired?.();
      return reason?.status === 401
        ? "Сессия завершена. Войдите снова."
        : reason?.status === 403
          ? "Нет доступа к этому разделу или переписке."
          : reason?.status === 404
            ? "Материал больше недоступен. Обновите список."
            : reason?.message ||
              "Не удалось выполнить действие. Проверьте соединение и повторите попытку.";
    };
    const articleDirty =
      articleForm &&
      (JSON.stringify(articleDraftValues(articleForm)) !==
        JSON.stringify(articleForm.original) ||
        Boolean(articlePositionDraft?.title.trim()));
    const articleStructured = Boolean(
      articleForm && (!articleForm.version || articleForm.structured),
    );
    const canEditArticle = (article) =>
      (knowledgeAccess.permissionsByScope?.[article?.responsibilityScopeId]
        ?.canEdit ??
        knowledgeAccess.canEdit) &&
      article?.canEdit !== false;
    const canDeleteArticle = (article) =>
      canManage && article?.canDelete === true;
    const articleEditable = !articleForm
      ? false
      : articleForm.version
        ? Boolean(
            articles.some(
              (article) =>
                article.id === articleForm.id && canEditArticle(article),
            ),
          )
        : (knowledgeAccess.permissionsByScope?.[
            articleForm.responsibilityScopeId
          ]?.canCreate ?? knowledgeAccess.canCreate);
    const hasAdaptation = Boolean(
      adaptation?.scopeId && (adaptation.required || adaptation.completed),
    );
    const canCompleteAdaptation =
      adaptation?.canComplete ??
      Boolean(adaptation?.total && adaptation.readCount === adaptation.total);
    const dirty = Boolean(
      Object.values(drafts).some(
        (draft) => draft.text.trim() || draft.attachments?.length,
      ) ||
        articleDirty ||
        articleToDelete ||
        dialog ||
        sharing ||
        scheduleForm ||
        accessDialog ||
        channelDialog ||
        driverRequestsDirty ||
        tasksDirty ||
        outcomesDirty ||
        notificationDialog ||
        (messageEditor && messageEditor.text !== messageEditor.originalText),
    );
    const conversation = conversations.find(
      (item) => item.id === conversationId,
    );
    const moderation = conversation?.moderation,
      modeUntil = Date.parse(moderation?.enabledUntil || ""),
      modeActive = Boolean(
        moderation?.active &&
          (!Number.isFinite(modeUntil) || modeUntil > clockNow),
      ),
      lastOwnMessageAt = messages.reduce(
        (latest, item) =>
          item.authorId === actor?.id
            ? Math.max(latest, Date.parse(item.createdAt) || 0)
            : latest,
        0,
      ),
      nextAllowedAt = Math.max(
        modeActive && !canManage
          ? lastOwnMessageAt + (moderation.intervalSeconds || 300) * 1000
          : 0,
        rateLimit?.conversationId === conversationId ? rateLimit.until : 0,
      ),
      remainingSeconds = Math.max(
        0,
        Math.ceil((nextAllowedAt - clockNow) / 1000),
      );
    const scopeAvailable = scopes.some(
      (scope) => scope.responsibilityScopeId === scopeId,
    );
    const maySend = Boolean(
      conversation &&
        !conversation.archivedAt &&
        !conversation.deletedAt &&
        conversation.canPost !== false &&
        (conversation.kind === "channel" ||
          conversation.memberIds?.includes(actor?.id)),
    );
    useEffect(() => {
      if (conversation?.archivedAt) setArchiveExpanded(true);
    }, [conversation?.id, conversation?.archivedAt]);
    const thread = messages.find((item) => item.id === threadId);
    const summary = summaries.find((item) => item.id === summaryId);
    const companyPeople = (targetScope = scopeId) => {
      const legalEntityId =
        scopes.find((scope) => scope.responsibilityScopeId === targetScope)
          ?.legalEntityId ||
        conversationsRef.current.find(
          (item) => item.responsibilityScopeId === targetScope,
        )?.legalEntityId;
      return people.filter(
        (person) =>
          !legalEntityId ||
          !person.legalEntityIds ||
          person.legalEntityIds.includes(legalEntityId),
      );
    };
    const nameOf = (id) =>
      people.find((person) => person.id === id)?.displayName || "Сотрудник";
    const conversationTitle = (item) =>
      item.kind === "direct"
        ? (item.memberIds || [])
            .filter(
              (id) => !item.memberIds.includes(actor?.id) || id !== actor?.id,
            )
            .map(nameOf)
            .join(" · ") || "Личный чат"
        : item.title || "Канал";
    const resetWorkspace = () => {
      generation.current++;
      listGeneration.current++;
      detailGeneration.current++;
      knowledgeGeneration.current++;
      setPeople([]);
      setConversations([]);
      revokedConversations.current.clear();
      setConversationId("");
      setMessages([]);
      changeCursorRef.current = null;
      setMessageEditor(null);
      setMessageToDelete(null);
      setModerationDialog(null);
      setAccessDialog(null);
      setChannelDialog(null);
      setArchiveExpanded(false);
      setRateLimit(null);
      mentionGeneration.current++;
      setMentionInbox({
        mentions: [],
        unreadCount: 0,
        hasMore: false,
        nextBefore: null,
      });
      setThreadId(null);
      setArticles([]);
      setArticleId("");
      setArticleFolder("");
      setArticlePage(0);
      setArticleForm(null);
      setArticlePositionDraft(null);
      setArticlePositions({
        scopeId: "",
        items: [],
        loading: false,
        error: "",
      });
      setArticleToDelete(null);
      setConflict(null);
      setKnowledgeAccess({
        canCreate: false,
        canEdit: false,
        canManage: false,
      });
      setPermissionPanel(null);
      setAdaptation(null);
      setAdaptationArticleId("");
      setSummaries([]);
      setSummaryId("");
      setSharing(null);
      setSchedules([]);
      setScheduleForm(null);
      setDrafts({});
      setDriverRequestsDirty(false);
      setTasksDirty(false);
      setOutcomesDirty(false);
      setTaskOpen(null);
      setRecognition({});
      setProfileDirectory({});
      setProfileCard(null);
      setNotificationDialog(null);
      setDialog(null);
      setSource(null);
      setError("");
      setNotice("");
      setQuery("");
      setPagination({ hasMore: false });
    };

    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
        generation.current++;
        detailGeneration.current++;
        callbacks.current.onDirtyChange?.(false);
      };
    }, []);
    useEffect(() => {
      callbacks.current.onDirtyChange?.(dirty || Boolean(busy));
    }, [dirty, busy]);
    useEffect(() => {
      if (!modeActive && !remainingSeconds) return;
      const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
      return () => window.clearInterval(timer);
    }, [modeActive, Boolean(remainingSeconds)]);
    useEffect(() => {
      const prevent = (event) => {
        if (dirty || busyRef.current) {
          event.preventDefault();
          event.returnValue = "";
        }
      };
      window.addEventListener("beforeunload", prevent);
      return () => window.removeEventListener("beforeunload", prevent);
    }, [dirty]);
    useEffect(() => {
      const controller = new AbortController();
      resetWorkspace();
      setTab(initialView.current.initialTab || "chat");
      setContextLoading(true);
      setScopes([]);
      setScopeId("");
      setCanManage(false);
      api("/team/context", { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          if (!Array.isArray(result?.scopes))
            throw new Error("Не удалось загрузить области команды.");
          setScopes(result.scopes);
          setWorkScopes(result.workScopes || result.scopes);
          setCanManage(result.canManage === true);
          setScopeId(
            result.scopes.some(
              (scope) =>
                scope.responsibilityScopeId ===
                initialView.current.initialScopeId,
            )
              ? initialView.current.initialScopeId
              : result.workScopes?.[0]?.responsibilityScopeId ||
                  result.defaultResponsibilityScopeId ||
                  result.scopes[0]?.responsibilityScopeId ||
                  "",
          );
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(fail(reason));
        })
        .finally(() => {
          if (!controller.signal.aborted) setContextLoading(false);
        });
      return () => controller.abort();
    }, [actor?.id, actor?.role, revision]);
    useEffect(() => {
      const previous = previousCredentials.current;
      previousCredentials.current = { token, account: actor?.id };
      if (previous.token === token || previous.account !== actor?.id) return;
      const controller = new AbortController(),
        account = accountRef.current;
      api("/team/context", { signal: controller.signal })
        .then((result) => {
          if (
            controller.signal.aborted ||
            !alive.current ||
            accountRef.current !== account
          )
            return;
          setCanManage(result.canManage === true);
          scopeAccessRef.current = new Set(
            (result.scopes || []).map((scope) => scope.responsibilityScopeId),
          );
          setScopes(result.scopes || []);
          setWorkScopes(result.workScopes || result.scopes || []);
          if (
            result.scopes?.some(
              (scope) => scope.responsibilityScopeId === scopeRef.current,
            )
          )
            return;
          else {
            // Authoritative revocation clears loaded company records immediately.
            // The user's unsent text stays in memory until they choose to discard it.
            listGeneration.current++;
            detailGeneration.current++;
            setPeople([]);
            setConversations([]);
            setMessages([]);
            setArticles([]);
            setArticleToDelete(null);
            setKnowledgeAccess({
              canCreate: false,
              canEdit: false,
              canManage: false,
            });
            setPermissionPanel(null);
            setAdaptation(null);
            setAdaptationArticleId("");
            setSummaries([]);
            setSchedules([]);
            setSource(null);
            setAccessDialog(null);
            setChannelDialog(null);
            setMessageEditor(null);
            setMessageToDelete(null);
            setModerationDialog(null);
            setThreadId(null);
            setDetailLoading(false);
            setLoading(false);
            setConflict(null);
            setError(
              "Доступ к области изменился. Несохранённые черновики сохранены до смены области.",
            );
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(fail(reason));
        });
      return () => controller.abort();
    }, [token, actor?.id]);

    function applyKnowledge(value, manage = canManage) {
      const scopedPermissions =
        value.permissionsByScope && Object.values(value.permissionsByScope);
      const permissions = scopedPermissions?.length
        ? {
            canCreate: scopedPermissions.some((item) => item.canCreate),
            canEdit: scopedPermissions.some((item) => item.canEdit),
            canManage: scopedPermissions.some((item) => item.canManage),
          }
        : value.permissions;
      setKnowledgeAccess(
        permissions
          ? {
              canCreate: permissions.canCreate === true,
              canEdit: permissions.canEdit === true,
              canManage: permissions.canManage === true,
              permissionsByScope: value.permissionsByScope || {},
            }
          : { canCreate: manage, canEdit: manage, canManage: manage },
      );
      setArticles(value.articles || []);
      setArticleToDelete((target) => {
        if (!target) return null;
        const latest = value.articles?.find(
          (article) => article.id === target.article.id,
        );
        return !latest?.canDelete || latest.version !== target.article.version
          ? { ...target, conflict: true }
          : target;
      });
      setArticleId((id) => id || value.articles?.[0]?.id || "");
      if (permissions?.canManage === false) setPermissionPanel(null);
    }
    function applyAdaptation(value, targetScope = scopeId) {
      setAdaptation({
        ...value,
        articles: value.scopeId === targetScope ? value.articles || [] : [],
      });
      setAdaptationArticleId((id) =>
        value.articles?.some((article) => article.id === id)
          ? id
          : value.articles?.find((article) => !article.readAt)?.id ||
            value.articles?.[0]?.id ||
            "",
      );
    }
    function revokeConversation(id) {
      if (!id) return;
      if (!revokedConversations.current.has(id)) listGeneration.current++;
      revokedConversations.current.add(id);
      conversationsRef.current = conversationsRef.current.filter(
        (item) => item.id !== id,
      );
      setConversations((items) => items.filter((item) => item.id !== id));
      setSource((value) =>
        value?.conversation?.id === id || value?.message?.conversationId === id
          ? null
          : value,
      );
      setMessageEditor((value) =>
        value?.message.conversationId === id ? null : value,
      );
      setMessageToDelete((value) =>
        value?.message.conversationId === id ? null : value,
      );
      setModerationDialog((value) =>
        value?.conversationId === id ? null : value,
      );
      setAccessDialog((value) => (value?.conversationId === id ? null : value));
      setChannelDialog((value) =>
        value?.conversation.id === id ? null : value,
      );
      mentionGeneration.current++;
      setMentionInbox((value) => {
        const removed = value.mentions.filter(
          (entry) => entry.conversationId === id,
        );
        return {
          ...value,
          mentions: value.mentions.filter(
            (entry) => entry.conversationId !== id,
          ),
          unreadCount: Math.max(
            0,
            value.unreadCount - removed.filter((entry) => !entry.readAt).length,
          ),
        };
      });
      if (selectedRef.current === id) {
        selectedRef.current = "";
        detailGeneration.current++;
        changeCursorRef.current = null;
        setConversationId("");
        setMessages([]);
        setThreadId(null);
        setPagination({ hasMore: false });
        setDetailLoading(false);
        setRateLimit(null);
        setNotice(
          "Доступ к чату изменился. Переписка больше недоступна; ваш неотправленный черновик сохранён.",
        );
      }
    }
    function applyConversationList(items, selectFirst = false) {
      if (
        !Array.isArray(items) ||
        items.some(
          (item) =>
            !item ||
            typeof item.id !== "string" ||
            typeof item.responsibilityScopeId !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              item.responsibilityScopeId,
            ),
        ) ||
        new Set(items.map((item) => item.id)).size !== items.length
      ) {
        for (const item of [...conversationsRef.current])
          revokeConversation(item.id);
        throw new Error("Не удалось проверить список чатов. Обновите команду.");
      }
      const allowed = new Set(items.map((item) => item.id));
      for (const item of conversationsRef.current)
        if (!allowed.has(item.id)) revokeConversation(item.id);
      for (const id of allowed) revokedConversations.current.delete(id);
      conversationsRef.current = items;
      setConversations(items);
      if (selectFirst)
        setConversationId((id) =>
          allowed.has(id)
            ? id
            : items.find((item) => !item.archivedAt)?.id || "",
        );
    }
    function visibleMentionInbox(value) {
      const removed = (value.mentions || []).filter((entry) =>
        revokedConversations.current.has(entry.conversationId),
      );
      return {
        ...value,
        mentions: (value.mentions || []).filter(
          (entry) => !revokedConversations.current.has(entry.conversationId),
        ),
        unreadCount: Math.max(
          0,
          (value.unreadCount || 0) -
            removed.filter((entry) => !entry.readAt).length,
        ),
      };
    }
    async function loadLists(targetScope, signal, manage = canManage) {
      const account = accountRef.current,
        version = ++listGeneration.current,
        summaryVersion = summaryGeneration.current,
        scheduleVersion = scheduleGeneration.current,
        suffix = `?responsibilityScopeId=${encodeURIComponent(targetScope)}`;
      const results = await Promise.allSettled([
        api(`/team/people${suffix}`, { signal }),
        api(`/team/conversations${suffix}`, { signal }),
        api(`/team/articles${suffix}`, { signal }),
        api(`/team/summaries${suffix}`, { signal }),
        manage
          ? api(`/team/schedules${suffix}`, { signal })
          : Promise.resolve({ schedules: [] }),
        api(`/team/mentions${suffix}`, { signal }),
        api("/team/adaptation", { signal }),
      ]);
      if (
        signal?.aborted ||
        !current(targetScope, account) ||
        version !== listGeneration.current
      )
        return;
      const updates = [
        (value) => setPeople(value.people || []),
        (value) => {
          applyConversationList(value.conversations || [], true);
        },
        (value) => {
          applyKnowledge(value, manage);
        },
        (value) => {
          setSummaries((items) => summaryVersion === summaryGeneration.current
            ? value.summaries || []
            : retainChangedRows(items, value.summaries || []));
          setSummaryId((id) => id || value.summaries?.[0]?.id || "");
        },
        (value) => {
          setSchedules((items) => scheduleVersion === scheduleGeneration.current
            ? value.schedules || []
            : retainChangedRows(items, value.schedules || []));
        },
        (value) => {
          mentionGeneration.current++;
          setMentionInbox(visibleMentionInbox(value));
        },
        (value) => applyAdaptation(value, targetScope),
      ];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") updates[index](result.value);
        else if (index === 2 && result.reason?.status === 403) {
          setKnowledgeAccess({
            canCreate: false,
            canEdit: false,
            canManage: false,
          });
          setArticles([]);
          setArticleForm(null);
          setConflict(null);
          setPermissionPanel(null);
        }
      });
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected) throw rejected.reason;
    }
    useEffect(() => {
      if (!scopeId || !scopeAvailable) return;
      const controller = new AbortController();
      setLoading(true);
      setError("");
      loadLists(scopeId, controller.signal)
        .catch((reason) => {
          if (!controller.signal.aborted) setError(fail(reason));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
    }, [scopeId, scopeAvailable, canManage]);
    useEffect(() => {
      const targetScope = articleForm?.responsibilityScopeId;
      setArticlePositionDraft(null);
      if (!articleStructured || !targetScope) return;
      const controller = new AbortController();
      setArticlePositions({
        scopeId: targetScope,
        items: [],
        loading: true,
        error: "",
      });
      api(
        `/team/article-positions?responsibilityScopeId=${encodeURIComponent(targetScope)}`,
        {
          signal: controller.signal,
        },
      )
        .then((value) => {
          if (!controller.signal.aborted)
            setArticlePositions({
              scopeId: targetScope,
              items: value.positions || [],
              loading: false,
              error: "",
            });
        })
        .catch((reason) => {
          if (!controller.signal.aborted)
            setArticlePositions({
              scopeId: targetScope,
              items: [],
              loading: false,
              error: fail(reason),
            });
        });
      return () => controller.abort();
    }, [
      articleForm?.responsibilityScopeId,
      articleStructured,
      token,
      actor.id,
    ]);
    useEffect(() => {
      if (!scopeId || !scopeAvailable || tab !== "knowledge") return;
      let controller,
        inFlight = false;
      const update = async () => {
        if (document.hidden || inFlight || busyRef.current) return;
        inFlight = true;
        controller = new AbortController();
        const account = accountRef.current,
          workspaceVersion = generation.current,
          version = ++knowledgeGeneration.current;
        try {
          const result = await api(scoped("/team/articles"), {
            signal: controller.signal,
          });
          if (
            !controller.signal.aborted &&
            current(scopeId, account) &&
            workspaceVersion === generation.current &&
            version === knowledgeGeneration.current
          )
            applyKnowledge(result);
        } catch (reason) {
          if (
            !controller.signal.aborted &&
            current(scopeId, account) &&
            workspaceVersion === generation.current
          ) {
            if (reason?.status === 403) {
              setKnowledgeAccess({
                canCreate: false,
                canEdit: false,
                canManage: false,
              });
              setArticles([]);
              setArticleForm(null);
              setConflict(null);
              setPermissionPanel(null);
            }
            setError(fail(reason));
          }
        } finally {
          inFlight = false;
        }
      };
      update();
      const timer = window.setInterval(update, 15000);
      return () => {
        window.clearInterval(timer);
        controller?.abort();
      };
    }, [scopeId, scopeAvailable, tab, token]);
    useEffect(() => {
      if (!scopeId || !scopeAvailable) return;
      let controller,
        inFlight = false;
      const timer = window.setInterval(async () => {
        if (document.hidden || inFlight || busyRef.current) return;
        inFlight = true;
        controller = new AbortController();
        const account = accountRef.current,
          workspaceVersion = generation.current,
          version = ++mentionGeneration.current;
        try {
          let result = await api(scoped("/team/mentions"), {
            signal: controller.signal,
          });
          const wanted = Math.max(100, mentionInboxRef.current.mentions.length),
            unreadCount = result.unreadCount;
          let entries = result.mentions || [];
          while (
            result.hasMore &&
            result.nextBefore &&
            entries.length < wanted
          ) {
            if (
              controller.signal.aborted ||
              !current(scopeId, account) ||
              workspaceVersion !== generation.current ||
              version !== mentionGeneration.current ||
              busyRef.current
            )
              return;
            result = await api(
              `${scoped("/team/mentions")}&before=${encodeURIComponent(result.nextBefore)}`,
              { signal: controller.signal },
            );
            entries = [
              ...new Map(
                [...entries, ...(result.mentions || [])].map((entry) => [
                  entry.messageId,
                  entry,
                ]),
              ).values(),
            ];
          }
          if (
            !controller.signal.aborted &&
            current(scopeId, account) &&
            workspaceVersion === generation.current &&
            version === mentionGeneration.current
          ) {
            // Revalidate every explicitly loaded page: deleted and revised mentions
            // must not survive only because they were loaded before the newest page.
            setMentionInbox(
              visibleMentionInbox({
                ...result,
                mentions: entries,
                unreadCount,
              }),
            );
          }
        } catch (reason) {
          if (
            !controller.signal.aborted &&
            current(scopeId, account) &&
            workspaceVersion === generation.current
          )
            setError(fail(reason));
        } finally {
          inFlight = false;
        }
      }, 12000);
      return () => {
        window.clearInterval(timer);
        controller?.abort();
        mentionGeneration.current++;
      };
    }, [scopeId, scopeAvailable, actor?.id]);
    useEffect(() => {
      if (!scopeId || !scopeAvailable || !conversationId) return;
      const controller = new AbortController(),
        version = ++detailGeneration.current,
        account = accountRef.current;
      setMessages([]);
      setThreadId(null);
      changeCursorRef.current = null;
      setPagination({ hasMore: false });
      setDetailLoading(true);
      api(scoped(`/team/conversations/${encodeURIComponent(conversationId)}`), {
        signal: controller.signal,
      })
        .then((result) => {
          if (
            controller.signal.aborted ||
            !current(scopeId, account) ||
            version !== detailGeneration.current
          )
            return;
          if (result.changeCursor != null)
            changeCursorRef.current = {
              scopeId,
              account,
              conversationId,
              cursor: String(result.changeCursor),
            };
          if (result.conversation) applyConversationUpdate(result.conversation);
          setMessages((before) =>
            mergeMessages(before, [
              ...(result.ancestors || []),
              ...(result.messages || []),
            ]),
          );
          setPagination({
            hasMore: result.hasMore,
            nextBefore: result.nextBefore,
          });
        })
        .catch((reason) => {
          if (
            !controller.signal.aborted &&
            current(scopeId, account) &&
            version === detailGeneration.current
          ) {
            if ([403, 404].includes(reason?.status))
              revokeConversation(conversationId);
            setError(fail(reason));
          }
        })
        .finally(() => {
          if (
            !controller.signal.aborted &&
            version === detailGeneration.current
          )
            setDetailLoading(false);
        });
      return () => controller.abort();
    }, [scopeId, scopeAvailable, conversationId]);
    function visibleReadMessageQuery() {
      const own = new Set(
        messagesRef.current
          .filter(
            (message) =>
              message.authorId === accountRef.current && !message.deletedAt,
          )
          .map((message) => message.id),
      );
      const ids = [
        ...new Set(
          [
            ...(workspaceRef.current?.querySelectorAll(
              ".team-message[data-message-id]",
            ) || []),
          ]
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.bottom > 0 &&
                rect.top < window.innerHeight
              );
            })
            .map((node) => node.dataset.messageId)
            .filter((id) => own.has(id)),
        ),
      ].slice(0, 100);
      return ids.length
        ? `&readMessageIds=${encodeURIComponent(ids.join(","))}`
        : "";
    }
    function applyReadStatuses(statuses = []) {
      const byId = new Map(statuses.map((status) => [status.id, status]));
      setMessages((previous) =>
        previous.map((message) => {
          const status = byId.get(message.id);
          return status && status.version === message.version
            ? { ...message, delivery: status.delivery }
            : message;
        }),
      );
    }
    // Refresh active conversations without replacing draft text or older loaded messages.
    useEffect(() => {
      if (!scopeId || !scopeAvailable) return;
      let controller,
        inFlight = false;
      const timer = window.setInterval(async () => {
        if (document.hidden || inFlight || busyRef.current) return;
        inFlight = true;
        controller = new AbortController();
        const account = accountRef.current,
          target = conversationId,
          version = detailGeneration.current,
          listVersion = listGeneration.current;
        try {
          const results = await Promise.allSettled([
            api(scoped("/team/conversations"), { signal: controller.signal }),
            target
              ? api(
                  scoped(`/team/conversations/${encodeURIComponent(target)}`),
                  { signal: controller.signal },
                )
              : Promise.resolve(null),
            target &&
            changeCursorRef.current?.conversationId === target &&
            changeCursorRef.current?.scopeId === scopeId &&
            changeCursorRef.current?.account === account
              ? api(
                  `${scoped(`/team/conversations/${encodeURIComponent(target)}/changes`)}&afterChange=${encodeURIComponent(changeCursorRef.current.cursor)}${visibleReadMessageQuery()}`,
                  { signal: controller.signal },
                )
              : Promise.resolve(null),
          ]);
          if (
            controller.signal.aborted ||
            !current(scopeId, account) ||
            busyRef.current
          )
            return;
          if (
            results[0].status === "fulfilled" &&
            listVersion === listGeneration.current
          )
            applyConversationList(results[0].value.conversations || []);
          if (
            target &&
            results
              .slice(1)
              .some(
                (result) =>
                  result.status === "rejected" &&
                  [403, 404].includes(result.reason?.status),
              )
          ) {
            revokeConversation(target);
            return;
          }
          if (
            results[1].status === "fulfilled" &&
            results[1].value &&
            version === detailGeneration.current &&
            selectedRef.current === target
          ) {
            const page = results[1].value;
            const previousIds = new Set(
              messagesRef.current.map((item) => item.id),
            );
            // A busy or offline chat may advance by more than one page between
            // polls. Start backfilling at the new page, not the old history cursor,
            // so intervening messages remain reachable. Ancestors aren't page overlap.
            if (
              page.hasMore &&
              !page.messages?.some((item) => previousIds.has(item.id))
            ) {
              setPagination({ hasMore: true, nextBefore: page.nextBefore });
            }
            setMessages((before) =>
              mergeMessages(before, [
                ...(page.ancestors || []),
                ...(page.messages || []),
              ]),
            );
          }
          let changed =
            results[2].status === "fulfilled" ? results[2].value : null;
          while (changed) {
            if (
              controller.signal.aborted ||
              !current(scopeId, account) ||
              busyRef.current ||
              version !== detailGeneration.current ||
              selectedRef.current !== target
            )
              return;
            applyMessageUpdates(
              [...(changed.ancestors || []), ...(changed.messages || [])],
              true,
            );
            if (changed.conversation)
              applyConversationUpdate(changed.conversation);
            applyReadStatuses(changed.readStatuses);
            changeCursorRef.current = {
              scopeId,
              account,
              conversationId: target,
              cursor: String(changed.changeCursor),
            };
            if (!changed.hasMore) break;
            changed = await api(
              `${scoped(`/team/conversations/${encodeURIComponent(target)}/changes`)}&afterChange=${encodeURIComponent(changed.changeCursor)}`,
              { signal: controller.signal },
            );
          }
          const rejected = results.find(
            (result) => result.status === "rejected",
          );
          if (rejected) setError(fail(rejected.reason));
        } catch (reason) {
          if (
            !controller.signal.aborted &&
            current(scopeId, account) &&
            version === detailGeneration.current
          )
            setError(fail(reason));
        } finally {
          inFlight = false;
        }
      }, 12000);
      return () => {
        window.clearInterval(timer);
        controller?.abort();
      };
    }, [scopeId, scopeAvailable, conversationId, tab]);
    useEffect(() => {
      if (!scopeAvailable || !source?.message?.id) return;
      const messageId = source.message.id,
        targetScope = scopeId,
        account = accountRef.current,
        workspaceVersion = generation.current;
      let controller,
        inFlight = false;
      const timer = window.setInterval(async () => {
        if (document.hidden || busyRef.current || inFlight) return;
        inFlight = true;
        controller = new AbortController();
        try {
          const result = await api(
            scoped(`/team/messages/${encodeURIComponent(messageId)}`),
            { signal: controller.signal },
          );
          if (
            !controller.signal.aborted &&
            current(targetScope, account) &&
            workspaceVersion === generation.current
          )
            setSource((value) =>
              value?.message.id === messageId
                ? {
                    ...result,
                    message: mergeMessages(
                      [value.message],
                      [result.message],
                    )[0],
                    ancestors: (result.ancestors || []).map(
                      (ancestor) =>
                        mergeMessages(
                          value.ancestors?.filter(
                            (item) => item.id === ancestor.id,
                          ) || [],
                          [ancestor],
                        )[0],
                    ),
                    origin: value.origin,
                  }
                : value,
            );
        } catch (reason) {
          if (
            !controller.signal.aborted &&
            current(targetScope, account) &&
            workspaceVersion === generation.current
          ) {
            if ([403, 404].includes(reason?.status)) {
              revokeConversation(
                source.conversation?.id || source.message.conversationId,
              );
              setSource(null);
            }
            setError(fail(reason));
          }
        } finally {
          inFlight = false;
        }
      }, 12000);
      return () => {
        window.clearInterval(timer);
        controller?.abort();
      };
    }, [scopeId, scopeAvailable, source?.message?.id]);

    useEffect(() => {
      if (!scopeId || !scopeAvailable) return;
      let active = true,
        inFlight = false;
      const controller = new AbortController();
      const update = async () => {
        if (inFlight || !active) return;
        inFlight = true;
        const results = await Promise.allSettled([
          api(scoped("/team/recognition"), { signal: controller.signal }),
          api(scoped("/team/profile-directory"), { signal: controller.signal }),
        ]);
        if (active && current(scopeId, actor.id)) {
          setRecognition(
            results[0].status === "fulfilled"
              ? Object.fromEntries(
                  (results[0].value.recognition || []).map((row) => [
                    row.userId,
                    row.count,
                  ]),
                )
              : {},
          );
          setProfileDirectory(
            results[1].status === "fulfilled"
              ? Object.fromEntries(
                  (results[1].value.profiles || []).map((row) => [
                    row.userId,
                    row.avatarVersion,
                  ]),
                )
              : {},
          );
        }
        inFlight = false;
      };
      update();
      const timer = setInterval(update, 15000);
      window.addEventListener("profile-updated", update);
      return () => {
        active = false;
        controller.abort();
        clearInterval(timer);
        window.removeEventListener("profile-updated", update);
      };
    }, [scopeId, scopeAvailable, token, metadataRevision]);
    useEffect(() => {
      if (
        !navigationRequest ||
        handledNavigation.current === navigationRequest.nonce ||
        contextLoading ||
        busy ||
        !scopes.length
      )
        return;
      const target = navigationRequest;
      if (!scopeAccessRef.current.has(target.scopeId)) {
        handledNavigation.current = target.nonce;
        setError("Область переписки больше недоступна.");
        return;
      }
      if (loading) return;
      if (!conversations.some((row) => row.id === target.conversationId))
        return;
      handledNavigation.current = target.nonce;
      if (!chooseTab("chat")) return;
      chooseConversation(target.conversationId);
      if (target.messageId) {
        const account = accountRef.current,
          workspaceVersion = generation.current,
          requestVersion = ++navigationSourceVersion.current;
        api(scoped(`/team/messages/${encodeURIComponent(target.messageId)}`))
          .then((result) => {
            if (
              current(scopeId, account) &&
              generation.current === workspaceVersion &&
              requestVersion === navigationSourceVersion.current &&
              selectedRef.current === target.conversationId &&
              !revokedConversations.current.has(
                result.conversation?.id || result.message?.conversationId,
              )
            )
              setSource({ ...result, origin: "mention" });
          })
          .catch((reason) => {
            if (
              current(scopeId, account) &&
              generation.current === workspaceVersion
            )
              setError(fail(reason));
          });
      }
    }, [
      navigationRequest,
      contextLoading,
      scopeId,
      scopes,
      loading,
      conversations,
      busy,
    ]);
    // A visible message acknowledges only itself; collapsed branches remain unread.
    useEffect(() => {
      if (
        !scopeId ||
        !scopeAvailable ||
        !workspaceRef.current ||
        typeof IntersectionObserver !== "function"
      )
        return;
      const controller = new AbortController(),
        targetScope = scopeId,
        account = actor.id,
        workspaceVersion = generation.current,
        timers = new Map(),
        pending = new Map();
      let flushTimer;
      const visibleLayer = (node) => {
        const dialogs = [
          ...(workspaceRef.current?.querySelectorAll('[role="dialog"]') || []),
        ];
        return (
          !document.hidden &&
          (!dialogs.length ||
            (dialogs.length === 1 && dialogs[0].contains(node)))
        );
      };
      async function flush() {
        flushTimer = null;
        if (document.hidden || !current(targetScope, account)) return;
        const groups = new Map();
        for (const entry of pending.values()) {
          const items = groups.get(entry.conversationId) || [];
          items.push(entry);
          groups.set(entry.conversationId, items);
        }
        pending.clear();
        for (const [id, entries] of groups)
          for (let start = 0; start < entries.length; start += 100) {
            const batch = entries.slice(start, start + 100),
              pairs = batch.map(({ id, version }) => ({ id, version }));
            try {
              const value = await api(
                `/team/conversations/${encodeURIComponent(id)}/read`,
                {
                  method: "PUT",
                  signal: controller.signal,
                  body: JSON.stringify({
                    responsibilityScopeId: targetScope,
                    messages: pairs,
                  }),
                },
              );
              if (
                controller.signal.aborted ||
                !current(targetScope, account) ||
                generation.current !== workspaceVersion
              )
                return;
              setConversations((rows) =>
                rows.map((row) =>
                  row.id === id &&
                  Number(value.version || 1) >= Number(row.version || 1)
                    ? { ...row, ...value }
                    : row,
                ),
              );
              const versions = new Map(
                pairs.map((row) => [row.id, row.version]),
              );
              setMessages((rows) =>
                rows.map((row) =>
                  versions.get(row.id) === row.version
                    ? {
                        ...row,
                        isUnread: false,
                        isUnreadMention: false,
                        requiresReadReceipt: false,
                      }
                    : row,
                ),
              );
              setSource((previous) =>
                previous
                  ? {
                      ...previous,
                      message:
                        versions.get(previous.message.id) ===
                        previous.message.version
                          ? {
                              ...previous.message,
                              isUnread: false,
                              isUnreadMention: false,
                              requiresReadReceipt: false,
                            }
                          : previous.message,
                      ancestors: previous.ancestors?.map((row) =>
                        versions.get(row.id) === row.version
                          ? {
                              ...row,
                              isUnread: false,
                              isUnreadMention: false,
                              requiresReadReceipt: false,
                            }
                          : row,
                      ),
                    }
                  : previous,
              );
              setMentionInbox((previous) => {
                const seen = previous.mentions.filter(
                  (row) =>
                    !row.readAt && versions.get(row.messageId) === row.version,
                );
                return {
                  ...previous,
                  unreadCount: Math.max(0, previous.unreadCount - seen.length),
                  mentions: previous.mentions.map((row) =>
                    versions.get(row.messageId) === row.version
                      ? {
                          ...row,
                          readAt: row.readAt || new Date().toISOString(),
                        }
                      : row,
                  ),
                };
              });
              window.dispatchEvent(new Event("team-notifications-changed"));
            } catch (reason) {
              if (!controller.signal.aborted && reason.status === 401)
                callbacks.current.onExpired?.();
            }
          }
      }
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const node = entry.target;
            const visible =
              entry.isIntersecting &&
              entry.intersectionRect.height >=
                Math.min(
                  entry.boundingClientRect.height,
                  entry.rootBounds?.height || innerHeight,
                ) *
                  0.6;
            if (!visible || !visibleLayer(node)) {
              clearTimeout(timers.get(node));
              timers.delete(node);
              continue;
            }
            if (timers.has(node)) continue;
            timers.set(
              node,
              setTimeout(() => {
                timers.delete(node);
                if (!node.isConnected || !visibleLayer(node)) return;
                pending.set(node.dataset.messageId, {
                  id: node.dataset.messageId,
                  version: Number(node.dataset.messageVersion),
                  conversationId: node.dataset.conversationId,
                });
                if (!flushTimer) flushTimer = setTimeout(flush, 80);
              }, 650),
            );
          }
        },
        { threshold: [0, 0.05, 0.5, 0.6, 1] },
      );
      const observe = () => {
        observer.disconnect();
        for (const node of workspaceRef.current?.querySelectorAll(
          '[data-unread="true"]',
        ) || [])
          observer.observe(node);
      };
      const visibility = () => {
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
        pending.clear();
        if (!document.hidden) observe();
      };
      observe();
      document.addEventListener("visibilitychange", visibility);
      return () => {
        controller.abort();
        observer.disconnect();
        for (const timer of timers.values()) clearTimeout(timer);
        clearTimeout(flushTimer);
        document.removeEventListener("visibilitychange", visibility);
      };
    }, [
      token,
      scopeId,
      scopeAvailable,
      actor.id,
      messages,
      source,
      tab,
      threadId,
      query,
      profileCard,
      notificationDialog,
      dialog,
      accessDialog,
      channelDialog,
      messageEditor,
      messageToDelete,
      moderationDialog,
      permissionPanel,
      sharing,
    ]);

    async function mutate(key, action, success) {
      if (busyRef.current) return;
      const targetScope = scopeId,
        account = accountRef.current,
        version = generation.current;
      busyRef.current = true;
      setBusy(key);
      setError("");
      setNotice("");
      try {
        const result = await action();
        if (current(targetScope, account) && generation.current === version)
          success?.(result);
      } catch (reason) {
        if (current(targetScope, account) && generation.current === version)
          setError(fail(reason));
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy("");
      }
    }
    const chooseScope = (next) => {
      if (busyRef.current) return false;
      if (next === scopeId) return true;
      if (
        dirty &&
        !window.confirm("Сменить область и удалить несохранённые черновики?")
      )
        return false;
      resetWorkspace();
      setScopeId(next);
      return true;
    };
    const chooseTab = (next) => {
      if (busyRef.current) return false;
      if (
        next !== tab &&
        ((tab === "tasks" && tasksDirty) ||
          (tab === "outcomes" && outcomesDirty)) &&
        !window.confirm("Удалить несохранённые изменения формы?")
      )
        return false;
      if (
        tab === "drivers" &&
        next !== tab &&
        driverRequestsDirty &&
        !window.confirm("Удалить несохранённый черновик запроса водителя?")
      )
        return false;
      if (next === "summaries" && tab !== "summaries")
        setPeriodEnd(dateInput(Date.now()));
      navigationSourceVersion.current++;
      setTab(next);
      setQuery("");
      setError("");
      return true;
    };
    const chooseConversation = (id) => {
      if (busyRef.current) return;
      navigationSourceVersion.current++;
      if (conversationsRef.current.find((item) => item.id === id)?.archivedAt)
        setArchiveExpanded(true);
      selectedRef.current = id;
      setConversationId(id);
      setThreadId(null);
      setError("");
    };
    const canManageChannel = (item) =>
      canManage && item?.kind === "channel" && item.canManageChannel === true;
    const channelOrder = (a, b) =>
      Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
      a.id.localeCompare(b.id);
    function channelNeighbors(item) {
      const channels = conversations
        .filter(
          (row) =>
            row.kind === "channel" &&
            !row.archivedAt &&
            row.legalEntityId === item.legalEntityId,
        )
        .sort(channelOrder);
      const index = channels.findIndex((row) => row.id === item.id);
      return { up: index > 0, down: index >= 0 && index < channels.length - 1 };
    }
    async function moveChannel(item, movement) {
      if (!canManageChannel(item) || item.archivedAt || busyRef.current) return;
      const operationId = uid();
      await mutate(
        "channel-order",
        async () => {
          try {
            return await api(
              `/team/conversations/${encodeURIComponent(item.id)}/order`,
              {
                method: "PUT",
                body: JSON.stringify({
                  responsibilityScopeId: item.responsibilityScopeId,
                  operationId,
                  version: item.version,
                  ...(typeof movement === "string"
                    ? { direction: movement }
                    : movement),
                }),
              },
            );
          } catch (reason) {
            if (reason?.status === 409) await loadLists(scopeId);
            throw reason;
          }
        },
        (result) => {
          listGeneration.current++;
          const updates = new Map(
            (result.order || []).map((row) => [row.id, row]),
          );
          detailGeneration.current++;
          const rows = conversationsRef.current.map((row) => ({
            ...row,
            ...updates.get(row.id),
          }));
          conversationsRef.current = rows;
          setConversations(rows);
          setNotice("Порядок каналов сохранён для команды.");
        },
      );
    }
    const channelDrag = useChannelReorder({
      enabled:
        canManage &&
        !busy &&
        tab === "chat" &&
        !dialog &&
        !channelDialog &&
        !accessDialog,
      items: conversations,
      onMove: moveChannel,
      resetKey: `${actor.id}:${scopeId}:${tab}:${query}`,
    });
    function confirmChannelAction(item, action) {
      if (!canManageChannel(item) || busyRef.current) return;
      setError("");
      setChannelDialog({
        conversation: item,
        action,
        operationId: uid(),
        conflict: false,
      });
    }
    async function changeChannel(target) {
      const { conversation: item, action, operationId } = target;
      if (!canManageChannel(item) || busyRef.current || target.conflict) return;
      await mutate(
        "channel-lifecycle",
        async () => {
          try {
            return await api(
              `/team/conversations/${encodeURIComponent(item.id)}/lifecycle`,
              {
                method: "PUT",
                body: JSON.stringify({
                  responsibilityScopeId: item.responsibilityScopeId,
                  operationId,
                  version: item.version,
                  action,
                }),
              },
            );
          } catch (reason) {
            if (reason?.status === 409) {
              setChannelDialog(
                (value) => value && { ...value, conflict: true },
              );
              await loadLists(scopeId);
            }
            throw reason;
          }
        },
        (result) => {
          listGeneration.current++;
          if (action === "delete" || result.conversation?.deletedAt) {
            revokeConversation(item.id);
            if (action === "delete")
              setDrafts((previous) =>
                Object.fromEntries(
                  Object.entries(previous).filter(
                    ([key]) => !key.startsWith(`${item.id}:`),
                  ),
                ),
              );
            const next =
              conversationsRef.current.find((row) => !row.archivedAt)?.id || "";
            selectedRef.current = next;
            setConversationId(next);
            setNotice(`Канал «${item.title}» удалён.`);
          } else {
            detailGeneration.current++;
            applyConversationUpdate(result.conversation);
            if (result.conversation?.archivedAt) setArchiveExpanded(true);
            setNotice(
              result.conversation?.archivedAt
                ? `Канал «${item.title}» перенесён в архив.`
                : `Канал «${item.title}» возвращён из архива.`,
            );
          }
          setChannelDialog(null);
          window.dispatchEvent(new Event("team-notifications-changed"));
        },
      );
    }
    async function refresh() {
      if (busyRef.current) return;
      if (tab === "drivers") setDriverRequestsRefresh((value) => value + 1);
      if (tab === "response-metrics") setMetricsRefresh((value) => value + 1);
      await mutate(
        "refresh",
        () => loadLists(scopeId),
        () => setNotice("Данные обновлены."),
      );
    }
    async function loadEarlier() {
      const target = conversationId,
        version = detailGeneration.current;
      await mutate(
        "earlier",
        () =>
          api(
            `${scoped(`/team/conversations/${encodeURIComponent(target)}`)}&before=${encodeURIComponent(pagination.nextBefore)}`,
          ),
        (result) => {
          if (
            target !== selectedRef.current ||
            version !== detailGeneration.current
          )
            return;
          setMessages((before) =>
            mergeMessages(
              [...(result.ancestors || []), ...(result.messages || [])],
              before,
            ),
          );
          setPagination({
            hasMore: result.hasMore,
            nextBefore: result.nextBefore,
          });
        },
      );
    }
    const newConversation = (kind) => {
      setDialog({
        id: uid(),
        kind,
        title: "",
        personId: "",
        visibility: kind === "direct" ? "private" : "public",
        memberIds: [actor.id],
      });
      setError("");
    };
    const closeDialog = () => {
      if (busyRef.current) return;
      if (
        (dialog?.title.trim() ||
          dialog?.personId ||
          (dialog?.visibility === "private" && dialog?.kind === "channel")) &&
        !window.confirm("Удалить черновик нового чата?")
      )
        return;
      setDialog(null);
    };
    async function saveConversation(event) {
      event.preventDefault();
      if (
        !dialog ||
        (dialog.kind === "channel" ? !dialog.title.trim() : !dialog.personId)
      ) {
        setError("Укажите название канала или собеседника.");
        return;
      }
      const data = {
        id: dialog.id,
        responsibilityScopeId: scopeId,
        kind: dialog.kind,
        title: dialog.kind === "channel" ? dialog.title.trim() : "",
        visibility:
          dialog.kind === "channel" && !canManage
            ? "public"
            : dialog.visibility,
        memberIds:
          dialog.kind === "direct"
            ? [actor.id, dialog.personId]
            : dialog.visibility === "private"
              ? [...new Set(dialog.memberIds)]
              : [],
      };
      await mutate(
        "conversation",
        () =>
          api("/team/conversations", {
            method: "POST",
            body: JSON.stringify(data),
          }),
        (result) => {
          const saved = result.conversation || result;
          const value = {
            ...saved,
            responsibilityScopeId:
              saved.responsibilityScopeId || data.responsibilityScopeId,
          };
          listGeneration.current++;
          setConversations((items) => [
            value,
            ...items.filter((item) => item.id !== value.id),
          ]);
          setDialog(null);
          setTab("chat");
          setConversationId(value.id);
          setNotice(
            data.kind === "channel" ? "Канал создан." : "Личный чат открыт.",
          );
        },
      );
    }
    function openAccessDialog() {
      if (busyRef.current || !canManage || !conversation?.canManageAccess)
        return;
      setError("");
      setAccessDialog({
        conversationId: conversation.id,
        visibility: conversation.visibility || "public",
        memberIds: [...new Set((conversation.memberIds || []).filter(Boolean))],
        creatorId: conversation.createdBy,
        version: conversation.version || 1,
        operationId: uid(),
        changed: false,
      });
    }
    function closeAccessDialog() {
      if (busyRef.current) return;
      if (
        accessDialog?.changed &&
        !window.confirm("Удалить несохранённые изменения доступа?")
      )
        return;
      setAccessDialog(null);
    }
    async function saveAccess(event) {
      event.preventDefault();
      if (!accessDialog || busyRef.current) return;
      const value = accessDialog,
        account = accountRef.current,
        targetScope = scopeId,
        workspaceVersion = generation.current;
      await mutate(
        "conversation-access",
        async () => {
          try {
            return await api(
              `/team/conversations/${encodeURIComponent(value.conversationId)}/access`,
              {
                method: "PUT",
                body: JSON.stringify({
                  responsibilityScopeId: targetScope,
                  operationId: value.operationId,
                  version: value.version,
                  visibility: value.visibility,
                  memberIds:
                    value.visibility === "private"
                      ? [...new Set(value.memberIds.filter(Boolean))]
                      : [],
                }),
              },
            );
          } catch (reason) {
            if (
              reason?.status === 409 &&
              current(targetScope, account) &&
              workspaceVersion === generation.current
            ) {
              const result = await api(
                scoped(
                  `/team/conversations/${encodeURIComponent(value.conversationId)}`,
                ),
              );
              if (
                current(targetScope, account) &&
                workspaceVersion === generation.current
              ) {
                applyConversationUpdate(result.conversation);
                if (result.conversation.canManageAccess)
                  setAccessDialog((before) =>
                    before?.conversationId === value.conversationId
                      ? {
                          ...before,
                          version: result.conversation.version,
                          operationId: uid(),
                          conflict: result.conversation,
                        }
                      : before,
                  );
                else setAccessDialog(null);
              }
              throw new Error(
                "Доступ уже изменён другим участником. Ваш выбор сохранён; проверьте его и подтвердите сохранение ещё раз.",
              );
            }
            throw reason;
          }
        },
        (result) => {
          listGeneration.current++;
          applyConversationUpdate(result.conversation || result);
          setAccessDialog(null);
          setNotice("Доступ к чату обновлён.");
        },
      );
    }
    function addAttachments(files, key, { original = false, kind } = {}) {
      if (!files.length || busyRef.current || !maySend) return false;
      const previous = drafts[key] || { text: "", attachments: [] },
        existing = previous.attachments || [],
        targetScope = scopeId,
        account = accountRef.current,
        version = generation.current;
      if (existing.length + files.length > MAX_ATTACHMENTS) {
        setDrafts((values) => ({
          ...values,
          [key]: {
            ...(values[key] || previous),
            error: "Можно прикрепить не более 5 файлов к одному сообщению.",
          },
        }));
        return false;
      }
      const attachments = files.map((file) => ({
        id: uid(),
        filename: file.name,
        mimeType: file.type.split(";")[0] || "application/octet-stream",
        kind: kind || "file",
        byteSize: 0,
        originalSize: file.size,
        preparing: true,
      }));
      setDrafts((values) => ({
        ...values,
        [key]: {
          ...(values[key] || previous),
          id: uid(),
          attachments: [...(values[key]?.attachments || []), ...attachments],
          error: "",
        },
      }));
      const updateAttachment = (id, update) => {
        if (!current(targetScope, account) || generation.current !== version)
          return;
        setDrafts((values) => {
          if (
            !current(targetScope, account) ||
            generation.current !== version ||
            !values[key]?.attachments?.some((file) => file.id === id)
          )
            return values;
          return {
            ...values,
            [key]: {
              ...values[key],
              attachments: values[key].attachments.map((file) =>
                file.id === id ? { ...file, ...update } : file,
              ),
            },
          };
        });
      };
      files.forEach(async (file, index) => {
        const id = attachments[index].id;
        try {
          const prepared = kind
            ? { file, kind, originalSize: file.size, compressed: false }
            : await preparePhoto(file, { original });
          if (!current(targetScope, account) || generation.current !== version)
            return;
          if (prepared.file.size > MAX_ATTACHMENT_BYTES)
            throw new Error(
              "Файл превышает 25 МБ. Выберите меньший файл или отправьте фото со сжатием.",
            );
          updateAttachment(id, {
            filename: prepared.file.name,
            mimeType:
              prepared.file.type.split(";")[0] || "application/octet-stream",
            kind: prepared.kind || "file",
            byteSize: prepared.file.size,
            originalSize: prepared.originalSize,
            compressed: prepared.compressed,
            note: prepared.note,
          });
          const contentBase64 = await readAttachment(prepared.file);
          updateAttachment(id, { contentBase64, preparing: false });
        } catch (reason) {
          updateAttachment(id, {
            preparing: false,
            error:
              reason.message ||
              "Не удалось подготовить файл. Выберите его заново.",
          });
        }
      });
      return true;
    }
    function applyConversationUpdate(value) {
      if (!value || revokedConversations.current.has(value.id)) return;
      const previous = conversationsRef.current.find(
        (item) => item.id === value.id,
      );
      if (
        previous &&
        value.responsibilityScopeId &&
        previous.responsibilityScopeId !== value.responsibilityScopeId
      ) {
        revokeConversation(value.id);
        throw new Error("Принадлежность чата изменилась. Обновите команду.");
      }
      setConversations((items) =>
        items.map((item) =>
          item.id === value.id &&
          Number(value.version || 1) >= Number(item.version || 1)
            ? {
                ...item,
                ...value,
                responsibilityScopeId: item.responsibilityScopeId,
              }
            : item,
        ),
      );
      if (value.moderation?.active === false)
        setRateLimit((limit) =>
          limit?.conversationId === value.id ? null : limit,
        );
      setClockNow(Date.now());
    }
    function applyMessageUpdates(updates, allowNew = false) {
      updates = updates.filter(
        (message) => !revokedConversations.current.has(message.conversationId),
      );
      if (!updates.length) return;
      setMessages((values) =>
        mergeMessages(
          values,
          updates.filter(
            (message) =>
              values.some((item) => item.id === message.id) ||
              (allowNew && message.conversationId === selectedRef.current),
          ),
        ),
      );
      setSource((value) => {
        if (!value) return value;
        const replace = (message) => {
          const update = updates.find((item) => item.id === message.id);
          return update ? mergeMessages([message], [update])[0] : message;
        };
        return {
          ...value,
          message: replace(value.message),
          ancestors: (value.ancestors || []).map(replace),
        };
      });
      setMessageEditor((value) => {
        if (!value) return value;
        const update = updates.find(
          (message) => message.id === value.message.id,
        );
        return update &&
          (update.deletedAt || Number(update.version || 1) > value.version)
          ? { ...value, conflict: update }
          : value;
      });
      setMessageToDelete((value) => {
        const deleted =
          value &&
          updates.find(
            (message) => message.id === value.message.id && message.deletedAt,
          );
        return deleted ? { ...value, message: deleted } : value;
      });
      setMentionInbox((value) => {
        let removedUnread = 0;
        const mentions = value.mentions.flatMap((entry) => {
          const message = updates.find((item) => item.id === entry.messageId);
          if (!message) return [entry];
          if (
            message.deletedAt ||
            (!message.mentions?.all &&
              !message.mentions?.userIds?.includes(actor?.id))
          ) {
            if (!entry.readAt) removedUnread++;
            return [];
          }
          return [{ ...entry, text: message.text }];
        });
        return {
          ...value,
          mentions,
          unreadCount: Math.max(0, value.unreadCount - removedUnread),
        };
      });
    }
    const archivedMessage = (message) =>
      Boolean(
        (
          conversations.find((item) => item.id === message.conversationId) ||
          (source?.conversation?.id === message.conversationId
            ? source.conversation
            : null)
        )?.archivedAt,
      );
    const mayEditMessage = (message) =>
      !archivedMessage(message) &&
      !message.deletedAt &&
      (message.canEdit ?? (canManage || message.authorId === actor?.id));
    const mayDeleteMessage = (message) =>
      !archivedMessage(message) &&
      !message.deletedAt &&
      (message.canDelete ?? (canManage || message.authorId === actor?.id));
    function openMessageEditor(message) {
      if (busyRef.current || !mayEditMessage(message)) return;
      setSource(null);
      setError("");
      setMessageEditor({
        message,
        text: message.text || "",
        originalText: message.text || "",
        version: message.version || 1,
        operationId: uid(),
        conflict: null,
      });
    }
    function closeMessageEditor() {
      if (busyRef.current) return;
      if (
        messageEditor?.text !== messageEditor?.originalText &&
        !window.confirm("Удалить несохранённые изменения сообщения?")
      )
        return;
      setMessageEditor(null);
      setError("");
    }
    async function saveMessageEdit(event, latest = null) {
      event?.preventDefault();
      const editor = messageEditor;
      if (!editor || busyRef.current || editor.conflict?.deletedAt) return;
      const text = editor.text.trim();
      if (!text && !editor.message.attachments?.length) {
        setError(
          "Введите текст сообщения. Пустое сообщение без вложений сохранить нельзя.",
        );
        return;
      }
      const requestVersion = latest?.version || editor.version,
        operationId = latest ? uid() : editor.operationId,
        account = accountRef.current,
        targetScope = scopeId,
        workspaceVersion = generation.current;
      if (latest)
        setMessageEditor(
          (value) =>
            value && {
              ...value,
              version: requestVersion,
              operationId,
              conflict: null,
            },
        );
      await mutate(
        `message-edit:${editor.message.id}`,
        async () => {
          try {
            return await api(
              `/team/messages/${encodeURIComponent(editor.message.id)}`,
              {
                method: "PUT",
                body: JSON.stringify({
                  responsibilityScopeId: targetScope,
                  operationId,
                  version: requestVersion,
                  text,
                  mentions: mentionsFromText(text),
                }),
              },
            );
          } catch (reason) {
            if (
              reason?.status === 409 &&
              current(targetScope, account) &&
              generation.current === workspaceVersion
            ) {
              let conflict = { unavailable: true };
              try {
                const result = await api(
                  scoped(
                    `/team/messages/${encodeURIComponent(editor.message.id)}`,
                  ),
                );
                conflict = result.message || result;
              } catch {}
              if (
                current(targetScope, account) &&
                generation.current === workspaceVersion
              ) {
                setMessageEditor((value) =>
                  value?.message.id === editor.message.id
                    ? { ...value, conflict }
                    : value,
                );
                if (conflict.id) applyMessageUpdates([conflict]);
              }
              throw new Error(
                "Сообщение уже изменилось. Ваш текст сохранён; сравните его с актуальной версией.",
              );
            }
            throw reason;
          }
        },
        (result) => {
          applyMessageUpdates([result.message || result]);
          setMessageEditor(null);
          setNotice("Сообщение изменено.");
        },
      );
    }
    function confirmMessageDeletion(message) {
      if (busyRef.current || !mayDeleteMessage(message)) return;
      setSource(null);
      setError("");
      setMessageToDelete({ message, operationId: uid(), changed: false });
    }
    async function deleteMessage() {
      if (!messageToDelete || busyRef.current) return;
      const deletion = messageToDelete,
        account = accountRef.current,
        targetScope = scopeId,
        workspaceVersion = generation.current;
      await mutate(
        `message-delete:${deletion.message.id}`,
        async () => {
          try {
            return await api(
              `/team/messages/${encodeURIComponent(deletion.message.id)}/deletion`,
              {
                method: "PUT",
                body: JSON.stringify({
                  responsibilityScopeId: targetScope,
                  operationId: deletion.operationId,
                  version: deletion.message.version || 1,
                }),
              },
            );
          } catch (reason) {
            if (
              reason?.status === 409 &&
              current(targetScope, account) &&
              generation.current === workspaceVersion
            ) {
              const result = await api(
                  scoped(
                    `/team/messages/${encodeURIComponent(deletion.message.id)}`,
                  ),
                ),
                latest = result.message || result;
              if (
                current(targetScope, account) &&
                generation.current === workspaceVersion &&
                !revokedConversations.current.has(latest.conversationId)
              ) {
                applyMessageUpdates([latest]);
                setMessageToDelete((value) =>
                  value?.message.id === latest.id
                    ? {
                        message: latest,
                        operationId: uid(),
                        changed: true,
                      }
                    : value,
                );
              }
              throw new Error(
                "Сообщение обновилось. Проверьте актуальный текст и подтвердите удаление ещё раз.",
              );
            }
            throw reason;
          }
        },
        (result) => {
          applyMessageUpdates([result.message || result]);
          setMessageToDelete(null);
          setNotice("Сообщение удалено. Ответы в ветках сохранены.");
        },
      );
    }
    async function toggleReaction(message, emoji, present) {
      if (message.deletedAt || busyRef.current) return;
      await mutate(
        `reaction:${message.id}`,
        () =>
          api(`/team/messages/${encodeURIComponent(message.id)}/reactions`, {
            method: "PUT",
            body: JSON.stringify({
              responsibilityScopeId: scopeId,
              emoji,
              present,
            }),
          }),
        (result) => applyMessageUpdates([result.message || result]),
      );
    }
    async function saveModeration() {
      if (!moderationDialog || busyRef.current) return;
      const target = moderationDialog;
      await mutate(
        "moderation",
        () =>
          api(
            `/team/conversations/${encodeURIComponent(target.conversationId)}/moderation`,
            {
              method: "PUT",
              body: JSON.stringify({
                responsibilityScopeId: scopeId,
                operationId: target.operationId,
                enabled: target.enabled,
              }),
            },
          ),
        (result) => {
          const value = result.moderation || result;
          listGeneration.current++;
          setConversations((items) =>
            items.map((item) =>
              item.id === target.conversationId
                ? { ...item, moderation: value }
                : item,
            ),
          );
          if (!value.active)
            setRateLimit((limit) =>
              limit?.conversationId === target.conversationId ? null : limit,
            );
          setClockNow(Date.now());
          setModerationDialog(null);
          setNotice(
            value.active
              ? `Антиконфликтный режим включён до ${dateLabel(value.enabledUntil)}.`
              : "Антиконфликтный режим выключен.",
          );
        },
      );
    }
    function messageActionDialogs() {
      return h(
        React.Fragment,
        null,
        messageEditor &&
          h(
            Dialog,
            {
              title: "Редактировать сообщение",
              className: "team-message-action-dialog",
              busy: Boolean(busy),
              onClose: closeMessageEditor,
            },
            h(
              "form",
              {
                className: "team-dialog-body",
                onSubmit: (event) => saveMessageEdit(event),
              },
              errorBox(error),
              field(
                "Текст сообщения",
                h("textarea", {
                  value: messageEditor.text,
                  rows: 7,
                  maxLength: 12000,
                  disabled: Boolean(busy),
                  onChange: (event) => {
                    const text = event.target.value;
                    setMessageEditor((value) => ({
                      ...value,
                      text,
                      operationId:
                        text === value.text ? value.operationId : uid(),
                    }));
                  },
                }),
              ),
              messageEditor.message.attachments?.length > 0 &&
                h(
                  "p",
                  { className: "team-muted" },
                  `Вложения сохранятся: ${messageEditor.message.attachments.length}.`,
                ),
              messageEditor.conflict &&
                h(
                  "div",
                  { className: "team-conflict" },
                  h(
                    "h3",
                    null,
                    messageEditor.conflict.deletedAt
                      ? "Сообщение удалено"
                      : "Сообщение изменилось",
                  ),
                  messageEditor.conflict.deletedAt
                    ? h(
                        "p",
                        null,
                        "Удалённое сообщение нельзя изменить. Ваш черновик остаётся в поле выше для копирования.",
                      )
                    : messageEditor.conflict.unavailable
                      ? h(
                          React.Fragment,
                          null,
                          h(
                            "p",
                            null,
                            "Актуальный текст пока недоступен. Ваш черновик сохранён.",
                          ),
                          button(
                            "Загрузить актуальное сообщение",
                            () => {
                              const id = messageEditor.message.id;
                              mutate(
                                "message-current",
                                () =>
                                  api(
                                    scoped(
                                      `/team/messages/${encodeURIComponent(id)}`,
                                    ),
                                  ),
                                (result) => {
                                  const latest = result.message || result;
                                  applyMessageUpdates([latest]);
                                  setMessageEditor((value) =>
                                    value?.message.id === id
                                      ? { ...value, conflict: latest }
                                      : value,
                                  );
                                },
                              );
                            },
                            { disabled: Boolean(busy) },
                          ),
                        )
                      : h(
                          React.Fragment,
                          null,
                          h(
                            "p",
                            { className: "team-muted" },
                            "Актуальная версия:",
                          ),
                          richMessage(
                            messageEditor.conflict.text ||
                              "Сообщение с вложением",
                            actor?.id,
                          ),
                          h(
                            "div",
                            { className: "team-actions" },
                            button(
                              "Принять актуальный текст",
                              () =>
                                setMessageEditor((value) => ({
                                  ...value,
                                  message: value.conflict,
                                  text: value.conflict.text || "",
                                  originalText: value.conflict.text || "",
                                  version: value.conflict.version,
                                  operationId: uid(),
                                  conflict: null,
                                })),
                              { disabled: Boolean(busy) },
                            ),
                            button(
                              "Сохранить мой вариант",
                              () =>
                                saveMessageEdit(null, messageEditor.conflict),
                              {
                                disabled:
                                  Boolean(busy) ||
                                  messageEditor.conflict.canEdit === false,
                              },
                            ),
                          ),
                        ),
                ),
              h(
                "div",
                { className: "team-actions" },
                h(
                  "button",
                  {
                    type: "submit",
                    className: "button team-primary",
                    disabled: Boolean(busy) || Boolean(messageEditor.conflict),
                  },
                  busy.startsWith("message-edit:")
                    ? "Сохраняем…"
                    : "Сохранить сообщение",
                ),
                button("Отменить", closeMessageEditor, {
                  disabled: Boolean(busy),
                }),
              ),
            ),
          ),
        messageToDelete &&
          h(
            Dialog,
            {
              title: "Удалить сообщение?",
              className: "team-message-action-dialog",
              busy: Boolean(busy),
              onClose: () => setMessageToDelete(null),
            },
            h(
              "div",
              { className: "team-dialog-body" },
              errorBox(error),
              h(
                "p",
                null,
                "Текст, вложения и реакции будут удалены. Ответы останутся в своих ветках.",
              ),
              h(
                "div",
                { className: "team-delete-preview" },
                h(
                  "strong",
                  null,
                  messageToDelete.message.authorName ||
                    nameOf(messageToDelete.message.authorId),
                ),
                messageToDelete.message.deletedAt
                  ? h("p", null, "Сообщение уже удалено.")
                  : richMessage(
                      messageLabel(messageToDelete.message),
                      actor?.id,
                    ),
              ),
              h(
                "div",
                { className: "team-actions" },
                button("Удалить сообщение", deleteMessage, {
                  className: "button team-danger-button",
                  disabled:
                    Boolean(busy) || Boolean(messageToDelete.message.deletedAt),
                }),
                button("Отменить", () => setMessageToDelete(null), {
                  disabled: Boolean(busy),
                }),
              ),
            ),
          ),
        moderationDialog &&
          h(
            Dialog,
            {
              title: "Антиконфликтный режим",
              className: "team-message-action-dialog",
              busy: Boolean(busy),
              onClose: () => setModerationDialog(null),
            },
            h(
              "div",
              { className: "team-dialog-body" },
              errorBox(error),
              h(
                "p",
                null,
                "В этом чате и его ветках каждый сотрудник сможет отправлять одно сообщение в 5 минут. Для администратора ограничение не действует.",
              ),
              h(
                "p",
                { className: "team-muted" },
                moderationDialog.enabled
                  ? "Режим включится на 1 час и выключится автоматически. Его можно отключить раньше."
                  : `Режим действует до ${dateLabel(moderationDialog.enabledUntil)}. Можно отключить его сейчас.`,
              ),
              button(
                moderationDialog.enabled
                  ? "Включить на 1 час"
                  : "Отключить досрочно",
                saveModeration,
                { className: "button team-primary", disabled: Boolean(busy) },
              ),
            ),
          ),
      );
    }
    function composer(parentId = null) {
      if (!maySend) return null;
      const key = `${conversationId}:${parentId || "root"}`,
        draft = drafts[key] || { text: "" },
        targetScope = scopeId,
        account = accountRef.current,
        version = generation.current,
        targetConversation = conversationId;
      const validTarget = () =>
        current(targetScope, account) &&
        generation.current === version &&
        selectedRef.current === targetConversation &&
        (!parentId || threadRef.current === parentId);
      return h(Composer, {
        key: `${account}:${scopeId}:${key}`,
        draft,
        parentId,
        people:
          conversation.kind === "direct" ||
          conversation.visibility === "private"
            ? people.filter((person) =>
                conversation.memberIds?.includes(person.id),
              )
            : companyPeople(conversation.responsibilityScopeId),
        busy: Boolean(busy),
        sending: busy === `message:${key}`,
        sendBlocked: remainingSeconds > 0,
        sendRestriction:
          remainingSeconds > 0
            ? `Антиконфликтный режим: следующее сообщение через ${remainingSeconds} сек.`
            : modeActive && !canManage
              ? "Антиконфликтный режим: одно сообщение в 5 минут."
              : "",
        validTarget,
        onText: (text) => {
          if (!validTarget() || busyRef.current) return;
          setDrafts((values) =>
            values[key]?.text === text
              ? values
              : { ...values, [key]: { ...values[key], id: uid(), text } },
          );
        },
        onFiles: (files, options) => {
          return validTarget() && addAttachments(files, key, options);
        },
        onRemove: (id) => {
          if (!validTarget() || busyRef.current) return;
          setDrafts((values) => ({
            ...values,
            [key]: {
              ...values[key],
              id: uid(),
              attachments: values[key].attachments.filter(
                (file) => file.id !== id,
              ),
              error: "",
            },
          }));
        },
        onSubmit: (event) => sendMessage(event, parentId),
      });
    }
    async function sendMessage(event, parentId) {
      event.preventDefault();
      const key = `${conversationId}:${parentId || "root"}`,
        draft = drafts[key];
      const attachments = draft?.attachments || [];
      if (
        (!draft?.text.trim() && !attachments.length) ||
        !maySend ||
        remainingSeconds > 0 ||
        attachments.some((file) => file.preparing || file.error) ||
        attachments.reduce((sum, file) => sum + file.byteSize, 0) >
          MAX_ATTACHMENT_BYTES
      )
        return;
      const target = conversationId,
        text = draft.text.trim(),
        account = accountRef.current,
        targetScope = scopeId,
        workspaceVersion = generation.current;
      await mutate(
        `message:${key}`,
        async () => {
          try {
            return await api("/team/messages", {
              method: "POST",
              body: JSON.stringify({
                id: draft.id,
                responsibilityScopeId: scopeId,
                conversationId: target,
                parentId,
                text,
                mentions: mentionsFromText(text),
                attachments: attachments.map(
                  ({ id, filename, mimeType, contentBase64, kind }) => ({
                    id,
                    filename,
                    mimeType,
                    contentBase64,
                    ...(kind && kind !== "file" ? { kind } : {}),
                  }),
                ),
              }),
            });
          } catch (reason) {
            if (
              reason?.status === 429 &&
              current(targetScope, account) &&
              generation.current === workspaceVersion
            ) {
              const seconds = Math.max(
                1,
                Number(
                  /через\s+(\d+)\s+сек/i.exec(reason.message || "")?.[1],
                ) || 300,
              );
              setClockNow(Date.now());
              setRateLimit({
                conversationId: target,
                until: Date.now() + seconds * 1000,
              });
              try {
                const result = await api(
                  scoped(`/team/conversations/${encodeURIComponent(target)}`),
                );
                if (
                  current(targetScope, account) &&
                  generation.current === workspaceVersion &&
                  result.conversation
                )
                  setConversations((items) =>
                    items.map((item) =>
                      item.id === target ? result.conversation : item,
                    ),
                  );
              } catch {}
              throw new Error(
                `Следующее сообщение можно отправить через ${seconds} сек. Черновик сохранён.`,
              );
            }
            throw reason;
          }
        },
        (result) => {
          const message = result.message || result;
          setClockNow(Date.now());
          if (target === selectedRef.current)
            setMessages((values) => mergeMessages(values, [message]));
          setDrafts((values) =>
            values[key]?.id === draft.id
              ? { ...values, [key]: { text: "", attachments: [] } }
              : values,
          );
          listGeneration.current++;
          setConversations((values) =>
            values.map((item) =>
              item.id === target
                ? { ...item, updatedAt: message.createdAt }
                : item,
            ),
          );
        },
      );
    }
    function deliveryIndicator(message) {
      if (
        message.authorId !== actor?.id ||
        message.deletedAt ||
        !message.delivery
      )
        return null;
      const { status, readCount, recipientCount } = message.delivery;
      const read = status === "read";
      const label =
        recipientCount == null
          ? read
            ? `Прочитали: ${readCount}`
            : "Отправлено · пока никто не прочитал"
          : read
            ? "Прочитано"
            : "Отправлено";
      return h(
        "span",
        {
          className: `team-message-delivery${read ? " is-read" : ""}`,
          "data-status": status,
          title: label,
          "aria-label": label,
          role: "img",
          tabIndex: 0,
        },
        h(
          "svg",
          {
            width: 19,
            height: 14,
            viewBox: "0 0 22 16",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.6,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": true,
          },
          h("path", { d: "M2 8l4 4L16 2" }),
          read &&
            h("path", { d: "M11 11l1 1L22 2", transform: "translate(-1 0)" }),
        ),
        h(
          "span",
          { className: "team-delivery-tooltip", "aria-hidden": true },
          label,
        ),
      );
    }
    function messageCard(message, isParent = false) {
      const count = messages.filter(
        (item) => item.parentId === message.id,
      ).length;
      return h(
        "article",
        {
          key: message.id,
          className: `team-message${isParent ? " is-parent" : ""}${message.isUnread ? " is-unread" : ""}${message.isUnreadMention ? " is-unread-mention" : ""}`,
          "data-message-id": message.id,
          "data-message-version": message.version || 1,
          "data-conversation-id": message.conversationId,
          "data-unread":
            !message.deletedAt &&
            (message.isUnread ||
              message.isUnreadMention ||
              message.requiresReadReceipt)
              ? "true"
              : "false",
        },
        ProfileAvatar
          ? h(ProfileAvatar, {
              token,
              scopeId,
              userId: message.authorId,
              avatarVersion: profileDirectory[message.authorId],
              name: message.authorName || nameOf(message.authorId),
              onClick: () =>
                setProfileCard({
                  id: message.authorId,
                  name: message.authorName || nameOf(message.authorId),
                }),
            })
          : h(
              "div",
              { className: "team-avatar", "aria-hidden": true },
              (message.authorName || nameOf(message.authorId))
                .slice(0, 1)
                .toUpperCase(),
            ),
        h(
          "div",
          { className: "team-message-content" },
          h(
            "header",
            null,
            h(
              "strong",
              null,
              button(
                message.authorName || nameOf(message.authorId),
                () =>
                  setProfileCard({
                    id: message.authorId,
                    name: message.authorName || nameOf(message.authorId),
                  }),
                { className: "team-author-profile" },
              ),
              crown(message.authorId),
            ),
            h(
              "time",
              { dateTime: message.createdAt },
              dateLabel(message.createdAt),
            ),
            !message.deletedAt &&
              message.editedAt &&
              h(
                "small",
                {
                  className: "team-message-edited",
                  title: dateLabel(message.editedAt),
                },
                message.editedBy && message.editedBy !== message.authorId
                  ? "изменено администратором"
                  : "изменено",
              ),
            !message.deletedAt &&
              (message.mentions?.all ||
                message.mentions?.userIds?.includes(actor?.id)) &&
              message.authorId !== actor?.id &&
              h("span", { className: "team-mentioned-badge" }, "Вас упомянули"),
            h(ActionMenu, {
              key: message.id,
              resetKey: message.version || 1,
              label: "Действия сообщения",
              disabled: Boolean(busy),
              items: [
                !isParent && {
                  label: count ? `Открыть ветку · ${count}` : "Открыть ветку",
                  ariaLabel: `Открыть ветку: ${messageLabel(message).slice(0, 60)}`,
                  icon: "reply",
                  onClick: () => setThreadId(message.id),
                },
                mayEditMessage(message) && {
                  label: "Редактировать",
                  ariaLabel: "Редактировать сообщение",
                  icon: "edit",
                  onClick: () => openMessageEditor(message),
                },
                mayDeleteMessage(message) && {
                  label: "Удалить",
                  ariaLabel: "Удалить сообщение",
                  icon: "trash",
                  danger: true,
                  onClick: () => confirmMessageDeletion(message),
                },
              ],
            }),
          ),
          message.deletedAt
            ? h(
                "p",
                { className: "team-message-tombstone" },
                message.deletedBy && message.deletedBy !== message.authorId
                  ? "Сообщение удалено администратором"
                  : "Сообщение удалено",
              )
            : message.text && richMessage(message.text, actor?.id),
          !message.deletedAt &&
            message.taskId &&
            TeamTasks &&
            button(
              "☑ Открыть задачу",
              () => {
                setSource(null);
                if (chooseTab("tasks"))
                  setTaskOpen({ id: message.taskId, request: uid() });
              },
              { className: "button team-task-reference" },
            ),
          !message.deletedAt &&
            message.attachments?.length > 0 &&
            h(
              "ul",
              {
                className: "team-message-files",
                "aria-label": "Файлы сообщения",
              },
              ...message.attachments.map((file) =>
                h(
                  "li",
                  { key: file.id },
                  file.kind &&
                    file.kind !== "file" &&
                    loadFile &&
                    h(MediaAttachment, {
                      key: `${actor?.id}:${scopeId}:${file.id}`,
                      file,
                      load: async () => {
                        const targetScope = scopeId,
                          account = accountRef.current,
                          workspaceVersion = generation.current;
                        if (
                          revokedConversations.current.has(
                            message.conversationId,
                          )
                        )
                          throw new Error("Переписка больше недоступна.");
                        const blob = await loadFile(
                          tokenRef.current,
                          scoped(
                            `/team/attachments/${encodeURIComponent(file.id)}`,
                          ),
                        );
                        if (
                          !current(targetScope, account) ||
                          generation.current !== workspaceVersion ||
                          revokedConversations.current.has(
                            message.conversationId,
                          )
                        )
                          throw new Error("Переписка больше недоступна.");
                        return blob;
                      },
                      onError: (reason) => setError(fail(reason)),
                    }),
                  button(
                    h(
                      React.Fragment,
                      null,
                      h("span", null, `Скачать ${file.filename}`),
                      h("small", null, fileSize(file.byteSize)),
                    ),
                    () =>
                      mutate(`attachment:${file.id}`, () =>
                        download(
                          tokenRef.current,
                          scoped(
                            `/team/attachments/${encodeURIComponent(file.id)}`,
                          ),
                          file.filename,
                        ),
                      ),
                    {
                      className: "team-file-download",
                      "aria-label": `Скачать ${file.filename}`,
                      disabled: Boolean(busy),
                      "aria-busy": busy === `attachment:${file.id}`,
                    },
                  ),
                ),
              ),
            ),
          !message.deletedAt &&
            h(MessageReactions, {
              reactions: message.reactions || [],
              actorId: actor?.id,
              disabled: Boolean(busy) || archivedMessage(message),
              onToggle: (emoji, present) =>
                toggleReaction(message, emoji, present),
            }),
          !isParent &&
            count > 0 &&
            h(
              "div",
              { className: "team-message-actions" },
              button(`Ответы: ${count}`, () => setThreadId(message.id), {
                className: "team-text-button",
                "aria-label": `Открыть ветку: ${messageLabel(message).slice(0, 60)}`,
              }),
            ),
          deliveryIndicator(message),
        ),
      );
    }
    async function openMention(item) {
      await mutate(
        "mention",
        () =>
          api(scoped(`/team/messages/${encodeURIComponent(item.messageId)}`)),
        (result) => {
          if (
            revokedConversations.current.has(
              result.conversation?.id || result.message?.conversationId,
            )
          )
            return;
          setSource({ ...result, origin: "mention" });
        },
      );
    }
    async function loadMoreMentions() {
      if (!mentionInbox.hasMore || !mentionInbox.nextBefore) return;
      await mutate(
        "mentions",
        () =>
          api(
            `${scoped("/team/mentions")}&before=${encodeURIComponent(mentionInbox.nextBefore)}`,
          ),
        (result) => {
          mentionGeneration.current++;
          setMentionInbox((previous) =>
            visibleMentionInbox({
              ...result,
              mentions: [
                ...new Map(
                  [...previous.mentions, ...result.mentions].map((item) => [
                    item.messageId,
                    item,
                  ]),
                ).values(),
              ],
            }),
          );
        },
      );
    }
    function mentionsView() {
      const snippet = (text) =>
        String(text || "")
          .replace(/@\[([^\]\n]+)\]\(user:[0-9a-f-]+\)/gi, "@$1")
          .replace(/@all\b/g, "@все");
      return h(
        "section",
        { className: "team-mentions-inbox", "aria-label": "Ваши упоминания" },
        h(
          "div",
          { className: "team-section-heading" },
          h(
            "div",
            null,
            h("h2", null, "Упоминания"),
            h(
              "p",
              { className: "team-muted" },
              "Сообщения, адресованные вам или всем участникам переписки.",
            ),
          ),
          button(
            "Обновить упоминания",
            () =>
              mutate(
                "mentions",
                () => api(scoped("/team/mentions")),
                (result) => {
                  mentionGeneration.current++;
                  setMentionInbox(visibleMentionInbox(result));
                },
              ),
            { disabled: Boolean(busy) },
          ),
        ),
        !mentionInbox.mentions.length
          ? empty(
              "Упоминаний пока нет",
              "Когда коллега отметит вас через @, сообщение появится здесь.",
            )
          : h(
              "ul",
              { className: "team-mentions-list" },
              ...mentionInbox.mentions.map((item) =>
                h(
                  "li",
                  { key: item.messageId },
                  button(
                    h(
                      React.Fragment,
                      null,
                      h(
                        "span",
                        { className: "team-mention-line" },
                        h(
                          "strong",
                          null,
                          item.authorName || nameOf(item.authorId),
                        ),
                        h(
                          "time",
                          { dateTime: item.createdAt },
                          dateLabel(item.createdAt),
                        ),
                        !item.readAt &&
                          h(
                            "span",
                            { className: "team-mention-unread" },
                            "Новое",
                          ),
                      ),
                      h(
                        "span",
                        { className: "team-mention-snippet" },
                        snippet(item.text).slice(0, 300),
                      ),
                    ),
                    () => openMention(item),
                    {
                      className: "team-mention-entry",
                      disabled: Boolean(busy),
                      "aria-label": `Открыть упоминание: ${snippet(item.text).slice(0, 80)}`,
                    },
                  ),
                ),
              ),
            ),
        mentionInbox.hasMore &&
          button("Загрузить ранние упоминания", loadMoreMentions, {
            disabled: Boolean(busy),
          }),
      );
    }
    function chatView() {
      const roots = messages.filter((item) => !item.parentId),
        orphans = messages.filter(
          (item) =>
            item.parentId &&
            !messages.some((parent) => parent.id === item.parentId),
        );
      const archivedCount = conversations.filter(
        (item) => item.kind === "channel" && item.archivedAt,
      ).length;
      const ancestors = [];
      let cursor = thread;
      while (cursor?.parentId && ancestors.length < 40) {
        cursor = messages.find((item) => item.id === cursor.parentId);
        if (cursor && !ancestors.some((item) => item.id === cursor.id))
          ancestors.unshift(cursor);
        else break;
      }
      return h(
        "div",
        { className: `team-chat-layout${threadId ? " has-thread" : ""}` },
        h(
          "aside",
          {
            className: "team-chat-sidebar",
            "aria-label": "Каналы и личные чаты",
          },
          field(
            "Поиск чатов",
            h("input", {
              type: "search",
              value: query,
              placeholder: "Найти чат…",
              onChange: (event) => setQuery(event.target.value),
            }),
          ),
          canManage &&
            h(
              "p",
              {
                className: "team-reorder-hint",
                id: "team-channel-reorder-hint",
              },
              "Перетащите канал мышью или удерживайте его на телефоне.",
            ),
          h(
            "span",
            {
              className: "team-reorder-status",
              role: "status",
              "aria-live": "polite",
            },
            channelDrag.drag
              ? `Перемещение канала «${channelDrag.drag.title}». Отпустите на нужном месте. Escape — отмена.`
              : "",
          ),
          ...[
            ["channel", "Каналы", "Создать канал"],
            ["direct", "Личные чаты", "Новый личный чат"],
            ...(archivedCount ? [["archived", "Архив каналов", null]] : []),
          ].map(([kind, label, action]) =>
            h(
              "section",
              { key: kind, "aria-label": label },
              h(
                "header",
                null,
                h(
                  "h2",
                  null,
                  kind === "archived"
                    ? button(
                        h(
                          React.Fragment,
                          null,
                          h(
                            "span",
                            { "aria-hidden": true },
                            archiveExpanded ? "⌄" : "›",
                          ),
                          label,
                          h(
                            "span",
                            {
                              className: "team-archive-count",
                              "aria-hidden": true,
                            },
                            archivedCount,
                          ),
                        ),
                        () => setArchiveExpanded((value) => !value),
                        {
                          className: "team-archive-toggle",
                          "aria-label": label,
                          "aria-expanded": archiveExpanded,
                        },
                      )
                    : label,
                ),
                action &&
                  button("+", () => newConversation(kind), {
                    className: "team-icon-button",
                    "aria-label": action,
                    title: action,
                    disabled: Boolean(busy),
                  }),
              ),
              conversations
                .filter(
                  (item) =>
                    (kind === "archived"
                      ? item.kind === "channel" &&
                        item.archivedAt &&
                        archiveExpanded
                      : item.kind === kind && !item.archivedAt) &&
                    normal(conversationTitle(item)).includes(normal(query)),
                )
                .sort((a, b) => (kind === "direct" ? 0 : channelOrder(a, b)))
                .map((item) => {
                  const title = conversationTitle(item),
                    draggable =
                      kind === "channel" && canManageChannel(item) && !busy,
                    dragging = channelDrag.drag?.id === item.id,
                    dropPosition =
                      channelDrag.drag?.targetId === item.id
                        ? channelDrag.drag.placement
                        : null,
                    hasUnread = !item.archivedAt && item.unreadCount > 0,
                    hasMentions =
                      !item.archivedAt && item.unreadMentionCount > 0,
                    muted = Boolean(
                      item.effectiveNotificationPreferences?.muteNotifications,
                    ),
                    description = [
                      title,
                      item.kind === "channel" &&
                        item.visibility === "private" &&
                        "Закрытый канал",
                      item.kind === "direct" &&
                        !item.memberIds?.includes(actor?.id) &&
                        "Просмотр администратором",
                      hasUnread && `Непрочитанных: ${item.unreadCount}`,
                      hasMentions &&
                        `Непрочитанных упоминаний: ${item.unreadMentionCount}`,
                      muted && "Уведомления выключены",
                      item.archivedAt && "В архиве",
                    ]
                      .filter(Boolean)
                      .join(". ");
                  return h(
                    "button",
                    {
                      type: "button",
                      key: item.id,
                      className: `team-chat-item${item.id === conversationId ? " is-selected" : ""}${hasUnread || hasMentions ? " has-unread" : ""}${hasMentions ? " has-mentions" : ""}${muted ? " is-muted" : ""}${item.archivedAt ? " is-archived" : ""}${draggable ? " is-draggable" : ""}${dragging ? " is-dragging" : ""}${dropPosition ? ` drop-${dropPosition}` : ""}`,
                      "data-reorder-channel": draggable ? item.id : undefined,
                      "aria-describedby": draggable
                        ? "team-channel-reorder-hint"
                        : undefined,
                      onClickCapture: channelDrag.suppressClick,
                      onDragStart: (event) => event.preventDefault(),
                      onContextMenu: draggable
                        ? (event) => event.preventDefault()
                        : undefined,
                      onClick: () => chooseConversation(item.id),
                      "aria-pressed": item.id === conversationId,
                      "aria-label": description,
                      title: description,
                    },
                    draggable &&
                      h(
                        "span",
                        { className: "team-channel-grip", "aria-hidden": true },
                        "⠿",
                      ),
                    h(
                      "span",
                      { className: "team-chat-symbol", "aria-hidden": true },
                      item.kind === "channel"
                        ? item.visibility === "private"
                          ? "🔒"
                          : "#"
                        : "↗",
                    ),
                    h(
                      "span",
                      { className: "team-chat-label" },
                      h(
                        "strong",
                        null,
                        title,
                        ...(item.kind === "direct"
                          ? (item.memberIds || [])
                              .filter((id) => id !== actor.id)
                              .map(crown)
                          : []),
                      ),
                      item.kind === "channel" &&
                        item.visibility === "private" &&
                        h("small", null, "Закрытый канал"),
                      item.kind === "direct" &&
                        !item.memberIds?.includes(actor?.id) &&
                        h("small", null, "Просмотр администратором"),
                    ),
                    (hasUnread || hasMentions) &&
                      h(
                        "span",
                        { className: "team-unread-badges" },
                        hasUnread &&
                          h(
                            "span",
                            {
                              className: "team-unread-count",
                              "aria-label": `Непрочитанных: ${item.unreadCount}`,
                            },
                            item.unreadCount > 99 ? "99+" : item.unreadCount,
                          ),
                        hasMentions &&
                          h(
                            "span",
                            {
                              className: "team-unread-mentions",
                              "aria-label": `Непрочитанных упоминаний: ${item.unreadMentionCount}`,
                            },
                            `@${item.unreadMentionCount > 99 ? "99+" : item.unreadMentionCount}`,
                          ),
                      ),
                  );
                }),
              kind !== "archived" &&
                !conversations.some(
                  (item) => item.kind === kind && !item.archivedAt,
                ) &&
                h(
                  "p",
                  { className: "team-sidebar-empty" },
                  kind === "channel"
                    ? "Обсуждения команды по темам"
                    : "Диалоги с коллегами",
                ),
            ),
          ),
          canManage &&
            h(
              "div",
              { className: "team-admin-note" },
              h("strong", null, "Режим администратора"),
              h("p", null, "Вам доступны все чаты выбранной области."),
            ),
        ),
        h(
          "section",
          { className: "team-conversation", "aria-label": "Переписка" },
          conversation
            ? h(
                React.Fragment,
                null,
                h(
                  "header",
                  { className: "team-pane-heading" },
                  h(
                    "div",
                    null,
                    h(
                      "p",
                      { className: "team-eyebrow" },
                      conversation.kind === "channel"
                        ? "Канал команды"
                        : maySend
                          ? "Корпоративный личный чат"
                          : "Просмотр администратором",
                    ),
                    h(
                      "h2",
                      null,
                      `${conversation.kind === "channel" ? "# " : ""}${conversationTitle(conversation)}`,
                    ),
                    conversation.kind === "channel" &&
                      conversation.visibility === "private" &&
                      h(
                        "span",
                        { className: "team-private-badge" },
                        "🔒 Закрытый канал",
                      ),
                  ),
                  h(
                    "div",
                    { className: "team-conversation-tools" },
                    h(ActionMenu, {
                      key: conversationId,
                      label: "Действия чата",
                      disabled: Boolean(busy),
                      items: [
                        {
                          label: "Уведомления",
                          ariaLabel: "Настройки уведомлений чата",
                          icon: "bell",
                          onClick: () =>
                            setNotificationDialog({
                              conversationId,
                              ...(conversation.notificationPreferences || {
                                muteNotifications: false,
                                muteSound: false,
                              }),
                            }),
                        },
                        conversation.kind === "channel" &&
                          canManage &&
                          conversation.canManageAccess && {
                            label: "Доступ к чату",
                            icon: "users",
                            onClick: openAccessDialog,
                          },
                        !conversation.archivedAt &&
                          (moderation?.canManage ?? canManage) && {
                            label: modeActive
                              ? "Режим включён"
                              : "Антиконфликтный режим",
                            ariaLabel: "Антиконфликтный режим",
                            icon: "clock",
                            active: modeActive,
                            onClick: () => {
                              setError("");
                              setModerationDialog({
                                conversationId,
                                operationId: uid(),
                                enabled: !modeActive,
                                enabledUntil: moderation?.enabledUntil,
                              });
                            },
                          },
                        canManageChannel(conversation) &&
                          !conversation.archivedAt && {
                            label: "Переместить выше",
                            icon: "up",
                            disabled: !channelNeighbors(conversation).up,
                            onClick: () => moveChannel(conversation, "up"),
                          },
                        canManageChannel(conversation) &&
                          !conversation.archivedAt && {
                            label: "Переместить ниже",
                            icon: "down",
                            disabled: !channelNeighbors(conversation).down,
                            onClick: () => moveChannel(conversation, "down"),
                          },
                        canManageChannel(conversation) &&
                          (conversation.archivedAt
                            ? {
                                label: "Вернуть из архива",
                                icon: "restore",
                                onClick: () =>
                                  changeChannel({
                                    conversation,
                                    action: "restore",
                                    operationId: uid(),
                                  }),
                              }
                            : {
                                label: "Архивировать канал",
                                icon: "archive",
                                onClick: () =>
                                  confirmChannelAction(conversation, "archive"),
                              }),
                        canManageChannel(conversation) && {
                          label: "Удалить канал",
                          icon: "trash",
                          danger: true,
                          onClick: () =>
                            confirmChannelAction(conversation, "delete"),
                        },
                      ],
                    }),
                  ),
                ),
                conversation.archivedAt &&
                  h(
                    "p",
                    {
                      className: "team-archive-banner",
                      role: "status",
                    },
                    "Канал в архиве. Переписка доступна для чтения.",
                  ),
                !conversation.archivedAt &&
                  modeActive &&
                  h(
                    "p",
                    { className: "team-moderation-banner", role: "status" },
                    `Антиконфликтный режим до ${dateLabel(moderation.enabledUntil)} · одно сообщение в 5 минут${canManage ? " · вы администратор, без ограничения" : ""}`,
                  ),
                h(
                  "div",
                  {
                    className: "team-message-list",
                    "aria-busy": detailLoading,
                  },
                  pagination.hasMore &&
                    button(
                      busy === "earlier"
                        ? "Загрузка…"
                        : "Загрузить предыдущие сообщения",
                      loadEarlier,
                      { disabled: Boolean(busy) },
                    ),
                  detailLoading
                    ? h(
                        "p",
                        { className: "team-muted" },
                        "Загружаем сообщения…",
                      )
                    : roots.length || orphans.length
                      ? h(
                          React.Fragment,
                          null,
                          ...roots.map((item) => messageCard(item)),
                          orphans.length > 0 &&
                            h(
                              "div",
                              { className: "team-older-branches" },
                              h(
                                "p",
                                { className: "team-muted" },
                                "Ответы на более ранние сообщения. Загрузите предыдущие сообщения, чтобы увидеть начало.",
                              ),
                              ...orphans.map((item) => messageCard(item)),
                            ),
                        )
                      : empty(
                          "Начните обсуждение",
                          "Сообщения остаются в чате. Для отдельной темы откройте ветку у любого сообщения.",
                        ),
                ),
                maySend
                  ? composer()
                  : !conversation.archivedAt &&
                      h(
                        "p",
                        { className: "team-readonly" },
                        "Этот чат доступен вам для просмотра. Писать могут только участники.",
                      ),
              )
            : empty(
                "Место для общения команды",
                "Создайте канал для общей темы или начните личный чат с коллегой.",
                button("Создать канал", () => newConversation("channel"), {
                  className: "button team-primary",
                }),
              ),
        ),
        threadId &&
          h(
            "aside",
            { className: "team-thread", "aria-label": "Ветка обсуждения" },
            h(
              "header",
              { className: "team-pane-heading" },
              h(
                "div",
                null,
                h("p", { className: "team-eyebrow" }, "Ветка обсуждения"),
                h("h2", null, "Ответы и продолжения"),
              ),
              button("Закрыть", () => setThreadId(null), {
                "aria-label": "Закрыть ветку",
              }),
            ),
            ancestors.length > 0 &&
              h(
                "nav",
                {
                  className: "team-breadcrumbs",
                  "aria-label": "Родительские ветки",
                },
                ...ancestors.map((item, index) =>
                  button(
                    `${index + 1}. ${messageLabel(item).slice(0, 35)}${messageLabel(item).length > 35 ? "…" : ""}`,
                    () => setThreadId(item.id),
                    { key: item.id, className: "team-text-button" },
                  ),
                ),
              ),
            h(
              "div",
              { className: "team-thread-messages" },
              thread
                ? messageCard(thread, true)
                : h(
                    "p",
                    { className: "team-muted" },
                    "Начало ветки пока не загружено.",
                  ),
              ...messages
                .filter((item) => item.parentId === threadId)
                .map((item) => messageCard(item)),
              !messages.some((item) => item.parentId === threadId) &&
                h(
                  "p",
                  { className: "team-thread-empty" },
                  "Пока нет ответов. Здесь можно продолжить тему, а затем создать новую ветку у любого ответа.",
                ),
            ),
            thread && composer(threadId),
          ),
      );
    }

    async function openKnowledgePermissions(targetScope = scopeId) {
      if (!knowledgeAccess.canManage || busyRef.current) return;
      if (typeof targetScope !== "string") targetScope = scopeId;
      setPermissionPanel({ rows: [], loaded: false, scopeId: targetScope });
      await mutate(
        "knowledge-permissions",
        () =>
          api(
            `/team/knowledge-permissions?responsibilityScopeId=${encodeURIComponent(targetScope)}`,
          ),
        (result) =>
          setPermissionPanel({
            rows: result.permissions || [],
            loaded: true,
            scopeId: targetScope,
          }),
      );
    }
    async function saveKnowledgePermission(person, field, checked) {
      if (!knowledgeAccess.canManage || busyRef.current) return;
      await mutate(
        `knowledge-permission:${person.userId}`,
        () =>
          api("/team/knowledge-permissions", {
            method: "PUT",
            body: JSON.stringify({
              responsibilityScopeId: permissionPanel.scopeId,
              userId: person.userId,
              canCreate: field === "canCreate" ? checked : person.canCreate,
              canEdit: field === "canEdit" ? checked : person.canEdit,
            }),
          }),
        (result) => {
          const saved = result.permission || result;
          setPermissionPanel(
            (panel) =>
              panel && {
                ...panel,
                rows: panel.rows.map((row) =>
                  row.userId === saved.userId ? saved : row,
                ),
              },
          );
          setNotice("Права на инструкции обновлены.");
        },
      );
    }
    function knowledgePermissionsDialog() {
      return (
        permissionPanel &&
        h(
          Dialog,
          {
            title: "Права на инструкции",
            busy: Boolean(busy),
            onClose: () => setPermissionPanel(null),
          },
          h(
            "div",
            { className: "team-dialog-body team-permissions-body" },
            workScopes.length > 1 &&
              field(
                "Проект",
                h(
                  "select",
                  {
                    value: permissionPanel.scopeId,
                    disabled: Boolean(busy),
                    onChange: (event) =>
                      openKnowledgePermissions(event.target.value),
                  },
                  ...workScopes.map((scope) =>
                    h(
                      "option",
                      {
                        key: scope.responsibilityScopeId,
                        value: scope.responsibilityScopeId,
                      },
                      scopeLabel(scope),
                    ),
                  ),
                ),
              ),
            h(
              "p",
              { className: "team-muted" },
              "Отдельно разрешите сотрудникам создавать и редактировать инструкции. Изменения сохраняются сразу и действуют в выбранной области.",
            ),
            errorBox(error),
            !permissionPanel.loaded
              ? busy === "knowledge-permissions"
                ? h(
                    "p",
                    { role: "status", className: "team-muted" },
                    "Загружаем права сотрудников…",
                  )
                : button("Повторить загрузку прав", openKnowledgePermissions)
              : h(
                  "div",
                  { className: "team-permissions-list" },
                  ...permissionPanel.rows.map((person) =>
                    h(
                      "fieldset",
                      {
                        key: person.userId,
                        className: "team-permission-row",
                        disabled:
                          Boolean(busy) || person.role === "access_admin",
                      },
                      h("legend", null, person.displayName),
                      h(
                        "small",
                        { className: "team-muted" },
                        person.role === "access_admin"
                          ? "Администратор · права предоставлены ролью"
                          : person.role === "driver"
                            ? "Водитель"
                            : "Сотрудник",
                      ),
                      h(
                        "div",
                        { className: "team-permission-options" },
                        ...[
                          ["canCreate", "Создание инструкций"],
                          ["canEdit", "Редактирование инструкций"],
                        ].map(([key, label]) =>
                          h(
                            "label",
                            { key },
                            h("input", {
                              type: "checkbox",
                              checked: Boolean(person[key]),
                              "aria-label": `${label}: ${person.displayName}`,
                              onChange: (event) =>
                                saveKnowledgePermission(
                                  person,
                                  key,
                                  event.target.checked,
                                ),
                            }),
                            h("span", null, label),
                          ),
                        ),
                      ),
                    ),
                  ),
                  !permissionPanel.rows.length &&
                    h(
                      "p",
                      { className: "team-muted" },
                      "В области пока нет сотрудников для настройки прав.",
                    ),
                ),
            h(
              "p",
              { className: "team-muted" },
              "Эти права не меняют видимость документов. Материалы для сотрудников по-прежнему недоступны водителям.",
            ),
          ),
        )
      );
    }
    function openArticle(item) {
      if (
        busyRef.current ||
        (articleDirty &&
          !window.confirm("Удалить несохранённые изменения статьи?"))
      )
        return;
      setArticleForm(null);
      setConflict(null);
      setArticleId(item.id);
      setArticlePositionDraft(null);
      setError("");
    }
    function editArticle(item) {
      if (
        busyRef.current ||
        (item ? !canEditArticle(item) : !knowledgeAccess.canCreate) ||
        (articleDirty &&
          !window.confirm("Удалить несохранённые изменения статьи?"))
      )
        return;
      const createScope = knowledgeAccess.permissionsByScope?.[scopeId]
        ?.canCreate
        ? scopeId
        : workScopes.find(
            (scope) =>
              knowledgeAccess.permissionsByScope?.[scope.responsibilityScopeId]
                ?.canCreate,
          )?.responsibilityScopeId || scopeId;
      const value = item || {
        id: uid(),
        title: "",
        body: "",
        reason: "",
        purpose: "",
        result: "",
        audiencePositionIds: [],
        audiencePositions: [],
        structured: true,
        authorId: actor.id,
        authorName: actor.displayName,
        createdAt: new Date().toISOString(),
        version: 0,
        responsibilityScopeId: createScope,
      };
      setArticleId(item?.id || "");
      setArticleForm({
        ...value,
        original: articleDraftValues(value),
      });
      setArticlePositionDraft(null);
      setConflict(null);
      setError("");
    }
    async function saveArticle(event, latest) {
      event?.preventDefault();
      if (!articleForm || busyRef.current) return;
      if (!articleEditable || latest?.canEdit === false) {
        setError("У вас нет доступа к редактированию этой статьи.");
        return;
      }
      if (!articleForm.title.trim() || !articleForm.body.trim()) {
        setError(
          articleStructured
            ? "Заполните тему и текст статьи."
            : "Заполните название и текст статьи.",
        );
        return;
      }
      if (
        articleStructured &&
        (!articleForm.reason?.trim() ||
          !articleForm.purpose?.trim() ||
          !articleForm.result?.trim() ||
          !articleForm.audiencePositionIds?.length)
      ) {
        setError(
          "Выберите, для кого инструкция, и заполните причину, задачу и ожидаемый результат.",
        );
        return;
      }
      if (conflict && !latest) {
        setError("Сначала сравните версии статьи.");
        return;
      }
      const data = {
        id: articleForm.id,
        responsibilityScopeId: articleForm.responsibilityScopeId || scopeId,
        title: articleForm.title.trim(),
        body: articleForm.body.trim(),
        version: latest?.version ?? articleForm.version,
        ...(articleStructured
          ? {
              reason: articleForm.reason.trim(),
              purpose: articleForm.purpose.trim(),
              result: articleForm.result.trim(),
              audiencePositionIds: articleForm.audiencePositionIds,
            }
          : {}),
      };
      const account = accountRef.current,
        version = generation.current;
      knowledgeGeneration.current++;
      await mutate(
        "article",
        async () => {
          try {
            return await api("/team/articles", {
              method: "PUT",
              body: JSON.stringify(data),
            });
          } catch (reason) {
            if (
              reason?.status === 403 &&
              current(scopeId, account) &&
              generation.current === version
            ) {
              try {
                const result = await api(scoped("/team/articles"));
                if (current(scopeId, account) && generation.current === version)
                  applyKnowledge(result);
              } catch {
                if (current(scopeId, account) && generation.current === version)
                  setKnowledgeAccess({
                    canCreate: false,
                    canEdit: false,
                    canManage: false,
                  });
              }
            }
            if (
              reason?.status === 409 &&
              current(scopeId, account) &&
              generation.current === version
            ) {
              setConflict({ pending: true });
              try {
                const result = await api(scoped("/team/articles"));
                if (
                  current(scopeId, account) &&
                  generation.current === version
                ) {
                  const latestArticle = result.articles?.find(
                    (item) => item.id === data.id,
                  );
                  applyKnowledge(result);
                  setConflict(latestArticle || { pending: true });
                }
              } catch {}
              throw new Error(
                "Статью уже изменили. Ваш черновик сохранён; сравните его с актуальной версией ниже.",
              );
            }
            throw reason;
          }
        },
        (result) => {
          const article = {
            ...(result.article || result),
            responsibilityScopeId: data.responsibilityScopeId,
          };
          knowledgeGeneration.current++;
          listGeneration.current++;
          setArticles((items) => [
            article,
            ...items.filter((item) => item.id !== article.id),
          ]);
          setArticleId(article.id);
          setArticleFolder(articleFolderPath(article) || "/");
          setArticlePage(
            Math.max(
              0,
              Math.floor(
                [article, ...articles.filter((item) => item.id !== article.id)]
                  .filter((item) =>
                    articleInFolder(item, articleFolderPath(article) || "/"),
                  )
                  .sort(compareArticles)
                  .findIndex((item) => item.id === article.id) /
                  ARTICLE_PAGE_SIZE,
              ),
            ),
          );
          setQuery("");
          setArticleForm(null);
          setConflict(null);
          setNotice("Статья сохранена.");
        },
      );
    }
    function confirmArticleDeletion(article) {
      if (!canDeleteArticle(article) || busyRef.current) return;
      setError("");
      setArticleToDelete({ article, operationId: uid(), conflict: false });
    }
    async function deleteArticle(target) {
      const { article, operationId } = target;
      if (!canDeleteArticle(article) || busyRef.current || target.conflict)
        return;
      const account = accountRef.current,
        version = generation.current;
      knowledgeGeneration.current++;
      listGeneration.current++;
      await mutate(
        "article-delete",
        async () => {
          try {
            return await api(
              `/team/articles/${encodeURIComponent(article.id)}/deletion`,
              {
                method: "PUT",
                body: JSON.stringify({
                  responsibilityScopeId: article.responsibilityScopeId,
                  operationId,
                  version: article.version,
                }),
              },
            );
          } catch (reason) {
            if (
              [403, 404, 409].includes(reason?.status) &&
              current(scopeId, account) &&
              generation.current === version
            ) {
              setArticleToDelete((value) =>
                value ? { ...value, conflict: true } : null,
              );
              try {
                const result = await api(scoped("/team/articles"));
                if (current(scopeId, account) && generation.current === version)
                  applyKnowledge(result);
              } catch {}
            }
            throw reason;
          }
        },
        (result) => {
          const deleted = new Set(result.deletedIds || [article.id]);
          knowledgeGeneration.current++;
          listGeneration.current++;
          setArticles((items) => items.filter((item) => !deleted.has(item.id)));
          setArticleId("");
          setArticleToDelete(null);
          if (
            articleFolder &&
            !articles.some(
              (item) =>
                !deleted.has(item.id) && articleInFolder(item, articleFolder),
            )
          )
            setArticleFolder("");
          setAdaptation((value) => {
            if (!value) return value;
            const remaining = value.articles.filter(
              (item) => !deleted.has(item.id),
            );
            return {
              ...value,
              articles: remaining,
              total: remaining.length,
              readCount: remaining.filter((item) => item.readAt).length,
              canComplete:
                remaining.every((item) => item.readAt) &&
                Boolean(
                  remaining.length ||
                    value.articles.length ||
                    value.canComplete,
                ),
            };
          });
          setNotice(`Инструкция «${article.title}» удалена.`);
        },
      );
    }
    function filterKnowledge(nextQuery, nextFolder = articleFolder) {
      if (
        busyRef.current ||
        (articleDirty &&
          !window.confirm("Удалить несохранённые изменения статьи?"))
      )
        return;
      setQuery(nextQuery);
      setArticleFolder(nextFolder);
      setArticlePage(0);
      setArticleId("");
      setArticleForm(null);
      setConflict(null);
      setError("");
    }
    async function saveArticlePosition() {
      const draft = articlePositionDraft,
        targetScope = articleForm?.responsibilityScopeId;
      if (!draft?.title.trim() || !targetScope || !canManage || busyRef.current)
        return;
      await mutate(
        "article-position",
        () =>
          api(`/team/organization/positions/${encodeURIComponent(draft.id)}`, {
            method: "PUT",
            body: JSON.stringify({
              responsibilityScopeId: targetScope,
              operationId: draft.operationId,
              version: 0,
              title: draft.title.trim(),
            }),
          }),
        (position) => {
          setArticlePositions((value) => ({
            ...value,
            error: "",
            items: [
              ...value.items.filter((item) => item.id !== position.id),
              position,
            ].sort((a, b) => a.title.localeCompare(b.title, "ru")),
          }));
          setArticleForm((value) =>
            value?.responsibilityScopeId === targetScope
              ? {
                  ...value,
                  audiencePositionIds: [
                    ...new Set([
                      ...(value.audiencePositionIds || []),
                      position.id,
                    ]),
                  ],
                  audiencePositions: [
                    ...(value.audiencePositions || []).filter(
                      (item) => item.id !== position.id,
                    ),
                    position,
                  ],
                }
              : value,
          );
          setArticlePositionDraft(null);
          setNotice(`Должность «${position.title}» добавлена.`);
        },
      );
    }
    function articleAutoFields(
      article,
      { editing = false, authors = true, timing = true, audience = false } = {},
    ) {
      const editor = editing
        ? article.authorId && article.authorId !== actor.id
          ? actor.displayName
          : null
        : article.updatedByName;
      const created = new Date(article.createdAt || article.updatedAt);
      const values = [
        ...(authors
          ? [
              ["Автор", article.authorName || nameOf(article.authorId)],
              ...(editor ? [["Отредактировал", editor]] : []),
            ]
          : []),
        ...(audience
          ? [
              [
                "Для кого",
                (article.audiencePositions || [])
                  .map((item) => item.title)
                  .join(", "),
              ],
            ]
          : []),
        ...(timing
          ? [
              [
                "Дата",
                Number.isNaN(created.getTime())
                  ? "—"
                  : created.toLocaleDateString("ru-RU"),
              ],
              ["Версия", article.version || 1],
            ]
          : []),
      ];
      return h(
        "dl",
        { className: "team-article-facts" },
        ...values.map(([label, value]) =>
          h(
            "div",
            { key: label },
            h("dt", null, label),
            h("dd", null, value || "—"),
          ),
        ),
      );
    }
    function articleAudienceField() {
      const selectedIds = articleForm.audiencePositionIds || [],
        positions =
          articlePositions.scopeId === articleForm.responsibilityScopeId
            ? articlePositions.items
            : [],
        unavailable =
          Boolean(busy) || !articleEditable || articlePositions.loading;
      return h(
        "div",
        { className: "team-article-audience" },
        field(
          "Для кого",
          h(
            "select",
            {
              value: "",
              required: !selectedIds.length,
              disabled: unavailable,
              onChange: (event) => {
                const position = positions.find(
                  (item) => item.id === event.target.value,
                );
                if (!position || selectedIds.includes(position.id)) return;
                setArticleForm((value) => ({
                  ...value,
                  audiencePositionIds: [
                    ...(value.audiencePositionIds || []),
                    position.id,
                  ],
                  audiencePositions: [
                    ...(value.audiencePositions || []),
                    { id: position.id, title: position.title },
                  ],
                }));
              },
            },
            h(
              "option",
              { value: "", disabled: true },
              articlePositions.loading
                ? "Загружаем должности…"
                : selectedIds.length
                  ? "Добавить ещё должность…"
                  : "Выберите должность…",
            ),
            ...positions
              .filter((item) => !selectedIds.includes(item.id))
              .map((item) =>
                h("option", { key: item.id, value: item.id }, item.title),
              ),
          ),
          "Можно выбрать несколько должностей.",
        ),
        selectedIds.length > 0 &&
          h(
            "div",
            {
              className: "team-article-audience-chips",
              "aria-label": "Выбранные должности",
            },
            ...selectedIds.map((id) => {
              const title =
                positions.find((item) => item.id === id)?.title ||
                articleForm.audiencePositions?.find((item) => item.id === id)
                  ?.title ||
                "Должность";
              return h(
                "span",
                { key: id },
                h("span", null, title),
                button(
                  "×",
                  () =>
                    setArticleForm((value) => ({
                      ...value,
                      audiencePositionIds: value.audiencePositionIds.filter(
                        (item) => item !== id,
                      ),
                      audiencePositions: (value.audiencePositions || []).filter(
                        (item) => item.id !== id,
                      ),
                    })),
                  {
                    disabled: unavailable,
                    "aria-label": `Убрать должность ${title}`,
                  },
                ),
              );
            }),
          ),
        articlePositions.error && errorBox(articlePositions.error),
        !articlePositions.loading &&
          !articlePositions.error &&
          !positions.length &&
          h(
            "p",
            { className: "team-muted" },
            canManage
              ? "В компании пока нет должностей. Добавьте первую ниже."
              : "В компании пока нет должностей. Обратитесь к администратору.",
          ),
        canManage &&
          articleEditable &&
          (articlePositionDraft
            ? h(
                "div",
                { className: "team-article-position-new" },
                field(
                  "Название должности",
                  h("input", {
                    value: articlePositionDraft.title,
                    maxLength: 120,
                    disabled: Boolean(busy),
                    onChange: (event) =>
                      setArticlePositionDraft((value) => ({
                        ...value,
                        title: event.target.value,
                      })),
                    onKeyDown: (event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveArticlePosition();
                      }
                    },
                  }),
                ),
                h(
                  "div",
                  { className: "team-actions" },
                  button("Сохранить должность", saveArticlePosition, {
                    disabled:
                      Boolean(busy) || !articlePositionDraft.title.trim(),
                  }),
                  button(
                    "Отмена добавления должности",
                    () => setArticlePositionDraft(null),
                    { disabled: Boolean(busy) },
                  ),
                ),
              )
            : button(
                "Добавить должность",
                () =>
                  setArticlePositionDraft({
                    id: uid(),
                    operationId: uid(),
                    title: "",
                  }),
                { disabled: unavailable, className: "team-text-button" },
              )),
      );
    }
    function articleTextField(label, key, placeholder) {
      return field(
        label,
        h("textarea", {
          rows: 3,
          value: articleForm[key] || "",
          maxLength: 4000,
          required: true,
          disabled: Boolean(busy),
          readOnly: !articleEditable,
          placeholder,
          onChange: (event) =>
            setArticleForm((value) => ({
              ...value,
              [key]: event.target.value,
            })),
        }),
      );
    }
    function articleContent(article) {
      if (!article.structured)
        return h("div", { className: "team-document-body" }, article.body);
      return h(
        "div",
        { className: "team-article-sections" },
        ...[
          ["Причина создания", article.reason],
          ["Задача создания", article.purpose],
          ["Текст", article.body],
          ["Результат", article.result],
        ].map(([label, value]) =>
          h(
            "section",
            { key: label },
            h("h3", null, label),
            h("div", { className: "team-document-body" }, value),
          ),
        ),
      );
    }
    function articleMetadata(
      article,
      { navigate = true, showSource = false } = {},
    ) {
      const path = articleFolderPath(article),
        parts = path ? path.split("/") : [],
        sourceFile = article.sourceFile;
      return h(
        "div",
        { className: "team-document-metadata" },
        h(
          "nav",
          {
            className: "team-document-folders",
            "aria-label": "Расположение статьи",
          },
          navigate
            ? button("Все папки", () => filterKnowledge("", ""), {
                className: "team-text-button",
                disabled: Boolean(busy),
              })
            : h("span", null, "База знаний"),
          ...(parts.length ? parts : ["Без папки"]).map((part, index) =>
            h(
              React.Fragment,
              { key: index },
              h("span", { "aria-hidden": true }, "›"),
              navigate
                ? button(
                    part,
                    () =>
                      filterKnowledge(
                        "",
                        parts.length
                          ? parts.slice(0, index + 1).join("/")
                          : "/",
                      ),
                    {
                      className: "team-text-button",
                      disabled: Boolean(busy),
                    },
                  )
                : h("span", null, part),
            ),
          ),
        ),
        article.visibility === "admin" &&
          h(
            "p",
            { className: "team-visibility-note" },
            "Доступно только администраторам области",
          ),
        article.visibility === "staff" &&
          h(
            "p",
            { className: "team-visibility-note" },
            "Сотрудникам, кроме водителей",
          ),
        showSource &&
          sourceFile &&
          h(
            "section",
            {
              className: "team-document-source",
              "aria-label": "Оригинал документа",
            },
            h(
              "div",
              null,
              h("strong", null, sourceFile.filename),
              h(
                "small",
                { className: "team-muted" },
                fileSize(sourceFile.byteSize),
              ),
            ),
            button(
              busy === `article-source:${article.id}`
                ? "Подготовка файла…"
                : "Скачать оригинал",
              () =>
                mutate(`article-source:${article.id}`, () =>
                  download(
                    tokenRef.current,
                    scoped(
                      `/team/articles/${encodeURIComponent(article.id)}/source`,
                    ),
                    sourceFile.filename,
                  ),
                ),
              {
                className: "button",
                "aria-label": `Скачать оригинал ${sourceFile.filename}`,
                disabled: Boolean(busy),
              },
            ),
            h(
              "p",
              { className: "team-muted" },
              "Ниже — текст документа для чтения и поиска. Таблицы, изображения и исходное оформление доступны в оригинале.",
            ),
          ),
      );
    }
    function knowledgeView() {
      const folders = new Map();
      let unfiled = 0;
      articles.forEach((article) => {
        const path = articleFolderPath(article);
        if (!path) unfiled++;
        else {
          const parts = path.split("/");
          parts.forEach((_, index) => {
            const parent = parts.slice(0, index + 1).join("/");
            folders.set(parent, (folders.get(parent) || 0) + 1);
          });
        }
      });
      const filtered = articles
          .filter((item) => articleInFolder(item, articleFolder))
          .filter((item) =>
            normal(
              `${item.title} ${item.body} ${item.reason || ""} ${item.purpose || ""} ${item.result || ""} ${(item.audiencePositions || []).map((position) => position.title).join(" ")} ${articleFolderPath(item)} ${item.sourceFile?.filename || ""}`,
            ).includes(normal(query)),
          )
          .sort(compareArticles),
        lastPage = Math.max(
          0,
          Math.ceil(filtered.length / ARTICLE_PAGE_SIZE) - 1,
        ),
        page = Math.min(articlePage, lastPage),
        visible = filtered.slice(
          page * ARTICLE_PAGE_SIZE,
          (page + 1) * ARTICLE_PAGE_SIZE,
        ),
        selectedArticle =
          visible.find((item) => item.id === articleId) || visible[0];
      return h(
        "div",
        { className: "team-library-layout" },
        h(
          "aside",
          { className: "team-library-sidebar team-knowledge-sidebar" },
          knowledgeAccess.canCreate &&
            button("Новая статья", () => editArticle(), {
              className: "button team-primary",
              disabled: Boolean(busy),
            }),
          knowledgeAccess.canManage &&
            button("Права на инструкции", openKnowledgePermissions, {
              disabled: Boolean(busy),
            }),
          field(
            "Папка базы знаний",
            h(
              "select",
              {
                value: articleFolder,
                disabled: Boolean(busy),
                onChange: (event) => filterKnowledge(query, event.target.value),
              },
              h("option", { value: "" }, `Все папки (${articles.length})`),
              unfiled > 0 &&
                h("option", { value: "/" }, `Без папки (${unfiled})`),
              ...[...folders.entries()]
                .sort(([a], [b]) => compareFolderPaths(a, b))
                .map(([path, count]) =>
                  h(
                    "option",
                    { key: path, value: path },
                    `${path.replaceAll("/", " › ")} (${count})`,
                  ),
                ),
            ),
            "Выбранная папка включает документы из подпапок.",
          ),
          field(
            "Поиск по базе знаний",
            h("input", {
              type: "search",
              placeholder: "Название, текст или файл…",
              value: query,
              disabled: Boolean(busy),
              onChange: (event) => filterKnowledge(event.target.value),
            }),
          ),
          h(
            "p",
            { className: "team-knowledge-count", role: "status" },
            `Найдено документов: ${filtered.length}`,
          ),
          h(
            "div",
            {
              className: "team-knowledge-results",
              "aria-label": "Документы базы знаний",
            },
            ...visible.map((item) =>
              h(
                "button",
                {
                  className: `team-article-item${item.id === selectedArticle?.id && !articleForm ? " is-selected" : ""}`,
                  type: "button",
                  key: item.id,
                  onClick: () => openArticle(item),
                  disabled: Boolean(busy),
                  "aria-pressed":
                    item.id === selectedArticle?.id && !articleForm,
                },
                h("strong", null, item.title),
                h(
                  "small",
                  { className: "team-article-folder" },
                  articleFolderPath(item).replaceAll("/", " › ") || "Без папки",
                ),
                h(
                  "small",
                  null,
                  `Версия ${item.version} · ${dateLabel(item.updatedAt)}`,
                ),
              ),
            ),
          ),
          filtered.length > ARTICLE_PAGE_SIZE &&
            h(
              "nav",
              {
                className: "team-knowledge-pages",
                "aria-label": "Страницы базы знаний",
              },
              button(
                "Назад",
                () => {
                  if (
                    articleDirty &&
                    !window.confirm("Удалить несохранённые изменения статьи?")
                  )
                    return;
                  setArticleForm(null);
                  setConflict(null);
                  setArticleId("");
                  setArticlePage(page - 1);
                },
                {
                  disabled: Boolean(busy) || page === 0,
                  "aria-label": "Предыдущая страница документов",
                },
              ),
              h("span", null, `${page + 1} / ${lastPage + 1}`),
              button(
                "Далее",
                () => {
                  if (
                    articleDirty &&
                    !window.confirm("Удалить несохранённые изменения статьи?")
                  )
                    return;
                  setArticleForm(null);
                  setConflict(null);
                  setArticleId("");
                  setArticlePage(page + 1);
                },
                {
                  disabled: Boolean(busy) || page === lastPage,
                  "aria-label": "Следующая страница документов",
                },
              ),
            ),
        ),
        h(
          "section",
          { className: "team-document" },
          articleForm
            ? h(
                "form",
                { onSubmit: saveArticle },
                h(
                  "div",
                  { className: "team-section-heading" },
                  h(
                    "h2",
                    null,
                    articleForm.version
                      ? "Редактирование статьи"
                      : "Новая статья",
                  ),
                  button(
                    "Отменить",
                    () => {
                      if (
                        !articleDirty ||
                        window.confirm(
                          "Удалить несохранённые изменения статьи?",
                        )
                      ) {
                        setArticleForm(null);
                        setConflict(null);
                      }
                    },
                    { disabled: Boolean(busy) },
                  ),
                ),
                articleForm.version > 0 && articleMetadata(articleForm),
                articleStructured &&
                  articleAutoFields(articleForm, {
                    editing: true,
                    timing: false,
                  }),
                articleStructured && articleAudienceField(),
                articleStructured &&
                  articleAutoFields(articleForm, {
                    editing: true,
                    authors: false,
                  }),
                !articleEditable &&
                  errorBox(
                    "Права на изменение инструкций отозваны. Черновик сохранён: вы можете скопировать текст или закрыть редактор.",
                  ),
                field(
                  articleStructured ? "Тема" : "Название статьи",
                  h("input", {
                    value: articleForm.title,
                    maxLength: 200,
                    required: true,
                    disabled: Boolean(busy),
                    readOnly: !articleEditable,
                    onChange: (event) =>
                      setArticleForm((value) => ({
                        ...value,
                        title: event.target.value,
                      })),
                  }),
                ),
                articleStructured &&
                  articleTextField(
                    "Причина создания",
                    "reason",
                    "Почему понадобилась эта инструкция?",
                  ),
                articleStructured &&
                  articleTextField(
                    "Задача создания",
                    "purpose",
                    "Какую задачу решает инструкция?",
                  ),
                field(
                  articleStructured ? "Текст" : "Текст статьи",
                  h("textarea", {
                    rows: 16,
                    value: articleForm.body,
                    maxLength: 60000,
                    required: true,
                    disabled: Boolean(busy),
                    readOnly: !articleEditable,
                    placeholder:
                      "Процесс, инструкция или полезная информация для команды…",
                    onChange: (event) =>
                      setArticleForm((value) => ({
                        ...value,
                        body: event.target.value,
                      })),
                  }),
                  articleForm.visibility === "admin"
                    ? "Статья доступна только администраторам выбранной области."
                    : articleForm.visibility === "staff"
                      ? "Сотрудникам, кроме водителей."
                      : "Статья доступна всем сотрудникам выбранной области.",
                ),
                articleStructured &&
                  articleTextField(
                    "Результат",
                    "result",
                    "Что должно быть после освоения сотрудниками инструкции?",
                  ),
                conflict &&
                  h(
                    "div",
                    { className: "team-conflict" },
                    h("h3", null, "Статья изменилась во время редактирования"),
                    conflict.pending
                      ? h(
                          "p",
                          null,
                          "Актуальная версия недоступна. Повторите загрузку, ваш текст остаётся в редакторе.",
                        )
                      : h(
                          React.Fragment,
                          null,
                          h(
                            "strong",
                            null,
                            `Актуальная версия ${conflict.version}: ${conflict.title}`,
                          ),
                          conflict.structured &&
                            articleAutoFields(conflict, { audience: true }),
                          articleContent(conflict),
                          h(
                            "p",
                            null,
                            "Ваш вариант находится в редакторе выше. Можно принять актуальный текст или осознанно заменить его своим.",
                          ),
                          h(
                            "div",
                            { className: "team-actions" },
                            button(
                              "Принять актуальную версию",
                              () => {
                                setArticleForm({
                                  ...conflict,
                                  original: articleDraftValues(conflict),
                                });
                                setConflict(null);
                              },
                              { disabled: Boolean(busy) },
                            ),
                            button(
                              "Сохранить мой вариант поверх версии",
                              () => saveArticle(null, conflict),
                              { disabled: Boolean(busy) || !articleEditable },
                            ),
                          ),
                        ),
                    conflict.pending &&
                      button(
                        "Загрузить актуальную версию",
                        () =>
                          mutate(
                            "conflict",
                            () => api(scoped("/team/articles")),
                            (result) =>
                              setConflict(
                                result.articles?.find(
                                  (item) => item.id === articleForm.id,
                                ) || { pending: true },
                              ),
                          ),
                        { disabled: Boolean(busy) },
                      ),
                  ),
                h(
                  "button",
                  {
                    className: "button team-primary",
                    type: "submit",
                    disabled:
                      Boolean(busy) ||
                      Boolean(conflict) ||
                      !articleEditable ||
                      (articleStructured && articlePositions.loading),
                  },
                  busy === "article" ? "Сохраняем…" : "Сохранить статью",
                ),
              )
            : selectedArticle
              ? h(
                  React.Fragment,
                  null,
                  h(
                    "div",
                    { className: "team-section-heading" },
                    h(
                      "div",
                      null,
                      h(
                        "p",
                        { className: "team-eyebrow" },
                        `База знаний · версия ${selectedArticle.version}`,
                      ),
                      h("h2", null, selectedArticle.title),
                    ),
                    (canEditArticle(selectedArticle) ||
                      canDeleteArticle(selectedArticle)) &&
                      h(ActionMenu, {
                        label: "Действия инструкции",
                        resetKey: selectedArticle.id,
                        disabled: Boolean(busy),
                        items: [
                          canEditArticle(selectedArticle) && {
                            label: "Редактировать",
                            icon: "edit",
                            onClick: () => editArticle(selectedArticle),
                          },
                          canDeleteArticle(selectedArticle) && {
                            label: "Удалить инструкцию",
                            icon: "trash",
                            danger: true,
                            onClick: () =>
                              confirmArticleDeletion(selectedArticle),
                          },
                        ].filter(Boolean),
                      }),
                  ),
                  selectedArticle.structured
                    ? articleAutoFields(selectedArticle, { audience: true })
                    : h(
                        "p",
                        { className: "team-muted" },
                        `${selectedArticle.authorName || nameOf(selectedArticle.authorId)} · ${dateLabel(selectedArticle.updatedAt)}`,
                      ),
                  articleMetadata(selectedArticle),
                  articleContent(selectedArticle),
                )
              : articles.length
                ? empty(
                    "Документы не найдены",
                    "Измените поисковый запрос или выберите другую папку.",
                    button("Показать все документы", () =>
                      filterKnowledge("", ""),
                    ),
                  )
                : empty(
                    "Знания команды в одном месте",
                    "Сохраняйте инструкции, решения и ответы на частые вопросы.",
                    knowledgeAccess.canCreate &&
                      button("Написать первую статью", () => editArticle(), {
                        className: "button team-primary",
                      }),
                  ),
        ),
      );
    }

    async function saveAdaptationProgress(article) {
      if (!hasAdaptation || adaptation.scopeId !== scopeId || busyRef.current)
        return;
      if (
        article &&
        !adaptation.articles?.some(
          (item) => item.id === article.id && !item.readAt,
        )
      )
        return;
      if (!article && (adaptation.completed || !canCompleteAdaptation)) return;
      const account = accountRef.current,
        version = generation.current,
        targetScope = scopeId;
      await mutate(
        article ? `adaptation-read:${article.id}` : "adaptation-complete",
        async () => {
          try {
            return await api(
              article
                ? `/team/adaptation/articles/${encodeURIComponent(article.id)}/read`
                : "/team/adaptation/complete",
              {
                method: "PUT",
                body: JSON.stringify({
                  responsibilityScopeId: targetScope,
                  ...(article ? { version: article.version } : {}),
                }),
              },
            );
          } catch (reason) {
            if (
              current(targetScope, account) &&
              generation.current === version
            ) {
              try {
                const value = await api("/team/adaptation");
                if (
                  current(targetScope, account) &&
                  generation.current === version
                )
                  applyAdaptation(value, targetScope);
              } catch {}
            }
            if (article && reason?.status === 409)
              throw new Error(
                "Инструкция изменилась. Прочитайте актуальную версию и отметьте её заново.",
              );
            throw reason;
          }
        },
        (result) => {
          applyAdaptation(result, targetScope);
          if (!article && result.completed) {
            setNotice(
              "Адаптация завершена. Инструкции остаются доступны для повторного чтения.",
            );
            callbacks.current.onAdaptationComplete?.(result);
          }
        },
      );
    }
    function adaptationView() {
      if (!adaptation)
        return h(
          "p",
          { className: "team-loading", role: "status" },
          loading
            ? "Загружаем материалы адаптации…"
            : "Материалы адаптации пока недоступны. Обновите команду, чтобы повторить загрузку.",
        );
      if (!hasAdaptation)
        return empty(
          "Адаптация не назначена",
          "Если вам нужен вводный курс, обратитесь к администратору.",
          button("Перейти к обсуждениям", () => chooseTab("chat")),
        );
      if (adaptation.scopeId !== scopeId) {
        const assignedScope = scopes.find(
          (scope) => scope.responsibilityScopeId === adaptation.scopeId,
        );
        return empty(
          "Адаптация в другой области",
          assignedScope
            ? `Материалы назначены в области «${scopeLabel(assignedScope)}».`
            : "Доступ к области адаптации изменился. Обратитесь к администратору.",
          assignedScope &&
            button("Открыть область адаптации", () =>
              chooseScope(adaptation.scopeId),
            ),
        );
      }
      const folders = adaptation.folders || [
          "Общая информация",
          "Папка сотрудника компании",
        ],
        documents = [...(adaptation.articles || [])].sort(
          (a, b) =>
            compareFolderPaths(articleFolderPath(a), articleFolderPath(b)) ||
            compareArticles(a, b),
        ),
        selected =
          documents.find((article) => article.id === adaptationArticleId) ||
          documents.find((article) => !article.readAt) ||
          documents[0],
        nextUnread = documents.find(
          (article) => article.id !== selected?.id && !article.readAt,
        ),
        total = adaptation.total || 0,
        read = Math.min(adaptation.readCount || 0, total),
        percent = total ? Math.round((read / total) * 100) : 0;
      return h(
        "section",
        { className: "team-adaptation", "aria-label": "Адаптация сотрудника" },
        h(
          "header",
          { className: "team-adaptation-intro" },
          h(
            "div",
            null,
            h(
              "p",
              { className: "team-eyebrow" },
              adaptation.completed
                ? "Вводный курс пройден"
                : "Знакомство с компанией",
            ),
            h("h2", null, "Адаптация в компании"),
            h(
              "p",
              { className: "team-muted" },
              "Прочитайте инструкции из двух папок и отметьте изученные материалы. Можно переключиться в другие разделы и продолжить позже.",
            ),
          ),
          h(
            "div",
            { className: "team-adaptation-progress" },
            h(
              "div",
              null,
              h("strong", null, `${percent}%`),
              h(
                "span",
                { role: "status" },
                adaptation.completed && read < total
                  ? `Актуальные версии: ${read} из ${total}`
                  : `Прочитано ${read} из ${total} инструкций`,
              ),
            ),
            h("progress", {
              value: read,
              max: total || 1,
              "aria-label":
                adaptation.completed && read < total
                  ? "Прочитано актуальных версий"
                  : "Прогресс адаптации",
            }),
            adaptation.completed
              ? h(
                  "p",
                  { className: "team-adaptation-done", role: "status" },
                  `✓ Адаптация завершена${adaptation.completedAt ? ` · ${dateLabel(adaptation.completedAt)}` : ""}`,
                )
              : button(
                  busy === "adaptation-complete"
                    ? "Завершаем…"
                    : "Завершить адаптацию",
                  () => saveAdaptationProgress(),
                  {
                    className: "button team-primary",
                    "aria-label": "Завершить адаптацию",
                    disabled: Boolean(busy) || !canCompleteAdaptation,
                  },
                ),
            adaptation.completed &&
              read < total &&
              h(
                "small",
                { className: "team-muted" },
                "Программа завершена. Есть обновлённые инструкции для ознакомления.",
              ),
            !adaptation.completed &&
              !total &&
              canCompleteAdaptation &&
              h(
                "small",
                { className: "team-muted" },
                "Назначенные инструкции удалены. Можно завершить адаптацию.",
              ),
            !adaptation.completed &&
              read < total &&
              h(
                "small",
                { className: "team-muted" },
                "Завершение станет доступно после прочтения всех инструкций.",
              ),
          ),
        ),
        documents.length
          ? h(
              "div",
              { className: "team-adaptation-layout" },
              h(
                "nav",
                {
                  className: "team-adaptation-list",
                  "aria-label": "Инструкции адаптации",
                },
                ...folders.map((folder) => {
                  const items = documents.filter((article) =>
                    articleInFolder(article, folder),
                  );
                  return h(
                    "section",
                    { key: folder },
                    h("h3", null, folder),
                    h(
                      "small",
                      { className: "team-muted" },
                      `${items.filter((article) => article.readAt).length} из ${items.length} прочитано`,
                    ),
                    ...items.map((article) =>
                      button(
                        h(
                          React.Fragment,
                          null,
                          h(
                            "span",
                            {
                              className: `team-adaptation-check${article.readAt ? " is-read" : ""}`,
                              "aria-hidden": true,
                            },
                            article.readAt ? "✓" : "",
                          ),
                          h(
                            "span",
                            null,
                            h("strong", null, article.title),
                            h(
                              "small",
                              null,
                              article.readAt ? "Прочитано" : "Не прочитано",
                            ),
                          ),
                        ),
                        () => setAdaptationArticleId(article.id),
                        {
                          key: article.id,
                          className: `team-adaptation-item${selected?.id === article.id ? " is-selected" : ""}`,
                          "aria-label": `Открыть инструкцию: ${article.title}`,
                          "aria-pressed": selected?.id === article.id,
                          disabled: Boolean(busy),
                        },
                      ),
                    ),
                    !items.length &&
                      h(
                        "p",
                        { className: "team-muted" },
                        "Материалы пока не добавлены.",
                      ),
                  );
                }),
              ),
              selected &&
                h(
                  "article",
                  { className: "team-adaptation-reader" },
                  h(
                    "header",
                    null,
                    h("h3", null, selected.title),
                    h(
                      "p",
                      { className: "team-muted" },
                      `Версия ${selected.version} · ${dateLabel(selected.updatedAt)}`,
                    ),
                  ),
                  selected.structured &&
                    articleAutoFields(selected, { audience: true }),
                  articleMetadata(selected, {
                    navigate: false,
                    showSource: true,
                  }),
                  articleContent(selected),
                  h(
                    "footer",
                    { className: "team-adaptation-read-actions" },
                    button(
                      selected.readAt
                        ? "Прочитано"
                        : busy === `adaptation-read:${selected.id}`
                          ? "Сохраняем…"
                          : "Отметить прочитанным",
                      () => saveAdaptationProgress(selected),
                      {
                        className: `button${selected.readAt ? "" : " team-primary"}`,
                        disabled: Boolean(busy) || Boolean(selected.readAt),
                        "aria-label": selected.readAt
                          ? "Прочитано"
                          : "Отметить прочитанным",
                      },
                    ),
                    selected.readAt &&
                      h(
                        "small",
                        { className: "team-muted" },
                        dateLabel(selected.readAt),
                      ),
                    nextUnread &&
                      button(
                        "Следующая инструкция",
                        () => setAdaptationArticleId(nextUnread.id),
                        { disabled: Boolean(busy) },
                      ),
                  ),
                ),
            )
          : empty(
              "Материалы готовятся",
              "Администратор пока не добавил инструкции для адаптации. Вы можете пользоваться остальными разделами приложения.",
            ),
      );
    }

    async function openSource(id) {
      await mutate(
        "source",
        async () => {
          try {
            return await api(
              scoped(`/team/messages/${encodeURIComponent(id)}`),
            );
          } catch (reason) {
            if ([403, 404].includes(reason?.status))
              throw new Error(
                "Исходное сообщение недоступно: сводка не предоставляет доступ к чужой переписке. Текст сводки остаётся доступным.",
              );
            throw reason;
          }
        },
        (result) => {
          if (
            !revokedConversations.current.has(
              result.conversation?.id || result.message?.conversationId,
            )
          )
            setSource(result);
        },
      );
    }

    async function generateSummary(event) {
      event.preventDefault();
      if (
        !periodStart ||
        !periodEnd ||
        new Date(periodStart) >= new Date(periodEnd)
      ) {
        setError("Начало периода должно быть раньше окончания.");
        return;
      }
      await mutate(
        "summary",
        () =>
          api("/team/summaries", {
            method: "POST",
            body: JSON.stringify({
              responsibilityScopeId: scopeId,
              periodStart: new Date(periodStart).toISOString(),
              periodEnd: new Date(periodEnd).toISOString(),
            }),
          }),
        (result) => {
          const report = result.summary || result;
          // Invalidate only this list: initial people and chats still need to load.
          summaryGeneration.current++;
          setSummaries((items) => [
            report,
            ...items.filter((item) => item.id !== report.id),
          ]);
          setSummaryId(report.id);
          setNotice(
            "Сводка создана. Проверьте автоматически выделенные пункты перед отправкой коллегам.",
          );
        },
      );
    }
    async function saveSharing(event) {
      event.preventDefault();
      await mutate(
        "sharing",
        () =>
          api(`/team/summaries/${encodeURIComponent(sharing.id)}/sharing`, {
            method: "PUT",
            body: JSON.stringify({
              responsibilityScopeId: scopeId,
              recipientIds: sharing.recipientIds,
            }),
          }),
        (result) => {
          const report = result.summary || result;
          summaryGeneration.current++;
          setSummaries((items) =>
            items.map((item) => (item.id === report.id ? report : item)),
          );
          setSharing(null);
          setNotice("Доступ к сводке обновлён.");
        },
      );
    }
    function summariesView() {
      return h(
        "div",
        { className: "team-summary-workspace" },
        canManage &&
          h(
            "form",
            { className: "team-summary-builder", onSubmit: generateSummary },
            h(
              "div",
              null,
              h("h2", null, "Автосводка по сообщениям"),
              h(
                "p",
                { className: "team-muted" },
                "Все каналы, ветки и личные чаты выбранной области за указанный период.",
              ),
            ),
            field(
              "Начало периода",
              h("input", {
                type: "datetime-local",
                step: 1,
                value: periodStart,
                required: true,
                disabled: Boolean(busy),
                onChange: (event) => setPeriodStart(event.target.value),
              }),
            ),
            field(
              "Окончание периода",
              h("input", {
                type: "datetime-local",
                step: 1,
                value: periodEnd,
                required: true,
                disabled: Boolean(busy),
                onChange: (event) => setPeriodEnd(event.target.value),
              }),
              "Время устройства",
            ),
            h(
              "button",
              {
                type: "submit",
                className: "button team-primary",
                disabled: Boolean(busy),
              },
              busy === "summary" ? "Собираем сводку…" : "Создать сводку",
            ),
          ),
        h(
          "div",
          { className: "team-library-layout" },
          h(
            "aside",
            { className: "team-library-sidebar" },
            h(
              "h2",
              null,
              canManage ? "Сводки области" : "Доступные вам сводки",
            ),
            ...summaries.map((item) =>
              h(
                "button",
                {
                  type: "button",
                  key: item.id,
                  className: `team-article-item${item.id === summaryId ? " is-selected" : ""}`,
                  onClick: () => {
                    if (
                      sharing &&
                      !window.confirm(
                        "Удалить несохранённые изменения доступа?",
                      )
                    )
                      return;
                    setSharing(null);
                    setSummaryId(item.id);
                  },
                },
                h("strong", null, item.title),
                h(
                  "small",
                  null,
                  `${dateLabel(item.createdAt)} · ${item.messageCount} сообщений`,
                ),
              ),
            ),
          ),
          h(
            "section",
            { className: "team-document" },
            summary
              ? h(
                  React.Fragment,
                  null,
                  h(
                    "div",
                    { className: "team-section-heading" },
                    h(
                      "div",
                      null,
                      h(
                        "p",
                        { className: "team-eyebrow" },
                        "Автосводка по сообщениям",
                      ),
                      h("h2", null, summary.title),
                    ),
                    canManage &&
                      button(
                        "Поделиться",
                        () =>
                          setSharing({
                            id: summary.id,
                            responsibilityScopeId: summary.responsibilityScopeId,
                            recipientIds: [...(summary.recipientIds || [])],
                          }),
                        { disabled: Boolean(busy) },
                      ),
                  ),
                  h(
                    "p",
                    { className: "team-muted" },
                    `${dateLabel(summary.periodStart)} — ${dateLabel(summary.periodEnd)} · ${summary.messageCount} сообщений`,
                  ),
                  h(
                    "p",
                    { className: "team-extraction-note" },
                    "Категории определены автоматически — проверьте выводы. Сводка выделяет фразы из переписки по ключевым словам; это не анализ внешней ИИ-модели.",
                  ),
                  h(
                    "p",
                    { className: "team-summary-overview" },
                    summary.overview,
                  ),
                  ...CATEGORIES.map(([category, label]) =>
                    h(
                      "section",
                      {
                        className: `team-summary-category is-${category}`,
                        key: category,
                      },
                      h(
                        "h3",
                        null,
                        label,
                        h(
                          "span",
                          null,
                          summary.items.filter(
                            (item) => item.category === category,
                          ).length,
                        ),
                      ),
                      summary.items.filter((item) => item.category === category)
                        .length
                        ? h(
                            "ul",
                            null,
                            ...summary.items
                              .filter((item) => item.category === category)
                              .map((item, index) =>
                                h(
                                  "li",
                                  { key: index },
                                  h("p", null, item.text),
                                  item.sourceMessageIds?.length > 0 &&
                                    h(
                                      "details",
                                      null,
                                      h(
                                        "summary",
                                        null,
                                        `Источники: ${item.sourceMessageIds.length}`,
                                      ),
                                      h(
                                        "p",
                                        { className: "team-muted" },
                                        "Идентификаторы исходных сообщений. Доступ к переписке определяется отдельно.",
                                      ),
                                      ...item.sourceMessageIds.map((id) =>
                                        button(
                                          `Сообщение ${id.slice(-8)}`,
                                          () => openSource(id),
                                          {
                                            key: id,
                                            className:
                                              "team-text-button team-source-button",
                                            disabled: Boolean(busy),
                                            "aria-label": `Открыть источник ${id}`,
                                          },
                                        ),
                                      ),
                                    ),
                                ),
                              ),
                          )
                        : h(
                            "p",
                            { className: "team-muted" },
                            "В этом периоде явных упоминаний не найдено.",
                          ),
                    ),
                  ),
                  canManage &&
                    h(
                      "p",
                      { className: "team-muted" },
                      summary.recipientIds?.length
                        ? `Доступ предоставлен: ${summary.recipientIds.map(nameOf).join(", ")}`
                        : "Сводка доступна только администраторам области.",
                    ),
                  sharing &&
                    h(
                      "form",
                      { className: "team-sharing", onSubmit: saveSharing },
                      h(RecipientPicker, {
                        people: people.filter((person) =>
                          person.workResponsibilityScopeIds?.includes(sharing.responsibilityScopeId || scopeId),
                        ),
                        selected: sharing.recipientIds,
                        onChange: (ids) =>
                          setSharing((value) => ({
                            ...value,
                            recipientIds: ids,
                          })),
                        disabled: Boolean(busy),
                      }),
                      h(
                        "div",
                        { className: "team-actions" },
                        h(
                          "button",
                          {
                            type: "submit",
                            className: "button team-primary",
                            disabled: Boolean(busy),
                          },
                          "Сохранить доступ",
                        ),
                        button("Отменить", () => setSharing(null), {
                          disabled: Boolean(busy),
                        }),
                      ),
                    ),
                )
              : empty(
                  canManage
                    ? "Сводки ещё не создавались"
                    : "Пока нет доступных сводок",
                  canManage
                    ? "Укажите период выше, чтобы собрать задачи, возможности, идеи оптимизации и угрозы из переписки."
                    : "Здесь появятся сводки, которыми с вами поделится администратор.",
                ),
          ),
        ),
      );
    }
    function openSchedule(item) {
      if (
        scheduleForm &&
        !window.confirm("Удалить несохранённый черновик расписания?")
      )
        return;
      setScheduleForm(
        item
          ? { ...item, recipientIds: [...item.recipientIds] }
          : {
              id: uid(),
              enabled: true,
              frequency: "daily",
              time: "09:00",
              timeZone: "Europe/Moscow",
              weekday: 1,
              recipientIds: [],
            },
      );
    }
    async function saveSchedule(event) {
      event.preventDefault();
      await mutate(
        "schedule",
        () =>
          api("/team/schedules", {
            method: "PUT",
            body: JSON.stringify({
              id: scheduleForm.id,
              responsibilityScopeId: scopeId,
              enabled: scheduleForm.enabled,
              frequency: scheduleForm.frequency,
              time: scheduleForm.time,
              timeZone: scheduleForm.timeZone,
              weekday: Number(scheduleForm.weekday),
              recipientIds: scheduleForm.recipientIds,
            }),
          }),
        (result) => {
          const schedule = result.schedule || result;
          scheduleGeneration.current++;
          setSchedules((items) => [
            schedule,
            ...items.filter((item) => item.id !== schedule.id),
          ]);
          setScheduleForm(null);
          setNotice(
            "Расписание сохранено. Сводки будут появляться в разделе «Сводки».",
          );
        },
      );
    }
    function schedulesView() {
      return h(
        "div",
        { className: "team-schedules" },
        h(
          "div",
          { className: "team-section-heading" },
          h(
            "div",
            null,
            h("h2", null, "Сводки по расписанию"),
            h(
              "p",
              { className: "team-muted" },
              "Автоматическое создание и доступ для выбранных сотрудников внутри приложения.",
            ),
          ),
          button("Добавить расписание", () => openSchedule(), {
            className: "button team-primary",
            disabled: Boolean(busy),
          }),
        ),
        scheduleForm &&
          h(
            "form",
            { className: "team-schedule-editor", onSubmit: saveSchedule },
            h("h3", null, "Настройка расписания"),
            h(
              "div",
              { className: "team-schedule-fields" },
              field(
                "Периодичность",
                h(
                  "select",
                  {
                    value: scheduleForm.frequency,
                    disabled: Boolean(busy),
                    onChange: (event) =>
                      setScheduleForm((value) => ({
                        ...value,
                        frequency: event.target.value,
                      })),
                  },
                  h("option", { value: "daily" }, "Каждый день"),
                  h("option", { value: "weekly" }, "Каждую неделю"),
                ),
              ),
              field(
                "Время",
                h("input", {
                  type: "time",
                  value: scheduleForm.time,
                  required: true,
                  disabled: Boolean(busy),
                  onChange: (event) =>
                    setScheduleForm((value) => ({
                      ...value,
                      time: event.target.value,
                    })),
                }),
              ),
              field(
                "Часовой пояс",
                h(
                  "select",
                  {
                    value: scheduleForm.timeZone,
                    disabled: Boolean(busy),
                    onChange: (event) =>
                      setScheduleForm((value) => ({
                        ...value,
                        timeZone: event.target.value,
                      })),
                  },
                  h("option", { value: "Europe/Moscow" }, "Москва · UTC+3"),
                ),
              ),
              scheduleForm.frequency === "weekly" &&
                field(
                  "День недели",
                  h(
                    "select",
                    {
                      value: scheduleForm.weekday,
                      disabled: Boolean(busy),
                      onChange: (event) =>
                        setScheduleForm((value) => ({
                          ...value,
                          weekday: Number(event.target.value),
                        })),
                    },
                    ...[
                      "Понедельник",
                      "Вторник",
                      "Среда",
                      "Четверг",
                      "Пятница",
                      "Суббота",
                      "Воскресенье",
                    ].map((label, index) =>
                      h("option", { key: index, value: index + 1 }, label),
                    ),
                  ),
                ),
            ),
            h(
              "label",
              { className: "team-checkbox" },
              h("input", {
                type: "checkbox",
                checked: scheduleForm.enabled,
                disabled: Boolean(busy),
                onChange: (event) =>
                  setScheduleForm((value) => ({
                    ...value,
                    enabled: event.target.checked,
                  })),
              }),
              "Расписание включено",
            ),
            h(RecipientPicker, {
              people: people.filter((person) =>
                person.workResponsibilityScopeIds?.includes(scheduleForm.responsibilityScopeId || scopeId),
              ),
              selected: scheduleForm.recipientIds,
              onChange: (ids) =>
                setScheduleForm((value) => ({ ...value, recipientIds: ids })),
              disabled: Boolean(busy),
              label: "Кому доступны новые сводки",
            }),
            h(
              "div",
              { className: "team-actions" },
              h(
                "button",
                {
                  type: "submit",
                  className: "button team-primary",
                  disabled: Boolean(busy),
                },
                "Сохранить расписание",
              ),
              button(
                "Отменить",
                () => {
                  if (
                    window.confirm("Удалить несохранённый черновик расписания?")
                  )
                    setScheduleForm(null);
                },
                { disabled: Boolean(busy) },
              ),
            ),
          ),
        schedules.length
          ? h(
              "div",
              { className: "team-schedule-list" },
              ...schedules.map((item) =>
                h(
                  "article",
                  { className: "team-schedule-card", key: item.id },
                  h(
                    "div",
                    null,
                    h(
                      "span",
                      {
                        className: `team-status${item.enabled ? " is-enabled" : ""}`,
                      },
                      item.enabled ? "Включено" : "Приостановлено",
                    ),
                    h(
                      "h3",
                      null,
                      `${item.frequency === "weekly" ? "Еженедельно" : "Ежедневно"} в ${item.time}`,
                    ),
                    h(
                      "p",
                      { className: "team-muted" },
                      `${item.timeZone} · Получателей: ${item.recipientIds.length}`,
                    ),
                    item.nextRunAt &&
                      h(
                        "p",
                        null,
                        `Следующая сводка: ${dateLabel(item.nextRunAt)}`,
                      ),
                    item.lastRunAt &&
                      h(
                        "p",
                        { className: "team-muted" },
                        `Последний запуск: ${dateLabel(item.lastRunAt)}`,
                      ),
                    item.lastError &&
                      errorBox(
                        `Последний запуск не завершён: ${item.lastError}`,
                      ),
                  ),
                  button("Изменить", () => openSchedule(item), {
                    disabled: Boolean(busy),
                  }),
                ),
              ),
            )
          : !scheduleForm &&
              empty(
                "Выберите удобный ритм",
                "Ежедневные или еженедельные сводки помогут регулярно видеть важное в переписке.",
              ),
      );
    }

    return h(
      "section",
      { className: "team-workspace", ref: workspaceRef },
      h(
        "header",
        { className: "team-heading" },
        h(
          "div",
          null,
          h("p", { className: "team-eyebrow" }, "Корпоративная среда"),
          h("h1", null, "Команда"),
          h("p", null, "Общение, знания и решения в одном пространстве"),
        ),
        h(
          "div",
          { className: "team-scope-control" },
          button(
            "Обновить",
            scopeId ? refresh : () => setRevision((value) => value + 1),
            {
              disabled:
                contextLoading ||
                Boolean(busy) ||
                Boolean(scopeId && !scopeAvailable),
              "aria-label": "Обновить команду",
            },
          ),
        ),
      ),
      h(
        "div",
        { className: "team-policy", role: "note" },
        h("span", { "aria-hidden": true }, "◉"),
        h("p", null, POLICY),
      ),
      errorBox(error),
      notice && h("div", { className: "team-notice", role: "status" }, notice),
      contextLoading
        ? h(
            "p",
            { className: "team-loading" },
            "Загружаем пространство команды…",
          )
        : !scopeId || !scopeAvailable
          ? empty(
              "Команда пока недоступна",
              "Попросите администратора подключить вашу учётную запись к компании.",
            )
          : h(
              React.Fragment,
              null,
              h(
                "nav",
                { className: "team-tabs", "aria-label": "Разделы команды" },
                ...[
                  ["chat", "Обсуждения"],
                  [
                    "mentions",
                    mentionInbox.unreadCount
                      ? `Упоминания · ${mentionInbox.unreadCount}`
                      : "Упоминания",
                  ],
                  ...(TeamTasks ? [["tasks", "Задачи"]] : []),
                  ...(DriverRequests ? [["drivers", "Запросы водителей"]] : []),
                  ...(TeamOutcomes ? [["outcomes", "Итоги"]] : []),
                  ["knowledge", "База знаний"],
                  ...(hasAdaptation ? [["adaptation", "Адаптация"]] : []),
                  ["summaries", "Сводки"],
                  ...(canManage
                    ? [
                        ["response-metrics", "Скорость ответов"],
                        ["schedules", "Расписание"],
                      ]
                    : []),
                ].map(([id, label]) =>
                  button(label, () => chooseTab(id), {
                    key: id,
                    className: `team-tab${tab === id ? " is-selected" : ""}`,
                    "aria-pressed": tab === id,
                    disabled: Boolean(busy),
                  }),
                ),
                h(
                  "span",
                  { className: "team-tabs-meta" },
                  loading ? "Загрузка…" : `${people.length} сотрудников`,
                ),
              ),
              tab === "chat" && chatView(),
              tab === "mentions" && mentionsView(),
              tab === "tasks" &&
                TeamTasks &&
                h(TeamTasks, {
                  key: `${actor?.id}:${scopeId}`,
                  token,
                  actor,
                  scopeId,
                  scopes: workScopes,
                  onExpired,
                  onDirtyChange: setTasksDirty,
                  initialTaskId: taskOpen?.id,
                  openTaskRequest: taskOpen?.request,
                  onOpenConversation: (id) => {
                    if (chooseTab("chat")) {
                      chooseConversation(
                        typeof id === "string" ? id : id.conversationId,
                      );
                      loadLists(scopeId).catch((reason) =>
                        setError(fail(reason)),
                      );
                    }
                  },
                }),
              tab === "outcomes" &&
                TeamOutcomes &&
                h(TeamOutcomes, {
                  key: `${actor?.id}:${scopeId}`,
                  token,
                  actor,
                  scopeId,
                  scopes: workScopes,
                  onExpired,
                  onDirtyChange: setOutcomesDirty,
                  onRecognitionChange: () =>
                    setMetadataRevision((value) => value + 1),
                }),
              tab === "drivers" &&
                DriverRequests &&
                h(DriverRequests, {
                  key: `${actor?.id}:${scopeId}`,
                  token,
                  actor,
                  scopeId,
                  scopes: workScopes,
                  scopeName: scopeLabel(
                    scopes.find(
                      (scope) => scope.responsibilityScopeId === scopeId,
                    ),
                  ),
                  refreshRequest: driverRequestsRefresh,
                  onExpired,
                  onDirtyChange: setDriverRequestsDirty,
                }),
              tab === "knowledge" && knowledgeView(),
              tab === "adaptation" && adaptationView(),
              tab === "summaries" && summariesView(),
              tab === "schedules" && canManage && schedulesView(),
              tab === "response-metrics" &&
                canManage &&
                h(TeamResponseMetrics, {
                  key: `${actor?.id}:${scopeId}`,
                  api,
                  scopeId,
                  refreshRequest: metricsRefresh,
                  onError: fail,
                }),
            ),
      profileCard &&
        ProfileCard &&
        h(ProfileCard, {
          key: `${scopeId}:${profileCard.id}`,
          token,
          scopeId,
          userId: profileCard.id,
          name: profileCard.name,
          onClose: () => setProfileCard(null),
          onExpired,
        }),
      articleToDelete &&
        h(
          Dialog,
          {
            title: "Удалить инструкцию?",
            busy: Boolean(busy),
            onClose: () => {
              if (!busyRef.current) {
                setArticleToDelete(null);
                setError("");
              }
            },
          },
          h(
            "div",
            { className: "team-dialog-body" },
            errorBox(error),
            h(
              "p",
              null,
              h("strong", null, `«${articleToDelete.article.title}»`),
            ),
            h(
              "p",
              { className: "team-muted" },
              articleToDelete.article.sourceFile
                ? "Инструкция и её одинаковые копии в доступных вам областях исчезнут из базы знаний и программы адаптации. Удаление нельзя отменить."
                : "Инструкция станет недоступна сотрудникам и исчезнет из базы знаний. Удаление нельзя отменить.",
            ),
            articleToDelete.conflict &&
              h(
                "p",
                { className: "team-conflict", role: "alert" },
                "Инструкция или доступ к ней изменились. Закройте окно и проверьте актуальный список перед удалением.",
              ),
            h(
              "footer",
              { className: "team-actions" },
              button(
                "Отмена",
                () => {
                  setArticleToDelete(null);
                  setError("");
                },
                { disabled: Boolean(busy) },
              ),
              button(
                busy === "article-delete" ? "Удаление…" : "Удалить инструкцию",
                () => deleteArticle(articleToDelete),
                {
                  className: "button team-danger-button",
                  disabled:
                    Boolean(busy) ||
                    articleToDelete.conflict ||
                    !canDeleteArticle(articleToDelete.article),
                },
              ),
            ),
          ),
        ),
      channelDialog &&
        h(
          Dialog,
          {
            title:
              channelDialog.action === "delete"
                ? "Удалить канал?"
                : "Архивировать канал?",
            busy: Boolean(busy),
            onClose: () => {
              if (!busyRef.current) {
                setChannelDialog(null);
                setError("");
              }
            },
          },
          h(
            "div",
            { className: "team-dialog-body" },
            errorBox(error),
            h(
              "p",
              null,
              h("strong", null, `«${channelDialog.conversation.title}»`),
            ),
            h(
              "p",
              { className: "team-muted" },
              channelDialog.action === "delete"
                ? "Канал и его переписка станут недоступны всем участникам. Отменить удаление нельзя. Чтобы сохранить переписку доступной для чтения, используйте архив."
                : "Канал переместится в архив у всех участников. Переписку можно будет читать, а новые сообщения — отправлять после возвращения канала из архива.",
            ),
            channelDialog.action === "delete" &&
              Object.keys(drafts).some((key) =>
                key.startsWith(`${channelDialog.conversation.id}:`),
              ) &&
              h(
                "p",
                { className: "team-muted" },
                "Ваши неотправленные черновики этого канала тоже будут удалены.",
              ),
            channelDialog.conflict &&
              h(
                "p",
                { className: "team-conflict", role: "alert" },
                "Канал уже изменился. Закройте окно, проверьте актуальное состояние и повторите действие.",
              ),
            h(
              "footer",
              { className: "team-actions" },
              button(
                "Отмена",
                () => {
                  setChannelDialog(null);
                  setError("");
                },
                { disabled: Boolean(busy) },
              ),
              button(
                busy === "channel-lifecycle"
                  ? "Сохранение…"
                  : channelDialog.action === "delete"
                    ? "Удалить канал"
                    : "Архивировать",
                () => changeChannel(channelDialog),
                {
                  className: `button ${channelDialog.action === "delete" ? "team-danger-button" : "team-primary"}`,
                  disabled: Boolean(busy) || channelDialog.conflict,
                },
              ),
            ),
          ),
        ),
      notificationDialog &&
        h(
          Dialog,
          {
            title: "Уведомления чата",
            busy: Boolean(busy),
            onClose: () => setNotificationDialog(null),
          },
          h(
            "form",
            {
              className: "team-dialog-body team-notification-settings",
              onSubmit: (event) => {
                event.preventDefault();
                const value = notificationDialog;
                mutate(
                  "notification-preferences",
                  () =>
                    api(
                      `/team/conversations/${encodeURIComponent(value.conversationId)}/notification-preferences`,
                      {
                        method: "PUT",
                        body: JSON.stringify({
                          responsibilityScopeId: scopeId,
                          muteNotifications: value.muteNotifications,
                          muteSound: value.muteSound,
                        }),
                      },
                    ),
                  (result) => {
                    setConversations((rows) =>
                      rows.map((row) =>
                        row.id === value.conversationId
                          ? { ...row, ...result }
                          : row,
                      ),
                    );
                    setNotificationDialog(null);
                    window.dispatchEvent(
                      new Event("team-notifications-changed"),
                    );
                  },
                );
              },
            },
            errorBox(error),
            h(
              "p",
              null,
              "Упоминания вас и @всех остаются видимыми и со звуком.",
            ),
            h(
              "label",
              null,
              h("input", {
                type: "checkbox",
                checked: notificationDialog.muteNotifications,
                disabled: Boolean(busy),
                onChange: (e) =>
                  setNotificationDialog((value) => ({
                    ...value,
                    muteNotifications: e.target.checked,
                  })),
              }),
              "Скрыть обычные уведомления этого чата",
            ),
            h(
              "label",
              null,
              h("input", {
                type: "checkbox",
                checked: notificationDialog.muteSound,
                disabled: Boolean(busy),
                onChange: (e) =>
                  setNotificationDialog((value) => ({
                    ...value,
                    muteSound: e.target.checked,
                  })),
              }),
              "Отключить звук обычных сообщений этого чата",
            ),
            h(
              "p",
              { className: "team-muted" },
              "Общие настройки в вашем профиле также действуют на этот чат.",
            ),
            h(
              "button",
              {
                type: "submit",
                className: "button team-primary",
                disabled: Boolean(busy),
              },
              "Сохранить уведомления",
            ),
          ),
        ),
      knowledgePermissionsDialog(),
      messageActionDialogs(),
      accessDialog &&
        h(
          Dialog,
          {
            title: "Доступ к чату",
            busy: Boolean(busy),
            onClose: closeAccessDialog,
            className: "team-chat-access-dialog",
          },
          h(
            "form",
            { className: "team-dialog-body", onSubmit: saveAccess },
            errorBox(error),
            accessDialog.conflict &&
              h(
                "p",
                { className: "team-access-conflict" },
                accessDialog.conflict.visibility === "private"
                  ? `Актуальный доступ: закрытый канал. Участники: ${(accessDialog.conflict.memberIds || []).map(nameOf).join(", ")}.`
                  : "Актуальный доступ: канал открыт всем сотрудникам компании.",
              ),
            h(ChannelAccessFields, {
              people: companyPeople(conversation?.responsibilityScopeId),
              value: accessDialog,
              creatorId: accessDialog.creatorId,
              disabled: Boolean(busy),
              onChange: (value) =>
                setAccessDialog({
                  ...value,
                  operationId: uid(),
                  changed: true,
                }),
            }),
            h(
              "div",
              { className: "team-actions" },
              h(
                "button",
                {
                  type: "submit",
                  className: "button team-primary",
                  disabled: Boolean(busy),
                },
                busy === "conversation-access"
                  ? "Сохраняем…"
                  : "Сохранить доступ",
              ),
              button("Отмена", closeAccessDialog, { disabled: Boolean(busy) }),
            ),
          ),
        ),
      source &&
        h(
          Dialog,
          {
            title:
              source.origin === "mention"
                ? "Сообщение с упоминанием"
                : "Источник сводки",
            busy: Boolean(busy),
            onClose: () => setSource(null),
          },
          h(
            "div",
            { className: "team-dialog-body" },
            errorBox(error),
            h(
              "p",
              { className: "team-eyebrow" },
              conversationTitle(source.conversation),
            ),
            source.ancestors?.length > 0 &&
              h(
                "div",
                { className: "team-source-ancestors" },
                h("p", { className: "team-muted" }, "Родительские сообщения"),
                ...source.ancestors.map((item) => messageCard(item, true)),
              ),
            messageCard(source.message, true),
            h(
              "p",
              { className: "team-muted" },
              "Доступ к этому сообщению проверен по вашим правам в переписке.",
            ),
          ),
        ),
      dialog &&
        h(
          Dialog,
          {
            title:
              dialog.kind === "channel" ? "Новый канал" : "Новый личный чат",
            busy: Boolean(busy),
            onClose: closeDialog,
            className: "team-chat-access-dialog",
          },
          h(
            "form",
            { className: "team-dialog-body", onSubmit: saveConversation },
            errorBox(error),
            dialog.kind === "channel"
              ? field(
                  "Название канала",
                  h("input", {
                    value: dialog.title,
                    maxLength: 120,
                    required: true,
                    disabled: Boolean(busy),
                    placeholder: "Например, логистика",
                    onChange: (event) =>
                      setDialog((value) => ({
                        ...value,
                        title: event.target.value,
                      })),
                  }),
                )
              : field(
                  "Собеседник",
                  h(
                    "select",
                    {
                      value: dialog.personId,
                      required: true,
                      disabled: Boolean(busy),
                      onChange: (event) =>
                        setDialog((value) => ({
                          ...value,
                          personId: event.target.value,
                        })),
                    },
                    h("option", { value: "" }, "Выберите сотрудника"),
                    ...companyPeople()
                      .filter((person) => person.id !== actor?.id)
                      .map((person) =>
                        h(
                          "option",
                          { key: person.id, value: person.id },
                          person.displayName,
                        ),
                      ),
                  ),
                ),
            dialog.kind === "channel" &&
              canManage &&
              h(ChannelAccessFields, {
                people: companyPeople(),
                value: dialog,
                creatorId: actor.id,
                disabled: Boolean(busy),
                onChange: setDialog,
              }),
            h("p", { className: "team-muted" }, POLICY),
            h(
              "div",
              { className: "team-actions" },
              h(
                "button",
                {
                  type: "submit",
                  className: "button team-primary",
                  disabled: Boolean(busy),
                },
                dialog.kind === "channel" ? "Создать канал" : "Открыть чат",
              ),
              button("Отмена", closeDialog, { disabled: Boolean(busy) }),
            ),
          ),
        ),
    );
  };
}
