// Recruiting board gestures only. The caller owns validation, confirmation and API writes.
const HOLD_MS = 450;
const MOVE_SLOP = 10;
const EDGE_SIZE = 58;
const MAX_SPEED = 18; // pixels per animation frame at 60 Hz
const INTERACTIVE =
  'a,button,input,select,textarea,label,summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="link"],[role="textbox"],[data-no-drag]';
const asElement = (target) =>
  target?.nodeType === 1 ? target : target?.parentElement;
const touchById = (list, id) =>
  Array.from(list || []).find((touch) => touch.identifier === id);
const pointOf = (value) => ({ x: value.clientX, y: value.clientY });

function blocksDrag(target, card) {
  const element = asElement(target);
  if (!element || !card.contains(element)) return true;
  const handle = element.closest("[data-drag-handle]");
  if (handle && card.contains(handle)) return false;
  const control = element.closest(INTERACTIVE);
  return Boolean(control && card.contains(control));
}
function edgeSpeed(position, start, end) {
  if (end <= start || position < start - 24 || position > end + 24) return 0;
  const edge = Math.min(EDGE_SIZE, (end - start) / 3);
  if (position < start + edge)
    return -MAX_SPEED * Math.min(1, (start + edge - position) / edge);
  if (position > end - edge)
    return MAX_SPEED * Math.min(1, (position - end + edge) / edge);
  return 0;
}

export function createRecruitmentBoardDrag(React) {
  const { useEffect, useRef, useState } = React;
  return function useRecruitmentBoardDrag({
    enabled = false,
    onDrop,
    onCancel,
  }) {
    const boardRef = useRef(null);
    const [dragState, setDragState] = useState(null);
    const callbacks = useRef({ enabled, onDrop, onCancel });
    callbacks.current = { enabled, onDrop, onCancel };
    const session = useRef(null),
      pending = useRef(null),
      mouseOrigin = useRef(null);
    const alive = useRef(true),
      removers = useRef([]),
      animation = useRef(0),
      lastFrame = useRef(0);
    const suppressedTouch = useRef(null),
      sourceHighlight = useRef(null),
      targetHighlight = useRef(null);
    const restoreStyles = useRef(null);
    const boundBoard = useRef(null),
      detachBoard = useRef(null);

    function listen(target, name, handler, options) {
      target.addEventListener(name, handler, options);
      removers.current.push(() =>
        target.removeEventListener(name, handler, options),
      );
    }
    function setTarget(column) {
      if (targetHighlight.current === column) return;
      targetHighlight.current?.removeAttribute("data-drag-over");
      targetHighlight.current = column;
      column?.setAttribute("data-drag-over", "true");
    }
    function cleanGesture() {
      if (pending.current?.timer) clearTimeout(pending.current.timer);
      pending.current = null;
      for (const remove of removers.current.splice(0)) remove();
      if (animation.current) cancelAnimationFrame(animation.current);
      animation.current = 0;
      lastFrame.current = 0;
      setTarget(null);
      if (sourceHighlight.current) {
        sourceHighlight.current.removeAttribute("data-dragging");
        sourceHighlight.current = null;
      }
      boardRef.current?.removeAttribute("data-drag-active");
      boundBoard.current?.removeAttribute("data-drag-active");
      restoreStyles.current?.();
      restoreStyles.current = null;
    }
    function end(reason = "cancel", drop = false) {
      const current = session.current;
      session.current = null;
      if (current?.inputType === "touch")
        suppressedTouch.current = { x: current.x, y: current.y, until: Date.now() + 800 };
      const valid =
        drop &&
        current &&
        callbacks.current.enabled &&
        current.toStage &&
        current.toStage !== current.fromStage &&
        current.card.isConnected &&
        boardRef.current?.contains(current.card) &&
        current.card.closest("[data-stage]")?.dataset.stage ===
          current.fromStage;
      cleanGesture();
      if (alive.current) setDragState(null);
      if (!current) return;
      const info = {
        applicationId: current.applicationId,
        fromStage: current.fromStage,
        toStage: current.toStage,
      };
      if (valid) callbacks.current.onDrop?.(info);
      else callbacks.current.onCancel?.({ ...info, reason });
    }
    function columnAt(x, y) {
      const board = boardRef.current,
        current = session.current;
      if (!board || !current || !Number.isFinite(x) || !Number.isFinite(y))
        return null;
      const rect = board.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
        return null;
      const element = board.ownerDocument.elementFromPoint(x, y);
      const column = element?.closest("[data-stage]");
      if (
        !column ||
        !board.contains(column) ||
        column.dataset.dropDisabled === "true"
      )
        return null;
      const stage = column.dataset.stage?.trim();
      return stage && stage !== current.fromStage ? column : null;
    }
    function publishPoint(point) {
      const current = session.current;
      if (!current) return;
      current.x = point.x;
      current.y = point.y;
      const column = columnAt(point.x, point.y);
      current.toStage = column?.dataset.stage || null;
      setTarget(column);
      if (alive.current)
        setDragState((previous) => {
          if (
            previous?.applicationId === current.applicationId &&
            previous.fromStage === current.fromStage &&
            previous.toStage === current.toStage &&
            previous.x === current.x &&
            previous.y === current.y &&
            previous.inputType === current.inputType
          )
            return previous;
          return {
            applicationId: current.applicationId,
            fromStage: current.fromStage,
            toStage: current.toStage,
            x: current.x,
            y: current.y,
            inputType: current.inputType,
          };
        });
    }
    function verticalParents(board) {
      const result = [],
        win = board.ownerDocument.defaultView;
      for (
        let element = board;
        element && element !== board.ownerDocument.documentElement;
        element = element.parentElement
      ) {
        if (/(auto|scroll)/.test(win.getComputedStyle(element).overflowY))
          result.push(element);
      }
      return result;
    }
    function autoScroll(time) {
      animation.current = 0;
      const current = session.current,
        board = boardRef.current;
      if (!current || !board) return;
      if (
        !callbacks.current.enabled ||
        !board.isConnected ||
        !board.contains(current.card) ||
        current.card.closest("[data-stage]")?.dataset.stage !==
          current.fromStage
      ) {
        end("source-changed");
        return;
      }
      const win = board.ownerDocument.defaultView,
        bounds = board.getBoundingClientRect();
      const ratio = lastFrame.current
        ? Math.min(2, (time - lastFrame.current) / (1000 / 60))
        : 1;
      lastFrame.current = time;
      let changed = false;
      if (
        current.y >= Math.max(0, bounds.top) - 24 &&
        current.y <= Math.min(win.innerHeight, bounds.bottom) + 24
      ) {
        const dx =
          edgeSpeed(
            current.x,
            Math.max(0, bounds.left),
            Math.min(win.innerWidth, bounds.right),
          ) * ratio;
        const before = board.scrollLeft;
        if (dx && board.scrollWidth > board.clientWidth) board.scrollLeft += dx;
        changed = board.scrollLeft !== before;
      }
      let scrolledY = false;
      if (
        current.x >= Math.max(0, bounds.left) - 24 &&
        current.x <= Math.min(win.innerWidth, bounds.right) + 24
      ) {
        for (const parent of current.scrollParents) {
          if (parent.scrollHeight <= parent.clientHeight + 1) continue;
          const rect = parent.getBoundingClientRect();
          const dy =
            edgeSpeed(
              current.y,
              Math.max(0, rect.top),
              Math.min(win.innerHeight, rect.bottom),
            ) * ratio;
          const before = parent.scrollTop;
          if (dy) parent.scrollTop += dy;
          if (parent.scrollTop !== before) {
            changed = scrolledY = true;
            break;
          }
        }
        if (!scrolledY) {
          const root = board.ownerDocument.scrollingElement;
          const dy = edgeSpeed(current.y, 0, win.innerHeight) * ratio;
          const before = root?.scrollTop;
          if (root && dy) root.scrollTop += dy;
          if (root && root.scrollTop !== before) changed = true;
        }
      }
      if (changed) publishPoint(current);
      animation.current = win.requestAnimationFrame(autoScroll);
    }
    function start(applicationId, card, point, inputType, touchId = null) {
      const board = boardRef.current;
      const column = card?.closest("[data-stage]");
      if (
        !callbacks.current.enabled ||
        !board ||
        !card ||
        !board.contains(card) ||
        !column ||
        !board.contains(column) ||
        !applicationId ||
        !column.dataset.stage ||
        card.getAttribute("draggable") !== "true" ||
        card.dataset.dragDisabled === "true"
      )
        return false;
      session.current = {
        applicationId,
        card,
        fromStage: column.dataset.stage,
        toStage: null,
        ...point,
        inputType,
        touchId,
        scrollParents: verticalParents(board),
      };
      sourceHighlight.current = card;
      card.setAttribute("data-dragging", "true");
      board.setAttribute("data-drag-active", "true");
      const body = board.ownerDocument.body;
      const previous = {
        userSelect: body.style.userSelect,
        webkitUserSelect: body.style.webkitUserSelect,
      };
      body.style.userSelect = "none";
      body.style.webkitUserSelect = "none";
      restoreStyles.current = () => {
        body.style.userSelect = previous.userSelect;
        body.style.webkitUserSelect = previous.webkitUserSelect;
      };
      publishPoint(point);
      animation.current =
        board.ownerDocument.defaultView.requestAnimationFrame(autoScroll);
      return true;
    }
    function observeCancellation(doc) {
      listen(
        doc,
        "keydown",
        (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            end("escape");
          }
        },
        true,
      );
      listen(doc.defaultView, "blur", () => end("blur"));
      listen(doc, "visibilitychange", () => {
        if (doc.visibilityState === "hidden") end("hidden");
      });
      listen(
        doc,
        "pointercancel",
        (event) => {
          // Native HTML dragging cancels its mouse/pen pointer stream on start.
          // That handoff is not a cancelled drag; dragend owns its termination.
          if (
            session.current?.inputType === "mouse" &&
            ["mouse", "pen"].includes(event.pointerType)
          )
            return;
          end("pointercancel");
        },
        true,
      );
    }
    function touchStart(event) {
      if (
        !callbacks.current.enabled ||
        session.current ||
        pending.current ||
        event.touches.length !== 1
      )
        return;
      const board = boardRef.current,
        target = asElement(event.target),
        card = target?.closest("[data-application-id]");
      if (
        !board ||
        !card ||
        !board.contains(card) ||
        card.getAttribute("draggable") !== "true" ||
        blocksDrag(target, card) ||
        card.dataset.dragDisabled === "true"
      )
        return;
      const column = card.closest("[data-stage]");
      if (!column || !board.contains(column) || !column.dataset.stage) return;
      const touch = event.touches[0],
        doc = board.ownerDocument;
      const initial = {
        card,
        applicationId: card.dataset.applicationId,
        touchId: touch.identifier,
        ...pointOf(touch),
        timer: 0,
      };
      pending.current = initial;
      observeCancellation(doc);
      const beforeHoldMove = (moveEvent) => {
        if (!pending.current) return;
        const point = touchById(moveEvent.touches, initial.touchId);
        if (
          !point ||
          moveEvent.touches.length !== 1 ||
          Math.hypot(point.clientX - initial.x, point.clientY - initial.y) >
            MOVE_SLOP
        )
          end("scroll");
      };
      listen(doc, "touchmove", beforeHoldMove, {
        passive: true,
        capture: true,
      });
      listen(
        doc,
        "touchstart",
        (next) => {
          if (next.touches.length > 1) end("multitouch");
        },
        { passive: true, capture: true },
      );
      listen(doc, "touchcancel", () => end("touchcancel"), {
        passive: true,
        capture: true,
      });
      listen(
        doc,
        "touchend",
        (endEvent) => {
          if (touchById(endEvent.touches, initial.touchId)) return;
          const touch = touchById(endEvent.changedTouches, initial.touchId);
          if (session.current && touch) publishPoint(pointOf(touch));
          end("outside", Boolean(session.current));
        },
        { passive: true, capture: true },
      );
      initial.timer = setTimeout(() => {
        if (
          pending.current !== initial ||
          !card.isConnected ||
          !callbacks.current.enabled
        ) {
          end("cancel");
          return;
        }
        pending.current = null;
        doc.removeEventListener("touchmove", beforeHoldMove, true);
        if (
          !start(initial.applicationId, card, initial, "touch", initial.touchId)
        ) {
          end("cancel");
          return;
        }
        // Install a cancelable move listener only after a stationary long press.
        // Before this point all touch listeners are passive, so normal scrolling wins.
        listen(
          doc,
          "touchmove",
          (moveEvent) => {
            const current = session.current;
            if (!current || current.inputType !== "touch") return;
            const touch = touchById(moveEvent.touches, current.touchId);
            if (!touch || moveEvent.touches.length !== 1) {
              end("multitouch");
              return;
            }
            if (!moveEvent.cancelable) {
              end("scroll");
              return;
            }
            moveEvent.preventDefault();
            publishPoint(pointOf(touch));
          },
          { passive: false, capture: true },
        );
      }, HOLD_MS);
    }
    function nativeStart(event, applicationId) {
      const card = event.currentTarget;
      const origin = mouseOrigin.current;
      if (
        session.current ||
        pending.current ||
        !callbacks.current.enabled ||
        blocksDrag(event.target, card) ||
        (origin?.card === card && origin.blocked)
      ) {
        event.preventDefault();
        return;
      }
      cleanGesture();
      if (!start(applicationId, card, pointOf(event), "mouse")) {
        event.preventDefault();
        return;
      }
      try {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          "application/x-ecl-recruitment-application",
          applicationId,
        );
        event.dataTransfer.setData("text/plain", applicationId);
      } catch {
        /* Internal session identity remains authoritative if a browser restricts DataTransfer. */
      }
      const doc = card.ownerDocument;
      observeCancellation(doc);
      listen(
        doc,
        "dragover",
        (over) => {
          if (session.current?.inputType !== "mouse") return;
          publishPoint(pointOf(over));
          if (session.current?.toStage) {
            over.preventDefault();
            if (over.dataTransfer) over.dataTransfer.dropEffect = "move";
          } else if (over.dataTransfer) over.dataTransfer.dropEffect = "none";
        },
        true,
      );
      listen(
        doc,
        "drop",
        (drop) => {
          if (session.current?.inputType !== "mouse") return;
          drop.preventDefault();
          drop.stopPropagation();
          publishPoint(pointOf(drop));
          end("outside", true);
        },
        true,
      );
      listen(doc, "dragend", () => end("dragend"), true);
    }
    useEffect(() => {
      const board = boardRef.current;
      if (boundBoard.current === board) return;
      end("board-changed");
      detachBoard.current?.();
      detachBoard.current = null;
      boundBoard.current = board;
      if (!board) return;
      const doc = board.ownerDocument;
      const click = (event) => {
        const touch = suppressedTouch.current;
        const fromTouch = event.sourceCapabilities?.firesTouchEvents;
        const nearTouch = touch && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 32;
        if (touch && Date.now() < touch.until && event.detail !== 0 &&
            (fromTouch === true || (fromTouch == null && nearTouch))) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      };
      const contextMenu = (event) => {
        const card = session.current?.card || pending.current?.card;
        if (card && card.contains(asElement(event.target))) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      board.addEventListener("touchstart", touchStart, { passive: true });
      doc.addEventListener("click", click, true);
      doc.addEventListener("contextmenu", contextMenu, true);
      detachBoard.current = () => {
        board.removeEventListener("touchstart", touchStart);
        doc.removeEventListener("click", click, true);
        doc.removeEventListener("contextmenu", contextMenu, true);
      };
    });
    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
        end("unmount");
        detachBoard.current?.();
        detachBoard.current = null;
        boundBoard.current = null;
      };
    }, []);
    useEffect(() => {
      if (!enabled) end("disabled");
    }, [enabled]);
    return {
      boardRef,
      dragState,
      cardProps(applicationId) {
        return {
          "data-application-id": applicationId,
          "data-dragging":
            dragState?.applicationId === applicationId ? "true" : undefined,
          draggable: Boolean(enabled && applicationId),
          onPointerDownCapture: (event) => {
            if (event.pointerType === "mouse" || event.pointerType === "pen")
              mouseOrigin.current = {
                card: event.currentTarget,
                blocked:
                  event.button !== 0 ||
                  blocksDrag(event.target, event.currentTarget),
              };
          },
          onDragStart: (event) => nativeStart(event, applicationId),
          onDragEnd: () => end("dragend"),
        };
      },
    };
  };
}
