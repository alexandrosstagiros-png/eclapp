// Exercise recovered integration independently of bundled React/vendor code.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const integration = source.slice(
  source.indexOf("function detectMessenger("),
  source.indexOf("// End isolated messenger integration."),
);
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function fixture({
  search = "",
  hash = "",
  bridge,
  stored,
  phone,
  me,
  refresh,
} = {}) {
  const values = new Map(
    stored ? [["ecl.session.v2", JSON.stringify(stored)]] : [],
  );
  const localValues = new Map(phone ? [["ecl.login.phone.v1", phone]] : []);
  const scripts = [];
  const storage = (values) => ({
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  });
  const window = {
    location: { search, hash },
    WebApp: bridge,
    sessionStorage: storage(values),
    localStorage: storage(localValues),
    setTimeout,
    clearTimeout,
  };
  const document = {
    querySelector: () => null,
    createElement: () => {
      const events = {};
      return {
        events,
        setAttribute(key, value) {
          this[key] = value;
        },
        addEventListener(key, value) {
          events[key] = value;
        },
        removeEventListener(key) {
          delete events[key];
        },
      };
    },
    head: { appendChild: (script) => scripts.push(script) },
  };
  const exports = {};
  const el = {
    me: me || (async () => ({ id: "employee", role: "driver", grants: [] })),
    demoProfiles: async () => ({ enabled: false }),
    passwordLogin: async () => {
      throw new Error("not configured");
    },
    phoneHint: async () => ({ phone: null }),
    refreshDevice:
      refresh ||
      (async () => {
        throw new ApiError(401, "No remembered device");
      }),
  };
  const context = vm.createContext({
    window,
    document,
    URLSearchParams,
    Promise,
    JSON,
    Date,
    Number,
    Error,
    AbortController,
    exports,
    el,
    Ne: ApiError,
  });
  vm.runInContext(
    integration +
      "\nObject.assign(exports,{detectMessenger,loadMessengerSdk,restoreSession,rememberSession,forgetSession,normalizeLoginPhone,rememberedPhone,rememberPhone,phoneHintCanApply,messengerProvider,activateSession,deactivateSession,invalidateSessionWork,refreshAccessSession,resolveSessionToken,subscribeSession,withDeviceAuthLock,enterEmployeeAccount,returnToAdministrator,canRefreshToken});",
    context,
  );
  return { api: exports, window, scripts, values, localValues, context, el };
}
const session = () => ({
  accessToken: "session-placeholder",
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  actor: { id: "employee", role: "stale", grants: [] },
});
test("browser, Telegram and MAX launch detection", () => {
  const { api } = fixture();
  assert.equal(api.detectMessenger({ hash: "", search: "" }), "browser");
  assert.equal(
    api.detectMessenger({ hash: "#tgWebAppData=x", search: "?messenger=max" }),
    "telegram",
  );
  assert.equal(
    api.detectMessenger({
      hash: "#WebAppData=x&WebAppPlatform=ios",
      search: "",
    }),
    "max",
  );
  assert.equal(
    api.detectMessenger({ hash: "", search: "?messenger=max" }),
    "max",
  );
});
test("ordinary browser never depends on a messenger SDK", async () => {
  const { api, scripts } = fixture();
  assert.equal(await api.loadMessengerSdk(), null);
  assert.equal(scripts.length, 0);
});
test("MAX SDK loads once and does not load Telegram SDK", async () => {
  const { api, window, scripts } = fixture({ search: "?messenger=max" });
  const one = api.loadMessengerSdk();
  const two = api.loadMessengerSdk();
  assert.equal(one, two);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, "https://st.max.ru/js/max-web-app.js");
  window.WebApp = { initData: "launch" };
  scripts[0].events.load();
  assert.equal(await one, window.WebApp);
});
test("Telegram SDK still initializes its bridge", async () => {
  const { api, window, scripts } = fixture({ hash: "#tgWebAppData=x" });
  const promise = api.loadMessengerSdk();
  let ready = false;
  assert.equal(scripts[0].src, "https://telegram.org/js/telegram-web-app.js");
  window.Telegram = {
    WebApp: {
      ready() {
        ready = true;
      },
    },
  };
  scripts[0].events.load();
  await promise;
  assert.equal(ready, true);
});
test("phone normalization accepts formatting and RU prefixes; rejects malformed values", () => {
  const { api } = fixture();
  assert.equal(api.normalizeLoginPhone("+7 (900) 123-45-67"), "+79001234567");
  assert.equal(api.normalizeLoginPhone("8 900 123 45 67"), "+79001234567");
  assert.equal(api.normalizeLoginPhone("79001234567"), "+79001234567");
  assert.equal(api.normalizeLoginPhone("+44 20 7946 0123"), "+442079460123");
  for (const bad of [
    "+0 12345678",
    "+7",
    "7900abc4567",
    "++79001234567",
    "79001234567;",
  ])
    assert.equal(api.normalizeLoginPhone(bad), null);
});
test("remembered phone persists without storing credentials", () => {
  const { api, localValues } = fixture();
  api.rememberPhone("8 (900) 123-45-67");
  assert.equal(api.rememberedPhone(), "+79001234567");
  assert.deepEqual(
    [...localValues.entries()],
    [["ecl.login.phone.v1", "+79001234567"]],
  );
});
test("late contact reply cannot overwrite a manually edited phone", () => {
  const { api } = fixture();
  assert.equal(api.phoneHintCanApply("", ""), true);
  assert.equal(api.phoneHintCanApply("+79001234567", ""), false);
  assert.equal(api.phoneHintCanApply("+79001234568", "+79001234567"), false);
});
test("universal session restores in browser with server revalidation and no SDK", async () => {
  let calls = 0;
  const { api, scripts } = fixture({
    stored: { session: session() },
    me: async (token, signal) => {
      calls++;
      assert.equal(token, "session-placeholder");
      assert.ok(signal);
      return { id: "employee", role: "dispatcher", grants: ["fresh"] };
    },
  });
  const restored = await api.restoreSession();
  assert.equal(calls, 1);
  assert.equal(scripts.length, 0);
  assert.equal(restored.actor.role, "dispatcher");
});
test("MAX session restoration does not need initData or a working SDK", async () => {
  const { api, scripts } = fixture({
    search: "?messenger=max",
    stored: { session: session() },
  });
  assert.equal((await api.restoreSession()).actor.role, "driver");
  assert.equal(scripts.length, 0);
});
test("expired session is removed before requesting private data", async () => {
  const { api, values } = fixture({
    stored: { session: { ...session(), expiresAt: "2000-01-01" } },
    me: async () => assert.fail("must not call /me"),
  });
  assert.equal(await api.restoreSession(), null);
  assert.equal(values.size, 0);
});
test("network error preserves session for an explicit retry", async () => {
  const { api, values } = fixture({
    stored: { session: session() },
    me: async () => {
      throw new Error("offline");
    },
  });
  await assert.rejects(api.restoreSession(), /offline/);
  assert.equal(values.size, 1);
});
test("late stored-session validation cannot replace an accepted invitation account", async () => {
  for (const rejected of [false, true]) {
    let finish;
    let refreshCalls = 0;
    const f = fixture({
      stored: { session: session() },
      me: () => new Promise((resolve, reject) => {
        finish = () => rejected ? reject(new ApiError(401, "Old account revoked")) : resolve(session().actor);
      }),
      refresh: async () => { refreshCalls++; return session(); },
    });
    const pending = f.api.restoreSession();
    f.api.deactivateSession();
    f.api.activateSession({ ...session(), accessToken: "external-token", rememberedDevice: false,
      actor: { id: "external-recruiter", role: "external_recruiter" } });
    finish();
    await assert.rejects(pending, error => error.status === 409);
    assert.equal(JSON.parse(f.values.get("ecl.session.v2")).session.actor.id, "external-recruiter");
    assert.equal(refreshCalls, 0);
  }
});
test("opening and cancelling invitation invalidates old restore without losing the stored account", async () => {
  let finish;
  let calls = 0;
  const f = fixture({ stored: { session: session() }, me: () => {
    calls++;
    return calls === 1 ? new Promise(resolve => { finish = () => resolve(session().actor); }) : Promise.resolve(session().actor);
  } });
  const pending = f.api.restoreSession();
  f.api.invalidateSessionWork();
  assert.equal(JSON.parse(f.values.get("ecl.session.v2")).session.actor.id, "employee");
  assert.equal((await f.api.restoreSession()).actor.id, "employee");
  finish();
  await assert.rejects(pending, error => error.status === 409);
  assert.equal(JSON.parse(f.values.get("ecl.session.v2")).session.actor.id, "employee");
});
test("forget session removes old MAX credential cache too", () => {
  const { api, values } = fixture();
  values.set("ecl.max.session.v1", "old");
  api.rememberSession(session());
  assert.equal(values.has("ecl.max.session.v1"), false);
  api.forgetSession();
  assert.equal(values.size, 0);
});
test("password API sends exact password, cookie credentials and remember choice", async () => {
  const f = fixture();
  const calls = [];
  f.context.ze = async (...args) => {
    calls.push(args);
    return args[0] === "/auth/device-status"
      ? { rememberedDevice: true }
      : { ...session(), rememberedDevice: true };
  };
  const apiSource = source
    .slice(source.indexOf("const el = {"), source.indexOf("function Ye("))
    .replace("const el = {", "Object.assign(el, {")
    .replace(/};\s*$/, "});");
  vm.runInContext(apiSource, f.context);
  const result = await f.el.passwordLogin(
    "+79001234567",
    "  intentional spaces  ",
    true,
  );
  assert.equal(calls[0][0], "/auth/password");
  assert.equal(JSON.parse(calls[0][1].body).password, "  intentional spaces  ");
  assert.equal(JSON.parse(calls[0][1].body).rememberDevice, true);
  assert.equal(calls[0][1].credentials, "include");
  assert.equal(calls[1][0], "/auth/device-status");
  assert.equal(calls[1][1].headers["X-Session-Refresh"], "1");
  assert.equal(result.deviceCookieConfirmed, true);
});
function loginHarness() {
  const f = fixture({ phone: "+79001234567" });
  const hooks = [];
  let cursor = 0;
  const effects = [];
  const completed = [];
  f.context.h = {
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks))
        hooks[i] = typeof initial === "function" ? initial() : initial;
      return [
        hooks[i],
        (value) => {
          hooks[i] = typeof value === "function" ? value(hooks[i]) : value;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = { current: initial };
      return hooks[i];
    },
    useEffect(effect) {
      effects.push(effect);
    },
  };
  const jsx = (type, props) => ({ type, props });
  f.context.n = { jsx, jsxs: jsx };
  for (const name of ["ev", "Hc", "Rt", "Zp"]) f.context[name] = name;
  f.context.Wp = {};
  f.context.$a = (error) => error.message;
  vm.runInContext(
    source.slice(
      source.indexOf("function nj("),
      source.indexOf("function IssuedPasswordCard("),
    ) + "\nexports.renderLogin=nj;",
    f.context,
  );
  const render = () => {
    cursor = 0;
    effects.length = 0;
    return f.api.renderLogin({
      mode: "office",
      onSession: (...args) => completed.push(args),
      notice: "",
    });
  };
  const nodes = (tree) => {
    const result = [];
    function visit(node) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      result.push(node);
      visit(node.props?.children);
    }
    visit(tree);
    return result;
  };
  return { ...f, render, nodes, effects, completed };
}
test("phone/password form never auto-authenticates and submits exact user credential", async () => {
  const f = loginHarness();
  let logins = 0;
  f.el.passwordLogin = async (phone, password) => {
    logins++;
    assert.equal(phone, "+79001234567");
    assert.equal(password, "  password  ");
    return session();
  };
  let tree = f.render();
  for (const effect of [...f.effects]) effect();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(logins, 0);
  f.nodes(tree)
    .find((node) => node.props?.id === "login-password")
    .props.onChange({ target: { value: "  password  " } });
  tree = f.render();
  await f
    .nodes(tree)
    .find((node) => node.type === "form")
    .props.onSubmit({ preventDefault() {} });
  assert.equal(logins, 1);
  assert.equal(f.completed.length, 1);
});
test("invalid credentials render generic error and do not open the app", async () => {
  const f = loginHarness();
  f.el.passwordLogin = async () => {
    throw new ApiError(401, "private account detail");
  };
  let tree = f.render();
  f.nodes(tree)
    .find((node) => node.props?.id === "login-password")
    .props.onChange({ target: { value: "incorrect" } });
  tree = f.render();
  await f
    .nodes(tree)
    .find((node) => node.type === "form")
    .props.onSubmit({ preventDefault() {} });
  tree = f.render();
  assert.equal(f.completed.length, 0);
  const alert = f.nodes(tree).find((node) => node.props?.role === "alert");
  assert.match(alert.props.children, /Неверный телефон или пароль/);
  assert.doesNotMatch(alert.props.children, /private account/);
});
test("pending login disables credentials and prevents duplicate requests", async () => {
  const f = loginHarness();
  let resolve;
  let calls = 0;
  f.el.passwordLogin = () => {
    calls++;
    return new Promise((done) => {
      resolve = done;
    });
  };
  let tree = f.render();
  f.nodes(tree)
    .find((node) => node.props?.id === "login-password")
    .props.onChange({ target: { value: "password" } });
  tree = f.render();
  const submit = f.nodes(tree).find((node) => node.type === "form")
    .props.onSubmit;
  const first = submit({ preventDefault() {} });
  const second = submit({ preventDefault() {} });
  tree = f.render();
  assert.equal(
    f.nodes(tree).find((node) => node.props?.id === "login-phone").props
      .disabled,
    true,
  );
  assert.equal(
    f.nodes(tree).find((node) => node.props?.id === "login-password").props
      .disabled,
    true,
  );
  assert.equal(calls, 1);
  resolve(session());
  await Promise.all([first, second]);
});
function credentialCardHarness(clipboard) {
  const hooks = [];
  let cursor = 0;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports,
    n: { jsx, jsxs: jsx },
    navigator: { clipboard },
    ue: "field",
    qc: "employee",
    h: {
      useState(initial) {
        const i = cursor++;
        if (!(i in hooks)) hooks[i] = initial;
        return [
          hooks[i],
          (value) => {
            hooks[i] = value;
          },
        ];
      },
      useRef(initial) {
        const i = cursor++;
        if (!(i in hooks)) hooks[i] = { current: initial };
        return hooks[i];
      },
      useEffect() {},
    },
  };
  vm.runInNewContext(
    source.slice(
      source.indexOf("function IssuedPasswordCard("),
      source.indexOf("function tv("),
    ) + "\nexports.card=IssuedPasswordCard;",
    context,
  );
  const render = () => {
    cursor = 0;
    return exports.card({
      credential: { phone: "+79990000001", password: "synthetic-password" },
      onDone() {},
    });
  };
  const nodes = (tree) => {
    const out = [];
    function visit(node) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      out.push(node);
      visit(node.props?.children);
    }
    visit(tree);
    return out;
  };
  return { render, nodes };
}
test("issued credential can be copied with clear local confirmation", async () => {
  let copied = "";
  const f = credentialCardHarness({
    writeText: async (value) => {
      copied = value;
    },
  });
  await f
    .nodes(f.render())
    .find((node) => node.props?.children === "Скопировать данные для входа")
    .props.onClick();
  assert.equal(copied, "Телефон: +79990000001\nПароль: synthetic-password");
  assert.equal(
    f.nodes(f.render()).find((node) => node.props?.role === "status").props
      .children,
    "Данные для входа скопированы.",
  );
});
test("blocked clipboard exposes selectable manual copy text", async () => {
  const f = credentialCardHarness({
    writeText: async () => {
      throw new Error("permission denied");
    },
  });
  await f
    .nodes(f.render())
    .find((node) => node.props?.children === "Скопировать данные для входа")
    .props.onClick();
  const nodes = f.nodes(f.render());
  const manual = nodes.find((node) => node.type === "textarea");
  assert.ok(manual.props.readOnly);
  assert.equal(
    manual.props.value,
    "Телефон: +79990000001\nПароль: synthetic-password",
  );
  assert.match(
    nodes.find((node) => node.props?.role === "status").props.children,
    /копирование недоступно/,
  );
});
function issuePasswordHarness({ self = false, status } = {}) {
  const errors = [];
  const results = [];
  const selfResults = [];
  const employee = { id: self ? "admin" : "employee", canIssuePassword: true };
  const context = {
    exports: {},
    Y: employee,
    ne: false,
    passwordPhone: "+7 999 000 00 02",
    normalizeLoginPhone: fixture().api.normalizeLoginPhone,
    Ae: (message) => errors.push(message),
    la: async (task) => {
      try {
        return await task();
      } catch (error) {
        errors.push(error.message);
      }
    },
    Ye: async () => {
      if (status) throw new ApiError(status, "generic race conflict");
      return {
        userId: employee.id,
        phone: "+79990000002",
        password: "generated-once",
      };
    },
    Ne: ApiError,
    d: "admin-token",
    De: { current: true },
    Le: { current: false },
    c: { id: "admin" },
    onSelfPasswordReset: (value) => selfResults.push(value),
    setPasswordIssued: (value) => results.push(value),
    V() {},
    setPasswordPhone() {},
    b() {},
    encodeURIComponent,
  };
  vm.runInNewContext(
    source.slice(
      source.indexOf("  async function issueEmployeePassword("),
      source.indexOf(
        "  function $l($)",
        source.indexOf("  async function issueEmployeePassword("),
      ),
    ) + "\nexports.issue=issueEmployeePassword;",
    context,
  );
  return { ...context, errors, results, selfResults };
}
test("duplicate phone issuance has a phone-specific error, never a trip error", async () => {
  const f = issuePasswordHarness({ status: 409 });
  await f.exports.issue({ preventDefault() {} });
  assert.deepEqual(f.errors, [
    "Этот телефон уже используется другим сотрудником.",
  ]);
  assert.equal(f.results.length, 0);
});
test("self reset transfers one-time password to isolated result screen", async () => {
  const f = issuePasswordHarness({ self: true });
  await f.exports.issue({ preventDefault() {} });
  assert.equal(f.selfResults.length, 1);
  assert.equal(f.selfResults[0].password, "generated-once");
  assert.equal(f.results.length, 0);
});
test("missing access cache restores a remembered device without login or SDK", async () => {
  let calls = 0;
  const f = fixture({
    refresh: async () => {
      calls++;
      return { ...session(), rememberedDevice: true };
    },
  });
  const restored = await f.api.restoreSession();
  assert.equal(calls, 1);
  assert.equal(restored.actor.id, "employee");
  assert.equal(f.scripts.length, 0);
  assert.ok(f.values.has("ecl.session.v2"));
});
test("expired access is renewed when remembered cookie is valid", async () => {
  let calls = 0;
  const f = fixture({
    stored: {
      session: {
        ...session(),
        expiresAt: "2000-01-01",
        rememberedDevice: true,
      },
    },
    me: async () => assert.fail("expired cache must not call /me"),
    refresh: async () => {
      calls++;
      return { ...session(), accessToken: "renewed", rememberedDevice: true };
    },
  });
  assert.equal((await f.api.restoreSession()).accessToken, "renewed");
  assert.equal(calls, 1);
});
test("401 on cached access attempts one cookie renewal", async () => {
  let calls = 0;
  const f = fixture({
    stored: { session: { ...session(), rememberedDevice: true } },
    me: async () => {
      throw new ApiError(401, "access expired");
    },
    refresh: async () => {
      calls++;
      return { ...session(), accessToken: "renewed", rememberedDevice: true };
    },
  });
  assert.equal((await f.api.restoreSession()).accessToken, "renewed");
  assert.equal(calls, 1);
});
test("concurrent refresh callers share one request and upgrade old component token", async () => {
  let finish;
  let calls = 0;
  const f = fixture({
    refresh: async () => {
      calls++;
      await new Promise((resolve) => {
        finish = resolve;
      });
      return {
        ...session(),
        accessToken: "new-access",
        rememberedDevice: true,
      };
    },
  });
  f.api.activateSession({ ...session(), rememberedDevice: true });
  const one = f.api.refreshAccessSession();
  const two = f.api.refreshAccessSession();
  assert.equal(one, two);
  await new Promise((resolve) => setTimeout(resolve, 1));
  finish();
  await Promise.all([one, two]);
  assert.equal(calls, 1);
  assert.equal(f.api.resolveSessionToken("session-placeholder"), "new-access");
  assert.equal(f.localValues.size, 0, "coordination lease must not persist");
});
test("revoked remembered device is attempted once and clears cached access", async () => {
  let calls = 0;
  const f = fixture({
    refresh: async () => {
      calls++;
      throw new ApiError(401, "revoked");
    },
  });
  f.api.activateSession({ ...session(), rememberedDevice: true });
  await assert.rejects(f.api.refreshAccessSession());
  await assert.rejects(f.api.refreshAccessSession());
  assert.equal(calls, 1);
  assert.equal(f.values.size, 0);
});
test("late refresh cannot replace a newly signed-in account", async () => {
  let finish;
  const f = fixture({
    refresh: async () => {
      await new Promise((resolve) => {
        finish = resolve;
      });
      return { ...session(), accessToken: "late", rememberedDevice: true };
    },
  });
  f.api.activateSession({ ...session(), rememberedDevice: true });
  const pending = f.api.refreshAccessSession();
  await new Promise((resolve) => setTimeout(resolve, 1));
  f.api.deactivateSession();
  f.api.activateSession({
    ...session(),
    accessToken: "other-account",
    actor: { id: "other", role: "driver" },
    rememberedDevice: true,
  });
  finish();
  await assert.rejects(pending);
  assert.equal(
    JSON.parse(f.values.get("ecl.session.v2")).session.actor.id,
    "other",
  );
});
test("invitation acceptance waits for old cookie refresh before clearing remembered login", async () => {
  const order = [];
  let finish;
  const f = fixture({ refresh: async () => {
    order.push("refresh-start");
    await new Promise(resolve => { finish = resolve; });
    order.push("refresh-cookie");
    return { ...session(), rememberedDevice: true };
  } });
  let invitationRequest;
  Object.assign(f.context, { h: {}, createRecruitmentInvitationPanel: (react, dependencies) => {
    invitationRequest = dependencies.request;
    return {};
  }, ze: async path => { order.push("accept-clear-cookie"); return { path }; } });
  const invitationFactory = source.indexOf("const RecruitmentInvitationPanel =");
  vm.runInContext(source.slice(invitationFactory, source.indexOf("\n});", invitationFactory) + 4), f.context);
  f.api.activateSession({ ...session(), rememberedDevice: true });
  const refreshed = f.api.refreshAccessSession();
  await new Promise(resolve => setTimeout(resolve, 1));
  const accepted = invitationRequest("/recruitment-invitations/accept", { method: "POST" });
  await new Promise(resolve => setTimeout(resolve, 1));
  assert.deepEqual(order, ["refresh-start"]);
  finish();
  await Promise.all([refreshed, accepted]);
  assert.deepEqual(order, ["refresh-start", "refresh-cookie", "accept-clear-cookie"]);
});
test("a different account cookie never silently retries an old account action", async () => {
  const f = fixture({
    refresh: async () => ({
      ...session(),
      actor: { id: "another" },
      rememberedDevice: true,
    }),
  });
  f.api.activateSession({ ...session(), rememberedDevice: true });
  await assert.rejects(
    f.api.refreshAccessSession(),
    /Сохранённый вход изменился/,
  );
  assert.equal(f.values.size, 0);
});
test("remember-device opt-out does not refresh expired access", async () => {
  const f = fixture({
    stored: {
      session: {
        ...session(),
        expiresAt: "2000-01-01",
        rememberedDevice: false,
      },
    },
    refresh: async () => assert.fail("opt-out must not refresh"),
  });
  assert.equal(await f.api.restoreSession(), null);
});
test("network refresh error keeps current access available for retry", async () => {
  let calls = 0;
  const f = fixture({
    refresh: async () => {
      if (++calls === 1) throw new ApiError(0, "offline");
      return {
        ...session(),
        accessToken: "retry-token",
        rememberedDevice: true,
      };
    },
  });
  f.api.activateSession({ ...session(), rememberedDevice: true });
  await assert.rejects(f.api.refreshAccessSession(), /offline/);
  assert.equal(f.values.size, 1);
  assert.equal((await f.api.refreshAccessSession()).accessToken, "retry-token");
});
test("protected API request retries once with renewed access and preserves body", async () => {
  const calls = [];
  const f = fixture({
    refresh: async () => ({
      ...session(),
      accessToken: "renewed",
      rememberedDevice: true,
    }),
  });
  Object.assign(f.context, {
    Headers,
    FormData,
    DOMException,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { status: calls.length === 1 ? 401 : 200 };
    },
  });
  vm.runInContext(
    source.slice(
      source.indexOf("async function authenticatedFetch("),
      source.indexOf("async function ze("),
    ) + "\nexports.authenticatedFetch=authenticatedFetch;",
    f.context,
  );
  f.api.activateSession({ ...session(), rememberedDevice: true });
  assert.equal(
    (
      await f.api.authenticatedFetch(
        "/planning/test",
        { method: "POST", body: '{"version":1}' },
        "session-placeholder",
      )
    ).status,
    200,
  );
  assert.equal(calls.length, 2);
  assert.equal(
    calls[0].options.headers.get("Authorization"),
    "Bearer session-placeholder",
  );
  assert.equal(calls[1].options.headers.get("Authorization"), "Bearer renewed");
  assert.equal(calls[1].options.body, '{"version":1}');
  assert.equal(calls[1].options.credentials, "omit");
});
test("notification status never calls linked-only MAX ready before bot start", () => {
  const f = fixture();
  vm.runInContext(
    source.slice(
      source.indexOf("const maxNotificationLinkRequests"),
      source.indexOf("function NotificationComposer("),
    ) + "\nObject.assign(exports,{maxNotificationState,linkMaxNotifications});",
    f.context,
  );
  assert.match(
    f.api.maxNotificationState({
      enabled: true,
      maxLinked: true,
      botStarted: false,
    }).title,
    /запустить бота/,
  );
  assert.match(
    f.api.maxNotificationState({
      enabled: false,
      maxLinked: true,
      botStarted: true,
    }).title,
    /выключена/,
  );
  assert.match(
    f.api.maxNotificationState({
      enabled: true,
      maxLinked: true,
      botStarted: true,
      muted: true,
    }).title,
    /выключены/,
  );
  assert.equal(
    f.api.maxNotificationState({
      enabled: true,
      maxLinked: true,
      botStarted: true,
      muted: false,
    }).tone,
    "ready",
  );
});
test("MAX linking is deduplicated per authenticated account and signed launch", async () => {
  const f = fixture();
  let calls = 0;
  f.context.ze = async (path, options, token, allowRefresh) => {
    calls++;
    assert.equal(path, "/notifications/max/link");
    assert.equal(JSON.parse(options.body).initData, "hash=abc&user=synthetic");
    assert.equal(allowRefresh, false);
    return { maxLinked: true };
  };
  vm.runInContext(
    source.slice(
      source.indexOf("const maxNotificationLinkRequests"),
      source.indexOf("function NotificationComposer("),
    ) + "\nexports.linkMaxNotifications=linkMaxNotifications;",
    f.context,
  );
  const one = f.api.linkMaxNotifications(
    "token",
    "employee",
    "hash=abc&user=synthetic",
  );
  const two = f.api.linkMaxNotifications(
    "token",
    "employee",
    "hash=abc&user=synthetic",
  );
  assert.equal(one, two);
  await one;
  assert.equal(calls, 1);
});

function impersonationSessions() {
  const parent = {
    ...session(), accessToken: "admin-token", rememberedDevice: true,
    actor: { id: "administrator", role: "access_admin", displayName: "Admin", grants: [] },
  };
  const child = {
    ...session(), accessToken: "employee-token", rememberedDevice: false,
    actor: { id: "employee", role: "driver", displayName: "Employee", grants: [],
      impersonation: { administratorId: parent.actor.id, administratorDisplayName: "Admin", parentSessionId: "parent-session" } },
  };
  return { parent, child };
}
test("employee entry persists both sessions only in the tab and prohibits cookie refresh", async () => {
  const { parent, child } = impersonationSessions();
  const f = fixture({ refresh: async () => assert.fail("employee must never refresh with admin cookie") });
  f.context.ze = async (path, options, token, allowRefresh) => {
    assert.equal(path, "/auth/impersonate");
    assert.equal(token, parent.accessToken);
    assert.equal(JSON.parse(options.body).userId, child.actor.id);
    assert.equal(options.credentials, undefined);
    assert.equal(allowRefresh, false);
    return child;
  };
  f.api.activateSession(parent);
  await f.api.enterEmployeeAccount(child.actor.id);
  const stored = JSON.parse(f.values.get("ecl.session.v2"));
  assert.equal(stored.session.accessToken, child.accessToken);
  assert.equal(stored.administratorSession.accessToken, parent.accessToken);
  assert.equal(f.localValues.size, 0);
  // The impersonation marker must block refresh independently of the device flag.
  f.api.activateSession({ ...child, rememberedDevice: true });
  assert.equal(f.api.canRefreshToken(child.accessToken), false);
  await assert.rejects(f.api.refreshAccessSession(), error => error.status === 401);
  await assert.rejects(f.api.enterEmployeeAccount("another"), error => error.status === 403);
});
test("reloading employee session preserves verified parent and return revokes only child", async () => {
  const { parent, child } = impersonationSessions();
  const calls = [];
  const f = fixture({
    stored: { session: child, administratorSession: parent },
    me: async token => {
      calls.push(["me", token]);
      return token === child.accessToken ? child.actor : parent.actor;
    },
    refresh: async () => assert.fail("return must not consume administrator cookie"),
  });
  f.context.ze = async (path, options, token, allowRefresh) => {
    calls.push([path, token]);
    assert.equal(options.credentials, undefined);
    assert.equal(allowRefresh, false);
    return { ok: true };
  };
  assert.equal((await f.api.restoreSession()).actor.id, child.actor.id);
  assert.equal((await f.api.returnToAdministrator()).actor.id, parent.actor.id);
  assert.deepEqual(calls, [["me", child.accessToken], ["me", parent.accessToken], ["/auth/impersonate/stop", child.accessToken]]);
  const stored = JSON.parse(f.values.get("ecl.session.v2"));
  assert.equal(stored.session.accessToken, parent.accessToken);
  assert.equal(stored.administratorSession, null);
  // An old component may finish reporting its 401 after the workspace changed.
  assert.equal((await f.api.returnToAdministrator()).actor.id, parent.actor.id);
});
test("expired child restores administrator, revoked parent requires login and preserves phone", async () => {
  const { parent, child } = impersonationSessions();
  for (const parentRevoked of [false, true]) {
    const f = fixture({
      stored: { session: { ...child, expiresAt: "2000-01-01" }, administratorSession: parent },
      phone: "+79001234567",
      me: async token => {
        assert.equal(token, parent.accessToken);
        if (parentRevoked) throw new ApiError(401, "revoked");
        return parent.actor;
      },
      refresh: async () => assert.fail("expired impersonation must not refresh"),
    });
    f.context.ze = async path => {
      assert.equal(path, "/auth/impersonate/stop");
      throw new ApiError(401, "expired");
    };
    const result = await f.api.restoreSession();
    assert.equal(result?.actor.id ?? null, parentRevoked ? null : parent.actor.id);
    assert.equal(f.api.rememberedPhone(), "+79001234567");
    if (parentRevoked) assert.equal(f.values.size, 0);
  }
});
test("late failed return to administrator cannot sign out an accepted invitation account", async () => {
  const { parent, child } = impersonationSessions();
  let failParent;
  const f = fixture({ stored: { session: child, administratorSession: parent }, me: async token => {
    if (token === child.accessToken) return child.actor;
    return new Promise((resolve, reject) => { failParent = () => reject(new ApiError(401, "revoked")); });
  } });
  await f.api.restoreSession();
  const returning = f.api.returnToAdministrator();
  f.api.deactivateSession();
  f.api.activateSession({ ...session(), rememberedDevice: false, actor: { id: "external", role: "external_recruiter" } });
  failParent();
  await assert.rejects(returning, error => error.status === 409);
  assert.equal(JSON.parse(f.values.get("ecl.session.v2")).session.actor.id, "external");
});
test("rejected employee mutation is never replayed as administrator, including late responses", async () => {
  const { parent, child } = impersonationSessions();
  const calls = [];
  const f = fixture({
    stored: { session: child, administratorSession: parent },
    me: async token => token === child.accessToken ? child.actor : parent.actor,
    refresh: async () => assert.fail("employee action must never refresh"),
  });
  f.context.ze = async () => ({ ok: true });
  Object.assign(f.context, {
    Headers, FormData, DOMException,
    fetch: async (url, options) => {
      calls.push({ url, token: options.headers.get("Authorization") });
      return { status: 401 };
    },
  });
  vm.runInContext(source.slice(source.indexOf("async function authenticatedFetch("), source.indexOf("async function ze(")) + "\nexports.authenticatedFetch=authenticatedFetch;", f.context);
  await f.api.restoreSession();
  assert.equal((await f.api.authenticatedFetch("/planning/test", { method: "POST", body: '{"version":1}' }, child.accessToken)).status, 401);
  await f.api.returnToAdministrator();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].token, "Bearer employee-token");
  // A request retaining a child token must remain a child request after returning.
  await f.api.authenticatedFetch("/planning/test", { method: "POST" }, child.accessToken);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].token, "Bearer employee-token");
  assert.equal(JSON.parse(f.values.get("ecl.session.v2")).session.actor.id, parent.actor.id);
});
test("failed tab persistence cancels new child without losing the administrator", async () => {
  const { parent, child } = impersonationSessions();
  const f = fixture();
  const calls = [];
  f.context.ze = async (path, options, token) => {
    calls.push([path, token]);
    return path === "/auth/impersonate" ? child : { ok: true };
  };
  f.api.activateSession(parent);
  f.window.sessionStorage.setItem = () => { throw new Error("storage blocked"); };
  await assert.rejects(f.api.enterEmployeeAccount(child.actor.id), /хранение данных/);
  assert.deepEqual(calls, [["/auth/impersonate", parent.accessToken], ["/auth/impersonate/stop", child.accessToken]]);
  assert.equal(f.api.resolveSessionToken(parent.accessToken), parent.accessToken);
  assert.equal(JSON.parse(f.values.get("ecl.session.v2")).session.actor.id, parent.actor.id);
});
test("impersonated workspace never links administrator MAX identity or offers bot connection", async () => {
  const { child } = impersonationSessions();
  const f = fixture({ search: "?messenger=max", bridge: { initData: "admin-max-identity" } });
  const effects = [];
  const jsx = (type, props) => ({ type, props });
  let statusRequests = 0;
  Object.assign(f.context, {
    h: { useState: value => [value, () => {}], useRef: current => ({ current }), useEffect: fn => effects.push(fn) },
    n: { jsx, jsxs: jsx },
    maxNotificationState: () => ({ title: "Not connected", tone: "warning" }),
    linkMaxNotifications: async () => assert.fail("administrator MAX identity must never be linked to employee"),
    ze: async path => { assert.equal(path, "/notifications/status"); statusRequests++; return { maxLinked: false }; },
  });
  f.window.setInterval = () => 0;
  f.window.clearInterval = () => {};
  vm.runInContext(source.slice(source.indexOf("function MaxNotificationsPanel("), source.indexOf("function ij(")) + "\nexports.panel=MaxNotificationsPanel;", f.context);
  const tree = f.api.panel({ token: child.accessToken, actor: child.actor, session: child });
  const serialized = JSON.stringify(tree);
  assert.doesNotMatch(serialized, /Подключить уведомления MAX|Подключить через бота MAX|https:\/\/max.ru/);
  const cleanup = effects[0]();
  await Promise.resolve();
  await Promise.resolve();
  cleanup();
  assert.equal(statusRequests, 1);
});
