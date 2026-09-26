import { preparePhoto } from "./team-media.js";

export function formatProfileBirthday(profile) {
  if (profile?.birthDate) {
    const [year, month, day] = profile.birthDate.split("-");
    return `${day}.${month}.${year}`;
  }
  if (!profile?.birthdayMonth || !profile?.birthdayDay) return "";
  return new Date(Date.UTC(2000, profile.birthdayMonth - 1, profile.birthdayDay))
    .toLocaleDateString("ru-RU", { timeZone: "UTC", day: "numeric", month: "long" });
}

export async function compressProfilePhoto(file) {
  const prepared = await preparePhoto(file);
  if (prepared.kind !== "image")
    throw new Error(
      "Выберите обычную фотографию JPEG, PNG или WebP до 48 мегапикселей.",
    );
  const url = URL.createObjectURL(prepared.file),
    image = new Image();
  try {
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Сжатие фотографий недоступно в этом браузере.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 512, 512);
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.drawImage(
      image,
      (image.naturalWidth - size) / 2,
      (image.naturalHeight - size) / 2,
      size,
      size,
      0,
      0,
      512,
      512,
    );
    let blob;
    for (const quality of [0.82, 0.7, 0.58, 0.45]) {
      blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob?.size <= 128 * 1024) break;
    }
    if (!blob || blob.size > 128 * 1024)
      throw new Error("Не удалось сжать фотографию. Выберите другое фото.");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return {
      contentBase64: dataUrl.split(",")[1],
      dataUrl,
      byteSize: blob.size,
    };
  } finally {
    image.src = "";
    URL.revokeObjectURL(url);
  }
}

export function createProfileUI(React, { request }) {
  const { createElement: h, useState, useEffect, useRef } = React;
  let cacheToken,
    avatarCache = new Map();
  function avatarRequest(token, scopeId, userId, version) {
    if (cacheToken !== token) {
      avatarCache.clear();
      cacheToken = token;
    }
    const key = `${scopeId}:${userId}:${version}`;
    if (!avatarCache.has(key)) {
      const result = request(
        `/team/profiles/${encodeURIComponent(userId)}/avatar`,
        {},
        token,
      );
      avatarCache.set(key, result);
      result.catch(() => {
        if (avatarCache.get(key) === result) avatarCache.delete(key);
      });
    }
    return avatarCache.get(key);
  }
  const button = (label, onClick, props = {}) =>
    h(
      "button",
      { type: "button", className: "button", onClick, ...props },
      label,
    );
  const field = (label, node, hint) =>
    h(
      "label",
      { className: "profile-field" },
      h("span", null, label),
      React.cloneElement(node, { "aria-label": label }),
      hint && h("small", null, hint),
    );
  function ProfileAvatar({
    token,
    scopeId,
    userId,
    avatarVersion,
    name = "",
    onClick,
  }) {
    const [photo, setPhoto] = useState(null);
    useEffect(() => {
      let active = true;
      setPhoto(null);
      if (avatarVersion)
        avatarRequest(token, scopeId, userId, avatarVersion)
          .then((value) => {
            if (active) setPhoto(value.avatarDataUrl);
          })
          .catch(() => {});
      return () => {
        active = false;
      };
    }, [token, scopeId, userId, avatarVersion]);
    return h(
      onClick ? "button" : "span",
      {
        className: "profile-avatar team-avatar",
        ...(onClick
          ? { type: "button", onClick, "aria-label": `Профиль: ${name}` }
          : { "aria-hidden": true }),
      },
      photo
        ? h("img", { src: photo, alt: "" })
        : name.trim().slice(0, 1).toUpperCase(),
    );
  }
  function ProfileCard({ token, scopeId, userId, name, onClose, onExpired }) {
    const [profile, setProfile] = useState(null),
      [error, setError] = useState("");
    const closeRef = useRef(null);
    useEffect(() => {
      const previous = document.activeElement;
      closeRef.current?.focus();
      const escape = (e) => {
        if (e.key === "Escape") { e.preventDefault(); onClose(); }
        if (e.key === "Tab") { e.preventDefault(); closeRef.current?.focus(); }
      };
      document.addEventListener("keydown", escape);
      return () => {
        document.removeEventListener("keydown", escape);
        previous?.focus?.();
      };
    }, []);
    useEffect(() => {
      const c = new AbortController();
      let inFlight = false;
      setProfile(null);
      setError("");
      const update = async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          const value = await request(
            `/team/profiles/${encodeURIComponent(userId)}`,
            { signal: c.signal },
            token,
          );
          if (!c.signal.aborted) {
            setProfile(value);
            setError("");
          }
        } catch (reason) {
          if (!c.signal.aborted) {
            setProfile(null);
            setError(
              reason.status === 403 || reason.status === 404
                ? "Контакты недоступны с вашими правами."
                : reason.message,
            );
            if (reason.status === 401) onExpired?.();
          }
        } finally {
          inFlight = false;
        }
      };
      update();
      const timer = setInterval(update, 15000);
      return () => {
        c.abort();
        clearInterval(timer);
      };
    }, [token, scopeId, userId]);
    return h(
      "div",
      {
        className: "profile-modal-backdrop",
        onClick: (e) => {
          if (e.target === e.currentTarget) onClose();
        },
      },
      h(
        "section",
        {
          className: "profile-card",
          role: "dialog",
          "aria-modal": true,
          "aria-label": "Профиль сотрудника",
        },
        h(
          "header",
          null,
          h("h2", null, name),
          button("Закрыть", onClose, { ref: closeRef }),
        ),
        error
          ? h("p", { role: "alert" }, error)
          : !profile
            ? h("p", null, "Загружаем профиль…")
            : h(
                React.Fragment,
                null,
                profile.avatarDataUrl &&
                  h("img", {
                    className: "profile-photo",
                    src: profile.avatarDataUrl,
                    alt: `Фото ${name}`,
                  }),
                h(
                  "dl",
                  null,
                  ...[
                    ["Почта", profile.email],
                    ["Телефон", profile.phone],
                    ["Контакты", profile.contacts],
                    [
                      "Дата рождения",
                      formatProfileBirthday(profile),
                    ],
                  ].flatMap(([label, value]) => [
                    h("dt", { key: label }, label),
                    h("dd", { key: label + "value" }, value || "Не указано"),
                  ]),
                ),
              ),
      ),
    );
  }
  function ProfileAccountButton({ token, actor, onClick }) {
    const [photo, setPhoto] = useState(null);
    useEffect(() => {
      let active = true;
      const refresh = () =>
        request("/profile", {}, token)
          .then((value) => {
            if (active) setPhoto(value.avatarDataUrl);
          })
          .catch(() => {
            if (active) setPhoto(null);
          });
      setPhoto(null);
      refresh();
      window.addEventListener("profile-updated", refresh);
      return () => {
        active = false;
        window.removeEventListener("profile-updated", refresh);
      };
    }, [token, actor.id]);
    return h(
      "button",
      {
        type: "button",
        className: "avatar profile-account-button",
        onClick,
        title: "Настройки профиля",
        "aria-label": "Настройки профиля",
      },
      photo
        ? h("img", { src: photo, alt: "" })
        : actor.displayName.trim().slice(0, 1).toUpperCase(),
    );
  }
  function ProfileSettings({
    token,
    actor,
    onExpired,
    onDirtyChange,
    canTeam,
  }) {
    const canEditBirthDate = actor.role === "access_admin" && !actor.impersonation;
    const [form, setForm] = useState(null),
      [original, setOriginal] = useState(null),
      [photo, setPhoto] = useState(undefined),
      [photoPreview, setPhotoPreview] = useState(null),
      [error, setError] = useState(""),
      [notice, setNotice] = useState(""),
      [busy, setBusy] = useState(false),
      [prefs, setPrefs] = useState(null),
      [birthdayLabel, setBirthdayLabel] = useState("");
    const operation = useRef(crypto.randomUUID()),
      callbacks = useRef({ onExpired, onDirtyChange }),
      alive = useRef(true),
      dirtyRef = useRef(false),
      formRef = useRef(null);
    callbacks.current = { onExpired, onDirtyChange };
    const dirty = Boolean(
      form &&
        (JSON.stringify(form) !== JSON.stringify(original) ||
          photo !== undefined),
    );
    dirtyRef.current = dirty;
    formRef.current = form;
    const fail = (reason) => {
      if (reason.status === 401) callbacks.current.onExpired?.();
      setError(reason.message || "Не удалось сохранить изменения.");
    };
    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
        callbacks.current.onDirtyChange?.(false);
      };
    }, []);
    useEffect(() => {
      callbacks.current.onDirtyChange?.(dirty || busy);
      const stop = (e) => {
        if (dirty || busy) {
          e.preventDefault();
          e.returnValue = "";
        }
      };
      window.addEventListener("beforeunload", stop);
      return () => window.removeEventListener("beforeunload", stop);
    }, [dirty, busy]);
    function apply(value) {
      if ((value.version || 0) < (formRef.current?.version || 0)) return;
      const fields = {
        version: value.version || 0,
        email: value.email || "",
        phone: value.phone || "",
        contacts: value.contacts || "",
        ...(canEditBirthDate ? { birthDate: value.birthDate || "" } : {}),
      };
      setBirthdayLabel(formatProfileBirthday(value));
      setForm(fields);
      setOriginal(fields);
      setPhoto(undefined);
      setPhotoPreview(value.avatarDataUrl || null);
      operation.current = crypto.randomUUID();
    }
    useEffect(() => {
      const c = new AbortController();
      request("/profile", { signal: c.signal }, token)
        .then((value) => {
          if (!c.signal.aborted) {
            if (!dirtyRef.current) apply(value);
            else if (value.version !== formRef.current?.version)
              setError(
                "Профиль изменён в другой сессии. Ваш черновик сохранён; отмените изменения, чтобы загрузить актуальную версию.",
              );
          }
        })
        .catch((e) => {
          if (!c.signal.aborted) fail(e);
        });
      if (canTeam)
        request("/team/notification-preferences", { signal: c.signal }, token)
          .then((value) => {
            if (!c.signal.aborted) setPrefs(value);
          })
          .catch((e) => {
            if (!c.signal.aborted) fail(e);
          });
      return () => c.abort();
    }, [token, actor.id, canTeam, canEditBirthDate]);
    function change(key, value) {
      setForm((prev) => ({ ...prev, [key]: value }));
      operation.current = crypto.randomUUID();
      setNotice("");
    }
    async function choosePhoto(event) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      setBusy(true);
      setError("");
      try {
        const result = await compressProfilePhoto(file);
        if (alive.current) {
          setPhoto({ contentBase64: result.contentBase64 });
          setPhotoPreview(result.dataUrl);
          operation.current = crypto.randomUUID();
          setNotice(
            `Фото сжато до ${Math.ceil(result.byteSize / 1024)} КБ, 512 × 512.`,
          );
        }
      } catch (e) {
        if (alive.current) fail(e);
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    async function save(event) {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        const result = await request(
          "/profile",
          {
            method: "PUT",
            body: JSON.stringify({
              ...form,
              photo,
              operationId: operation.current,
            }),
          },
          token,
        );
        if (alive.current) {
          apply(result);
          setNotice("Профиль сохранён.");
          avatarCache.clear();
          window.dispatchEvent(new Event("profile-updated"));
        }
      } catch (e) {
        if (alive.current) fail(e);
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    async function setPreference(key, value) {
      if (busy) return;
      const previous = prefs;
      setPrefs({ ...prefs, [key]: value });
      setBusy(true);
      setError("");
      try {
        const result = await request(
          "/team/notification-preferences",
          { method: "PUT", body: JSON.stringify({ ...prefs, [key]: value }) },
          token,
        );
        if (alive.current) {
          setPrefs(result);
          window.dispatchEvent(new Event("team-notifications-changed"));
        }
      } catch (e) {
        if (alive.current) {
          setPrefs(previous);
          fail(e);
        }
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    return h(
      "section",
      { className: "profile-settings" },
      h(
        "header",
        { className: "page-heading" },
        h(
          "div",
          null,
          h("span", { className: "eyebrow" }, "Личный кабинет"),
          h("h1", null, "Настройки"),
          h("p", null, "Ваш профиль и уведомления"),
        ),
      ),
      error && h("p", { className: "error", role: "alert" }, error),
      notice && h("p", { className: "team-notice", role: "status" }, notice),
      !form
        ? h("p", null, "Загружаем настройки…")
        : h(
            "div",
            { className: "profile-settings-grid" },
            h(
              "form",
              { className: "profile-panel", onSubmit: save },
              h("h2", null, "Профиль"),
              h(
                "div",
                { className: "profile-photo-editor" },
                photoPreview
                  ? h("img", {
                      className: "profile-photo",
                      src: photoPreview,
                      alt: "Фото профиля",
                    })
                  : h(
                      "span",
                      {
                        className: "profile-photo profile-placeholder",
                        "aria-hidden": true,
                      },
                      actor.displayName.slice(0, 1),
                    ),
                h(
                  "div",
                  null,
                  field(
                    "Загрузить фото",
                    h("input", {
                      type: "file",
                      accept: "image/jpeg,image/png,image/webp",
                      disabled: busy,
                      onChange: choosePhoto,
                    }),
                    "Фото автоматически сжимается и обрезается по центру.",
                  ),
                  photoPreview &&
                    button(
                      "Удалить фото",
                      () => {
                        setPhoto(null);
                        setPhotoPreview(null);
                        operation.current = crypto.randomUUID();
                      },
                      { disabled: busy },
                    ),
                ),
              ),
              h("p", { className: "profile-name" }, actor.displayName),
              field(
                "Почта",
                h("input", {
                  type: "email",
                  autoComplete: "email",
                  maxLength: 254,
                  value: form.email,
                  disabled: busy,
                  onChange: (e) => change("email", e.target.value),
                }),
              ),
              field(
                "Контактный телефон",
                h("input", {
                  type: "tel",
                  autoComplete: "tel",
                  maxLength: 64,
                  value: form.phone,
                  disabled: busy,
                  onChange: (e) => change("phone", e.target.value),
                }),
                "Номер для входа в приложение не меняется.",
              ),
              field(
                "Дополнительные контакты",
                h("textarea", {
                  rows: 3,
                  maxLength: 2000,
                  value: form.contacts,
                  disabled: busy,
                  onChange: (e) => change("contacts", e.target.value),
                  placeholder: "Рабочий мессенджер, добавочный номер…",
                }),
              ),
              canEditBirthDate ? field(
                "Дата рождения",
                h("input", {
                  type: "date",
                  min: "1900-01-01",
                  max: new Date().toISOString().slice(0, 10),
                  value: form.birthDate,
                  disabled: busy,
                  onChange: (e) => change("birthDate", e.target.value),
                }),
                "Полная дата рождения видна только администратору. Остальным — день и месяц.",
              ) : h("div", { className: "profile-field profile-birthday-readonly" },
                h("span", null, "Дата рождения"),
                h("p", { "aria-label": "Дата рождения" }, birthdayLabel || "Не указано"),
                h("small", null, "Полная дата рождения видна только администратору. Остальным — день и месяц.")),
              h(
                "div",
                { className: "team-actions" },
                h(
                  "button",
                  {
                    type: "submit",
                    className: "button primary",
                    disabled: busy || !dirty,
                  },
                  busy ? "Сохраняем…" : "Сохранить профиль",
                ),
                button(
                  "Отменить изменения",
                  async () => {
                    if (
                      busy ||
                      (dirty &&
                        !window.confirm(
                          "Удалить несохранённые изменения профиля?",
                        ))
                    )
                      return;
                    setBusy(true);
                    try {
                      const value = await request("/profile", {}, token);
                      if (alive.current) {
                        apply(value);
                        setError("");
                        setNotice("");
                      }
                    } catch (e) {
                      if (alive.current) fail(e);
                    } finally {
                      if (alive.current) setBusy(false);
                    }
                  },
                  { disabled: busy || !dirty },
                ),
              ),
            ),
            canTeam &&
              h(
                "section",
                { className: "profile-panel" },
                h("h2", null, "Уведомления команды"),
                h(
                  "p",
                  null,
                  "Упоминания вас и @всех всегда показываются и звучат. Счётчики непрочитанного остаются видны.",
                ),
                prefs
                  ? h(
                      React.Fragment,
                      null,
                      h(
                        "label",
                        { className: "profile-check" },
                        h("input", {
                          type: "checkbox",
                          checked: prefs.muteNotifications,
                          disabled: busy,
                          onChange: (e) =>
                            setPreference(
                              "muteNotifications",
                              e.target.checked,
                            ),
                        }),
                        "Скрыть обычные уведомления",
                      ),
                      h(
                        "label",
                        { className: "profile-check" },
                        h("input", {
                          type: "checkbox",
                          checked: prefs.muteSound,
                          disabled: busy,
                          onChange: (e) =>
                            setPreference("muteSound", e.target.checked),
                        }),
                        "Отключить звук обычных сообщений",
                      ),
                      h(
                        "p",
                        { className: "team-muted" },
                        "Для отдельного чата откройте «Уведомления» в его заголовке. Уведомления работают, пока приложение открыто; звук доступен после первого действия в нём.",
                      ),
                    )
                  : h("p", null, "Загружаем настройки уведомлений…"),
              ),
          ),
    );
  }
  return { ProfileSettings, ProfileAvatar, ProfileCard, ProfileAccountButton };
}
