import { createPlanningPanel } from "./planning.js";
import { createRecruitmentPanel, createRecruitmentReminder, createRecruitmentInvitationPanel } from "./recruitment.js";
import { createTendersWorkspace } from "./tenders.js";
import { createDevelopmentWorkspace } from "./development.js";
import { createDriverRequests } from "./driver-requests.js";
import { createTeamWorkspace, createNeuralSummary } from "./team.js";
import { createNeuralWorkspace } from "./neural.js";
import { createFinanceLedgerWorkspace } from "./finance-ledger.js";
import { createTeamTasks } from "./team-tasks.js";
import { createTeamOutcomes } from "./team-outcomes.js";
import { createProfileUI } from "./profile.js";
import { createBirthdaysUI } from "./birthdays.js";
import { createTeamNotificationCenter } from "./team-notifications.js";
import { createFleetMaintenanceWorkspace, createWorkOrderPriceAnalysis } from "./fleet-maintenance.js";
import { createFleetOperationsWorkspace } from "./fleet-operations.js";
import { createAttachmentPhotos } from "./attachment-photos.js";
import { createRecruitmentOnboarding } from "./recruitment-onboarding.js";
import { createInspectionWorkflow, correctionDraft, isCurrentInspectionDraft, inspectionChanged } from "./inspection-workflow.js";
import { createChiefMechanicAccess } from "./chief-mechanic-access.js";
import { createEmployeePlanningAccess } from "./employee-planning-access.js";

(function () {
  const d = document.createElement("link").relList;
  if (d && d.supports && d.supports("modulepreload")) return;
  for (const g of document.querySelectorAll('link[rel="modulepreload"]')) r(g);
  new MutationObserver((g) => {
    for (const p of g)
      if (p.type === "childList")
        for (const b of p.addedNodes)
          b.tagName === "LINK" && b.rel === "modulepreload" && r(b);
  }).observe(document, { childList: !0, subtree: !0 });
  function f(g) {
    const p = {};
    return (
      g.integrity && (p.integrity = g.integrity),
      g.referrerPolicy && (p.referrerPolicy = g.referrerPolicy),
      g.crossOrigin === "use-credentials"
        ? (p.credentials = "include")
        : g.crossOrigin === "anonymous"
          ? (p.credentials = "omit")
          : (p.credentials = "same-origin"),
      p
    );
  }
  function r(g) {
    if (g.ep) return;
    g.ep = !0;
    const p = f(g);
    fetch(g.href, p);
  }
})();
var No = { exports: {} },
  Gs = {};
var jp;
function Yy() {
  if (jp) return Gs;
  jp = 1;
  var c = Symbol.for("react.transitional.element"),
    d = Symbol.for("react.fragment");
  function f(r, g, p) {
    var b = null;
    if (
      (p !== void 0 && (b = "" + p),
      g.key !== void 0 && (b = "" + g.key),
      "key" in g)
    ) {
      p = {};
      for (var D in g) D !== "key" && (p[D] = g[D]);
    } else p = g;
    return (
      (g = p.ref),
      { $$typeof: c, type: r, key: b, ref: g !== void 0 ? g : null, props: p }
    );
  }
  return ((Gs.Fragment = d), (Gs.jsx = f), (Gs.jsxs = f), Gs);
}
var bp;
function Vy() {
  return (bp || ((bp = 1), (No.exports = Yy())), No.exports);
}
var n = Vy(),
  So = { exports: {} },
  Re = {};
var Np;
function Gy() {
  if (Np) return Re;
  Np = 1;
  var c = Symbol.for("react.transitional.element"),
    d = Symbol.for("react.portal"),
    f = Symbol.for("react.fragment"),
    r = Symbol.for("react.strict_mode"),
    g = Symbol.for("react.profiler"),
    p = Symbol.for("react.consumer"),
    b = Symbol.for("react.context"),
    D = Symbol.for("react.forward_ref"),
    J = Symbol.for("react.suspense"),
    j = Symbol.for("react.memo"),
    U = Symbol.for("react.lazy"),
    y = Symbol.for("react.activity"),
    L = Symbol.for("react.view_transition"),
    M = Symbol.iterator;
  function ee(v) {
    return v === null || typeof v != "object"
      ? null
      : ((v = (M && v[M]) || v["@@iterator"]),
        typeof v == "function" ? v : null);
  }
  var te = {
      isMounted: function () {
        return !1;
      },
      enqueueForceUpdate: function () {},
      enqueueReplaceState: function () {},
      enqueueSetState: function () {},
    },
    R = Object.assign,
    re = {};
  function le(v, m, S) {
    ((this.props = v),
      (this.context = m),
      (this.refs = re),
      (this.updater = S || te));
  }
  ((le.prototype.isReactComponent = {}),
    (le.prototype.setState = function (v, m) {
      if (typeof v != "object" && typeof v != "function" && v != null)
        throw Error(
          "takes an object of state variables to update or a function which returns an object of state variables.",
        );
      this.updater.enqueueSetState(this, v, m, "setState");
    }),
    (le.prototype.forceUpdate = function (v) {
      this.updater.enqueueForceUpdate(this, v, "forceUpdate");
    }));
  function K() {}
  K.prototype = le.prototype;
  function I(v, m, S) {
    ((this.props = v),
      (this.context = m),
      (this.refs = re),
      (this.updater = S || te));
  }
  var k = (I.prototype = new K());
  ((k.constructor = I), R(k, le.prototype), (k.isPureReactComponent = !0));
  var Z = Array.isArray;
  function G() {}
  var E = { H: null, A: null, T: null, S: null },
    se = Object.prototype.hasOwnProperty;
  function P(v, m, S) {
    var _ = S.ref;
    return {
      $$typeof: c,
      type: v,
      key: m,
      ref: _ !== void 0 ? _ : null,
      props: S,
    };
  }
  function H(v, m) {
    return P(v.type, m, v.props);
  }
  function fe(v) {
    return typeof v == "object" && v !== null && v.$$typeof === c;
  }
  function Y(v) {
    var m = { "=": "=0", ":": "=2" };
    return (
      "$" +
      v.replace(/[=:]/g, function (S) {
        return m[S];
      })
    );
  }
  var xe = /\/+/g;
  function ae(v, m) {
    return typeof v == "object" && v !== null && v.key != null
      ? Y("" + v.key)
      : m.toString(36);
  }
  function V(v) {
    switch (v.status) {
      case "fulfilled":
        return v.value;
      case "rejected":
        throw v.reason;
      default:
        switch (
          (typeof v.status == "string"
            ? v.then(G, G)
            : ((v.status = "pending"),
              v.then(
                function (m) {
                  v.status === "pending" &&
                    ((v.status = "fulfilled"), (v.value = m));
                },
                function (m) {
                  v.status === "pending" &&
                    ((v.status = "rejected"), (v.reason = m));
                },
              )),
          v.status)
        ) {
          case "fulfilled":
            return v.value;
          case "rejected":
            throw v.reason;
        }
    }
    throw v;
  }
  function W(v, m, S, _, ie) {
    var ye = typeof v;
    (ye === "undefined" || ye === "boolean") && (v = null);
    var Te = !1;
    if (v === null) Te = !0;
    else
      switch (ye) {
        case "bigint":
        case "string":
        case "number":
          Te = !0;
          break;
        case "object":
          switch (v.$$typeof) {
            case c:
            case d:
              Te = !0;
              break;
            case U:
              return ((Te = v._init), W(Te(v._payload), m, S, _, ie));
          }
      }
    if (Te)
      return (
        (ie = ie(v)),
        (Te = _ === "" ? "." + ae(v, 0) : _),
        Z(ie)
          ? ((S = ""),
            Te != null && (S = Te.replace(xe, "$&/") + "/"),
            W(ie, m, S, "", function (F) {
              return F;
            }))
          : ie != null &&
            (fe(ie) &&
              (ie = H(
                ie,
                S +
                  (ie.key == null || (v && v.key === ie.key)
                    ? ""
                    : ("" + ie.key).replace(xe, "$&/") + "/") +
                  Te,
              )),
            m.push(ie)),
        1
      );
    Te = 0;
    var ne = _ === "" ? "." : _ + ":";
    if (Z(v))
      for (var pe = 0; pe < v.length; pe++)
        ((_ = v[pe]), (ye = ne + ae(_, pe)), (Te += W(_, m, S, ye, ie)));
    else if (((pe = ee(v)), typeof pe == "function"))
      for (v = pe.call(v), pe = 0; !(_ = v.next()).done; )
        ((_ = _.value), (ye = ne + ae(_, pe++)), (Te += W(_, m, S, ye, ie)));
    else if (ye === "object") {
      if (typeof v.then == "function") return W(V(v), m, S, _, ie);
      throw (
        (m = String(v)),
        Error(
          "Objects are not valid as a React child (found: " +
            (m === "[object Object]"
              ? "object with keys {" + Object.keys(v).join(", ") + "}"
              : m) +
            "). If you meant to render a collection of children, use an array instead.",
        )
      );
    }
    return Te;
  }
  function he(v, m, S) {
    if (v == null) return v;
    var _ = [],
      ie = 0;
    return (
      W(v, _, "", "", function (ye) {
        return m.call(S, ye, ie++);
      }),
      _
    );
  }
  function ve(v) {
    if (v._status === -1) {
      var m = v._result,
        S = m();
      (S.then(
        function (_) {
          (v._status === 0 || v._status === -1) &&
            ((v._status = 1),
            (v._result = _),
            S.status === void 0 && ((S.status = "fulfilled"), (S.value = _)));
        },
        function (_) {
          (v._status === 0 || v._status === -1) &&
            ((v._status = 2),
            (v._result = _),
            S.status === void 0 && ((S.status = "rejected"), (S.reason = _)));
        },
      ),
        v._status === -1 && ((v._status = 0), (v._result = S)));
    }
    if (v._status === 1) return v._result.default;
    throw v._result;
  }
  var oe =
    typeof reportError == "function"
      ? reportError
      : function (v) {
          if (
            typeof window == "object" &&
            typeof window.ErrorEvent == "function"
          ) {
            var m = new window.ErrorEvent("error", {
              bubbles: !0,
              cancelable: !0,
              message:
                typeof v == "object" &&
                v !== null &&
                typeof v.message == "string"
                  ? String(v.message)
                  : String(v),
              error: v,
            });
            if (!window.dispatchEvent(m)) return;
          } else if (
            typeof process == "object" &&
            typeof process.emit == "function"
          ) {
            process.emit("uncaughtException", v);
            return;
          }
          console.error(v);
        };
  function ce(v) {
    var m = E.T,
      S = {};
    ((S.types = m !== null ? m.types : null), (E.T = S));
    try {
      var _ = v(),
        ie = E.S;
      (ie !== null && ie(S, _),
        typeof _ == "object" &&
          _ !== null &&
          typeof _.then == "function" &&
          _.then(G, oe));
    } catch (ye) {
      oe(ye);
    } finally {
      (m !== null && S.types !== null && (m.types = S.types), (E.T = m));
    }
  }
  function B(v) {
    var m = E.T;
    if (m !== null) {
      var S = m.types;
      S === null ? (m.types = [v]) : S.indexOf(v) === -1 && S.push(v);
    } else ce(B.bind(null, v));
  }
  var de = {
    map: he,
    forEach: function (v, m, S) {
      he(
        v,
        function () {
          m.apply(this, arguments);
        },
        S,
      );
    },
    count: function (v) {
      var m = 0;
      return (
        he(v, function () {
          m++;
        }),
        m
      );
    },
    toArray: function (v) {
      return (
        he(v, function (m) {
          return m;
        }) || []
      );
    },
    only: function (v) {
      if (!fe(v))
        throw Error(
          "React.Children.only expected to receive a single React element child.",
        );
      return v;
    },
  };
  return (
    (Re.Activity = y),
    (Re.Children = de),
    (Re.Component = le),
    (Re.Fragment = f),
    (Re.Profiler = g),
    (Re.PureComponent = I),
    (Re.StrictMode = r),
    (Re.Suspense = J),
    (Re.ViewTransition = L),
    (Re.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = E),
    (Re.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function (v) {
        return E.H.useMemoCache(v);
      },
    }),
    (Re.addTransitionType = B),
    (Re.cache = function (v) {
      return function () {
        return v.apply(null, arguments);
      };
    }),
    (Re.cacheSignal = function () {
      return null;
    }),
    (Re.cloneElement = function (v, m, S) {
      if (v == null)
        throw Error(
          "The argument must be a React element, but you passed " + v + ".",
        );
      var _ = R({}, v.props),
        ie = v.key;
      if (m != null)
        for (ye in (m.key !== void 0 && (ie = "" + m.key), m))
          !se.call(m, ye) ||
            ye === "key" ||
            ye === "__self" ||
            ye === "__source" ||
            (ye === "ref" && m.ref === void 0) ||
            (_[ye] = m[ye]);
      var ye = arguments.length - 2;
      if (ye === 1) _.children = S;
      else if (1 < ye) {
        for (var Te = Array(ye), ne = 0; ne < ye; ne++)
          Te[ne] = arguments[ne + 2];
        _.children = Te;
      }
      return P(v.type, ie, _);
    }),
    (Re.createContext = function (v) {
      return (
        (v = {
          $$typeof: b,
          _currentValue: v,
          _currentValue2: v,
          _threadCount: 0,
          Provider: null,
          Consumer: null,
        }),
        (v.Provider = v),
        (v.Consumer = { $$typeof: p, _context: v }),
        v
      );
    }),
    (Re.createElement = function (v, m, S) {
      var _,
        ie = {},
        ye = null;
      if (m != null)
        for (_ in (m.key !== void 0 && (ye = "" + m.key), m))
          se.call(m, _) &&
            _ !== "key" &&
            _ !== "__self" &&
            _ !== "__source" &&
            (ie[_] = m[_]);
      var Te = arguments.length - 2;
      if (Te === 1) ie.children = S;
      else if (1 < Te) {
        for (var ne = Array(Te), pe = 0; pe < Te; pe++)
          ne[pe] = arguments[pe + 2];
        ie.children = ne;
      }
      if (v && v.defaultProps)
        for (_ in ((Te = v.defaultProps), Te))
          ie[_] === void 0 && (ie[_] = Te[_]);
      return P(v, ye, ie);
    }),
    (Re.createRef = function () {
      return { current: null };
    }),
    (Re.forwardRef = function (v) {
      return { $$typeof: D, render: v };
    }),
    (Re.isValidElement = fe),
    (Re.lazy = function (v) {
      return { $$typeof: U, _payload: { _status: -1, _result: v }, _init: ve };
    }),
    (Re.memo = function (v, m) {
      return { $$typeof: j, type: v, compare: m === void 0 ? null : m };
    }),
    (Re.startTransition = ce),
    (Re.unstable_useCacheRefresh = function () {
      return E.H.useCacheRefresh();
    }),
    (Re.use = function (v) {
      return E.H.use(v);
    }),
    (Re.useActionState = function (v, m, S) {
      return E.H.useActionState(v, m, S);
    }),
    (Re.useCallback = function (v, m) {
      return E.H.useCallback(v, m);
    }),
    (Re.useContext = function (v) {
      return E.H.useContext(v);
    }),
    (Re.useDebugValue = function () {}),
    (Re.useDeferredValue = function (v, m) {
      return E.H.useDeferredValue(v, m);
    }),
    (Re.useEffect = function (v, m) {
      return E.H.useEffect(v, m);
    }),
    (Re.useEffectEvent = function (v) {
      return E.H.useEffectEvent(v);
    }),
    (Re.useId = function () {
      return E.H.useId();
    }),
    (Re.useImperativeHandle = function (v, m, S) {
      return E.H.useImperativeHandle(v, m, S);
    }),
    (Re.useInsertionEffect = function (v, m) {
      return E.H.useInsertionEffect(v, m);
    }),
    (Re.useLayoutEffect = function (v, m) {
      return E.H.useLayoutEffect(v, m);
    }),
    (Re.useMemo = function (v, m) {
      return E.H.useMemo(v, m);
    }),
    (Re.useOptimistic = function (v, m) {
      return E.H.useOptimistic(v, m);
    }),
    (Re.useReducer = function (v, m, S) {
      return E.H.useReducer(v, m, S);
    }),
    (Re.useRef = function (v) {
      return E.H.useRef(v);
    }),
    (Re.useState = function (v) {
      return E.H.useState(v);
    }),
    (Re.useSyncExternalStore = function (v, m, S) {
      return E.H.useSyncExternalStore(v, m, S);
    }),
    (Re.useTransition = function () {
      return E.H.useTransition();
    }),
    (Re.version = "19.3.0"),
    Re
  );
}
var Sp;
function Zo() {
  return (Sp || ((Sp = 1), (So.exports = Gy())), So.exports);
}
var h = Zo(),
  To = { exports: {} },
  Qs = {},
  Eo = { exports: {} },
  Co = {};
var Tp;
function Qy() {
  return (
    Tp ||
      ((Tp = 1),
      (function (c) {
        function d(V, W) {
          var he = V.length;
          V.push(W);
          e: for (; 0 < he; ) {
            var ve = (he - 1) >>> 1,
              oe = V[ve];
            if (0 < g(oe, W)) ((V[ve] = W), (V[he] = oe), (he = ve));
            else break e;
          }
        }
        function f(V) {
          return V.length === 0 ? null : V[0];
        }
        function r(V) {
          if (V.length === 0) return null;
          var W = V[0],
            he = V.pop();
          if (he !== W) {
            V[0] = he;
            e: for (var ve = 0, oe = V.length, ce = oe >>> 1; ve < ce; ) {
              var B = 2 * (ve + 1) - 1,
                de = V[B],
                v = B + 1,
                m = V[v];
              if (0 > g(de, he))
                v < oe && 0 > g(m, de)
                  ? ((V[ve] = m), (V[v] = he), (ve = v))
                  : ((V[ve] = de), (V[B] = he), (ve = B));
              else if (v < oe && 0 > g(m, he))
                ((V[ve] = m), (V[v] = he), (ve = v));
              else break e;
            }
          }
          return W;
        }
        function g(V, W) {
          var he = V.sortIndex - W.sortIndex;
          return he !== 0 ? he : V.id - W.id;
        }
        if (
          ((c.unstable_now = void 0),
          typeof performance == "object" &&
            typeof performance.now == "function")
        ) {
          var p = performance;
          c.unstable_now = function () {
            return p.now();
          };
        } else {
          var b = Date,
            D = b.now();
          c.unstable_now = function () {
            return b.now() - D;
          };
        }
        var J = [],
          j = [],
          U = 1,
          y = null,
          L = 3,
          M = !1,
          ee = !1,
          te = !1,
          R = !1,
          re = typeof setTimeout == "function" ? setTimeout : null,
          le = typeof clearTimeout == "function" ? clearTimeout : null,
          K = typeof setImmediate < "u" ? setImmediate : null;
        function I(V) {
          for (var W = f(j); W !== null; ) {
            if (W.callback === null) r(j);
            else if (W.startTime <= V)
              (r(j), (W.sortIndex = W.expirationTime), d(J, W));
            else break;
            W = f(j);
          }
        }
        function k(V) {
          if (((te = !1), I(V), !ee))
            if (f(J) !== null) ((ee = !0), Z || ((Z = !0), fe()));
            else {
              var W = f(j);
              W !== null && ae(k, W.startTime - V);
            }
        }
        var Z = !1,
          G = -1,
          E = 5,
          se = -1;
        function P() {
          return R ? !0 : !(c.unstable_now() - se < E);
        }
        function H() {
          if (((R = !1), Z)) {
            var V = c.unstable_now();
            se = V;
            var W = !0;
            try {
              e: {
                ((ee = !1), te && ((te = !1), le(G), (G = -1)), (M = !0));
                var he = L;
                try {
                  t: {
                    for (
                      I(V), y = f(J);
                      y !== null && !(y.expirationTime > V && P());

                    ) {
                      var ve = y.callback;
                      if (typeof ve == "function") {
                        ((y.callback = null), (L = y.priorityLevel));
                        var oe = ve(y.expirationTime <= V);
                        if (((V = c.unstable_now()), typeof oe == "function")) {
                          ((y.callback = oe), I(V), (W = !0));
                          break t;
                        }
                        (y === f(J) && r(J), I(V));
                      } else r(J);
                      y = f(J);
                    }
                    if (y !== null) W = !0;
                    else {
                      var ce = f(j);
                      (ce !== null && ae(k, ce.startTime - V), (W = !1));
                    }
                  }
                  break e;
                } finally {
                  ((y = null), (L = he), (M = !1));
                }
                W = void 0;
              }
            } finally {
              W ? fe() : (Z = !1);
            }
          }
        }
        var fe;
        if (typeof K == "function")
          fe = function () {
            K(H);
          };
        else if (typeof MessageChannel < "u") {
          var Y = new MessageChannel(),
            xe = Y.port2;
          ((Y.port1.onmessage = H),
            (fe = function () {
              xe.postMessage(null);
            }));
        } else
          fe = function () {
            re(H, 0);
          };
        function ae(V, W) {
          G = re(function () {
            V(c.unstable_now());
          }, W);
        }
        ((c.unstable_IdlePriority = 5),
          (c.unstable_ImmediatePriority = 1),
          (c.unstable_LowPriority = 4),
          (c.unstable_NormalPriority = 3),
          (c.unstable_Profiling = null),
          (c.unstable_UserBlockingPriority = 2),
          (c.unstable_cancelCallback = function (V) {
            V.callback = null;
          }),
          (c.unstable_forceFrameRate = function (V) {
            0 > V || 125 < V
              ? console.error(
                  "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported",
                )
              : (E = 0 < V ? Math.floor(1e3 / V) : 5);
          }),
          (c.unstable_getCurrentPriorityLevel = function () {
            return L;
          }),
          (c.unstable_next = function (V) {
            switch (L) {
              case 1:
              case 2:
              case 3:
                var W = 3;
                break;
              default:
                W = L;
            }
            var he = L;
            L = W;
            try {
              return V();
            } finally {
              L = he;
            }
          }),
          (c.unstable_requestPaint = function () {
            R = !0;
          }),
          (c.unstable_runWithPriority = function (V, W) {
            switch (V) {
              case 1:
              case 2:
              case 3:
              case 4:
              case 5:
                break;
              default:
                V = 3;
            }
            var he = L;
            L = V;
            try {
              return W();
            } finally {
              L = he;
            }
          }),
          (c.unstable_scheduleCallback = function (V, W, he) {
            var ve = c.unstable_now();
            switch (
              (typeof he == "object" && he !== null
                ? ((he = he.delay),
                  (he = typeof he == "number" && 0 < he ? ve + he : ve))
                : (he = ve),
              V)
            ) {
              case 1:
                var oe = -1;
                break;
              case 2:
                oe = 250;
                break;
              case 5:
                oe = 1073741823;
                break;
              case 4:
                oe = 1e4;
                break;
              default:
                oe = 5e3;
            }
            return (
              (oe = he + oe),
              (V = {
                id: U++,
                callback: W,
                priorityLevel: V,
                startTime: he,
                expirationTime: oe,
                sortIndex: -1,
              }),
              he > ve
                ? ((V.sortIndex = he),
                  d(j, V),
                  f(J) === null &&
                    V === f(j) &&
                    (te ? (le(G), (G = -1)) : (te = !0), ae(k, he - ve)))
                : ((V.sortIndex = oe),
                  d(J, V),
                  ee || M || ((ee = !0), Z || ((Z = !0), fe()))),
              V
            );
          }),
          (c.unstable_shouldYield = P),
          (c.unstable_wrapCallback = function (V) {
            var W = L;
            return function () {
              var he = L;
              L = W;
              try {
                return V.apply(this, arguments);
              } finally {
                L = he;
              }
            };
          }));
      })(Co)),
    Co
  );
}
var Ep;
function Xy() {
  return (Ep || ((Ep = 1), (Eo.exports = Qy())), Eo.exports);
}
var wo = { exports: {} },
  At = {};
var Cp;
function Zy() {
  if (Cp) return At;
  Cp = 1;
  var c = Zo();
  function d(U) {
    var y = "https://react.dev/errors/" + U;
    if (1 < arguments.length) {
      y += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var L = 2; L < arguments.length; L++)
        y += "&args[]=" + encodeURIComponent(arguments[L]);
    }
    return (
      "Minified React error #" +
      U +
      "; visit " +
      y +
      " for the full message or use the non-minified dev environment for full errors and additional helpful warnings."
    );
  }
  function f() {}
  var r = {
      d: {
        f,
        r: function () {
          throw Error(d(522));
        },
        D: f,
        C: f,
        L: f,
        m: f,
        X: f,
        S: f,
        M: f,
      },
      p: 0,
      findDOMNode: null,
    },
    g = Symbol.for("react.portal"),
    p = Symbol.for("react.recoverable"),
    b = Symbol.for("react.optimistic_key");
  function D(U, y, L) {
    var M =
      3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: g,
      key: M == null ? null : M === b ? b : "" + M,
      children: U,
      containerInfo: y,
      implementation: L,
    };
  }
  var J = c.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function j(U, y) {
    if (U === "font") return "";
    if (typeof y == "string") return y === "use-credentials" ? y : "";
  }
  return (
    (At.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = r),
    (At.browser = function (U) {
      return { $$typeof: p, _reason: U };
    }),
    (At.createPortal = function (U, y) {
      var L =
        2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
      if (!y || (y.nodeType !== 1 && y.nodeType !== 9 && y.nodeType !== 11))
        throw Error(d(299));
      return D(U, y, null, L);
    }),
    (At.flushSync = function (U) {
      var y = J.T,
        L = r.p;
      try {
        if (((J.T = null), (r.p = 2), U)) return U();
      } finally {
        ((J.T = y), (r.p = L), r.d.f());
      }
    }),
    (At.preconnect = function (U, y) {
      typeof U == "string" &&
        (y
          ? ((y = y.crossOrigin),
            (y =
              typeof y == "string"
                ? y === "use-credentials"
                  ? y
                  : ""
                : void 0))
          : (y = null),
        r.d.C(U, y));
    }),
    (At.prefetchDNS = function (U) {
      typeof U == "string" && r.d.D(U);
    }),
    (At.preinit = function (U, y) {
      if (typeof U == "string" && y && typeof y.as == "string") {
        var L = y.as,
          M = j(L, y.crossOrigin),
          ee = typeof y.integrity == "string" ? y.integrity : void 0,
          te = typeof y.fetchPriority == "string" ? y.fetchPriority : void 0;
        L === "style"
          ? r.d.S(U, typeof y.precedence == "string" ? y.precedence : void 0, {
              crossOrigin: M,
              integrity: ee,
              fetchPriority: te,
            })
          : L === "script" &&
            r.d.X(U, {
              crossOrigin: M,
              integrity: ee,
              fetchPriority: te,
              nonce: typeof y.nonce == "string" ? y.nonce : void 0,
            });
      }
    }),
    (At.preinitModule = function (U, y) {
      if (typeof U == "string")
        if (typeof y == "object" && y !== null) {
          if (y.as == null || y.as === "script") {
            var L = j(y.as, y.crossOrigin);
            r.d.M(U, {
              crossOrigin: L,
              integrity: typeof y.integrity == "string" ? y.integrity : void 0,
              nonce: typeof y.nonce == "string" ? y.nonce : void 0,
              fetchPriority:
                typeof y.fetchPriority == "string" ? y.fetchPriority : void 0,
            });
          }
        } else y == null && r.d.M(U);
    }),
    (At.preload = function (U, y) {
      if (
        typeof U == "string" &&
        typeof y == "object" &&
        y !== null &&
        typeof y.as == "string"
      ) {
        var L = y.as,
          M = j(L, y.crossOrigin);
        r.d.L(U, L, {
          crossOrigin: M,
          integrity: typeof y.integrity == "string" ? y.integrity : void 0,
          nonce: typeof y.nonce == "string" ? y.nonce : void 0,
          type: typeof y.type == "string" ? y.type : void 0,
          fetchPriority:
            typeof y.fetchPriority == "string" ? y.fetchPriority : void 0,
          referrerPolicy:
            typeof y.referrerPolicy == "string" ? y.referrerPolicy : void 0,
          imageSrcSet:
            typeof y.imageSrcSet == "string" ? y.imageSrcSet : void 0,
          imageSizes: typeof y.imageSizes == "string" ? y.imageSizes : void 0,
          media: typeof y.media == "string" ? y.media : void 0,
        });
      }
    }),
    (At.preloadModule = function (U, y) {
      if (typeof U == "string")
        if (y) {
          var L = j(y.as, y.crossOrigin);
          r.d.m(U, {
            as: typeof y.as == "string" && y.as !== "script" ? y.as : void 0,
            crossOrigin: L,
            integrity: typeof y.integrity == "string" ? y.integrity : void 0,
            nonce: typeof y.nonce == "string" ? y.nonce : void 0,
            fetchPriority:
              typeof y.fetchPriority == "string" ? y.fetchPriority : void 0,
          });
        } else r.d.m(U);
    }),
    (At.requestFormReset = function (U) {
      r.d.r(U);
    }),
    (At.unstable_batchedUpdates = function (U, y) {
      return U(y);
    }),
    (At.useFormState = function (U, y, L) {
      return J.H.useFormState(U, y, L);
    }),
    (At.useFormStatus = function () {
      return J.H.useHostTransitionStatus();
    }),
    (At.version = "19.3.0"),
    At
  );
}
var wp;
function Jy() {
  if (wp) return wo.exports;
  wp = 1;
  function c() {
    if (
      !(
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" ||
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"
      )
    )
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(c);
      } catch (d) {
        console.error(d);
      }
  }
  return (c(), (wo.exports = Zy()), wo.exports);
}
var _p;
function Iy() {
  if (_p) return Qs;
  _p = 1;
  var c = Xy(),
    d = Zo(),
    f = Jy();
  function r(e) {
    var t = "https://react.dev/errors/" + e;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var l = 2; l < arguments.length; l++)
        t += "&args[]=" + encodeURIComponent(arguments[l]);
    }
    return (
      "Minified React error #" +
      e +
      "; visit " +
      t +
      " for the full message or use the non-minified dev environment for full errors and additional helpful warnings."
    );
  }
  function g(e) {
    return !(!e || (e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11));
  }
  function p(e) {
    for (var t = e, l = t; l && !l.alternate; )
      ((t = l), (t.flags & 4098) !== 0 && (e = t.return), (l = t.return));
    for (; t.return; ) t = t.return;
    return t.tag === 3 ? e : null;
  }
  function b(e) {
    if (e.tag === 13) {
      var t = e.memoizedState;
      if (
        (t === null && ((e = e.alternate), e !== null && (t = e.memoizedState)),
        t !== null)
      )
        return t.dehydrated;
    }
    return null;
  }
  function D(e) {
    if (e.tag === 31) {
      var t = e.memoizedState;
      if (
        (t === null && ((e = e.alternate), e !== null && (t = e.memoizedState)),
        t !== null)
      )
        return t.dehydrated;
    }
    return null;
  }
  function J(e) {
    if (p(e) !== e) throw Error(r(188));
  }
  function j(e) {
    var t = e.alternate;
    if (!t) {
      if (((t = p(e)), t === null)) throw Error(r(188));
      return t !== e ? null : e;
    }
    for (var l = e, a = t; ; ) {
      var s = l.return;
      if (s === null) break;
      var i = s.alternate;
      if (i === null) {
        if (((a = s.return), a !== null)) {
          l = a;
          continue;
        }
        break;
      }
      if (s.child === i.child) {
        for (i = s.child; i; ) {
          if (i === l) return (J(s), e);
          if (i === a) return (J(s), t);
          i = i.sibling;
        }
        throw Error(r(188));
      }
      if (l.return !== a.return) ((l = s), (a = i));
      else {
        for (var u = !1, o = s.child; o; ) {
          if (o === l) {
            ((u = !0), (l = s), (a = i));
            break;
          }
          if (o === a) {
            ((u = !0), (a = s), (l = i));
            break;
          }
          o = o.sibling;
        }
        if (!u) {
          for (o = i.child; o; ) {
            if (o === l) {
              ((u = !0), (l = i), (a = s));
              break;
            }
            if (o === a) {
              ((u = !0), (a = i), (l = s));
              break;
            }
            o = o.sibling;
          }
          if (!u) throw Error(r(189));
        }
      }
      if (l.alternate !== a) throw Error(r(190));
    }
    if (l.tag !== 3) throw Error(r(188));
    return l.stateNode.current === l ? e : t;
  }
  function U(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e;
    for (e = e.child; e !== null; ) {
      if (((t = U(e)), t !== null)) return t;
      e = e.sibling;
    }
    return null;
  }
  function y(e, t, l, a, s, i) {
    for (; e !== null; ) {
      if (
        ((e.tag === 5 || e.tag === 27 || e.tag === 6) && l(e, a, s, i)) ||
        ((e.tag !== 22 || e.memoizedState === null) &&
          (t || (e.tag !== 5 && e.tag !== 27)) &&
          y(e.child, t, l, a, s, i))
      )
        return !0;
      e = e.sibling;
    }
    return !1;
  }
  function L(e) {
    for (e = e.return; e !== null; ) {
      if (e.tag === 3 || e.tag === 5 || e.tag === 27) return e;
      e = e.return;
    }
    return null;
  }
  function M(e) {
    var t = !1;
    for (
      e = e.return;
      e !== null &&
      (e.tag === 4 && (t = !0), !(e.tag === 3 || e.tag === 5 || e.tag === 27));

    )
      e = e.return;
    return t;
  }
  function ee(e) {
    var t = [null, null],
      l = L(e);
    return (l === null || te(t, e, l.child, { foundSelf: !1 }), t);
  }
  function te(e, t, l, a) {
    for (; l !== null; ) {
      if (l === t) a.foundSelf = !0;
      else if (l.tag === 5 || l.tag === 27 || l.tag === 6) {
        if (a.foundSelf) return ((e[1] = l), !0);
        e[0] = l;
      } else if (
        (l.tag !== 22 || l.memoizedState === null) &&
        te(e, t, l.child, a)
      )
        return !0;
      l = l.sibling;
    }
    return !1;
  }
  function R(e) {
    switch (e.tag) {
      case 5:
      case 27:
      case 6:
        return e.stateNode;
      case 3:
        return e.stateNode.containerInfo;
      default:
        throw Error(r(559));
    }
  }
  var re = null,
    le = null;
  function K(e, t, l) {
    return e === l ? !0 : e === t ? ((re = e), !0) : !1;
  }
  function I(e, t, l) {
    return e === l
      ? ((le = e), !1)
      : e === t
        ? (le !== null && (re = e), !0)
        : !1;
  }
  function k(e) {
    if (e === null) return null;
    do e = e === null ? null : e.return;
    while (e && e.tag !== 5 && e.tag !== 27 && e.tag !== 3);
    return e || null;
  }
  function Z(e, t, l) {
    for (var a = 0, s = e; s; s = l(s)) a++;
    s = 0;
    for (var i = t; i; i = l(i)) s++;
    for (; 0 < a - s; ) ((e = l(e)), a--);
    for (; 0 < s - a; ) ((t = l(t)), s--);
    for (; a--; ) {
      if (e === t || (t !== null && e === t.alternate)) return e;
      ((e = l(e)), (t = l(t)));
    }
    return null;
  }
  var G = Object.assign,
    E = Symbol.for("react.element"),
    se = Symbol.for("react.transitional.element"),
    P = Symbol.for("react.portal"),
    H = Symbol.for("react.fragment"),
    fe = Symbol.for("react.strict_mode"),
    Y = Symbol.for("react.profiler"),
    xe = Symbol.for("react.consumer"),
    ae = Symbol.for("react.context"),
    V = Symbol.for("react.forward_ref"),
    W = Symbol.for("react.suspense"),
    he = Symbol.for("react.suspense_list"),
    ve = Symbol.for("react.memo"),
    oe = Symbol.for("react.lazy"),
    ce = Symbol.for("react.activity"),
    B = Symbol.for("react.legacy_hidden"),
    de = Symbol.for("react.memo_cache_sentinel"),
    v = Symbol.for("react.view_transition"),
    m = Symbol.for("react.recoverable"),
    S = Symbol.iterator;
  function _(e) {
    return e === null || typeof e != "object"
      ? null
      : ((e = (S && e[S]) || e["@@iterator"]),
        typeof e == "function" ? e : null);
  }
  var ie = Symbol.for("react.client.reference");
  function ye(e) {
    if (e == null) return null;
    if (typeof e == "function")
      return e.$$typeof === ie ? null : e.displayName || e.name || null;
    if (typeof e == "string") return e;
    switch (e) {
      case H:
        return "Fragment";
      case Y:
        return "Profiler";
      case fe:
        return "StrictMode";
      case W:
        return "Suspense";
      case he:
        return "SuspenseList";
      case ce:
        return "Activity";
      case v:
        return "ViewTransition";
    }
    if (typeof e == "object")
      switch (e.$$typeof) {
        case P:
          return "Portal";
        case ae:
          return e.displayName || "Context";
        case xe:
          return (e._context.displayName || "Context") + ".Consumer";
        case V:
          var t = e.render;
          return (
            (e = e.displayName),
            e ||
              ((e = t.displayName || t.name || ""),
              (e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef")),
            e
          );
        case ve:
          return (
            (t = e.displayName || null),
            t !== null ? t : ye(e.type) || "Memo"
          );
        case oe:
          ((t = e._payload), (e = e._init));
          try {
            return ye(e(t));
          } catch {}
      }
    return null;
  }
  var Te = Array.isArray,
    ne = d.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
    pe = f.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
    F = { pending: !1, data: null, method: null, action: null },
    Ae = [],
    at = -1;
  function Ve(e) {
    return { current: e };
  }
  function De(e) {
    0 > at || ((e.current = Ae[at]), (Ae[at] = null), at--);
  }
  function we(e, t) {
    (at++, (Ae[at] = e.current), (e.current = t));
  }
  var Le = Ve(null),
    Xe = Ve(null),
    O = Ve(null),
    Ee = Ve(null);
  function st(e, t) {
    switch ((we(O, t), we(Xe, e), we(Le, null), t.nodeType)) {
      case 9:
      case 11:
        e = (e = t.documentElement) && (e = e.namespaceURI) ? Am(e) : 0;
        break;
      default:
        if (((e = t.tagName), (t = t.namespaceURI)))
          ((t = Am(t)), (e = Rm(t, e)));
        else
          switch (e) {
            case "svg":
              e = 1;
              break;
            case "math":
              e = 2;
              break;
            default:
              e = 0;
          }
    }
    (De(Le), we(Le, e));
  }
  function pt() {
    (De(Le), De(Xe), De(O));
  }
  function Qt(e) {
    var t = e.memoizedState;
    (t !== null && ((Xa._currentValue = t.memoizedState), we(Ee, e)),
      (t = Le.current));
    var l = Rm(t, e.type);
    t !== l && (we(Xe, e), we(Le, l));
  }
  function Dl(e) {
    (Xe.current === e && (De(Le), De(Xe)),
      Ee.current === e && (De(Ee), (Xa._currentValue = F)));
  }
  var Il, _n;
  function ol(e) {
    if (Il === void 0)
      try {
        throw Error();
      } catch (l) {
        var t = l.stack.trim().match(/\n( *(at )?)/);
        ((Il = (t && t[1]) || ""),
          (_n =
            -1 <
            l.stack.indexOf(`
    at`)
              ? " (<anonymous>)"
              : -1 < l.stack.indexOf("@")
                ? "@unknown:0:0"
                : ""));
      }
    return (
      `
` +
      Il +
      e +
      _n
    );
  }
  var An = !1;
  function Rn(e, t) {
    if (!e || An) return "";
    An = !0;
    var l = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var a = {
        DetermineComponentFrameRoot: function () {
          try {
            if (t) {
              var X = function () {
                throw Error();
              };
              if (
                (Object.defineProperty(X.prototype, "props", {
                  set: function () {
                    throw Error();
                  },
                }),
                typeof Reflect == "object" && Reflect.construct)
              ) {
                try {
                  Reflect.construct(X, []);
                } catch (me) {
                  var T = me;
                }
                Reflect.construct(e, [], X);
              } else {
                try {
                  X.call();
                } catch (me) {
                  T = me;
                }
                X = !1;
                try {
                  var z = Object.getOwnPropertyDescriptor(e.prototype, "props");
                  (Object.defineProperty(e.prototype, "props", {
                    configurable: !0,
                    set: function () {
                      throw Error();
                    },
                  }),
                    (X = !0),
                    new e());
                } finally {
                  X &&
                    (z !== void 0
                      ? Object.defineProperty(e.prototype, "props", z)
                      : delete e.prototype.props);
                }
              }
            } else {
              try {
                throw Error();
              } catch (me) {
                T = me;
              }
              (X = e()) &&
                typeof X.catch == "function" &&
                X.catch(function () {});
            }
          } catch (me) {
            if (me && T && typeof me.stack == "string")
              return [me.stack, T.stack];
          }
          return [null, null];
        },
      };
      a.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var s = Object.getOwnPropertyDescriptor(
        a.DetermineComponentFrameRoot,
        "name",
      );
      s &&
        s.configurable &&
        Object.defineProperty(a.DetermineComponentFrameRoot, "name", {
          value: "DetermineComponentFrameRoot",
        });
      var i = a.DetermineComponentFrameRoot(),
        u = i[0],
        o = i[1];
      if (u && o) {
        var x = u.split(`
`),
          w = o.split(`
`);
        for (
          s = a = 0;
          a < x.length && !x[a].includes("DetermineComponentFrameRoot");

        )
          a++;
        for (; s < w.length && !w[s].includes("DetermineComponentFrameRoot"); )
          s++;
        if (a === x.length || s === w.length)
          for (
            a = x.length - 1, s = w.length - 1;
            1 <= a && 0 <= s && x[a] !== w[s];

          )
            s--;
        for (; 1 <= a && 0 <= s; a--, s--)
          if (x[a] !== w[s]) {
            if (a !== 1 || s !== 1)
              do
                if ((a--, s--, 0 > s || x[a] !== w[s])) {
                  var q =
                    `
` + x[a].replace(" at new ", " at ");
                  return (
                    e.displayName &&
                      q.includes("<anonymous>") &&
                      (q = q.replace("<anonymous>", e.displayName)),
                    q
                  );
                }
              while (1 <= a && 0 <= s);
            break;
          }
      }
    } finally {
      ((An = !1), (Error.prepareStackTrace = l));
    }
    return (l = e ? e.displayName || e.name : "") ? ol(l) : "";
  }
  function dl(e, t) {
    switch (e.tag) {
      case 26:
      case 27:
      case 5:
        return ol(e.type);
      case 16:
        return ol("Lazy");
      case 13:
        return e.child !== t && t !== null
          ? ol("Suspense Fallback")
          : ol("Suspense");
      case 19:
        return ol("SuspenseList");
      case 0:
      case 15:
        return Rn(e.type, !1);
      case 11:
        return Rn(e.type.render, !1);
      case 1:
        return Rn(e.type, !0);
      case 31:
        return ol("Activity");
      case 30:
        return ol("ViewTransition");
      default:
        return "";
    }
  }
  function $l(e) {
    try {
      var t = "",
        l = null;
      do ((t += dl(e, l)), (l = e), (e = e.return));
      while (e);
      return t;
    } catch (a) {
      return (
        `
Error generating stack: ` +
        a.message +
        `
` +
        a.stack
      );
    }
  }
  var ta = Object.prototype.hasOwnProperty,
    Fa = c.unstable_scheduleCallback,
    la = c.unstable_cancelCallback,
    Gc = c.unstable_shouldYield,
    na = c.unstable_requestPaint,
    Nt = c.unstable_now,
    Qc = c.unstable_getCurrentPriorityLevel,
    si = c.unstable_ImmediatePriority,
    ii = c.unstable_UserBlockingPriority,
    Fl = c.unstable_NormalPriority,
    Xc = c.unstable_LowPriority,
    ci = c.unstable_IdlePriority,
    Zc = c.log,
    aa = c.unstable_setDisableYieldValue,
    Wl = null,
    $ = null;
  function Se(e) {
    if (
      (typeof Zc == "function" && aa(e),
      $ && typeof $.setStrictMode == "function")
    )
      try {
        $.setStrictMode(Wl, e);
      } catch {}
  }
  var Oe = Math.clz32 ? Math.clz32 : Ht,
    ot = Math.log,
    fl = Math.LN2;
  function Ht(e) {
    return ((e >>>= 0), e === 0 ? 32 : (31 - ((ot(e) / fl) | 0)) | 0);
  }
  var sa = 256,
    ui = 262144,
    ri = 4194304;
  function Dn(e) {
    var t = e & 42;
    if (t !== 0) return t;
    switch (e & -e) {
      case 1:
        return 1;
      case 2:
        return 2;
      case 4:
        return 4;
      case 8:
        return 8;
      case 16:
        return 16;
      case 32:
        return 32;
      case 64:
        return 64;
      case 128:
        return 128;
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
        return e & -e;
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return e & 3932160;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return e & 62914560;
      case 67108864:
        return 67108864;
      case 134217728:
        return 134217728;
      case 268435456:
        return 268435456;
      case 536870912:
        return 536870912;
      case 1073741824:
        return 0;
      default:
        return e;
    }
  }
  function oi(e, t, l) {
    var a = e.pendingLanes;
    if (a === 0) return 0;
    var s = 0,
      i = e.suspendedLanes,
      u = e.pingedLanes;
    e = e.warmLanes;
    var o = a & 134217727;
    return (
      o !== 0
        ? ((a = o & ~i),
          a !== 0
            ? (s = Dn(a))
            : ((u &= o),
              u !== 0
                ? (s = Dn(u))
                : l || ((l = o & ~e), l !== 0 && (s = Dn(l)))))
        : ((o = a & ~i),
          o !== 0
            ? (s = Dn(o))
            : u !== 0
              ? (s = Dn(u))
              : l || ((l = a & ~e), l !== 0 && (s = Dn(l)))),
      s === 0
        ? 0
        : t !== 0 &&
            t !== s &&
            (t & i) === 0 &&
            ((i = s & -s),
            (l = t & -t),
            i >= l || (i === 32 && (l & 4194048) !== 0))
          ? t
          : s
    );
  }
  function Wa(e, t) {
    return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
  }
  function ed(e, t) {
    (t & 8) !== 0 && (t |= t & 32);
    var l = e.entangledLanes;
    if (l !== 0)
      for (e = e.entanglements, l &= t; 0 < l; ) {
        var a = 31 - Oe(l),
          s = 1 << a;
        ((t |= e[a]), (l &= ~s));
      }
    return t;
  }
  function lv(e, t) {
    switch (e) {
      case 1:
      case 2:
      case 4:
      case 8:
      case 64:
        return t + 250;
      case 16:
      case 32:
      case 128:
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return t + 5e3;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return -1;
      case 67108864:
      case 134217728:
      case 268435456:
      case 536870912:
      case 1073741824:
        return -1;
      default:
        return -1;
    }
  }
  function td() {
    var e = ri;
    return ((ri <<= 1), (ri & 62914560) === 0 && (ri = 4194304), e);
  }
  function Jc(e) {
    for (var t = [], l = 0; 31 > l; l++) t.push(e);
    return t;
  }
  function Pa(e, t) {
    ((e.pendingLanes |= t),
      t !== 268435456 &&
        ((e.suspendedLanes = 0), (e.pingedLanes = 0), (e.warmLanes = 0)));
  }
  function nv(e, t, l, a, s, i) {
    var u = e.pendingLanes;
    ((e.pendingLanes = l),
      (e.suspendedLanes = 0),
      (e.pingedLanes = 0),
      (e.warmLanes = 0),
      (e.expiredLanes &= l),
      (e.entangledLanes &= l),
      (e.errorRecoveryDisabledLanes &= l),
      (e.shellSuspendCounter = 0));
    var o = e.entanglements,
      x = e.expirationTimes,
      w = e.hiddenUpdates;
    for (l = u & ~l; 0 < l; ) {
      var q = 31 - Oe(l),
        X = 1 << q;
      ((o[q] = 0), (x[q] = -1));
      var T = w[q];
      if (T !== null)
        for (w[q] = null, q = 0; q < T.length; q++) {
          var z = T[q];
          z !== null && (z.lane &= -536870913);
        }
      l &= ~X;
    }
    (a !== 0 && ld(e, a, 0),
      i !== 0 && s === 0 && e.tag !== 0 && (e.suspendedLanes |= i & ~(u & ~t)));
  }
  function ld(e, t, l) {
    ((e.pendingLanes |= t), (e.suspendedLanes &= ~t));
    var a = 31 - Oe(t);
    ((e.entangledLanes |= t),
      (e.entanglements[a] = e.entanglements[a] | 1073741824 | (l & 261930)));
  }
  function nd(e, t) {
    var l = (e.entangledLanes |= t);
    for (e = e.entanglements; l; ) {
      var a = 31 - Oe(l),
        s = 1 << a;
      ((s & t) | (e[a] & t) && (e[a] |= t), (l &= ~s));
    }
  }
  function ad(e, t) {
    var l = t & -t;
    return (
      (l = (l & 42) !== 0 ? 1 : Ic(l)),
      (l & (e.suspendedLanes | t)) !== 0 ? 0 : l
    );
  }
  function Ic(e) {
    switch (e) {
      case 2:
        e = 1;
        break;
      case 8:
        e = 4;
        break;
      case 32:
        e = 16;
        break;
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        e = 128;
        break;
      case 268435456:
        e = 134217728;
        break;
      default:
        e = 0;
    }
    return e;
  }
  function $c(e) {
    return (
      (e &= -e),
      2 < e ? (8 < e ? ((e & 134217727) !== 0 ? 32 : 268435456) : 8) : 2
    );
  }
  function sd() {
    var e = pe.p;
    return e !== 0 ? e : ((e = window.event), e === void 0 ? 32 : hp(e.type));
  }
  function id(e, t) {
    var l = pe.p;
    try {
      return ((pe.p = e), t());
    } finally {
      pe.p = l;
    }
  }
  var Ol = Math.random().toString(36).slice(2),
    St = "__reactFiber$" + Ol,
    Kt = "__reactProps$" + Ol,
    ia = "__reactContainer$" + Ol,
    cd = "__reactEvents$" + Ol,
    av = "__reactListeners$" + Ol,
    sv = "__reactHandles$" + Ol,
    ud = "__reactResources$" + Ol,
    es = "__reactMarker$" + Ol,
    di = "__reactLoad$" + Ol;
  function fi(e) {
    (delete e[St], delete e[Kt], delete e[av], delete e[sv]);
  }
  function On(e) {
    var t;
    if ((t = e[St])) return t;
    for (var l = e.parentNode; l; ) {
      if ((t = l[ia] || l[St])) {
        if (
          ((l = t.alternate),
          t.child !== null || (l !== null && l.child !== null))
        )
          for (e = Zm(e); e !== null; ) {
            if ((l = e[St])) return l;
            e = Zm(e);
          }
        return t;
      }
      ((e = l), (l = e.parentNode));
    }
    return null;
  }
  function ca(e) {
    if ((e = e[St] || e[ia])) {
      var t = e.tag;
      if (
        t === 5 ||
        t === 6 ||
        t === 13 ||
        t === 31 ||
        t === 26 ||
        t === 27 ||
        t === 3
      )
        return e;
    }
    return null;
  }
  function ts(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
    throw Error(r(33));
  }
  function ua(e) {
    var t = e[ud];
    return (
      t ||
        (t = e[ud] =
          { hoistableStyles: new Map(), hoistableScripts: new Map() }),
      t
    );
  }
  function xt(e) {
    e[es] = !0;
  }
  function rd(e) {
    e[di] = void 0;
  }
  var od = new Set(),
    dd = {};
  function zn(e, t) {
    (ra(e, t), ra(e + "Capture", t));
  }
  function ra(e, t) {
    for (dd[e] = t, e = 0; e < t.length; e++) od.add(t[e]);
  }
  var iv = RegExp(
      "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$",
    ),
    fd = {},
    hd = {};
  function cv(e) {
    return ta.call(hd, e)
      ? !0
      : ta.call(fd, e)
        ? !1
        : iv.test(e)
          ? (hd[e] = !0)
          : ((fd[e] = !0), !1);
  }
  var Qe = !1;
  function md() {
    var e = Qe;
    return ((Qe = !1), e);
  }
  function hi(e, t, l) {
    if (cv(t))
      if (l === null) e.removeAttribute(t);
      else {
        switch (typeof l) {
          case "undefined":
          case "function":
          case "symbol":
            e.removeAttribute(t);
            return;
          case "boolean":
            var a = t.toLowerCase().slice(0, 5);
            if (a !== "data-" && a !== "aria-") {
              e.removeAttribute(t);
              return;
            }
        }
        e.setAttribute(t, l);
      }
  }
  function mi(e, t, l) {
    if (l === null) e.removeAttribute(t);
    else {
      switch (typeof l) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          e.removeAttribute(t);
          return;
      }
      e.setAttribute(t, l);
    }
  }
  function zl(e, t, l, a) {
    if (a === null) e.removeAttribute(l);
    else {
      switch (typeof a) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          e.removeAttribute(l);
          return;
      }
      e.setAttributeNS(t, l, a);
    }
  }
  function Xt(e) {
    switch (typeof e) {
      case "bigint":
      case "boolean":
      case "number":
      case "string":
      case "undefined":
        return e;
      case "object":
        return e;
      default:
        return "";
    }
  }
  function pd(e) {
    var t = e.type;
    return (
      (e = e.nodeName) &&
      e.toLowerCase() === "input" &&
      (t === "checkbox" || t === "radio")
    );
  }
  function uv(e, t, l) {
    var a = Object.getOwnPropertyDescriptor(e.constructor.prototype, t);
    if (
      !e.hasOwnProperty(t) &&
      typeof a < "u" &&
      typeof a.get == "function" &&
      typeof a.set == "function"
    ) {
      var s = a.get,
        i = a.set;
      return (
        Object.defineProperty(e, t, {
          configurable: !0,
          get: function () {
            return s.call(this);
          },
          set: function (u) {
            ((l = "" + u), i.call(this, u));
          },
        }),
        Object.defineProperty(e, t, { enumerable: a.enumerable }),
        {
          getValue: function () {
            return l;
          },
          setValue: function (u) {
            l = "" + u;
          },
          stopTracking: function () {
            ((e._valueTracker = null), delete e[t]);
          },
        }
      );
    }
  }
  function Fc(e) {
    if (!e._valueTracker) {
      var t = pd(e) ? "checked" : "value";
      e._valueTracker = uv(e, t, "" + e[t]);
    }
  }
  function vd(e) {
    if (!e) return !1;
    var t = e._valueTracker;
    if (!t) return !0;
    var l = t.getValue(),
      a = "";
    return (
      e && (a = pd(e) ? (e.checked ? "true" : "false") : e.value),
      (e = a),
      e !== l ? (t.setValue(e), !0) : !1
    );
  }
  var rv = /[\n"\\]/g;
  function tl(e) {
    return e.replace(rv, function (t) {
      return "\\" + t.charCodeAt(0).toString(16) + " ";
    });
  }
  function Wc(e, t, l, a, s, i, u, o) {
    ((e.name = ""),
      u != null &&
      typeof u != "function" &&
      typeof u != "symbol" &&
      typeof u != "boolean"
        ? (e.type = u)
        : e.removeAttribute("type"),
      t != null
        ? u === "number"
          ? ((t === 0 && e.value === "") || e.value != t) &&
            (e.value = "" + Xt(t))
          : e.value !== "" + Xt(t) && (e.value = "" + Xt(t))
        : (u !== "submit" && u !== "reset") || e.removeAttribute("value"),
      t != null
        ? u === "number" && e.value == t
          ? Pc(e, Xt(e.value))
          : Pc(e, Xt(t))
        : l != null
          ? Pc(e, Xt(l))
          : a != null && e.removeAttribute("value"),
      s == null && i != null && (e.defaultChecked = !!i),
      s != null &&
        (e.checked = s && typeof s != "function" && typeof s != "symbol"),
      o != null &&
      typeof o != "function" &&
      typeof o != "symbol" &&
      typeof o != "boolean"
        ? (e.name = "" + Xt(o))
        : e.removeAttribute("name"));
  }
  function xd(e, t, l, a, s, i, u, o) {
    if (
      (i != null &&
        typeof i != "function" &&
        typeof i != "symbol" &&
        typeof i != "boolean" &&
        (e.type = i),
      t != null || l != null)
    ) {
      if (!((i !== "submit" && i !== "reset") || t != null)) {
        Fc(e);
        return;
      }
      ((l = l != null ? "" + Xt(l) : ""),
        (t = t != null ? "" + Xt(t) : l),
        o || t === e.value || (e.value = t),
        (e.defaultValue = t));
    }
    ((a = a ?? s),
      (a = typeof a != "function" && typeof a != "symbol" && !!a),
      (e.checked = o ? e.checked : !!a),
      (e.defaultChecked = !!a),
      u != null &&
        typeof u != "function" &&
        typeof u != "symbol" &&
        typeof u != "boolean" &&
        (e.name = u),
      Fc(e));
  }
  function Pc(e, t) {
    e.defaultValue !== "" + t && (e.defaultValue = "" + t);
  }
  function oa(e, t, l, a) {
    if (((e = e.options), t)) {
      t = {};
      for (var s = 0; s < l.length; s++) t["$" + l[s]] = !0;
      for (l = 0; l < e.length; l++)
        ((s = t.hasOwnProperty("$" + e[l].value)),
          e[l].selected !== s && (e[l].selected = s),
          s && a && (e[l].defaultSelected = !0));
    } else {
      for (l = "" + Xt(l), t = null, s = 0; s < e.length; s++) {
        if (e[s].value === l) {
          ((e[s].selected = !0), a && (e[s].defaultSelected = !0));
          return;
        }
        t !== null || e[s].disabled || (t = e[s]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function yd(e, t, l) {
    if (
      t != null &&
      ((t = "" + Xt(t)), t !== e.value && (e.value = t), l == null)
    ) {
      e.defaultValue !== t && (e.defaultValue = t);
      return;
    }
    e.defaultValue = l != null ? "" + Xt(l) : "";
  }
  function gd(e, t, l, a) {
    if (t == null) {
      if (a != null) {
        if (l != null) throw Error(r(92));
        if (Te(a)) {
          if (1 < a.length) throw Error(r(93));
          a = a[0];
        }
        l = a;
      }
      (l == null && (l = ""), (t = l));
    }
    ((l = Xt(t)),
      (e.defaultValue = l),
      (a = e.textContent),
      a === l && a !== "" && a !== null && (e.value = a),
      Fc(e));
  }
  function da(e, t) {
    if (t) {
      var l = e.firstChild;
      if (l && l === e.lastChild && l.nodeType === 3) {
        l.nodeValue = t;
        return;
      }
    }
    e.textContent = t;
  }
  var ov = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " ",
    ),
  );
  function jd(e, t, l) {
    var a = t.indexOf("--") === 0;
    l == null || typeof l == "boolean" || l === ""
      ? a
        ? e.setProperty(t, "")
        : t === "float"
          ? (e.cssFloat = "")
          : (e[t] = "")
      : a
        ? e.setProperty(t, l)
        : typeof l != "number" || l === 0 || ov.has(t)
          ? t === "float"
            ? (e.cssFloat = l)
            : (e[t] = ("" + l).trim())
          : (e[t] = l + "px");
  }
  function bd(e, t, l) {
    if (t != null && typeof t != "object") throw Error(r(62));
    if (((e = e.style), l != null)) {
      for (var a in l)
        !l.hasOwnProperty(a) ||
          (t != null && t.hasOwnProperty(a)) ||
          (a.indexOf("--") === 0
            ? e.setProperty(a, "")
            : a === "float"
              ? (e.cssFloat = "")
              : (e[a] = ""),
          (Qe = !0));
      for (var s in t)
        ((a = t[s]),
          t.hasOwnProperty(s) && l[s] !== a && (jd(e, s, a), (Qe = !0)));
    } else for (var i in t) t.hasOwnProperty(i) && jd(e, i, t[i]);
  }
  function eu(e) {
    if (e.indexOf("-") === -1) return !1;
    switch (e) {
      case "annotation-xml":
      case "color-profile":
      case "font-face":
      case "font-face-src":
      case "font-face-uri":
      case "font-face-format":
      case "font-face-name":
      case "missing-glyph":
        return !1;
      default:
        return !0;
    }
  }
  var dv = new Map([
      ["acceptCharset", "accept-charset"],
      ["htmlFor", "for"],
      ["httpEquiv", "http-equiv"],
      ["crossOrigin", "crossorigin"],
      ["accentHeight", "accent-height"],
      ["alignmentBaseline", "alignment-baseline"],
      ["arabicForm", "arabic-form"],
      ["baselineShift", "baseline-shift"],
      ["capHeight", "cap-height"],
      ["clipPath", "clip-path"],
      ["clipRule", "clip-rule"],
      ["colorInterpolation", "color-interpolation"],
      ["colorInterpolationFilters", "color-interpolation-filters"],
      ["colorProfile", "color-profile"],
      ["colorRendering", "color-rendering"],
      ["dominantBaseline", "dominant-baseline"],
      ["enableBackground", "enable-background"],
      ["fillOpacity", "fill-opacity"],
      ["fillRule", "fill-rule"],
      ["floodColor", "flood-color"],
      ["floodOpacity", "flood-opacity"],
      ["fontFamily", "font-family"],
      ["fontSize", "font-size"],
      ["fontSizeAdjust", "font-size-adjust"],
      ["fontStretch", "font-stretch"],
      ["fontStyle", "font-style"],
      ["fontVariant", "font-variant"],
      ["fontWeight", "font-weight"],
      ["glyphName", "glyph-name"],
      ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
      ["glyphOrientationVertical", "glyph-orientation-vertical"],
      ["horizAdvX", "horiz-adv-x"],
      ["horizOriginX", "horiz-origin-x"],
      ["imageRendering", "image-rendering"],
      ["letterSpacing", "letter-spacing"],
      ["lightingColor", "lighting-color"],
      ["markerEnd", "marker-end"],
      ["markerMid", "marker-mid"],
      ["markerStart", "marker-start"],
      ["maskType", "mask-type"],
      ["overlinePosition", "overline-position"],
      ["overlineThickness", "overline-thickness"],
      ["paintOrder", "paint-order"],
      ["panose-1", "panose-1"],
      ["pointerEvents", "pointer-events"],
      ["renderingIntent", "rendering-intent"],
      ["shapeRendering", "shape-rendering"],
      ["stopColor", "stop-color"],
      ["stopOpacity", "stop-opacity"],
      ["strikethroughPosition", "strikethrough-position"],
      ["strikethroughThickness", "strikethrough-thickness"],
      ["strokeDasharray", "stroke-dasharray"],
      ["strokeDashoffset", "stroke-dashoffset"],
      ["strokeLinecap", "stroke-linecap"],
      ["strokeLinejoin", "stroke-linejoin"],
      ["strokeMiterlimit", "stroke-miterlimit"],
      ["strokeOpacity", "stroke-opacity"],
      ["strokeWidth", "stroke-width"],
      ["textAnchor", "text-anchor"],
      ["textDecoration", "text-decoration"],
      ["textRendering", "text-rendering"],
      ["transformOrigin", "transform-origin"],
      ["underlinePosition", "underline-position"],
      ["underlineThickness", "underline-thickness"],
      ["unicodeBidi", "unicode-bidi"],
      ["unicodeRange", "unicode-range"],
      ["unitsPerEm", "units-per-em"],
      ["vAlphabetic", "v-alphabetic"],
      ["vHanging", "v-hanging"],
      ["vIdeographic", "v-ideographic"],
      ["vMathematical", "v-mathematical"],
      ["vectorEffect", "vector-effect"],
      ["vertAdvY", "vert-adv-y"],
      ["vertOriginX", "vert-origin-x"],
      ["vertOriginY", "vert-origin-y"],
      ["wordSpacing", "word-spacing"],
      ["writingMode", "writing-mode"],
      ["xmlnsXlink", "xmlns:xlink"],
      ["xHeight", "x-height"],
    ]),
    fv =
      /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function pi(e) {
    return fv.test("" + e)
      ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
      : e;
  }
  function jl() {}
  var tu = null;
  function lu(e) {
    return (
      (e = e.target || e.srcElement || window),
      e.correspondingUseElement && (e = e.correspondingUseElement),
      e.nodeType === 3 ? e.parentNode : e
    );
  }
  var fa = null,
    ha = null;
  function Nd(e) {
    var t = ca(e);
    if (t && (e = t.stateNode)) {
      var l = e[Kt] || null;
      e: switch (((e = t.stateNode), t.type)) {
        case "input":
          if (
            (Wc(
              e,
              l.value,
              l.defaultValue,
              l.defaultValue,
              l.checked,
              l.defaultChecked,
              l.type,
              l.name,
            ),
            (t = l.name),
            l.type === "radio" && t != null)
          ) {
            for (l = e; l.parentNode; ) l = l.parentNode;
            for (
              l = l.querySelectorAll(
                'input[name="' + tl("" + t) + '"][type="radio"]',
              ),
                t = 0;
              t < l.length;
              t++
            ) {
              var a = l[t];
              if (a !== e && a.form === e.form) {
                var s = a[Kt] || null;
                if (!s) throw Error(r(90));
                Wc(
                  a,
                  s.value,
                  s.defaultValue,
                  s.defaultValue,
                  s.checked,
                  s.defaultChecked,
                  s.type,
                  s.name,
                );
              }
            }
            for (t = 0; t < l.length; t++)
              ((a = l[t]), a.form === e.form && vd(a));
          }
          break e;
        case "textarea":
          yd(e, l.value, l.defaultValue);
          break e;
        case "select":
          ((t = l.value), t != null && oa(e, !!l.multiple, t, !1));
      }
    }
  }
  var nu = !1;
  function Sd(e, t, l) {
    if (nu) return e(t, l);
    nu = !0;
    try {
      var a = e(t);
      return a;
    } finally {
      if (
        ((nu = !1),
        (fa !== null || ha !== null) &&
          (pc(), fa && ((t = fa), (e = ha), (ha = fa = null), Nd(t), e)))
      )
        for (t = 0; t < e.length; t++) Nd(e[t]);
    }
  }
  function ls(e, t) {
    var l = e.stateNode;
    if (l === null) return null;
    var a = l[Kt] || null;
    if (a === null) return null;
    l = a[t];
    e: switch (t) {
      case "onClick":
      case "onClickCapture":
      case "onDoubleClick":
      case "onDoubleClickCapture":
      case "onMouseDown":
      case "onMouseDownCapture":
      case "onMouseMove":
      case "onMouseMoveCapture":
      case "onMouseUp":
      case "onMouseUpCapture":
      case "onMouseEnter":
        ((a = !a.disabled) ||
          ((e = e.type),
          (a = !(
            e === "button" ||
            e === "input" ||
            e === "select" ||
            e === "textarea"
          ))),
          (e = !a));
        break e;
      default:
        e = !1;
    }
    if (e) return null;
    if (l && typeof l != "function") throw Error(r(231, t, typeof l));
    return l;
  }
  var Ul = !(
      typeof window > "u" ||
      typeof window.document > "u" ||
      typeof window.document.createElement > "u"
    ),
    au = !1;
  if (Ul)
    try {
      var ns = {};
      (Object.defineProperty(ns, "passive", {
        get: function () {
          au = !0;
        },
      }),
        window.addEventListener("test", ns, ns),
        window.removeEventListener("test", ns, ns));
    } catch {
      au = !1;
    }
  var Pl = null,
    su = null,
    vi = null;
  function Td() {
    if (vi) return vi;
    var e,
      t = su,
      l = t.length,
      a,
      s = "value" in Pl ? Pl.value : Pl.textContent,
      i = s.length;
    for (e = 0; e < l && t[e] === s[e]; e++);
    var u = l - e;
    for (a = 1; a <= u && t[l - a] === s[i - a]; a++);
    return (vi = s.slice(e, 1 < a ? 1 - a : void 0));
  }
  function xi(e) {
    var t = e.keyCode;
    return (
      "charCode" in e
        ? ((e = e.charCode), e === 0 && t === 13 && (e = 13))
        : (e = t),
      e === 10 && (e = 13),
      32 <= e || e === 13 ? e : 0
    );
  }
  function yi() {
    return !0;
  }
  function Ed() {
    return !1;
  }
  function zt(e) {
    function t(l, a, s, i, u) {
      ((this._reactName = l),
        (this._targetInst = s),
        (this.type = a),
        (this.nativeEvent = i),
        (this.target = u),
        (this.currentTarget = null));
      for (var o in e)
        e.hasOwnProperty(o) && ((l = e[o]), (this[o] = l ? l(i) : i[o]));
      return (
        (this.isDefaultPrevented = (
          i.defaultPrevented != null ? i.defaultPrevented : i.returnValue === !1
        )
          ? yi
          : Ed),
        (this.isPropagationStopped = Ed),
        this
      );
    }
    return (
      G(t.prototype, {
        preventDefault: function () {
          this.defaultPrevented = !0;
          var l = this.nativeEvent;
          l &&
            (l.preventDefault
              ? l.preventDefault()
              : typeof l.returnValue != "unknown" && (l.returnValue = !1),
            (this.isDefaultPrevented = yi));
        },
        stopPropagation: function () {
          var l = this.nativeEvent;
          l &&
            (l.stopPropagation
              ? l.stopPropagation()
              : typeof l.cancelBubble != "unknown" && (l.cancelBubble = !0),
            (this.isPropagationStopped = yi));
        },
        persist: function () {},
        isPersistent: yi,
      }),
      t
    );
  }
  var en = {
      eventPhase: 0,
      bubbles: 0,
      cancelable: 0,
      timeStamp: function (e) {
        return e.timeStamp || Date.now();
      },
      defaultPrevented: 0,
      isTrusted: 0,
    },
    gi = zt(en),
    as = G({}, en, { view: 0, detail: 0 }),
    hv = zt(as),
    iu,
    cu,
    ss,
    ji = G({}, as, {
      screenX: 0,
      screenY: 0,
      clientX: 0,
      clientY: 0,
      pageX: 0,
      pageY: 0,
      ctrlKey: 0,
      shiftKey: 0,
      altKey: 0,
      metaKey: 0,
      getModifierState: ru,
      button: 0,
      buttons: 0,
      relatedTarget: function (e) {
        return e.relatedTarget === void 0
          ? e.fromElement === e.srcElement
            ? e.toElement
            : e.fromElement
          : e.relatedTarget;
      },
      movementX: function (e) {
        return "movementX" in e
          ? e.movementX
          : (e !== ss &&
              (ss && e.type === "mousemove"
                ? ((iu = e.screenX - ss.screenX), (cu = e.screenY - ss.screenY))
                : (cu = iu = 0),
              (ss = e)),
            iu);
      },
      movementY: function (e) {
        return "movementY" in e ? e.movementY : cu;
      },
    }),
    Cd = zt(ji),
    mv = G({}, ji, { dataTransfer: 0 }),
    pv = zt(mv),
    vv = G({}, as, { relatedTarget: 0 }),
    uu = zt(vv),
    xv = G({}, en, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }),
    yv = zt(xv),
    gv = G({}, en, {
      clipboardData: function (e) {
        return "clipboardData" in e ? e.clipboardData : window.clipboardData;
      },
    }),
    jv = zt(gv),
    bv = G({}, en, { data: 0 }),
    wd = zt(bv),
    Nv = {
      Esc: "Escape",
      Spacebar: " ",
      Left: "ArrowLeft",
      Up: "ArrowUp",
      Right: "ArrowRight",
      Down: "ArrowDown",
      Del: "Delete",
      Win: "OS",
      Menu: "ContextMenu",
      Apps: "ContextMenu",
      Scroll: "ScrollLock",
      MozPrintableKey: "Unidentified",
    },
    Sv = {
      8: "Backspace",
      9: "Tab",
      12: "Clear",
      13: "Enter",
      16: "Shift",
      17: "Control",
      18: "Alt",
      19: "Pause",
      20: "CapsLock",
      27: "Escape",
      32: " ",
      33: "PageUp",
      34: "PageDown",
      35: "End",
      36: "Home",
      37: "ArrowLeft",
      38: "ArrowUp",
      39: "ArrowRight",
      40: "ArrowDown",
      45: "Insert",
      46: "Delete",
      112: "F1",
      113: "F2",
      114: "F3",
      115: "F4",
      116: "F5",
      117: "F6",
      118: "F7",
      119: "F8",
      120: "F9",
      121: "F10",
      122: "F11",
      123: "F12",
      144: "NumLock",
      145: "ScrollLock",
      224: "Meta",
    },
    Tv = {
      Alt: "altKey",
      Control: "ctrlKey",
      Meta: "metaKey",
      Shift: "shiftKey",
    };
  function Ev(e) {
    var t = this.nativeEvent;
    return t.getModifierState
      ? t.getModifierState(e)
      : (e = Tv[e])
        ? !!t[e]
        : !1;
  }
  function ru() {
    return Ev;
  }
  var Cv = G({}, as, {
      key: function (e) {
        if (e.key) {
          var t = Nv[e.key] || e.key;
          if (t !== "Unidentified") return t;
        }
        return e.type === "keypress"
          ? ((e = xi(e)), e === 13 ? "Enter" : String.fromCharCode(e))
          : e.type === "keydown" || e.type === "keyup"
            ? Sv[e.keyCode] || "Unidentified"
            : "";
      },
      code: 0,
      location: 0,
      ctrlKey: 0,
      shiftKey: 0,
      altKey: 0,
      metaKey: 0,
      repeat: 0,
      locale: 0,
      getModifierState: ru,
      charCode: function (e) {
        return e.type === "keypress" ? xi(e) : 0;
      },
      keyCode: function (e) {
        return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
      },
      which: function (e) {
        return e.type === "keypress"
          ? xi(e)
          : e.type === "keydown" || e.type === "keyup"
            ? e.keyCode
            : 0;
      },
    }),
    wv = zt(Cv),
    _v = G({}, ji, {
      pointerId: 0,
      width: 0,
      height: 0,
      pressure: 0,
      tangentialPressure: 0,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      pointerType: 0,
      isPrimary: 0,
    }),
    _d = zt(_v),
    Av = G({}, en, { submitter: 0 }),
    Rv = zt(Av),
    Dv = G({}, as, {
      touches: 0,
      targetTouches: 0,
      changedTouches: 0,
      altKey: 0,
      metaKey: 0,
      ctrlKey: 0,
      shiftKey: 0,
      getModifierState: ru,
    }),
    Ov = zt(Dv),
    zv = G({}, en, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }),
    Uv = zt(zv),
    Mv = G({}, ji, {
      deltaX: function (e) {
        return "deltaX" in e
          ? e.deltaX
          : "wheelDeltaX" in e
            ? -e.wheelDeltaX
            : 0;
      },
      deltaY: function (e) {
        return "deltaY" in e
          ? e.deltaY
          : "wheelDeltaY" in e
            ? -e.wheelDeltaY
            : "wheelDelta" in e
              ? -e.wheelDelta
              : 0;
      },
      deltaZ: 0,
      deltaMode: 0,
    }),
    qv = zt(Mv),
    Hv = G({}, en, { newState: 0, oldState: 0, source: 0 }),
    Kv = zt(Hv),
    Lv = [9, 13, 27, 32],
    ou = Ul && "CompositionEvent" in window,
    is = null;
  Ul && "documentMode" in document && (is = document.documentMode);
  var Bv = Ul && "TextEvent" in window && !is,
    Ad = Ul && (!ou || (is && 8 < is && 11 >= is)),
    Rd = " ",
    Dd = !1;
  function Od(e, t) {
    switch (e) {
      case "keyup":
        return Lv.indexOf(t.keyCode) !== -1;
      case "keydown":
        return t.keyCode !== 229;
      case "keypress":
      case "mousedown":
      case "focusout":
        return !0;
      default:
        return !1;
    }
  }
  function zd(e) {
    return (
      (e = e.detail),
      typeof e == "object" && "data" in e ? e.data : null
    );
  }
  var ma = !1;
  function kv(e, t) {
    switch (e) {
      case "compositionend":
        return zd(t);
      case "keypress":
        return t.which !== 32 ? null : ((Dd = !0), Rd);
      case "textInput":
        return ((e = t.data), e === Rd && Dd ? null : e);
      default:
        return null;
    }
  }
  function Yv(e, t) {
    if (ma)
      return e === "compositionend" || (!ou && Od(e, t))
        ? ((e = Td()), (vi = su = Pl = null), (ma = !1), e)
        : null;
    switch (e) {
      case "paste":
        return null;
      case "keypress":
        if (!(t.ctrlKey || t.altKey || t.metaKey) || (t.ctrlKey && t.altKey)) {
          if (t.char && 1 < t.char.length) return t.char;
          if (t.which) return String.fromCharCode(t.which);
        }
        return null;
      case "compositionend":
        return Ad && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var Vv = {
    color: !0,
    date: !0,
    datetime: !0,
    "datetime-local": !0,
    email: !0,
    month: !0,
    number: !0,
    password: !0,
    range: !0,
    search: !0,
    tel: !0,
    text: !0,
    time: !0,
    url: !0,
    week: !0,
  };
  function Ud(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t === "input" ? !!Vv[e.type] : t === "textarea";
  }
  function Md(e, t, l, a) {
    (fa ? (ha ? ha.push(a) : (ha = [a])) : (fa = a),
      (t = bc(t, "onChange")),
      0 < t.length &&
        ((l = new gi("onChange", "change", null, l, a)),
        e.push({ event: l, listeners: t })));
  }
  var cs = null,
    us = null;
  function Gv(e) {
    Sm(e, 0);
  }
  function bi(e) {
    var t = ts(e);
    if (vd(t)) return e;
  }
  function qd(e, t) {
    if (e === "change") return t;
  }
  var Hd = !1;
  if (Ul) {
    var du;
    if (Ul) {
      var fu = "oninput" in document;
      if (!fu) {
        var Kd = document.createElement("div");
        (Kd.setAttribute("oninput", "return;"),
          (fu = typeof Kd.oninput == "function"));
      }
      du = fu;
    } else du = !1;
    Hd = du && (!document.documentMode || 9 < document.documentMode);
  }
  function Ld() {
    cs && (cs.detachEvent("onpropertychange", Bd), (us = cs = null));
  }
  function Bd(e) {
    if (e.propertyName === "value" && bi(us)) {
      var t = [];
      (Md(t, us, e, lu(e)), Sd(Gv, t));
    }
  }
  function Qv(e, t, l) {
    e === "focusin"
      ? (Ld(), (cs = t), (us = l), cs.attachEvent("onpropertychange", Bd))
      : e === "focusout" && Ld();
  }
  function Xv(e) {
    if (e === "selectionchange" || e === "keyup" || e === "keydown")
      return bi(us);
  }
  function Zv(e, t) {
    if (e === "click") return bi(t);
  }
  function Jv(e, t) {
    if (e === "input" || e === "change") return bi(t);
  }
  function Iv(e, t) {
    return (e === t && (e !== 0 || 1 / e === 1 / t)) || (e !== e && t !== t);
  }
  var Zt = typeof Object.is == "function" ? Object.is : Iv;
  function rs(e, t) {
    if (Zt(e, t)) return !0;
    if (
      typeof e != "object" ||
      e === null ||
      typeof t != "object" ||
      t === null
    )
      return !1;
    var l = Object.keys(e),
      a = Object.keys(t);
    if (l.length !== a.length) return !1;
    for (a = 0; a < l.length; a++) {
      var s = l[a];
      if (!ta.call(t, s) || !Zt(e[s], t[s])) return !1;
    }
    return !0;
  }
  function hu(e) {
    if (
      ((e = e || (typeof document < "u" ? document : void 0)), typeof e > "u")
    )
      return null;
    try {
      return e.activeElement || e.body;
    } catch {
      return e.body;
    }
  }
  function kd(e) {
    for (; e && e.firstChild; ) e = e.firstChild;
    return e;
  }
  function Yd(e, t) {
    var l = kd(e);
    e = 0;
    for (var a; l; ) {
      if (l.nodeType === 3) {
        if (((a = e + l.textContent.length), e <= t && a >= t))
          return { node: l, offset: t - e };
        e = a;
      }
      e: {
        for (; l; ) {
          if (l.nextSibling) {
            l = l.nextSibling;
            break e;
          }
          l = l.parentNode;
        }
        l = void 0;
      }
      l = kd(l);
    }
  }
  function Vd(e, t) {
    return e && t
      ? e === t
        ? !0
        : e && e.nodeType === 3
          ? !1
          : t && t.nodeType === 3
            ? Vd(e, t.parentNode)
            : "contains" in e
              ? e.contains(t)
              : e.compareDocumentPosition
                ? !!(e.compareDocumentPosition(t) & 16)
                : !1
      : !1;
  }
  function Gd(e) {
    e =
      e != null &&
      e.ownerDocument != null &&
      e.ownerDocument.defaultView != null
        ? e.ownerDocument.defaultView
        : window;
    for (var t = hu(e.document); t instanceof e.HTMLIFrameElement; ) {
      try {
        var l = typeof t.contentWindow.location.href == "string";
      } catch {
        l = !1;
      }
      if (l) e = t.contentWindow;
      else break;
      t = hu(e.document);
    }
    return t;
  }
  function mu(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return (
      t &&
      ((t === "input" &&
        (e.type === "text" ||
          e.type === "search" ||
          e.type === "tel" ||
          e.type === "url" ||
          e.type === "password")) ||
        t === "textarea" ||
        e.contentEditable === "true")
    );
  }
  var $v = Ul && "documentMode" in document && 11 >= document.documentMode,
    pa = null,
    pu = null,
    os = null,
    vu = !1;
  function Qd(e, t, l) {
    var a =
      l.window === l ? l.document : l.nodeType === 9 ? l : l.ownerDocument;
    vu ||
      pa == null ||
      pa !== hu(a) ||
      ((a = pa),
      "selectionStart" in a && mu(a)
        ? (a = { start: a.selectionStart, end: a.selectionEnd })
        : ((a = (
            (a.ownerDocument && a.ownerDocument.defaultView) ||
            window
          ).getSelection()),
          (a = {
            anchorNode: a.anchorNode,
            anchorOffset: a.anchorOffset,
            focusNode: a.focusNode,
            focusOffset: a.focusOffset,
          })),
      (os && rs(os, a)) ||
        ((os = a),
        (a = bc(pu, "onSelect")),
        0 < a.length &&
          ((t = new gi("onSelect", "select", null, t, l)),
          e.push({ event: t, listeners: a }),
          (t.target = pa))));
  }
  function Un(e, t) {
    var l = {};
    return (
      (l[e.toLowerCase()] = t.toLowerCase()),
      (l["Webkit" + e] = "webkit" + t),
      (l["Moz" + e] = "moz" + t),
      l
    );
  }
  var va = {
      animationend: Un("Animation", "AnimationEnd"),
      animationiteration: Un("Animation", "AnimationIteration"),
      animationstart: Un("Animation", "AnimationStart"),
      transitionrun: Un("Transition", "TransitionRun"),
      transitionstart: Un("Transition", "TransitionStart"),
      transitioncancel: Un("Transition", "TransitionCancel"),
      transitionend: Un("Transition", "TransitionEnd"),
    },
    xu = {},
    Xd = {};
  Ul &&
    ((Xd = document.createElement("div").style),
    "AnimationEvent" in window ||
      (delete va.animationend.animation,
      delete va.animationiteration.animation,
      delete va.animationstart.animation),
    "TransitionEvent" in window || delete va.transitionend.transition);
  function Mn(e) {
    if (xu[e]) return xu[e];
    if (!va[e]) return e;
    var t = va[e],
      l;
    for (l in t) if (t.hasOwnProperty(l) && l in Xd) return (xu[e] = t[l]);
    return e;
  }
  var Zd = Mn("animationend"),
    Jd = Mn("animationiteration"),
    Id = Mn("animationstart"),
    Fv = Mn("transitionrun"),
    Wv = Mn("transitionstart"),
    Pv = Mn("transitioncancel"),
    $d = Mn("transitionend"),
    Fd = new Map(),
    yu =
      "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error fullscreenChange fullscreenError gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
        " ",
      );
  yu.push("scrollEnd");
  function hl(e, t) {
    (Fd.set(e, t), zn(t, [e]));
  }
  var ex = 0;
  function Ml(e, t) {
    if (e.name != null && e.name !== "auto") return e.name;
    if (t.autoName !== null) return t.autoName;
    e = xl.identifierPrefix;
    var l = ex++;
    return ((e = "_" + e + "t_" + l.toString(32) + "_"), (t.autoName = e));
  }
  function Wd(e) {
    if (e == null || typeof e == "string") return e;
    var t = null,
      l = qa;
    if (l !== null)
      for (var a = 0; a < l.length; a++) {
        var s = e[l[a]];
        if (s != null) {
          if (s === "none") return "none";
          t = t == null ? s : t + (" " + s);
        }
      }
    return t ?? e.default;
  }
  function ql(e, t) {
    return (
      (e = Wd(e)),
      (t = Wd(t)),
      t == null ? (e === "auto" ? null : e) : t === "auto" ? null : t
    );
  }
  var Ni =
      typeof reportError == "function"
        ? reportError
        : function (e) {
            if (
              typeof window == "object" &&
              typeof window.ErrorEvent == "function"
            ) {
              var t = new window.ErrorEvent("error", {
                bubbles: !0,
                cancelable: !0,
                message:
                  typeof e == "object" &&
                  e !== null &&
                  typeof e.message == "string"
                    ? String(e.message)
                    : String(e),
                error: e,
              });
              if (!window.dispatchEvent(t)) return;
            } else if (
              typeof process == "object" &&
              typeof process.emit == "function"
            ) {
              process.emit("uncaughtException", e);
              return;
            }
            console.error(e);
          },
    ll = [],
    xa = 0,
    gu = 0;
  function Si() {
    for (var e = xa, t = (gu = xa = 0); t < e; ) {
      var l = ll[t];
      ll[t++] = null;
      var a = ll[t];
      ll[t++] = null;
      var s = ll[t];
      ll[t++] = null;
      var i = ll[t];
      if (((ll[t++] = null), a !== null && s !== null)) {
        var u = a.pending;
        (u === null ? (s.next = s) : ((s.next = u.next), (u.next = s)),
          (a.pending = s));
      }
      i !== 0 && Pd(l, s, i);
    }
  }
  function Ti(e, t, l, a) {
    ((ll[xa++] = e),
      (ll[xa++] = t),
      (ll[xa++] = l),
      (ll[xa++] = a),
      (gu |= a),
      (e.lanes |= a),
      (e = e.alternate),
      e !== null && (e.lanes |= a));
  }
  function ju(e, t, l, a) {
    return (Ti(e, t, l, a), Ei(e));
  }
  function qn(e, t) {
    return (Ti(e, null, null, t), Ei(e));
  }
  function Pd(e, t, l) {
    e.lanes |= l;
    var a = e.alternate;
    a !== null && (a.lanes |= l);
    for (var s = !1, i = e.return; i !== null; )
      ((i.childLanes |= l),
        (a = i.alternate),
        a !== null && (a.childLanes |= l),
        i.tag === 22 &&
          ((e = i.stateNode), e === null || e._visibility & 1 || (s = !0)),
        (e = i),
        (i = i.return));
    return e.tag === 3
      ? ((i = e.stateNode),
        s &&
          t !== null &&
          ((s = 31 - Oe(l)),
          (e = i.hiddenUpdates),
          (a = e[s]),
          a === null ? (e[s] = [t]) : a.push(t),
          (t.lane = l | 536870912)),
        i)
      : null;
  }
  function Ei(e) {
    if (50 < Os) throw ((Os = 0), (mc = null), Error(r(185)));
    for (var t = e.return; t !== null; ) ((e = t), (t = e.return));
    return e.tag === 3 ? e.stateNode : null;
  }
  var ya = {};
  function tx(e, t, l, a) {
    ((this.tag = e),
      (this.key = l),
      (this.sibling =
        this.child =
        this.return =
        this.stateNode =
        this.type =
        this.elementType =
          null),
      (this.index = 0),
      (this.refCleanup = this.ref = null),
      (this.pendingProps = t),
      (this.dependencies =
        this.memoizedState =
        this.updateQueue =
        this.memoizedProps =
          null),
      (this.mode = a),
      (this.subtreeFlags = this.flags = 0),
      (this.deletions = null),
      (this.childLanes = this.lanes = 0),
      (this.alternate = null));
  }
  function Lt(e, t, l, a) {
    return new tx(e, t, l, a);
  }
  function bu(e) {
    return ((e = e.prototype), !(!e || !e.isReactComponent));
  }
  function Hl(e, t) {
    var l = e.alternate;
    return (
      l === null
        ? ((l = Lt(e.tag, t, e.key, e.mode)),
          (l.elementType = e.elementType),
          (l.type = e.type),
          (l.stateNode = e.stateNode),
          (l.alternate = e),
          (e.alternate = l))
        : ((l.pendingProps = t),
          (l.type = e.type),
          (l.flags = 0),
          (l.subtreeFlags = 0),
          (l.deletions = null)),
      (l.flags = e.flags & 1206910976),
      (l.childLanes = e.childLanes),
      (l.lanes = e.lanes),
      (l.child = e.child),
      (l.memoizedProps = e.memoizedProps),
      (l.memoizedState = e.memoizedState),
      (l.updateQueue = e.updateQueue),
      (t = e.dependencies),
      (l.dependencies =
        t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }),
      (l.sibling = e.sibling),
      (l.index = e.index),
      (l.ref = e.ref),
      (l.refCleanup = e.refCleanup),
      l
    );
  }
  function ef(e, t) {
    e.flags &= 1206910978;
    var l = e.alternate;
    return (
      l === null
        ? ((e.childLanes = 0),
          (e.lanes = t),
          (e.child = null),
          (e.subtreeFlags = 0),
          (e.memoizedProps = null),
          (e.memoizedState = null),
          (e.updateQueue = null),
          (e.dependencies = null),
          (e.stateNode = null))
        : ((e.childLanes = l.childLanes),
          (e.lanes = l.lanes),
          (e.child = l.child),
          (e.subtreeFlags = 0),
          (e.deletions = null),
          (e.memoizedProps = l.memoizedProps),
          (e.memoizedState = l.memoizedState),
          (e.updateQueue = l.updateQueue),
          (e.type = l.type),
          (t = l.dependencies),
          (e.dependencies =
            t === null
              ? null
              : { lanes: t.lanes, firstContext: t.firstContext })),
      e
    );
  }
  function Ci(e, t, l, a, s, i) {
    var u = 0;
    if (((a = e), typeof a == "function")) bu(a) && (u = 1);
    else if (typeof a == "string")
      u = Ay(e, l, Le.current)
        ? 26
        : e === "html" || e === "head" || e === "body"
          ? 27
          : 5;
    else
      e: switch (a) {
        case ce:
          return (
            (e = Lt(31, l, t, s)),
            (e.elementType = ce),
            (e.lanes = i),
            e
          );
        case H:
          return Hn(l.children, s, i, t);
        case fe:
          ((u = 8), (s |= 24));
          break;
        case Y:
          return (
            (e = Lt(12, l, t, s | 2)),
            (e.elementType = Y),
            (e.lanes = i),
            e
          );
        case W:
          return ((e = Lt(13, l, t, s)), (e.elementType = W), (e.lanes = i), e);
        case he:
          return (
            (e = Lt(19, l, t, s)),
            (e.elementType = he),
            (e.lanes = i),
            e
          );
        case B:
        case v:
          return (
            (e = s | 32),
            (e = Lt(30, l, t, e)),
            (e.elementType = v),
            (e.lanes = i),
            (e.stateNode = {
              autoName: null,
              paired: null,
              clones: null,
              ref: null,
            }),
            e
          );
        default:
          if (typeof a == "object" && a !== null)
            switch (a.$$typeof) {
              case ae:
                u = 10;
                break e;
              case xe:
                u = 9;
                break e;
              case V:
                u = 11;
                break e;
              case ve:
                u = 14;
                break e;
              case oe:
                ((u = 16), (a = null));
                break e;
            }
          ((u = 29),
            (l = Error(r(130, e === null ? "null" : typeof e, ""))),
            (a = null));
      }
    return (
      (t = Lt(u, l, t, s)),
      (t.elementType = e),
      (t.type = a),
      (t.lanes = i),
      t
    );
  }
  function Hn(e, t, l, a) {
    return ((e = Lt(7, e, a, t)), (e.lanes = l), e);
  }
  function Nu(e, t, l) {
    return ((e = Lt(6, e, null, t)), (e.lanes = l), e);
  }
  function tf(e) {
    var t = Lt(18, null, null, 0);
    return ((t.stateNode = e), t);
  }
  function Su(e, t, l) {
    return (
      (t = Lt(4, e.children !== null ? e.children : [], e.key, t)),
      (t.lanes = l),
      (t.stateNode = {
        containerInfo: e.containerInfo,
        pendingChildren: null,
        implementation: e.implementation,
      }),
      t
    );
  }
  var lf = new WeakMap();
  function nl(e, t) {
    if (typeof e == "object" && e !== null) {
      var l = lf.get(e);
      return l !== void 0
        ? l
        : ((t = { value: e, source: t, stack: $l(t) }), lf.set(e, t), t);
    }
    return { value: e, source: t, stack: $l(t) };
  }
  var ga = [],
    ja = 0,
    wi = null,
    ds = 0,
    al = [],
    sl = 0,
    tn = null,
    bl = 1,
    Nl = "";
  function Kl(e, t) {
    ((ga[ja++] = ds), (ga[ja++] = wi), (wi = e), (ds = t));
  }
  function nf(e, t, l) {
    ((al[sl++] = bl), (al[sl++] = Nl), (al[sl++] = tn), (tn = e));
    var a = bl;
    e = Nl;
    var s = 32 - Oe(a) - 1;
    ((a &= ~(1 << s)), (l += 1));
    var i = 32 - Oe(t) + s;
    if (30 < i) {
      var u = s - (s % 5);
      ((i = (a & ((1 << u) - 1)).toString(32)),
        (a >>= u),
        (s -= u),
        (bl = (1 << (32 - Oe(t) + s)) | (l << s) | a),
        (Nl = i + e));
    } else ((bl = (1 << i) | (l << s) | a), (Nl = e));
  }
  function _i(e) {
    e.return !== null && (Kl(e, 1), nf(e, 1, 0));
  }
  function Tu(e) {
    for (; e === wi; )
      ((wi = ga[--ja]), (ga[ja] = null), (ds = ga[--ja]), (ga[ja] = null));
    for (; e === tn; )
      ((tn = al[--sl]),
        (al[sl] = null),
        (Nl = al[--sl]),
        (al[sl] = null),
        (bl = al[--sl]),
        (al[sl] = null));
  }
  function af(e, t) {
    ((al[sl++] = bl),
      (al[sl++] = Nl),
      (al[sl++] = tn),
      (bl = t.id),
      (Nl = t.overflow),
      (tn = e));
  }
  var yt = null,
    tt = null,
    qe = !1,
    ln = null,
    il = !1,
    Eu = Error(r(519));
  function nn(e) {
    var t = Error(
      r(
        418,
        1 < arguments.length && arguments[1] !== void 0 && arguments[1]
          ? "text"
          : "HTML",
        "",
      ),
    );
    throw (fs(nl(t, e)), Eu);
  }
  function sf(e) {
    var t = e.stateNode,
      l = e.type,
      a = e.memoizedProps;
    switch (((t[St] = e), (t[Kt] = a), l)) {
      case "dialog":
        (Ke("cancel", t), Ke("close", t));
        break;
      case "iframe":
      case "object":
      case "embed":
        Ke("load", t);
        break;
      case "video":
      case "audio":
        for (l = 0; l < Us.length; l++) Ke(Us[l], t);
        break;
      case "source":
        Ke("error", t);
        break;
      case "img":
      case "image":
      case "link":
        (Ke("error", t), Ke("load", t));
        break;
      case "details":
        Ke("toggle", t);
        break;
      case "input":
        (Ke("invalid", t),
          xd(
            t,
            a.value,
            a.defaultValue,
            a.checked,
            a.defaultChecked,
            a.type,
            a.name,
            !0,
          ));
        break;
      case "select":
        Ke("invalid", t);
        break;
      case "textarea":
        (Ke("invalid", t), gd(t, a.value, a.defaultValue, a.children));
    }
    ((l = a.children),
      (typeof l != "string" && typeof l != "number" && typeof l != "bigint") ||
      t.textContent === "" + l ||
      a.suppressHydrationWarning === !0 ||
      wm(t.textContent, l)
        ? (a.popover != null && (Ke("beforetoggle", t), Ke("toggle", t)),
          a.onScroll != null && Ke("scroll", t),
          a.onScrollEnd != null && Ke("scrollend", t),
          a.onClick != null && (t.onclick = jl),
          (t = !0))
        : (t = !1),
      t || nn(e, !0));
  }
  function Ai(e) {
    for (yt = e.return; yt; )
      switch (yt.tag) {
        case 5:
        case 31:
        case 13:
          il = !1;
          return;
        case 27:
        case 3:
          il = !0;
          return;
        default:
          yt = yt.return;
      }
  }
  function ba(e) {
    if (e !== yt) return !1;
    if (!qe) return (Ai(e), (qe = !0), !1);
    var t = e.tag,
      l;
    if (
      ((l = t !== 3 && t !== 27) &&
        ((l = t === 5) &&
          ((l = e.type),
          (l =
            !(l !== "form" && l !== "button") || to(e.type, e.memoizedProps))),
        (l = !l)),
      l && tt && nn(e),
      Ai(e),
      t === 13)
    ) {
      if (((e = e.memoizedState), (e = e !== null ? e.dehydrated : null), !e))
        throw Error(r(317));
      tt = Xm(e);
    } else if (t === 31) {
      if (((e = e.memoizedState), (e = e !== null ? e.dehydrated : null), !e))
        throw Error(r(317));
      tt = Xm(e);
    } else
      t === 27
        ? ((t = tt), jn(e.type) ? ((e = oo), (oo = null), (tt = e)) : (tt = t))
        : (tt = yt ? ul(e.stateNode.nextSibling) : null);
    return !0;
  }
  function Kn() {
    ((tt = yt = null), (qe = !1));
  }
  function Cu() {
    var e = ln;
    return (
      e !== null &&
        (Yt === null ? (Yt = e) : Yt.push.apply(Yt, e), (ln = null)),
      e
    );
  }
  function fs(e) {
    ln === null ? (ln = [e]) : ln.push(e);
  }
  var wu = Ve(null),
    Ln = null,
    Ll = null;
  function an(e, t, l) {
    (we(wu, t._currentValue), (t._currentValue = l));
  }
  function Bl(e) {
    ((e._currentValue = wu.current), De(wu));
  }
  function Ri(e, t, l) {
    for (; e !== null; ) {
      var a = e.alternate;
      if (
        ((e.childLanes & t) !== t
          ? ((e.childLanes |= t), a !== null && (a.childLanes |= t))
          : a !== null && (a.childLanes & t) !== t && (a.childLanes |= t),
        e === l)
      )
        break;
      e = e.return;
    }
  }
  function _u(e, t, l, a) {
    var s = e.child;
    for (s !== null && (s.return = e); s !== null; ) {
      var i = s.dependencies;
      if (i !== null) {
        var u = s.child;
        i = i.firstContext;
        e: for (; i !== null; ) {
          var o = i;
          i = s;
          for (var x = 0; x < t.length; x++)
            if (o.context === t[x]) {
              ((i.lanes |= l),
                (o = i.alternate),
                o !== null && (o.lanes |= l),
                Ri(i.return, l, e),
                a || (u = null));
              break e;
            }
          i = o.next;
        }
      } else if (s.tag === 18) {
        if (((u = s.return), u === null)) throw Error(r(341));
        ((u.lanes |= l),
          (i = u.alternate),
          i !== null && (i.lanes |= l),
          Ri(u, l, e),
          (u = null));
      } else
        s.tag === 13 &&
        s.memoizedState !== null &&
        s.memoizedState.dehydrated === null
          ? ((s.lanes |= l),
            (u = s.alternate),
            u !== null && (u.lanes |= l),
            Ri(s.return, l, e),
            (u = s.child),
            (u = u !== null ? u.sibling : null))
          : (u = s.child);
      if (u !== null) u.return = s;
      else
        for (u = s; u !== null; ) {
          if (u === e) {
            u = null;
            break;
          }
          if (((s = u.sibling), s !== null)) {
            ((s.return = u.return), (u = s));
            break;
          }
          u = u.return;
        }
      s = u;
    }
  }
  function Bn(e, t, l, a) {
    e = null;
    for (var s = t, i = !1; s !== null; ) {
      if (!i) {
        if ((s.flags & 524288) !== 0) i = !0;
        else if ((s.flags & 262144) !== 0) break;
      }
      if (s.tag === 10) {
        var u = s.alternate;
        if (u === null) throw Error(r(387));
        if (((u = u.memoizedProps), u !== null)) {
          var o = s.type;
          Zt(s.pendingProps.value, u.value) ||
            (e !== null ? e.push(o) : (e = [o]));
        }
      } else if (s === Ee.current) {
        if (((u = s.alternate), u === null)) throw Error(r(387));
        u.memoizedState.memoizedState !== s.memoizedState.memoizedState &&
          (e !== null ? e.push(Xa) : (e = [Xa]));
      }
      s = s.return;
    }
    return (e !== null && _u(t, e, l, a), (t.flags |= 262144), e !== null);
  }
  function Di(e) {
    for (e = e.firstContext; e !== null; ) {
      if (!Zt(e.context._currentValue, e.memoizedValue)) return !0;
      e = e.next;
    }
    return !1;
  }
  function kn(e) {
    ((Ln = e),
      (Ll = null),
      (e = e.dependencies),
      e !== null && (e.firstContext = null));
  }
  function Tt(e) {
    return cf(Ln, e);
  }
  function Oi(e, t) {
    return (Ln === null && kn(e), cf(e, t));
  }
  function cf(e, t) {
    var l = t._currentValue;
    if (((t = { context: t, memoizedValue: l, next: null }), Ll === null)) {
      if (e === null) throw Error(r(308));
      ((Ll = t),
        (e.dependencies = { lanes: 0, firstContext: t }),
        (e.flags |= 524288));
    } else Ll = Ll.next = t;
    return l;
  }
  var lx =
      typeof AbortController < "u"
        ? AbortController
        : function () {
            var e = [],
              t = (this.signal = {
                aborted: !1,
                addEventListener: function (l, a) {
                  e.push(a);
                },
              });
            this.abort = function () {
              ((t.aborted = !0),
                e.forEach(function (l) {
                  return l();
                }));
            };
          },
    nx = c.unstable_scheduleCallback,
    ax = c.unstable_NormalPriority,
    dt = {
      $$typeof: ae,
      Consumer: null,
      Provider: null,
      _currentValue: null,
      _currentValue2: null,
      _threadCount: 0,
    };
  function Au() {
    return { controller: new lx(), data: new Map(), refCount: 0 };
  }
  function hs(e) {
    (e.refCount--,
      e.refCount === 0 &&
        nx(ax, function () {
          e.controller.abort();
        }));
  }
  function uf(e, t) {
    if ((e.pendingLanes & 4194048) !== 0) {
      var l = e.transitionTypes;
      for (
        l === null && (l = e.transitionTypes = []), e = 0;
        e < t.length;
        e++
      ) {
        var a = t[e];
        l.indexOf(a) === -1 && l.push(a);
      }
    }
  }
  var ms = null;
  function sx(e) {
    var t = e.transitionTypes;
    return ((e.transitionTypes = null), t);
  }
  var ps = null,
    Ru = 0,
    Yn = 0,
    Na = null;
  function ix(e, t) {
    if (ps === null) {
      var l = (ps = []);
      ((Ru = 0),
        (Yn = Xr()),
        (Na = {
          status: "pending",
          value: void 0,
          then: function (a) {
            l.push(a);
          },
        }));
    }
    return (Ru++, t.then(rf, rf), t);
  }
  function rf() {
    if (--Ru === 0 && ((ms = null), ps !== null)) {
      Na !== null && (Na.status = "fulfilled");
      var e = ps;
      ((ps = null), (Yn = 0), (Na = null));
      for (var t = 0; t < e.length; t++) (0, e[t])();
    }
  }
  function cx(e, t) {
    var l = [],
      a = {
        status: "pending",
        value: null,
        reason: null,
        then: function (s) {
          l.push(s);
        },
      };
    return (
      e.then(
        function () {
          ((a.status = "fulfilled"), (a.value = t));
          for (var s = 0; s < l.length; s++) (0, l[s])(t);
        },
        function (s) {
          for (a.status = "rejected", a.reason = s, s = 0; s < l.length; s++)
            (0, l[s])(void 0);
        },
      ),
      a
    );
  }
  var of = ne.S;
  ne.S = function (e, t) {
    if (
      ((lm = Nt()),
      typeof t == "object" &&
        t !== null &&
        typeof t.then == "function" &&
        ix(e, t),
      ms !== null)
    )
      for (var l = Ba; l !== null; ) (uf(l, ms), (l = l.next));
    if (((l = e.types), l !== null)) {
      for (var a = Ba; a !== null; ) (uf(a, l), (a = a.next));
      if (Yn !== 0) {
        ((a = ms), a === null && (a = ms = []));
        for (var s = 0; s < l.length; s++) {
          var i = l[s];
          a.indexOf(i) === -1 && a.push(i);
        }
      }
    }
    of !== null && of(e, t);
  };
  var Vn = Ve(null);
  function Du() {
    var e = Vn.current;
    return e !== null ? e : Pe.pooledCache;
  }
  function zi(e, t) {
    t === null ? we(Vn, Vn.current) : we(Vn, t.pool);
  }
  function df() {
    var e = Du();
    return e === null ? null : { parent: dt._currentValue, pool: e };
  }
  var Sa = Error(r(460)),
    Ou = Error(r(474)),
    Ui = Error(r(542)),
    Mi = { then: function () {} };
  function ff(e) {
    return ((e = e.status), e === "fulfilled" || e === "rejected");
  }
  function hf(e, t, l) {
    switch (
      ((l = e[l]),
      l === void 0 ? e.push(t) : l !== t && (t.then(jl, jl), (t = l)),
      t.status)
    ) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw (
          (e = t.reason),
          pf(e),
          e === void 0 && !("reason" in t) ? Error(r(600)) : e
        );
      default:
        if (typeof t.status == "string") t.then(jl, jl);
        else {
          if (((e = Pe), e !== null && 100 < e.shellSuspendCounter))
            throw Error(r(482));
          ((e = t),
            (e.status = "pending"),
            e.then(
              function (a) {
                if (t.status === "pending") {
                  var s = t;
                  ((s.status = "fulfilled"), (s.value = a));
                }
              },
              function (a) {
                if (t.status === "pending") {
                  var s = t;
                  ((s.status = "rejected"), (s.reason = a));
                }
              },
            ));
        }
        switch (t.status) {
          case "fulfilled":
            return t.value;
          case "rejected":
            throw ((e = t.reason), pf(e), e);
        }
        throw ((Qn = t), Sa);
    }
  }
  function Gn(e) {
    try {
      var t = e._init;
      return t(e._payload);
    } catch (l) {
      throw l !== null && typeof l == "object" && typeof l.then == "function"
        ? ((Qn = l), Sa)
        : l;
    }
  }
  var Qn = null;
  function mf() {
    if (Qn === null) throw Error(r(459));
    var e = Qn;
    return ((Qn = null), e);
  }
  function pf(e) {
    if (e === Sa || e === Ui) throw Error(r(483));
  }
  var Ta = null,
    vs = 0;
  function qi(e) {
    var t = vs;
    return ((vs += 1), Ta === null && (Ta = []), hf(Ta, e, t));
  }
  function sn(e, t) {
    ((t = t.props.ref), (e.ref = t !== void 0 ? t : null));
  }
  function Hi(e, t) {
    throw t.$$typeof === E
      ? Error(r(525))
      : ((e = Object.prototype.toString.call(t)),
        Error(
          r(
            31,
            e === "[object Object]"
              ? "object with keys {" + Object.keys(t).join(", ") + "}"
              : e,
          ),
        ));
  }
  function vf(e) {
    function t(C, N) {
      if (e) {
        var A = C.deletions;
        A === null ? ((C.deletions = [N]), (C.flags |= 16)) : A.push(N);
      }
    }
    function l(C, N) {
      if (!e) return null;
      for (; N !== null; ) (t(C, N), (N = N.sibling));
      return null;
    }
    function a(C) {
      for (var N = new Map(); C !== null; )
        (C.key === null ? N.set(C.index, C) : N.set(C.key, C), (C = C.sibling));
      return N;
    }
    function s(C, N) {
      return ((C = Hl(C, N)), (C.index = 0), (C.sibling = null), C);
    }
    function i(C, N, A) {
      return (
        (C.index = A),
        e
          ? ((A = C.alternate),
            A !== null
              ? ((A = A.index), A < N ? ((C.flags |= 2), N) : A)
              : ((C.flags |= 134217730), N))
          : ((C.flags |= 1048576), N)
      );
    }
    function u(C) {
      return (e && C.alternate === null && (C.flags |= 134217730), C);
    }
    function o(C, N, A, Q) {
      return N === null || N.tag !== 6
        ? ((N = Nu(A, C.mode, Q)), (N.return = C), N)
        : ((N = s(N, A)), (N.return = C), N);
    }
    function x(C, N, A, Q) {
      var ge = A.type;
      return ge === H
        ? ((C = q(C, N, A.props.children, Q, A.key)), sn(C, A), C)
        : N !== null &&
            (N.elementType === ge ||
              (typeof ge == "object" &&
                ge !== null &&
                ge.$$typeof === oe &&
                Gn(ge) === N.type))
          ? ((N = s(N, A.props)), sn(N, A), (N.return = C), N)
          : ((N = Ci(A.type, A.key, A.props, null, C.mode, Q)),
            sn(N, A),
            (N.return = C),
            N);
    }
    function w(C, N, A, Q) {
      return N === null ||
        N.tag !== 4 ||
        N.stateNode.containerInfo !== A.containerInfo ||
        N.stateNode.implementation !== A.implementation
        ? ((N = Su(A, C.mode, Q)), (N.return = C), N)
        : ((N = s(N, A.children || [])), (N.return = C), N);
    }
    function q(C, N, A, Q, ge) {
      return N === null || N.tag !== 7
        ? ((N = Hn(A, C.mode, Q, ge)), (N.return = C), N)
        : ((N = s(N, A)), (N.return = C), N);
    }
    function X(C, N, A) {
      if (
        (typeof N == "string" && N !== "") ||
        typeof N == "number" ||
        typeof N == "bigint"
      )
        return ((N = Nu("" + N, C.mode, A)), (N.return = C), N);
      if (typeof N == "object" && N !== null) {
        switch (N.$$typeof) {
          case se:
            return (
              (A = Ci(N.type, N.key, N.props, null, C.mode, A)),
              sn(A, N),
              (A.return = C),
              A
            );
          case P:
            return ((N = Su(N, C.mode, A)), (N.return = C), N);
          case oe:
            return ((N = Gn(N)), X(C, N, A));
        }
        if (Te(N) || _(N))
          return ((N = Hn(N, C.mode, A, null)), (N.return = C), N);
        if (typeof N.then == "function") return X(C, qi(N), A);
        if (N.$$typeof === ae) return X(C, Oi(C, N), A);
        Hi(C, N);
      }
      return null;
    }
    function T(C, N, A, Q) {
      var ge = N !== null ? N.key : null;
      if (
        (typeof A == "string" && A !== "") ||
        typeof A == "number" ||
        typeof A == "bigint"
      )
        return ge !== null ? null : o(C, N, "" + A, Q);
      if (typeof A == "object" && A !== null) {
        switch (A.$$typeof) {
          case se:
            return A.key === ge ? x(C, N, A, Q) : null;
          case P:
            return A.key === ge ? w(C, N, A, Q) : null;
          case oe:
            return ((A = Gn(A)), T(C, N, A, Q));
        }
        if (Te(A) || _(A)) return ge !== null ? null : q(C, N, A, Q, null);
        if (typeof A.then == "function") return T(C, N, qi(A), Q);
        if (A.$$typeof === ae) return T(C, N, Oi(C, A), Q);
        Hi(C, A);
      }
      return null;
    }
    function z(C, N, A, Q, ge) {
      if (
        (typeof Q == "string" && Q !== "") ||
        typeof Q == "number" ||
        typeof Q == "bigint"
      )
        return ((C = C.get(A) || null), o(N, C, "" + Q, ge));
      if (typeof Q == "object" && Q !== null) {
        switch (Q.$$typeof) {
          case se:
            return (
              (C = C.get(Q.key === null ? A : Q.key) || null),
              x(N, C, Q, ge)
            );
          case P:
            return (
              (C = C.get(Q.key === null ? A : Q.key) || null),
              w(N, C, Q, ge)
            );
          case oe:
            return ((Q = Gn(Q)), z(C, N, A, Q, ge));
        }
        if (Te(Q) || _(Q))
          return ((C = C.get(A) || null), q(N, C, Q, ge, null));
        if (typeof Q.then == "function") return z(C, N, A, qi(Q), ge);
        if (Q.$$typeof === ae) return z(C, N, A, Oi(N, Q), ge);
        Hi(N, Q);
      }
      return null;
    }
    function me(C, N, A, Q) {
      for (
        var ge = null, ke = null, Ce = N, _e = (N = 0), mt = null;
        Ce !== null && _e < A.length;
        _e++
      ) {
        Ce.index > _e ? ((mt = Ce), (Ce = null)) : (mt = Ce.sibling);
        var Ge = T(C, Ce, A[_e], Q);
        if (Ge === null) {
          Ce === null && (Ce = mt);
          break;
        }
        (e && Ce && Ge.alternate === null && t(C, Ce),
          (N = i(Ge, N, _e)),
          ke === null ? (ge = Ge) : (ke.sibling = Ge),
          (ke = Ge),
          (Ce = mt));
      }
      if (_e === A.length) return (l(C, Ce), qe && Kl(C, _e), ge);
      if (Ce === null) {
        for (; _e < A.length; _e++)
          ((Ce = X(C, A[_e], Q)),
            Ce !== null &&
              ((N = i(Ce, N, _e)),
              ke === null ? (ge = Ce) : (ke.sibling = Ce),
              (ke = Ce)));
        return (qe && Kl(C, _e), ge);
      }
      for (Ce = a(Ce); _e < A.length; _e++)
        ((mt = z(Ce, C, _e, A[_e], Q)),
          mt !== null &&
            (e &&
              ((Ge = mt.alternate),
              Ge !== null && Ce.delete(Ge.key === null ? _e : Ge.key)),
            (N = i(mt, N, _e)),
            ke === null ? (ge = mt) : (ke.sibling = mt),
            (ke = mt)));
      return (
        e &&
          Ce.forEach(function (En) {
            return t(C, En);
          }),
        qe && Kl(C, _e),
        ge
      );
    }
    function be(C, N, A, Q) {
      if (A == null) throw Error(r(151));
      for (
        var ge = null,
          ke = null,
          Ce = N,
          _e = (N = 0),
          mt = null,
          Ge = A.next();
        Ce !== null && !Ge.done;
        _e++, Ge = A.next()
      ) {
        Ce.index > _e ? ((mt = Ce), (Ce = null)) : (mt = Ce.sibling);
        var En = T(C, Ce, Ge.value, Q);
        if (En === null) {
          Ce === null && (Ce = mt);
          break;
        }
        (e && Ce && En.alternate === null && t(C, Ce),
          (N = i(En, N, _e)),
          ke === null ? (ge = En) : (ke.sibling = En),
          (ke = En),
          (Ce = mt));
      }
      if (Ge.done) return (l(C, Ce), qe && Kl(C, _e), ge);
      if (Ce === null) {
        for (; !Ge.done; _e++, Ge = A.next())
          ((Ge = X(C, Ge.value, Q)),
            Ge !== null &&
              ((N = i(Ge, N, _e)),
              ke === null ? (ge = Ge) : (ke.sibling = Ge),
              (ke = Ge)));
        return (qe && Kl(C, _e), ge);
      }
      for (Ce = a(Ce); !Ge.done; _e++, Ge = A.next())
        ((Ge = z(Ce, C, _e, Ge.value, Q)),
          Ge !== null &&
            (e &&
              ((mt = Ge.alternate),
              mt !== null && Ce.delete(mt.key === null ? _e : mt.key)),
            (N = i(Ge, N, _e)),
            ke === null ? (ge = Ge) : (ke.sibling = Ge),
            (ke = Ge)));
      return (
        e &&
          Ce.forEach(function (ky) {
            return t(C, ky);
          }),
        qe && Kl(C, _e),
        ge
      );
    }
    function Me(C, N, A, Q) {
      if (
        (typeof A == "object" &&
          A !== null &&
          A.type === H &&
          A.key === null &&
          A.props.ref === void 0 &&
          (A = A.props.children),
        typeof A == "object" && A !== null)
      ) {
        switch (A.$$typeof) {
          case se:
            e: {
              for (var ge = A.key; N !== null; ) {
                if (N.key === ge) {
                  if (((ge = A.type), ge === H)) {
                    if (N.tag === 7) {
                      (l(C, N.sibling),
                        (Q = s(N, A.props.children)),
                        sn(Q, A),
                        (Q.return = C),
                        (C = Q));
                      break e;
                    }
                  } else if (
                    N.elementType === ge ||
                    (typeof ge == "object" &&
                      ge !== null &&
                      ge.$$typeof === oe &&
                      Gn(ge) === N.type)
                  ) {
                    (l(C, N.sibling),
                      (Q = s(N, A.props)),
                      sn(Q, A),
                      (Q.return = C),
                      (C = Q));
                    break e;
                  }
                  l(C, N);
                  break;
                } else t(C, N);
                N = N.sibling;
              }
              A.type === H
                ? ((Q = Hn(A.props.children, C.mode, Q, A.key)),
                  sn(Q, A),
                  (Q.return = C),
                  (C = Q))
                : ((Q = Ci(A.type, A.key, A.props, null, C.mode, Q)),
                  sn(Q, A),
                  (Q.return = C),
                  (C = Q));
            }
            return u(C);
          case P:
            e: {
              for (ge = A.key; N !== null; ) {
                if (N.key === ge)
                  if (
                    N.tag === 4 &&
                    N.stateNode.containerInfo === A.containerInfo &&
                    N.stateNode.implementation === A.implementation
                  ) {
                    (l(C, N.sibling),
                      (Q = s(N, A.children || [])),
                      (Q.return = C),
                      (C = Q));
                    break e;
                  } else {
                    l(C, N);
                    break;
                  }
                else t(C, N);
                N = N.sibling;
              }
              ((Q = Su(A, C.mode, Q)), (Q.return = C), (C = Q));
            }
            return u(C);
          case oe:
            return ((A = Gn(A)), Me(C, N, A, Q));
        }
        if (Te(A)) return me(C, N, A, Q);
        if (_(A)) {
          if (((ge = _(A)), typeof ge != "function")) throw Error(r(150));
          return ((A = ge.call(A)), be(C, N, A, Q));
        }
        if (typeof A.then == "function") return Me(C, N, qi(A), Q);
        if (A.$$typeof === ae) return Me(C, N, Oi(C, A), Q);
        Hi(C, A);
      }
      return (typeof A == "string" && A !== "") ||
        typeof A == "number" ||
        typeof A == "bigint"
        ? ((A = "" + A),
          N !== null && N.tag === 6
            ? (l(C, N.sibling), (Q = s(N, A)), (Q.return = C), (C = Q))
            : (l(C, N), (Q = Nu(A, C.mode, Q)), (Q.return = C), (C = Q)),
          u(C))
        : l(C, N);
    }
    return function (C, N, A, Q) {
      try {
        vs = 0;
        var ge = Me(C, N, A, Q);
        return ((Ta = null), ge);
      } catch (Ce) {
        if (Ce === Sa || Ce === Ui) throw Ce;
        var ke = Lt(29, Ce, null, C.mode);
        return ((ke.lanes = Q), (ke.return = C), ke);
      }
    };
  }
  var Xn = vf(!0),
    xf = vf(!1),
    cn = !1;
  function zu(e) {
    e.updateQueue = {
      baseState: e.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null,
    };
  }
  function Uu(e, t) {
    ((e = e.updateQueue),
      t.updateQueue === e &&
        (t.updateQueue = {
          baseState: e.baseState,
          firstBaseUpdate: e.firstBaseUpdate,
          lastBaseUpdate: e.lastBaseUpdate,
          shared: e.shared,
          callbacks: null,
        }));
  }
  function un(e) {
    return { lane: e, tag: 0, payload: null, callback: null, next: null };
  }
  function rn(e, t, l) {
    var a = e.updateQueue;
    if (a === null) return null;
    if (((a = a.shared), (Ze & 2) !== 0)) {
      var s = a.pending;
      return (
        s === null ? (t.next = t) : ((t.next = s.next), (s.next = t)),
        (a.pending = t),
        (t = Ei(e)),
        Pd(e, null, l),
        t
      );
    }
    return (Ti(e, a, t, l), Ei(e));
  }
  function xs(e, t, l) {
    if (
      ((t = t.updateQueue), t !== null && ((t = t.shared), (l & 4194048) !== 0))
    ) {
      var a = t.lanes;
      ((a &= e.pendingLanes), (l |= a), (t.lanes = l), nd(e, l));
    }
  }
  function Mu(e, t) {
    var l = e.updateQueue,
      a = e.alternate;
    if (a !== null && ((a = a.updateQueue), l === a)) {
      var s = null,
        i = null;
      if (((l = l.firstBaseUpdate), l !== null)) {
        do {
          var u = {
            lane: l.lane,
            tag: l.tag,
            payload: l.payload,
            callback: null,
            next: null,
          };
          (i === null ? (s = i = u) : (i = i.next = u), (l = l.next));
        } while (l !== null);
        i === null ? (s = i = t) : (i = i.next = t);
      } else s = i = t;
      ((l = {
        baseState: a.baseState,
        firstBaseUpdate: s,
        lastBaseUpdate: i,
        shared: a.shared,
        callbacks: a.callbacks,
      }),
        (e.updateQueue = l));
      return;
    }
    ((e = l.lastBaseUpdate),
      e === null ? (l.firstBaseUpdate = t) : (e.next = t),
      (l.lastBaseUpdate = t));
  }
  var qu = !1;
  function ys() {
    if (qu) {
      var e = Na;
      if (e !== null) throw e;
    }
  }
  function gs(e, t, l, a) {
    qu = !1;
    var s = e.updateQueue;
    cn = !1;
    var i = s.firstBaseUpdate,
      u = s.lastBaseUpdate,
      o = s.shared.pending;
    if (o !== null) {
      s.shared.pending = null;
      var x = o,
        w = x.next;
      ((x.next = null), u === null ? (i = w) : (u.next = w), (u = x));
      var q = e.alternate;
      q !== null &&
        ((q = q.updateQueue),
        (o = q.lastBaseUpdate),
        o !== u &&
          (o === null ? (q.firstBaseUpdate = w) : (o.next = w),
          (q.lastBaseUpdate = x)));
    }
    if (i !== null) {
      var X = s.baseState;
      ((u = 0), (q = w = x = null), (o = i));
      do {
        var T = o.lane & -536870913,
          z = T !== o.lane;
        if (z ? (Be & T) === T : (a & T) === T) {
          (T !== 0 && T === Yn && (qu = !0),
            q !== null &&
              (q = q.next =
                {
                  lane: 0,
                  tag: o.tag,
                  payload: o.payload,
                  callback: null,
                  next: null,
                }));
          e: {
            var me = e,
              be = o;
            T = t;
            var Me = l;
            switch (be.tag) {
              case 1:
                if (((me = be.payload), typeof me == "function")) {
                  X = me.call(Me, X, T);
                  break e;
                }
                X = me;
                break e;
              case 3:
                me.flags = (me.flags & -65537) | 128;
              case 0:
                if (
                  ((me = be.payload),
                  (T = typeof me == "function" ? me.call(Me, X, T) : me),
                  T == null)
                )
                  break e;
                X = G({}, X, T);
                break e;
              case 2:
                cn = !0;
            }
          }
          ((T = o.callback),
            T !== null &&
              ((e.flags |= 64),
              z && (e.flags |= 8192),
              (z = s.callbacks),
              z === null ? (s.callbacks = [T]) : z.push(T)));
        } else
          ((z = {
            lane: T,
            tag: o.tag,
            payload: o.payload,
            callback: o.callback,
            next: null,
          }),
            q === null ? ((w = q = z), (x = X)) : (q = q.next = z),
            (u |= T));
        if (((o = o.next), o === null)) {
          if (((o = s.shared.pending), o === null)) break;
          ((z = o),
            (o = z.next),
            (z.next = null),
            (s.lastBaseUpdate = z),
            (s.shared.pending = null));
        }
      } while (!0);
      (q === null && (x = X),
        (s.baseState = x),
        (s.firstBaseUpdate = w),
        (s.lastBaseUpdate = q),
        i === null && (s.shared.lanes = 0),
        (vn |= u),
        (e.lanes = u),
        (e.memoizedState = X));
    }
  }
  function yf(e, t) {
    if (typeof e != "function") throw Error(r(191, e));
    e.call(t);
  }
  function gf(e, t) {
    var l = e.callbacks;
    if (l !== null)
      for (e.callbacks = null, e = 0; e < l.length; e++) yf(l[e], t);
  }
  var on = Ve(null),
    Ki = Ve(0);
  function jf(e, t) {
    ((e = Ql), we(Ki, e), we(on, t), (Ql = e | t.baseLanes));
  }
  function Hu() {
    (we(Ki, Ql), we(on, on.current));
  }
  function Ku() {
    ((Ql = Ki.current), De(on), De(Ki));
  }
  var Et = Ve(null),
    Dt = null;
  function dn(e) {
    var t = e.alternate;
    (we(Ct, Ct.current & 1),
      we(Et, e),
      Dt === null &&
        (t === null || on.current !== null || t.memoizedState !== null) &&
        (Dt = e));
  }
  function Lu(e) {
    (we(Ct, Ct.current), we(Et, e), Dt === null && (Dt = e));
  }
  function bf(e) {
    e.tag === 22
      ? (we(Ct, Ct.current), we(Et, e), Dt === null && (Dt = e))
      : fn();
  }
  function fn() {
    (we(Ct, Ct.current), we(Et, Et.current));
  }
  function Jt(e) {
    (De(Et), Dt === e && (Dt = null), De(Ct));
  }
  var Ct = Ve(0);
  function js(e, t) {
    (we(Et, Et.current), we(Ct, t));
  }
  function Bu(e) {
    (De(Ct), De(Et), Dt === e && (Dt = null));
  }
  function Li(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var l = t.memoizedState;
        if (l !== null && ((l = l.dehydrated), l === null || uo(l) || ro(l)))
          return t;
      } else if (
        t.tag === 19 &&
        t.memoizedProps.revealOrder !== "independent"
      ) {
        if ((t.flags & 128) !== 0) return t;
      } else if (t.child !== null) {
        ((t.child.return = t), (t = t.child));
        continue;
      }
      if (t === e) break;
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === e) return null;
        t = t.return;
      }
      ((t.sibling.return = t.return), (t = t.sibling));
    }
    return null;
  }
  var kl = 0,
    Ue = null,
    We = null,
    ft = null,
    Bi = !1,
    Ea = !1,
    Zn = !1,
    ki = 0,
    bs = 0,
    Ca = null,
    ux = 0;
  function ct() {
    throw Error(r(321));
  }
  function ku(e, t) {
    if (t === null) return !1;
    for (var l = 0; l < t.length && l < e.length; l++)
      if (!Zt(e[l], t[l])) return !1;
    return !0;
  }
  function Yu(e, t, l, a, s, i) {
    return (
      (kl = i),
      (Ue = t),
      (t.memoizedState = null),
      (t.updateQueue = null),
      (t.lanes = 0),
      (ne.H = e === null || e.memoizedState === null ? ah : sh),
      (Zn = !1),
      (i = l(a, s)),
      (Zn = !1),
      Ea && (i = Sf(t, l, a, s)),
      Nf(e),
      i
    );
  }
  function Nf(e) {
    ne.H = Ji;
    var t = We !== null && We.next !== null;
    if (((kl = 0), (ft = We = Ue = null), (Bi = !1), (bs = 0), (Ca = null), t))
      throw Error(r(300));
    e === null ||
      ht ||
      ((e = e.dependencies), e !== null && Di(e) && (ht = !0));
  }
  function Sf(e, t, l, a) {
    Ue = e;
    var s = 0;
    do {
      if ((Ea && (Ca = null), (bs = 0), (Ea = !1), 25 <= s))
        throw Error(r(301));
      if (((s += 1), (ft = We = null), e.updateQueue != null)) {
        var i = e.updateQueue;
        ((i.lastEffect = null),
          (i.events = null),
          (i.stores = null),
          i.memoCache != null && (i.memoCache.index = 0));
      }
      ((ne.H = vx), (i = t(l, a)));
    } while (Ea);
    return i;
  }
  function rx() {
    var e = ne.H,
      t = e.useState()[0];
    return (
      (t = typeof t.then == "function" ? Ns(t) : t),
      (e = e.useState()[0]),
      (We !== null ? We.memoizedState : null) !== e && (Ue.flags |= 1024),
      t
    );
  }
  function Vu() {
    var e = ki !== 0;
    return ((ki = 0), e);
  }
  function Gu(e, t, l) {
    ((t.updateQueue = e.updateQueue), (t.flags &= -2053), (e.lanes &= ~l));
  }
  function Qu(e) {
    if (Bi) {
      for (e = e.memoizedState; e !== null; ) {
        var t = e.queue;
        (t !== null && (t.pending = null), (e = e.next));
      }
      Bi = !1;
    }
    ((kl = 0), (ft = We = Ue = null), (Ea = !1), (bs = ki = 0), (Ca = null));
  }
  function Ut() {
    var e = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null,
    };
    return (ft === null ? (Ue.memoizedState = ft = e) : (ft = ft.next = e), ft);
  }
  function rt() {
    if (We === null) {
      var e = Ue.alternate;
      e = e !== null ? e.memoizedState : null;
    } else e = We.next;
    var t = ft === null ? Ue.memoizedState : ft.next;
    if (t !== null) ((ft = t), (We = e));
    else {
      if (e === null)
        throw Ue.alternate === null ? Error(r(467)) : Error(r(310));
      ((We = e),
        (e = {
          memoizedState: We.memoizedState,
          baseState: We.baseState,
          baseQueue: We.baseQueue,
          queue: We.queue,
          next: null,
        }),
        ft === null ? (Ue.memoizedState = ft = e) : (ft = ft.next = e));
    }
    return ft;
  }
  function Yi() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function Ns(e) {
    var t = bs;
    return (
      (bs += 1),
      Ca === null && (Ca = []),
      (e = hf(Ca, e, t)),
      (t = Ue),
      (ft === null ? t.memoizedState : ft.next) === null &&
        ((t = t.alternate),
        (ne.H = t === null || t.memoizedState === null ? ah : sh)),
      e
    );
  }
  function Vi(e) {
    if (e !== null && typeof e == "object") {
      if (typeof e.then == "function") return Ns(e);
      if (e.$$typeof === m) return;
      if (e.$$typeof === ae) return Tt(e);
    }
    throw Error(r(438, String(e)));
  }
  function Xu(e) {
    var t = null,
      l = Ue.updateQueue;
    if ((l !== null && (t = l.memoCache), t == null)) {
      var a = Ue.alternate;
      a !== null &&
        ((a = a.updateQueue),
        a !== null &&
          ((a = a.memoCache),
          a != null &&
            (t = {
              data: a.data.map(function (s) {
                return s.slice();
              }),
              index: 0,
            })));
    }
    if (
      (t == null && (t = { data: [], index: 0 }),
      l === null && ((l = Yi()), (Ue.updateQueue = l)),
      (l.memoCache = t),
      (l = t.data[t.index]),
      l === void 0)
    )
      for (l = t.data[t.index] = Array(e), a = 0; a < e; a++) l[a] = de;
    return (t.index++, l);
  }
  function Yl(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function Gi(e) {
    var t = rt();
    return Zu(t, We, e);
  }
  function Zu(e, t, l) {
    var a = e.queue;
    if (a === null) throw Error(r(311));
    a.lastRenderedReducer = l;
    var s = e.baseQueue,
      i = a.pending;
    if (i !== null) {
      if (s !== null) {
        var u = s.next;
        ((s.next = i.next), (i.next = u));
      }
      ((t.baseQueue = s = i), (a.pending = null));
    }
    if (((i = e.baseState), s === null)) e.memoizedState = i;
    else {
      t = s.next;
      var o = (u = null),
        x = null,
        w = t,
        q = !1;
      do {
        var X = w.lane & -536870913;
        if (X !== w.lane ? (Be & X) === X : (kl & X) === X) {
          var T = w.revertLane;
          if (T === 0)
            (x !== null &&
              (x = x.next =
                {
                  lane: 0,
                  revertLane: 0,
                  gesture: null,
                  action: w.action,
                  hasEagerState: w.hasEagerState,
                  eagerState: w.eagerState,
                  next: null,
                }),
              X === Yn && (q = !0));
          else if ((kl & T) === T) {
            ((w = w.next), T === Yn && (q = !0));
            continue;
          } else
            ((X = {
              lane: 0,
              revertLane: w.revertLane,
              gesture: null,
              action: w.action,
              hasEagerState: w.hasEagerState,
              eagerState: w.eagerState,
              next: null,
            }),
              x === null ? ((o = x = X), (u = i)) : (x = x.next = X),
              (Ue.lanes |= T),
              (vn |= T));
          ((X = w.action),
            Zn && l(i, X),
            (i = w.hasEagerState ? w.eagerState : l(i, X)));
        } else
          ((T = {
            lane: X,
            revertLane: w.revertLane,
            gesture: w.gesture,
            action: w.action,
            hasEagerState: w.hasEagerState,
            eagerState: w.eagerState,
            next: null,
          }),
            x === null ? ((o = x = T), (u = i)) : (x = x.next = T),
            (Ue.lanes |= X),
            (vn |= X));
        w = w.next;
      } while (w !== null && w !== t);
      if (
        (x === null ? (u = i) : (x.next = o),
        !Zt(i, e.memoizedState) && ((ht = !0), q && ((l = Na), l !== null)))
      )
        throw l;
      ((e.memoizedState = i),
        (e.baseState = u),
        (e.baseQueue = x),
        (a.lastRenderedState = i));
    }
    return (s === null && (a.lanes = 0), [e.memoizedState, a.dispatch]);
  }
  function Ju(e) {
    var t = rt(),
      l = t.queue;
    if (l === null) throw Error(r(311));
    l.lastRenderedReducer = e;
    var a = l.dispatch,
      s = l.pending,
      i = t.memoizedState;
    if (s !== null) {
      l.pending = null;
      var u = (s = s.next);
      do ((i = e(i, u.action)), (u = u.next));
      while (u !== s);
      (Zt(i, t.memoizedState) || (ht = !0),
        (t.memoizedState = i),
        t.baseQueue === null && (t.baseState = i),
        (l.lastRenderedState = i));
    }
    return [i, a];
  }
  function Tf(e, t, l) {
    var a = Ue,
      s = rt(),
      i = qe;
    if (i) {
      if (l === void 0) throw Error(r(407));
      l = l();
    } else l = t();
    var u = !Zt((We || s).memoizedState, l);
    if (
      (u && ((s.memoizedState = l), (ht = !0)),
      (s = s.queue),
      Fu(wf.bind(null, a, s, e), [e]),
      (e =
        s.getSnapshot !== t ||
        u ||
        (ft !== null && (ft.memoizedState.tag & 1) !== 0)),
      wa(e ? 9 : 8, { destroy: void 0 }, Cf.bind(null, a, s, l, t), null),
      e)
    ) {
      if (((a.flags |= 2048), Pe === null)) throw Error(r(349));
      i || (kl & 127) !== 0 || Ef(a, t, l);
    }
    return l;
  }
  function Ef(e, t, l) {
    ((e.flags |= 16384),
      (e = { getSnapshot: t, value: l }),
      (t = Ue.updateQueue),
      t === null
        ? ((t = Yi()), (Ue.updateQueue = t), (t.stores = [e]))
        : ((l = t.stores), l === null ? (t.stores = [e]) : l.push(e)));
  }
  function Cf(e, t, l, a) {
    ((t.value = l), (t.getSnapshot = a), _f(t) && Af(e));
  }
  function wf(e, t, l) {
    return l(function () {
      _f(t) && Af(e);
    });
  }
  function _f(e) {
    var t = e.getSnapshot;
    e = e.value;
    try {
      var l = t();
      return !Zt(e, l);
    } catch {
      return !0;
    }
  }
  function Af(e) {
    var t = qn(e, 2);
    t !== null && Vt(t, e, 2);
  }
  function Iu(e) {
    var t = Ut();
    if (typeof e == "function") {
      var l = e;
      if (((e = l()), Zn)) {
        Se(!0);
        try {
          l();
        } finally {
          Se(!1);
        }
      }
    }
    return (
      (t.memoizedState = t.baseState = e),
      (t.queue = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Yl,
        lastRenderedState: e,
      }),
      t
    );
  }
  function Rf(e, t, l, a) {
    return ((e.baseState = l), Zu(e, We, typeof a == "function" ? a : Yl));
  }
  function ox(e, t, l, a, s) {
    if (Zi(e)) throw Error(r(485));
    if (((e = t.action), e !== null)) {
      var i = {
        payload: s,
        action: e,
        next: null,
        isTransition: !0,
        status: "pending",
        value: null,
        reason: null,
        listeners: [],
        then: function (u) {
          i.listeners.push(u);
        },
      };
      (ne.T !== null ? l(!0) : (i.isTransition = !1),
        a(i),
        (l = t.pending),
        l === null
          ? ((i.next = t.pending = i), Df(t, i))
          : ((i.next = l.next), (t.pending = l.next = i)));
    }
  }
  function Df(e, t) {
    var l = t.action,
      a = t.payload,
      s = e.state;
    if (t.isTransition) {
      var i = ne.T,
        u = {};
      ((u.types = i !== null ? i.types : null), (ne.T = u));
      try {
        var o = l(s, a),
          x = ne.S;
        (x !== null && x(u, o), Of(e, t, o));
      } catch (w) {
        $u(e, t, w);
      } finally {
        (i !== null && u.types !== null && (i.types = u.types), (ne.T = i));
      }
    } else
      try {
        ((i = l(s, a)), Of(e, t, i));
      } catch (w) {
        $u(e, t, w);
      }
  }
  function Of(e, t, l) {
    l !== null && typeof l == "object" && typeof l.then == "function"
      ? l.then(
          function (a) {
            zf(e, t, a);
          },
          function (a) {
            return $u(e, t, a);
          },
        )
      : zf(e, t, l);
  }
  function zf(e, t, l) {
    ((t.status = "fulfilled"),
      (t.value = l),
      Uf(t),
      (e.state = l),
      (t = e.pending),
      t !== null &&
        ((l = t.next),
        l === t ? (e.pending = null) : ((l = l.next), (t.next = l), Df(e, l))));
  }
  function $u(e, t, l) {
    var a = e.pending;
    if (((e.pending = null), a !== null)) {
      a = a.next;
      do ((t.status = "rejected"), (t.reason = l), Uf(t), (t = t.next));
      while (t !== a);
    }
    e.action = null;
  }
  function Uf(e) {
    e = e.listeners;
    for (var t = 0; t < e.length; t++) (0, e[t])();
  }
  function Mf(e, t) {
    return t;
  }
  function qf(e, t) {
    if (qe) {
      var l = Pe.formState;
      if (l !== null) {
        e: {
          var a = Ue;
          if (qe) {
            if (tt) {
              t: {
                for (var s = tt, i = il; s.nodeType !== 8; ) {
                  if (!i) {
                    s = null;
                    break t;
                  }
                  if (((s = ul(s.nextSibling)), s === null)) {
                    s = null;
                    break t;
                  }
                }
                ((i = s.data), (s = i === "F!" || i === "F" ? s : null));
              }
              if (s) {
                ((tt = ul(s.nextSibling)), (a = s.data === "F!"));
                break e;
              }
            }
            nn(a);
          }
          a = !1;
        }
        a && (t = l[0]);
      }
    }
    return (
      (l = Ut()),
      (l.memoizedState = l.baseState = t),
      (a = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Mf,
        lastRenderedState: t,
      }),
      (l.queue = a),
      (l = th.bind(null, Ue, a)),
      (a.dispatch = l),
      (a = Iu(!1)),
      (i = lr.bind(null, Ue, !1, a.queue)),
      (a = Ut()),
      (s = { state: t, dispatch: null, action: e, pending: null }),
      (a.queue = s),
      (l = ox.bind(null, Ue, s, i, l)),
      (s.dispatch = l),
      (a.memoizedState = e),
      [t, l, !1]
    );
  }
  function Hf(e) {
    var t = rt();
    return Kf(t, We, e);
  }
  function Kf(e, t, l) {
    if (
      ((t = Zu(e, t, Mf)[0]),
      (e = Gi(Yl)[0]),
      typeof t == "object" && t !== null && typeof t.then == "function")
    )
      try {
        var a = Ns(t);
      } catch (u) {
        throw u === Sa ? Ui : u;
      }
    else a = t;
    t = rt();
    var s = t.queue,
      i = s.dispatch;
    return (
      l !== t.memoizedState &&
        ((Ue.flags |= 2048),
        wa(9, { destroy: void 0 }, dx.bind(null, s, l), null)),
      [a, i, e]
    );
  }
  function dx(e, t) {
    e.action = t;
  }
  function Lf(e) {
    var t = rt(),
      l = We;
    if (l !== null) return Kf(t, l, e);
    (rt(), (t = t.memoizedState), (l = rt()));
    var a = l.queue.dispatch;
    return ((l.memoizedState = e), [t, a, !1]);
  }
  function wa(e, t, l, a) {
    return (
      (e = { tag: e, create: l, deps: a, inst: t, next: null }),
      (t = Ue.updateQueue),
      t === null && ((t = Yi()), (Ue.updateQueue = t)),
      (l = t.lastEffect),
      l === null
        ? (t.lastEffect = e.next = e)
        : ((a = l.next), (l.next = e), (e.next = a), (t.lastEffect = e)),
      e
    );
  }
  function Bf() {
    return rt().memoizedState;
  }
  function Qi(e, t, l, a) {
    var s = Ut();
    ((Ue.flags |= e),
      (s.memoizedState = wa(
        1 | t,
        { destroy: void 0 },
        l,
        a === void 0 ? null : a,
      )));
  }
  function Xi(e, t, l, a) {
    var s = rt();
    a = a === void 0 ? null : a;
    var i = s.memoizedState.inst;
    We !== null && a !== null && ku(a, We.memoizedState.deps)
      ? (s.memoizedState = wa(t, i, l, a))
      : ((Ue.flags |= e), (s.memoizedState = wa(1 | t, i, l, a)));
  }
  function kf(e, t) {
    Qi(8390656, 8, e, t);
  }
  function Fu(e, t) {
    Xi(2048, 8, e, t);
  }
  function fx(e) {
    Ue.flags |= 4;
    var t = Ue.updateQueue;
    if (t === null) ((t = Yi()), (Ue.updateQueue = t), (t.events = [e]));
    else {
      var l = t.events;
      l === null ? (t.events = [e]) : l.push(e);
    }
  }
  function Yf(e) {
    var t = rt().memoizedState;
    return (
      fx({ ref: t, nextImpl: e }),
      function () {
        if ((Ze & 2) !== 0) throw Error(r(440));
        return t.impl.apply(void 0, arguments);
      }
    );
  }
  function Vf(e, t) {
    return Xi(4, 2, e, t);
  }
  function Gf(e, t) {
    return Xi(4, 4, e, t);
  }
  function Qf(e, t) {
    if (typeof t == "function") {
      e = e();
      var l = t(e);
      return function () {
        typeof l == "function" ? l() : t(null);
      };
    }
    if (t != null)
      return (
        (e = e()),
        (t.current = e),
        function () {
          t.current = null;
        }
      );
  }
  function Xf(e, t, l) {
    ((l = l != null ? l.concat([e]) : null), Xi(4, 4, Qf.bind(null, t, e), l));
  }
  function Wu() {}
  function Zf(e, t) {
    var l = rt();
    t = t === void 0 ? null : t;
    var a = l.memoizedState;
    return t !== null && ku(t, a[1]) ? a[0] : ((l.memoizedState = [e, t]), e);
  }
  function Jf(e, t) {
    var l = rt();
    t = t === void 0 ? null : t;
    var a = l.memoizedState;
    if (t !== null && ku(t, a[1])) return a[0];
    if (((a = e()), Zn)) {
      Se(!0);
      try {
        e();
      } finally {
        Se(!1);
      }
    }
    return ((l.memoizedState = [a, t]), a);
  }
  function Pu(e, t, l) {
    return l === void 0 || ((kl & 1073741824) !== 0 && (Be & 261930) === 0)
      ? (e.memoizedState = t)
      : ((e.memoizedState = l), (e = am()), (Ue.lanes |= e), (vn |= e), l);
  }
  function If(e, t, l, a) {
    return Zt(l, t)
      ? l
      : on.current !== null
        ? ((e = Pu(e, l, a)), Zt(e, t) || (ht = !0), e)
        : (kl & 106) === 0 || ((kl & 1073741824) !== 0 && (Be & 261930) === 0)
          ? ((ht = !0), (e.memoizedState = l))
          : ((e = am()), (Ue.lanes |= e), (vn |= e), t);
  }
  function $f(e, t, l, a, s) {
    var i = pe.p;
    pe.p = i !== 0 && 8 > i ? i : 8;
    var u = ne.T,
      o = {};
    ((o.types = u !== null ? u.types : null), (ne.T = o), lr(e, !1, t, l));
    try {
      var x = s(),
        w = ne.S;
      if (
        (w !== null && w(o, x),
        x !== null && typeof x == "object" && typeof x.then == "function")
      ) {
        var q = cx(x, a);
        Ss(e, t, q, Wt(e));
      } else Ss(e, t, a, Wt(e));
    } catch (X) {
      Ss(e, t, { then: function () {}, status: "rejected", reason: X }, Wt());
    } finally {
      ((pe.p = i),
        u !== null && o.types !== null && (u.types = o.types),
        (ne.T = u));
    }
  }
  function hx() {}
  function er(e, t, l, a) {
    if (e.tag !== 5) throw Error(r(476));
    var s = Ff(e).queue;
    $f(
      e,
      s,
      t,
      F,
      l === null
        ? hx
        : function () {
            return (Wf(e), l(a));
          },
    );
  }
  function Ff(e) {
    var t = e.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: F,
      baseState: F,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Yl,
        lastRenderedState: F,
      },
      next: null,
    };
    var l = {};
    return (
      (t.next = {
        memoizedState: l,
        baseState: l,
        baseQueue: null,
        queue: {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: Yl,
          lastRenderedState: l,
        },
        next: null,
      }),
      (e.memoizedState = t),
      (e = e.alternate),
      e !== null && (e.memoizedState = t),
      t
    );
  }
  function Wf(e) {
    var t = Ff(e);
    (t.next === null && (t = e.alternate.memoizedState),
      Ss(e, t.next.queue, {}, Wt()));
  }
  function tr() {
    return Tt(Xa);
  }
  function Pf() {
    return rt().memoizedState;
  }
  function eh() {
    return rt().memoizedState;
  }
  function mx(e) {
    for (var t = e.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var l = Wt();
          e = un(l);
          var a = rn(t, e, l);
          (a !== null && (Vt(a, t, l), xs(a, t, l)),
            (t = { cache: Au() }),
            (e.payload = t));
          return;
      }
      t = t.return;
    }
  }
  function px(e, t, l) {
    var a = Wt();
    ((l = {
      lane: a,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null,
    }),
      Zi(e)
        ? lh(t, l)
        : ((l = ju(e, t, l, a)), l !== null && (Vt(l, e, a), nh(l, t, a))));
  }
  function th(e, t, l) {
    var a = Wt();
    Ss(e, t, l, a);
  }
  function Ss(e, t, l, a) {
    var s = {
      lane: a,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null,
    };
    if (Zi(e)) lh(t, s);
    else {
      var i = e.alternate;
      if (
        e.lanes === 0 &&
        (i === null || i.lanes === 0) &&
        ((i = t.lastRenderedReducer), i !== null)
      )
        try {
          var u = t.lastRenderedState,
            o = i(u, l);
          if (((s.hasEagerState = !0), (s.eagerState = o), Zt(o, u)))
            return (Ti(e, t, s, 0), Pe === null && Si(), !1);
        } catch {}
      if (((l = ju(e, t, s, a)), l !== null))
        return (Vt(l, e, a), nh(l, t, a), !0);
    }
    return !1;
  }
  function lr(e, t, l, a) {
    if (
      ((a = {
        lane: 2,
        revertLane: Xr(),
        gesture: null,
        action: a,
        hasEagerState: !1,
        eagerState: null,
        next: null,
      }),
      Zi(e))
    ) {
      if (t) throw Error(r(479));
    } else ((t = ju(e, l, a, 2)), t !== null && Vt(t, e, 2));
  }
  function Zi(e) {
    var t = e.alternate;
    return e === Ue || (t !== null && t === Ue);
  }
  function lh(e, t) {
    Ea = Bi = !0;
    var l = e.pending;
    (l === null ? (t.next = t) : ((t.next = l.next), (l.next = t)),
      (e.pending = t));
  }
  function nh(e, t, l) {
    if ((l & 4194048) !== 0) {
      var a = t.lanes;
      ((a &= e.pendingLanes), (l |= a), (t.lanes = l), nd(e, l));
    }
  }
  var Ji = {
      readContext: Tt,
      use: Vi,
      useCallback: ct,
      useContext: ct,
      useEffect: ct,
      useImperativeHandle: ct,
      useLayoutEffect: ct,
      useInsertionEffect: ct,
      useMemo: ct,
      useReducer: ct,
      useRef: ct,
      useState: ct,
      useDebugValue: ct,
      useDeferredValue: ct,
      useTransition: ct,
      useSyncExternalStore: ct,
      useId: ct,
      useHostTransitionStatus: ct,
      useFormState: ct,
      useActionState: ct,
      useOptimistic: ct,
      useMemoCache: ct,
      useCacheRefresh: ct,
      useEffectEvent: ct,
    },
    ah = {
      readContext: Tt,
      use: Vi,
      useCallback: function (e, t) {
        return ((Ut().memoizedState = [e, t === void 0 ? null : t]), e);
      },
      useContext: Tt,
      useEffect: kf,
      useImperativeHandle: function (e, t, l) {
        ((l = l != null ? l.concat([e]) : null),
          Qi(4194308, 4, Qf.bind(null, t, e), l));
      },
      useLayoutEffect: function (e, t) {
        return Qi(4194308, 4, e, t);
      },
      useInsertionEffect: function (e, t) {
        Qi(4, 2, e, t);
      },
      useMemo: function (e, t) {
        var l = Ut();
        t = t === void 0 ? null : t;
        var a = e();
        if (Zn) {
          Se(!0);
          try {
            e();
          } finally {
            Se(!1);
          }
        }
        return ((l.memoizedState = [a, t]), a);
      },
      useReducer: function (e, t, l) {
        var a = Ut();
        if (l !== void 0) {
          var s = l(t);
          if (Zn) {
            Se(!0);
            try {
              l(t);
            } finally {
              Se(!1);
            }
          }
        } else s = t;
        return (
          (a.memoizedState = a.baseState = s),
          (e = {
            pending: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: e,
            lastRenderedState: s,
          }),
          (a.queue = e),
          (e = e.dispatch = px.bind(null, Ue, e)),
          [a.memoizedState, e]
        );
      },
      useRef: function (e) {
        var t = Ut();
        return ((e = { current: e }), (t.memoizedState = e));
      },
      useState: function (e) {
        e = Iu(e);
        var t = e.queue,
          l = th.bind(null, Ue, t);
        return ((t.dispatch = l), [e.memoizedState, l]);
      },
      useDebugValue: Wu,
      useDeferredValue: function (e, t) {
        var l = Ut();
        return Pu(l, e, t);
      },
      useTransition: function () {
        var e = Iu(!1);
        return (
          (e = $f.bind(null, Ue, e.queue, !0, !1)),
          (Ut().memoizedState = e),
          [!1, e]
        );
      },
      useSyncExternalStore: function (e, t, l) {
        var a = Ue,
          s = Ut();
        if (qe) {
          if (l === void 0) throw Error(r(407));
          l = l();
        } else {
          if (((l = t()), Pe === null)) throw Error(r(349));
          (Be & 127) !== 0 || Ef(a, t, l);
        }
        s.memoizedState = l;
        var i = { value: l, getSnapshot: t };
        return (
          (s.queue = i),
          kf(wf.bind(null, a, i, e), [e]),
          (a.flags |= 2048),
          wa(9, { destroy: void 0 }, Cf.bind(null, a, i, l, t), null),
          l
        );
      },
      useId: function () {
        var e = Ut(),
          t = Pe.identifierPrefix;
        if (qe) {
          var l = Nl,
            a = bl;
          ((l = (a & ~(1 << (32 - Oe(a) - 1))).toString(32) + l),
            (t = "_" + t + "R_" + l),
            (l = ki++),
            0 < l && (t += "H" + l.toString(32)),
            (t += "_"));
        } else ((l = ux++), (t = "_" + t + "r_" + l.toString(32) + "_"));
        return (e.memoizedState = t);
      },
      useHostTransitionStatus: tr,
      useFormState: qf,
      useActionState: qf,
      useOptimistic: function (e) {
        var t = Ut();
        t.memoizedState = t.baseState = e;
        var l = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: null,
          lastRenderedState: null,
        };
        return (
          (t.queue = l),
          (t = lr.bind(null, Ue, !0, l)),
          (l.dispatch = t),
          [e, t]
        );
      },
      useMemoCache: Xu,
      useCacheRefresh: function () {
        return (Ut().memoizedState = mx.bind(null, Ue));
      },
      useEffectEvent: function (e) {
        var t = Ut(),
          l = { impl: e };
        return (
          (t.memoizedState = l),
          function () {
            if ((Ze & 2) !== 0) throw Error(r(440));
            return l.impl.apply(void 0, arguments);
          }
        );
      },
    },
    sh = {
      readContext: Tt,
      use: Vi,
      useCallback: Zf,
      useContext: Tt,
      useEffect: Fu,
      useImperativeHandle: Xf,
      useInsertionEffect: Vf,
      useLayoutEffect: Gf,
      useMemo: Jf,
      useReducer: Gi,
      useRef: Bf,
      useState: function () {
        return Gi(Yl);
      },
      useDebugValue: Wu,
      useDeferredValue: function (e, t) {
        var l = rt();
        return If(l, We.memoizedState, e, t);
      },
      useTransition: function () {
        var e = Gi(Yl)[0],
          t = rt().memoizedState;
        return [typeof e == "boolean" ? e : Ns(e), t];
      },
      useSyncExternalStore: Tf,
      useId: Pf,
      useHostTransitionStatus: tr,
      useFormState: Hf,
      useActionState: Hf,
      useOptimistic: function (e, t) {
        var l = rt();
        return Rf(l, We, e, t);
      },
      useMemoCache: Xu,
      useCacheRefresh: eh,
      useEffectEvent: Yf,
    },
    vx = {
      readContext: Tt,
      use: Vi,
      useCallback: Zf,
      useContext: Tt,
      useEffect: Fu,
      useImperativeHandle: Xf,
      useInsertionEffect: Vf,
      useLayoutEffect: Gf,
      useMemo: Jf,
      useReducer: Ju,
      useRef: Bf,
      useState: function () {
        return Ju(Yl);
      },
      useDebugValue: Wu,
      useDeferredValue: function (e, t) {
        var l = rt();
        return We === null ? Pu(l, e, t) : If(l, We.memoizedState, e, t);
      },
      useTransition: function () {
        var e = Ju(Yl)[0],
          t = rt().memoizedState;
        return [typeof e == "boolean" ? e : Ns(e), t];
      },
      useSyncExternalStore: Tf,
      useId: Pf,
      useHostTransitionStatus: tr,
      useFormState: Lf,
      useActionState: Lf,
      useOptimistic: function (e, t) {
        var l = rt();
        return We !== null
          ? Rf(l, We, e, t)
          : ((l.baseState = e), [e, l.queue.dispatch]);
      },
      useMemoCache: Xu,
      useCacheRefresh: eh,
      useEffectEvent: Yf,
    };
  function nr(e, t, l, a) {
    ((t = e.memoizedState),
      (l = l(a, t)),
      (l = l == null ? t : G({}, t, l)),
      (e.memoizedState = l),
      e.lanes === 0 && (e.updateQueue.baseState = l));
  }
  var ar = {
    enqueueSetState: function (e, t, l) {
      e = e._reactInternals;
      var a = Wt(),
        s = un(a);
      ((s.payload = t),
        l != null && (s.callback = l),
        (t = rn(e, s, a)),
        t !== null && (Vt(t, e, a), xs(t, e, a)));
    },
    enqueueReplaceState: function (e, t, l) {
      e = e._reactInternals;
      var a = Wt(),
        s = un(a);
      ((s.tag = 1),
        (s.payload = t),
        l != null && (s.callback = l),
        (t = rn(e, s, a)),
        t !== null && (Vt(t, e, a), xs(t, e, a)));
    },
    enqueueForceUpdate: function (e, t) {
      e = e._reactInternals;
      var l = Wt(),
        a = un(l);
      ((a.tag = 2),
        t != null && (a.callback = t),
        (t = rn(e, a, l)),
        t !== null && (Vt(t, e, l), xs(t, e, l)));
    },
  };
  function ih(e, t, l, a, s, i, u) {
    return (
      (e = e.stateNode),
      typeof e.shouldComponentUpdate == "function"
        ? e.shouldComponentUpdate(a, i, u)
        : t.prototype && t.prototype.isPureReactComponent
          ? !rs(l, a) || !rs(s, i)
          : !0
    );
  }
  function ch(e, t, l, a) {
    ((e = t.state),
      typeof t.componentWillReceiveProps == "function" &&
        t.componentWillReceiveProps(l, a),
      typeof t.UNSAFE_componentWillReceiveProps == "function" &&
        t.UNSAFE_componentWillReceiveProps(l, a),
      t.state !== e && ar.enqueueReplaceState(t, t.state, null));
  }
  function Jn(e, t) {
    var l = t;
    if ("ref" in t) {
      l = {};
      for (var a in t) a !== "ref" && (l[a] = t[a]);
    }
    if ((e = e.defaultProps)) {
      l === t && (l = G({}, l));
      for (var s in e) l[s] === void 0 && (l[s] = e[s]);
    }
    return l;
  }
  function uh(e) {
    Ni(e);
  }
  function rh(e) {
    console.error(e);
  }
  function oh(e) {
    Ni(e);
  }
  function Ii(e, t) {
    try {
      var l = e.onUncaughtError;
      l(t.value, { componentStack: t.stack });
    } catch (a) {
      setTimeout(function () {
        throw a;
      });
    }
  }
  function dh(e, t, l) {
    try {
      var a = e.onCaughtError;
      a(l.value, {
        componentStack: l.stack,
        errorBoundary: t.tag === 1 ? t.stateNode : null,
      });
    } catch (s) {
      setTimeout(function () {
        throw s;
      });
    }
  }
  function sr(e, t, l) {
    return (
      (l = un(l)),
      (l.tag = 3),
      (l.payload = { element: null }),
      (l.callback = function () {
        Ii(e, t);
      }),
      l
    );
  }
  function fh(e) {
    return ((e = un(e)), (e.tag = 3), e);
  }
  function hh(e, t, l, a) {
    var s = l.type.getDerivedStateFromError;
    if (typeof s == "function") {
      var i = a.value;
      ((e.payload = function () {
        return s(i);
      }),
        (e.callback = function () {
          dh(t, l, a);
        }));
    }
    var u = l.stateNode;
    u !== null &&
      typeof u.componentDidCatch == "function" &&
      (e.callback = function () {
        (dh(t, l, a),
          typeof s != "function" &&
            (xn === null ? (xn = new Set([this])) : xn.add(this)));
        var o = a.stack;
        this.componentDidCatch(a.value, {
          componentStack: o !== null ? o : "",
        });
      });
  }
  function xx(e, t, l, a, s) {
    if (
      ((l.flags |= 32768),
      a !== null && typeof a == "object" && typeof a.then == "function")
    ) {
      if (
        ((t = l.alternate),
        t !== null && Bn(t, l, s, !0),
        (l = Et.current),
        l !== null)
      ) {
        switch (l.tag) {
          case 31:
          case 13:
          case 19:
            return (
              Dt === null ? vc() : l.alternate === null && ut === 0 && (ut = 3),
              (l.flags &= -257),
              (l.flags |= 65536),
              (l.lanes = s),
              a === Mi
                ? (l.flags |= 16384)
                : ((t = l.updateQueue),
                  t === null ? (l.updateQueue = new Set([a])) : t.add(a),
                  Vr(e, a, s)),
              !1
            );
          case 22:
            return (
              (l.flags |= 65536),
              a === Mi
                ? (l.flags |= 16384)
                : ((t = l.updateQueue),
                  t === null
                    ? ((t = {
                        transitions: null,
                        markerInstances: null,
                        retryQueue: new Set([a]),
                      }),
                      (l.updateQueue = t))
                    : ((l = t.retryQueue),
                      l === null ? (t.retryQueue = new Set([a])) : l.add(a)),
                  Vr(e, a, s)),
              !1
            );
        }
        throw Error(r(435, l.tag));
      }
      return (Vr(e, a, s), vc(), !1);
    }
    if (qe)
      return (
        (t = Et.current),
        t !== null
          ? ((t.flags & 65536) === 0 && (t.flags |= 256),
            (t.flags |= 65536),
            (t.lanes = s),
            a !== Eu && ((e = Error(r(422), { cause: a })), fs(nl(e, l))))
          : (a !== Eu && ((t = Error(r(423), { cause: a })), fs(nl(t, l))),
            (e = e.current.alternate),
            (e.flags |= 65536),
            (s &= -s),
            (e.lanes |= s),
            (a = nl(a, l)),
            (s = sr(e.stateNode, a, s)),
            Mu(e, s),
            ut !== 4 && (ut = 2)),
        !1
      );
    var i = Error(r(520), { cause: a });
    if (
      ((i = nl(i, l)),
      Ds === null ? (Ds = [i]) : Ds.push(i),
      ut !== 4 && (ut = 2),
      t === null)
    )
      return !0;
    ((a = nl(a, l)), (l = t));
    do {
      switch (l.tag) {
        case 3:
          return (
            (l.flags |= 65536),
            (e = s & -s),
            (l.lanes |= e),
            (e = sr(l.stateNode, a, e)),
            Mu(l, e),
            !1
          );
        case 1:
          if (
            ((t = l.type),
            (i = l.stateNode),
            (l.flags & 128) === 0 &&
              (typeof t.getDerivedStateFromError == "function" ||
                (i !== null &&
                  typeof i.componentDidCatch == "function" &&
                  (xn === null || !xn.has(i)))))
          )
            return (
              (l.flags |= 65536),
              (s &= -s),
              (l.lanes |= s),
              (s = fh(s)),
              hh(s, e, l, a),
              Mu(l, s),
              !1
            );
          break;
        case 22:
          if (l.memoizedState !== null) return ((l.flags |= 65536), !1);
      }
      l = l.return;
    } while (l !== null);
    return !1;
  }
  var ir = Error(r(461)),
    ht = !1;
  function vt(e, t, l, a) {
    t.child = e === null ? xf(t, null, l, a) : Xn(t, e.child, l, a);
  }
  function mh(e, t, l, a, s) {
    l = l.render;
    var i = t.ref;
    if ("ref" in a) {
      var u = {};
      for (var o in a) o !== "ref" && (u[o] = a[o]);
    } else u = a;
    return (
      kn(t),
      (a = Yu(e, t, l, u, i, s)),
      (o = Vu()),
      e !== null && !ht
        ? (Gu(e, t, s), Vl(e, t, s))
        : (qe && o && _i(t), (t.flags |= 1), vt(e, t, a, s), t.child)
    );
  }
  function ph(e, t, l, a, s) {
    if (e === null) {
      var i = l.type;
      return typeof i == "function" &&
        !bu(i) &&
        i.defaultProps === void 0 &&
        l.compare === null
        ? ((t.tag = 15), (t.type = i), vh(e, t, i, a, s))
        : ((e = Ci(l.type, null, a, t, t.mode, s)),
          (e.ref = t.ref),
          (e.return = t),
          (t.child = e));
    }
    if (((i = e.child), !mr(e, s))) {
      var u = i.memoizedProps;
      if (
        ((l = l.compare), (l = l !== null ? l : rs), l(u, a) && e.ref === t.ref)
      )
        return Vl(e, t, s);
    }
    return (
      (t.flags |= 1),
      (e = Hl(i, a)),
      (e.ref = t.ref),
      (e.return = t),
      (t.child = e)
    );
  }
  function vh(e, t, l, a, s) {
    if (e !== null) {
      var i = e.memoizedProps;
      if (rs(i, a) && e.ref === t.ref)
        if (((ht = !1), (t.pendingProps = a = i), mr(e, s)))
          (e.flags & 131072) !== 0 && (ht = !0);
        else return ((t.lanes = e.lanes), Vl(e, t, s));
    }
    return cr(e, t, l, a, s);
  }
  function xh(e, t, l, a) {
    var s = a.children,
      i = e !== null ? e.memoizedState : null;
    if (
      (e === null &&
        t.stateNode === null &&
        (t.stateNode = {
          _visibility: 1,
          _pendingMarkers: null,
          _retryCache: null,
          _transitions: null,
        }),
      a.mode === "hidden")
    ) {
      if ((t.flags & 128) !== 0) {
        if (((i = i !== null ? i.baseLanes | l : l), e !== null)) {
          for (a = t.child = e.child, s = 0; a !== null; )
            ((s = s | a.lanes | a.childLanes), (a = a.sibling));
          a = s & ~i;
        } else ((a = 0), (t.child = null));
        return yh(e, t, i, l, a);
      }
      if ((l & 536870912) !== 0)
        ((t.memoizedState = { baseLanes: 0, cachePool: null }),
          e !== null && zi(t, i !== null ? i.cachePool : null),
          i !== null ? jf(t, i) : Hu(),
          bf(t));
      else
        return (
          (a = t.lanes = 536870912),
          yh(e, t, i !== null ? i.baseLanes | l : l, l, a)
        );
    } else
      i !== null
        ? (zi(t, i.cachePool), jf(t, i), fn(), (t.memoizedState = null))
        : (e !== null && zi(t, null), Hu(), fn());
    return (vt(e, t, s, l), t.child);
  }
  function Ts(e, t) {
    return (
      (e !== null && e.tag === 22) ||
        t.stateNode !== null ||
        (t.stateNode = {
          _visibility: 1,
          _pendingMarkers: null,
          _retryCache: null,
          _transitions: null,
        }),
      t.sibling
    );
  }
  function yh(e, t, l, a, s) {
    var i = Du();
    return (
      (i = i === null ? null : { parent: dt._currentValue, pool: i }),
      (t.memoizedState = { baseLanes: l, cachePool: i }),
      e !== null && zi(t, null),
      Hu(),
      bf(t),
      e !== null && Bn(e, t, a, !0),
      (t.childLanes = s),
      null
    );
  }
  function $i(e, t) {
    return (
      (t = Fi({ mode: t.mode, children: t.children }, e.mode)),
      (t.ref = e.ref),
      (e.child = t),
      (t.return = e),
      t
    );
  }
  function gh(e, t, l) {
    return (
      Xn(t, e.child, null, l),
      (e = $i(t, t.pendingProps)),
      (e.flags |= 2),
      Jt(t),
      (t.memoizedState = null),
      e
    );
  }
  function yx(e, t, l) {
    var a = t.pendingProps,
      s = (t.flags & 128) !== 0;
    if (((t.flags &= -129), e === null)) {
      if (qe) {
        if (a.mode === "hidden")
          return (
            (e = $i(t, a)),
            (t.lanes = 536870912),
            (e.memoizedState = { baseLanes: 0, cachePool: null }),
            Ts(null, e)
          );
        if (
          (Lu(t),
          (e = tt)
            ? ((e = Qm(e, il)),
              (e = e !== null && e.data === "&" ? e : null),
              e !== null &&
                ((t.memoizedState = {
                  dehydrated: e,
                  treeContext: tn !== null ? { id: bl, overflow: Nl } : null,
                  retryLane: 536870912,
                  hydrationErrors: null,
                }),
                (l = tf(e)),
                (l.return = t),
                (t.child = l),
                (yt = t),
                (tt = null)))
            : (e = null),
          e === null)
        )
          throw nn(t);
        return ((t.lanes = 536870912), null);
      }
      return $i(t, a);
    }
    var i = e.memoizedState;
    if (i !== null) {
      var u = i.dehydrated;
      if ((Lu(t), s))
        if (t.flags & 256) ((t.flags &= -257), (t = gh(e, t, l)));
        else if (t.memoizedState !== null)
          ((t.child = e.child), (t.flags |= 128), (t = null));
        else throw Error(r(558));
      else if (
        (ht || Bn(e, t, l, !1), (s = (l & e.childLanes) !== 0), ht || s)
      ) {
        if (on.current === null) {
          if (
            ((a = Pe),
            a !== null && ((u = ad(a, l)), u !== 0 && u !== i.retryLane))
          )
            throw ((i.retryLane = u), qn(e, u), Vt(a, e, u), ir);
          vc();
        }
        t = gh(e, t, l);
      } else
        ((e = i.treeContext),
          (tt = ul(u.nextSibling)),
          (yt = t),
          (qe = !0),
          (ln = null),
          (il = !1),
          e !== null && af(t, e),
          (t = $i(t, a)),
          (t.flags |= 134221824));
      return t;
    }
    return (
      (e = Hl(e.child, { mode: a.mode, children: a.children })),
      (e.ref = t.ref),
      (t.child = e),
      (e.return = t),
      e
    );
  }
  function _a(e, t) {
    var l = t.ref;
    if (l === null) e !== null && e.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof l != "function" && typeof l != "object") throw Error(r(284));
      (e === null || e.ref !== l) && (t.flags |= 4194816);
    }
  }
  function cr(e, t, l, a, s) {
    return (
      kn(t),
      (l = Yu(e, t, l, a, void 0, s)),
      (a = Vu()),
      e !== null && !ht
        ? (Gu(e, t, s), Vl(e, t, s))
        : (qe && a && _i(t), (t.flags |= 1), vt(e, t, l, s), t.child)
    );
  }
  function jh(e, t, l, a, s, i) {
    return (
      kn(t),
      (t.updateQueue = null),
      (l = Sf(t, a, l, s)),
      Nf(e),
      (a = Vu()),
      e !== null && !ht
        ? (Gu(e, t, i), Vl(e, t, i))
        : (qe && a && _i(t), (t.flags |= 1), vt(e, t, l, i), t.child)
    );
  }
  function bh(e, t, l, a, s) {
    if ((kn(t), t.stateNode === null)) {
      var i = ya,
        u = l.contextType;
      (typeof u == "object" && u !== null && (i = Tt(u)),
        (i = new l(a, i)),
        (t.memoizedState =
          i.state !== null && i.state !== void 0 ? i.state : null),
        (i.updater = ar),
        (t.stateNode = i),
        (i._reactInternals = t),
        (i = t.stateNode),
        (i.props = a),
        (i.state = t.memoizedState),
        (i.refs = {}),
        zu(t),
        (u = l.contextType),
        (i.context = typeof u == "object" && u !== null ? Tt(u) : ya),
        (i.state = t.memoizedState),
        (u = l.getDerivedStateFromProps),
        typeof u == "function" && (nr(t, l, u, a), (i.state = t.memoizedState)),
        typeof l.getDerivedStateFromProps == "function" ||
          typeof i.getSnapshotBeforeUpdate == "function" ||
          (typeof i.UNSAFE_componentWillMount != "function" &&
            typeof i.componentWillMount != "function") ||
          ((u = i.state),
          typeof i.componentWillMount == "function" && i.componentWillMount(),
          typeof i.UNSAFE_componentWillMount == "function" &&
            i.UNSAFE_componentWillMount(),
          u !== i.state && ar.enqueueReplaceState(i, i.state, null),
          gs(t, a, i, s),
          ys(),
          (i.state = t.memoizedState)),
        typeof i.componentDidMount == "function" && (t.flags |= 4194308),
        (a = !0));
    } else if (e === null) {
      i = t.stateNode;
      var o = t.memoizedProps,
        x = Jn(l, o);
      i.props = x;
      var w = i.context,
        q = l.contextType;
      ((u = ya), typeof q == "object" && q !== null && (u = Tt(q)));
      var X = l.getDerivedStateFromProps;
      ((q =
        typeof X == "function" ||
        typeof i.getSnapshotBeforeUpdate == "function"),
        (o = t.pendingProps !== o),
        q ||
          (typeof i.UNSAFE_componentWillReceiveProps != "function" &&
            typeof i.componentWillReceiveProps != "function") ||
          ((o || w !== u) && ch(t, i, a, u)),
        (cn = !1));
      var T = t.memoizedState;
      ((i.state = T),
        gs(t, a, i, s),
        ys(),
        (w = t.memoizedState),
        o || T !== w || cn
          ? (typeof X == "function" && (nr(t, l, X, a), (w = t.memoizedState)),
            (x = cn || ih(t, l, x, a, T, w, u))
              ? (q ||
                  (typeof i.UNSAFE_componentWillMount != "function" &&
                    typeof i.componentWillMount != "function") ||
                  (typeof i.componentWillMount == "function" &&
                    i.componentWillMount(),
                  typeof i.UNSAFE_componentWillMount == "function" &&
                    i.UNSAFE_componentWillMount()),
                typeof i.componentDidMount == "function" &&
                  (t.flags |= 4194308))
              : (typeof i.componentDidMount == "function" &&
                  (t.flags |= 4194308),
                (t.memoizedProps = a),
                (t.memoizedState = w)),
            (i.props = a),
            (i.state = w),
            (i.context = u),
            (a = x))
          : (typeof i.componentDidMount == "function" && (t.flags |= 4194308),
            (a = !1)));
    } else {
      ((i = t.stateNode),
        Uu(e, t),
        (u = t.memoizedProps),
        (q = Jn(l, u)),
        (i.props = q),
        (X = t.pendingProps),
        (T = i.context),
        (w = l.contextType),
        (x = ya),
        typeof w == "object" && w !== null && (x = Tt(w)),
        (o = l.getDerivedStateFromProps),
        (w =
          typeof o == "function" ||
          typeof i.getSnapshotBeforeUpdate == "function") ||
          (typeof i.UNSAFE_componentWillReceiveProps != "function" &&
            typeof i.componentWillReceiveProps != "function") ||
          ((u !== X || T !== x) && ch(t, i, a, x)),
        (cn = !1),
        (T = t.memoizedState),
        (i.state = T),
        gs(t, a, i, s),
        ys());
      var z = t.memoizedState;
      u !== X ||
      T !== z ||
      cn ||
      (e !== null && e.dependencies !== null && Di(e.dependencies))
        ? (typeof o == "function" && (nr(t, l, o, a), (z = t.memoizedState)),
          (q =
            cn ||
            ih(t, l, q, a, T, z, x) ||
            (e !== null && e.dependencies !== null && Di(e.dependencies)))
            ? (w ||
                (typeof i.UNSAFE_componentWillUpdate != "function" &&
                  typeof i.componentWillUpdate != "function") ||
                (typeof i.componentWillUpdate == "function" &&
                  i.componentWillUpdate(a, z, x),
                typeof i.UNSAFE_componentWillUpdate == "function" &&
                  i.UNSAFE_componentWillUpdate(a, z, x)),
              typeof i.componentDidUpdate == "function" && (t.flags |= 4),
              typeof i.getSnapshotBeforeUpdate == "function" &&
                (t.flags |= 1024))
            : (typeof i.componentDidUpdate != "function" ||
                (u === e.memoizedProps && T === e.memoizedState) ||
                (t.flags |= 4),
              typeof i.getSnapshotBeforeUpdate != "function" ||
                (u === e.memoizedProps && T === e.memoizedState) ||
                (t.flags |= 1024),
              (t.memoizedProps = a),
              (t.memoizedState = z)),
          (i.props = a),
          (i.state = z),
          (i.context = x),
          (a = q))
        : (typeof i.componentDidUpdate != "function" ||
            (u === e.memoizedProps && T === e.memoizedState) ||
            (t.flags |= 4),
          typeof i.getSnapshotBeforeUpdate != "function" ||
            (u === e.memoizedProps && T === e.memoizedState) ||
            (t.flags |= 1024),
          (a = !1));
    }
    return (
      (i = a),
      _a(e, t),
      (a = (t.flags & 128) !== 0),
      i || a
        ? ((i = t.stateNode),
          (l =
            a && typeof l.getDerivedStateFromError != "function"
              ? null
              : i.render()),
          (t.flags |= 1),
          e !== null && a
            ? ((t.child = Xn(t, e.child, null, s)),
              (t.child = Xn(t, null, l, s)))
            : vt(e, t, l, s),
          (t.memoizedState = i.state),
          (e = t.child))
        : (e = Vl(e, t, s)),
      e
    );
  }
  function Nh(e, t, l, a) {
    return (Kn(), (t.flags |= 256), vt(e, t, l, a), t.child);
  }
  var ur = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null,
  };
  function rr(e) {
    return { baseLanes: e, cachePool: df() };
  }
  function or(e, t, l) {
    return ((e = e !== null ? e.childLanes & ~l : 0), t && (e |= Ft), e);
  }
  function Sh(e, t, l) {
    var a = t.pendingProps,
      s = !1,
      i = (t.flags & 128) !== 0,
      u;
    if (
      ((u = i) ||
        (u =
          e !== null && e.memoizedState === null ? !1 : (Ct.current & 2) !== 0),
      u && ((s = !0), (t.flags &= -129)),
      (u = (t.flags & 32) !== 0),
      (t.flags &= -33),
      e === null)
    ) {
      if (qe) {
        if (
          (s ? dn(t) : fn(),
          (e = tt)
            ? ((e = Qm(e, il)),
              (e = e !== null && e.data !== "&" ? e : null),
              e !== null &&
                ((t.memoizedState = {
                  dehydrated: e,
                  treeContext: tn !== null ? { id: bl, overflow: Nl } : null,
                  retryLane: 536870912,
                  hydrationErrors: null,
                }),
                (l = tf(e)),
                (l.return = t),
                (t.child = l),
                (yt = t),
                (tt = null)))
            : (e = null),
          e === null)
        )
          throw nn(t);
        return (ro(e) ? (t.lanes = 32) : (t.lanes = 536870912), null);
      }
      return (
        (i = a.children),
        (a = a.fallback),
        s
          ? (fn(),
            (s = t.mode),
            (i = Fi({ mode: "hidden", children: i }, s)),
            (a = Hn(a, s, l, null)),
            (i.return = t),
            (a.return = t),
            (i.sibling = a),
            (t.child = i),
            (a = t.child),
            (a.memoizedState = rr(l)),
            (a.childLanes = or(e, u, l)),
            (t.memoizedState = ur),
            Ts(null, a))
          : (dn(t), dr(t, i))
      );
    }
    var o = e.memoizedState;
    if (o !== null) {
      var x = o.dehydrated;
      if (x !== null) return gx(e, t, i, u, a, x, o, l);
    }
    return s
      ? (fn(),
        (s = a.fallback),
        (i = t.mode),
        (o = e.child),
        (x = o.sibling),
        (a = Hl(o, { mode: "hidden", children: a.children })),
        (a.subtreeFlags = o.subtreeFlags & 1206910976),
        x !== null ? (s = Hl(x, s)) : ((s = Hn(s, i, l, null)), (s.flags |= 2)),
        (s.return = t),
        (a.return = t),
        (a.sibling = s),
        (t.child = a),
        Ts(null, a),
        (a = t.child),
        (s = e.child.memoizedState),
        s === null
          ? (s = rr(l))
          : ((i = s.cachePool),
            i !== null
              ? ((o = dt._currentValue),
                (i = i.parent !== o ? { parent: o, pool: o } : i))
              : (i = df()),
            (s = { baseLanes: s.baseLanes | l, cachePool: i })),
        (a.memoizedState = s),
        (a.childLanes = or(e, u, l)),
        (t.memoizedState = ur),
        Ts(e.child, a))
      : (dn(t),
        (l = e.child),
        (e = l.sibling),
        (l = Hl(l, { mode: "visible", children: a.children })),
        (l.return = t),
        (l.sibling = null),
        e !== null &&
          ((u = t.deletions),
          u === null ? ((t.deletions = [e]), (t.flags |= 16)) : u.push(e)),
        (t.child = l),
        (t.memoizedState = null),
        l);
  }
  function dr(e, t) {
    return (
      (t = Fi({ mode: "visible", children: t }, e.mode)),
      (t.return = e),
      (e.child = t)
    );
  }
  function Fi(e, t) {
    return ((e = Lt(22, e, null, t)), (e.lanes = 0), e);
  }
  function Wi(e, t, l) {
    return (
      Xn(t, e.child, null, l),
      (e = dr(t, t.pendingProps.children)),
      (e.flags |= 2),
      (t.memoizedState = null),
      e
    );
  }
  function gx(e, t, l, a, s, i, u, o) {
    if (l)
      return t.flags & 256
        ? (dn(t), (t.flags &= -257), Wi(e, t, o))
        : t.memoizedState !== null
          ? (fn(), (t.child = e.child), (t.flags |= 128), null)
          : (fn(),
            (i = s.fallback),
            (u = t.mode),
            (s = Fi({ mode: "visible", children: s.children }, u)),
            (i = Hn(i, u, o, null)),
            (i.flags |= 2),
            (s.return = t),
            (i.return = t),
            (s.sibling = i),
            (t.child = s),
            Xn(t, e.child, null, o),
            (s = t.child),
            (s.memoizedState = rr(o)),
            (s.childLanes = or(e, a, o)),
            (t.memoizedState = ur),
            Ts(null, s));
    if ((dn(t), ro(i))) {
      if (((a = i.nextSibling && i.nextSibling.dataset), a)) var x = a.dgst;
      return (
        (a = x),
        a !== "" &&
          ((s = Error(r(419))),
          (s.stack = ""),
          (s.digest = a),
          fs({ value: s, source: null, stack: null })),
        Wi(e, t, o)
      );
    }
    if ((ht || Bn(e, t, o, !1), (a = (o & e.childLanes) !== 0), ht || a)) {
      if (on.current !== null) return Wi(e, t, o);
      if (
        ((a = Pe), a !== null && ((s = ad(a, o)), s !== 0 && s !== u.retryLane))
      )
        throw ((u.retryLane = s), qn(e, s), Vt(a, e, s), ir);
      return (uo(i) || vc(), Wi(e, t, o));
    }
    return uo(i)
      ? ((t.flags |= 192), (t.child = e.child), null)
      : ((e = u.treeContext),
        (tt = ul(i.nextSibling)),
        (yt = t),
        (qe = !0),
        (ln = null),
        (il = !1),
        e !== null && af(t, e),
        (t = dr(t, s.children)),
        (t.flags |= 134221824),
        t);
  }
  function Th(e, t, l) {
    e.lanes |= t;
    var a = e.alternate;
    (a !== null && (a.lanes |= t), Ri(e.return, t, l));
  }
  function Eh(e) {
    for (var t = null; e !== null; ) {
      var l = e.alternate;
      (l !== null && Li(l) === null && (t = e), (e = e.sibling));
    }
    return t;
  }
  function Pi(e, t, l, a, s, i) {
    var u = e.memoizedState;
    u === null
      ? (e.memoizedState = {
          isBackwards: t,
          rendering: null,
          renderingStartTime: 0,
          last: a,
          tail: l,
          tailMode: s,
          treeForkCount: i,
        })
      : ((u.isBackwards = t),
        (u.rendering = null),
        (u.renderingStartTime = 0),
        (u.last = a),
        (u.tail = l),
        (u.tailMode = s),
        (u.treeForkCount = i));
  }
  function fr(e) {
    var t = e.child;
    for (e.child = null; t !== null; ) {
      var l = t.sibling;
      ((t.sibling = e.child), (e.child = t), (t = l));
    }
  }
  function hr(e, t, l) {
    var a = t.pendingProps,
      s = a.revealOrder,
      i = a.tail;
    a = a.children;
    var u = Ct.current;
    if (t.flags & 128) return (js(t, u), null);
    var o = (u & 2) !== 0;
    if (
      (o ? ((u = (u & 1) | 2), (t.flags |= 128)) : (u &= 1),
      js(t, u),
      s === "backwards" && e !== null
        ? (fr(e), vt(e, t, a, l), fr(e))
        : vt(e, t, a, l),
      (a = qe ? ds : 0),
      !o && e !== null && (e.flags & 128) !== 0)
    )
      e: for (e = t.child; e !== null; ) {
        if (e.tag === 13) e.memoizedState !== null && Th(e, l, t);
        else if (e.tag === 19) Th(e, l, t);
        else if (e.child !== null) {
          ((e.child.return = e), (e = e.child));
          continue;
        }
        if (e === t) break e;
        for (; e.sibling === null; ) {
          if (e.return === null || e.return === t) break e;
          e = e.return;
        }
        ((e.sibling.return = e.return), (e = e.sibling));
      }
    switch (s) {
      case "backwards":
        ((l = Eh(t.child)),
          l === null
            ? ((s = t.child), (t.child = null))
            : ((s = l.sibling), (l.sibling = null), fr(t)),
          Pi(t, !0, s, null, i, a));
        break;
      case "unstable_legacy-backwards":
        for (l = null, s = t.child, t.child = null; s !== null; ) {
          if (((e = s.alternate), e !== null && Li(e) === null)) {
            t.child = s;
            break;
          }
          ((e = s.sibling), (s.sibling = l), (l = s), (s = e));
        }
        Pi(t, !0, l, null, i, a);
        break;
      case "together":
        Pi(t, !1, null, null, void 0, a);
        break;
      case "independent":
        t.memoizedState = null;
        break;
      default:
        ((l = Eh(t.child)),
          l === null
            ? ((s = t.child), (t.child = null))
            : ((s = l.sibling), (l.sibling = null)),
          Pi(t, !1, s, l, i, a));
    }
    return t.child;
  }
  function Ch(e, t, l) {
    var a = t.pendingProps;
    return (an(t, t.type, a.value), vt(e, t, a.children, l), t.child);
  }
  function Vl(e, t, l) {
    if (
      (e !== null && (t.dependencies = e.dependencies),
      (vn |= t.lanes),
      (l & t.childLanes) === 0)
    )
      if (e !== null) {
        if ((Bn(e, t, l, !1), (l & t.childLanes) === 0)) return null;
      } else return null;
    if (e !== null && t.child !== e.child) throw Error(r(153));
    if (t.child !== null) {
      for (
        e = t.child, l = Hl(e, e.pendingProps), t.child = l, l.return = t;
        e.sibling !== null;

      )
        ((e = e.sibling),
          (l = l.sibling = Hl(e, e.pendingProps)),
          (l.return = t));
      l.sibling = null;
    }
    return t.child;
  }
  function mr(e, t) {
    return (e.lanes & t) !== 0
      ? !0
      : ((e = e.dependencies), !!(e !== null && Di(e)));
  }
  function jx(e, t, l) {
    switch (t.tag) {
      case 3:
        (st(t, t.stateNode.containerInfo),
          an(t, dt, e.memoizedState.cache),
          Kn());
        break;
      case 27:
      case 5:
        Qt(t);
        break;
      case 4:
        st(t, t.stateNode.containerInfo);
        break;
      case 10:
        an(t, t.type, t.memoizedProps.value);
        break;
      case 31:
        if (t.memoizedState !== null) return ((t.flags |= 128), Lu(t), null);
        break;
      case 13:
        var a = t.memoizedState;
        if (a !== null) {
          if (a.dehydrated !== null) return (dn(t), (t.flags |= 128), null);
          a = Bn(e, t, l, !1);
          var s = t.child.childLanes;
          return a || (l & s) !== 0
            ? Sh(e, t, l)
            : (dn(t), (e = Vl(e, t, l)), e !== null ? e.sibling : null);
        }
        dn(t);
        break;
      case 19:
        if (t.flags & 128) return hr(e, t, l);
        if (
          ((s = (e.flags & 128) !== 0),
          (a = (l & t.childLanes) !== 0),
          a || (Bn(e, t, l, !1), (a = (l & t.childLanes) !== 0)),
          s)
        ) {
          if (a) return hr(e, t, l);
          t.flags |= 128;
        }
        if (
          ((s = t.memoizedState),
          s !== null &&
            ((s.rendering = null), (s.tail = null), (s.lastEffect = null)),
          js(t, Ct.current),
          a)
        )
          break;
        return null;
      case 22:
        return ((t.lanes = 0), xh(e, t, l, t.pendingProps));
      case 24:
        an(t, dt, e.memoizedState.cache);
    }
    return Vl(e, t, l);
  }
  function wh(e, t, l) {
    if (e !== null)
      if (e.memoizedProps !== t.pendingProps) ht = !0;
      else {
        if (!mr(e, l) && (t.flags & 128) === 0) return ((ht = !1), jx(e, t, l));
        ht = (e.flags & 131072) !== 0;
      }
    else ((ht = !1), qe && (t.flags & 1048576) !== 0 && nf(t, ds, t.index));
    switch (((t.lanes = 0), t.tag)) {
      case 16:
        e: {
          var a = t.pendingProps;
          if (((e = Gn(t.elementType)), (t.type = e), typeof e == "function"))
            bu(e)
              ? ((a = Jn(e, a)), (t.tag = 1), (t = bh(null, t, e, a, l)))
              : ((t.tag = 0), (t = cr(null, t, e, a, l)));
          else {
            if (e != null) {
              var s = e.$$typeof;
              if (s === V) {
                ((t.tag = 11), (t = mh(null, t, e, a, l)));
                break e;
              } else if (s === ve) {
                ((t.tag = 14), (t = ph(null, t, e, a, l)));
                break e;
              } else if (s === ae) {
                ((t.tag = 10), (t.type = e), (t = Ch(null, t, l)));
                break e;
              }
            }
            throw ((t = ye(e) || e), Error(r(306, t, "")));
          }
        }
        return t;
      case 0:
        return cr(e, t, t.type, t.pendingProps, l);
      case 1:
        return ((a = t.type), (s = Jn(a, t.pendingProps)), bh(e, t, a, s, l));
      case 3:
        e: {
          if ((st(t, t.stateNode.containerInfo), e === null))
            throw Error(r(387));
          a = t.pendingProps;
          var i = t.memoizedState;
          ((s = i.element), Uu(e, t), gs(t, a, null, l));
          var u = t.memoizedState;
          if (
            ((a = u.cache),
            an(t, dt, a),
            a !== i.cache && _u(t, [dt], l, !0),
            ys(),
            (a = u.element),
            i.isDehydrated)
          )
            if (
              ((i = { element: a, isDehydrated: !1, cache: u.cache }),
              (t.updateQueue.baseState = i),
              (t.memoizedState = i),
              t.flags & 256)
            ) {
              t = Nh(e, t, a, l);
              break e;
            } else if (a !== s) {
              ((s = nl(Error(r(424)), t)), fs(s), (t = Nh(e, t, a, l)));
              break e;
            } else
              for (
                e = t.stateNode.containerInfo,
                  e.nodeType === 9
                    ? (e = e.body)
                    : (e = e.nodeName === "HTML" ? e.ownerDocument.body : e),
                  tt = ul(e.firstChild),
                  yt = t,
                  qe = !0,
                  ln = null,
                  il = !0,
                  l = xf(t, null, a, l),
                  t.child = l;
                l;

              )
                ((l.flags = (l.flags & -3) | 134221824), (l = l.sibling));
          else {
            if ((Kn(), a === s)) {
              t = Vl(e, t, l);
              break e;
            }
            vt(e, t, a, l);
          }
          t = t.child;
        }
        return t;
      case 26:
        return (
          _a(e, t),
          e === null
            ? (l = Wm(t.type, null, t.pendingProps, null))
              ? (t.memoizedState = l)
              : qe || (t.stateNode = Dm(t.type, t.pendingProps, O.current, t))
            : (t.memoizedState = Wm(
                t.type,
                e.memoizedProps,
                t.pendingProps,
                e.memoizedState,
              )),
          null
        );
      case 27:
        return (
          Qt(t),
          e === null &&
            qe &&
            ((a = t.stateNode = Jm(t.type, t.pendingProps, O.current)),
            (yt = t),
            (il = !0),
            (s = tt),
            jn(t.type) ? ((oo = s), (tt = ul(a.firstChild))) : (tt = s)),
          vt(e, t, t.pendingProps.children, l),
          _a(e, t),
          e === null && (t.flags |= 4194304),
          t.child
        );
      case 5:
        return (
          e === null &&
            qe &&
            ((s = a = tt) &&
              ((a = my(a, t.type, t.pendingProps, il)),
              a !== null
                ? ((t.stateNode = a),
                  (yt = t),
                  (tt = ul(a.firstChild)),
                  (il = !1),
                  (s = !0))
                : (s = !1)),
            s || nn(t)),
          Qt(t),
          (s = t.type),
          (i = t.pendingProps),
          (u = e !== null ? e.memoizedProps : null),
          (a = i.children),
          to(s, i) ? (a = null) : u !== null && to(s, u) && (t.flags |= 32),
          t.memoizedState !== null &&
            ((s = Yu(e, t, rx, null, null, l)), (Xa._currentValue = s)),
          _a(e, t),
          vt(e, t, a, l),
          t.child
        );
      case 6:
        return (
          e === null &&
            qe &&
            ((e = l = tt) &&
              ((l = py(l, t.pendingProps, il)),
              l !== null
                ? ((t.stateNode = l), (yt = t), (tt = null), (e = !0))
                : (e = !1)),
            e || nn(t)),
          null
        );
      case 13:
        return Sh(e, t, l);
      case 4:
        return (
          st(t, t.stateNode.containerInfo),
          (a = t.pendingProps),
          e === null ? (t.child = Xn(t, null, a, l)) : vt(e, t, a, l),
          t.child
        );
      case 11:
        return mh(e, t, t.type, t.pendingProps, l);
      case 7:
        return ((a = t.pendingProps), _a(e, t), vt(e, t, a, l), t.child);
      case 8:
        return (vt(e, t, t.pendingProps.children, l), t.child);
      case 12:
        return (vt(e, t, t.pendingProps.children, l), t.child);
      case 10:
        return Ch(e, t, l);
      case 9:
        return (
          (s = t.type._context),
          (a = t.pendingProps.children),
          kn(t),
          (s = Tt(s)),
          (a = a(s)),
          (t.flags |= 1),
          vt(e, t, a, l),
          t.child
        );
      case 14:
        return ph(e, t, t.type, t.pendingProps, l);
      case 15:
        return vh(e, t, t.type, t.pendingProps, l);
      case 19:
        return hr(e, t, l);
      case 31:
        return yx(e, t, l);
      case 22:
        return xh(e, t, l, t.pendingProps);
      case 24:
        return (
          kn(t),
          (a = Tt(dt)),
          e === null
            ? ((s = Du()),
              s === null &&
                ((s = Pe),
                (i = Au()),
                (s.pooledCache = i),
                i.refCount++,
                i !== null && (s.pooledCacheLanes |= l),
                (s = i)),
              (t.memoizedState = { parent: a, cache: s }),
              zu(t),
              an(t, dt, s))
            : ((e.lanes & l) !== 0 && (Uu(e, t), gs(t, null, null, l), ys()),
              (s = e.memoizedState),
              (i = t.memoizedState),
              s.parent !== a
                ? ((s = { parent: a, cache: a }),
                  (t.memoizedState = s),
                  t.lanes === 0 &&
                    (t.memoizedState = t.updateQueue.baseState = s),
                  an(t, dt, a))
                : ((a = i.cache),
                  an(t, dt, a),
                  a !== s.cache && _u(t, [dt], l, !0))),
          vt(e, t, t.pendingProps.children, l),
          t.child
        );
      case 30:
        return (
          t.stateNode === null &&
            (t.stateNode = {
              autoName: null,
              paired: null,
              clones: null,
              ref: null,
            }),
          (a = t.pendingProps),
          a.name != null && a.name !== "auto"
            ? (t.flags |= e === null ? 18882560 : 18874368)
            : qe && _i(t),
          e !== null && e.memoizedProps.name !== a.name
            ? (t.flags |= 4194816)
            : _a(e, t),
          vt(e, t, a.children, l),
          t.child
        );
      case 29:
        throw t.pendingProps;
    }
    throw Error(r(156, t.tag));
  }
  function Gl(e) {
    e.flags |= 4;
  }
  function pr(e, t, l, a, s) {
    var i;
    if (
      ((i = (e.mode & 32) !== 0) &&
        (i =
          l === null
            ? lp(t, a)
            : lp(t, a) && (a.src !== l.src || a.srcSet !== l.srcSet)),
      i)
    ) {
      if (((e.flags |= 16777216), (s & 335544128) === s))
        if (e.stateNode.complete) e.flags |= 8192;
        else if (um()) e.flags |= 8192;
        else throw ((Qn = Mi), Ou);
    } else e.flags &= -16777217;
  }
  function _h(e, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0)
      e.flags &= -16777217;
    else if (((e.flags |= 16777216), !np(t)))
      if (um()) e.flags |= 8192;
      else throw ((Qn = Mi), Ou);
  }
  function ec(e, t) {
    (t !== null && (e.flags |= 4),
      e.flags & 16384 &&
        ((t = e.tag !== 22 ? td() : 536870912), (e.lanes |= t), (za |= t)));
  }
  function Es(e, t) {
    if (!qe)
      switch (e.tailMode) {
        case "visible":
          break;
        case "collapsed":
          for (var l = e.tail, a = null; l !== null; )
            (l.alternate !== null && (a = l), (l = l.sibling));
          a === null
            ? t || e.tail === null
              ? (e.tail = null)
              : (e.tail.sibling = null)
            : (a.sibling = null);
          break;
        default:
          for (t = e.tail, l = null; t !== null; )
            (t.alternate !== null && (l = t), (t = t.sibling));
          l === null ? (e.tail = null) : (l.sibling = null);
      }
  }
  function lt(e) {
    var t = e.alternate !== null && e.alternate.child === e.child,
      l = 0,
      a = 0;
    if (t)
      for (var s = e.child; s !== null; )
        ((l |= s.lanes | s.childLanes),
          (a |= s.subtreeFlags & 1206910976),
          (a |= s.flags & 1206910976),
          (s.return = e),
          (s = s.sibling));
    else
      for (s = e.child; s !== null; )
        ((l |= s.lanes | s.childLanes),
          (a |= s.subtreeFlags),
          (a |= s.flags),
          (s.return = e),
          (s = s.sibling));
    return ((e.subtreeFlags |= a), (e.childLanes = l), t);
  }
  function bx(e, t, l) {
    var a = t.pendingProps;
    switch ((Tu(t), t.tag)) {
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return (lt(t), null);
      case 1:
        return (lt(t), null);
      case 3:
        return (
          (l = t.stateNode),
          (a = null),
          e !== null && (a = e.memoizedState.cache),
          t.memoizedState.cache !== a && (t.flags |= 2048),
          Bl(dt),
          pt(),
          l.pendingContext &&
            ((l.context = l.pendingContext), (l.pendingContext = null)),
          (e === null || e.child === null) &&
            (ba(t)
              ? Gl(t)
              : e === null ||
                (e.memoizedState.isDehydrated && (t.flags & 256) === 0) ||
                ((t.flags |= 1024), Cu())),
          lt(t),
          null
        );
      case 26:
        var s = t.type,
          i = t.memoizedState;
        return (
          e === null
            ? (Gl(t),
              i !== null ? (lt(t), _h(t, i)) : (lt(t), pr(t, s, null, a, l)))
            : i
              ? i !== e.memoizedState
                ? (Gl(t), lt(t), _h(t, i))
                : (lt(t), (t.flags &= -16777217))
              : ((e = e.memoizedProps),
                e !== a && Gl(t),
                lt(t),
                pr(t, s, e, a, l)),
          null
        );
      case 27:
        if (
          (Dl(t),
          (l = O.current),
          (s = t.type),
          e !== null && t.stateNode != null)
        )
          e.memoizedProps !== a && Gl(t);
        else {
          if (!a) {
            if (t.stateNode === null) throw Error(r(166));
            return (lt(t), (t.subtreeFlags &= -33554433), null);
          }
          ((e = Le.current),
            ba(t) ? sf(t) : ((e = Jm(s, a, l)), (t.stateNode = e), Gl(t)));
        }
        return (lt(t), (t.subtreeFlags &= -33554433), null);
      case 5:
        if ((Dl(t), (s = t.type), e !== null && t.stateNode != null))
          e.memoizedProps !== a && Gl(t);
        else {
          if (!a) {
            if (t.stateNode === null) throw Error(r(166));
            return (lt(t), (t.subtreeFlags &= -33554433), null);
          }
          if (((i = Le.current), ba(t))) sf(t);
          else {
            var u = qs(O.current);
            switch (i) {
              case 1:
                i = u.createElementNS("http://www.w3.org/2000/svg", s);
                break;
              case 2:
                i = u.createElementNS("http://www.w3.org/1998/Math/MathML", s);
                break;
              default:
                switch (s) {
                  case "svg":
                    i = u.createElementNS("http://www.w3.org/2000/svg", s);
                    break;
                  case "math":
                    i = u.createElementNS(
                      "http://www.w3.org/1998/Math/MathML",
                      s,
                    );
                    break;
                  case "script":
                    ((i = u.createElement("div")),
                      (i.innerHTML = "<script><\/script>"),
                      (i = i.removeChild(i.firstChild)));
                    break;
                  case "select":
                    ((i =
                      typeof a.is == "string"
                        ? u.createElement("select", { is: a.is })
                        : u.createElement("select")),
                      a.multiple
                        ? (i.multiple = !0)
                        : a.size && (i.size = a.size));
                    break;
                  default:
                    i =
                      typeof a.is == "string"
                        ? u.createElement(s, { is: a.is })
                        : u.createElement(s);
                }
            }
            ((i[St] = t), (i[Kt] = a));
            e: for (u = t.child; u !== null; ) {
              if (u.tag === 5 || u.tag === 6) i.appendChild(u.stateNode);
              else if (u.tag !== 4 && u.tag !== 27 && u.child !== null) {
                ((u.child.return = u), (u = u.child));
                continue;
              }
              if (u === t) break e;
              for (; u.sibling === null; ) {
                if (u.return === null || u.return === t) break e;
                u = u.return;
              }
              ((u.sibling.return = u.return), (u = u.sibling));
            }
            t.stateNode = i;
            e: switch ((_t(i, s, a), s)) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                a = !!a.autoFocus;
                break e;
              case "img":
                a = !0;
                break e;
              default:
                a = !1;
            }
            a && Gl(t);
          }
        }
        return (
          lt(t),
          (t.subtreeFlags &= -33554433),
          pr(t, t.type, e === null ? null : e.memoizedProps, t.pendingProps, l),
          null
        );
      case 6:
        if (e && t.stateNode != null) e.memoizedProps !== a && Gl(t);
        else {
          if (typeof a != "string" && t.stateNode === null) throw Error(r(166));
          if (((e = O.current), ba(t))) {
            if (
              ((e = t.stateNode),
              (l = t.memoizedProps),
              (a = null),
              (s = yt),
              s !== null)
            )
              switch (s.tag) {
                case 27:
                case 5:
                  a = s.memoizedProps;
              }
            ((e[St] = t),
              (e = !!(
                e.nodeValue === l ||
                (a !== null && a.suppressHydrationWarning === !0) ||
                wm(e.nodeValue, l)
              )),
              e || nn(t, !0));
          } else
            ((e = qs(e).createTextNode(a)), (e[St] = t), (t.stateNode = e));
        }
        return (lt(t), null);
      case 31:
        if (((l = t.memoizedState), e === null || e.memoizedState !== null)) {
          if (((a = ba(t)), l !== null)) {
            if (e === null) {
              if (!a) throw Error(r(318));
              if (
                ((e = t.memoizedState),
                (e = e !== null ? e.dehydrated : null),
                !e)
              )
                throw Error(r(557));
              e[St] = t;
            } else
              (Kn(),
                (t.flags & 128) === 0 && (t.memoizedState = null),
                (t.flags |= 4));
            (lt(t), (e = !1));
          } else
            ((l = Cu()),
              e !== null &&
                e.memoizedState !== null &&
                (e.memoizedState.hydrationErrors = l),
              (e = !0));
          if (!e) return t.flags & 256 ? (Jt(t), t) : (Jt(t), null);
          if ((t.flags & 128) !== 0) throw Error(r(558));
        }
        return (lt(t), null);
      case 13:
        if (
          ((a = t.memoizedState),
          e === null ||
            (e.memoizedState !== null && e.memoizedState.dehydrated !== null))
        ) {
          if (((s = ba(t)), a !== null && a.dehydrated !== null)) {
            if (e === null) {
              if (!s) throw Error(r(318));
              if (
                ((s = t.memoizedState),
                (s = s !== null ? s.dehydrated : null),
                !s)
              )
                throw Error(r(317));
              s[St] = t;
            } else
              (Kn(),
                (t.flags & 128) === 0 && (t.memoizedState = null),
                (t.flags |= 4));
            (lt(t), (s = !1));
          } else
            ((s = Cu()),
              e !== null &&
                e.memoizedState !== null &&
                (e.memoizedState.hydrationErrors = s),
              (s = !0));
          if (!s) return t.flags & 256 ? (Jt(t), t) : (Jt(t), null);
        }
        return (
          Jt(t),
          (t.flags & 128) !== 0
            ? ((t.lanes = l), t)
            : ((l = a !== null),
              (e = e !== null && e.memoizedState !== null),
              l &&
                ((a = t.child),
                (s = null),
                a.alternate !== null &&
                  a.alternate.memoizedState !== null &&
                  a.alternate.memoizedState.cachePool !== null &&
                  (s = a.alternate.memoizedState.cachePool.pool),
                (i = null),
                a.memoizedState !== null &&
                  a.memoizedState.cachePool !== null &&
                  (i = a.memoizedState.cachePool.pool),
                i !== s && (a.flags |= 2048)),
              l !== e && l && (t.child.flags |= 8192),
              ec(t, t.updateQueue),
              lt(t),
              null)
        );
      case 4:
        return (
          pt(),
          e === null && $r(t.stateNode.containerInfo),
          (t.flags |= 67108864),
          lt(t),
          null
        );
      case 10:
        return (Bl(t.type), lt(t), null);
      case 19:
        if ((Bu(t), (a = t.memoizedState), a === null)) return (lt(t), null);
        if (((s = (t.flags & 128) !== 0), (i = a.rendering), i === null))
          if (s) Es(a, !1);
          else {
            if (ut !== 0 || (e !== null && (e.flags & 128) !== 0))
              for (e = t.child; e !== null; ) {
                if (((i = Li(e)), i !== null)) {
                  for (
                    t.flags |= 128,
                      Es(a, !1),
                      e = i.updateQueue,
                      t.updateQueue = e,
                      ec(t, e),
                      t.subtreeFlags = 0,
                      e = l,
                      l = t.child;
                    l !== null;

                  )
                    (ef(l, e), (l = l.sibling));
                  return (
                    js(t, (Ct.current & 1) | 2),
                    qe && Kl(t, a.treeForkCount),
                    t.child
                  );
                }
                e = e.sibling;
              }
            a.tail !== null &&
              Nt() > fc &&
              ((t.flags |= 128), (s = !0), Es(a, !1), (t.lanes = 4194304));
          }
        else {
          if (!s)
            if (((e = Li(i)), e !== null)) {
              if (
                ((t.flags |= 128),
                (s = !0),
                (e = e.updateQueue),
                (t.updateQueue = e),
                ec(t, e),
                Es(a, !0),
                a.tail === null &&
                  a.tailMode !== "collapsed" &&
                  a.tailMode !== "visible" &&
                  !i.alternate &&
                  !qe)
              )
                return (lt(t), null);
            } else
              2 * Nt() - a.renderingStartTime > fc &&
                l !== 536870912 &&
                ((t.flags |= 128), (s = !0), Es(a, !1), (t.lanes = 4194304));
          a.isBackwards
            ? ((i.sibling = t.child), (t.child = i))
            : ((e = a.last),
              e !== null ? (e.sibling = i) : (t.child = i),
              (a.last = i));
        }
        if (a.tail !== null) {
          e = a.tail;
          e: {
            for (l = e; l !== null; ) {
              if (l.alternate !== null) {
                l = !1;
                break e;
              }
              l = l.sibling;
            }
            l = !0;
          }
          return (
            (a.rendering = e),
            (a.tail = e.sibling),
            (a.renderingStartTime = Nt()),
            (e.sibling = null),
            (i = Ct.current),
            (i = s ? (i & 1) | 2 : i & 1),
            a.tailMode === "visible" || a.tailMode === "collapsed" || !l || qe
              ? js(t, i)
              : ((l = i), we(Et, t), we(Ct, l), Dt === null && (Dt = t)),
            qe && Kl(t, a.treeForkCount),
            e
          );
        }
        return (lt(t), null);
      case 22:
      case 23:
        return (
          Jt(t),
          Ku(),
          (a = t.memoizedState !== null),
          e !== null
            ? (e.memoizedState !== null) !== a && (t.flags |= 8192)
            : a && (t.flags |= 8192),
          a
            ? (l & 536870912) !== 0 &&
              (t.flags & 128) === 0 &&
              (lt(t), t.subtreeFlags & 6 && (t.flags |= 8192))
            : lt(t),
          (l = t.updateQueue),
          l !== null && ec(t, l.retryQueue),
          (l = null),
          e !== null &&
            e.memoizedState !== null &&
            e.memoizedState.cachePool !== null &&
            (l = e.memoizedState.cachePool.pool),
          (a = null),
          t.memoizedState !== null &&
            t.memoizedState.cachePool !== null &&
            (a = t.memoizedState.cachePool.pool),
          a !== l && (t.flags |= 2048),
          e !== null && De(Vn),
          null
        );
      case 24:
        return (
          (l = null),
          e !== null && (l = e.memoizedState.cache),
          t.memoizedState.cache !== l && (t.flags |= 2048),
          Bl(dt),
          lt(t),
          null
        );
      case 25:
        return null;
      case 30:
        return ((t.flags |= 33554432), lt(t), null);
    }
    throw Error(r(156, t.tag));
  }
  function Nx(e, t) {
    switch ((Tu(t), t.tag)) {
      case 1:
        return (
          (e = t.flags),
          e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
        );
      case 3:
        return (
          Bl(dt),
          pt(),
          (e = t.flags),
          (e & 65536) !== 0 && (e & 128) === 0
            ? ((t.flags = (e & -65537) | 128), t)
            : null
        );
      case 26:
      case 27:
      case 5:
        return (Dl(t), null);
      case 31:
        if (t.memoizedState !== null) {
          if ((Jt(t), t.alternate === null)) throw Error(r(340));
          Kn();
        }
        return (
          (e = t.flags),
          e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
        );
      case 13:
        if (
          (Jt(t), (e = t.memoizedState), e !== null && e.dehydrated !== null)
        ) {
          if (t.alternate === null) throw Error(r(340));
          Kn();
        }
        return (
          (e = t.flags),
          e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
        );
      case 19:
        return (
          Bu(t),
          (e = t.flags),
          e & 65536
            ? ((t.flags = (e & -65537) | 128),
              (e = t.memoizedState),
              e !== null && ((e.rendering = null), (e.tail = null)),
              (t.flags |= 4),
              t)
            : null
        );
      case 4:
        return (pt(), null);
      case 10:
        return (Bl(t.type), null);
      case 22:
      case 23:
        return (
          Jt(t),
          Ku(),
          e !== null && De(Vn),
          (e = t.flags),
          e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
        );
      case 24:
        return (Bl(dt), null);
      case 25:
        return null;
      default:
        return null;
    }
  }
  function Ah(e, t) {
    switch ((Tu(t), t.tag)) {
      case 3:
        (Bl(dt), pt());
        break;
      case 26:
      case 27:
      case 5:
        Dl(t);
        break;
      case 4:
        pt();
        break;
      case 31:
        t.memoizedState !== null && Jt(t);
        break;
      case 13:
        Jt(t);
        break;
      case 19:
        Bu(t);
        break;
      case 10:
        Bl(t.type);
        break;
      case 22:
      case 23:
        (Jt(t), Ku(), e !== null && De(Vn));
        break;
      case 24:
        Bl(dt);
    }
  }
  function Cs(e, t) {
    try {
      var l = t.updateQueue,
        a = l !== null ? l.lastEffect : null;
      if (a !== null) {
        var s = a.next;
        l = s;
        do {
          if ((l.tag & e) === e) {
            a = void 0;
            var i = l.create,
              u = l.inst;
            ((a = i()), (u.destroy = a));
          }
          l = l.next;
        } while (l !== s);
      }
    } catch (o) {
      $e(t, t.return, o);
    }
  }
  function hn(e, t, l) {
    try {
      var a = t.updateQueue,
        s = a !== null ? a.lastEffect : null;
      if (s !== null) {
        var i = s.next;
        a = i;
        do {
          if ((a.tag & e) === e) {
            var u = a.inst,
              o = u.destroy;
            if (o !== void 0) {
              ((u.destroy = void 0), (s = t));
              var x = l,
                w = o;
              try {
                w();
              } catch (q) {
                $e(s, x, q);
              }
            }
          }
          a = a.next;
        } while (a !== i);
      }
    } catch (q) {
      $e(t, t.return, q);
    }
  }
  function Rh(e) {
    var t = e.updateQueue;
    if (t !== null) {
      var l = e.stateNode;
      try {
        gf(t, l);
      } catch (a) {
        $e(e, e.return, a);
      }
    }
  }
  function Dh(e, t, l) {
    ((l.props = Jn(e.type, e.memoizedProps)), (l.state = e.memoizedState));
    try {
      l.componentWillUnmount();
    } catch (a) {
      $e(e, t, a);
    }
  }
  function Sl(e, t) {
    try {
      var l = e.ref;
      if (l !== null) {
        switch (e.tag) {
          case 26:
          case 27:
          case 5:
            var a = e.stateNode;
            break;
          case 30:
            var s = e.stateNode,
              i = Ml(e.memoizedProps, s);
            ((s.ref === null || s.ref.name !== i) && (s.ref = Km(i)),
              (a = s.ref));
            break;
          case 7:
            if (e.stateNode === null) {
              var u = new Pt(e);
              (y(e.child, !1, fy, u, void 0, void 0), (e.stateNode = u));
            }
            a = e.stateNode;
            break;
          default:
            a = e.stateNode;
        }
        typeof l == "function" ? (e.refCleanup = l(a)) : (l.current = a);
      }
    } catch (o) {
      $e(e, t, o);
    }
  }
  function wt(e, t) {
    var l = e.ref,
      a = e.refCleanup;
    if (l !== null)
      if (typeof a == "function")
        try {
          a();
        } catch (s) {
          $e(e, t, s);
        } finally {
          ((e.refCleanup = null),
            (e = e.alternate),
            e != null && (e.refCleanup = null));
        }
      else if (typeof l == "function")
        try {
          l(null);
        } catch (s) {
          $e(e, t, s);
        }
      else l.current = null;
  }
  function tc(e, t) {
    if (
      (e.tag === 5 || e.tag === 27 || e.tag === 6) &&
      e.alternate === null &&
      t !== null
    )
      for (var l = 0; l < t.length; l++) Gm(e.stateNode, t[l]);
  }
  function Oh(e) {
    for (
      var t = e.return;
      t !== null && (xr(t) && Gm(e.stateNode, t.stateNode), !vr(t));

    )
      t = t.return;
  }
  function ws(e) {
    for (
      var t = e.return;
      t !== null && (xr(t) && hy(e.stateNode, t.stateNode), !vr(t));

    )
      t = t.return;
  }
  function vr(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 27;
  }
  function xr(e) {
    return e && e.tag === 7 && e.stateNode !== null;
  }
  function yr(e) {
    var t = e.type,
      l = e.memoizedProps,
      a = e.stateNode;
    try {
      e: switch (t) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          l.autoFocus && a.focus();
          break e;
        case "img":
          l.src ? (a.src = l.src) : l.srcSet && (a.srcset = l.srcSet);
      }
    } catch (s) {
      $e(e, e.return, s);
    }
  }
  function gr(e, t, l) {
    try {
      var a = e.stateNode;
      (Jx(a, e.type, l, t), (a[Kt] = t));
    } catch (s) {
      $e(e, e.return, s);
    }
  }
  function zh(e) {
    return (
      e.tag === 5 ||
      e.tag === 3 ||
      e.tag === 26 ||
      (e.tag === 27 && jn(e.type)) ||
      e.tag === 4
    );
  }
  function jr(e) {
    e: for (;;) {
      for (; e.sibling === null; ) {
        if (e.return === null || zh(e.return)) return null;
        e = e.return;
      }
      for (
        e.sibling.return = e.return, e = e.sibling;
        e.tag !== 5 && e.tag !== 6 && e.tag !== 18;

      ) {
        if (
          (e.tag === 27 && jn(e.type)) ||
          e.flags & 2 ||
          e.child === null ||
          e.tag === 4
        )
          continue e;
        ((e.child.return = e), (e = e.child));
      }
      if (!(e.flags & 2)) return e.stateNode;
    }
  }
  function br(e, t, l, a) {
    var s = e.tag;
    if (s === 5 || s === 6)
      ((s = e.stateNode),
        t
          ? (l.nodeType === 9
              ? l.body
              : l.nodeName === "HTML"
                ? l.ownerDocument.body
                : l
            ).insertBefore(s, t)
          : ((t =
              l.nodeType === 9
                ? l.body
                : l.nodeName === "HTML"
                  ? l.ownerDocument.body
                  : l),
            t.appendChild(s),
            (l = l._reactRootContainer),
            l != null || t.onclick !== null || (t.onclick = jl)),
        tc(e, a),
        (Qe = !0));
    else if (
      s !== 4 &&
      (s === 27 &&
        (tc(e, a), (a = null), jn(e.type) && ((l = e.stateNode), (t = null))),
      (e = e.child),
      e !== null)
    )
      for (br(e, t, l, a), e = e.sibling; e !== null; )
        (br(e, t, l, a), (e = e.sibling));
  }
  function lc(e, t, l, a) {
    var s = e.tag;
    if (s === 5 || s === 6)
      ((s = e.stateNode),
        t ? l.insertBefore(s, t) : l.appendChild(s),
        tc(e, a),
        (Qe = !0));
    else if (
      s !== 4 &&
      (s === 27 && (tc(e, a), (a = null), jn(e.type) && (l = e.stateNode)),
      (e = e.child),
      e !== null)
    )
      for (lc(e, t, l, a), e = e.sibling; e !== null; )
        (lc(e, t, l, a), (e = e.sibling));
  }
  function Uh(e) {
    var t = e.stateNode,
      l = e.memoizedProps;
    try {
      for (var a = e.type, s = t.attributes; s.length; )
        t.removeAttributeNode(s[0]);
      (_t(t, a, l), (t[St] = e), (t[Kt] = l));
    } catch (i) {
      $e(e, e.return, i);
    }
  }
  var nc = !1,
    It = null;
  function Mh(e) {
    (e.tag === 30 || (e.subtreeFlags & 33554432) !== 0) && (nc = !0);
  }
  var Tl = null;
  function qh() {
    var e = Tl;
    return ((Tl = null), e);
  }
  var Bt = 0;
  function Aa(e, t, l, a, s) {
    return ((Bt = 0), Hh(e.child, t, l, a, s));
  }
  function Hh(e, t, l, a, s) {
    for (var i = !1; e !== null; ) {
      if (e.tag === 5) {
        var u = e.stateNode;
        if (a !== null) {
          var o = ao(u);
          (a.push(o), o.view && (i = !0));
        } else i || (ao(u).view && (i = !0));
        ((nc = !0), qm(u, Bt === 0 ? t : t + "_" + Bt, l), Bt++);
      } else
        (e.tag !== 22 || e.memoizedState === null) &&
          ((e.tag === 30 && s) || (Hh(e.child, t, l, a, s) && (i = !0)));
      e = e.sibling;
    }
    return i;
  }
  function El(e, t) {
    for (; e !== null; )
      (e.tag === 5
        ? Hm(e.stateNode, e.memoizedProps)
        : (e.tag !== 22 || e.memoizedState === null) &&
          ((e.tag === 30 && t) || El(e.child, t)),
        (e = e.sibling));
  }
  function ac(e) {
    if ((e.subtreeFlags & 18874368) !== 0)
      for (e = e.child; e !== null; ) {
        if (
          (e.tag !== 22 || e.memoizedState === null) &&
          (ac(e),
          e.tag === 30 && (e.flags & 18874368) !== 0 && e.stateNode.paired)
        ) {
          var t = e.memoizedProps;
          if (t.name == null || t.name === "auto") throw Error(r(544));
          var l = t.name;
          ((t = ql(t.default, t.share)),
            t !== "none" && (Aa(e, l, t, null, !1) || El(e.child, !1)));
        }
        e = e.sibling;
      }
  }
  function Nr(e, t) {
    if (e.tag === 30) {
      var l = e.stateNode,
        a = e.memoizedProps,
        s = Ml(a, l),
        i = ql(a.default, l.paired ? a.share : a.enter);
      i !== "none"
        ? Aa(e, s, i, null, !1)
          ? (ac(e), l.paired || t || Ha(e, a.onEnter))
          : El(e.child, !1)
        : ac(e);
    } else if ((e.subtreeFlags & 33554432) !== 0)
      for (e = e.child; e !== null; ) (Nr(e, t), (e = e.sibling));
    else ac(e);
  }
  function Sr(e) {
    if (It !== null && It.size !== 0) {
      var t = It;
      if ((e.subtreeFlags & 18874368) !== 0)
        for (e = e.child; e !== null; ) {
          if (e.tag !== 22 || e.memoizedState === null) {
            if (e.tag === 30 && (e.flags & 18874368) !== 0) {
              var l = e.memoizedProps,
                a = l.name;
              if (a != null && a !== "auto") {
                var s = t.get(a);
                if (s !== void 0) {
                  var i = ql(l.default, l.share);
                  if (
                    (i !== "none" &&
                      (Aa(e, a, i, null, !1)
                        ? ((i = e.stateNode),
                          (s.paired = i),
                          (i.paired = s),
                          Ha(e, l.onShare))
                        : El(e.child, !1)),
                    t.delete(a),
                    t.size === 0)
                  )
                    break;
                }
              }
            }
            Sr(e);
          }
          e = e.sibling;
        }
    }
  }
  function Tr(e) {
    if (e.tag === 30) {
      var t = e.memoizedProps,
        l = Ml(t, e.stateNode),
        a = It !== null ? It.get(l) : void 0,
        s = ql(t.default, a !== void 0 ? t.share : t.exit);
      (s !== "none" &&
        (Aa(e, l, s, null, !1)
          ? a !== void 0
            ? ((s = e.stateNode),
              (a.paired = s),
              (s.paired = a),
              It.delete(l),
              Ha(e, t.onShare))
            : Ha(e, t.onExit)
          : El(e.child, !1)),
        It !== null && Sr(e));
    } else if ((e.subtreeFlags & 33554432) !== 0)
      for (e = e.child; e !== null; ) (Tr(e), (e = e.sibling));
    else It !== null && Sr(e);
  }
  function Kh(e) {
    for (e = e.child; e !== null; ) {
      if (e.tag === 30) {
        var t = e.memoizedProps,
          l = Ml(t, e.stateNode);
        ((t = ql(t.default, t.update)),
          (e.flags &= -5),
          t !== "none" && Aa(e, l, t, (e.memoizedState = []), !1));
      } else (e.subtreeFlags & 33554432) !== 0 && Kh(e);
      e = e.sibling;
    }
  }
  function Er(e) {
    if ((e.subtreeFlags & 18874368) !== 0)
      for (e = e.child; e !== null; ) {
        if (e.tag !== 22 || e.memoizedState === null) {
          if (e.tag === 30 && (e.flags & 18874368) !== 0) {
            var t = e.stateNode;
            t.paired !== null && ((t.paired = null), El(e.child, !1));
          }
          Er(e);
        }
        e = e.sibling;
      }
  }
  function sc(e) {
    if (e.tag === 30) ((e.stateNode.paired = null), El(e.child, !1), Er(e));
    else if ((e.subtreeFlags & 33554432) !== 0)
      for (e = e.child; e !== null; ) (sc(e), (e = e.sibling));
    else Er(e);
  }
  function Lh(e) {
    for (e = e.child; e !== null; )
      (e.tag === 30
        ? El(e.child, !1)
        : (e.subtreeFlags & 33554432) !== 0 && Lh(e),
        (e = e.sibling));
  }
  function Cr(e, t, l, a, s, i, u) {
    for (var o = !1; t !== null; ) {
      if (t.tag === 5) {
        var x = t.stateNode;
        if (i !== null && Bt < i.length) {
          var w = i[Bt],
            q = ao(x);
          (w.view || q.view) && (o = !0);
          var X;
          if ((X = (e.flags & 4) === 0))
            if (q.clip) X = !0;
            else {
              X = w.rect;
              var T = q.rect;
              X =
                X.y !== T.y ||
                X.x !== T.x ||
                X.height !== T.height ||
                X.width !== T.width;
            }
          (X && (e.flags |= 4),
            q.abs
              ? (q = !w.abs)
              : ((w = w.rect),
                (q = q.rect),
                (q = w.height !== q.height || w.width !== q.width)),
            q && (e.flags |= 32));
        } else e.flags |= 32;
        ((e.flags & 4) !== 0 && qm(x, Bt === 0 ? l : l + "_" + Bt, s),
          (o && (e.flags & 4) !== 0) ||
            (Tl === null && (Tl = []),
            Tl.push(x, Bt === 0 ? a : a + "_" + Bt, t.memoizedProps)),
          Bt++);
      } else
        (t.tag !== 22 || t.memoizedState === null) &&
          (t.tag === 30 && u
            ? (e.flags |= t.flags & 32)
            : Cr(e, t.child, l, a, s, i, u) && (o = !0));
      t = t.sibling;
    }
    return o;
  }
  function Bh(e, t) {
    for (e = e.child; e !== null; ) {
      if (e.tag === 30) {
        var l = e.memoizedProps,
          a = e.stateNode,
          s = Ml(l, a),
          i = ql(l.default, l.update),
          u;
        ((u = e.memoizedState), (e.memoizedState = null), (a = e));
        var o = e.child;
        ((Bt = 0),
          (s = Cr(a, o, s, s, i, u, !1)),
          (e.flags & 4) !== 0 && s && Ha(e, l.onUpdate));
      } else (e.subtreeFlags & 33554432) !== 0 && Bh(e);
      e = e.sibling;
    }
  }
  var gt = !1,
    Je = !1,
    Cl = !1,
    wr = !1,
    kh = typeof WeakSet == "function" ? WeakSet : Set,
    jt = null,
    wl = !1,
    _s = !1,
    ic = !1,
    _r = !1;
  function Sx(e, t, l) {
    if (((e = e.containerInfo), (Pr = Za), (e = Gd(e)), mu(e))) {
      if ("selectionStart" in e)
        var a = { start: e.selectionStart, end: e.selectionEnd };
      else
        e: {
          a = ((a = e.ownerDocument) && a.defaultView) || window;
          var s = a.getSelection && a.getSelection();
          if (s && s.rangeCount !== 0) {
            a = s.anchorNode;
            var i = s.anchorOffset,
              u = s.focusNode;
            s = s.focusOffset;
            try {
              (a.nodeType, u.nodeType);
            } catch {
              a = null;
              break e;
            }
            var o = 0,
              x = -1,
              w = -1,
              q = 0,
              X = 0,
              T = e,
              z = null;
            t: for (;;) {
              for (
                var me;
                T !== a || (i !== 0 && T.nodeType !== 3) || (x = o + i),
                  T !== u || (s !== 0 && T.nodeType !== 3) || (w = o + s),
                  T.nodeType === 3 && (o += T.nodeValue.length),
                  (me = T.firstChild) !== null;

              )
                ((z = T), (T = me));
              for (;;) {
                if (T === e) break t;
                if (
                  (z === a && ++q === i && (x = o),
                  z === u && ++X === s && (w = o),
                  (me = T.nextSibling) !== null)
                )
                  break;
                ((T = z), (z = T.parentNode));
              }
              T = me;
            }
            a = x === -1 || w === -1 ? null : { start: x, end: w };
          } else a = null;
        }
      a = a || { start: 0, end: 0 };
    } else a = null;
    for (
      eo = { focusedElem: e, selectionRange: a },
        Za = !1,
        l = (l & 335544064) === l,
        jt = t,
        t = l ? 9270 : 1024;
      jt !== null;

    ) {
      if (((e = jt), l && ((a = e.deletions), a !== null)))
        for (i = 0; i < a.length; i++) l && Tr(a[i]);
      if (e.alternate === null && (e.flags & 2) !== 0) (l && Mh(e), cc(l));
      else {
        if (e.tag === 22) {
          if (((a = e.alternate), e.memoizedState !== null)) {
            (a !== null && a.memoizedState === null && l && Tr(a), cc(l));
            continue;
          } else if (a !== null && a.memoizedState !== null) {
            (l && Mh(e), cc(l));
            continue;
          }
        }
        ((a = e.child),
          (e.subtreeFlags & t) !== 0 && a !== null
            ? ((a.return = e), (jt = a))
            : (l && Kh(e), cc(l)));
      }
    }
    It = null;
  }
  function cc(e) {
    for (; jt !== null; ) {
      var t = jt,
        l = e,
        a = t.alternate,
        s = t.flags;
      switch (t.tag) {
        case 0:
        case 11:
        case 15:
          break;
        case 1:
          if ((s & 1024) !== 0 && a !== null) {
            ((l = void 0), (s = a.memoizedProps), (a = a.memoizedState));
            var i = t.stateNode;
            try {
              var u = Jn(t.type, s);
              ((l = i.getSnapshotBeforeUpdate(u, a)),
                (i.__reactInternalSnapshotBeforeUpdate = l));
            } catch (o) {
              $e(t, t.return, o);
            }
          }
          break;
        case 3:
          if ((s & 1024) !== 0) {
            if (((a = t.stateNode.containerInfo), (l = a.nodeType), l === 9))
              co(a);
            else if (l === 1)
              switch (a.nodeName) {
                case "HEAD":
                case "HTML":
                case "BODY":
                  co(a);
                  break;
                default:
                  a.textContent = "";
              }
          }
          break;
        case 5:
        case 26:
        case 27:
        case 6:
        case 4:
        case 17:
          break;
        case 30:
          l &&
            a !== null &&
            ((l = Ml(a.memoizedProps, a.stateNode)),
            (s = t.memoizedProps),
            (s = ql(s.default, s.update)),
            s !== "none" && Aa(a, l, s, (a.memoizedState = []), !0));
          break;
        default:
          if ((s & 1024) !== 0) throw Error(r(163));
      }
      if (((a = t.sibling), a !== null)) {
        ((a.return = t.return), (jt = a));
        break;
      }
      jt = t.return;
    }
  }
  function Yh(e, t, l) {
    var a = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        (_l(e, l), a & 4 && Cs(5, l));
        break;
      case 1:
        if ((_l(e, l), a & 4))
          if (((e = l.stateNode), t === null))
            try {
              e.componentDidMount();
            } catch (u) {
              $e(l, l.return, u);
            }
          else {
            var s = Jn(l.type, t.memoizedProps);
            t = t.memoizedState;
            try {
              e.componentDidUpdate(s, t, e.__reactInternalSnapshotBeforeUpdate);
            } catch (u) {
              $e(l, l.return, u);
            }
          }
        (a & 64 && Rh(l), a & 512 && Sl(l, l.return));
        break;
      case 3:
        if ((_l(e, l), a & 64 && ((e = l.updateQueue), e !== null))) {
          if (((t = null), l.child !== null))
            switch (l.child.tag) {
              case 27:
              case 5:
                t = l.child.stateNode;
                break;
              case 1:
                t = l.child.stateNode;
            }
          try {
            gf(e, t);
          } catch (u) {
            $e(l, l.return, u);
          }
        }
        break;
      case 27:
        t === null && a & 4 && Uh(l);
      case 26:
      case 5:
        (_l(e, l), t === null && a & 4 && yr(l), a & 512 && Sl(l, l.return));
        break;
      case 12:
        _l(e, l);
        break;
      case 31:
        (_l(e, l), a & 4 && Xh(e, l));
        break;
      case 13:
        (_l(e, l),
          a & 4 && Zh(e, l),
          a & 64 &&
            ((e = l.memoizedState),
            e !== null &&
              ((e = e.dehydrated),
              e !== null && ((l = Mx.bind(null, l)), vy(e, l)))));
        break;
      case 22:
        if (((a = l.memoizedState !== null || gt), !a)) {
          var i = (t !== null && t.memoizedState !== null) || Je;
          ((t = gt),
            (s = Je),
            (gt = a),
            (Je = i) && !s
              ? ((a = 2),
                (l.subtreeFlags & 8772) !== 0 && (a |= 1),
                vl(e, l, a))
              : _l(e, l),
            (gt = t),
            (Je = s));
        }
        break;
      case 30:
        (_l(e, l), a & 512 && Sl(l, l.return));
        break;
      case 7:
        a & 512 && Sl(l, l.return);
      default:
        _l(e, l);
    }
  }
  function Ar(e, t) {
    for (e = e.child; e !== null; ) (Vh(e, t), (e = e.sibling));
  }
  function Vh(e, t) {
    switch (e.tag) {
      case 5:
      case 26:
        try {
          var l = e.stateNode;
          if (t) {
            var a = l.style;
            typeof a.setProperty == "function"
              ? a.setProperty("display", "none", "important")
              : (a.display = "none");
          } else {
            var s = e.stateNode,
              i = e.memoizedProps.style,
              u = i != null && i.hasOwnProperty("display") ? i.display : null;
            s.style.display =
              u == null || typeof u == "boolean" ? "" : ("" + u).trim();
          }
        } catch (x) {
          $e(e, e.return, x);
        }
        Rr(e, t);
        break;
      case 6:
        try {
          ((e.stateNode.nodeValue = t ? "" : e.memoizedProps), (Qe = !0));
        } catch (x) {
          $e(e, e.return, x);
        }
        break;
      case 18:
        try {
          var o = e.stateNode;
          t ? Mm(o, !0) : Mm(e.stateNode, !1);
        } catch (x) {
          $e(e, e.return, x);
        }
        break;
      case 22:
      case 23:
        e.memoizedState === null && Ar(e, t);
        break;
      default:
        Ar(e, t);
    }
  }
  function Rr(e, t) {
    if (e.subtreeFlags & 67108864)
      for (e = e.child; e !== null; ) {
        e: {
          var l = e,
            a = t;
          switch (l.tag) {
            case 4:
              Vh(l, a);
              break e;
            case 22:
              l.memoizedState === null && Rr(l, a);
              break e;
            default:
              Rr(l, a);
          }
        }
        e = e.sibling;
      }
  }
  function Gh(e) {
    var t = e.alternate;
    (t !== null && ((e.alternate = null), Gh(t)),
      (e.child = null),
      (e.deletions = null),
      (e.sibling = null),
      e.tag === 5 && ((t = e.stateNode), t !== null && fi(t)),
      (e.stateNode = null),
      (e.return = null),
      (e.dependencies = null),
      (e.memoizedProps = null),
      (e.memoizedState = null),
      (e.pendingProps = null),
      (e.stateNode = null),
      (e.updateQueue = null));
  }
  var nt = null,
    kt = !1;
  function ml(e, t, l) {
    for (l = l.child; l !== null; ) (Qh(e, t, l), (l = l.sibling));
  }
  function Qh(e, t, l) {
    if ($ && typeof $.onCommitFiberUnmount == "function")
      try {
        $.onCommitFiberUnmount(Wl, l);
      } catch {}
    switch (l.tag) {
      case 26:
        (Je || wt(l, t),
          ml(e, t, l),
          l.memoizedState
            ? l.memoizedState.count--
            : l.stateNode &&
              !Je &&
              ((l = l.stateNode), l.parentNode.removeChild(l)));
        break;
      case 27:
        (Je || wt(l, t), ws(l));
        var a = nt,
          s = kt;
        (jn(l.type) && ((nt = l.stateNode), (kt = !1)),
          ml(e, t, l),
          Im(l.stateNode, l.type, l.memoizedProps),
          (nt = a),
          (kt = s));
        break;
      case 5:
        (Je || wt(l, t), ws(l));
      case 6:
        if (
          (l.tag === 6 && ws(l),
          (a = nt),
          (s = kt),
          (nt = null),
          ml(e, t, l),
          (nt = a),
          (kt = s),
          nt !== null)
        )
          if (kt)
            try {
              ((nt.nodeType === 9
                ? nt.body
                : nt.nodeName === "HTML"
                  ? nt.ownerDocument.body
                  : nt
              ).removeChild(l.stateNode),
                (Qe = !0));
            } catch (i) {
              $e(l, t, i);
            }
          else
            try {
              (nt.removeChild(l.stateNode), (Qe = !0));
            } catch (i) {
              $e(l, t, i);
            }
        break;
      case 18:
        nt !== null &&
          (kt
            ? ((e = nt),
              Um(
                e.nodeType === 9
                  ? e.body
                  : e.nodeName === "HTML"
                    ? e.ownerDocument.body
                    : e,
                l.stateNode,
              ),
              Ja(e))
            : Um(nt, l.stateNode));
        break;
      case 4:
        ((a = nt),
          (s = kt),
          (nt = l.stateNode.containerInfo),
          (kt = !0),
          ml(e, t, l),
          (nt = a),
          (kt = s));
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        (hn(2, l, t), Je || hn(4, l, t), ml(e, t, l));
        break;
      case 1:
        (Je ||
          (wt(l, t),
          (a = l.stateNode),
          typeof a.componentWillUnmount == "function" && Dh(l, t, a)),
          ml(e, t, l));
        break;
      case 21:
        ml(e, t, l);
        break;
      case 22:
        ((Je = (a = Je) || l.memoizedState !== null), ml(e, t, l), (Je = a));
        break;
      case 30:
        (wt(l, t), ml(e, t, l));
        break;
      case 7:
        (Je || wt(l, t), ml(e, t, l));
        break;
      default:
        ml(e, t, l);
    }
  }
  function Xh(e, t) {
    if (
      t.memoizedState === null &&
      ((e = t.alternate), e !== null && ((e = e.memoizedState), e !== null))
    ) {
      e = e.dehydrated;
      try {
        Ja(e);
      } catch (l) {
        $e(t, t.return, l);
      }
    }
  }
  function Zh(e, t) {
    if (
      t.memoizedState === null &&
      ((e = t.alternate),
      e !== null &&
        ((e = e.memoizedState), e !== null && ((e = e.dehydrated), e !== null)))
    )
      try {
        Ja(e);
      } catch (l) {
        $e(t, t.return, l);
      }
  }
  function Tx(e) {
    switch (e.tag) {
      case 31:
      case 13:
      case 19:
        var t = e.stateNode;
        return (t === null && (t = e.stateNode = new kh()), t);
      case 22:
        return (
          (e = e.stateNode),
          (t = e._retryCache),
          t === null && (t = e._retryCache = new kh()),
          t
        );
      default:
        throw Error(r(435, e.tag));
    }
  }
  function uc(e, t) {
    var l = Tx(e);
    t.forEach(function (a) {
      if (!l.has(a)) {
        l.add(a);
        var s = qx.bind(null, e, a);
        a.then(s, s);
      }
    });
  }
  function Mt(e, t, l) {
    var a = t.deletions;
    if (a !== null)
      for (var s = 0; s < a.length; s++) {
        var i = a[s],
          u = e,
          o = t,
          x = o;
        e: for (; x !== null; ) {
          switch (x.tag) {
            case 27:
              if (jn(x.type)) {
                ((nt = x.stateNode), (kt = !1));
                break e;
              }
              break;
            case 5:
              ((nt = x.stateNode), (kt = !1));
              break e;
            case 3:
            case 4:
              ((nt = x.stateNode.containerInfo), (kt = !0));
              break e;
          }
          x = x.return;
        }
        if (nt === null) throw Error(r(160));
        (Qh(u, o, i),
          (nt = null),
          (kt = !1),
          (u = i.alternate),
          u !== null && (u.return = null),
          (i.return = null));
      }
    if (t.subtreeFlags & 13886)
      for (t = t.child; t !== null; ) (Jh(t, e, l), (t = t.sibling));
  }
  var pl = null;
  function Jh(e, t, l) {
    var a = e.alternate,
      s = e.flags;
    switch (e.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        if (
          s & 4 &&
          ((a = e.updateQueue), (a = a !== null ? a.events : null), a !== null)
        )
          for (var i = 0; i < a.length; i++) {
            var u = a[i];
            u.ref.impl = u.nextImpl;
          }
        (Mt(t, e, l),
          qt(e),
          s & 4 && (hn(3, e, e.return), Cs(3, e), hn(5, e, e.return)));
        break;
      case 1:
        (Mt(t, e, l),
          qt(e),
          s & 512 && (Je || a === null || wt(a, a.return)),
          s & 64 &&
            gt &&
            ((e = e.updateQueue),
            e !== null &&
              ((t = e.callbacks),
              t !== null &&
                ((l = e.shared.hiddenCallbacks),
                (e.shared.hiddenCallbacks = l === null ? t : l.concat(t))))));
        break;
      case 26:
        if (
          ((i = pl),
          Mt(t, e, l),
          qt(e),
          s & 512 && (Je || a === null || wt(a, a.return)),
          s & 4)
        )
          if (
            ((s = a !== null ? a.memoizedState : null),
            (l = e.memoizedState),
            a === null)
          )
            if (l === null)
              if (e.stateNode === null)
                if (gt)
                  e.stateNode = Dm(e.type, e.memoizedProps, t.containerInfo, e);
                else {
                  e: {
                    ((t = e.type),
                      (l = e.memoizedProps),
                      (s = i.ownerDocument || i));
                    t: switch (t) {
                      case "title":
                        ((a = s.getElementsByTagName("title")[0]),
                          (!a ||
                            a[es] ||
                            a[St] ||
                            a.namespaceURI === "http://www.w3.org/2000/svg" ||
                            a.hasAttribute("itemprop")) &&
                            ((a = s.createElement(t)),
                            s.head.insertBefore(
                              a,
                              s.querySelector("head > title"),
                            )),
                          _t(a, t, l),
                          (a[St] = e),
                          xt(a),
                          (t = a));
                        break e;
                      case "link":
                        if (
                          (i = tp("link", "href", s).get(t + (l.href || "")))
                        ) {
                          for (u = 0; u < i.length; u++)
                            if (
                              ((a = i[u]),
                              a.getAttribute("href") ===
                                (l.href == null || l.href === ""
                                  ? null
                                  : l.href) &&
                                a.getAttribute("rel") ===
                                  (l.rel == null ? null : l.rel) &&
                                a.getAttribute("title") ===
                                  (l.title == null ? null : l.title) &&
                                a.getAttribute("crossorigin") ===
                                  (l.crossOrigin == null
                                    ? null
                                    : l.crossOrigin))
                            ) {
                              i.splice(u, 1);
                              break t;
                            }
                        }
                        ((a = s.createElement(t)),
                          _t(a, t, l),
                          s.head.appendChild(a));
                        break;
                      case "meta":
                        if (
                          (i = tp("meta", "content", s).get(
                            t + (l.content || ""),
                          ))
                        ) {
                          for (u = 0; u < i.length; u++)
                            if (
                              ((a = i[u]),
                              a.getAttribute("content") ===
                                (l.content == null ? null : "" + l.content) &&
                                a.getAttribute("name") ===
                                  (l.name == null ? null : l.name) &&
                                a.getAttribute("property") ===
                                  (l.property == null ? null : l.property) &&
                                a.getAttribute("http-equiv") ===
                                  (l.httpEquiv == null ? null : l.httpEquiv) &&
                                a.getAttribute("charset") ===
                                  (l.charSet == null ? null : l.charSet))
                            ) {
                              i.splice(u, 1);
                              break t;
                            }
                        }
                        ((a = s.createElement(t)),
                          _t(a, t, l),
                          s.head.appendChild(a));
                        break;
                      default:
                        throw Error(r(468, t));
                    }
                    ((a[St] = e), xt(a), (t = a));
                  }
                  e.stateNode = t;
                }
              else gt || po(i, e.type, e.stateNode);
            else e.stateNode = ep(i, l, e.memoizedProps);
          else
            s !== l
              ? (s === null
                  ? ((t = a.stateNode),
                    t === null || Je || t.parentNode.removeChild(t))
                  : s.count--,
                l === null
                  ? gt || po(i, e.type, e.stateNode)
                  : ep(i, l, e.memoizedProps))
              : l === null &&
                e.stateNode !== null &&
                gr(e, e.memoizedProps, a.memoizedProps);
        break;
      case 27:
        (Mt(t, e, l),
          qt(e),
          s & 512 && (Je || a === null || wt(a, a.return)),
          a !== null && s & 4 && gr(e, e.memoizedProps, a.memoizedProps));
        break;
      case 5:
        if (
          ((i = Cl),
          (Cl = !1),
          Mt(t, e, l),
          (Cl = i),
          qt(e),
          s & 512 && (Je || a === null || wt(a, a.return)),
          e.flags & 32)
        ) {
          t = e.stateNode;
          try {
            (da(t, ""), (Qe = !0));
          } catch (q) {
            $e(e, e.return, q);
          }
        }
        (s & 4 &&
          e.stateNode != null &&
          ((t = e.memoizedProps), gr(e, t, a !== null ? a.memoizedProps : t)),
          s & 1024 && (wr = !0));
        break;
      case 6:
        if ((Mt(t, e, l), qt(e), s & 4)) {
          if (e.stateNode === null) throw Error(r(162));
          ((t = e.memoizedProps), (l = e.stateNode));
          try {
            ((l.nodeValue = t), (Qe = !0));
          } catch (q) {
            $e(e, e.return, q);
          }
        }
        break;
      case 3:
        if (
          ((Qe = !1),
          (Sc = null),
          (i = pl),
          (pl = Hs(t.containerInfo)),
          Mt(t, e, l),
          (pl = i),
          qt(e),
          s & 4 && a !== null && a.memoizedState.isDehydrated)
        )
          try {
            Ja(t.containerInfo);
          } catch (q) {
            $e(e, e.return, q);
          }
        (wr && ((wr = !1), Ih(e)), (Qe = !1));
        break;
      case 4:
        ((s = Cl),
          (Cl = gt),
          (a = md()),
          (i = pl),
          (pl = Hs(e.stateNode.containerInfo)),
          Mt(t, e, l),
          qt(e),
          (pl = i),
          Qe && _s && (ic = !0),
          (Qe = a),
          (Cl = s));
        break;
      case 12:
        (Mt(t, e, l), qt(e));
        break;
      case 31:
        (Mt(t, e, l),
          qt(e),
          s & 4 &&
            ((t = e.updateQueue),
            t !== null && ((e.updateQueue = null), uc(e, t))));
        break;
      case 13:
        (Mt(t, e, l),
          qt(e),
          e.child.flags & 8192 &&
            (e.memoizedState !== null) !=
              (a !== null && a.memoizedState !== null) &&
            (dc = Nt()),
          s & 4 &&
            ((t = e.updateQueue),
            t !== null && ((e.updateQueue = null), uc(e, t))));
        break;
      case 22:
        ((i = e.memoizedState !== null),
          (u = a !== null && a.memoizedState !== null));
        var o = gt,
          x = Je,
          w = Cl;
        ((gt = o || i),
          (Cl = w || i),
          (Je = x || u),
          Mt(t, e, l),
          (Je = x),
          (Cl = w),
          (gt = o),
          qt(e),
          s & 8192 &&
            ((t = e.stateNode),
            (t._visibility = i ? t._visibility & -2 : t._visibility | 1),
            !i ||
              a === null ||
              u ||
              gt ||
              Je ||
              ((t = u || Je),
              (l = gt),
              (a = Je),
              (gt = i || gt),
              (Je = t),
              mn(e, 2),
              (gt = l),
              (Je = a)),
            (!i && Cl) || Ar(e, i)),
          s & 4 &&
            ((t = e.updateQueue),
            t !== null &&
              ((l = t.retryQueue),
              l !== null && ((t.retryQueue = null), uc(e, l)))));
        break;
      case 19:
        (Mt(t, e, l),
          qt(e),
          s & 4 &&
            ((t = e.updateQueue),
            t !== null && ((e.updateQueue = null), uc(e, t))));
        break;
      case 30:
        (s & 512 && (Je || a === null || wt(a, a.return)),
          (s = md()),
          (i = _s),
          (u = (l & 335544064) === l),
          (o = e.memoizedProps),
          (_s = u && ql(o.default, o.update) !== "none"),
          Mt(t, e, l),
          qt(e),
          u && a !== null && Qe && (e.flags |= 4),
          (_s = i),
          (Qe = s));
        break;
      case 21:
        break;
      case 7:
        (s & 512 && (Je || a === null || wt(a, a.return)),
          a && a.stateNode !== null && (a.stateNode._fragmentFiber = e));
      default:
        (Mt(t, e, l), qt(e));
    }
  }
  function qt(e) {
    var t = e.flags;
    if (t & 2) {
      try {
        for (var l, a = e.return; a !== null; ) {
          if (zh(a)) {
            l = a;
            break;
          }
          a = a.return;
        }
        a = null;
        for (var s = e.return; s !== null; ) {
          if (xr(s)) {
            var i = s.stateNode;
            a === null ? (a = [i]) : a.push(i);
          }
          if (vr(s)) break;
          s = s.return;
        }
        var u = a;
        if (l == null) throw Error(r(160));
        switch (l.tag) {
          case 27:
            var o = l.stateNode,
              x = jr(e);
            lc(e, x, o, u);
            break;
          case 5:
            var w = l.stateNode;
            l.flags & 32 && (da(w, ""), (l.flags &= -33));
            var q = jr(e);
            lc(e, q, w, u);
            break;
          case 3:
          case 4:
            var X = l.stateNode.containerInfo,
              T = jr(e);
            br(e, T, X, u);
            break;
          default:
            throw Error(r(161));
        }
      } catch (z) {
        $e(e, e.return, z);
      }
      e.flags &= -3;
    }
    t & 4096 && (e.flags &= -4097);
  }
  function Ih(e) {
    if (e.subtreeFlags & 1024)
      for (e = e.child; e !== null; ) {
        var t = e;
        (Ih(t),
          t.tag === 5 &&
            t.flags & 1024 &&
            ((t = t.stateNode), (Za = !0), t.reset(), (Za = !1)),
          (e = e.sibling));
      }
  }
  function Ra(e, t) {
    if (t.subtreeFlags & 9270)
      for (t = t.child; t !== null; ) ($h(t, e), (t = t.sibling));
    else Bh(t);
  }
  function $h(e, t) {
    var l = e.alternate;
    if (l === null) Nr(e, !1);
    else
      switch (e.tag) {
        case 3:
          if (((_r = wl = !1), qh(), Ra(t, e), !wl && !ic)) {
            if (((e = Tl), e !== null))
              for (var a = 0; a < e.length; a += 3) {
                l = e[a];
                var s = e[a + 1];
                (Hm(l, e[a + 2]),
                  (l = l.ownerDocument.documentElement),
                  l !== null &&
                    l.animate(
                      { opacity: [0, 0], pointerEvents: ["none", "none"] },
                      {
                        duration: 0,
                        fill: "forwards",
                        pseudoElement: "::view-transition-group(" + s + ")",
                      },
                    ));
              }
            ((e = t.containerInfo),
              (e =
                e.nodeType === 9
                  ? e.documentElement
                  : e.ownerDocument.documentElement),
              e !== null &&
                e.style.viewTransitionName === "" &&
                ((e.style.viewTransitionName = "none"),
                e.animate(
                  { opacity: [0, 0], pointerEvents: ["none", "none"] },
                  {
                    duration: 0,
                    fill: "forwards",
                    pseudoElement: "::view-transition-group(root)",
                  },
                ),
                e.animate(
                  { width: [0, 0], height: [0, 0] },
                  {
                    duration: 0,
                    fill: "forwards",
                    pseudoElement: "::view-transition",
                  },
                )),
              (_r = !0));
          }
          Tl = null;
          break;
        case 5:
          Ra(t, e);
          break;
        case 4:
          ((a = wl), (wl = !1), Ra(t, e), wl && (ic = !0), (wl = a));
          break;
        case 22:
          e.memoizedState === null &&
            (l.memoizedState !== null ? Nr(e, !1) : Ra(t, e));
          break;
        case 30:
          ((a = wl), (s = qh()), (wl = !1), Ra(t, e), wl && (e.flags |= 4));
          var i = e.memoizedProps,
            u = e.stateNode;
          ((t = Ml(i, u)), (u = Ml(l.memoizedProps, u)));
          var o = ql(i.default, i.update);
          (o === "none"
            ? (t = !1)
            : ((i = l.memoizedState),
              (l.memoizedState = null),
              (l = e.child),
              (Bt = 0),
              (t = Cr(e, l, t, u, o, i, !0)),
              Bt !== (i === null ? 0 : i.length) && (e.flags |= 32)),
            (e.flags & 4) !== 0 && t
              ? (Ha(e, e.memoizedProps.onUpdate), (Tl = s))
              : s !== null && (s.push.apply(s, Tl), (Tl = s)),
            (wl = (e.flags & 32) !== 0 ? !0 : a));
          break;
        default:
          Ra(t, e);
      }
  }
  function _l(e, t) {
    if (t.subtreeFlags & 8772)
      for (t = t.child; t !== null; ) (Yh(e, t.alternate, t), (t = t.sibling));
  }
  function mn(e, t) {
    for (e = e.child; e !== null; ) {
      var l = e,
        a = t;
      switch (l.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          (hn(4, l, l.return), mn(l, a));
          break;
        case 1:
          wt(l, l.return);
          var s = l.stateNode;
          (typeof s.componentWillUnmount == "function" && Dh(l, l.return, s),
            mn(l, a));
          break;
        case 27:
          (a & 2) !== 0 && Im(l.stateNode, l.type, l.memoizedProps);
        case 5:
          (wt(l, l.return), (l.tag !== 5 && l.tag !== 27) || ws(l), mn(l, a));
          break;
        case 6:
          ws(l);
          break;
        case 26:
          (wt(l, l.return),
            (s = l.stateNode),
            l.memoizedState !== null ||
              s === null ||
              Je ||
              s.parentNode.removeChild(s),
            mn(l, a));
          break;
        case 22:
          l.memoizedState === null && mn(l, a);
          break;
        case 30:
          (wt(l, l.return), mn(l, a));
          break;
        case 7:
          wt(l, l.return);
        default:
          mn(l, a);
      }
      e = e.sibling;
    }
  }
  function vl(e, t, l) {
    for (
      l = (t.subtreeFlags & 8772) !== 0 ? l : l & -2, t = t.child;
      t !== null;

    ) {
      var a = t.alternate,
        s = e,
        i = t,
        u = i.flags,
        o = (l & 1) !== 0;
      switch (i.tag) {
        case 0:
        case 11:
        case 15:
          (vl(s, i, l), Cs(4, i));
          break;
        case 1:
          if (
            (vl(s, i, l),
            (a = i),
            (s = a.stateNode),
            typeof s.componentDidMount == "function")
          )
            try {
              s.componentDidMount();
            } catch (q) {
              $e(a, a.return, q);
            }
          if (((a = i), (s = a.updateQueue), s !== null)) {
            var x = a.stateNode;
            try {
              var w = s.shared.hiddenCallbacks;
              if (w !== null)
                for (s.shared.hiddenCallbacks = null, s = 0; s < w.length; s++)
                  yf(w[s], x);
            } catch (q) {
              $e(a, a.return, q);
            }
          }
          (o && u & 64 && Rh(i), Sl(i, i.return));
          break;
        case 27:
          (l & 2) !== 0 && Uh(i);
        case 5:
          ((i.tag !== 5 && i.tag !== 27) || Oh(i),
            vl(s, i, l),
            o && a === null && u & 4 && yr(i),
            Sl(i, i.return));
          break;
        case 6:
          Oh(i);
          break;
        case 26:
          ((x = i.stateNode),
            i.memoizedState !== null ||
              x === null ||
              gt ||
              po(Hs(x.ownerDocument), i.type, x),
            vl(s, i, l),
            o && a === null && u & 4 && yr(i),
            Sl(i, i.return));
          break;
        case 12:
          vl(s, i, l);
          break;
        case 31:
          (vl(s, i, l), o && u & 4 && Xh(s, i));
          break;
        case 13:
          (vl(s, i, l), o && u & 4 && Zh(s, i));
          break;
        case 22:
          (i.memoizedState === null && vl(s, i, l), Sl(i, i.return));
          break;
        case 30:
          (vl(s, i, l), Sl(i, i.return));
          break;
        case 7:
          Sl(i, i.return);
        default:
          vl(s, i, l);
      }
      t = t.sibling;
    }
  }
  function Dr(e, t) {
    var l = null;
    (e !== null &&
      e.memoizedState !== null &&
      e.memoizedState.cachePool !== null &&
      (l = e.memoizedState.cachePool.pool),
      (e = null),
      t.memoizedState !== null &&
        t.memoizedState.cachePool !== null &&
        (e = t.memoizedState.cachePool.pool),
      e !== l && (e != null && e.refCount++, l != null && hs(l)));
  }
  function Or(e, t) {
    ((e = null),
      t.alternate !== null && (e = t.alternate.memoizedState.cache),
      (t = t.memoizedState.cache),
      t !== e && (t.refCount++, e != null && hs(e)));
  }
  function cl(e, t, l, a) {
    var s = (l & 335544064) === l;
    if (t.subtreeFlags & (s ? 10262 : 10256))
      for (t = t.child; t !== null; ) (Fh(e, t, l, a), (t = t.sibling));
    else s && Lh(t);
  }
  function Fh(e, t, l, a) {
    var s = (l & 335544064) === l;
    s &&
      t.alternate === null &&
      t.return !== null &&
      t.return.alternate !== null &&
      sc(t);
    var i = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        (cl(e, t, l, a), i & 2048 && Cs(9, t));
        break;
      case 1:
        cl(e, t, l, a);
        break;
      case 3:
        (cl(e, t, l, a),
          s &&
            _r &&
            ((e = e.containerInfo),
            (e =
              e.nodeType === 9
                ? e.body
                : e.nodeName === "HTML"
                  ? e.ownerDocument.body
                  : e),
            e.style.viewTransitionName === "root" &&
              (e.style.viewTransitionName = ""),
            (e = e.ownerDocument.documentElement),
            e !== null &&
              e.style.viewTransitionName === "none" &&
              (e.style.viewTransitionName = "")),
          i & 2048 &&
            ((i = null),
            t.alternate !== null && (i = t.alternate.memoizedState.cache),
            (t = t.memoizedState.cache),
            t !== i && (t.refCount++, i != null && hs(i))));
        break;
      case 12:
        if (i & 2048) {
          (cl(e, t, l, a), (i = t.stateNode));
          try {
            var u = t.memoizedProps,
              o = u.id,
              x = u.onPostCommit;
            typeof x == "function" &&
              x(
                o,
                t.alternate === null ? "mount" : "update",
                i.passiveEffectDuration,
                -0,
              );
          } catch (w) {
            $e(t, t.return, w);
          }
        } else cl(e, t, l, a);
        break;
      case 31:
        cl(e, t, l, a);
        break;
      case 13:
        cl(e, t, l, a);
        break;
      case 23:
        break;
      case 22:
        ((u = t.stateNode),
          (o = t.alternate),
          t.memoizedState !== null
            ? (s && o !== null && o.memoizedState === null && sc(o),
              u._visibility & 2 ? cl(e, t, l, a) : As(e, t))
            : (s && o !== null && o.memoizedState !== null && sc(t),
              u._visibility & 2
                ? cl(e, t, l, a)
                : ((u._visibility |= 2),
                  Da(e, t, l, a, (t.subtreeFlags & 10256) !== 0 || !1))),
          i & 2048 && Dr(o, t));
        break;
      case 24:
        (cl(e, t, l, a), i & 2048 && Or(t.alternate, t));
        break;
      case 30:
        (s &&
          ((i = t.alternate), i !== null && (El(i.child, !0), El(t.child, !0))),
          cl(e, t, l, a));
        break;
      default:
        cl(e, t, l, a);
    }
  }
  function Da(e, t, l, a, s) {
    for (
      s = s && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child;
      t !== null;

    ) {
      var i = e,
        u = t,
        o = l,
        x = a,
        w = u.flags;
      switch (u.tag) {
        case 0:
        case 11:
        case 15:
          (Da(i, u, o, x, s), Cs(8, u));
          break;
        case 23:
          break;
        case 22:
          var q = u.stateNode;
          (u.memoizedState !== null
            ? q._visibility & 2
              ? Da(i, u, o, x, s)
              : As(i, u)
            : ((q._visibility |= 2), Da(i, u, o, x, s)),
            s && w & 2048 && Dr(u.alternate, u));
          break;
        case 24:
          (Da(i, u, o, x, s), s && w & 2048 && Or(u.alternate, u));
          break;
        default:
          Da(i, u, o, x, s);
      }
      t = t.sibling;
    }
  }
  function As(e, t) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; ) {
        var l = e,
          a = t,
          s = a.flags;
        switch (a.tag) {
          case 22:
            (As(l, a), s & 2048 && Dr(a.alternate, a));
            break;
          case 24:
            (As(l, a), s & 2048 && Or(a.alternate, a));
            break;
          default:
            As(l, a);
        }
        t = t.sibling;
      }
  }
  var In = 8192;
  function $n(e, t, l) {
    if (e.subtreeFlags & In)
      for (e = e.child; e !== null; ) (Wh(e, t, l), (e = e.sibling));
  }
  function Wh(e, t, l) {
    switch (e.tag) {
      case 26:
        ($n(e, t, l),
          e.flags & In &&
            (e.memoizedState !== null
              ? Ry(l, pl, e.memoizedState, e.memoizedProps)
              : ((e = e.stateNode), (t & 335544128) === t && sp(l, e))));
        break;
      case 5:
        ($n(e, t, l),
          e.flags & In &&
            ((e = e.stateNode), (t & 335544128) === t && sp(l, e)));
        break;
      case 3:
      case 4:
        var a = pl;
        ((pl = Hs(e.stateNode.containerInfo)), $n(e, t, l), (pl = a));
        break;
      case 22:
        e.memoizedState === null &&
          ((a = e.alternate),
          a !== null && a.memoizedState !== null
            ? ((a = In), (In = 16777216), $n(e, t, l), (In = a))
            : $n(e, t, l));
        break;
      case 30:
        if (
          (e.flags & In) !== 0 &&
          ((a = e.memoizedProps.name), a != null && a !== "auto")
        ) {
          var s = e.stateNode;
          ((s.paired = null), It === null && (It = new Map()), It.set(a, s));
        }
        $n(e, t, l);
        break;
      default:
        $n(e, t, l);
    }
  }
  function Ph(e) {
    var t = e.alternate;
    if (t !== null && ((e = t.child), e !== null)) {
      t.child = null;
      do ((t = e.sibling), (e.sibling = null), (e = t));
      while (e !== null);
    }
  }
  function Rs(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var a = t[l];
          ((jt = a), tm(a, e));
        }
      Ph(e);
    }
    if (e.subtreeFlags & 10256)
      for (e = e.child; e !== null; ) (em(e), (e = e.sibling));
  }
  function em(e) {
    switch (e.tag) {
      case 0:
      case 11:
      case 15:
        (Rs(e), e.flags & 2048 && hn(9, e, e.return));
        break;
      case 3:
        Rs(e);
        break;
      case 12:
        Rs(e);
        break;
      case 22:
        var t = e.stateNode;
        e.memoizedState !== null &&
        t._visibility & 2 &&
        (e.return === null || e.return.tag !== 13)
          ? ((t._visibility &= -3), rc(e))
          : Rs(e);
        break;
      default:
        Rs(e);
    }
  }
  function rc(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var a = t[l];
          ((jt = a), tm(a, e));
        }
      Ph(e);
    }
    for (e = e.child; e !== null; ) {
      switch (((t = e), t.tag)) {
        case 0:
        case 11:
        case 15:
          (hn(8, t, t.return), rc(t));
          break;
        case 22:
          ((l = t.stateNode),
            l._visibility & 2 && ((l._visibility &= -3), rc(t)));
          break;
        default:
          rc(t);
      }
      e = e.sibling;
    }
  }
  function tm(e, t) {
    for (; jt !== null; ) {
      var l = jt;
      switch (l.tag) {
        case 0:
        case 11:
        case 15:
          hn(8, l, t);
          break;
        case 23:
        case 22:
          if (l.memoizedState !== null && l.memoizedState.cachePool !== null) {
            var a = l.memoizedState.cachePool.pool;
            a != null && a.refCount++;
          }
          break;
        case 24:
          hs(l.memoizedState.cache);
      }
      if (((a = l.child), a !== null)) ((a.return = l), (jt = a));
      else
        e: for (l = e; jt !== null; ) {
          a = jt;
          var s = a.sibling,
            i = a.return;
          if ((Gh(a), a === l)) {
            jt = null;
            break e;
          }
          if (s !== null) {
            ((s.return = i), (jt = s));
            break e;
          }
          jt = i;
        }
    }
  }
  var Ex = {
      getCacheForType: function (e) {
        var t = Tt(dt),
          l = t.data.get(e);
        return (l === void 0 && ((l = e()), t.data.set(e, l)), l);
      },
      cacheSignal: function () {
        return Tt(dt).controller.signal;
      },
    },
    Cx = typeof WeakMap == "function" ? WeakMap : Map,
    Ze = 0,
    Pe = null,
    He = null,
    Be = 0,
    Ie = 0,
    $t = null,
    pn = !1,
    Oa = !1,
    zr = !1,
    Ql = 0,
    ut = 0,
    vn = 0,
    Fn = 0,
    oc = 0,
    Ft = 0,
    za = 0,
    Ds = null,
    Yt = null,
    Ur = !1,
    dc = 0,
    lm = 0,
    fc = 1 / 0,
    hc = null,
    xn = null,
    it = 0,
    xl = null,
    Wn = null,
    Al = 0,
    Mr = 0,
    qr = null,
    nm = null,
    Ua = null,
    Ma = null,
    qa = null,
    Os = 0,
    mc = null;
  function Wt() {
    return (Ze & 2) !== 0 && Be !== 0 ? Be & -Be : ne.T !== null ? Xr() : sd();
  }
  function am() {
    if (Ft === 0)
      if ((Be & 536870912) === 0 || qe) {
        var e = ui;
        ((ui <<= 1), (ui & 3932160) === 0 && (ui = 262144), (Ft = e));
      } else Ft = 536870912;
    return ((e = Et.current), e !== null && (e.flags |= 32), Ft);
  }
  function Ha(e, t) {
    if (t != null) {
      var l = e.stateNode,
        a = l.ref;
      (a === null && (a = l.ref = Km(Ml(e.memoizedProps, l))),
        Ma === null && (Ma = []),
        Ma.push(t.bind(null, a)));
    }
  }
  function Vt(e, t, l) {
    (((e === Pe && (Ie === 2 || Ie === 9)) || e.cancelPendingCommit !== null) &&
      (Ka(e, 0), yn(e, Be, Ft, !1)),
      Pa(e, l),
      ((Ze & 2) === 0 || e !== Pe) &&
        (e === Pe &&
          ((Ze & 2) === 0 && (Fn |= l), ut === 4 && yn(e, Be, Ft, !1)),
        Rl(e)));
  }
  function sm(e, t, l) {
    if ((Ze & 6) !== 0) throw Error(r(327));
    var a = (!l && (t & 127) === 0 && (t & e.expiredLanes) === 0) || Wa(e, t),
      s = a ? Ax(e, t) : Kr(e, t, !0),
      i = a;
    do {
      if (s === 0) {
        Oa && !a && yn(e, t, 0, !1);
        break;
      } else {
        if (((l = e.current.alternate), i && !wx(l))) {
          ((s = Kr(e, t, !1)), (i = !1));
          continue;
        }
        if (s === 2) {
          if (((i = t), e.errorRecoveryDisabledLanes & i)) var u = 0;
          else
            ((u = e.pendingLanes & -536870913),
              (u = u !== 0 ? u : u & 536870912 ? 536870912 : 0));
          if (u !== 0) {
            t = u;
            e: {
              var o = e;
              s = Ds;
              var x = o.current.memoizedState.isDehydrated;
              if (
                (x && (Ka(o, u).flags |= 256),
                (u = Kr(o, u, !1)),
                u !== 2 && u !== 6)
              ) {
                if (zr && !x) {
                  ((o.errorRecoveryDisabledLanes |= i), (Fn |= i), (s = 4));
                  break e;
                }
                ((i = Yt),
                  (Yt = s),
                  i !== null &&
                    (Yt === null ? (Yt = i) : Yt.push.apply(Yt, i)));
              }
              s = u;
            }
            if (((i = !1), s !== 2)) continue;
          }
        }
        if (s === 1) {
          (Ka(e, 0), yn(e, t, 0, !0));
          break;
        }
        e: {
          switch (((a = e), (i = s), i)) {
            case 0:
            case 1:
              throw Error(r(345));
            case 4:
              if ((t & 4194048) !== t && (t & 62914560) !== t) break;
            case 6:
              yn(a, t, Ft, !pn);
              break e;
            case 2:
              Yt = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(r(329));
          }
          if ((t & 62914560) === t && ((s = dc + 300 - Nt()), 10 < s)) {
            if ((yn(a, t, Ft, !pn), oi(a, 0, !0) !== 0)) break e;
            ((Al = t),
              (a.timeoutHandle = no(
                im.bind(
                  null,
                  a,
                  l,
                  Yt,
                  hc,
                  Ur,
                  t,
                  Ft,
                  Fn,
                  za,
                  pn,
                  i,
                  "Throttled",
                  -0,
                  0,
                ),
                s,
              )));
            break e;
          }
          im(a, l, Yt, hc, Ur, t, Ft, Fn, za, pn, i, null, -0, 0);
        }
      }
      break;
    } while (!0);
    Rl(e);
  }
  function im(e, t, l, a, s, i, u, o, x, w, q, X, T, z) {
    e.timeoutHandle = -1;
    var me = t.subtreeFlags,
      be = (i & 335544064) === i;
    if (
      ((X = null),
      (be || me & 8192 || (me & 16785408) === 16785408) &&
        ((X = {
          stylesheets: null,
          count: 0,
          imgCount: 0,
          imgBytes: 0,
          suspenseyImages: [],
          waitingForImages: !0,
          waitingForViewTransition: !1,
          unsuspend: jl,
        }),
        (It = null),
        Wh(t, i, X),
        be &&
          ((me = X),
          (be = e.containerInfo),
          (be = (be.nodeType === 9 ? be : be.ownerDocument)
            .__reactViewTransition),
          be != null &&
            (me.count++,
            (me.waitingForViewTransition = !0),
            (me = Bs.bind(me)),
            be.finished.then(me, me))),
        (me =
          (i & 62914560) === i
            ? dc - Nt()
            : (i & 4194048) === i
              ? lm - Nt()
              : 0),
        (me = Dy(X, me)),
        me !== null))
    ) {
      ((Al = i),
        (e.cancelPendingCommit = me(
          mm.bind(null, e, t, i, l, a, s, u, o, x, w, q, X, null, T, z),
        )),
        yn(e, i, u, !w));
      return;
    }
    mm(e, t, i, l, a, s, u, o, x, w, q, X);
  }
  function wx(e) {
    for (var t = e; ; ) {
      var l = t.tag;
      if (
        (l === 0 || l === 11 || l === 15) &&
        t.flags & 16384 &&
        ((l = t.updateQueue), l !== null && ((l = l.stores), l !== null))
      )
        for (var a = 0; a < l.length; a++) {
          var s = l[a],
            i = s.getSnapshot;
          s = s.value;
          try {
            if (!Zt(i(), s)) return !1;
          } catch {
            return !1;
          }
        }
      if (((l = t.child), t.subtreeFlags & 16384 && l !== null))
        ((l.return = t), (t = l));
      else {
        if (t === e) break;
        for (; t.sibling === null; ) {
          if (t.return === null || t.return === e) return !0;
          t = t.return;
        }
        ((t.sibling.return = t.return), (t = t.sibling));
      }
    }
    return !0;
  }
  function yn(e, t, l, a) {
    ((t = ed(e, t)),
      (t &= ~oc),
      (t &= ~Fn),
      (e.suspendedLanes |= t),
      (e.pingedLanes &= ~t),
      a && (e.warmLanes |= t),
      (a = e.expirationTimes));
    for (var s = t; 0 < s; ) {
      var i = 31 - Oe(s),
        u = 1 << i;
      ((a[i] = -1), (s &= ~u));
    }
    l !== 0 && ld(e, l, t);
  }
  function pc() {
    return (Ze & 6) === 0 ? (zs(0), !1) : !0;
  }
  function Hr() {
    if (He !== null) {
      if (Ie === 0) var e = He.return;
      else ((e = He), (Ll = Ln = null), Qu(e), (Ta = null), (vs = 0), (e = He));
      for (; e !== null; ) (Ah(e.alternate, e), (e = e.return));
      He = null;
    }
  }
  function Ka(e, t) {
    var l = e.timeoutHandle;
    return (
      l !== -1 && ((e.timeoutHandle = -1), Fx(l)),
      (l = e.cancelPendingCommit),
      l !== null && ((e.cancelPendingCommit = null), l()),
      (Al = 0),
      Hr(),
      (Pe = e),
      (He = l = Hl(e.current, null)),
      (Be = t),
      (Ie = 0),
      ($t = null),
      (pn = !1),
      (Oa = Wa(e, t)),
      (zr = !1),
      (za = Ft = oc = Fn = vn = ut = 0),
      (Yt = Ds = null),
      (Ur = !1),
      (Ql = ed(e, t)),
      Si(),
      l
    );
  }
  function cm(e, t) {
    ((Ue = null),
      (ne.H = Ji),
      t === Sa || t === Ui
        ? ((t = mf()), (Ie = 3))
        : t === Ou
          ? ((t = mf()), (Ie = 4))
          : (Ie =
              t === ir
                ? 8
                : t !== null &&
                    typeof t == "object" &&
                    typeof t.then == "function"
                  ? 6
                  : 1),
      ($t = t),
      He === null && ((ut = 1), Ii(e, nl(t, e.current))));
  }
  function um() {
    var e = Et.current;
    return e === null
      ? !0
      : (Be & 4194048) === Be
        ? Dt === null
        : (Be & 62914560) === Be || (Be & 536870912) !== 0
          ? e === Dt
          : !1;
  }
  function rm() {
    var e = ne.H;
    return ((ne.H = Ji), e === null ? Ji : e);
  }
  function om() {
    var e = ne.A;
    return ((ne.A = Ex), e);
  }
  function vc() {
    ((ut = 4),
      pn || ((Be & 4194048) !== Be && Et.current !== null) || (Oa = !0),
      ((vn & 134217727) === 0 && (Fn & 134217727) === 0) ||
        Pe === null ||
        yn(Pe, Be, Ft, !1));
  }
  function Kr(e, t, l) {
    var a = Ze;
    Ze |= 2;
    var s = rm(),
      i = om();
    ((Pe !== e || Be !== t) && ((hc = null), Ka(e, t)), (t = !1));
    var u = ut;
    e: do
      try {
        if (Ie !== 0 && He !== null) {
          var o = He,
            x = $t;
          switch (Ie) {
            case 8:
              (Hr(), (u = 6));
              break e;
            case 3:
            case 2:
            case 9:
            case 6:
              Et.current === null && (t = !0);
              var w = Ie;
              if (((Ie = 0), ($t = null), La(e, o, x, w), l && Oa)) {
                u = 0;
                break e;
              }
              break;
            default:
              ((w = Ie), (Ie = 0), ($t = null), La(e, o, x, w));
          }
        }
        (_x(), (u = ut));
        break;
      } catch (q) {
        cm(e, q);
      }
    while (!0);
    return (
      t && e.shellSuspendCounter++,
      (Ll = Ln = null),
      (Ze = a),
      (ne.H = s),
      (ne.A = i),
      He === null && ((Pe = null), (Be = 0), Si()),
      u
    );
  }
  function _x() {
    for (; He !== null; ) dm(He);
  }
  function Ax(e, t) {
    var l = Ze;
    Ze |= 2;
    var a = rm(),
      s = om();
    Pe !== e || Be !== t
      ? ((hc = null), (fc = Nt() + 500), Ka(e, t))
      : (Oa = Wa(e, t));
    e: do
      try {
        if (Ie !== 0 && He !== null) {
          t = He;
          var i = $t;
          t: switch (Ie) {
            case 1:
              ((Ie = 0), ($t = null), La(e, t, i, 1));
              break;
            case 2:
            case 9:
              if (ff(i)) {
                ((Ie = 0), ($t = null), fm(t));
                break;
              }
              ((t = function () {
                ((Ie !== 2 && Ie !== 9) || Pe !== e || (Ie = 7), Rl(e));
              }),
                i.then(t, t));
              break e;
            case 3:
              Ie = 7;
              break e;
            case 4:
              Ie = 5;
              break e;
            case 7:
              ff(i)
                ? ((Ie = 0), ($t = null), fm(t))
                : ((Ie = 0), ($t = null), La(e, t, i, 7));
              break;
            case 5:
              var u = null;
              switch (He.tag) {
                case 26:
                  u = He.memoizedState;
                case 5:
                case 27:
                  var o = He;
                  if (u ? np(u) : o.stateNode.complete) {
                    ((Ie = 0), ($t = null));
                    var x = o.sibling;
                    if (x !== null) He = x;
                    else {
                      var w = o.return;
                      w !== null ? ((He = w), xc(w)) : (He = null);
                    }
                    break t;
                  }
              }
              ((Ie = 0), ($t = null), La(e, t, i, 5));
              break;
            case 6:
              ((Ie = 0), ($t = null), La(e, t, i, 6));
              break;
            case 8:
              (Hr(), (ut = 6));
              break e;
            default:
              throw Error(r(462));
          }
        }
        Rx();
        break;
      } catch (q) {
        cm(e, q);
      }
    while (!0);
    return (
      (Ll = Ln = null),
      (ne.H = a),
      (ne.A = s),
      (Ze = l),
      He !== null ? 0 : ((Pe = null), (Be = 0), Si(), ut)
    );
  }
  function Rx() {
    for (; He !== null && !Gc(); ) dm(He);
  }
  function dm(e) {
    var t = wh(e.alternate, e, Ql);
    ((e.memoizedProps = e.pendingProps), t === null ? xc(e) : (He = t));
  }
  function fm(e) {
    var t = e,
      l = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = jh(l, t, t.pendingProps, t.type, void 0, Be);
        break;
      case 11:
        t = jh(l, t, t.pendingProps, t.type.render, t.ref, Be);
        break;
      case 5:
        Qu(t);
        var a = t;
        a === yt &&
          (qe
            ? (Ai(a), a.tag === 5 && a.stateNode != null && (tt = a.stateNode))
            : (Ai(a), (qe = !0)));
      default:
        (Ah(l, t), (t = He = ef(t, Ql)), (t = wh(l, t, Ql)));
    }
    ((e.memoizedProps = e.pendingProps), t === null ? xc(e) : (He = t));
  }
  function La(e, t, l, a) {
    ((Ll = Ln = null), Qu(t), (Ta = null), (vs = 0));
    var s = t.return;
    try {
      if (xx(e, s, t, l, Be)) {
        ((ut = 1), Ii(e, nl(l, e.current)), (He = null));
        return;
      }
    } catch (i) {
      if (s !== null) throw ((He = s), i);
      ((ut = 1), Ii(e, nl(l, e.current)), (He = null));
      return;
    }
    t.flags & 32768
      ? (qe || a === 1
          ? (e = !0)
          : Oa || (Be & 536870912) !== 0
            ? (e = !1)
            : ((pn = e = !0),
              (a === 2 || a === 9 || a === 3 || a === 6) &&
                ((a = Et.current),
                a !== null && a.tag === 13 && (a.flags |= 16384))),
        hm(t, e))
      : xc(t);
  }
  function xc(e) {
    var t = e;
    do {
      if ((t.flags & 32768) !== 0) {
        hm(t, pn);
        return;
      }
      e = t.return;
      var l = bx(t.alternate, t, Ql);
      if (l !== null) {
        He = l;
        return;
      }
      if (((t = t.sibling), t !== null)) {
        He = t;
        return;
      }
      He = t = e;
    } while (t !== null);
    ut === 0 && (ut = 5);
  }
  function hm(e, t) {
    do {
      var l = Nx(e.alternate, e);
      if (l !== null) {
        ((l.flags &= 32767), (He = l));
        return;
      }
      if (
        ((l = e.return),
        l !== null &&
          ((l.flags |= 32768), (l.subtreeFlags = 0), (l.deletions = null)),
        !t && ((e = e.sibling), e !== null))
      ) {
        He = e;
        return;
      }
      He = e = l;
    } while (e !== null);
    ((ut = 6), (He = null));
  }
  function mm(e, t, l, a, s, i, u, o, x, w, q, X) {
    e.cancelPendingCommit = null;
    do yc();
    while (it !== 0);
    if ((Ze & 6) !== 0) throw Error(r(327));
    if (t !== null) {
      if (t === e.current) throw Error(r(177));
      (e === Pe && ((He = Pe = null), (Be = 0)),
        (Wn = t),
        (xl = e),
        (Al = l),
        (qr = s),
        (nm = a),
        Dx(e, t, l, u, o, x, X));
    }
  }
  function Dx(e, t, l, a, s, i, u) {
    var o = t.lanes | t.childLanes;
    if (
      ((Mr = o),
      (o |= gu),
      nv(e, l, o, a, s, i),
      (Ma = null),
      (l & 335544064) === l
        ? ((qa = sx(e)), (a = 10262))
        : ((qa = null), (a = 10256)),
      (t.subtreeFlags & a) !== 0 || (t.flags & a) !== 0
        ? ((e.callbackNode = null),
          (e.callbackPriority = 0),
          Hx(Fl, function () {
            return (Yr(), null);
          }))
        : ((e.callbackNode = null), (e.callbackPriority = 0)),
      (nc = !1),
      (a = (t.flags & 13878) !== 0),
      (t.subtreeFlags & 13878) !== 0 || a)
    ) {
      ((a = ne.T), (ne.T = null), (s = pe.p), (pe.p = 2), (i = Ze), (Ze |= 4));
      try {
        Sx(e, t, l);
      } finally {
        ((Ze = i), (pe.p = s), (ne.T = a));
      }
    }
    ((it = 1),
      nc
        ? (Ua = ny(u, e.containerInfo, qa, Lr, Br, zx, kr, Yr, Ox))
        : (Lr(), Br(), kr()));
  }
  function Ox(e) {
    if (it !== 0) {
      var t = xl.onRecoverableError;
      t(e, { componentStack: null });
    }
  }
  function zx() {
    it === 3 && ((it = 0), $h(Wn, xl), (it = 4));
  }
  function Lr() {
    if (it === 1) {
      it = 0;
      var e = xl,
        t = Wn,
        l = Al,
        a = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || a) {
        ((a = ne.T), (ne.T = null));
        var s = pe.p;
        pe.p = 2;
        var i = Ze;
        Ze |= 4;
        try {
          ((_s = ic = !1), Jh(t, e, l), (l = eo));
          var u = Gd(e.containerInfo),
            o = l.focusedElem,
            x = l.selectionRange;
          if (
            u !== o &&
            o &&
            o.ownerDocument &&
            Vd(o.ownerDocument.documentElement, o)
          ) {
            if (x !== null && mu(o)) {
              var w = x.start,
                q = x.end;
              if ((q === void 0 && (q = w), "selectionStart" in o))
                ((o.selectionStart = w),
                  (o.selectionEnd = Math.min(q, o.value.length)));
              else {
                var X = o.ownerDocument || document,
                  T = (X && X.defaultView) || window;
                if (T.getSelection) {
                  var z = T.getSelection(),
                    me = o.textContent.length,
                    be = Math.min(x.start, me),
                    Me = x.end === void 0 ? be : Math.min(x.end, me);
                  !z.extend && be > Me && ((u = Me), (Me = be), (be = u));
                  var C = Yd(o, be),
                    N = Yd(o, Me);
                  if (
                    C &&
                    N &&
                    (z.rangeCount !== 1 ||
                      z.anchorNode !== C.node ||
                      z.anchorOffset !== C.offset ||
                      z.focusNode !== N.node ||
                      z.focusOffset !== N.offset)
                  ) {
                    var A = X.createRange();
                    (A.setStart(C.node, C.offset),
                      z.removeAllRanges(),
                      be > Me
                        ? (z.addRange(A), z.extend(N.node, N.offset))
                        : (A.setEnd(N.node, N.offset), z.addRange(A)));
                  }
                }
              }
            }
            for (X = [], z = o; (z = z.parentNode); )
              z.nodeType === 1 &&
                X.push({ element: z, left: z.scrollLeft, top: z.scrollTop });
            for (
              typeof o.focus == "function" && o.focus(), o = 0;
              o < X.length;
              o++
            ) {
              var Q = X[o];
              ((Q.element.scrollLeft = Q.left), (Q.element.scrollTop = Q.top));
            }
          }
          ((Za = !!Pr), (eo = Pr = null));
        } finally {
          ((Ze = i), (pe.p = s), (ne.T = a));
        }
      }
      ((e.current = t), (it = 2));
    }
  }
  function Br() {
    if (it === 2) {
      it = 0;
      var e = xl,
        t = Wn,
        l = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || l) {
        ((l = ne.T), (ne.T = null));
        var a = pe.p;
        pe.p = 2;
        var s = Ze;
        Ze |= 4;
        try {
          Yh(e, t.alternate, t);
        } finally {
          ((Ze = s), (pe.p = a), (ne.T = l));
        }
      }
      it = 3;
    }
  }
  function kr() {
    if (it === 4 || it === 3) {
      it = 0;
      var e = Ua;
      ((Ua = null), na());
      var t = xl,
        l = Wn,
        a = Al,
        s = nm,
        i = (a & 335544064) === a ? 10262 : 10256;
      if (
        ((l.subtreeFlags & i) !== 0 || (l.flags & i) !== 0
          ? (it = 5)
          : ((it = 0), (Wn = xl = null), pm(t, t.pendingLanes)),
        (i = t.pendingLanes),
        i === 0 && (xn = null),
        $c(a),
        (l = l.stateNode),
        $ && typeof $.onCommitFiberRoot == "function")
      )
        try {
          $.onCommitFiberRoot(Wl, l, void 0, (l.current.flags & 128) === 128);
        } catch {}
      if (s !== null) {
        ((l = ne.T), (i = pe.p), (pe.p = 2), (ne.T = null));
        try {
          for (var u = t.onRecoverableError, o = 0; o < s.length; o++) {
            var x = s[o];
            u(x.value, { componentStack: x.stack });
          }
        } finally {
          ((ne.T = l), (pe.p = i));
        }
      }
      if (
        ((s = Ma),
        (u = qa),
        (qa = null),
        s !== null && ((Ma = null), u === null && (u = []), e !== null))
      )
        for (x = 0; x < s.length; x++)
          ((l = (0, s[x])(u)), l !== void 0 && e.finished.finally(l));
      ((Al & 3) !== 0 && yc(),
        Rl(t),
        (i = t.pendingLanes),
        (a & 261930) !== 0 && (i & 42) !== 0
          ? t === mc
            ? Os++
            : ((Os = 0), (mc = t))
          : ((Os = 0), (mc = null)),
        zs(0));
    }
  }
  function pm(e, t) {
    (e.pooledCacheLanes &= t) === 0 &&
      ((t = e.pooledCache), t != null && ((e.pooledCache = null), hs(t)));
  }
  function yc() {
    return (
      Ua !== null && (Ua.skipTransition(), (Ua = null)),
      Lr(),
      Br(),
      kr(),
      Yr()
    );
  }
  function Yr() {
    if (it !== 5) return !1;
    var e = xl,
      t = Mr;
    Mr = 0;
    var l = $c(Al),
      a = ne.T,
      s = pe.p;
    try {
      ((pe.p = 32 > l ? 32 : l), (ne.T = null), (l = qr), (qr = null));
      var i = xl,
        u = Al;
      if (((it = 0), (Wn = xl = null), (Al = 0), (Ze & 6) !== 0))
        throw Error(r(331));
      var o = Ze;
      if (
        ((Ze |= 4),
        em(i.current),
        Fh(i, i.current, u, l),
        (Ze = o),
        zs(0, !1),
        $ && typeof $.onPostCommitFiberRoot == "function")
      )
        try {
          $.onPostCommitFiberRoot(Wl, i);
        } catch {}
      return !0;
    } finally {
      ((pe.p = s), (ne.T = a), pm(e, t));
    }
  }
  function vm(e, t, l) {
    ((t = nl(l, t)),
      (t = sr(e.stateNode, t, 2)),
      (e = rn(e, t, 2)),
      e !== null && (Pa(e, 2), Rl(e)));
  }
  function $e(e, t, l) {
    if (e.tag === 3) vm(e, e, l);
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          vm(t, e, l);
          break;
        } else if (t.tag === 1) {
          var a = t.stateNode;
          if (
            typeof t.type.getDerivedStateFromError == "function" ||
            (typeof a.componentDidCatch == "function" &&
              (xn === null || !xn.has(a)))
          ) {
            ((e = nl(l, e)),
              (l = fh(2)),
              (a = rn(t, l, 2)),
              a !== null && (hh(l, a, t, e), Pa(a, 2), Rl(a)));
            break;
          }
        }
        t = t.return;
      }
  }
  function Vr(e, t, l) {
    var a = e.pingCache;
    if (a === null) {
      a = e.pingCache = new Cx();
      var s = new Set();
      a.set(t, s);
    } else ((s = a.get(t)), s === void 0 && ((s = new Set()), a.set(t, s)));
    s.has(l) ||
      ((zr = !0), s.add(l), (e = Ux.bind(null, e, t, l)), t.then(e, e));
  }
  function Ux(e, t, l) {
    var a = e.pingCache;
    (a !== null && a.delete(t),
      (e.pingedLanes |= e.suspendedLanes & l),
      (e.warmLanes &= ~l),
      Pe === e &&
        (Be & l) === l &&
        ((ut === 4 ||
          (ut === 3 && (Be & 62914560) === Be && 300 > Nt() - dc)) &&
        (Ze & 2) === 0
          ? Ka(e, 0)
          : (oc |= l),
        za === Be && (za = 0)),
      Rl(e));
  }
  function xm(e, t) {
    (t === 0 && (t = td()), (e = qn(e, t)), e !== null && (Pa(e, t), Rl(e)));
  }
  function Mx(e) {
    var t = e.memoizedState,
      l = 0;
    (t !== null && (l = t.retryLane), xm(e, l));
  }
  function qx(e, t) {
    var l = 0;
    switch (e.tag) {
      case 31:
      case 13:
        var a = e.stateNode,
          s = e.memoizedState;
        s !== null && (l = s.retryLane);
        break;
      case 19:
        a = e.stateNode;
        break;
      case 22:
        a = e.stateNode._retryCache;
        break;
      default:
        throw Error(r(314));
    }
    (a !== null && a.delete(t), xm(e, l));
  }
  function Hx(e, t) {
    return Fa(e, t);
  }
  var Ba = null,
    ka = null,
    Gr = !1,
    gc = !1,
    Qr = !1,
    gn = 0;
  function Rl(e) {
    (e !== ka &&
      e.next === null &&
      (ka === null ? (Ba = ka = e) : (ka = ka.next = e)),
      (gc = !0),
      Gr || ((Gr = !0), Lx()));
  }
  function zs(e, t) {
    if (!Qr && gc) {
      Qr = !0;
      do
        for (var l = !1, a = Ba; a !== null; ) {
          if (e !== 0) {
            var s = a.pendingLanes;
            if (s === 0) var i = 0;
            else {
              var u = a.suspendedLanes,
                o = a.pingedLanes;
              ((i = (1 << (31 - Oe(42 | e) + 1)) - 1),
                (i &= s & ~(u & ~o)),
                (i = i & 201326741 ? (i & 201326741) | 1 : i ? i | 2 : 0));
            }
            i !== 0 && ((l = !0), bm(a, i));
          } else
            ((i = Be),
              (i = oi(
                a,
                a === Pe ? i : 0,
                a.cancelPendingCommit !== null || a.timeoutHandle !== -1,
              )),
              (i & 3) === 0 || Wa(a, i) || ((l = !0), bm(a, i)));
          a = a.next;
        }
      while (l);
      Qr = !1;
    }
  }
  function Kx() {
    ym();
  }
  function ym() {
    gc = Gr = !1;
    var e = 0;
    gn !== 0 && $x() && (e = gn);
    for (var t = Nt(), l = null, a = Ba; a !== null; ) {
      var s = a.next,
        i = gm(a, t);
      (i === 0
        ? ((a.next = null),
          l === null ? (Ba = s) : (l.next = s),
          s === null && (ka = l))
        : ((l = a), (e !== 0 || (i & 3) !== 0) && (gc = !0)),
        (a = s));
    }
    ((it !== 0 && it !== 5) || zs(e), gn !== 0 && (gn = 0));
  }
  function gm(e, t) {
    for (
      var l = e.suspendedLanes,
        a = e.pingedLanes,
        s = e.expirationTimes,
        i = e.pendingLanes & -62914561;
      0 < i;

    ) {
      var u = 31 - Oe(i),
        o = 1 << u,
        x = s[u];
      (x === -1
        ? ((o & l) === 0 || (o & a) !== 0) && (s[u] = lv(o, t))
        : x <= t && (e.expiredLanes |= o),
        (i &= ~o));
    }
    if (
      ((t = Pe),
      (l = Be),
      (l = oi(
        e,
        e === t ? l : 0,
        e.cancelPendingCommit !== null || e.timeoutHandle !== -1,
      )),
      (a = e.callbackNode),
      l === 0 ||
        (e === t && (Ie === 2 || Ie === 9)) ||
        e.cancelPendingCommit !== null)
    )
      return (
        a !== null && a !== null && la(a),
        (e.callbackNode = null),
        (e.callbackPriority = 0)
      );
    if ((l & 3) === 0 || Wa(e, l)) {
      if (((t = l & -l), t === e.callbackPriority)) return t;
      switch ((a !== null && la(a), $c(l))) {
        case 2:
        case 8:
          l = ii;
          break;
        case 32:
          l = Fl;
          break;
        case 268435456:
          l = ci;
          break;
        default:
          l = Fl;
      }
      return (
        (a = jm.bind(null, e)),
        (l = Fa(l, a)),
        (e.callbackPriority = t),
        (e.callbackNode = l),
        t
      );
    }
    return (
      a !== null && a !== null && la(a),
      (e.callbackPriority = 2),
      (e.callbackNode = null),
      2
    );
  }
  function jm(e, t) {
    if (it !== 0 && it !== 5)
      return ((e.callbackNode = null), (e.callbackPriority = 0), null);
    var l = e.callbackNode;
    if (yc() && e.callbackNode !== l) return null;
    var a = Be;
    return (
      (a = oi(
        e,
        e === Pe ? a : 0,
        e.cancelPendingCommit !== null || e.timeoutHandle !== -1,
      )),
      a === 0
        ? null
        : (sm(e, a, t),
          gm(e, Nt()),
          e.callbackNode != null && e.callbackNode === l
            ? jm.bind(null, e)
            : null)
    );
  }
  function bm(e, t) {
    if (yc()) return null;
    sm(e, t, !0);
  }
  function Lx() {
    Wx(function () {
      (Ze & 6) !== 0 ? Fa(si, Kx) : ym();
    });
  }
  function Xr() {
    if (gn === 0) {
      var e = Yn;
      (e === 0 && ((e = sa), (sa <<= 1), (sa & 261888) === 0 && (sa = 256)),
        (gn = e));
    }
    return gn;
  }
  function Nm(e) {
    return e == null || typeof e == "symbol" || typeof e == "boolean"
      ? null
      : typeof e == "function"
        ? e
        : pi(e);
  }
  function Bx(e, t, l, a, s) {
    if (t === "submit" && l && l.stateNode === s) {
      var i = Nm((s[Kt] || null).action),
        u = a.submitter;
      u &&
        ((t = (t = u[Kt] || null)
          ? Nm(t.formAction)
          : u.getAttribute("formAction")),
        t !== null && ((i = t), (u = null)));
      var o = new gi("action", "action", null, a, s);
      e.push({
        event: o,
        listeners: [
          {
            instance: null,
            listener: function () {
              if (a.defaultPrevented) {
                if (gn !== 0) {
                  var x = new FormData(s, u);
                  er(
                    l,
                    { pending: !0, data: x, method: s.method, action: i },
                    null,
                    x,
                  );
                }
              } else
                typeof i == "function" &&
                  (o.preventDefault(),
                  (x = new FormData(s, u)),
                  er(
                    l,
                    { pending: !0, data: x, method: s.method, action: i },
                    i,
                    x,
                  ));
            },
            currentTarget: s,
          },
        ],
      });
    }
  }
  for (var Zr = 0; Zr < yu.length; Zr++) {
    var Jr = yu[Zr],
      kx = Jr.toLowerCase(),
      Yx = Jr[0].toUpperCase() + Jr.slice(1);
    hl(kx, "on" + Yx);
  }
  (hl(Zd, "onAnimationEnd"),
    hl(Jd, "onAnimationIteration"),
    hl(Id, "onAnimationStart"),
    hl("dblclick", "onDoubleClick"),
    hl("focusin", "onFocus"),
    hl("focusout", "onBlur"),
    hl(Fv, "onTransitionRun"),
    hl(Wv, "onTransitionStart"),
    hl(Pv, "onTransitionCancel"),
    hl($d, "onTransitionEnd"),
    ra("onMouseEnter", ["mouseout", "mouseover"]),
    ra("onMouseLeave", ["mouseout", "mouseover"]),
    ra("onPointerEnter", ["pointerout", "pointerover"]),
    ra("onPointerLeave", ["pointerout", "pointerover"]),
    zn(
      "onChange",
      "change click focusin focusout input keydown keyup selectionchange".split(
        " ",
      ),
    ),
    zn(
      "onSelect",
      "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
        " ",
      ),
    ),
    zn("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]),
    zn(
      "onCompositionEnd",
      "compositionend focusout keydown keypress keyup mousedown".split(" "),
    ),
    zn(
      "onCompositionStart",
      "compositionstart focusout keydown keypress keyup mousedown".split(" "),
    ),
    zn(
      "onCompositionUpdate",
      "compositionupdate focusout keydown keypress keyup mousedown".split(" "),
    ));
  var Us =
      "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
        " ",
      ),
    Vx = new Set(
      "beforetoggle cancel close invalid load scroll scrollend toggle"
        .split(" ")
        .concat(Us),
    );
  function Sm(e, t) {
    t = (t & 4) !== 0;
    for (var l = 0; l < e.length; l++) {
      var a = e[l],
        s = a.event;
      a = a.listeners;
      e: {
        var i = void 0;
        if (t)
          for (var u = a.length - 1; 0 <= u; u--) {
            var o = a[u],
              x = o.instance,
              w = o.currentTarget;
            if (((o = o.listener), x !== i && s.isPropagationStopped()))
              break e;
            ((i = o), (s.currentTarget = w));
            try {
              i(s);
            } catch (q) {
              Ni(q);
            }
            ((s.currentTarget = null), (i = x));
          }
        else
          for (u = 0; u < a.length; u++) {
            if (
              ((o = a[u]),
              (x = o.instance),
              (w = o.currentTarget),
              (o = o.listener),
              x !== i && s.isPropagationStopped())
            )
              break e;
            ((i = o), (s.currentTarget = w));
            try {
              i(s);
            } catch (q) {
              Ni(q);
            }
            ((s.currentTarget = null), (i = x));
          }
      }
    }
  }
  function Ke(e, t) {
    var l = t[cd];
    l === void 0 && (l = t[cd] = new Set());
    var a = e + "__bubble";
    l.has(a) || (Tm(t, e, 2, !1), l.add(a));
  }
  function Ir(e, t, l) {
    var a = 0;
    (t && (a |= 4), Tm(l, e, a, t));
  }
  var jc = "_reactListening" + Math.random().toString(36).slice(2);
  function $r(e) {
    if (!e[jc]) {
      ((e[jc] = !0),
        od.forEach(function (l) {
          l !== "selectionchange" && (Vx.has(l) || Ir(l, !1, e), Ir(l, !0, e));
        }));
      var t = e.nodeType === 9 ? e : e.ownerDocument;
      t === null || t[jc] || ((t[jc] = !0), Ir("selectionchange", !1, t));
    }
  }
  function Tm(e, t, l, a) {
    switch (hp(t)) {
      case 2:
        var s = My;
        break;
      case 8:
        s = qy;
        break;
      default:
        s = xo;
    }
    ((l = s.bind(null, t, l, e)),
      (s = void 0),
      !au ||
        (t !== "touchstart" && t !== "touchmove" && t !== "wheel") ||
        (s = !0),
      a
        ? s !== void 0
          ? e.addEventListener(t, l, { capture: !0, passive: s })
          : e.addEventListener(t, l, !0)
        : s !== void 0
          ? e.addEventListener(t, l, { passive: s })
          : e.addEventListener(t, l, !1));
  }
  function Fr(e, t, l, a, s) {
    var i = a;
    if ((t & 1) === 0 && (t & 2) === 0 && a !== null)
      e: for (;;) {
        if (a === null) return;
        var u = a.tag;
        if (u === 3 || u === 4) {
          var o = a.stateNode.containerInfo;
          if (o === s) break;
          if (u === 4)
            for (u = a.return; u !== null; ) {
              var x = u.tag;
              if ((x === 3 || x === 4) && u.stateNode.containerInfo === s)
                return;
              u = u.return;
            }
          for (; o !== null; ) {
            if (((u = On(o)), u === null)) return;
            if (((x = u.tag), x === 5 || x === 6 || x === 26 || x === 27)) {
              a = i = u;
              continue e;
            }
            o = o.parentNode;
          }
        }
        a = a.return;
      }
    Sd(function () {
      var w = i,
        q = lu(l),
        X = [];
      e: {
        var T = Fd.get(e);
        if (T !== void 0) {
          var z = gi,
            me = e;
          switch (e) {
            case "keypress":
              if (xi(l) === 0) break e;
            case "keydown":
            case "keyup":
              z = wv;
              break;
            case "focusin":
              ((me = "focus"), (z = uu));
              break;
            case "focusout":
              ((me = "blur"), (z = uu));
              break;
            case "beforeblur":
            case "afterblur":
              z = uu;
              break;
            case "click":
              if (l.button === 2) break e;
            case "auxclick":
            case "dblclick":
            case "mousedown":
            case "mousemove":
            case "mouseup":
            case "mouseout":
            case "mouseover":
            case "contextmenu":
              z = Cd;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              z = pv;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              z = Ov;
              break;
            case Zd:
            case Jd:
            case Id:
              z = yv;
              break;
            case $d:
              z = Uv;
              break;
            case "scroll":
            case "scrollend":
              z = hv;
              break;
            case "wheel":
              z = qv;
              break;
            case "copy":
            case "cut":
            case "paste":
              z = jv;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              z = _d;
              break;
            case "submit":
              z = Rv;
              break;
            case "toggle":
            case "beforetoggle":
              z = Kv;
          }
          var be = (t & 4) !== 0,
            Me = !be && (e === "scroll" || e === "scrollend"),
            C = be ? (T !== null ? T + "Capture" : null) : T;
          be = [];
          for (var N = w, A; N !== null; ) {
            var Q = N;
            if (
              ((A = Q.stateNode),
              (Q = Q.tag),
              (Q !== 5 && Q !== 26 && Q !== 27) ||
                A === null ||
                C === null ||
                ((Q = ls(N, C)), Q != null && be.push(Ms(N, Q, A))),
              Me)
            )
              break;
            N = N.return;
          }
          0 < be.length &&
            ((T = new z(T, me, null, l, q)),
            X.push({ event: T, listeners: be }));
        }
      }
      if ((t & 7) === 0) {
        e: {
          if (
            ((z = e === "mouseover" || e === "pointerover"),
            (T = e === "mouseout" || e === "pointerout"),
            z &&
              l !== tu &&
              (me = l.relatedTarget || l.fromElement) &&
              (On(me) || me[ia]))
          )
            break e;
          (T || z) &&
            ((me =
              q.window === q
                ? q
                : (z = q.ownerDocument)
                  ? z.defaultView || z.parentWindow
                  : window),
            T
              ? ((z = l.relatedTarget || l.toElement),
                (T = w),
                (z = z ? On(z) : null),
                z !== null &&
                  ((Me = p(z)),
                  (be = z.tag),
                  z !== Me || (be !== 5 && be !== 27 && be !== 6)) &&
                  (z = null))
              : ((T = null), (z = w)),
            T !== z &&
              ((be = Cd),
              (Q = "onMouseLeave"),
              (C = "onMouseEnter"),
              (N = "mouse"),
              (e === "pointerout" || e === "pointerover") &&
                ((be = _d),
                (Q = "onPointerLeave"),
                (C = "onPointerEnter"),
                (N = "pointer")),
              (Me = T == null ? me : ts(T)),
              (A = z == null ? me : ts(z)),
              (me = new be(Q, N + "leave", T, l, q)),
              (me.target = Me),
              (me.relatedTarget = A),
              (Q = null),
              On(q) === w &&
                ((be = new be(C, N + "enter", z, l, q)),
                (be.target = A),
                (be.relatedTarget = Me),
                (Q = be)),
              (Me = Q),
              (be = T && z ? Z(T, z, Gx) : null),
              T !== null && Em(X, me, T, be, !1),
              z !== null && Me !== null && Em(X, Me, z, be, !0)));
        }
        e: {
          if (
            ((T = w ? ts(w) : window),
            (z = T.nodeName && T.nodeName.toLowerCase()),
            z === "select" || (z === "input" && T.type === "file"))
          )
            var ge = qd;
          else if (Ud(T))
            if (Hd) ge = Jv;
            else {
              ge = Xv;
              var ke = Qv;
            }
          else
            ((z = T.nodeName),
              !z ||
              z.toLowerCase() !== "input" ||
              (T.type !== "checkbox" && T.type !== "radio")
                ? w && eu(w.elementType) && (ge = qd)
                : (ge = Zv));
          if (ge && (ge = ge(e, w))) {
            Md(X, ge, l, q);
            break e;
          }
          ke && ke(e, T, w);
        }
        switch (((ke = w ? ts(w) : window), e)) {
          case "focusin":
            (Ud(ke) || ke.contentEditable === "true") &&
              ((pa = ke), (pu = w), (os = null));
            break;
          case "focusout":
            os = pu = pa = null;
            break;
          case "mousedown":
            vu = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            ((vu = !1), Qd(X, l, q));
            break;
          case "selectionchange":
            if ($v) break;
          case "keydown":
          case "keyup":
            Qd(X, l, q);
        }
        var Ce;
        if (ou)
          e: {
            switch (e) {
              case "compositionstart":
                var _e = "onCompositionStart";
                break e;
              case "compositionend":
                _e = "onCompositionEnd";
                break e;
              case "compositionupdate":
                _e = "onCompositionUpdate";
                break e;
            }
            _e = void 0;
          }
        else
          ma
            ? Od(e, l) && (_e = "onCompositionEnd")
            : e === "keydown" &&
              l.keyCode === 229 &&
              (_e = "onCompositionStart");
        (_e &&
          (Ad &&
            l.locale !== "ko" &&
            (ma || _e !== "onCompositionStart"
              ? _e === "onCompositionEnd" && ma && (Ce = Td())
              : ((Pl = q),
                (su = "value" in Pl ? Pl.value : Pl.textContent),
                (ma = !0))),
          (ke = bc(w, _e)),
          0 < ke.length &&
            ((_e = new wd(_e, e, null, l, q)),
            X.push({ event: _e, listeners: ke }),
            Ce
              ? (_e.data = Ce)
              : ((Ce = zd(l)), Ce !== null && (_e.data = Ce)))),
          (Ce = Bv ? kv(e, l) : Yv(e, l)) &&
            ((_e = bc(w, "onBeforeInput")),
            0 < _e.length &&
              ((ke = new wd("onBeforeInput", "beforeinput", null, l, q)),
              X.push({ event: ke, listeners: _e }),
              (ke.data = Ce))),
          Bx(X, e, w, l, q));
      }
      Sm(X, t);
    });
  }
  function Ms(e, t, l) {
    return { instance: e, listener: t, currentTarget: l };
  }
  function bc(e, t) {
    for (var l = t + "Capture", a = []; e !== null; ) {
      var s = e,
        i = s.stateNode;
      if (
        ((s = s.tag),
        (s !== 5 && s !== 26 && s !== 27) ||
          i === null ||
          ((s = ls(e, l)),
          s != null && a.unshift(Ms(e, s, i)),
          (s = ls(e, t)),
          s != null && a.push(Ms(e, s, i))),
        e.tag === 3)
      )
        return a;
      e = e.return;
    }
    return [];
  }
  function Gx(e) {
    if (e === null) return null;
    do e = e.return;
    while (e && e.tag !== 5 && e.tag !== 27);
    return e || null;
  }
  function Em(e, t, l, a, s) {
    for (var i = t._reactName, u = []; l !== null && l !== a; ) {
      var o = l,
        x = o.alternate,
        w = o.stateNode;
      if (((o = o.tag), x !== null && x === a)) break;
      ((o !== 5 && o !== 26 && o !== 27) ||
        w === null ||
        ((x = w),
        s
          ? ((w = ls(l, i)), w != null && u.unshift(Ms(l, w, x)))
          : s || ((w = ls(l, i)), w != null && u.push(Ms(l, w, x)))),
        (l = l.return));
    }
    u.length !== 0 && e.push({ event: t, listeners: u });
  }
  var Qx = /\r\n?/g,
    Xx = /\u0000|\uFFFD/g;
  function Cm(e) {
    return (typeof e == "string" ? e : "" + e)
      .replace(
        Qx,
        `
`,
      )
      .replace(Xx, "");
  }
  function wm(e, t) {
    return ((t = Cm(t)), Cm(e) === t);
  }
  function Fe(e, t, l, a, s, i) {
    switch (l) {
      case "children":
        if (typeof a == "string")
          t === "body" || (t === "textarea" && a === "") || da(e, a);
        else if (typeof a == "number" || typeof a == "bigint")
          t !== "body" && da(e, "" + a);
        else return;
        break;
      case "className":
        mi(e, "class", a);
        break;
      case "tabIndex":
        mi(e, "tabindex", a);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        mi(e, l, a);
        break;
      case "style":
        bd(e, a, i);
        return;
      case "data":
        if (t !== "object") {
          mi(e, "data", a);
          break;
        }
      case "src":
      case "href":
        if (a === "" && (t !== "a" || l !== "href")) {
          e.removeAttribute(l);
          break;
        }
        if (
          a == null ||
          typeof a == "function" ||
          typeof a == "symbol" ||
          typeof a == "boolean"
        ) {
          e.removeAttribute(l);
          break;
        }
        ((a = pi(a)), e.setAttribute(l, a));
        break;
      case "action":
      case "formAction":
        if (typeof a == "function") {
          e.setAttribute(
            l,
            "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')",
          );
          break;
        } else
          typeof i == "function" &&
            (l === "formAction"
              ? (t !== "input" && Fe(e, t, "name", s.name, s, null),
                Fe(e, t, "formEncType", s.formEncType, s, null),
                Fe(e, t, "formMethod", s.formMethod, s, null),
                Fe(e, t, "formTarget", s.formTarget, s, null))
              : (Fe(e, t, "encType", s.encType, s, null),
                Fe(e, t, "method", s.method, s, null),
                Fe(e, t, "target", s.target, s, null)));
        if (a == null || typeof a == "symbol" || typeof a == "boolean") {
          e.removeAttribute(l);
          break;
        }
        ((a = pi(a)), e.setAttribute(l, a));
        break;
      case "onClick":
        a != null && (e.onclick = jl);
        return;
      case "onScroll":
        a != null && Ke("scroll", e);
        return;
      case "onScrollEnd":
        a != null && Ke("scrollend", e);
        return;
      case "dangerouslySetInnerHTML":
        if (a != null) {
          if (typeof a != "object" || !("__html" in a)) throw Error(r(61));
          if (((l = a.__html), l != null)) {
            if (s.children != null) throw Error(r(60));
            i?.__html !== l && (e.innerHTML = l);
          }
        }
        break;
      case "multiple":
        e.multiple = a && typeof a != "function" && typeof a != "symbol";
        break;
      case "muted":
        e.muted = a && typeof a != "function" && typeof a != "symbol";
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "defaultValue":
      case "defaultChecked":
      case "innerHTML":
      case "ref":
        break;
      case "autoFocus":
        break;
      case "xlinkHref":
        if (
          a == null ||
          typeof a == "function" ||
          typeof a == "boolean" ||
          typeof a == "symbol"
        ) {
          e.removeAttribute("xlink:href");
          break;
        }
        ((l = pi(a)),
          e.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", l));
        break;
      case "contentEditable":
      case "spellCheck":
      case "draggable":
      case "value":
      case "autoReverse":
      case "externalResourcesRequired":
      case "focusable":
      case "preserveAlpha":
        a != null && typeof a != "function" && typeof a != "symbol"
          ? e.setAttribute(l, a)
          : e.removeAttribute(l);
        break;
      case "inert":
      case "allowFullScreen":
      case "async":
      case "autoPlay":
      case "controls":
      case "credentialless":
      case "default":
      case "defer":
      case "disabled":
      case "disablePictureInPicture":
      case "disableRemotePlayback":
      case "formNoValidate":
      case "hidden":
      case "loop":
      case "noModule":
      case "noValidate":
      case "open":
      case "playsInline":
      case "readOnly":
      case "required":
      case "reversed":
      case "scoped":
      case "seamless":
      case "itemScope":
        a && typeof a != "function" && typeof a != "symbol"
          ? e.setAttribute(l, "")
          : e.removeAttribute(l);
        break;
      case "capture":
      case "download":
        a === !0
          ? e.setAttribute(l, "")
          : a !== !1 &&
              a != null &&
              typeof a != "function" &&
              typeof a != "symbol"
            ? e.setAttribute(l, a)
            : e.removeAttribute(l);
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        a != null &&
        typeof a != "function" &&
        typeof a != "symbol" &&
        !isNaN(a) &&
        1 <= a
          ? e.setAttribute(l, a)
          : e.removeAttribute(l);
        break;
      case "rowSpan":
      case "start":
        a == null || typeof a == "function" || typeof a == "symbol" || isNaN(a)
          ? e.removeAttribute(l)
          : e.setAttribute(l, a);
        break;
      case "popover":
        (Ke("beforetoggle", e), Ke("toggle", e), hi(e, "popover", a));
        break;
      case "xlinkActuate":
        zl(e, "http://www.w3.org/1999/xlink", "xlink:actuate", a);
        break;
      case "xlinkArcrole":
        zl(e, "http://www.w3.org/1999/xlink", "xlink:arcrole", a);
        break;
      case "xlinkRole":
        zl(e, "http://www.w3.org/1999/xlink", "xlink:role", a);
        break;
      case "xlinkShow":
        zl(e, "http://www.w3.org/1999/xlink", "xlink:show", a);
        break;
      case "xlinkTitle":
        zl(e, "http://www.w3.org/1999/xlink", "xlink:title", a);
        break;
      case "xlinkType":
        zl(e, "http://www.w3.org/1999/xlink", "xlink:type", a);
        break;
      case "xmlBase":
        zl(e, "http://www.w3.org/XML/1998/namespace", "xml:base", a);
        break;
      case "xmlLang":
        zl(e, "http://www.w3.org/XML/1998/namespace", "xml:lang", a);
        break;
      case "xmlSpace":
        zl(e, "http://www.w3.org/XML/1998/namespace", "xml:space", a);
        break;
      case "is":
        hi(e, "is", a);
        break;
      case "innerText":
      case "textContent":
        return;
      default:
        if (
          !(2 < l.length) ||
          (l[0] !== "o" && l[0] !== "O") ||
          (l[1] !== "n" && l[1] !== "N")
        )
          ((l = dv.get(l) || l), hi(e, l, a));
        else return;
    }
    Qe = !0;
  }
  function Wr(e, t, l, a, s, i) {
    switch (l) {
      case "style":
        bd(e, a, i);
        return;
      case "dangerouslySetInnerHTML":
        if (a != null) {
          if (typeof a != "object" || !("__html" in a)) throw Error(r(61));
          if (((l = a.__html), l != null)) {
            if (s.children != null) throw Error(r(60));
            i?.__html !== l && (e.innerHTML = l);
          }
        }
        break;
      case "children":
        if (typeof a == "string") da(e, a);
        else if (typeof a == "number" || typeof a == "bigint") da(e, "" + a);
        else return;
        break;
      case "onScroll":
        a != null && Ke("scroll", e);
        return;
      case "onScrollEnd":
        a != null && Ke("scrollend", e);
        return;
      case "onClick":
        a != null && (e.onclick = jl);
        return;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "innerHTML":
      case "ref":
        return;
      case "innerText":
      case "textContent":
        return;
      default:
        if (!dd.hasOwnProperty(l))
          e: {
            if (
              l[0] === "o" &&
              l[1] === "n" &&
              ((s = l.endsWith("Capture")),
              (i = l.slice(2, s ? l.length - 7 : void 0)),
              (t = e[Kt] || null),
              (t = t != null ? t[l] : null),
              typeof t == "function" && e.removeEventListener(i, t, s),
              typeof a == "function")
            ) {
              (typeof t != "function" &&
                t !== null &&
                (l in e
                  ? (e[l] = null)
                  : e.hasAttribute(l) && e.removeAttribute(l)),
                e.addEventListener(i, a, s));
              break e;
            }
            ((Qe = !0),
              l in e
                ? (e[l] = a)
                : a === !0
                  ? e.setAttribute(l, "")
                  : hi(e, l, a));
          }
        return;
    }
    Qe = !0;
  }
  function _t(e, t, l) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "img":
        (Ke("error", e), Ke("load", e));
        var a = !1,
          s = !1,
          i;
        for (i in l)
          if (l.hasOwnProperty(i)) {
            var u = l[i];
            if (u != null)
              switch (i) {
                case "src":
                  a = !0;
                  break;
                case "srcSet":
                  s = !0;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(r(137, t));
                default:
                  Fe(e, t, i, u, l, null);
              }
          }
        (s && Fe(e, t, "srcSet", l.srcSet, l, null),
          a && Fe(e, t, "src", l.src, l, null));
        return;
      case "input":
        Ke("invalid", e);
        var o = (i = u = s = null),
          x = null,
          w = null;
        for (a in l)
          if (l.hasOwnProperty(a)) {
            var q = l[a];
            if (q != null)
              switch (a) {
                case "name":
                  s = q;
                  break;
                case "type":
                  u = q;
                  break;
                case "checked":
                  x = q;
                  break;
                case "defaultChecked":
                  w = q;
                  break;
                case "value":
                  i = q;
                  break;
                case "defaultValue":
                  o = q;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  if (q != null) throw Error(r(137, t));
                  break;
                default:
                  Fe(e, t, a, q, l, null);
              }
          }
        xd(e, i, o, x, w, u, s, !1);
        return;
      case "select":
        (Ke("invalid", e), (a = u = i = null));
        for (s in l)
          if (l.hasOwnProperty(s) && ((o = l[s]), o != null))
            switch (s) {
              case "value":
                i = o;
                break;
              case "defaultValue":
                u = o;
                break;
              case "multiple":
                a = o;
              default:
                Fe(e, t, s, o, l, null);
            }
        ((t = i),
          (l = u),
          (e.multiple = !!a),
          t != null ? oa(e, !!a, t, !1) : l != null && oa(e, !!a, l, !0));
        return;
      case "textarea":
        (Ke("invalid", e), (i = s = a = null));
        for (u in l)
          if (l.hasOwnProperty(u) && ((o = l[u]), o != null))
            switch (u) {
              case "value":
                a = o;
                break;
              case "defaultValue":
                s = o;
                break;
              case "children":
                i = o;
                break;
              case "dangerouslySetInnerHTML":
                if (o != null) throw Error(r(91));
                break;
              default:
                Fe(e, t, u, o, l, null);
            }
        gd(e, a, s, i);
        return;
      case "option":
        for (x in l)
          l.hasOwnProperty(x) &&
            ((a = l[x]), a != null) &&
            (x === "selected"
              ? (e.selected =
                  a && typeof a != "function" && typeof a != "symbol")
              : Fe(e, t, x, a, l, null));
        return;
      case "dialog":
        (Ke("beforetoggle", e),
          Ke("toggle", e),
          Ke("cancel", e),
          Ke("close", e));
        break;
      case "iframe":
      case "object":
        Ke("load", e);
        break;
      case "video":
      case "audio":
        for (a = 0; a < Us.length; a++) Ke(Us[a], e);
        break;
      case "image":
        (Ke("error", e), Ke("load", e));
        break;
      case "details":
        Ke("toggle", e);
        break;
      case "embed":
      case "source":
      case "link":
        (Ke("error", e), Ke("load", e));
      case "area":
      case "base":
      case "br":
      case "col":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "track":
      case "wbr":
      case "menuitem":
        for (w in l)
          if (l.hasOwnProperty(w) && ((a = l[w]), a != null))
            switch (w) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(r(137, t));
              default:
                Fe(e, t, w, a, l, null);
            }
        return;
      default:
        if (eu(t)) {
          for (q in l)
            l.hasOwnProperty(q) &&
              ((a = l[q]), a !== void 0 && Wr(e, t, q, a, l, void 0));
          return;
        }
    }
    for (o in l)
      l.hasOwnProperty(o) && ((a = l[o]), a != null && Fe(e, t, o, a, l, null));
  }
  var Zx = {};
  function Jx(e, t, l, a) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "input":
        var s = null,
          i = null,
          u = null,
          o = null,
          x = null,
          w = null,
          q = null;
        for (z in l) {
          var X = l[z];
          if (l.hasOwnProperty(z) && X != null)
            switch (z) {
              case "checked":
                break;
              case "value":
                break;
              case "defaultValue":
                x = X;
              default:
                a.hasOwnProperty(z) || Fe(e, t, z, null, a, X);
            }
        }
        for (var T in a) {
          var z = a[T];
          if (((X = l[T]), a.hasOwnProperty(T) && (z != null || X != null)))
            switch (T) {
              case "type":
                (z !== X && (Qe = !0), (i = z));
                break;
              case "name":
                (z !== X && (Qe = !0), (s = z));
                break;
              case "checked":
                (z !== X && (Qe = !0), (w = z));
                break;
              case "defaultChecked":
                (z !== X && (Qe = !0), (q = z));
                break;
              case "value":
                (z !== X && (Qe = !0), (u = z));
                break;
              case "defaultValue":
                (z !== X && (Qe = !0), (o = z));
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                if (z != null) throw Error(r(137, t));
                break;
              default:
                z !== X && Fe(e, t, T, z, a, X);
            }
        }
        Wc(e, u, o, x, w, q, i, s);
        return;
      case "select":
        z = u = o = T = null;
        for (i in l)
          if (((x = l[i]), l.hasOwnProperty(i) && x != null))
            switch (i) {
              case "value":
                break;
              case "multiple":
                z = x;
              default:
                a.hasOwnProperty(i) || Fe(e, t, i, null, a, x);
            }
        for (s in a)
          if (
            ((i = a[s]),
            (x = l[s]),
            a.hasOwnProperty(s) && (i != null || x != null))
          )
            switch (s) {
              case "value":
                (i !== x && (Qe = !0), (T = i));
                break;
              case "defaultValue":
                (i !== x && (Qe = !0), (o = i));
                break;
              case "multiple":
                (i !== x && (Qe = !0), (u = i));
              default:
                i !== x && Fe(e, t, s, i, a, x);
            }
        ((t = o),
          (l = u),
          (a = z),
          T != null
            ? oa(e, !!l, T, !1)
            : !!a != !!l &&
              (t != null ? oa(e, !!l, t, !0) : oa(e, !!l, l ? [] : "", !1)));
        return;
      case "textarea":
        z = T = null;
        for (o in l)
          if (
            ((s = l[o]),
            l.hasOwnProperty(o) && s != null && !a.hasOwnProperty(o))
          )
            switch (o) {
              case "value":
                break;
              case "children":
                break;
              default:
                Fe(e, t, o, null, a, s);
            }
        for (u in a)
          if (
            ((s = a[u]),
            (i = l[u]),
            a.hasOwnProperty(u) && (s != null || i != null))
          )
            switch (u) {
              case "value":
                (s !== i && (Qe = !0), (T = s));
                break;
              case "defaultValue":
                (s !== i && (Qe = !0), (z = s));
                break;
              case "children":
                break;
              case "dangerouslySetInnerHTML":
                if (s != null) throw Error(r(91));
                break;
              default:
                s !== i && Fe(e, t, u, s, a, i);
            }
        yd(e, T, z);
        return;
      case "option":
        for (var me in l)
          ((T = l[me]),
            l.hasOwnProperty(me) &&
              T != null &&
              !a.hasOwnProperty(me) &&
              (me === "selected"
                ? (e.selected = !1)
                : Fe(e, t, me, null, a, T)));
        for (x in a)
          ((T = a[x]),
            (z = l[x]),
            a.hasOwnProperty(x) &&
              T !== z &&
              (T != null || z != null) &&
              (x === "selected"
                ? (T !== z && (Qe = !0),
                  (e.selected =
                    T && typeof T != "function" && typeof T != "symbol"))
                : Fe(e, t, x, T, a, z)));
        return;
      case "img":
      case "link":
      case "area":
      case "base":
      case "br":
      case "col":
      case "embed":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "source":
      case "track":
      case "wbr":
      case "menuitem":
        for (var be in l)
          ((T = l[be]),
            l.hasOwnProperty(be) &&
              T != null &&
              !a.hasOwnProperty(be) &&
              Fe(e, t, be, null, a, T));
        for (w in a)
          if (
            ((T = a[w]),
            (z = l[w]),
            a.hasOwnProperty(w) && T !== z && (T != null || z != null))
          )
            switch (w) {
              case "children":
              case "dangerouslySetInnerHTML":
                if (T != null) throw Error(r(137, t));
                break;
              default:
                Fe(e, t, w, T, a, z);
            }
        return;
      default:
        if (eu(t)) {
          for (var Me in l)
            ((T = l[Me]),
              l.hasOwnProperty(Me) &&
                T !== void 0 &&
                !a.hasOwnProperty(Me) &&
                Wr(e, t, Me, void 0, a, T));
          for (q in a)
            ((T = a[q]),
              (z = l[q]),
              !a.hasOwnProperty(q) ||
                T === z ||
                (T === void 0 && z === void 0) ||
                Wr(e, t, q, T, a, z));
          return;
        }
    }
    for (var C in l)
      ((T = l[C]),
        l.hasOwnProperty(C) &&
          T != null &&
          !a.hasOwnProperty(C) &&
          Fe(e, t, C, null, a, T));
    for (X in a)
      ((T = a[X]),
        (z = l[X]),
        !a.hasOwnProperty(X) ||
          T === z ||
          (T == null && z == null) ||
          Fe(e, t, X, T, a, z));
  }
  function _m(e) {
    switch (e) {
      case "css":
      case "script":
      case "font":
      case "img":
      case "image":
      case "input":
      case "link":
        return !0;
      default:
        return !1;
    }
  }
  function Ix() {
    if (typeof performance.getEntriesByType == "function") {
      for (
        var e = 0, t = 0, l = performance.getEntriesByType("resource"), a = 0;
        a < l.length;
        a++
      ) {
        var s = l[a],
          i = s.transferSize,
          u = s.initiatorType,
          o = s.duration;
        if (i && o && _m(u)) {
          for (u = 0, o = s.responseEnd, a += 1; a < l.length; a++) {
            var x = l[a],
              w = x.startTime;
            if (w > o) break;
            var q = x.transferSize,
              X = x.initiatorType;
            q &&
              _m(X) &&
              ((x = x.responseEnd), (u += q * (x < o ? 1 : (o - w) / (x - w))));
          }
          if ((--a, (t += (8 * (i + u)) / (s.duration / 1e3)), e++, 10 < e))
            break;
        }
      }
      if (0 < e) return t / e / 1e6;
    }
    return navigator.connection &&
      ((e = navigator.connection.downlink), typeof e == "number")
      ? e
      : 5;
  }
  var Pr = null,
    eo = null;
  function qs(e) {
    return e.nodeType === 9 ? e : e.ownerDocument;
  }
  function Am(e) {
    switch (e) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function Rm(e, t) {
    if (e === 0)
      switch (t) {
        case "svg":
          return 1;
        case "math":
          return 2;
        default:
          return 0;
      }
    return e === 1 && t === "foreignObject" ? 0 : e;
  }
  function Dm(e, t, l, a) {
    return (
      (l = qs(l).createElement(e)),
      (l[St] = a),
      (l[Kt] = t),
      _t(l, e, t),
      xt(l),
      l
    );
  }
  function to(e, t) {
    return (
      e === "textarea" ||
      e === "noscript" ||
      typeof t.children == "string" ||
      typeof t.children == "number" ||
      typeof t.children == "bigint" ||
      (typeof t.dangerouslySetInnerHTML == "object" &&
        t.dangerouslySetInnerHTML !== null &&
        t.dangerouslySetInnerHTML.__html != null)
    );
  }
  var lo = null;
  function $x() {
    var e = window.event;
    return e && e.type === "popstate"
      ? e === lo
        ? !1
        : ((lo = e), !0)
      : ((lo = null), !1);
  }
  var no = typeof setTimeout == "function" ? setTimeout : void 0,
    Fx = typeof clearTimeout == "function" ? clearTimeout : void 0,
    Om = typeof Promise == "function" ? Promise : void 0,
    zm =
      typeof requestAnimationFrame == "function" ? requestAnimationFrame : no,
    Wx =
      typeof queueMicrotask == "function"
        ? queueMicrotask
        : typeof Om < "u"
          ? function (e) {
              return Om.resolve(null).then(e).catch(Px);
            }
          : no;
  function Px(e) {
    setTimeout(function () {
      throw e;
    });
  }
  function jn(e) {
    return e === "head";
  }
  function Um(e, t) {
    var l = t,
      a = 0;
    do {
      var s = l.nextSibling;
      if ((e.removeChild(l), s && s.nodeType === 8))
        if (((l = s.data), l === "/$" || l === "/&")) {
          if (a === 0) {
            (e.removeChild(s), Ja(t));
            return;
          }
          a--;
        } else if (
          l === "$" ||
          l === "$?" ||
          l === "$~" ||
          l === "$!" ||
          l === "&"
        )
          a++;
        else if (l === "html") fo(e.ownerDocument.documentElement);
        else if (l === "head") {
          ((l = e.ownerDocument.head), fo(l));
          for (var i = l.firstChild; i; ) {
            var u = i.nextSibling,
              o = i.nodeName;
            (i[es] ||
              o === "SCRIPT" ||
              o === "STYLE" ||
              (o === "LINK" && i.rel.toLowerCase() === "stylesheet") ||
              l.removeChild(i),
              (i = u));
          }
        } else l === "body" && fo(e.ownerDocument.body);
      l = s;
    } while (l);
    Ja(t);
  }
  function Mm(e, t) {
    var l = e;
    e = 0;
    do {
      var a = l.nextSibling;
      if (
        (l.nodeType === 1
          ? t
            ? ((l._stashedDisplay = l.style.display),
              (l.style.display = "none"))
            : ((l.style.display = l._stashedDisplay || ""),
              l.getAttribute("style") === "" && l.removeAttribute("style"))
          : l.nodeType === 3 &&
            (t
              ? ((l._stashedText = l.nodeValue), (l.nodeValue = ""))
              : (l.nodeValue = l._stashedText || "")),
        a && a.nodeType === 8)
      )
        if (((l = a.data), l === "/$")) {
          if (e === 0) break;
          e--;
        } else (l !== "$" && l !== "$?" && l !== "$~" && l !== "$!") || e++;
      l = a;
    } while (l);
  }
  function qm(e, t, l) {
    if (
      ((t = CSS.escape(t) !== t ? "r-" + btoa(t).replace(/=/g, "") : t),
      (e.style.viewTransitionName = t),
      l != null && (e.style.viewTransitionClass = l),
      (l = getComputedStyle(e)),
      l.display === "inline")
    ) {
      if (((t = e.getClientRects()), t.length === 1)) var a = 1;
      else
        for (var s = (a = 0); s < t.length; s++) {
          var i = t[s];
          0 < i.width && 0 < i.height && a++;
        }
      a === 1 &&
        ((e = e.style),
        (e.display = t.length === 1 ? "inline-block" : "block"),
        (e.marginTop = "-" + l.paddingTop),
        (e.marginBottom = "-" + l.paddingBottom));
    }
  }
  function Hm(e, t) {
    ((e = e.style), (t = t.style));
    var l =
      t != null
        ? t.hasOwnProperty("viewTransitionName")
          ? t.viewTransitionName
          : t.hasOwnProperty("view-transition-name")
            ? t["view-transition-name"]
            : null
        : null;
    ((e.viewTransitionName =
      l == null || typeof l == "boolean" ? "" : ("" + l).trim()),
      (l =
        t != null
          ? t.hasOwnProperty("viewTransitionClass")
            ? t.viewTransitionClass
            : t.hasOwnProperty("view-transition-class")
              ? t["view-transition-class"]
              : null
          : null),
      (e.viewTransitionClass =
        l == null || typeof l == "boolean" ? "" : ("" + l).trim()),
      e.display === "inline-block" &&
        (t == null
          ? (e.display = e.margin = "")
          : ((l = t.display),
            (e.display = l == null || typeof l == "boolean" ? "" : l),
            (l = t.margin),
            l != null
              ? (e.margin = l)
              : ((l = t.hasOwnProperty("marginTop")
                  ? t.marginTop
                  : t["margin-top"]),
                (e.marginTop = l == null || typeof l == "boolean" ? "" : l),
                (t = t.hasOwnProperty("marginBottom")
                  ? t.marginBottom
                  : t["margin-bottom"]),
                (e.marginBottom =
                  t == null || typeof t == "boolean" ? "" : t)))));
  }
  function ey(e, t, l) {
    return (
      (l = l.ownerDocument.defaultView),
      {
        rect: e,
        abs: t.position === "absolute" || t.position === "fixed",
        clip:
          t.clipPath !== "none" ||
          t.overflow !== "visible" ||
          t.filter !== "none" ||
          t.mask !== "none" ||
          t.mask !== "none" ||
          t.borderRadius !== "0px",
        view:
          0 <= e.bottom &&
          0 <= e.right &&
          e.top <= l.innerHeight &&
          e.left <= l.innerWidth,
      }
    );
  }
  function ao(e) {
    var t = e.getBoundingClientRect(),
      l = getComputedStyle(e);
    return ey(t, l, e);
  }
  function ty(e) {
    return e.documentElement.clientHeight;
  }
  function ly(e) {
    (this.addEventListener("load", e), this.addEventListener("error", e));
  }
  function ny(e, t, l, a, s, i, u, o, x) {
    var w = t.nodeType === 9 ? t : t.ownerDocument;
    try {
      var q = w.startViewTransition({
        update: function () {
          var T = w.defaultView,
            z = T.navigation && T.navigation.transition,
            me = w.fonts.status;
          a();
          var be = [];
          if (
            (me === "loaded" &&
              (ty(w), w.fonts.status === "loading" && be.push(w.fonts.ready)),
            (me = be.length),
            e !== null)
          )
            for (var Me = e.suspenseyImages, C = 0, N = 0; N < Me.length; N++) {
              var A = Me[N];
              if (!A.complete) {
                var Q = A.getBoundingClientRect();
                if (
                  0 < Q.bottom &&
                  0 < Q.right &&
                  Q.top < T.innerHeight &&
                  Q.left < T.innerWidth
                ) {
                  if (((C += ap(A)), C > Tc)) {
                    be.length = me;
                    break;
                  }
                  ((A = new Promise(ly.bind(A))), be.push(A));
                }
              }
            }
          if (0 < be.length)
            return (
              (T = Promise.race([
                Promise.all(be),
                new Promise(function (ge) {
                  return setTimeout(ge, 500);
                }),
              ]).then(s, s)),
              (z ? Promise.allSettled([z.finished, T]) : T).then(i, i)
            );
          if ((s(), z)) return z.finished.then(i, i);
          i();
        },
        types: l,
      });
      w.__reactViewTransition = q;
      var X = [];
      return (
        q.ready.then(
          function () {
            for (
              var T = w.documentElement.getAnimations({ subtree: !0 }), z = 0;
              z < T.length;
              z++
            ) {
              var me = T[z],
                be = me.effect,
                Me = be.pseudoElement;
              if (Me != null && Me.startsWith("::view-transition")) {
                (X.push(me), (me = be.getKeyframes()));
                for (var C = (Me = void 0), N = !0, A = 0; A < me.length; A++) {
                  var Q = me[A],
                    ge = Q.width;
                  if (Me === void 0) Me = ge;
                  else if (Me !== ge) {
                    N = !1;
                    break;
                  }
                  if (((ge = Q.height), C === void 0)) C = ge;
                  else if (C !== ge) {
                    N = !1;
                    break;
                  }
                  (delete Q.width,
                    delete Q.height,
                    Q.transform === "none" && delete Q.transform);
                }
                N &&
                  Me !== void 0 &&
                  C !== void 0 &&
                  (be.setKeyframes(me),
                  (N = getComputedStyle(be.target, be.pseudoElement)),
                  N.width !== Me || N.height !== C) &&
                  ((N = me[0]),
                  (N.width = Me),
                  (N.height = C),
                  (N = me[me.length - 1]),
                  (N.width = Me),
                  (N.height = C),
                  be.setKeyframes(me));
              }
            }
            u();
          },
          function (T) {
            w.__reactViewTransition === q && (w.__reactViewTransition = null);
            try {
              (typeof T == "object" &&
                T !== null &&
                T.name === "InvalidStateError" &&
                (T.message ===
                  "View transition was skipped because document visibility state is hidden." ||
                  T.message ===
                    "Skipping view transition because document visibility state has become hidden." ||
                  T.message ===
                    "Skipping view transition because viewport size changed." ||
                  T.message ===
                    "Transition was aborted because of invalid state") &&
                (T = null),
                T !== null && x(T));
            } finally {
              (a(), s(), u());
            }
          },
        ),
        q.finished.finally(function () {
          for (var T = 0; T < X.length; T++) X[T].cancel();
          (w.__reactViewTransition === q && (w.__reactViewTransition = null),
            o());
        }),
        q
      );
    } catch {
      return (a(), s(), u(), null);
    }
  }
  function Pn(e, t) {
    ((this._scope = document.documentElement),
      (this._selector = "::view-transition-" + e + "(" + t + ")"));
  }
  ((Pn.prototype.animate = function (e, t) {
    return (
      (t = typeof t == "number" ? { duration: t } : G({}, t)),
      (t.pseudoElement = this._selector),
      this._scope.animate(e, t)
    );
  }),
    (Pn.prototype.getAnimations = function () {
      for (
        var e = this._scope,
          t = this._selector,
          l = e.getAnimations({ subtree: !0 }),
          a = [],
          s = 0;
        s < l.length;
        s++
      ) {
        var i = l[s].effect;
        i !== null && i.target === e && i.pseudoElement === t && a.push(l[s]);
      }
      return a;
    }),
    (Pn.prototype.getComputedStyle = function () {
      return getComputedStyle(this._scope, this._selector);
    }));
  function Km(e) {
    return {
      name: e,
      group: new Pn("group", e),
      imagePair: new Pn("image-pair", e),
      old: new Pn("old", e),
      new: new Pn("new", e),
    };
  }
  function Pt(e) {
    ((this._fragmentFiber = e),
      (this._observers = this._eventListeners = null));
  }
  Pt.prototype.addEventListener = function (e, t, l) {
    var a = null,
      s = null;
    if (
      !(
        l != null &&
        typeof l != "boolean" &&
        ((a = l.signal || null), a !== null && a.aborted)
      )
    ) {
      this._eventListeners === null && (this._eventListeners = []);
      var i = this._eventListeners;
      if (Bm(i, e, t, l) === -1) {
        var u = this,
          o = t;
        (l != null &&
          typeof l != "boolean" &&
          l.once === !0 &&
          (o = function (x) {
            (u.removeEventListener(e, t, l),
              typeof t == "function" ? t.call(this, x) : t.handleEvent(x));
          }),
          a !== null &&
            ((s = u.removeEventListener.bind(u, e, t, l)),
            a.addEventListener("abort", s, { once: !0 }),
            (s = a.removeEventListener.bind(a, "abort", s))),
          (a = Ya(l)),
          i.push({
            type: e,
            listener: t,
            optionsOrUseCapture: l,
            attachedListener: o,
            cleanup: s,
          }),
          y(this._fragmentFiber.child, !1, ay, e, o, a));
      }
      this._eventListeners = i;
    }
  };
  function ay(e, t, l, a) {
    return (R(e).addEventListener(t, l, a), !1);
  }
  Pt.prototype.removeEventListener = function (e, t, l) {
    var a = this._eventListeners;
    if (a !== null && ((t = Bm(a, e, t, l)), t !== -1)) {
      var s = a[t];
      l = s.attachedListener;
      var i = s.cleanup;
      ((s = Ya(s.optionsOrUseCapture)),
        y(this._fragmentFiber.child, !1, sy, e, l, s),
        a.splice(t, 1),
        i !== null && i());
    }
  };
  function sy(e, t, l, a) {
    return (R(e).removeEventListener(t, l, a), !1);
  }
  function Ya(e) {
    return e != null &&
      typeof e != "boolean" &&
      (e.once === !0 || e.signal instanceof AbortSignal)
      ? { capture: e.capture, passive: e.passive }
      : e;
  }
  function Lm(e) {
    return e == null
      ? "c=0"
      : typeof e == "boolean"
        ? "c=" + (e ? "1" : "0")
        : "c=" + (e.capture ? "1" : "0");
  }
  function Bm(e, t, l, a) {
    if (e.length === 0) return -1;
    a = Lm(a);
    for (var s = 0; s < e.length; s++) {
      var i = e[s];
      if (i.type === t && i.listener === l && Lm(i.optionsOrUseCapture) === a)
        return s;
    }
    return -1;
  }
  ((Pt.prototype.dispatchEvent = function (e) {
    var t = L(this._fragmentFiber);
    if (t === null) return !0;
    t = R(t);
    var l = this._eventListeners;
    if ((l !== null && 0 < l.length) || !e.bubbles) {
      var a =
        t.nodeType === 9 ? t.createComment("") : document.createTextNode("");
      if (l)
        for (var s = 0; s < l.length; s++) {
          var i = l[s];
          a.addEventListener(
            i.type,
            i.attachedListener,
            Ya(i.optionsOrUseCapture),
          );
        }
      if ((t.appendChild(a), (e = a.dispatchEvent(e)), l))
        for (s = 0; s < l.length; s++)
          ((i = l[s]),
            a.removeEventListener(
              i.type,
              i.attachedListener,
              Ya(i.optionsOrUseCapture),
            ));
      return (t.removeChild(a), e);
    }
    return t.dispatchEvent(e);
  }),
    (Pt.prototype.focus = function (e) {
      y(this._fragmentFiber.child, !0, km, e, void 0, void 0);
    }));
  function km(e, t) {
    return e.tag === 6 ? !1 : ((e = R(e)), xy(e, t));
  }
  Pt.prototype.focusLast = function (e) {
    var t = [];
    y(this._fragmentFiber.child, !0, so, t, void 0, void 0);
    for (var l = t.length - 1; 0 <= l && !km(t[l], e); l--);
  };
  function so(e, t) {
    return (t.push(e), !1);
  }
  Pt.prototype.blur = function () {
    var e = L(this._fragmentFiber);
    e !== null &&
      ((e = R(e)),
      (e = qs(e).activeElement),
      e !== null && y(this._fragmentFiber.child, !1, iy, e, void 0, void 0));
  };
  function iy(e, t) {
    return e.tag === 6
      ? !1
      : ((e = R(e)), e === t || e.contains(t) ? (t.blur(), !0) : !1);
  }
  Pt.prototype.observeUsing = function (e) {
    (this._observers === null && (this._observers = new Set()),
      this._observers.add(e),
      y(this._fragmentFiber.child, !1, cy, e, void 0, void 0));
  };
  function cy(e, t) {
    return (e.tag === 6 || ((e = R(e)), t.observe(e)), !1);
  }
  Pt.prototype.unobserveUsing = function (e) {
    var t = this._observers;
    if (t !== null && t.has(e)) {
      (t.delete(e), y(this._fragmentFiber.child, !1, uy, e, void 0, void 0));
      for (var l = (t = 0); l < yl.length; l++) {
        var a = yl[l];
        a.fragmentInstance === this && a.observer === e
          ? e.unobserve(a.instance)
          : (yl[t++] = a);
      }
      yl.length = t;
    }
  };
  function uy(e, t) {
    return (e.tag === 6 || ((e = R(e)), t.unobserve(e)), !1);
  }
  var yl = [],
    io = !1;
  function ry(e, t, l) {
    (yl.push({ fragmentInstance: e, observer: t, instance: l }),
      io ||
        ((io = !0),
        yy(function () {
          io = !1;
          var a = yl;
          yl = [];
          for (var s = 0; s < a.length; s++) {
            var i = a[s];
            i.observer.unobserve(i.instance);
          }
        })));
  }
  Pt.prototype.getClientRects = function () {
    var e = [];
    return (y(this._fragmentFiber.child, !1, oy, e, void 0, void 0), e);
  };
  function oy(e, t) {
    if (e.tag === 6) {
      e = e.stateNode;
      var l = e.ownerDocument.createRange();
      (l.selectNodeContents(e), t.push.apply(t, l.getClientRects()));
    } else ((e = R(e)), t.push.apply(t, e.getClientRects()));
    return !1;
  }
  ((Pt.prototype.getRootNode = function (e) {
    var t = L(this._fragmentFiber);
    return t === null ? this : R(t).getRootNode(e);
  }),
    (Pt.prototype.compareDocumentPosition = function (e) {
      var t = L(this._fragmentFiber);
      if (t === null) return Node.DOCUMENT_POSITION_DISCONNECTED;
      var l = [];
      y(this._fragmentFiber.child, !1, so, l, void 0, void 0);
      var a = R(t);
      if (l.length === 0) {
        if (((l = a), M(this._fragmentFiber))) {
          e: {
            for (t = this._fragmentFiber.return; t !== null; ) {
              if (t.tag === 4) {
                t = t.stateNode.containerInfo;
                break e;
              }
              if (t.tag === 3 || t.tag === 5 || t.tag === 27) break;
              t = t.return;
            }
            t = null;
          }
          t != null && (l = t);
        }
        t = this._fragmentFiber;
        var s = (a = l.compareDocumentPosition(e));
        return (
          l === e
            ? (s = Node.DOCUMENT_POSITION_CONTAINS)
            : a & Node.DOCUMENT_POSITION_CONTAINED_BY &&
              ((l = ee(t)[1]),
              l === null
                ? (s = Node.DOCUMENT_POSITION_PRECEDING)
                : ((e = R(l).compareDocumentPosition(e)),
                  (s =
                    e === 0 || e & Node.DOCUMENT_POSITION_FOLLOWING
                      ? Node.DOCUMENT_POSITION_FOLLOWING
                      : Node.DOCUMENT_POSITION_PRECEDING))),
          (s |= Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC)
        );
      }
      ((t = R(l[0])), (s = R(l[l.length - 1])));
      var i = M(this._fragmentFiber) ? t.parentElement : a;
      if (i == null) return Node.DOCUMENT_POSITION_DISCONNECTED;
      ((a = i.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_CONTAINED_BY),
        (i =
          i.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_CONTAINED_BY));
      var u = t.compareDocumentPosition(e),
        o = s.compareDocumentPosition(e),
        x =
          u & Node.DOCUMENT_POSITION_CONTAINED_BY ||
          o & Node.DOCUMENT_POSITION_CONTAINED_BY;
      return (
        (o =
          a &&
          i &&
          u & Node.DOCUMENT_POSITION_FOLLOWING &&
          o & Node.DOCUMENT_POSITION_PRECEDING),
        (t =
          (a && t === e) || (i && s === e) || x || o
            ? Node.DOCUMENT_POSITION_CONTAINED_BY
            : (!a && t === e) || (!i && s === e)
              ? Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC
              : u),
        t & Node.DOCUMENT_POSITION_DISCONNECTED ||
        t & Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC ||
        dy(t, this._fragmentFiber, l[0], l[l.length - 1], e)
          ? t
          : Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC
      );
    }));
  function dy(e, t, l, a, s) {
    var i = On(s);
    if (e & Node.DOCUMENT_POSITION_CONTAINED_BY) {
      if ((l = !!i))
        e: {
          for (; i !== null; ) {
            if (i.tag === 7 && (i === t || i.alternate === t)) {
              l = !0;
              break e;
            }
            i = i.return;
          }
          l = !1;
        }
      return l;
    }
    if (e & Node.DOCUMENT_POSITION_CONTAINS) {
      if (i === null)
        return (
          (i = s.ownerDocument),
          s === i || s === i.documentElement || s === i.body
        );
      e: {
        for (i = t, t = L(t); i !== null; ) {
          if (
            !(
              (i.tag !== 5 && i.tag !== 3 && i.tag !== 27) ||
              (i !== t && i.alternate !== t)
            )
          ) {
            i = !0;
            break e;
          }
          i = i.return;
        }
        i = !1;
      }
      return i;
    }
    return e & Node.DOCUMENT_POSITION_PRECEDING
      ? ((t = !!i) &&
          !(t = i === l) &&
          ((t = Z(l, i, k)),
          t === null
            ? (t = !1)
            : (y(t, !0, K, i, l), (i = re), (re = null), (t = i !== null))),
        t)
      : e & Node.DOCUMENT_POSITION_FOLLOWING
        ? ((t = !!i) &&
            !(t = i === a) &&
            ((t = Z(a, i, k)),
            t === null
              ? (t = !1)
              : (y(t, !0, I, i, a),
                (i = re),
                (le = re = null),
                (t = i !== null))),
          t)
        : !1;
  }
  function Ym(e, t) {
    var l = e.ownerDocument.createRange();
    (l.selectNodeContents(e),
      (e = l.getBoundingClientRect()),
      window.scrollTo(
        window.scrollX + e.left,
        t
          ? window.scrollY + e.top
          : window.scrollY + e.bottom - window.innerHeight,
      ));
  }
  Pt.prototype.scrollIntoView = function (e) {
    if (typeof e == "object") throw Error(r(566));
    var t = [];
    y(this._fragmentFiber.child, !1, so, t, void 0, void 0);
    var l = e !== !1;
    if (t.length === 0) {
      var a = ee(this._fragmentFiber);
      if (
        ((a = l ? a[1] || a[0] || L(this._fragmentFiber) : a[0] || a[1]),
        a === null)
      )
        return;
      if (a.tag === 6) {
        ((e = R(a)), Ym(e, l));
        return;
      }
      if (((a = R(a)), a.nodeType !== 9)) {
        if (a.nodeType === 11) {
          ((l = "host" in a ? a.host : null),
            l !== null && l.scrollIntoView(e));
          return;
        }
        a.scrollIntoView(e);
      }
    }
    for (a = l ? t.length - 1 : 0; a !== (l ? -1 : t.length); ) {
      var s = t[a];
      (s.tag === 6 ? ((s = R(s)), Ym(s, l)) : R(s).scrollIntoView(e),
        (a += l ? -1 : 1));
    }
  };
  function fy(e, t) {
    return ((e = R(e)), Vm(e, t), !1);
  }
  function Vm(e, t) {
    (e.reactFragments == null && (e.reactFragments = new Set()),
      e.reactFragments.add(t));
  }
  function Gm(e, t) {
    var l = t._eventListeners;
    if (l !== null)
      for (var a = 0; a < l.length; a++) {
        var s = l[a];
        e.addEventListener(
          s.type,
          s.attachedListener,
          Ya(s.optionsOrUseCapture),
        );
      }
    e.nodeType !== 3 &&
      ((l = t._observers),
      l !== null &&
        l.forEach(function (i) {
          for (var u = 0, o = 0; o < yl.length; o++) {
            var x = yl[o];
            (x.fragmentInstance !== t ||
              x.observer !== i ||
              x.instance !== e) &&
              (yl[u++] = x);
          }
          ((yl.length = u), i.observe(e));
        }),
      Vm(e, t));
  }
  function hy(e, t) {
    var l = t._eventListeners;
    if (l !== null)
      for (var a = 0; a < l.length; a++) {
        var s = l[a];
        e.removeEventListener(
          s.type,
          s.attachedListener,
          Ya(s.optionsOrUseCapture),
        );
      }
    e.nodeType !== 3 &&
      ((l = t._observers),
      l !== null &&
        l.forEach(function (i) {
          typeof i.rootMargin == "string" ? ry(t, i, e) : i.unobserve(e);
        }),
      e.reactFragments != null && e.reactFragments.delete(t));
  }
  function co(e) {
    var t = e.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var l = t;
      switch (((t = t.nextSibling), l.nodeName)) {
        case "HTML":
        case "HEAD":
        case "BODY":
          (co(l), fi(l));
          continue;
        case "SCRIPT":
        case "STYLE":
          continue;
        case "LINK":
          if (l.rel.toLowerCase() === "stylesheet") continue;
      }
      e.removeChild(l);
    }
  }
  function my(e, t, l, a) {
    for (; e.nodeType === 1; ) {
      var s = l;
      if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!a && (e.nodeName !== "INPUT" || e.type !== "hidden")) break;
      } else if (a) {
        if (!e[es])
          switch (t) {
            case "meta":
              if (!e.hasAttribute("itemprop")) break;
              return e;
            case "link":
              if (
                ((i = e.getAttribute("rel")),
                i === "stylesheet" && e.hasAttribute("data-precedence"))
              )
                break;
              if (
                i !== s.rel ||
                e.getAttribute("href") !==
                  (s.href == null || s.href === "" ? null : s.href) ||
                e.getAttribute("crossorigin") !==
                  (s.crossOrigin == null ? null : s.crossOrigin) ||
                e.getAttribute("title") !== (s.title == null ? null : s.title)
              )
                break;
              return e;
            case "style":
              if (e.hasAttribute("data-precedence")) break;
              return e;
            case "script":
              if (
                ((i = e.getAttribute("src")),
                (i !== (s.src == null ? null : s.src) ||
                  e.getAttribute("type") !== (s.type == null ? null : s.type) ||
                  e.getAttribute("crossorigin") !==
                    (s.crossOrigin == null ? null : s.crossOrigin)) &&
                  i &&
                  e.hasAttribute("async") &&
                  !e.hasAttribute("itemprop"))
              )
                break;
              return e;
            default:
              return e;
          }
      } else if (t === "input" && e.type === "hidden") {
        var i = s.name == null ? null : "" + s.name;
        if (s.type === "hidden" && e.getAttribute("name") === i) return e;
      } else return e;
      if (((e = ul(e.nextSibling)), e === null)) break;
    }
    return null;
  }
  function py(e, t, l) {
    if (t === "") return null;
    for (; e.nodeType !== 3; )
      if (
        ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") &&
          !l) ||
        ((e = ul(e.nextSibling)), e === null)
      )
        return null;
    return e;
  }
  function Qm(e, t) {
    for (; e.nodeType !== 8; )
      if (
        ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") &&
          !t) ||
        ((e = ul(e.nextSibling)), e === null)
      )
        return null;
    return e;
  }
  function uo(e) {
    return e.data === "$?" || e.data === "$~";
  }
  function ro(e) {
    return (
      e.data === "$!" ||
      (e.data === "$?" && e.ownerDocument.readyState !== "loading")
    );
  }
  function vy(e, t) {
    var l = e.ownerDocument;
    if (e.data === "$~") e._reactRetry = t;
    else if (e.data !== "$?" || l.readyState !== "loading") t();
    else {
      var a = function () {
        (t(), l.removeEventListener("DOMContentLoaded", a));
      };
      (l.addEventListener("DOMContentLoaded", a), (e._reactRetry = a));
    }
  }
  function ul(e) {
    for (; e != null; e = e.nextSibling) {
      var t = e.nodeType;
      if (t === 1 || t === 3) break;
      if (t === 8) {
        if (
          ((t = e.data),
          t === "$" ||
            t === "$!" ||
            t === "$?" ||
            t === "$~" ||
            t === "&" ||
            t === "F!" ||
            t === "F")
        )
          break;
        if (t === "/$" || t === "/&") return null;
      }
    }
    return e;
  }
  var oo = null;
  function Xm(e) {
    e = e.nextSibling;
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var l = e.data;
        if (l === "/$" || l === "/&") {
          if (t === 0) return ul(e.nextSibling);
          t--;
        } else
          (l !== "$" && l !== "$!" && l !== "$?" && l !== "$~" && l !== "&") ||
            t++;
      }
      e = e.nextSibling;
    }
    return null;
  }
  function Zm(e) {
    e = e.previousSibling;
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var l = e.data;
        if (l === "$" || l === "$!" || l === "$?" || l === "$~" || l === "&") {
          if (t === 0) return e;
          t--;
        } else (l !== "/$" && l !== "/&") || t++;
      }
      e = e.previousSibling;
    }
    return null;
  }
  function xy(e, t) {
    function l() {
      a = !0;
    }
    if (e.ownerDocument.activeElement === e) return !0;
    var a = !1;
    try {
      (e.ownerDocument.addEventListener("focus", l, !0),
        (e.focus || HTMLElement.prototype.focus).call(e, t));
    } finally {
      e.ownerDocument.removeEventListener("focus", l, !0);
    }
    return a;
  }
  function yy(e) {
    zm(function () {
      zm(function (t) {
        return e(t);
      });
    });
  }
  function Jm(e, t, l) {
    switch (((t = qs(l)), e)) {
      case "html":
        if (((e = t.documentElement), !e)) throw Error(r(452));
        return e;
      case "head":
        if (((e = t.head), !e)) throw Error(r(453));
        return e;
      case "body":
        if (((e = t.body), !e)) throw Error(r(454));
        return e;
      default:
        throw Error(r(451));
    }
  }
  function Im(e, t, l) {
    for (var a in l) {
      var s = l[a];
      l.hasOwnProperty(a) && s != null && Fe(e, t, a, null, Zx, s);
    }
    (l.dangerouslySetInnerHTML != null && (e.textContent = ""),
      e.onclick === jl && (e.onclick = null),
      fi(e));
  }
  function fo(e) {
    for (var t = e.attributes; t.length; ) e.removeAttributeNode(t[0]);
    fi(e);
  }
  var rl = new Map(),
    $m = new Set();
  function Hs(e) {
    if (typeof e.getRootNode == "function") {
      var t = e.getRootNode();
      if (t.nodeType === 9 || t.nodeType === 11) return t;
    }
    return e.nodeType === 9 ? e : e.ownerDocument;
  }
  var Xl = pe.d;
  pe.d = { f: gy, r: jy, D: by, C: Ny, L: Sy, m: Ty, X: Cy, S: Ey, M: wy };
  function gy() {
    var e = Xl.f(),
      t = pc();
    return e || t;
  }
  function jy(e) {
    var t = ca(e);
    t !== null && t.tag === 5 && t.type === "form" ? Wf(t) : Xl.r(e);
  }
  var Va = typeof document > "u" ? null : document;
  function Fm(e, t, l) {
    var a = Va;
    if (a && typeof t == "string" && t) {
      var s = tl(t);
      ((s = 'link[rel="' + e + '"][href="' + s + '"]'),
        typeof l == "string" && (s += '[crossorigin="' + l + '"]'),
        $m.has(s) ||
          ($m.add(s),
          (e = { rel: e, crossOrigin: l, href: t }),
          a.querySelector(s) === null &&
            ((t = a.createElement("link")),
            _t(t, "link", e),
            xt(t),
            a.head.appendChild(t))));
    }
  }
  function by(e) {
    (Xl.D(e), Fm("dns-prefetch", e, null));
  }
  function Ny(e, t) {
    (Xl.C(e, t), Fm("preconnect", e, t));
  }
  function Sy(e, t, l) {
    Xl.L(e, t, l);
    var a = Va;
    if (a && e && t) {
      var s = 'link[rel="preload"][as="' + tl(t) + '"]';
      t === "image" && l && l.imageSrcSet
        ? ((s += '[imagesrcset="' + tl(l.imageSrcSet) + '"]'),
          typeof l.imageSizes == "string" &&
            (s += '[imagesizes="' + tl(l.imageSizes) + '"]'))
        : (s += '[href="' + tl(e) + '"]');
      var i = s;
      switch (t) {
        case "style":
          i = Ga(e);
          break;
        case "script":
          i = Qa(e);
      }
      if (
        !(
          rl.has(i) ||
          ((e = G(
            {
              rel: "preload",
              href: t === "image" && l && l.imageSrcSet ? void 0 : e,
              as: t,
            },
            l,
          )),
          rl.set(i, e),
          a.querySelector(s) !== null ||
            (t === "style" && a.querySelector(Ks(i))) ||
            (t === "script" && a.querySelector(Ls(i))))
        )
      ) {
        var u = a.createElement("link");
        (_t(u, "link", e),
          t === "style" &&
            ((u[di] = !0),
            (u.onload = u.onerror =
              function () {
                rd(u);
              })),
          xt(u),
          a.head.appendChild(u));
      }
    }
  }
  function Ty(e, t) {
    Xl.m(e, t);
    var l = Va;
    if (l && e) {
      var a = t && typeof t.as == "string" ? t.as : "script",
        s =
          'link[rel="modulepreload"][as="' + tl(a) + '"][href="' + tl(e) + '"]',
        i = s;
      switch (a) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          i = Qa(e);
      }
      if (
        !rl.has(i) &&
        ((e = G({ rel: "modulepreload", href: e }, t)),
        rl.set(i, e),
        l.querySelector(s) === null)
      ) {
        switch (a) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (l.querySelector(Ls(i))) return;
        }
        ((a = l.createElement("link")),
          _t(a, "link", e),
          xt(a),
          l.head.appendChild(a));
      }
    }
  }
  function Ey(e, t, l) {
    Xl.S(e, t, l);
    var a = Va;
    if (a && e) {
      var s = ua(a).hoistableStyles,
        i = Ga(e);
      t = t || "default";
      var u = s.get(i);
      if (!u) {
        var o = { loading: 0, preload: null };
        if ((u = a.querySelector(Ks(i)))) o.loading = 5;
        else {
          ((e = G({ rel: "stylesheet", href: e, "data-precedence": t }, l)),
            (l = rl.get(i)) && ho(e, l));
          var x = (u = a.createElement("link"));
          (xt(x),
            _t(x, "link", e),
            (x._p = new Promise(function (w, q) {
              ((x.onload = w), (x.onerror = q));
            })),
            x.addEventListener("load", function () {
              o.loading |= 1;
            }),
            x.addEventListener("error", function () {
              o.loading |= 2;
            }),
            (o.loading |= 4),
            Nc(u, t, a));
        }
        ((u = { type: "stylesheet", instance: u, count: 1, state: o }),
          s.set(i, u));
      }
    }
  }
  function Cy(e, t) {
    Xl.X(e, t);
    var l = Va;
    if (l && e) {
      var a = ua(l).hoistableScripts,
        s = Qa(e),
        i = a.get(s);
      i ||
        ((i = l.querySelector(Ls(s))),
        i ||
          ((e = G({ src: e, async: !0 }, t)),
          (t = rl.get(s)) && mo(e, t),
          (i = l.createElement("script")),
          xt(i),
          _t(i, "link", e),
          l.head.appendChild(i)),
        (i = { type: "script", instance: i, count: 1, state: null }),
        a.set(s, i));
    }
  }
  function wy(e, t) {
    Xl.M(e, t);
    var l = Va;
    if (l && e) {
      var a = ua(l).hoistableScripts,
        s = Qa(e),
        i = a.get(s);
      i ||
        ((i = l.querySelector(Ls(s))),
        i ||
          ((e = G({ src: e, async: !0, type: "module" }, t)),
          (t = rl.get(s)) && mo(e, t),
          (i = l.createElement("script")),
          xt(i),
          _t(i, "link", e),
          l.head.appendChild(i)),
        (i = { type: "script", instance: i, count: 1, state: null }),
        a.set(s, i));
    }
  }
  function Wm(e, t, l, a) {
    var s = (s = O.current) ? Hs(s) : null;
    if (!s) throw Error(r(446));
    switch (e) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof l.precedence == "string" && typeof l.href == "string"
          ? ((l = Ga(l.href)),
            (t = ua(s).hoistableStyles),
            (a = t.get(l)),
            a ||
              ((a = { type: "style", instance: null, count: 0, state: null }),
              t.set(l, a)),
            a)
          : { type: "void", instance: null, count: 0, state: null };
      case "link":
        if (
          l.rel === "stylesheet" &&
          typeof l.href == "string" &&
          typeof l.precedence == "string"
        ) {
          e = Ga(l.href);
          var i = ua(s).hoistableStyles,
            u = i.get(e);
          if (
            (u ||
              ((s = s.ownerDocument || s),
              (u = {
                type: "stylesheet",
                instance: null,
                count: 0,
                state: { loading: 0, preload: null },
              }),
              i.set(e, u),
              (i = s.querySelector(Ks(e)))
                ? i._p || ((u.instance = i), (u.state.loading = 5))
                : ((i = rl.get(e)),
                  i ||
                    ((i = {
                      rel: "preload",
                      as: "style",
                      href: l.href,
                      crossOrigin: l.crossOrigin,
                      integrity: l.integrity,
                      media: l.media,
                      hrefLang: l.hrefLang,
                      referrerPolicy: l.referrerPolicy,
                    }),
                    rl.set(e, i)),
                  _y(s, e, i, u.state))),
            t && a === null)
          )
            throw Error(r(528, ""));
          return u;
        }
        if (t && a !== null) throw Error(r(529, ""));
        return null;
      case "script":
        return (
          (t = l.async),
          (l = l.src),
          typeof l == "string" &&
          t &&
          typeof t != "function" &&
          typeof t != "symbol"
            ? ((l = Qa(l)),
              (t = ua(s).hoistableScripts),
              (a = t.get(l)),
              a ||
                ((a = {
                  type: "script",
                  instance: null,
                  count: 0,
                  state: null,
                }),
                t.set(l, a)),
              a)
            : { type: "void", instance: null, count: 0, state: null }
        );
      default:
        throw Error(r(444, e));
    }
  }
  function Ga(e) {
    return 'href="' + tl(e) + '"';
  }
  function Ks(e) {
    return 'link[rel="stylesheet"][' + e + "]";
  }
  function Pm(e) {
    return G({}, e, { "data-precedence": e.precedence, precedence: null });
  }
  function _y(e, t, l, a) {
    if ((t = e.querySelector('link[rel="preload"][as="style"][' + t + "]"))) {
      if (t[di] !== !0) {
        a.loading = 1;
        return;
      }
    } else
      ((t = e.createElement("link")),
        (t[di] = !0),
        (t.onload = t.onerror = rd.bind(null, t)),
        _t(t, "link", l),
        xt(t),
        e.head.appendChild(t));
    ((a.preload = t),
      t.addEventListener("load", function () {
        return (a.loading |= 1);
      }),
      t.addEventListener("error", function () {
        return (a.loading |= 2);
      }));
  }
  function Qa(e) {
    return '[src="' + tl(e) + '"]';
  }
  function Ls(e) {
    return "script[async]" + e;
  }
  function ep(e, t, l) {
    if ((t.count++, t.instance === null))
      switch (t.type) {
        case "style":
          var a = e.querySelector('style[data-href~="' + tl(l.href) + '"]');
          if (a) return ((t.instance = a), xt(a), a);
          var s = G({}, l, {
            "data-href": l.href,
            "data-precedence": l.precedence,
            href: null,
            precedence: null,
          });
          return (
            (a = (e.ownerDocument || e).createElement("style")),
            xt(a),
            _t(a, "style", s),
            Nc(a, l.precedence, e),
            (t.instance = a)
          );
        case "stylesheet":
          s = Ga(l.href);
          var i = e.querySelector(Ks(s));
          if (i) return ((t.state.loading |= 4), (t.instance = i), xt(i), i);
          ((a = Pm(l)),
            (s = rl.get(s)) && ho(a, s),
            (i = (e.ownerDocument || e).createElement("link")),
            xt(i));
          var u = i;
          return (
            (u._p = new Promise(function (o, x) {
              ((u.onload = o), (u.onerror = x));
            })),
            _t(i, "link", a),
            (t.state.loading |= 4),
            Nc(i, l.precedence, e),
            (t.instance = i)
          );
        case "script":
          return (
            (i = Qa(l.src)),
            (s = e.querySelector(Ls(i)))
              ? ((t.instance = s), xt(s), s)
              : ((a = l),
                (s = rl.get(i)) && ((a = G({}, l)), mo(a, s)),
                (e = e.ownerDocument || e),
                (s = e.createElement("script")),
                xt(s),
                _t(s, "link", a),
                e.head.appendChild(s),
                (t.instance = s))
          );
        case "void":
          return null;
        default:
          throw Error(r(443, t.type));
      }
    else
      t.type === "stylesheet" &&
        (t.state.loading & 4) === 0 &&
        ((a = t.instance), (t.state.loading |= 4), Nc(a, l.precedence, e));
    return t.instance;
  }
  function Nc(e, t, l) {
    for (
      var a = l.querySelectorAll(
          'link[rel="stylesheet"][data-precedence],style[data-precedence]',
        ),
        s = a.length ? a[a.length - 1] : null,
        i = s,
        u = 0;
      u < a.length;
      u++
    ) {
      var o = a[u];
      if (o.dataset.precedence === t) i = o;
      else if (i !== s) break;
    }
    i
      ? i.parentNode.insertBefore(e, i.nextSibling)
      : ((t = l.nodeType === 9 ? l.head : l), t.insertBefore(e, t.firstChild));
  }
  function ho(e, t) {
    (e.crossOrigin == null && (e.crossOrigin = t.crossOrigin),
      e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy),
      e.title == null && (e.title = t.title));
  }
  function mo(e, t) {
    (e.crossOrigin == null && (e.crossOrigin = t.crossOrigin),
      e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy),
      e.integrity == null && (e.integrity = t.integrity));
  }
  var Sc = null;
  function tp(e, t, l) {
    if (Sc === null) {
      var a = new Map(),
        s = (Sc = new Map());
      s.set(l, a);
    } else ((s = Sc), (a = s.get(l)), a || ((a = new Map()), s.set(l, a)));
    if (a.has(e)) return a;
    for (
      a.set(e, null), l = l.getElementsByTagName(e), s = 0;
      s < l.length;
      s++
    ) {
      var i = l[s];
      if (
        !(
          i[es] ||
          i[St] ||
          (e === "link" && i.getAttribute("rel") === "stylesheet")
        ) &&
        i.namespaceURI !== "http://www.w3.org/2000/svg"
      ) {
        var u = i.getAttribute(t) || "";
        u = e + u;
        var o = a.get(u);
        o ? o.push(i) : a.set(u, [i]);
      }
    }
    return a;
  }
  function po(e, t, l) {
    ((e = e.ownerDocument || e),
      e.head.insertBefore(
        l,
        t === "title" ? e.querySelector("head > title") : null,
      ));
  }
  function Ay(e, t, l) {
    if (l === 1 || t.itemProp != null) return !1;
    switch (e) {
      case "meta":
      case "title":
        return !0;
      case "style":
        if (
          typeof t.precedence != "string" ||
          typeof t.href != "string" ||
          t.href === ""
        )
          break;
        return !0;
      case "link":
        if (
          typeof t.rel != "string" ||
          typeof t.href != "string" ||
          t.href === "" ||
          t.onLoad ||
          t.onError
        )
          break;
        return t.rel === "stylesheet"
          ? ((e = t.disabled), typeof t.precedence == "string" && e == null)
          : !0;
      case "script":
        if (
          t.async &&
          typeof t.async != "function" &&
          typeof t.async != "symbol" &&
          !t.onLoad &&
          !t.onError &&
          t.src &&
          typeof t.src == "string"
        )
          return !0;
    }
    return !1;
  }
  function lp(e, t) {
    return (
      e === "img" &&
      t.src != null &&
      t.src !== "" &&
      t.onLoad == null &&
      t.loading !== "lazy"
    );
  }
  function np(e) {
    return !(e.type === "stylesheet" && (e.state.loading & 3) === 0);
  }
  function ap(e) {
    return (
      (e.width || 100) *
      (e.height || 100) *
      (typeof devicePixelRatio == "number" ? devicePixelRatio : 1) *
      0.25
    );
  }
  function sp(e, t) {
    typeof t.decode == "function" &&
      (e.imgCount++,
      t.complete || ((e.imgBytes += ap(t)), e.suspenseyImages.push(t)),
      (e = Oy.bind(e)),
      t.decode().then(e, e));
  }
  function Ry(e, t, l, a) {
    if (
      l.type === "stylesheet" &&
      (typeof a.media != "string" || matchMedia(a.media).matches !== !1) &&
      (l.state.loading & 4) === 0
    ) {
      if (l.instance === null) {
        var s = Ga(a.href),
          i = t.querySelector(Ks(s));
        if (i) {
          ((t = i._p),
            t !== null &&
              typeof t == "object" &&
              typeof t.then == "function" &&
              (e.count++, (e = Bs.bind(e)), t.then(e, e)),
            (l.state.loading |= 4),
            (l.instance = i),
            xt(i));
          return;
        }
        ((i = t.ownerDocument || t),
          (a = Pm(a)),
          (s = rl.get(s)) && ho(a, s),
          (i = i.createElement("link")),
          xt(i));
        var u = i;
        ((u._p = new Promise(function (o, x) {
          ((u.onload = o), (u.onerror = x));
        })),
          _t(i, "link", a),
          (l.instance = i));
      }
      (e.stylesheets === null && (e.stylesheets = new Map()),
        e.stylesheets.set(l, t),
        (t = l.state.preload) &&
          (l.state.loading & 3) === 0 &&
          (e.count++,
          (l = Bs.bind(e)),
          t.addEventListener("load", l),
          t.addEventListener("error", l)));
    }
  }
  var Tc = 0;
  function Dy(e, t) {
    return (
      e.stylesheets && e.count === 0 && Cc(e, e.stylesheets),
      0 < e.count || 0 < e.imgCount
        ? function (l) {
            var a = setTimeout(function () {
              if ((e.stylesheets && Cc(e, e.stylesheets), e.unsuspend)) {
                var i = e.unsuspend;
                ((e.unsuspend = null), i());
              }
            }, 6e4 + t);
            0 < e.imgBytes && Tc === 0 && (Tc = 62500 * Ix());
            var s = setTimeout(
              function () {
                if (
                  ((e.waitingForImages = !1),
                  e.count === 0 &&
                    (e.stylesheets && Cc(e, e.stylesheets), e.unsuspend))
                ) {
                  var i = e.unsuspend;
                  ((e.unsuspend = null), i());
                }
              },
              (e.imgBytes > Tc ? 50 : 800) + t,
            );
            return (
              (e.unsuspend = l),
              function () {
                ((e.unsuspend = null), clearTimeout(a), clearTimeout(s));
              }
            );
          }
        : null
    );
  }
  function ip(e) {
    if (e.count === 0 && (e.imgCount === 0 || !e.waitingForImages)) {
      if (e.stylesheets) Cc(e, e.stylesheets);
      else if (e.unsuspend) {
        var t = e.unsuspend;
        ((e.unsuspend = null), t());
      }
    }
  }
  function Bs() {
    (this.count--, ip(this));
  }
  function Oy() {
    (this.imgCount--, ip(this));
  }
  var Ec = null;
  function Cc(e, t) {
    ((e.stylesheets = null),
      e.unsuspend !== null &&
        (e.count++,
        (Ec = new Map()),
        t.forEach(zy, e),
        (Ec = null),
        Bs.call(e)));
  }
  function zy(e, t) {
    if (!(t.state.loading & 4)) {
      var l = Ec.get(e);
      if (l) var a = l.get(null);
      else {
        ((l = new Map()), Ec.set(e, l));
        for (
          var s = e.querySelectorAll(
              "link[data-precedence],style[data-precedence]",
            ),
            i = 0;
          i < s.length;
          i++
        ) {
          var u = s[i];
          (u.nodeName === "LINK" || u.getAttribute("media") !== "not all") &&
            (l.set(u.dataset.precedence, u), (a = u));
        }
        a && l.set(null, a);
      }
      ((s = t.instance),
        (u = s.getAttribute("data-precedence")),
        (i = l.get(u) || a),
        i === a && l.set(null, s),
        l.set(u, s),
        this.count++,
        (a = Bs.bind(this)),
        s.addEventListener("load", a),
        s.addEventListener("error", a),
        i
          ? i.parentNode.insertBefore(s, i.nextSibling)
          : ((e = e.nodeType === 9 ? e.head : e),
            e.insertBefore(s, e.firstChild)),
        (t.state.loading |= 4));
    }
  }
  var Xa = {
    $$typeof: ae,
    Provider: null,
    Consumer: null,
    _currentValue: F,
    _currentValue2: F,
    _threadCount: 0,
  };
  function Uy(e, t, l, a, s, i, u, o, x) {
    ((this.tag = 1),
      (this.containerInfo = e),
      (this.pingCache = this.current = this.pendingChildren = null),
      (this.timeoutHandle = -1),
      (this.callbackNode =
        this.next =
        this.pendingContext =
        this.context =
        this.cancelPendingCommit =
          null),
      (this.callbackPriority = 0),
      (this.expirationTimes = Jc(-1)),
      (this.entangledLanes =
        this.shellSuspendCounter =
        this.errorRecoveryDisabledLanes =
        this.expiredLanes =
        this.warmLanes =
        this.pingedLanes =
        this.suspendedLanes =
        this.pendingLanes =
          0),
      (this.entanglements = Jc(0)),
      (this.hiddenUpdates = Jc(null)),
      (this.identifierPrefix = a),
      (this.onUncaughtError = s),
      (this.onCaughtError = i),
      (this.onRecoverableError = u),
      (this.pooledCache = null),
      (this.pooledCacheLanes = 0),
      (this.formState = x),
      (this.transitionTypes = null),
      (this.incompleteTransitions = new Map()));
  }
  function cp(e, t, l, a, s, i, u, o, x, w, q, X) {
    return (
      (e = new Uy(e, t, l, u, x, w, q, X, o)),
      (t = 1),
      i === !0 && (t |= 24),
      (i = Lt(3, null, null, t)),
      (e.current = i),
      (i.stateNode = e),
      (t = Au()),
      t.refCount++,
      (e.pooledCache = t),
      t.refCount++,
      (i.memoizedState = { element: a, isDehydrated: l, cache: t }),
      zu(i),
      e
    );
  }
  function up(e) {
    return e ? ((e = ya), e) : ya;
  }
  function rp(e, t, l, a, s, i) {
    ((s = up(s)),
      a.context === null ? (a.context = s) : (a.pendingContext = s),
      (a = un(t)),
      (a.payload = { element: l }),
      (i = i === void 0 ? null : i),
      i !== null && (a.callback = i),
      (l = rn(e, a, t)),
      l !== null && (Vt(l, e, t), xs(l, e, t)));
  }
  function op(e, t) {
    if (((e = e.memoizedState), e !== null && e.dehydrated !== null)) {
      var l = e.retryLane;
      e.retryLane = l !== 0 && l < t ? l : t;
    }
  }
  function vo(e, t) {
    (op(e, t), (e = e.alternate) && op(e, t));
  }
  function dp(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = qn(e, 67108864);
      (t !== null && Vt(t, e, 67108864), vo(e, 67108864));
    }
  }
  function fp(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Wt();
      t = Ic(t);
      var l = qn(e, t);
      (l !== null && Vt(l, e, t), vo(e, t));
    }
  }
  var Za = !0;
  function My(e, t, l, a) {
    var s = ne.T;
    ne.T = null;
    var i = pe.p;
    try {
      ((pe.p = 2), xo(e, t, l, a));
    } finally {
      ((pe.p = i), (ne.T = s));
    }
  }
  function qy(e, t, l, a) {
    var s = ne.T;
    ne.T = null;
    var i = pe.p;
    try {
      ((pe.p = 8), xo(e, t, l, a));
    } finally {
      ((pe.p = i), (ne.T = s));
    }
  }
  function xo(e, t, l, a) {
    if (Za) {
      var s = yo(a);
      if (s === null) (Fr(e, t, a, wc, l), mp(e, a));
      else if (Ky(s, e, t, l, a)) a.stopPropagation();
      else if ((mp(e, a), t & 4 && -1 < Hy.indexOf(e))) {
        for (; s !== null; ) {
          var i = ca(s);
          if (i !== null)
            switch (i.tag) {
              case 3:
                if (((i = i.stateNode), i.current.memoizedState.isDehydrated)) {
                  var u = Dn(i.pendingLanes);
                  if (u !== 0) {
                    var o = i;
                    for (o.pendingLanes |= 2, o.entangledLanes |= 2; u; ) {
                      var x = 1 << (31 - Oe(u));
                      ((o.entanglements[1] |= x), (u &= ~x));
                    }
                    (Rl(i), (Ze & 6) === 0 && ((fc = Nt() + 500), zs(0)));
                  }
                }
                break;
              case 31:
              case 13:
                ((o = qn(i, 2)), o !== null && Vt(o, i, 2), pc(), vo(i, 2));
            }
          if (((i = yo(a)), i === null && Fr(e, t, a, wc, l), i === s)) break;
          s = i;
        }
        s !== null && a.stopPropagation();
      } else Fr(e, t, a, null, l);
    }
  }
  function yo(e) {
    return ((e = lu(e)), go(e));
  }
  var wc = null;
  function go(e) {
    if (((wc = null), (e = On(e)), e !== null)) {
      var t = p(e);
      if (t === null) e = null;
      else {
        var l = t.tag;
        if (l === 13) {
          if (((e = b(t)), e !== null)) return e;
          e = null;
        } else if (l === 31) {
          if (((e = D(t)), e !== null)) return e;
          e = null;
        } else if (l === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated)
            return t.tag === 3 ? t.stateNode.containerInfo : null;
          e = null;
        } else t !== e && (e = null);
      }
    }
    return ((wc = e), null);
  }
  function hp(e) {
    switch (e) {
      case "beforetoggle":
      case "cancel":
      case "click":
      case "close":
      case "contextmenu":
      case "copy":
      case "cut":
      case "auxclick":
      case "dblclick":
      case "dragend":
      case "dragstart":
      case "drop":
      case "focusin":
      case "focusout":
      case "input":
      case "invalid":
      case "keydown":
      case "keypress":
      case "keyup":
      case "mousedown":
      case "mouseup":
      case "paste":
      case "pause":
      case "play":
      case "pointercancel":
      case "pointerdown":
      case "pointerup":
      case "ratechange":
      case "reset":
      case "seeked":
      case "submit":
      case "toggle":
      case "touchcancel":
      case "touchend":
      case "touchstart":
      case "volumechange":
      case "change":
      case "selectionchange":
      case "textInput":
      case "compositionstart":
      case "compositionend":
      case "compositionupdate":
      case "beforeblur":
      case "afterblur":
      case "beforeinput":
      case "blur":
      case "fullscreenchange":
      case "fullscreenerror":
      case "focus":
      case "hashchange":
      case "popstate":
      case "select":
      case "selectstart":
        return 2;
      case "drag":
      case "dragenter":
      case "dragexit":
      case "dragleave":
      case "dragover":
      case "mousemove":
      case "mouseout":
      case "mouseover":
      case "pointermove":
      case "pointerout":
      case "pointerover":
      case "resize":
      case "scroll":
      case "touchmove":
      case "wheel":
      case "mouseenter":
      case "mouseleave":
      case "pointerenter":
      case "pointerleave":
        return 8;
      case "message":
        switch (Qc()) {
          case si:
            return 2;
          case ii:
            return 8;
          case Fl:
          case Xc:
            return 32;
          case ci:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var jo = !1,
    bn = null,
    Nn = null,
    Sn = null,
    ks = new Map(),
    Ys = new Map(),
    Tn = [],
    Hy =
      "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
        " ",
      );
  function mp(e, t) {
    switch (e) {
      case "focusin":
      case "focusout":
        bn = null;
        break;
      case "dragenter":
      case "dragleave":
        Nn = null;
        break;
      case "mouseover":
      case "mouseout":
        Sn = null;
        break;
      case "pointerover":
      case "pointerout":
        ks.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        Ys.delete(t.pointerId);
    }
  }
  function Vs(e, t, l, a, s, i) {
    return e === null || e.nativeEvent !== i
      ? ((e = {
          blockedOn: t,
          domEventName: l,
          eventSystemFlags: a,
          nativeEvent: i,
          targetContainers: [s],
        }),
        t !== null && ((t = ca(t)), t !== null && dp(t)),
        e)
      : ((e.eventSystemFlags |= a),
        (t = e.targetContainers),
        s !== null && t.indexOf(s) === -1 && t.push(s),
        e);
  }
  function Ky(e, t, l, a, s) {
    switch (t) {
      case "focusin":
        return ((bn = Vs(bn, e, t, l, a, s)), !0);
      case "dragenter":
        return ((Nn = Vs(Nn, e, t, l, a, s)), !0);
      case "mouseover":
        return ((Sn = Vs(Sn, e, t, l, a, s)), !0);
      case "pointerover":
        var i = s.pointerId;
        return (ks.set(i, Vs(ks.get(i) || null, e, t, l, a, s)), !0);
      case "gotpointercapture":
        return (
          (i = s.pointerId),
          Ys.set(i, Vs(Ys.get(i) || null, e, t, l, a, s)),
          !0
        );
    }
    return !1;
  }
  function pp(e) {
    var t = On(e.target);
    if (t !== null) {
      var l = p(t);
      if (l !== null) {
        if (((t = l.tag), t === 13)) {
          if (((t = b(l)), t !== null)) {
            ((e.blockedOn = t),
              id(e.priority, function () {
                fp(l);
              }));
            return;
          }
        } else if (t === 31) {
          if (((t = D(l)), t !== null)) {
            ((e.blockedOn = t),
              id(e.priority, function () {
                fp(l);
              }));
            return;
          }
        } else if (t === 3 && l.stateNode.current.memoizedState.isDehydrated) {
          e.blockedOn = l.tag === 3 ? l.stateNode.containerInfo : null;
          return;
        }
      }
    }
    e.blockedOn = null;
  }
  function _c(e) {
    if (e.blockedOn !== null) return !1;
    for (var t = e.targetContainers; 0 < t.length; ) {
      var l = yo(e.nativeEvent);
      if (l === null) {
        l = e.nativeEvent;
        var a = new l.constructor(l.type, l);
        ((tu = a), l.target.dispatchEvent(a), (tu = null));
      } else return ((t = ca(l)), t !== null && dp(t), (e.blockedOn = l), !1);
      t.shift();
    }
    return !0;
  }
  function vp(e, t, l) {
    _c(e) && l.delete(t);
  }
  function Ly() {
    ((jo = !1),
      bn !== null && _c(bn) && (bn = null),
      Nn !== null && _c(Nn) && (Nn = null),
      Sn !== null && _c(Sn) && (Sn = null),
      ks.forEach(vp),
      Ys.forEach(vp));
  }
  function Ac(e, t) {
    e.blockedOn === t &&
      ((e.blockedOn = null),
      jo ||
        ((jo = !0),
        c.unstable_scheduleCallback(c.unstable_NormalPriority, Ly)));
  }
  var Rc = null;
  function xp(e) {
    Rc !== e &&
      ((Rc = e),
      c.unstable_scheduleCallback(c.unstable_NormalPriority, function () {
        Rc === e && (Rc = null);
        for (var t = 0; t < e.length; t += 3) {
          var l = e[t],
            a = e[t + 1],
            s = e[t + 2];
          if (typeof a != "function") {
            if (go(a || l) === null) continue;
            break;
          }
          var i = ca(l);
          i !== null &&
            (e.splice(t, 3),
            (t -= 3),
            er(i, { pending: !0, data: s, method: l.method, action: a }, a, s));
        }
      }));
  }
  function Ja(e) {
    function t(x) {
      return Ac(x, e);
    }
    (bn !== null && Ac(bn, e),
      Nn !== null && Ac(Nn, e),
      Sn !== null && Ac(Sn, e),
      ks.forEach(t),
      Ys.forEach(t));
    for (var l = 0; l < Tn.length; l++) {
      var a = Tn[l];
      a.blockedOn === e && (a.blockedOn = null);
    }
    for (; 0 < Tn.length && ((l = Tn[0]), l.blockedOn === null); )
      (pp(l), l.blockedOn === null && Tn.shift());
    if (((l = (e.ownerDocument || e).$$reactFormReplay), l != null))
      for (a = 0; a < l.length; a += 3) {
        var s = l[a],
          i = l[a + 1],
          u = s[Kt] || null;
        if (typeof i == "function") u || xp(l);
        else if (u) {
          var o = null;
          if (i && i.hasAttribute("formAction")) {
            if (((s = i), (u = i[Kt] || null))) o = u.formAction;
            else if (go(s) !== null) continue;
          } else o = u.action;
          (typeof o == "function" ? (l[a + 1] = o) : (l.splice(a, 3), (a -= 3)),
            xp(l));
        }
      }
  }
  function yp() {
    function e(i) {
      i.canIntercept &&
        i.info === "react-transition" &&
        i.intercept({
          handler: function () {
            return new Promise(function (u) {
              return (s = u);
            });
          },
          focusReset: "manual",
          scroll: "manual",
        });
    }
    function t() {
      (s !== null && (s(), (s = null)), a || setTimeout(l, 20));
    }
    function l() {
      if (!a && !navigation.transition) {
        var i = navigation.currentEntry;
        i &&
          i.url != null &&
          navigation.navigate(i.url, {
            state: i.getState(),
            info: "react-transition",
            history: "replace",
          });
      }
    }
    if (typeof navigation == "object") {
      var a = !1,
        s = null;
      return (
        navigation.addEventListener("navigate", e),
        navigation.addEventListener("navigatesuccess", t),
        navigation.addEventListener("navigateerror", t),
        setTimeout(l, 100),
        function () {
          ((a = !0),
            navigation.removeEventListener("navigate", e),
            navigation.removeEventListener("navigatesuccess", t),
            navigation.removeEventListener("navigateerror", t),
            s !== null && (s(), (s = null)));
        }
      );
    }
  }
  function bo(e) {
    this._internalRoot = e;
  }
  ((Dc.prototype.render = bo.prototype.render =
    function (e) {
      var t = this._internalRoot;
      if (t === null) throw Error(r(409));
      var l = t.current,
        a = Wt();
      rp(l, a, e, t, null, null);
    }),
    (Dc.prototype.unmount = bo.prototype.unmount =
      function () {
        var e = this._internalRoot;
        if (e !== null) {
          this._internalRoot = null;
          var t = e.containerInfo;
          (rp(e.current, 2, null, e, null, null), pc(), (t[ia] = null));
        }
      }));
  function Dc(e) {
    this._internalRoot = e;
  }
  Dc.prototype.unstable_scheduleHydration = function (e) {
    if (e) {
      var t = sd();
      e = { blockedOn: null, target: e, priority: t };
      for (var l = 0; l < Tn.length && t !== 0 && t < Tn[l].priority; l++);
      (Tn.splice(l, 0, e), l === 0 && pp(e));
    }
  };
  var gp = d.version;
  if (gp !== "19.3.0") throw Error(r(527, gp, "19.3.0"));
  pe.findDOMNode = function (e) {
    var t = e._reactInternals;
    if (t === void 0)
      throw typeof e.render == "function"
        ? Error(r(188))
        : ((e = Object.keys(e).join(",")), Error(r(268, e)));
    return (
      (e = j(t)),
      (e = e !== null ? U(e) : null),
      (e = e === null ? null : e.stateNode),
      e
    );
  };
  var By = {
    bundleType: 0,
    version: "19.3.0",
    rendererPackageName: "react-dom",
    currentDispatcherRef: ne,
    reconcilerVersion: "19.3.0",
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Oc = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Oc.isDisabled && Oc.supportsFiber)
      try {
        ((Wl = Oc.inject(By)), ($ = Oc));
      } catch {}
  }
  return (
    (Qs.createRoot = function (e, t) {
      if (!g(e)) throw Error(r(299));
      var l = !1,
        a = "",
        s = uh,
        i = rh,
        u = oh;
      return (
        t != null &&
          (t.unstable_strictMode === !0 && (l = !0),
          t.identifierPrefix !== void 0 && (a = t.identifierPrefix),
          t.onUncaughtError !== void 0 && (s = t.onUncaughtError),
          t.onCaughtError !== void 0 && (i = t.onCaughtError),
          t.onRecoverableError !== void 0 && (u = t.onRecoverableError)),
        (t = cp(e, 1, !1, null, null, l, a, null, s, i, u, yp)),
        (e[ia] = t.current),
        $r(e),
        new bo(t)
      );
    }),
    (Qs.hydrateRoot = function (e, t, l) {
      if (!g(e)) throw Error(r(299));
      var a = !1,
        s = "",
        i = uh,
        u = rh,
        o = oh,
        x = null;
      return (
        l != null &&
          (l.unstable_strictMode === !0 && (a = !0),
          l.identifierPrefix !== void 0 && (s = l.identifierPrefix),
          l.onUncaughtError !== void 0 && (i = l.onUncaughtError),
          l.onCaughtError !== void 0 && (u = l.onCaughtError),
          l.onRecoverableError !== void 0 && (o = l.onRecoverableError),
          l.formState !== void 0 && (x = l.formState)),
        (t = cp(e, 1, !0, t, l ?? null, a, s, x, i, u, o, yp)),
        (t.context = up(null)),
        (l = t.current),
        (a = Wt()),
        (a = Ic(a)),
        (s = un(a)),
        (s.callback = null),
        rn(l, s, a),
        (l = a),
        (t.current.lanes = l),
        Pa(t, l),
        Rl(t),
        (e[ia] = t.current),
        $r(e),
        new Dc(t)
      );
    }),
    (Qs.version = "19.3.0"),
    Qs
  );
}
var Ap;
function $y() {
  if (Ap) return To.exports;
  Ap = 1;
  function c() {
    if (
      !(
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" ||
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"
      )
    )
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(c);
      } catch (d) {
        console.error(d);
      }
  }
  return (c(), (To.exports = Iy()), To.exports);
}
var Fy = $y();
class Ne extends Error {
  constructor(d, f, unavailablePhotoIds) {
    (super(f), (this.status = d));
    this.unavailablePhotoIds = unavailablePhotoIds;
  }
  status;
}
const Yp = {
    400: "Проверьте введённые данные и повторите попытку.",
    401: "Сессия завершена или данные для входа неверны. Войдите снова.",
    403: "Недостаточно прав для этого действия.",
    404: "Рейс не найден или больше недоступен.",
    409: "Данные изменились. Обновите страницу и повторите попытку.",
    429: "Слишком много попыток. Подождите и повторите вход.",
  },
  Rp = {
    PAYROLL_ACCOUNT_CHANGED:
      "Депозит или его настройки изменились. Обновите водителей и повторите расчёт.",
    PAYROLL_ACCOUNT_CLOSED:
      "Сверки по этому депозиту завершены. Новые расчёты больше не принимаются.",
    PAYROLL_PERIOD_CONFIRMED:
      "Этот период пересекается с уже утверждённой ведомостью. Выберите следующий расчётный период.",
    PAYROLL_PERIOD_ORDER:
      "После позднего расчёта нельзя добавить более ранний: остаток депозита уже использован. Проверьте период.",
    PAYROLL_UNCOVERED:
      "Зарплаты и депозита недостаточно. Расчёт не подтверждён. Проверьте суммы и решения по удержаниям.",
    PAYROLL_TERMINATION_BEFORE_PERIOD:
      "Дата увольнения раньше уже утверждённого расчётного периода.",
    PAYROLL_RECONCILIATION_REQUIRED:
      "Сначала необходимо завершить сверки при увольнении.",
    PAYROLL_ACCOUNT_NOT_FOUND:
      "Депозит или расчёт не найден в вашей области доступа. Обновите водителей.",
  };
async function authenticatedFetch(
  path,
  options = {},
  token,
  allowRefresh = true,
) {
  const requestToken = resolveSessionToken(token);
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (requestToken) headers.set("Authorization", `Bearer ${requestToken}`);
  let response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      headers,
      cache: "no-store",
      credentials: options.credentials ?? "omit",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new Ne(
      0,
      "Нет связи с сервером. Проверьте подключение и повторите попытку.",
    );
  }
  if (
    response.status === 401 &&
    allowRefresh &&
    requestToken &&
    !path.startsWith("/auth/") &&
    canRefreshToken(token) &&
    !options.signal?.aborted
  ) {
    const renewed = await refreshAccessSession();
    return authenticatedFetch(path, options, renewed.accessToken, false);
  }
  if (response.status === 401 && activeSession?.actor?.impersonation &&
      requestToken === activeSession.accessToken && !path.startsWith("/auth/")) {
    // End a rejected employee session without replaying this request as the administrator.
    returnToAdministrator("Вход в учётную запись сотрудника завершён. Вы вернулись в админку.").catch(() => {});
  }
  return response;
}
async function ze(c, d = {}, f, allowRefresh = true) {
  const g = await authenticatedFetch(c, d, f, allowRefresh);
  if (!g.ok) {
    let p, unavailablePhotoIds;
    if (c.startsWith("/inspections/") && g.status === 400)
      try {
        const detail = await g.json();
        if (detail.code === "INSPECTION_PHOTOS_UNAVAILABLE" && Array.isArray(detail.unavailablePhotoIds) && detail.unavailablePhotoIds.length <= 200 &&
            detail.unavailablePhotoIds.every(id => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
          unavailablePhotoIds = detail.unavailablePhotoIds;
          p = "Некоторые фото удалены или срок их хранения истёк. Ответы и доступные снимки сохранены.";
        }
      } catch {}
    if (c.startsWith("/finance/payroll/") && [400, 404, 409].includes(g.status))
      try {
        const b = await g.json();
        typeof b.code == "string" &&
          Object.hasOwn(Rp, b.code) &&
          (p = Rp[b.code]);
      } catch {}
    if (c.startsWith("/recruitment") && [400, 401, 403, 404, 409, 410, 413, 429, 502, 503, 504].includes(g.status))
      try {
        const detail = await g.json();
        if (typeof detail.code === "string" && /^(?:RECRUITMENT|ONBOARDING)_[A-Z_]{1,80}$/.test(detail.code) &&
            typeof detail.message === "string" && detail.message.length <= 500 &&
            !/[\u0000-\u001f\u007f]/.test(detail.message)) p = detail.message;
      } catch {}
    if ((c.startsWith("/planning") || c.startsWith("/tenders") || c.startsWith("/development") || c.startsWith("/neural") || c.startsWith("/team") || c.startsWith("/profile") || c.startsWith("/fleet-") || c.startsWith("/communications/")) && [400, 403, 404, 409, 413, 429, 502, 503, 504].includes(g.status))
      try {
        const detail = await g.json();
        if (typeof detail.message === "string" && detail.message.length <= 800 &&
            !/[\u0000-\u001f\u007f]/.test(detail.message)) p = detail.message;
      } catch {}
    throw new Ne(
      g.status,
      p ??
        (c.startsWith("/communications/") && g.status === 404
          ? "Обращение не найдено или больше недоступно."
          : Yp[g.status]) ??
        "Сервер временно недоступен. Повторите попытку позже.",
      unavailablePhotoIds,
    );
  }
  try {
    return await g.json();
  } catch {
    throw new Ne(
      502,
      "Сервер вернул некорректный ответ. Повторите попытку позже.",
    );
  }
}
// Recovered from the deployed production bundle. Original TSX and source maps
// were unavailable. Existing vendor code and business screens remain intact.
// Messenger integration is intentionally isolated here for later extraction.
function detectMessenger(location, globals = {}) {
  const fragment = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  const query = new URLSearchParams(location.search || "");
  // Client launch data takes precedence over a link's optional messenger hint.
  if (fragment.has("tgWebAppData") || query.has("tgWebAppData"))
    return "telegram";
  if (
    fragment.has("WebAppData") ||
    fragment.has("WebAppPlatform") ||
    query.has("WebAppData")
  )
    return "max";
  if (globals.Telegram?.WebApp?.initData) return "telegram";
  if (globals.WebApp?.initData) return "max";
  return query.get("messenger") === "max"
    ? "max"
    : query.get("messenger") === "telegram"
      ? "telegram"
      : "browser";
}
const messengerProvider = detectMessenger(window.location, window);
const messengerLabel =
  messengerProvider === "max"
    ? "MAX"
    : messengerProvider === "telegram"
      ? "Telegram"
      : "браузер";
const maxBotUrl = "https://max.ru/id890202734370_bot?startapp";
function getMessengerBridge() {
  return messengerProvider === "max" ? window.WebApp : window.Telegram?.WebApp;
}
let messengerSdkPromise;
function loadMessengerSdk() {
  if (messengerProvider === "browser") return Promise.resolve(null);
  const existingBridge = getMessengerBridge();
  if (existingBridge) return Promise.resolve(existingBridge);
  if (messengerSdkPromise) return messengerSdkPromise;
  messengerSdkPromise = new Promise((resolve, reject) => {
    const attribute =
      messengerProvider === "max" ? "data-max-sdk" : "data-telegram-sdk";
    const existingScript = document.querySelector(`script[${attribute}]`);
    const script = existingScript || document.createElement("script");
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
    };
    const failed = () => {
      cleanup();
      reject(
        new Error(
          `Не удалось загрузить ${messengerLabel}. Проверьте связь и откройте мини-приложение заново.`,
        ),
      );
    };
    const loaded = () => {
      const bridge = getMessengerBridge();
      if (!bridge) return failed();
      cleanup();
      if (messengerProvider === "telegram") bridge.ready?.();
      resolve(bridge);
    };
    const timeout = window.setTimeout(failed, 10000);
    script.addEventListener("load", loaded);
    script.addEventListener("error", failed);
    if (!existingScript) {
      script.src =
        messengerProvider === "max"
          ? "https://st.max.ru/js/max-web-app.js"
          : "https://telegram.org/js/telegram-web-app.js";
      script.async = true;
      script.setAttribute(attribute, "true");
      document.head.appendChild(script);
    }
  });
  return messengerSdkPromise;
}
const sessionStorageKey = "ecl.session.v2";
const rememberedPhoneKey = "ecl.login.phone.v1";
function normalizeLoginPhone(value) {
  if (typeof value !== "string" || value.length > 40) return null;
  let phone = value.trim().replace(/[\s()-]/g, "");
  if (/^8\d{10}$/.test(phone)) phone = "+7" + phone.slice(1);
  else if (/^7\d{10}$/.test(phone)) phone = "+" + phone;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
function rememberedPhone() {
  try {
    return (
      normalizeLoginPhone(window.localStorage.getItem(rememberedPhoneKey)) || ""
    );
  } catch {
    return "";
  }
}
function rememberPhone(phone) {
  const normalized = normalizeLoginPhone(phone);
  if (!normalized) return;
  try {
    window.localStorage.setItem(rememberedPhoneKey, normalized);
  } catch {}
}
function forgetSession() {
  try {
    window.sessionStorage.removeItem(sessionStorageKey);
    window.sessionStorage.removeItem("ecl.max.session.v1");
  } catch {}
}
function rememberSession(session) {
  try {
    window.sessionStorage.setItem(
      sessionStorageKey,
      JSON.stringify({ session, administratorSession: session.actor?.impersonation ? administratorSession : null }),
    );
    window.sessionStorage.removeItem("ecl.max.session.v1");
  } catch {}
}
// Access tokens stay in memory/sessionStorage. Durable credentials are HttpOnly cookies.
let activeSession = null;
let administratorSession = null;
let impersonationReturnPromise = null;
let sessionNotice = "";
let sessionEpoch = 0;
let refreshPromise = null;
let refreshRejected = false;
let sessionTerminating = false;
let deviceAuthQueue = Promise.resolve();
const sessionTokenAliases = new Set();
const sessionSubscribers = new Set();
function subscribeSession(listener) {
  sessionSubscribers.add(listener);
  return () => sessionSubscribers.delete(listener);
}
function activateSession(session, persist = true) {
  if (activeSession?.actor?.id !== session.actor.id)
    sessionTokenAliases.clear();
  sessionTokenAliases.add(session.accessToken);
  activeSession = session;
  refreshRejected = false;
  if (persist) rememberSession(session);
  sessionSubscribers.forEach((listener) => listener(session));
  return session;
}
function invalidateSessionWork() {
  // Invalidate responses already in flight without discarding a stored account.
  // An invitation can be cancelled and return to that account afterwards.
  sessionEpoch += 1;
  refreshPromise = null;
}
function deactivateSession() {
  invalidateSessionWork();
  activeSession = null;
  administratorSession = null;
  sessionTokenAliases.clear();
  forgetSession();
  sessionSubscribers.forEach((listener) => listener(null));
}
function resolveSessionToken(token) {
  return token && sessionTokenAliases.has(token) && activeSession
    ? activeSession.accessToken
    : token;
}
function canRefreshToken(token) {
  return Boolean(
    token &&
      sessionTokenAliases.has(token) &&
      activeSession &&
      !activeSession.actor?.impersonation &&
      activeSession.rememberedDevice !== false &&
      !refreshRejected &&
      !sessionTerminating,
  );
}
const pauseAuth = (milliseconds) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));
async function withStorageAuthLease(action) {
  // Fallback for embedded browsers without Web Locks. This stores no credentials.
  const key = "ecl.device-auth.lease";
  const owner = `${Date.now()}-${Math.random()}`;
  const deadline = Date.now() + 22000;
  let owned = false;
  while (!owned) {
    try {
      const lease = JSON.parse(window.localStorage.getItem(key) || "null");
      if (!lease || lease.expiresAt < Date.now()) {
        window.localStorage.setItem(
          key,
          JSON.stringify({ owner, expiresAt: Date.now() + 20000 }),
        );
        owned =
          JSON.parse(window.localStorage.getItem(key) || "null")?.owner ===
          owner;
      }
    } catch {
      return action();
    }
    if (!owned) {
      if (Date.now() >= deadline)
        throw new Ne(
          0,
          "Проверка входа занята в другом окне. Повторите попытку.",
        );
      await pauseAuth(150);
    }
  }
  try {
    return await action();
  } finally {
    try {
      if (
        JSON.parse(window.localStorage.getItem(key) || "null")?.owner === owner
      )
        window.localStorage.removeItem(key);
    } catch {}
  }
}
function withDeviceAuthLock(action) {
  const run = () =>
    window.navigator?.locks?.request
      ? window.navigator.locks.request("ecl-device-auth", action)
      : withStorageAuthLease(action);
  const pending = deviceAuthQueue.then(run, run);
  deviceAuthQueue = pending.catch(() => {});
  return pending;
}
async function authJson(path, payload = {}, token) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    return await ze(
      path,
      {
        method: "POST",
        credentials: "include",
        headers: { "X-Session-Refresh": "1" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
      token,
      false,
    );
  } catch (error) {
    if (controller.signal.aborted)
      throw new Ne(0, "Сервер не ответил вовремя. Повторите попытку.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
function refreshAccessSession(expectedActorId = activeSession?.actor?.id) {
  if (
    sessionTerminating ||
    refreshRejected ||
    activeSession?.actor?.impersonation ||
    activeSession?.rememberedDevice === false
  )
    return Promise.reject(new Ne(401, "Войдите по телефону и паролю."));
  if (refreshPromise) return refreshPromise;
  const epoch = sessionEpoch;
  const pending = withDeviceAuthLock(async () => {
    if (epoch !== sessionEpoch || sessionTerminating)
      throw new Ne(401, "Сессия изменилась.");
    let refreshed;
    for (let attempt = 0; ; attempt += 1) {
      try {
        refreshed = await el.refreshDevice();
        break;
      } catch (error) {
        if (!(error instanceof Ne) || error.status !== 409 || attempt >= 7)
          throw error;
        await pauseAuth(250);
      }
    }
    if (epoch !== sessionEpoch || sessionTerminating)
      throw new Ne(401, "Сессия изменилась.");
    if (expectedActorId && refreshed.actor.id !== expectedActorId)
      throw new Ne(401, "Сохранённый вход изменился. Войдите снова.");
    return activateSession({ ...refreshed, deviceCookieConfirmed: true });
  }).catch((error) => {
    if (
      epoch === sessionEpoch &&
      error instanceof Ne &&
      [401, 403].includes(error.status)
    ) {
      refreshRejected = true;
      deactivateSession();
    }
    throw error;
  });
  refreshPromise = pending;
  pending.then(
    () => {
      if (refreshPromise === pending) refreshPromise = null;
    },
    () => {
      if (refreshPromise === pending) refreshPromise = null;
    },
  );
  return pending;
}
async function restoreSession() {
  const epoch = sessionEpoch;
  const requireCurrentRestore = () => {
    if (epoch !== sessionEpoch) throw new Ne(409, "Сессия изменилась.");
  };
  let stored;
  try {
    stored = JSON.parse(
      window.sessionStorage.getItem(sessionStorageKey) || "null",
    );
  } catch {}
  const session = stored?.session;
  administratorSession = session?.actor?.impersonation ? stored?.administratorSession : null;
  if (
    session?.accessToken &&
    Number.isFinite(Date.parse(session.expiresAt)) &&
    Date.parse(session.expiresAt) > Date.now()
  ) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const actor = await el.me(session.accessToken, controller.signal);
      requireCurrentRestore();
      return activateSession({ ...session, actor });
    } catch (error) {
      requireCurrentRestore();
      if (controller.signal.aborted)
        throw new Ne(0, "Сервер не ответил вовремя. Повторите проверку.");
      if (!(error instanceof Ne) || ![401, 403].includes(error.status))
        throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }
  requireCurrentRestore();
  if (session?.actor?.impersonation)
    return returnToAdministrator("Вход в учётную запись сотрудника завершён. Вы вернулись в админку.", session);
  forgetSession();
  if (session?.rememberedDevice === false) return null;
  try {
    return await refreshAccessSession(session?.actor?.id);
  } catch (error) {
    if (error instanceof Ne && [401, 403].includes(error.status)) return null;
    throw error;
  }
}
async function enterEmployeeAccount(userId) {
  const parent = activeSession;
  if (!parent || parent.actor.role !== "access_admin" || parent.actor.impersonation || sessionTerminating)
    throw new Ne(403, "Вход доступен только из учётной записи администратора.");
  const epoch = ++sessionEpoch;
  const child = await ze("/auth/impersonate", {
    method: "POST", body: JSON.stringify({ userId }),
  }, parent.accessToken, false);
  if (epoch !== sessionEpoch || activeSession !== parent) {
    await ze("/auth/impersonate/stop", { method: "POST" }, child.accessToken, false).catch(() => {});
    throw new Ne(409, "Сессия изменилась. Повторите вход.");
  }
  const next = { ...child, rememberedDevice: false };
  try {
    // Both sessions must survive a reload together, and only in this tab.
    window.sessionStorage.setItem(sessionStorageKey, JSON.stringify({ session: next, administratorSession: parent }));
  } catch {
    await ze("/auth/impersonate/stop", { method: "POST" }, child.accessToken, false).catch(() => {});
    throw new Ne(0, "Разрешите хранение данных этой вкладки, чтобы сохранить возврат в админку.");
  }
  administratorSession = parent;
  sessionNotice = "";
  return activateSession(next);
}
function returnToAdministrator(message = "Вы вернулись в админку.", child = activeSession) {
  if (!child?.actor?.impersonation) return Promise.resolve(activeSession);
  if (impersonationReturnPromise) return impersonationReturnPromise;
  const parent = administratorSession;
  const epoch = ++sessionEpoch;
  sessionTerminating = true;
  const pending = (async () => {
    let actor;
    try {
      if (!parent?.accessToken || parent.actor?.impersonation || parent.actor?.role !== "access_admin")
        throw new Ne(401, "Сессия администратора завершена.");
      actor = await el.me(parent.accessToken);
      if (actor.impersonation || actor.role !== "access_admin" || actor.id !== parent.actor.id)
        throw new Ne(401, "Сессия администратора изменилась.");
    } catch (error) {
      if (epoch !== sessionEpoch) throw new Ne(409, "Сессия изменилась.");
      if (!(error instanceof Ne) || ![401, 403].includes(error.status)) throw error;
      sessionNotice = "Сессия администратора завершена. Войдите снова.";
      deactivateSession();
      return null;
    }
    if (child?.actor?.impersonation) {
      try {
        await ze("/auth/impersonate/stop", { method: "POST" }, child.accessToken, false);
      } catch (error) {
        if (!(error instanceof Ne) || ![401, 403].includes(error.status)) throw error;
      }
    }
    if (epoch !== sessionEpoch) throw new Ne(409, "Сессия изменилась.");
    administratorSession = null;
    sessionNotice = message;
    return activateSession({ ...parent, actor });
  })().finally(() => {
    sessionTerminating = false;
    if (impersonationReturnPromise === pending) impersonationReturnPromise = null;
  });
  impersonationReturnPromise = pending;
  return pending;
}
function phoneHintCanApply(currentPhone, phoneAtRequest) {
  return currentPhone === phoneAtRequest;
}
// End isolated messenger integration.

const el = {
  demoProfiles: () => ze("/auth/demo/profiles"),
  demoLogin: (c) =>
    ze("/auth/demo", { method: "POST", body: JSON.stringify({ userId: c }) }),
  passwordLogin: (phone, password, rememberDevice = true) => {
    sessionEpoch += 1;
    refreshRejected = false;
    return withDeviceAuthLock(async () => {
      const session = await authJson("/auth/password", {
        phone,
        password,
        rememberDevice,
      });
      let deviceCookieConfirmed = false;
      if (rememberDevice) {
        try {
          deviceCookieConfirmed =
            (await authJson("/auth/device-status")).rememberedDevice === true;
        } catch {
          deviceCookieConfirmed = null;
        }
      }
      return {
        ...session,
        rememberDeviceRequested: rememberDevice,
        deviceCookieConfirmed,
        rememberedDevice:
          rememberDevice &&
          deviceCookieConfirmed !== false &&
          session.rememberedDevice !== false,
      };
    });
  },
  refreshDevice: () => authJson("/auth/refresh"),
  phoneHint: (provider, initData) =>
    ze("/auth/phone-hint", {
      method: "POST",
      body: JSON.stringify({ provider, initData }),
    }),
  me: (token, signal) => ze("/me", { signal }, token, false),
  logout: (token) => {
    sessionTerminating = true;
    sessionEpoch += 1;
    return withDeviceAuthLock(async () => {
      try {
        const result = await authJson(
          "/auth/logout",
          {},
          resolveSessionToken(token),
        );
        deactivateSession();
        return result;
      } finally {
        sessionTerminating = false;
      }
    });
  },
  trips: (c, d, f) => {
    const r = new URLSearchParams({ limit: "20" });
    return (d && r.set("cursor", d), ze(`/trips?${r}`, { signal: f }, c));
  },
  trip: (c, d, f) => ze(`/trips/${encodeURIComponent(d)}`, { signal: f }, c),
};
function Ye(c, d, f) {
  return ze(d, { method: "POST", body: JSON.stringify(f) }, c);
}
async function prepareMaxDownload(token, filename, getBlob, inspectionPhotoId) {
  // MAX only accepts HTTPS download URLs and requires a fresh user click.
  // Keep the second click inside the native dialog after preparation completes.
  const previousFocus = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "max-download-dialog surface";
  dialog.setAttribute("aria-labelledby", "max-download-title");
  const title = document.createElement("h2");
  title.id = "max-download-title";
  title.textContent = "Скачать файл";
  const name = document.createElement("p");
  name.textContent = filename;
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.textContent = "Подготавливаем файл…";
  const actions = document.createElement("div");
  actions.className = "action-row";
  const download = document.createElement("button");
  download.type = "button";
  download.className = "button primary";
  download.textContent = "Скачать файл";
  download.disabled = true;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "button secondary";
  close.textContent = "Закрыть";
  close.onclick = () => dialog.close();
  actions.append(download, close);
  dialog.append(title, name, status, actions);
  dialog.addEventListener(
    "close",
    () => {
      dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
    },
    { once: true },
  );
  document.body.appendChild(dialog);
  dialog.showModal();
  try {
    if (!token)
      throw new Error("Сессия завершена. Откройте приложение заново.");
    const blob = await getBlob();
    if (blob.size > 8 * 1024 * 1024)
      throw new Error("Скачать через MAX можно файл размером до 8 МБ.");
    const contentBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Не удалось подготовить файл."));
      reader.readAsDataURL(blob);
    });
    if (!dialog.isConnected) return;
    const prepared = await Ye(token, "/max/downloads", {
      filename,
      contentType: blob.type || "application/octet-stream",
      contentBase64,
      ...(inspectionPhotoId ? { inspectionPhotoId } : {}),
    });
    if (inspectionPhotoId && typeof prepared.filename === "string") {
      filename = prepared.filename;
      name.textContent = filename;
    }
    if (!dialog.isConnected) return;
    const url = new URL(prepared.url, window.location.href);
    if (url.protocol !== "https:" || url.origin !== window.location.origin)
      throw new Error("Сервер вернул некорректную ссылку на файл.");
    status.textContent =
      "Файл готов. Нажмите «Скачать файл», чтобы сохранить его на устройство.";
    download.disabled = false;
    download.focus();
    download.onclick = async () => {
      download.disabled = true;
      status.textContent = "Передаём файл в MAX…";
      try {
        if (!window.WebApp?.downloadFile)
          throw new Error("Обновите MAX, чтобы скачивать файлы.");
        await window.WebApp.downloadFile(url.href, filename);
        status.textContent = "Файл передан в MAX для скачивания.";
      } catch {
        status.textContent =
          "Не удалось скачать файл. Закройте окно и подготовьте файл заново.";
      }
    };
  } catch (error) {
    if (dialog.isConnected) {
      status.textContent = $a(error);
      status.setAttribute("role", "alert");
    }
  }
}
async function loadTeamFile(token, path, options = {}) {
  const response = await authenticatedFetch(path, options, token);
  if (!response.ok)
    throw new Ne(response.status, Yp[response.status] ?? "Не удалось загрузить файл.");
  return response.blob();
}
async function Wy(token, path, filename) {
  const getBlob = () => loadTeamFile(token, path);
  if (messengerProvider === "max")
    return prepareMaxDownload(token, filename, getBlob, /^\/inspections\/photos\/([0-9a-f-]{36})\/download$/i.exec(path)?.[1]);
  const url = URL.createObjectURL(await getBlob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Ho(filename, content, contentType = "text/csv;charset=utf-8", token) {
  const blob = new Blob([content], { type: contentType });
  if (messengerProvider === "max")
    return prepareMaxDownload(token, filename, () => Promise.resolve(blob));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Jl(c) {
  const [d, f] = h.useState(!1),
    [r, g] = h.useState(""),
    [p, b] = h.useState("");
  async function D(J, j = "") {
    (f(!0), g(""), b(""));
    try {
      const U = await J();
      return (b(j), U);
    } catch (U) {
      U instanceof Ne && U.status === 401
        ? c()
        : g(
            U instanceof Ne
              ? U.message
              : "Не удалось выполнить действие. Проверьте связь и повторите попытку.",
          );
      return;
    } finally {
      f(!1);
    }
  }
  return { busy: d, error: r, success: p, run: D, setError: g, setSuccess: b };
}
function Ot({ error: c, success: d }) {
  return n.jsxs(n.Fragment, {
    children: [
      c && n.jsx("div", { className: "error", role: "alert", children: c }),
      d && n.jsx("div", { className: "success", role: "status", children: d }),
    ],
  });
}
function ue({ label: c, children: d, hint: f }) {
  return n.jsxs("label", {
    className: "field",
    children: [
      n.jsx("span", { children: c }),
      d,
      f && n.jsx("small", { children: f }),
    ],
  });
}
function je(c) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
  }).format(c / 100);
}
function et(c) {
  return (
    new Date(c).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    }) + " МСК"
  );
}
function gl(c) {
  const d = c.trim();
  if (!/^\d{1,11}(?:[.,]\d{1,2})?$/.test(d))
    throw new Error("Укажите неотрицательную сумму с точностью до копейки.");
  const [f, r = ""] = d.replace(",", ".").split("."),
    g = BigInt(f) * 100n + BigInt(r.padEnd(2, "0"));
  if (g > 10000000000000n)
    throw new Error("Сумма превышает допустимый предел.");
  return Number(g);
}
function Zl() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
const Cn = {
  route: "Пробег маршрута",
  warehouse_radius: "Радиус от склада",
  mkad_radius: "Удалённость от МКАД",
  leg: "Расстояние плеча",
};
function Jo(c, d) {
  return (
    (c.role === "dispatcher" || c.role === "document_specialist") &&
    c.grants.some(
      (f) =>
        f.financeVisible &&
        f.legalEntityId === d.legalEntityId &&
        f.regionId === d.regionId &&
        f.projectId === d.projectId &&
        f.responsibilityScopeId === d.responsibilityScopeId,
    )
  );
}
function ni(c, d) {
  const f = c.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(f))
    throw new Ne(
      400,
      `${d}: введите неотрицательное число, до двух знаков после запятой.`,
    );
  const [r, g = ""] = f.split("."),
    p = Number(r) * 100 + Number(g.padEnd(2, "0"));
  if (!Number.isSafeInteger(p))
    throw new Ne(400, `${d}: слишком большое число.`);
  return p;
}
function ti(c, d) {
  if (ni(c, d) > 1e9)
    throw new Ne(400, `${d}: максимальная сумма — 10 000 000 ₽.`);
  return gl(c.trim());
}
function Kc(c, d) {
  if (!/^\d+$/.test(c.trim()) || !Number.isSafeInteger(Number(c)))
    throw new Ne(400, `${d}: введите целое неотрицательное число.`);
  return Number(c);
}
const bt = (c) => (c === null ? "" : (c / 100).toFixed(2)),
  zc = (c, d) => (c.trim() === "" ? null : ti(c, d)),
  Vp = (c, d) => (c.trim() === "" ? null : ni(c, d));
function Lc({ result: c, title: d }) {
  return n.jsxs("section", {
    className: "pricing-breakdown",
    children: [
      n.jsxs("div", {
        className: "row-between",
        children: [
          n.jsx("h4", { children: d }),
          n.jsx("strong", {
            children:
              c.totalKopecks === null ? "Не определено" : je(c.totalKopecks),
          }),
        ],
      }),
      c.lines.length > 0 &&
        n.jsx("div", {
          className: "table-scroll",
          children: n.jsxs("table", {
            children: [
              n.jsx("thead", {
                children: n.jsxs("tr", {
                  children: [
                    n.jsx("th", { children: "Начисление" }),
                    n.jsx("th", { children: "Количество × ставка" }),
                    n.jsx("th", { children: "Сумма" }),
                  ],
                }),
              }),
              n.jsx("tbody", {
                children: c.lines.map((f, r) =>
                  n.jsxs(
                    "tr",
                    {
                      children: [
                        n.jsxs("td", {
                          children: [
                            f.label,
                            n.jsx("small", { children: f.explanation }),
                          ],
                        }),
                        n.jsxs("td", {
                          children: [
                            new Intl.NumberFormat("ru-RU", {
                              maximumFractionDigits: 2,
                            }).format(f.quantity),
                            " × ",
                            je(f.rateKopecks),
                          ],
                        }),
                        n.jsx("td", { children: je(f.amountKopecks) }),
                      ],
                    },
                    `${f.code}-${r}`,
                  ),
                ),
              }),
            ],
          }),
        }),
      c.issues.map((f, r) =>
        n.jsx(
          "p",
          { className: "pricing-issue", children: f.message },
          `${f.code}-${r}`,
        ),
      ),
    ],
  });
}
function Py({ rules: c }) {
  const d = (f) => (f === null ? "Неизвестна" : je(f));
  return n.jsxs("div", {
    className: "pricing-stored-rules",
    children: [
      n.jsx("p", {
        className: "input-hint",
        children: "Единица — один рейс; суммы без НДС.",
      }),
      c.baseKind === "fixed"
        ? n.jsxs("p", {
            children: [
              "Основная цена: ",
              n.jsx("strong", { children: je(c.baseKopecks) }),
            ],
          })
        : n.jsxs(n.Fragment, {
            children: [
              n.jsxs("p", {
                children: ["Выбор основной цены: ", Cn[c.distanceMetric], "."],
              }),
              n.jsx("div", {
                className: "table-scroll",
                children: n.jsxs("table", {
                  children: [
                    n.jsx("thead", {
                      children: n.jsxs("tr", {
                        children: [
                          n.jsx("th", { children: "Расстояние, км" }),
                          n.jsx("th", { children: "Основная цена" }),
                        ],
                      }),
                    }),
                    n.jsx("tbody", {
                      children: c.distanceBands.map((f, r) =>
                        n.jsxs(
                          "tr",
                          {
                            children: [
                              n.jsxs("td", {
                                children: [
                                  r === 0
                                    ? "От 0"
                                    : `Свыше ${bt(c.distanceBands[r - 1].upToHundredths)}`,
                                  " до ",
                                  bt(f.upToHundredths),
                                  " включительно",
                                ],
                              }),
                              n.jsx("td", { children: je(f.amountKopecks) }),
                            ],
                          },
                          f.upToHundredths,
                        ),
                      ),
                    }),
                  ],
                }),
              }),
              n.jsx("p", {
                className: "input-hint",
                children: "Выше последней границы цена неизвестна.",
              }),
            ],
          }),
      n.jsx("div", {
        className: "table-scroll",
        children: n.jsxs("table", {
          children: [
            n.jsx("thead", {
              children: n.jsxs("tr", {
                children: [
                  n.jsx("th", { children: "Компонент" }),
                  n.jsx("th", { children: "Включено" }),
                  n.jsx("th", { children: "Доплата" }),
                ],
              }),
            }),
            n.jsxs("tbody", {
              children: [
                n.jsxs("tr", {
                  children: [
                    n.jsx("td", { children: "Точки" }),
                    n.jsx("td", { children: c.includedStops }),
                    n.jsxs("td", {
                      children: [
                        d(c.extraStopKopecks),
                        " за дополнительную точку",
                      ],
                    }),
                  ],
                }),
                n.jsxs("tr", {
                  children: [
                    n.jsx("td", { children: "Пробег маршрута" }),
                    n.jsx("td", {
                      children:
                        c.includedKilometersHundredths === null
                          ? "Компонент отключён"
                          : `${bt(c.includedKilometersHundredths)} км`,
                    }),
                    n.jsx("td", {
                      children:
                        c.includedKilometersHundredths === null
                          ? "—"
                          : `${d(c.extraKilometerKopecks)} за дополнительный км`,
                    }),
                  ],
                }),
                n.jsxs("tr", {
                  children: [
                    n.jsx("td", { children: "Время работы" }),
                    n.jsx("td", {
                      children:
                        c.includedMinutes === null
                          ? "Компонент отключён"
                          : `${c.includedMinutes} минут`,
                    }),
                    n.jsx("td", {
                      children:
                        c.includedMinutes === null
                          ? "—"
                          : `${d(c.extraTimeKopecks)} за ${c.extraTimeUnit === "minute" ? "минуту" : "начатый час"}`,
                    }),
                  ],
                }),
                n.jsxs("tr", {
                  children: [
                    n.jsx("td", { children: "Специальная точка / зоопт" }),
                    n.jsx("td", {
                      colSpan: 2,
                      children:
                        c.specialStopKopecks === null
                          ? "Услуга отключена"
                          : `${je(c.specialStopKopecks)} однократно за наличие в маршруте`,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      }),
    ],
  });
}
const Is = {
    baseKind: "fixed",
    base: "11500",
    distanceMetric: "route",
    bands: [],
    stops: "10",
    extraStop: "140",
    kilometers: "150",
    extraKilometer: "20",
    minutes: "",
    extraTimeUnit: "started_hour",
    extraTime: "",
    specialStop: "550",
  },
  Xs = [
    {
      label: "11 500 ₽ + точки и пробег",
      name: "Рейс до 10 точек и 150 км",
      side: "client",
      source:
        "Тариф 11 500 руб. без НДС за рейс до 10 точек. Начиная с 11 точки — 140 руб. без НДС. До 150 км по городу, далее 20 руб. за каждый км. Если в маршруте есть зоопт — доплата 550 руб.",
      note: "Согласуйте состав пробега, определение точки, расчёт дробных километров и однократность доплаты «зоопт». Подтвердите базу без НДС для всех доплат и сторону договора.",
      rules: Is,
    },
    {
      label: "Исполнителю: 12 300 ₽",
      name: "Исполнителю до 40 точек и 100 км",
      side: "executor",
      source:
        "12 300 до 40 точек включительно. С 41 точки: 12 300 + 100 руб. точка. Маршрут с 45 точками — водителю 12 800 руб. 100 км включено, с 101 км — 20 руб./км.",
      note: "Согласуйте оплату за один рейс, НДС и начисление за дробный пробег после 100 км. Получатель в примере — водитель.",
      rules: {
        ...Is,
        base: "12300",
        stops: "40",
        extraStop: "100",
        kilometers: "100",
        specialStop: "",
      },
    },
    {
      label: "Перевозчику: 45 ₽/км + 60 ₽/точку",
      name: "Перевозчику по пробегу и точкам",
      side: "executor",
      source:
        "45 руб./км. 60 руб./точка. В среднем за день выходит 11 000 руб.",
      note: "Среднее за день не является гарантированным минимумом. Согласуйте НДС, состав пробега и точек, оплату за маршрут.",
      rules: {
        ...Is,
        base: "0",
        stops: "0",
        extraStop: "60",
        kilometers: "0",
        extraKilometer: "45",
        specialStop: "",
      },
    },
    {
      label: "Своя таблица по расстоянию",
      name: "",
      side: "client",
      source: "",
      note: "Укажите одну категорию ТС в названии и договоре. Заполните согласованную таблицу именно за рейс. Дневные, весовые тарифы и спорные условия догруза требуют отдельного согласования.",
      rules: {
        ...Is,
        baseKind: "distance_bands",
        base: "0",
        bands: [{ upper: "", amount: "" }],
        stops: "0",
        extraStop: "",
        kilometers: "",
        extraKilometer: "",
        specialStop: "",
      },
    },
  ];
function Dp(c) {
  const d =
    c.baseKind === "distance_bands"
      ? c.bands.map((f) => ({
          upToHundredths: ni(f.upper, "Верхняя граница"),
          amountKopecks: ti(f.amount, "Ставка диапазона"),
        }))
      : [];
  if (d.some((f, r) => r > 0 && f.upToHundredths <= d[r - 1].upToHundredths))
    throw new Ne(400, "Верхние границы таблицы должны строго возрастать.");
  return {
    baseKind: c.baseKind,
    baseKopecks: c.baseKind === "fixed" ? ti(c.base, "База") : 0,
    distanceMetric: c.baseKind === "fixed" ? "route" : c.distanceMetric,
    distanceBands: d,
    includedStops: Kc(c.stops, "Включённые точки"),
    extraStopKopecks: zc(c.extraStop, "Дополнительная точка"),
    includedKilometersHundredths: Vp(c.kilometers, "Включённые километры"),
    extraKilometerKopecks: zc(c.extraKilometer, "Дополнительный километр"),
    includedMinutes:
      c.minutes.trim() === "" ? null : Kc(c.minutes, "Включённые минуты"),
    extraTimeUnit: c.extraTimeUnit,
    extraTimeKopecks: zc(c.extraTime, "Дополнительное время"),
    specialStopKopecks: zc(c.specialStop, "Специальная точка"),
  };
}
function eg(c) {
  return {
    baseKind: c.baseKind,
    base: bt(c.baseKopecks),
    distanceMetric: c.distanceMetric,
    bands: c.distanceBands.map((d) => ({
      upper: bt(d.upToHundredths),
      amount: bt(d.amountKopecks),
    })),
    stops: String(c.includedStops),
    extraStop: bt(c.extraStopKopecks),
    kilometers: bt(c.includedKilometersHundredths),
    extraKilometer: bt(c.extraKilometerKopecks),
    minutes: c.includedMinutes === null ? "" : String(c.includedMinutes),
    extraTimeUnit: c.extraTimeUnit,
    extraTime: bt(c.extraTimeKopecks),
    specialStop: bt(c.specialStopKopecks),
  };
}
function tg(c) {
  return !(
    c.actor.role === "dispatcher" || c.actor.role === "document_specialist"
  ) || !c.actor.grants.some((f) => f.financeVisible)
    ? null
    : n.jsx(lg, { ...c });
}
function lg({ token: c, actor: d, onExpired: f }) {
  const [r, g] = h.useState(null),
    [p, b] = h.useState([]),
    [D, J] = h.useState(!1),
    [j, U] = h.useState(0),
    [y, L] = h.useState(0),
    [M, ee] = h.useState(Xs[0].name),
    [te, R] = h.useState("client"),
    [re, le] = h.useState(""),
    [K, I] = h.useState(Zl()),
    [k, Z] = h.useState(""),
    [G, E] = h.useState(Xs[0].source),
    [se, P] = h.useState(Xs[0].note),
    [H, fe] = h.useState(!1),
    [Y, xe] = h.useState(null),
    [ae, V] = h.useState(Is),
    [W, he] = h.useState({
      stops: "12",
      kilometers: "170",
      minutes: "600",
      special: "yes",
      bandDistance: "",
    }),
    [ve, oe] = h.useState(null),
    [ce, B] = h.useState(null),
    [de, v] = h.useState(""),
    m = Jl(f),
    S = h.useRef(crypto.randomUUID()),
    _ = h.useRef({}),
    ie = r?.scopes.filter((O) => Jo(d, O)) ?? [],
    relatedTariff = !Y && p.find((tariff) => tariff.contractReference === re.trim() && tariff.side === te),
    ye = (relatedTariff && ie.find((scope) => scope.projectId === relatedTariff.projectId && scope.responsibilityScopeId === relatedTariff.responsibilityScopeId)) || ie[y],
    Te = d.role === "document_specialist";
  async function ne() {
    const [O, Ee] = await Promise.all([
      ze("/finance/pricing/tariffs", {}, c),
      ze("/workflow/catalog", {}, c),
    ]);
    (b(O.items), g(Ee));
  }
  h.useEffect(() => {
    m.run(ne);
  }, [c]);
  function pe() {
    ((S.current = crypto.randomUUID()), oe(null), B(null));
  }
  function F(O, Ee) {
    V((st) => ({ ...st, [O]: Ee }));
  }
  function Ae(O) {
    const Ee = Xs[O];
    (U(O),
      V(Ee.rules),
      ee(Ee.name),
      R(Ee.side),
      E(Ee.source),
      P(Ee.note),
      le(""),
      fe(!1),
      xe(null),
      I(Zl()),
      Z(""),
      J(!0),
      he({
        stops: O === 1 ? "45" : "12",
        kilometers: O === 1 ? "100" : "170",
        minutes: "600",
        special: O === 0 ? "yes" : "no",
        bandDistance: "",
      }),
      pe());
  }
  function at(O) {
    const Ee = ie.findIndex(
      (st) =>
        st.projectId === O.projectId &&
        st.responsibilityScopeId === O.responsibilityScopeId,
    );
    Ee < 0 ||
      (L(Ee),
      V(eg(O.rules)),
      ee(O.name),
      R(O.side),
      E(O.sourceText),
      P(O.termsNote),
      le(O.contractReference),
      fe(!1),
      xe(O.id),
      I(O.status === "published" ? Zl() : O.effectiveFrom),
      Z(O.effectiveTo ?? ""),
      J(!0),
      pe());
  }
  function Ve(O) {
    const Ee = O === "route" ? null : Vp(W.bandDistance, Cn[O]);
    return {
      stops: Kc(W.stops, "Точки примера"),
      kilometersHundredths: ni(W.kilometers, "Пробег примера"),
      minutes: Kc(W.minutes, "Время примера"),
      specialStop: W.special === "unknown" ? null : W.special === "yes",
      warehouseRadiusHundredths: O === "warehouse_radius" ? Ee : null,
      mkadRadiusHundredths: O === "mkad_radius" ? Ee : null,
      legDistanceHundredths: O === "leg" ? Ee : null,
    };
  }
  async function De(O, Ee = null) {
    const st = await Ye(c, "/finance/pricing/preview", {
      rules: O,
      facts: Ve(O.distanceMetric),
    });
    (oe(st), B(Ee));
  }
  function we(O, Ee) {
    (he((st) => ({ ...st, [O]: Ee })), oe(null), B(null));
  }
  const Le = p.find((O) => O.id === de);
  function Xe(O, Ee, st) {
    return n.jsx(ue, {
      label: O,
      hint: st,
      children: n.jsx("input", {
        inputMode: Ee === "stops" || Ee === "minutes" ? "numeric" : "decimal",
        value: ae[Ee],
        onChange: (pt) => F(Ee, pt.target.value),
      }),
    });
  }
  return n.jsxs("div", {
    className: "pricing-workspace",
    children: [
      n.jsxs("div", {
        className: "section-heading",
        children: [
          n.jsxs("div", {
            children: [
              n.jsx("h2", { children: "Конструктор тарифов" }),
              n.jsx("p", {
                className: "muted",
                children:
                  "Отдельные условия клиента и исполнителя. Начисления за один рейс, все суммы без НДС.",
              }),
            ],
          }),
          n.jsx("button", {
            className: "button primary",
            disabled: m.busy,
            onClick: () => (D ? J(!1) : Ae(0)),
            children: D ? "Закрыть форму" : "Создать тариф",
          }),
        ],
      }),
      n.jsx(Ot, { ...m }),
      n.jsx("p", {
        className: "help-callout",
        children:
          "Шаблоны перенесены из описания условий и требуют проверки договора. Суточные ставки, вес, резерв и спорный догруз в этот расчёт не включены. Публикация доступна документоведу с финансовым доступом.",
      }),
      D &&
        n.jsx("form", {
          className: "surface data-form pricing-editor",
          onChange: pe,
          onSubmit: (O) => {
            (O.preventDefault(),
              m.run(async () => {
                if (!ye)
                  throw new Ne(400, "Нет доступа к созданию тарифов. Обратитесь к администратору.");
                if (M.trim().length < 3)
                  throw new Ne(
                    400,
                    "Название тарифа должно содержать не менее 3 символов.",
                  );
                if (k && k <= K)
                  throw new Ne(
                    400,
                    "Дата окончания должна быть позже даты начала; дата окончания не входит в период.",
                  );
                const Ee = {
                  projectId: ye.projectId,
                  responsibilityScopeId: ye.responsibilityScopeId,
                  name: M.trim(),
                  side: te,
                  contractReference: re.trim(),
                  effectiveFrom: K,
                  effectiveTo: k || null,
                  sourceText: G.trim(),
                  termsNote: se.trim(),
                  amountsAreNet: H,
                  rules: Dp(ae),
                  previousVersionId: Y,
                  idempotencyKey: S.current,
                };
                (await Ye(c, "/finance/pricing/tariffs", Ee),
                  (S.current = crypto.randomUUID()),
                  J(!1),
                  oe(null),
                  await ne());
              }, "Черновик тарифа сохранён. Проверьте пример расчёта перед публикацией."));
          },
          children: n.jsxs("fieldset", {
            className: "pricing-fields",
            disabled: m.busy,
            children: [
              n.jsx("h3", {
                children: Y
                  ? "Новая версия по существующему тарифу"
                  : "Новый черновик",
              }),
              !Y &&
                n.jsx(ue, {
                  label: "Начать с шаблона",
                  children: n.jsx("select", {
                    value: j,
                    onChange: (O) => Ae(Number(O.target.value)),
                    children: Xs.map((O, Ee) =>
                      n.jsx(
                        "option",
                        { value: Ee, children: O.label },
                        O.label,
                      ),
                    ),
                  }),
                }),
              n.jsxs("div", {
                className: "form-grid",
                children: [
                  n.jsx(ue, {
                    label: "Название и категория ТС",
                    children: n.jsx("input", {
                      required: !0,
                      minLength: 3,
                      maxLength: 160,
                      value: M,
                      onChange: (O) => ee(O.target.value),
                      placeholder: "Например, Рефрижератор 1,5 т · клиент",
                    }),
                  }),
                  n.jsx(ue, {
                    label: "Сторона расчёта",
                    children: n.jsxs("select", {
                      value: te,
                      disabled: !!Y,
                      onChange: (O) => R(O.target.value),
                      children: [
                        n.jsx("option", {
                          value: "client",
                          children: "От клиента",
                        }),
                        n.jsx("option", {
                          value: "executor",
                          children: "Исполнителю",
                        }),
                      ],
                    }),
                  }),
                ],
              }),
              n.jsx(ue, {
                label: "Договор / спецификация",
                children: n.jsx("input", {
                  required: !0,
                  maxLength: 200,
                  value: re,
                  onChange: (O) => le(O.target.value),
                  placeholder: "Номер договора, контрагент и спецификация",
                }),
              }),
              n.jsxs("div", {
                className: "form-grid",
                children: [
                  n.jsx(ue, {
                    label: "Действует с",
                    children: n.jsx("input", {
                      type: "date",
                      required: !0,
                      value: K,
                      onChange: (O) => I(O.target.value),
                    }),
                  }),
                  n.jsx(ue, {
                    label: "Действует до, не включая дату",
                    hint: "Пусто — без даты окончания",
                    children: n.jsx("input", {
                      type: "date",
                      min: K,
                      value: k,
                      onChange: (O) => Z(O.target.value),
                    }),
                  }),
                ],
              }),
              n.jsxs("div", {
                className: "pricing-rule-heading",
                children: [
                  n.jsx("h3", { children: "Основа расчёта" }),
                  n.jsx("span", {
                    className: "workflow-badge",
                    children: "За один рейс",
                  }),
                ],
              }),
              n.jsx(ue, {
                label: "Основная ставка",
                children: n.jsxs("select", {
                  value: ae.baseKind,
                  onChange: (O) =>
                    V({
                      ...ae,
                      baseKind: O.target.value,
                      bands: ae.bands.length
                        ? ae.bands
                        : [{ upper: "", amount: "" }],
                    }),
                  children: [
                    n.jsx("option", {
                      value: "fixed",
                      children: "Фиксированная цена",
                    }),
                    n.jsx("option", {
                      value: "distance_bands",
                      children: "Таблица по расстоянию",
                    }),
                  ],
                }),
              }),
              ae.baseKind === "fixed"
                ? Xe("Основная цена, ₽", "base")
                : n.jsxs(n.Fragment, {
                    children: [
                      n.jsx(ue, {
                        label: "Расстояние для выбора строки",
                        children: n.jsx("select", {
                          value: ae.distanceMetric,
                          onChange: (O) => F("distanceMetric", O.target.value),
                          children: Object.entries(Cn).map(([O, Ee]) =>
                            n.jsx("option", { value: O, children: Ee }, O),
                          ),
                        }),
                      }),
                      n.jsx("p", {
                        className: "input-hint",
                        children:
                          "Первая строка начинается с 0 км. Каждая следующая — строго выше предыдущей границы, до своей границы включительно. Шаг 0,01 км. Выше последней границы цена неизвестна. Это согласуемые непрерывные интервалы; проверьте их по договору.",
                      }),
                      ae.bands.map((O, Ee) =>
                        n.jsxs(
                          "div",
                          {
                            className: "pricing-band-row",
                            children: [
                              n.jsx(ue, {
                                label: `Строка ${Ee + 1}: до км включительно`,
                                children: n.jsx("input", {
                                  inputMode: "decimal",
                                  value: O.upper,
                                  onChange: (st) =>
                                    F(
                                      "bands",
                                      ae.bands.map((pt, Qt) =>
                                        Qt === Ee
                                          ? { ...pt, upper: st.target.value }
                                          : pt,
                                      ),
                                    ),
                                }),
                              }),
                              n.jsx(ue, {
                                label: "Полная основная цена, ₽",
                                children: n.jsx("input", {
                                  inputMode: "decimal",
                                  value: O.amount,
                                  onChange: (st) =>
                                    F(
                                      "bands",
                                      ae.bands.map((pt, Qt) =>
                                        Qt === Ee
                                          ? { ...pt, amount: st.target.value }
                                          : pt,
                                      ),
                                    ),
                                }),
                              }),
                              n.jsx("button", {
                                type: "button",
                                className: "text-button",
                                disabled: ae.bands.length <= 1,
                                onClick: () => {
                                  (F(
                                    "bands",
                                    ae.bands.filter((st, pt) => pt !== Ee),
                                  ),
                                    pe());
                                },
                                children: "Удалить",
                              }),
                            ],
                          },
                          Ee,
                        ),
                      ),
                      n.jsx("button", {
                        type: "button",
                        className: "button secondary",
                        disabled: ae.bands.length >= 30,
                        onClick: () => {
                          (F("bands", [...ae.bands, { upper: "", amount: "" }]),
                            pe());
                        },
                        children: "Добавить диапазон",
                      }),
                    ],
                  }),
              n.jsx("h3", { children: "Лимиты и доплаты" }),
              n.jsx("p", {
                className: "input-hint",
                children:
                  "Пустая ставка за превышение означает «неизвестно», 0 — согласованную нулевую доплату. Пустой лимит пробега или времени отключает этот компонент. Пробег сверх лимита всегда берётся по маршруту.",
              }),
              n.jsxs("div", {
                className: "form-grid",
                children: [
                  Xe("Включено точек", "stops"),
                  Xe("За точку сверх лимита, ₽", "extraStop"),
                  Xe(
                    "Включено км маршрута",
                    "kilometers",
                    "Пусто — компонент отключён",
                  ),
                  Xe("За дополнительный км, ₽", "extraKilometer"),
                  Xe(
                    "Включено минут работы",
                    "minutes",
                    "600 минут = 10 часов; пусто — компонент отключён",
                  ),
                  n.jsx(ue, {
                    label: "Единица доплаты за время",
                    children: n.jsxs("select", {
                      value: ae.extraTimeUnit,
                      onChange: (O) => F("extraTimeUnit", O.target.value),
                      children: [
                        n.jsx("option", {
                          value: "started_hour",
                          children: "Каждый начатый час",
                        }),
                        n.jsx("option", {
                          value: "minute",
                          children: "Каждая минута",
                        }),
                      ],
                    }),
                  }),
                  Xe("За единицу дополнительного времени, ₽", "extraTime"),
                  Xe(
                    "Специальная точка / зоопт, ₽",
                    "specialStop",
                    "Одна доплата за наличие; пусто — услуга отключена",
                  ),
                ],
              }),
              n.jsx(ue, {
                label: "Исходные условия",
                children: n.jsx("textarea", {
                  required: !0,
                  rows: 4,
                  maxLength: 1e4,
                  value: G,
                  onChange: (O) => E(O.target.value),
                }),
              }),
              n.jsx(ue, {
                label: "Согласованные трактовки и ограничения",
                children: n.jsx("textarea", {
                  rows: 3,
                  maxLength: 2e3,
                  value: se,
                  onChange: (O) => P(O.target.value),
                }),
              }),
              n.jsxs("label", {
                className: "checkbox-label",
                children: [
                  n.jsx("input", {
                    type: "checkbox",
                    checked: H,
                    onChange: (O) => fe(O.target.checked),
                  }),
                  "Проверено по договору: все введённые суммы сопоставимы без НДС; единица оплаты и трактовки согласованы.",
                ],
              }),
              n.jsxs("section", {
                className: "pricing-example",
                children: [
                  n.jsx("h3", { children: "Проверить на примере" }),
                  n.jsx("p", {
                    className: "input-hint",
                    children:
                      "Это только проверка формулы; она не создаёт начисление по рейсу.",
                  }),
                  n.jsxs("div", {
                    className: "form-grid three",
                    children: [
                      n.jsx(ue, {
                        label: "Точек",
                        children: n.jsx("input", {
                          inputMode: "numeric",
                          value: W.stops,
                          onChange: (O) => he({ ...W, stops: O.target.value }),
                        }),
                      }),
                      n.jsx(ue, {
                        label: "Пробег, км",
                        children: n.jsx("input", {
                          inputMode: "decimal",
                          value: W.kilometers,
                          onChange: (O) =>
                            he({ ...W, kilometers: O.target.value }),
                        }),
                      }),
                      n.jsx(ue, {
                        label: "Минут работы",
                        children: n.jsx("input", {
                          inputMode: "numeric",
                          value: W.minutes,
                          onChange: (O) =>
                            he({ ...W, minutes: O.target.value }),
                        }),
                      }),
                    ],
                  }),
                  n.jsxs("div", {
                    className: "form-grid",
                    children: [
                      n.jsx(ue, {
                        label: "Есть специальная точка / зоопт",
                        children: n.jsxs("select", {
                          value: W.special,
                          onChange: (O) =>
                            he({ ...W, special: O.target.value }),
                          children: [
                            n.jsx("option", {
                              value: "unknown",
                              children: "Неизвестно",
                            }),
                            n.jsx("option", { value: "no", children: "Нет" }),
                            n.jsx("option", { value: "yes", children: "Да" }),
                          ],
                        }),
                      }),
                      ae.baseKind === "distance_bands" &&
                        ae.distanceMetric !== "route" &&
                        n.jsx(ue, {
                          label: `${Cn[ae.distanceMetric]}, км`,
                          children: n.jsx("input", {
                            inputMode: "decimal",
                            value: W.bandDistance,
                            onChange: (O) =>
                              he({ ...W, bandDistance: O.target.value }),
                          }),
                        }),
                    ],
                  }),
                  n.jsx("button", {
                    type: "button",
                    className: "button secondary",
                    disabled: m.busy,
                    onClick: () => {
                      m.run(() => De(Dp(ae)));
                    },
                    children: "Рассчитать пример",
                  }),
                  ve &&
                    !ce &&
                    n.jsx(Lc, { title: "Пример расчёта без НДС", result: ve }),
                ],
              }),
              n.jsx("button", {
                className: "button primary",
                disabled: m.busy || !ye,
                children: "Сохранить черновик",
              }),
            ],
          }),
        }),
      n.jsxs("div", {
        className: "section-heading",
        children: [
          n.jsxs("h3", { children: ["Сохранённые тарифы · ", p.length] }),
          n.jsx("button", {
            className: "text-button",
            disabled: m.busy,
            onClick: () => {
              m.run(ne);
            },
            children: "Обновить тарифы",
          }),
        ],
      }),
      p.length > 0 &&
        n.jsxs("details", {
          className: "pricing-example pricing-list-example",
          open: !!de,
          children: [
            n.jsx("summary", {
              children: "Параметры примера для сохранённых тарифов",
            }),
            n.jsx(ue, {
              label: "Тариф для проверки",
              children: n.jsxs("select", {
                value: de,
                disabled: m.busy,
                onChange: (O) => {
                  (v(O.target.value), oe(null), B(null));
                },
                children: [
                  n.jsx("option", {
                    value: "",
                    children: "Выберите сохранённый тариф",
                  }),
                  p.map((O) =>
                    n.jsxs(
                      "option",
                      { value: O.id, children: [O.name, " · v", O.version] },
                      O.id,
                    ),
                  ),
                ],
              }),
            }),
            n.jsxs("div", {
              className: "form-grid three",
              children: [
                n.jsx(ue, {
                  label: "Точек в примере",
                  children: n.jsx("input", {
                    inputMode: "numeric",
                    value: W.stops,
                    disabled: m.busy,
                    onChange: (O) => we("stops", O.target.value),
                  }),
                }),
                n.jsx(ue, {
                  label: "Пробег примера, км",
                  children: n.jsx("input", {
                    inputMode: "decimal",
                    value: W.kilometers,
                    disabled: m.busy,
                    onChange: (O) => we("kilometers", O.target.value),
                  }),
                }),
                n.jsx(ue, {
                  label: "Время примера, минут",
                  children: n.jsx("input", {
                    inputMode: "numeric",
                    value: W.minutes,
                    disabled: m.busy,
                    onChange: (O) => we("minutes", O.target.value),
                  }),
                }),
              ],
            }),
            n.jsxs("div", {
              className: "form-grid",
              children: [
                n.jsx(ue, {
                  label: "Специальная точка в примере",
                  children: n.jsxs("select", {
                    value: W.special,
                    disabled: m.busy,
                    onChange: (O) => we("special", O.target.value),
                    children: [
                      n.jsx("option", {
                        value: "unknown",
                        children: "Неизвестно",
                      }),
                      n.jsx("option", { value: "no", children: "Нет" }),
                      n.jsx("option", { value: "yes", children: "Да" }),
                    ],
                  }),
                }),
                Le?.rules.baseKind === "distance_bands" &&
                  Le.rules.distanceMetric !== "route" &&
                  n.jsx(ue, {
                    label: `${Cn[Le.rules.distanceMetric]}, км в примере`,
                    children: n.jsx("input", {
                      inputMode: "decimal",
                      value: W.bandDistance,
                      disabled: m.busy,
                      onChange: (O) => we("bandDistance", O.target.value),
                    }),
                  }),
              ],
            }),
            n.jsx("button", {
              className: "button secondary",
              disabled: m.busy || !Le,
              onClick: () => {
                Le && m.run(() => De(Le.rules, Le.id));
              },
              children: "Рассчитать сохранённый тариф",
            }),
          ],
        }),
      !p.length &&
        n.jsx("div", {
          className: "surface empty-message",
          children:
            "Пока нет тарифов конструктора. Создайте черновики для клиента и исполнителя, затем опубликуйте проверенные условия.",
        }),
      n.jsx("div", {
        className: "pricing-tariff-list",
        children: p.map((O) =>
          n.jsxs(
            "article",
            {
              className: "surface pricing-tariff-card",
              children: [
                n.jsxs("div", {
                  className: "row-between",
                  children: [
                    n.jsx("h3", { children: O.name }),
                    n.jsxs("span", {
                      className: `workflow-badge ${O.status === "published" ? "accepted" : "pending"}`,
                      children: [
                        O.status === "published" ? "Опубликован" : "Черновик",
                        " · v",
                        O.version,
                      ],
                    }),
                  ],
                }),
                n.jsxs("p", {
                  children: [
                    O.side === "client" ? "От клиента" : "Исполнителю",
                    " · ",
                    O.contractReference,
                  ],
                }),
                n.jsxs("p", {
                  className: "input-hint",
                  children: [
                    ie.find(
                      (Ee) =>
                        Ee.projectId === O.projectId &&
                        Ee.responsibilityScopeId === O.responsibilityScopeId,
                    )?.projectName ?? "Доступный проект",
                    " · с ",
                    O.effectiveFrom,
                    O.effectiveTo
                      ? ` до ${O.effectiveTo}, не включая`
                      : ", без окончания",
                    " · ",
                    O.rules.baseKind === "fixed"
                      ? je(O.rules.baseKopecks)
                      : `${O.rules.distanceBands.length} диапазонов`,
                    " за рейс, без НДС",
                  ],
                }),
                !O.amountsAreNet &&
                  n.jsx("p", {
                    className: "pricing-issue",
                    children:
                      "Трактовки и суммы без НДС ещё не подтверждены. Скопируйте черновик, проверьте условия и сохраните с подтверждением.",
                  }),
                n.jsxs("details", {
                  children: [
                    n.jsx("summary", {
                      children: "Ставки, лимиты и исходные условия",
                    }),
                    n.jsx(Py, { rules: O.rules }),
                    n.jsx("p", {
                      className: "pricing-source",
                      children: O.sourceText,
                    }),
                    n.jsx("p", {
                      className: "pricing-source",
                      children: O.termsNote,
                    }),
                    n.jsxs("p", {
                      className: "input-hint",
                      children: [
                        "Создан ",
                        et(O.createdAt),
                        ". Сохранённые версии неизменяемы.",
                      ],
                    }),
                  ],
                }),
                n.jsxs("div", {
                  className: "action-row",
                  children: [
                    n.jsx("button", {
                      className: "button small secondary",
                      disabled:
                        m.busy ||
                        p.some(
                          (Ee) =>
                            Ee.seriesId === O.seriesId &&
                            Ee.version > O.version,
                        ),
                      onClick: () => at(O),
                      children:
                        O.status === "published"
                          ? "Создать следующую версию"
                          : "Скопировать и исправить",
                    }),
                    n.jsx("button", {
                      className: "text-button",
                      disabled: m.busy,
                      onClick: () => {
                        (v(O.id), m.run(() => De(O.rules, O.id)));
                      },
                      children: "Проверить пример",
                    }),
                    Te &&
                      O.status === "draft" &&
                      n.jsx("button", {
                        className: "button small primary",
                        disabled:
                          m.busy ||
                          !O.amountsAreNet ||
                          ce !== O.id ||
                          !ve ||
                          ve.totalKopecks === null,
                        onClick: () => {
                          m.run(async () => {
                            const Ee = (_.current[O.id] ??=
                              crypto.randomUUID());
                            (await Ye(
                              c,
                              `/finance/pricing/tariffs/${O.id}/publish`,
                              { idempotencyKey: Ee },
                            ),
                              delete _.current[O.id],
                              await ne());
                          }, "Тариф опубликован. Он доступен в расчётах рейсов подходящего проекта и периода.");
                        },
                        children: "Опубликовать проверенный тариф",
                      }),
                  ],
                }),
                ce === O.id &&
                  ve &&
                  n.jsxs(n.Fragment, {
                    children: [
                      n.jsxs("p", {
                        className: "input-hint",
                        children: [
                          "Пример: ",
                          W.stops,
                          " точек, ",
                          W.kilometers,
                          " км, ",
                          W.minutes,
                          " минут. Параметры меняются в блоке проверки над списком тарифов.",
                        ],
                      }),
                      n.jsx(Lc, {
                        title: "Проверочный расчёт без НДС",
                        result: ve,
                      }),
                    ],
                  }),
              ],
            },
            O.id,
          ),
        ),
      }),
    ],
  });
}
function _o(c) {
  const d = c.current?.input;
  return {
    clientId: d?.clientTariffId ?? "",
    executorMode: d?.executorTariffId
      ? "tariff"
      : d?.executorManualKopecks != null
        ? "manual"
        : "unknown",
    executorId: d?.executorTariffId ?? "",
    manual: bt(d?.executorManualKopecks ?? null),
    manualReason: d?.executorManualReason ?? "",
    costs: bt(d?.directCostsKopecks ?? null),
    costsReason: d?.directCostsReason ?? "",
    special: d?.specialStop == null ? "unknown" : d.specialStop ? "yes" : "no",
    warehouse: bt(d?.warehouseRadiusHundredths ?? null),
    mkad: bt(d?.mkadRadiusHundredths ?? null),
    leg: bt(d?.legDistanceHundredths ?? null),
    factsId: c.facts?.id ?? null,
    expectedRevision: c.current?.revision ?? 0,
  };
}
function Ao({ calculation: c }) {
  return n.jsxs("div", {
    className: "pricing-totals",
    children: [
      n.jsxs("div", {
        className: "pricing-total",
        children: [
          n.jsx("span", { children: "От клиента" }),
          n.jsx("strong", {
            children:
              c.client.totalKopecks === null
                ? "Не определено"
                : je(c.client.totalKopecks),
          }),
          n.jsx("small", { children: "Начисление без НДС" }),
        ],
      }),
      n.jsxs("div", {
        className: "pricing-total",
        children: [
          n.jsx("span", { children: "Исполнителю" }),
          n.jsx("strong", {
            children:
              c.executor.totalKopecks === null
                ? "Не определено"
                : je(c.executor.totalKopecks),
          }),
          n.jsx("small", { children: "Начисление без НДС" }),
        ],
      }),
      n.jsxs("div", {
        className: `pricing-total pricing-remainder ${c.remainderKopecks !== null && c.remainderKopecks < 0 ? "negative" : ""}`,
        children: [
          n.jsx("span", { children: "Остаток компании" }),
          n.jsx("strong", {
            children:
              c.remainderKopecks === null
                ? "Не определено"
                : je(c.remainderKopecks),
          }),
          n.jsx("small", { children: "После исполнителя и прямых затрат" }),
        ],
      }),
    ],
  });
}
function Ro({ calculation: c }) {
  return n.jsxs("div", {
    className: "pricing-calculation-details",
    children: [
      n.jsx(Lc, { title: "От клиента", result: c.client }),
      n.jsx(Lc, { title: "Исполнителю", result: c.executor }),
      n.jsxs("p", {
        className: "input-hint",
        children: [
          "Прочие прямые затраты: ",
          c.directCostsKopecks === null
            ? "неизвестны"
            : je(c.directCostsKopecks),
          c.input.directCostsReason && ` · ${c.input.directCostsReason}`,
        ],
      }),
      c.input.executorManualKopecks !== null &&
        n.jsxs("p", {
          className: "input-hint",
          children: [
            "Основание ручного начисления: ",
            c.input.executorManualReason,
          ],
        }),
      n.jsxs("p", {
        className: "input-hint",
        children: [
          "Клиент: ",
          c.clientTariff
            ? `${c.clientTariff.name}, v${c.clientTariff.version} · ${c.clientTariff.contractReference}`
            : "тариф не выбран",
          ". Исполнитель: ",
          c.executorTariff
            ? `${c.executorTariff.name}, v${c.executorTariff.version} · ${c.executorTariff.contractReference}`
            : c.input.executorManualKopecks !== null
              ? "ручное начисление"
              : "тариф не выбран",
          ".",
        ],
      }),
      c.facts &&
        n.jsxs("p", {
          className: "input-hint",
          children: [
            "Снимок факта v",
            c.factsRevision,
            ": ",
            c.facts.stops,
            " точек · ",
            bt(c.facts.kilometersHundredths),
            " км · ",
            c.facts.minutes,
            " минут.",
          ],
        }),
    ],
  });
}
function ng(c) {
  return Jo(c.actor, c.scope) ? n.jsx(ag, { ...c }, c.tripId) : null;
}
function ag({ token: c, actor: d, tripId: f, scope: r, onExpired: g }) {
  const [p, b] = h.useState(null),
    [D, J] = h.useState([]),
    [j, U] = h.useState(null),
    [y, L] = h.useState(null),
    [M, ee] = h.useState(null),
    [te, R] = h.useState(!1),
    [re, le] = h.useState(!1),
    [K, I] = h.useState(!1),
    k = Jl(g),
    Z = h.useRef(crypto.randomUUID()),
    G = h.useRef({}),
    E = d.role === "document_specialist";
  h.useEffect(() => {
    let B = !0;
    return (
      k.run(async () => {
        const [de, v] = await Promise.all([
          ze(`/finance/pricing/trips/${f}`, {}, c),
          ze("/finance/pricing/tariffs", {}, c),
        ]);
        B && (b(de), J(v.items), U(_o(de)));
      }),
      () => {
        B = !1;
      }
    );
  }, [c, f]);
  async function se(B = !1) {
    const [de, v] = await Promise.all([
      ze(`/finance/pricing/trips/${f}`, {}, c),
      ze("/finance/pricing/tariffs", {}, c),
    ]);
    return (
      b(de),
      J(v.items),
      B
        ? (U(_o(de)), R(!1), le(!1), L(null), I(!1))
        : j &&
          (j.factsId !== (de.facts?.id ?? null) ||
            j.expectedRevision !== (de.current?.revision ?? 0)) &&
          (le(!0), L(null)),
      de
    );
  }
  function P(B, de) {
    (U((v) => (v ? { ...v, [B]: de } : null)),
      R(!0),
      L(null),
      (Z.current = crypto.randomUUID()));
  }
  function H() {
    if (!j) throw new Ne(400, "Данные расчёта ещё не загружены.");
    const B = j.costs.trim() === "" ? null : ti(j.costs, "Прямые затраты"),
      de =
        j.executorMode === "manual"
          ? ti(j.manual, "Начисление исполнителю")
          : null;
    if (de !== null && j.manualReason.trim().length < 3)
      throw new Ne(
        400,
        "Укажите основание ручного начисления исполнителю: не менее 3 символов.",
      );
    if (B !== null && j.costsReason.trim().length < 3)
      throw new Ne(
        400,
        "Укажите основание прямых затрат, в том числе нулевых: не менее 3 символов.",
      );
    const v = (m, S) => (m.trim() === "" ? null : ni(m, S));
    return {
      clientTariffId: j.clientId || null,
      executorTariffId: (j.executorMode === "tariff" && j.executorId) || null,
      executorManualKopecks: de,
      executorManualReason: de === null ? "" : j.manualReason.trim(),
      directCostsKopecks: B,
      directCostsReason: B === null ? "" : j.costsReason.trim(),
      specialStop: j.special === "unknown" ? null : j.special === "yes",
      warehouseRadiusHundredths: v(j.warehouse, "Радиус от склада"),
      mkadRadiusHundredths: v(j.mkad, "Удалённость от МКАД"),
      legDistanceHundredths: v(j.leg, "Расстояние плеча"),
      factsId: j.factsId,
      expectedRevision: j.expectedRevision,
      idempotencyKey: Z.current,
    };
  }
  async function fe(B) {
    try {
      const de = await Ye(
        c,
        `/finance/pricing/trips/${f}/${B ? "calculations" : "preview"}`,
        H(),
      );
      B ? ((Z.current = crypto.randomUUID()), await se(!0)) : L(de);
    } catch (de) {
      if (de instanceof Ne && de.status === 409) {
        (le(!0), L(null));
        try {
          await se();
        } catch {}
      }
      throw de;
    }
  }
  async function Y(B) {
    if (!p?.current) return;
    const de = `${p.current.id}:${B}`,
      v = (G.current[de] ??= crypto.randomUUID());
    try {
      (await Ye(c, `/finance/pricing/calculations/${p.current.id}/confirm`, {
        part: B,
        idempotencyKey: v,
      }),
        delete G.current[de],
        await se());
    } catch (m) {
      if (m instanceof Ne && m.status === 409) {
        le(!0);
        try {
          await se();
        } catch {}
      }
      throw m;
    }
  }
  const xe = D.filter(
      (B) =>
        B.status === "published" &&
        B.projectId === r.projectId &&
        B.responsibilityScopeId === r.responsibilityScopeId &&
        !!p &&
        B.effectiveFrom <= p.businessDate &&
        (!B.effectiveTo || B.effectiveTo > p.businessDate),
    ),
    ae = xe.filter((B) => B.side === "client"),
    V = xe.filter((B) => B.side === "executor"),
    W = D.filter(
      (B) =>
        B.id === j?.clientId ||
        (j?.executorMode === "tariff" && B.id === j.executorId),
    ),
    he = new Set(
      W.filter((B) => B.rules.baseKind === "distance_bands").map(
        (B) => B.rules.distanceMetric,
      ),
    );
  function ve(B, de) {
    return n.jsxs(n.Fragment, {
      children: [
        n.jsx("option", {
          value: "",
          children: "Не выбран — сумма неизвестна",
        }),
        de &&
          !B.some((v) => v.id === de) &&
          n.jsx("option", {
            value: de,
            children: "Выбранная версия недоступна для этой даты / области",
          }),
        B.map((v) =>
          n.jsxs(
            "option",
            {
              value: v.id,
              children: [v.name, " · v", v.version, " · ", v.contractReference],
            },
            v.id,
          ),
        ),
      ],
    });
  }
  const oe = p?.current,
    ce =
      k.busy ||
      te ||
      re ||
      !!p?.registryLocked ||
      p?.facts?.status !== "approved";
  return n.jsxs("div", {
    className: "trip-pricing",
    children: [
      n.jsxs("div", {
        className: "section-heading",
        children: [
          n.jsx("h3", { children: "Экономика рейса" }),
          n.jsx("button", {
            className: "text-button",
            disabled: k.busy,
            onClick: () => {
              k.run(() => se());
            },
            children: "Обновить расчёт",
          }),
        ],
      }),
      n.jsx("p", {
        className: "input-hint",
        children:
          "Начисления без НДС. Остаток — сумма клиента минус исполнитель и прочие прямые затраты. Фактические поступления, выплаты, общехозяйственные расходы и итоговая прибыль здесь не учитываются.",
      }),
      n.jsx(Ot, { ...k }),
      !p || !j
        ? n.jsx("p", {
            className: "muted",
            children: k.busy
              ? "Загружаем расчёт…"
              : "Не удалось загрузить расчёт.",
          })
        : n.jsxs(n.Fragment, {
            children: [
              y &&
                n.jsxs("section", {
                  className: "pricing-snapshot pricing-preview",
                  children: [
                    n.jsxs("div", {
                      className: "row-between",
                      children: [
                        n.jsx("h3", { children: "Предварительный расчёт" }),
                        n.jsx("span", {
                          className: "workflow-badge pending",
                          children: "Не сохранён",
                        }),
                      ],
                    }),
                    n.jsx(Ao, { calculation: y }),
                    n.jsx(Ro, { calculation: y }),
                  ],
                }),
              oe
                ? n.jsxs("section", {
                    className: "pricing-snapshot",
                    children: [
                      n.jsxs("div", {
                        className: "row-between",
                        children: [
                          n.jsxs("h3", {
                            children: ["Сохранённый расчёт · v", oe.revision],
                          }),
                          n.jsx("span", {
                            className: `workflow-badge ${oe.stale ? "returned" : "accepted"}`,
                            children: oe.stale
                              ? "Основания изменились"
                              : "Сохранён",
                          }),
                        ],
                      }),
                      n.jsxs("p", {
                        className: "input-hint",
                        children: [
                          et(oe.createdAt),
                          te ? " · В форме есть несохранённые изменения" : "",
                        ],
                      }),
                      oe.stale &&
                        n.jsx("p", {
                          className: "pricing-issue",
                          children:
                            "Изменился факт рейса или документы и проверки. Устаревшая сторона отмечена ниже. Для её пересчёта проверьте поля и сохраните новую версию; подтверждения другой стороны оцениваются независимо.",
                        }),
                      n.jsx(Ao, { calculation: oe }),
                      n.jsxs("details", {
                        children: [
                          n.jsx("summary", {
                            children: "Из чего сложились суммы",
                          }),
                          n.jsx(Ro, { calculation: oe }),
                        ],
                      }),
                      n.jsxs("div", {
                        className: "pricing-confirmations",
                        children: [
                          n.jsxs("div", {
                            children: [
                              n.jsx("strong", {
                                children: "Начисление клиенту",
                              }),
                              n.jsx("p", {
                                children: oe.clientStale
                                  ? "Основания устарели — нужна новая версия"
                                  : oe.clientConfirmedAt
                                    ? `Подтверждено ${et(oe.clientConfirmedAt)}`
                                    : "Не подтверждено",
                              }),
                              E &&
                                !oe.clientConfirmedAt &&
                                n.jsx("button", {
                                  className: "button small secondary",
                                  disabled:
                                    ce ||
                                    oe.clientStale ||
                                    oe.client.totalKopecks === null,
                                  onClick: () => {
                                    k.run(
                                      () => Y("client"),
                                      "Начисление клиенту подтверждено.",
                                    );
                                  },
                                  children: "Подтвердить клиента",
                                }),
                            ],
                          }),
                          n.jsxs("div", {
                            children: [
                              n.jsx("strong", {
                                children: "Исполнитель и прямые затраты",
                              }),
                              n.jsx("p", {
                                children: oe.expensesStale
                                  ? "Основания устарели — нужна новая версия"
                                  : oe.expensesConfirmedAt
                                    ? `Подтверждено ${et(oe.expensesConfirmedAt)}`
                                    : "Не подтверждено",
                              }),
                              E &&
                                !oe.expensesConfirmedAt &&
                                n.jsx("button", {
                                  className: "button small secondary",
                                  disabled:
                                    ce ||
                                    oe.expensesStale ||
                                    oe.executor.totalKopecks === null ||
                                    oe.directCostsKopecks === null,
                                  onClick: () => {
                                    k.run(
                                      () => Y("expenses"),
                                      "Расходная часть подтверждена.",
                                    );
                                  },
                                  children: "Подтвердить расходы",
                                }),
                            ],
                          }),
                        ],
                      }),
                      !E &&
                        n.jsx("p", {
                          className: "input-hint",
                          children:
                            "Каждую сторону подтверждает документовед с финансовым доступом.",
                        }),
                    ],
                  })
                : !y &&
                  n.jsx("p", {
                    className: "help-callout",
                    children:
                      "Выберите тариф клиента и способ начисления исполнителю. Если часть данных неизвестна, остальные суммы можно рассчитать и сохранить отдельно.",
                  }),
              n.jsxs("div", {
                className: "pricing-facts",
                children: [
                  n.jsx("strong", { children: "Факт рейса" }),
                  p.facts
                    ? n.jsxs("span", {
                        children: [
                          p.facts.stops,
                          " точек · ",
                          bt(p.facts.kilometersHundredths),
                          " км маршрута · ",
                          p.facts.minutes,
                          " минут · v",
                          p.facts.revision,
                          " · ",
                          p.facts.status === "approved"
                            ? "подтверждён"
                            : p.facts.status === "returned"
                              ? "возвращён"
                              : "на проверке",
                        ],
                      })
                    : n.jsx("span", {
                        children:
                          "Ещё не заполнен. Добавьте данные во вкладке «Факт рейса».",
                      }),
                ],
              }),
              n.jsx("p", {
                className: "input-hint",
                children:
                  "Точки, пробег и время берутся из последней версии факта. Подтверждение начислений требует подтверждённого факта.",
              }),
              p.registryLocked &&
                n.jsx("p", {
                  className: "help-callout",
                  children:
                    "Рейс уже включён в подтверждённый реестр. Изменение начислений заблокировано.",
                }),
              re &&
                n.jsxs("div", {
                  className: "pricing-conflict",
                  role: "alert",
                  children: [
                    n.jsx("strong", {
                      children: "Данные на сервере изменились",
                    }),
                    n.jsx("p", {
                      children:
                        "Ваши поля сохранены в открытой форме. Проверьте свежий факт и сохранённый расчёт выше, затем выберите, какие значения использовать.",
                    }),
                    n.jsxs("div", {
                      className: "action-row",
                      children: [
                        n.jsx("button", {
                          className: "button small secondary",
                          disabled: k.busy,
                          onClick: () => {
                            (U({
                              ...j,
                              factsId: p.facts?.id ?? null,
                              expectedRevision: p.current?.revision ?? 0,
                            }),
                              le(!1),
                              R(!0),
                              L(null),
                              (Z.current = crypto.randomUUID()));
                          },
                          children: "Оставить мои поля с актуальным фактом",
                        }),
                        n.jsx("button", {
                          className: "text-button",
                          disabled: k.busy,
                          onClick: () => {
                            (U(_o(p)),
                              le(!1),
                              R(!1),
                              L(null),
                              (Z.current = crypto.randomUUID()));
                          },
                          children: "Загрузить сохранённые значения",
                        }),
                      ],
                    }),
                  ],
                }),
              n.jsxs("details", {
                className: "pricing-inputs",
                open: !oe || re || K,
                onToggle: (B) => I(B.currentTarget.open),
                children: [
                  n.jsxs("summary", {
                    children: [
                      oe ? "Изменить тарифы и затраты" : "Тарифы и затраты",
                      te && " · есть несохранённые изменения",
                    ],
                  }),
                  n.jsxs("form", {
                    className: "data-form",
                    onSubmit: (B) => {
                      (B.preventDefault(),
                        k.run(
                          () => fe(!0),
                          "Новая версия расчёта сохранена с исходными фактами и тарифами.",
                        ));
                    },
                    children: [
                      n.jsxs("fieldset", {
                        className: "pricing-fields",
                        disabled: k.busy || p.registryLocked,
                        children: [
                          n.jsx(ue, {
                            label: "Тариф клиента",
                            hint: `Опубликованные версии для проекта и даты ${p.businessDate}`,
                            children: n.jsx("select", {
                              value: j.clientId,
                              onChange: (B) => P("clientId", B.target.value),
                              children: ve(ae, j.clientId),
                            }),
                          }),
                          n.jsx(ue, {
                            label: "Начисление исполнителю",
                            children: n.jsxs("select", {
                              value: j.executorMode,
                              onChange: (B) =>
                                P("executorMode", B.target.value),
                              children: [
                                n.jsx("option", {
                                  value: "unknown",
                                  children: "Пока неизвестно",
                                }),
                                n.jsx("option", {
                                  value: "tariff",
                                  children: "По тарифу",
                                }),
                                n.jsx("option", {
                                  value: "manual",
                                  children: "Согласованная сумма вручную",
                                }),
                              ],
                            }),
                          }),
                          j.executorMode === "tariff" &&
                            n.jsx(ue, {
                              label: "Тариф исполнителя",
                              children: n.jsx("select", {
                                value: j.executorId,
                                onChange: (B) =>
                                  P("executorId", B.target.value),
                                children: ve(V, j.executorId),
                              }),
                            }),
                          j.executorMode === "manual" &&
                            n.jsxs("div", {
                              className: "form-grid",
                              children: [
                                n.jsx(ue, {
                                  label: "Исполнителю, ₽ без НДС",
                                  children: n.jsx("input", {
                                    inputMode: "decimal",
                                    required: !0,
                                    value: j.manual,
                                    onChange: (B) =>
                                      P("manual", B.target.value),
                                  }),
                                }),
                                n.jsx(ue, {
                                  label: "Основание ручного начисления",
                                  children: n.jsx("input", {
                                    required: !0,
                                    minLength: 3,
                                    maxLength: 1e3,
                                    value: j.manualReason,
                                    onChange: (B) =>
                                      P("manualReason", B.target.value),
                                    placeholder:
                                      "Договорённость, документ или корректировка",
                                  }),
                                }),
                              ],
                            }),
                          n.jsxs("div", {
                            className: "form-grid",
                            children: [
                              n.jsx(ue, {
                                label: "Прочие прямые затраты, ₽ без НДС",
                                hint: "Пусто — неизвестны. 0 — подтверждённое отсутствие затрат.",
                                children: n.jsx("input", {
                                  inputMode: "decimal",
                                  value: j.costs,
                                  onChange: (B) => P("costs", B.target.value),
                                  placeholder: "Неизвестно",
                                }),
                              }),
                              n.jsx(ue, {
                                label: "Основание прямых затрат",
                                hint: "Обязательно и для нулевых затрат",
                                children: n.jsx("input", {
                                  required: j.costs.trim() !== "",
                                  minLength: j.costs.trim() !== "" ? 3 : void 0,
                                  maxLength: 1e3,
                                  value: j.costsReason,
                                  onChange: (B) =>
                                    P("costsReason", B.target.value),
                                  placeholder:
                                    "Например, затраты проверены, отсутствуют",
                                }),
                              }),
                            ],
                          }),
                          n.jsx(ue, {
                            label: "Специальная точка / зоопт в маршруте",
                            children: n.jsxs("select", {
                              value: j.special,
                              onChange: (B) => P("special", B.target.value),
                              children: [
                                n.jsx("option", {
                                  value: "unknown",
                                  children: "Неизвестно",
                                }),
                                n.jsx("option", {
                                  value: "no",
                                  children: "Нет",
                                }),
                                n.jsx("option", {
                                  value: "yes",
                                  children: "Да",
                                }),
                              ],
                            }),
                          }),
                          (he.size > 0 || j.warehouse || j.mkad || j.leg) &&
                            n.jsxs("div", {
                              className: "form-grid",
                              children: [
                                (he.has("warehouse_radius") || j.warehouse) &&
                                  n.jsx(ue, {
                                    label: `${Cn.warehouse_radius}, км`,
                                    hint: "Отдельное измерение, не пробег маршрута",
                                    children: n.jsx("input", {
                                      inputMode: "decimal",
                                      value: j.warehouse,
                                      onChange: (B) =>
                                        P("warehouse", B.target.value),
                                    }),
                                  }),
                                (he.has("mkad_radius") || j.mkad) &&
                                  n.jsx(ue, {
                                    label: `${Cn.mkad_radius}, км`,
                                    children: n.jsx("input", {
                                      inputMode: "decimal",
                                      value: j.mkad,
                                      onChange: (B) =>
                                        P("mkad", B.target.value),
                                    }),
                                  }),
                                (he.has("leg") || j.leg) &&
                                  n.jsx(ue, {
                                    label: `${Cn.leg}, км`,
                                    children: n.jsx("input", {
                                      inputMode: "decimal",
                                      value: j.leg,
                                      onChange: (B) => P("leg", B.target.value),
                                    }),
                                  }),
                              ],
                            }),
                        ],
                      }),
                      n.jsxs("div", {
                        className: "action-row",
                        children: [
                          n.jsx("button", {
                            className: "button secondary",
                            type: "button",
                            disabled: k.busy || re || p.registryLocked,
                            onClick: () => {
                              k.run(() => fe(!1));
                            },
                            children: "Предварительный расчёт",
                          }),
                          n.jsx("button", {
                            className: "button primary",
                            disabled:
                              k.busy ||
                              re ||
                              p.registryLocked ||
                              (!te && !!oe && !oe.stale),
                            children: "Сохранить версию расчёта",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              n.jsx("p", {
                className: "help-callout",
                children:
                  "Начисления конструктора; выгрузка этих расчётов в реестр / 1С — следующий этап.",
              }),
              p.history.length > 0 &&
                n.jsxs("details", {
                  className: "pricing-history",
                  children: [
                    n.jsxs("summary", {
                      children: ["История версий · ", p.history.length],
                    }),
                    n.jsx("div", {
                      className: "table-scroll",
                      children: n.jsxs("table", {
                        children: [
                          n.jsx("thead", {
                            children: n.jsxs("tr", {
                              children: [
                                n.jsx("th", { children: "Версия" }),
                                n.jsx("th", { children: "Создана" }),
                                n.jsx("th", { children: "Клиент" }),
                                n.jsx("th", { children: "Расходы" }),
                                n.jsx("th", { children: "Снимок" }),
                              ],
                            }),
                          }),
                          n.jsx("tbody", {
                            children: p.history.map((B) =>
                              n.jsxs(
                                "tr",
                                {
                                  children: [
                                    n.jsxs("td", {
                                      children: ["v", B.revision],
                                    }),
                                    n.jsx("td", { children: et(B.createdAt) }),
                                    n.jsx("td", {
                                      children: B.clientConfirmedAt
                                        ? et(B.clientConfirmedAt)
                                        : "Не подтверждено",
                                    }),
                                    n.jsx("td", {
                                      children: B.expensesConfirmedAt
                                        ? et(B.expensesConfirmedAt)
                                        : "Не подтверждено",
                                    }),
                                    n.jsx("td", {
                                      children: n.jsxs("button", {
                                        className: "text-button",
                                        disabled: k.busy,
                                        onClick: () => {
                                          k.run(async () =>
                                            ee(
                                              await ze(
                                                `/finance/pricing/calculations/${B.id}`,
                                                {},
                                                c,
                                              ),
                                            ),
                                          );
                                        },
                                        children: ["Посмотреть v", B.revision],
                                      }),
                                    }),
                                  ],
                                },
                                B.id,
                              ),
                            ),
                          }),
                        ],
                      }),
                    }),
                  ],
                }),
              M &&
                n.jsxs("section", {
                  className: "pricing-snapshot",
                  children: [
                    n.jsxs("div", {
                      className: "row-between",
                      children: [
                        n.jsxs("h3", {
                          children: ["Исторический снимок · v", M.revision],
                        }),
                        n.jsx("button", {
                          className: "text-button",
                          onClick: () => ee(null),
                          children: "Закрыть снимок",
                        }),
                      ],
                    }),
                    n.jsxs("p", {
                      className: "input-hint",
                      children: [
                        "Создан ",
                        et(M.createdAt),
                        ". Эти суммы и подтверждения относятся к выбранной версии; актуальный расчёт показан выше.",
                      ],
                    }),
                    n.jsx(Ao, { calculation: M }),
                    n.jsx(Ro, { calculation: M }),
                    n.jsxs("p", {
                      className: "input-hint",
                      children: [
                        "Клиент: ",
                        M.clientConfirmedAt
                          ? `подтверждён ${et(M.clientConfirmedAt)}`
                          : "не подтверждён",
                        ". Расходы: ",
                        M.expensesConfirmedAt
                          ? `подтверждены ${et(M.expensesConfirmedAt)}`
                          : "не подтверждены",
                        ".",
                      ],
                    }),
                  ],
                }),
            ],
          }),
    ],
  });
}
const Do = {
    accept: "Принял заявку",
    check_in: "Вышел на рейс",
    check_out: "Завершил рейс",
  },
  sg = {
    accept: "Принять заявку",
    check_in: "Выйти на рейс",
    check_out: "Завершить рейс",
  },
  ig = [
    { key: "acceptedAt", label: "Принял", empty: "Ждём принятия" },
    { key: "startedAt", label: "Вышел", empty: "Не вышел" },
    { key: "completedAt", label: "Завершил", empty: "Не завершил" },
  ];
function Gp({ progress: c, compact: d = !1 }) {
  return n.jsxs("span", {
    className: `driver-progress ${d ? "compact" : ""}`,
    children: [
      c.length === 0 &&
        n.jsx("span", {
          className: "input-hint",
          children: "Водитель не назначен",
        }),
      c.map((f) =>
        n.jsxs(
          "span",
          {
            className: "driver-progress-person",
            children: [
              n.jsx("strong", {
                className: "driver-progress-name",
                children: f.driver.name,
              }),
              n.jsx("span", {
                className: "driver-progress-steps",
                children: ig.map((r) => {
                  const g = f[r.key];
                  return n.jsxs(
                    "span",
                    {
                      className: `driver-progress-step ${g ? "confirmed" : "waiting"}`,
                      children: [
                        n.jsxs("span", {
                          className: "driver-progress-label",
                          children: [g ? "✓ " : "○ ", r.label],
                        }),
                        g
                          ? n.jsx("time", { dateTime: g, children: et(g) })
                          : n.jsx("small", {
                              children:
                                r.key === "acceptedAt" && f.startedAt
                                  ? "Нет отметки"
                                  : r.empty,
                            }),
                      ],
                    },
                    r.key,
                  );
                }),
              }),
            ],
          },
          f.driver.id,
        ),
      ),
    ],
  });
}
function ai(c, d = !0) {
  const f = h.useRef({ refresh: c, enabled: d });
  ((f.current = { refresh: c, enabled: d }),
    h.useEffect(() => {
      let r = !1;
      const g = () => {
          r ||
            !f.current.enabled ||
            !navigator.onLine ||
            document.visibilityState === "hidden" ||
            ((r = !0),
            f.current.refresh().finally(() => {
              r = !1;
            }));
        },
        p = window.setInterval(g, 2e4);
      return (
        window.addEventListener("focus", g),
        window.addEventListener("online", g),
        document.addEventListener("visibilitychange", g),
        () => {
          (window.clearInterval(p),
            window.removeEventListener("focus", g),
            window.removeEventListener("online", g),
            document.removeEventListener("visibilitychange", g));
        }
      );
    }, []));
}
const Ia = { accept: 0, check_in: 1, check_out: 2 };
function Oo(c, d) {
  if (c.type !== "attendance") return !0;
  const f = Ia[c.payload.kind];
  return !d.some(
    (r) =>
      r.type === "attendance" &&
      r.actorId === c.actorId &&
      r.tripId === c.tripId &&
      Ia[r.payload.kind] > f,
  );
}
async function cg(c, d, f, r = "check_out") {
  const g = (await Ko(c, d))
    .filter((p) => p.type === "attendance" && Ia[p.payload.kind] <= Ia[r])
    .sort((p, b) =>
      p.type !== "attendance" || b.type !== "attendance"
        ? 0
        : Ia[p.payload.kind] - Ia[b.payload.kind] ||
          p.createdAt.localeCompare(b.createdAt),
    );
  for (const p of g) (await f(p), await Lo(c, p.id));
}
function Io() {
  return new Promise((c, d) => {
    const f = indexedDB.open("transport-local-drafts", 1);
    ((f.onupgradeneeded = () => {
      f.result
        .createObjectStore("drafts", { keyPath: "id" })
        .createIndex("actorId", "actorId");
    }),
      (f.onerror = () => d(new Error("Local storage unavailable"))),
      (f.onblocked = () => d(new Error("Local storage blocked"))),
      (f.onsuccess = () => c(f.result)));
  });
}
async function Ko(c, d) {
  const f = await Io();
  try {
    return await new Promise((r, g) => {
      const p = f
        .transaction("drafts", "readonly")
        .objectStore("drafts")
        .index("actorId")
        .getAll(IDBKeyRange.only(c));
      ((p.onsuccess = () =>
        r(
          p.result
            .filter((b) => b.actorId === c && (!d || b.tripId === d))
            .sort((b, D) => b.createdAt.localeCompare(D.createdAt)),
        )),
        (p.onerror = () => g(new Error("Local storage unavailable"))));
    });
  } finally {
    f.close();
  }
}
async function ug(c) {
  if (c.id !== `${c.actorId}:${c.payload.idempotencyKey}`)
    throw new Error("Invalid draft owner");
  const d = await Io();
  try {
    await new Promise((f, r) => {
      const g = d.transaction("drafts", "readwrite"),
        p = g.objectStore("drafts"),
        b = p.get(c.id);
      let D = "Local storage unavailable";
      ((b.onsuccess = () => {
        if (b.result) {
          if (b.result.actorId !== c.actorId) {
            ((D = "Invalid draft owner"), g.abort());
            return;
          }
          p.put(c);
          return;
        }
        const J = p.index("actorId").count(IDBKeyRange.only(c.actorId));
        J.onsuccess = () => {
          J.result >= 20 ? ((D = "Draft limit reached"), g.abort()) : p.put(c);
        };
      }),
        (g.oncomplete = () => f()),
        (g.onerror = () => r(new Error(D))),
        (g.onabort = () => r(new Error(D))));
    });
  } finally {
    d.close();
  }
}
async function Lo(c, d) {
  const f = await Io();
  try {
    await new Promise((r, g) => {
      const p = f.transaction("drafts", "readwrite"),
        b = p.objectStore("drafts"),
        D = b.get(d);
      ((D.onsuccess = () => {
        D.result?.actorId === c && b.delete(d);
      }),
        (p.oncomplete = () => r()),
        (p.onerror = () => g(new Error("Local storage unavailable"))),
        (p.onabort = () => g(new Error("Local storage unavailable"))));
    });
  } finally {
    f.close();
  }
}
const zo = { delivery_note: "Транспортная накладная", waybill: "Путевой лист" },
  Op = {
    pending: "На проверке",
    accepted: "Принят",
    approved: "Подтверждён",
    returned: "Возвращён",
  };
function rg({ token: c, onExpired: d, onCreated: f }) {
  const [r, g] = h.useState(null),
    [p, b] = h.useState("create"),
    [driverId, setDriverId] = h.useState(""),
    [vehicleId, setVehicleId] = h.useState(""),
    [j, U] = h.useState(""),
    [y, L] = h.useState(null),
    M = Jl(d),
    ee = h.useRef(crypto.randomUUID()),
    te = h.useRef(crypto.randomUUID());
  h.useEffect(() => {
    M.run(async () => g(await ze("/workflow/catalog", {}, c)));
  }, [c]);
  const selectedDriver = r?.drivers.find((driver) => driver.id === driverId),
    sameScope = (left, right) => left.projectId === right.projectId && left.responsibilityScopeId === right.responsibilityScopeId,
    vehicles = (r?.vehicles || []).filter(vehicle => !selectedDriver || vehicle.scopes?.some(scope => selectedDriver.scopes.some(assigned => sameScope(scope, assigned)))),
    selectedVehicle = vehicles.find(vehicle => vehicle.id === vehicleId) || vehicles[0],
    R = r?.scopes.find(scope => selectedVehicle?.scopes?.some(assigned => sameScope(scope, assigned)) && (!selectedDriver || selectedDriver.scopes.some(assigned => sameScope(scope, assigned)))),
    re = new TextEncoder().encode(j).byteLength > 25e4;
  function le() {
    if (!r || !R) return;
    const K = selectedVehicle,
      I = r.drivers.find((E) =>
        E.scopes.some(
          (se) =>
            se.projectId === R.projectId &&
            se.responsibilityScopeId === R.responsibilityScopeId,
        ),
      ),
      k = {
        reference: "IMPORT-" + Date.now().toString().slice(-8),
        businessDate: Zl(),
        legalEntityId: R.legalEntityId,
        regionId: R.regionId,
        projectId: R.projectId,
        responsibilityScopeId: R.responsibilityScopeId,
        vehicleId: K?.id ?? "",
        driverId: I?.id ?? "",
        routeSummary: "Демо-склад → Демо-точка → База",
      },
      Z = r.csvTemplate.trim().split(/\r?\n/)[0]?.split(",") ?? [],
      G = Z.map((E) => '"' + (k[E] ?? "").replaceAll('"', '""') + '"').join(
        ",",
      );
    Ho(
      "transport-trips-template.csv",
      "\uFEFF" +
        Z.join(",") +
        `\r
` +
        G +
        `\r
`,
      "text/csv;charset=utf-8",
      c,
    );
  }
  return n.jsxs("section", {
    className: "surface intake-panel",
    children: [
      n.jsx("div", {
        className: "section-heading",
        children: n.jsxs("div", {
          children: [
            n.jsx("span", { className: "eyebrow", children: "Планирование" }),
            n.jsx("h2", { children: "Добавить рейсы" }),
            n.jsx("p", {
              className: "muted",
              children: "Создайте назначение или загрузите список из таблицы.",
            }),
          ],
        }),
      }),
      n.jsxs("div", {
        className: "segmented",
        children: [
          n.jsx("button", {
            "aria-pressed": p === "create",
            onClick: () => b("create"),
            children: "Один рейс",
          }),
          n.jsx("button", {
            "aria-pressed": p === "import",
            onClick: () => b("import"),
            children: "Загрузка CSV",
          }),
        ],
      }),
      n.jsx(Ot, { ...M }),
      r
        ? p === "create"
          ? n.jsxs("form", {
              className: "data-form",
              onChange: () => {
                te.current = crypto.randomUUID();
              },
              onSubmit: (K) => {
                if ((K.preventDefault(), !R)) return;
                const I = K.currentTarget,
                  k = new FormData(I),
                  Z = {
                    idempotencyKey: te.current,
                    reference: String(k.get("reference")).trim(),
                    businessDate: String(k.get("date")),
                    scope: {
                      legalEntityId: R.legalEntityId,
                      regionId: R.regionId,
                      projectId: R.projectId,
                      responsibilityScopeId: R.responsibilityScopeId,
                    },
                    vehicleId: String(k.get("vehicle")),
                    ...(k.get("driver")
                      ? { driverId: String(k.get("driver")) }
                      : {}),
                    routeSummary: String(k.get("route")).trim(),
                  };
                M.run(async () => {
                  (await Ye(c, "/workflow/trips", Z),
                    (te.current = crypto.randomUUID()),
                    I.reset(),
                    setDriverId(""),
                    f());
                }, "Рейс создан. Он появился в списке и кабинете назначенного водителя.");
              },
              children: [
                n.jsxs("div", {
                  className: "form-grid",
                  children: [
                    n.jsx(ue, {
                      label: "Номер рейса",
                      children: n.jsx("input", {
                        name: "reference",
                        required: !0,
                        maxLength: 60,
                        placeholder: "Например, МСК-010",
                      }),
                    }),
                    n.jsx(ue, {
                      label: "Дата рейса",
                      children: n.jsx("input", {
                        name: "date",
                        type: "date",
                        defaultValue: Zl(),
                        required: !0,
                      }),
                    }),
                  ],
                }),
                n.jsxs("div", {
                  className: "form-grid",
                  children: [
                    n.jsx(ue, {
                      label: "Автомобиль",
                      hint: selectedDriver && !vehicles.length ? "Для этого водителя пока нет доступных автомобилей." : undefined,
                      children: n.jsx("select", {
                        name: "vehicle",
                        required: !0,
                        value: selectedVehicle?.id || "",
                        onChange: event => setVehicleId(event.target.value),
                        children: vehicles.map((K) =>
                          n.jsxs(
                            "option",
                            {
                              value: K.id,
                              children: [
                                K.label,
                                " ·",
                                " ",
                                K.bodyType === "refrigerated"
                                  ? "рефрижератор"
                                  : "фургон",
                              ],
                            },
                            K.id,
                          ),
                        ),
                      }),
                    }),
                    n.jsx(ue, {
                      label: "Водитель",
                      children: n.jsxs(
                        "select",
                        {
                          name: "driver",
                          required: !0,
                          value: driverId,
                          onChange: (event) => setDriverId(event.target.value),
                          children: [
                            n.jsx("option", {
                              value: "",
                              children: "Выберите водителя",
                            }),
                            r.drivers
                              .map((K) =>
                                n.jsx(
                                  "option",
                                  { value: K.id, children: K.name },
                                  K.id,
                                ),
                              ),
                          ],
                        },
                      ),
                    }),
                  ],
                }),
                n.jsx(ue, {
                  label: "Маршрут",
                  hint: "Разделяйте точки стрелкой →. Например: Склад → Магазин → База",
                  children: n.jsx("input", {
                    name: "route",
                    required: !0,
                    maxLength: 500,
                    placeholder: "Склад → Магазин → База",
                  }),
                }),
                n.jsx("button", {
                  className: "button primary",
                  disabled: M.busy || !R,
                  children: M.busy ? "Сохраняем…" : "Создать рейс",
                }),
              ],
            })
          : n.jsxs("div", {
              className: "data-form",
              children: [
                n.jsx("div", {
                  className: "help-callout",
                  children:
                    "Скачайте шаблон: в нём уже заполнены данные транспорта и водителя. Каждая строка создаёт один рейс.",
                }),
                n.jsx("button", {
                  className: "button secondary",
                  onClick: le,
                  children: "Скачать шаблон CSV",
                }),
                n.jsx(ue, {
                  label: "CSV-файл",
                  hint: "UTF-8, до 250 КБ. Сначала проверка, затем сохранение.",
                  children: n.jsx("input", {
                    type: "file",
                    accept: ".csv,text/csv",
                    disabled: M.busy,
                    onChange: (K) => {
                      const I = K.target.files?.[0];
                      if (I) {
                        if (
                          (L(null),
                          (ee.current = crypto.randomUUID()),
                          I.size > 25e4)
                        ) {
                          M.setError("Файл слишком большой. Максимум 250 КБ.");
                          return;
                        }
                        M.run(async () => U(await I.text()));
                      }
                    },
                  }),
                }),
                n.jsx(ue, {
                  label: "Содержимое CSV",
                  hint: re
                    ? "Превышен лимит 250 000 байт. Разделите файл на несколько частей."
                    : void 0,
                  children: n.jsx("textarea", {
                    className: "csv-input",
                    rows: 7,
                    value: j,
                    spellCheck: !1,
                    onChange: (K) => {
                      (U(K.target.value),
                        L(null),
                        (ee.current = crypto.randomUUID()));
                    },
                    placeholder: "Или вставьте строки из CSV сюда",
                  }),
                }),
                n.jsx("button", {
                  className: "button secondary",
                  disabled: M.busy || !j.trim() || re,
                  onClick: () => {
                    M.run(async () =>
                      L(await Ye(c, "/workflow/import/preview", { csv: j })),
                    );
                  },
                  children: "Проверить файл",
                }),
                y &&
                  n.jsxs("div", {
                    className: "preview-block",
                    children: [
                      n.jsx("h3", {
                        children: y.valid
                          ? `Готово к загрузке: ${y.rows.length} рейсов`
                          : "Исправьте ошибки в файле",
                      }),
                      y.errors.map((K, I) =>
                        n.jsxs(
                          "p",
                          {
                            className: "validation-error",
                            children: ["Строка ", K.row, ": ", K.message],
                          },
                          `${K.row}-${I}`,
                        ),
                      ),
                      n.jsx("div", {
                        className: "table-scroll",
                        children: n.jsxs("table", {
                          children: [
                            n.jsx("thead", {
                              children: n.jsxs("tr", {
                                children: [
                                  n.jsx("th", { children: "Рейс" }),
                                  n.jsx("th", { children: "Дата" }),
                                  n.jsx("th", { children: "Маршрут" }),
                                ],
                              }),
                            }),
                            n.jsx("tbody", {
                              children: y.rows.slice(0, 30).map((K, I) =>
                                n.jsxs(
                                  "tr",
                                  {
                                    children: [
                                      n.jsx("td", { children: K.reference }),
                                      n.jsx("td", {
                                        children: K.businessDate,
                                      }),
                                      n.jsx("td", {
                                        children: K.routeSummary,
                                      }),
                                    ],
                                  },
                                  I,
                                ),
                              ),
                            }),
                          ],
                        }),
                      }),
                      y.rows.length > 30 &&
                        n.jsx("p", {
                          className: "muted",
                          children: "Показаны первые 30 строк.",
                        }),
                      n.jsx("button", {
                        className: "button primary",
                        disabled: M.busy || !y.valid || y.rows.length === 0,
                        onClick: () => {
                          M.run(async () => {
                            const K = await Ye(c, "/workflow/import/commit", {
                              csv: j,
                              idempotencyKey: ee.current,
                            });
                            return (
                              L(null),
                              U(""),
                              (ee.current = crypto.randomUUID()),
                              f(),
                              K
                            );
                          }, "Рейсы загружены. Откройте список рейсов.");
                        },
                        children: "Загрузить проверенные рейсы",
                      }),
                    ],
                  }),
              ],
            })
        : n.jsx("p", {
            className: "muted",
            children: M.busy
              ? "Загружаем справочники…"
              : "Справочники недоступны.",
          }),
    ],
  });
}
function og({
  token: c,
  actor: d,
  tripId: f,
  tripScope: r,
  onExpired: g,
  onAttendanceChanged: p,
}) {
  const [b, D] = h.useState(null),
    [J, j] = h.useState(d.role === "driver" ? "attendance" : "documents"),
    [U, y] = h.useState(null),
    [L, M] = h.useState("delivery_note"),
    [ee, te] = h.useState(""),
    [R, re] = h.useState(0),
    [le, K] = h.useState([]),
    [I, k] = h.useState(""),
    [Z, G] = h.useState(navigator.onLine),
    E = Jl(g),
    se = h.useRef(crypto.randomUUID()),
    P = h.useRef(crypto.randomUUID()),
    H = h.useRef({
      accept: crypto.randomUUID(),
      check_in: crypto.randomUUID(),
      check_out: crypto.randomUUID(),
    }),
    fe = h.useRef({ accept: "", check_in: "", check_out: "" }),
    Y = h.useRef(0),
    xe = h.useRef(!0);
  h.useEffect(
    () => (
      (xe.current = !0),
      () => {
        ((xe.current = !1), (Y.current += 1));
      }
    ),
    [],
  );
  const V = d.role === "driver" || d.role === "dispatcher",
    W = d.role === "document_specialist",
    he = !!r && Jo(d, r),
    ve =
      d.role === "driver" &&
      !!b &&
      !b.attendance.some(
        (m) => m.driver.id === d.id && ["accept", "check_in"].includes(m.kind),
      ) &&
      le.some(
        (m) => m.type === "attendance" && m.payload.kind === "check_in",
      ) &&
      !le.some((m) => m.type === "attendance" && m.payload.kind === "accept");
  async function oe() {
    K(await Ko(d.id, f));
  }
  h.useEffect(() => {
    let m = !0;
    Ko(d.id, f)
      .then((_) => {
        m && K(_);
      })
      .catch(() => {
        m &&
          k(
            "Хранилище браузера недоступно. Разрешите хранение данных, чтобы сохранять действия при обрывах связи.",
          );
      });
    const S = () => G(navigator.onLine);
    return (
      window.addEventListener("online", S),
      window.addEventListener("offline", S),
      () => {
        ((m = !1),
          window.removeEventListener("online", S),
          window.removeEventListener("offline", S));
      }
    );
  }, [d.id, f]);
  async function ce(m) {
    try {
      (await ug(m), await oe(), k(""));
    } catch {
      throw (
        k(
          "Не удалось сохранить черновик на устройстве. Проверьте свободное место и разрешение на хранение данных. Лимит — 20 черновиков на учётную запись.",
        ),
        new Error("Storage unavailable")
      );
    }
  }
  async function B(m) {
    if (m.actorId !== d.id || m.tripId !== f)
      throw new Error("Draft belongs to another actor");
    if (m.type === "attendance") {
      try {
        await cg(
          d.id,
          f,
          async (S) => {
            (await Ye(c, `/workflow/trips/${f}/attendance`, S.payload), p());
          },
          m.payload.kind,
        );
      } finally {
        (await oe(), await de());
      }
      return;
    }
    (await Ye(c, `/workflow/trips/${f}/documents`, m.payload),
      await Lo(d.id, m.id),
      await oe());
  }
  async function de(m = !1) {
    const S = ++Y.current,
      _ = await ze(`/workflow/trips/${f}`, {}, c);
    xe.current &&
      S === Y.current &&
      D((ie) => (m && ie ? { ...ie, attendance: _.attendance } : _));
  }
  (h.useEffect(() => {
    E.run(de);
  }, [c, f, R]),
    ai(async () => {
      try {
        await de(!0);
      } catch (m) {
        if (!xe.current) return;
        m instanceof Ne && m.status === 401
          ? g()
          : m instanceof Ne &&
            [403, 404].includes(m.status) &&
            (D(null), E.setError(m.message));
      }
    }, !E.busy));
  async function v() {
    if (!U) return;
    if (U.size > 10 * 1024 * 1024) {
      E.setError("Максимальный размер файла — 10 МБ.");
      return;
    }
    const m = U.type;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(m)) {
      E.setError("Поддерживаются PDF, JPEG и PNG.");
      return;
    }
    await E.run(async () => {
      const S = await new Promise((ye, Te) => {
          const ne = new FileReader();
          ((ne.onload = () => ye(String(ne.result).split(",")[1] ?? "")),
            (ne.onerror = () => Te(new Error("file"))),
            ne.readAsDataURL(U));
        }),
        _ = {
          idempotencyKey: se.current,
          kind: L,
          filename: U.name,
          mimeType: m,
          contentBase64: S,
        },
        ie = {
          id: d.id + ":" + _.idempotencyKey,
          actorId: d.id,
          tripId: f,
          createdAt: new Date().toISOString(),
          type: "document",
          payload: _,
        };
      (await ce(ie),
        await B(ie),
        y(null),
        (se.current = crypto.randomUUID()),
        await de());
    }, "Документ сохранён и отправлен документоведу на проверку.");
  }
  return n.jsxs("section", {
    className: "workflow-section",
    children: [
      n.jsxs("div", {
        className: "section-heading",
        children: [
          n.jsx("h3", { children: "Работа по рейсу" }),
          n.jsx("button", {
            className: "text-button",
            disabled: E.busy,
            onClick: () => re((m) => m + 1),
            children: "Обновить",
          }),
        ],
      }),
      n.jsxs("div", {
        className: "segmented compact-segments",
        children: [
          n.jsx("button", {
            "aria-pressed": J === "documents",
            onClick: () => j("documents"),
            children: "Документы",
          }),
          n.jsx("button", {
            "aria-pressed": J === "facts",
            onClick: () => j("facts"),
            children: "Факт рейса",
          }),
          n.jsx("button", {
            "aria-pressed": J === "attendance",
            onClick: () => j("attendance"),
            children: "Отметки",
          }),
          he &&
            n.jsx("button", {
              "aria-pressed": J === "pricing",
              onClick: () => j("pricing"),
              children: "Расчёт",
            }),
        ],
      }),
      n.jsx(Ot, { ...E }),
      I && n.jsx("div", { className: "error", role: "alert", children: I }),
      !Z &&
        n.jsx("div", {
          className: "help-callout offline-notice",
          children:
            "Нет соединения. Документы и отметки сохраняются на этом устройстве. Отправьте их после восстановления связи.",
        }),
      le.length > 0 &&
        n.jsxs("section", {
          className: "draft-queue",
          children: [
            n.jsx("div", {
              className: "section-heading",
              children: n.jsxs("h3", {
                children: ["Сохранено на устройстве · ", le.length],
              }),
            }),
            n.jsx("p", {
              className: "input-hint",
              children:
                "Эти действия ещё не подтверждены сервером. После входа в ту же учётную запись отправьте их повторно. Ключ операции защищает от дублей.",
            }),
            ve &&
              n.jsx("div", {
                className: "help-callout",
                children:
                  "Этот неотправленный выход создан без принятия заявки. Для отправки теперь нужно сначала принять заявку. Сохраните исходное время для диспетчера, затем удалите неотправленное завершение (если есть) и выход. После этого примите заявку и отметьте выход заново. Новые отметки сохранят время нового нажатия; удалённые не будут отправлены.",
              }),
            le.map((m) =>
              n.jsxs(
                "article",
                {
                  className: "draft-card",
                  children: [
                    n.jsx("strong", {
                      children:
                        m.type === "document"
                          ? zo[m.payload.kind]
                          : Do[m.payload.kind],
                    }),
                    n.jsx("span", {
                      children:
                        m.type === "document"
                          ? m.payload.filename
                          : et(m.payload.occurredAt),
                    }),
                    n.jsxs("small", {
                      children: ["Ожидает отправки · ", et(m.createdAt)],
                    }),
                    n.jsxs("div", {
                      className: "action-row",
                      children: [
                        n.jsx("button", {
                          className: "button small secondary",
                          disabled: E.busy || !Z,
                          onClick: () => {
                            E.run(async () => {
                              (await B(m), await de());
                            }, "Сервер принял действие. Черновик удалён с устройства.");
                          },
                          children: "Отправить сейчас",
                        }),
                        n.jsx("button", {
                          className: "text-button",
                          disabled: E.busy || !Oo(m, le),
                          title: Oo(m, le)
                            ? void 0
                            : "Сначала удалите более поздние неотправленные отметки",
                          onClick: () => {
                            E.run(async () => {
                              (await Lo(d.id, m.id),
                                m.type === "attendance" &&
                                  ((H.current[m.payload.kind] =
                                    crypto.randomUUID()),
                                  (fe.current[m.payload.kind] = "")),
                                await oe());
                            }, "Черновик удалён с устройства.");
                          },
                          children: "Удалить с устройства",
                        }),
                      ],
                    }),
                    !Oo(m, le) &&
                      n.jsx("small", {
                        children:
                          "Сначала отправьте отметки или удалите более поздние.",
                      }),
                  ],
                },
                m.id,
              ),
            ),
          ],
        }),
      b
        ? n.jsxs(n.Fragment, {
            children: [
              J === "pricing" &&
                he &&
                r &&
                n.jsx(ng, {
                  token: c,
                  actor: d,
                  onExpired: g,
                  tripId: f,
                  scope: r,
                }),
              J === "documents" &&
                n.jsxs("div", {
                  className: "workflow-content",
                  children: [
                    n.jsxs("div", {
                      className: `package-status ${b.documentPackage.complete ? "complete" : ""}`,
                      children: [
                        n.jsx("strong", {
                          children: b.documentPackage.complete
                            ? "Комплект документов принят"
                            : "Комплект ещё не принят",
                        }),
                        n.jsxs("span", {
                          children: [
                            b.documentPackage.acceptedKinds.length,
                            " из",
                            " ",
                            b.documentPackage.requiredKinds.length,
                            " обязательных документов",
                          ],
                        }),
                      ],
                    }),
                    V &&
                      n.jsxs("div", {
                        className: "upload-box",
                        children: [
                          n.jsx(ue, {
                            label: "Тип документа",
                            children: n.jsx("select", {
                              value: L,
                              disabled: E.busy,
                              onChange: (m) => {
                                (M(m.target.value),
                                  (se.current = crypto.randomUUID()));
                              },
                              children: Object.entries(zo).map(([m, S]) =>
                                n.jsx("option", { value: m, children: S }, m),
                              ),
                            }),
                          }),
                          n.jsx(PhotoPicker, {
                            label: "Файл или фотография",
                            accept: "application/pdf,image/jpeg,image/png",
                            maxBytes: 10 * 1024 * 1024,
                            disabled: E.busy,
                            onFiles: (files) => {
                              if (!files.length) return;
                              y(files[0]);
                              se.current = crypto.randomUUID();
                            },
                          }),
                          n.jsx("p", {
                            className: "input-hint",
                            children: "PDF, JPEG, PNG · до 10 МБ",
                          }),
                          U && n.jsxs("div", {
                            className: "attachment-selection",
                            children: [
                              n.jsx(LocalPhotoPreview, { file: U, alt: U.name }),
                              n.jsx("p", { className: "file-label", children: U.name }),
                              n.jsx("button", {
                                type: "button",
                                className: "text-button",
                                disabled: E.busy,
                                onClick: () => { y(null); se.current = crypto.randomUUID(); },
                                children: "Убрать выбранный файл",
                              }),
                            ],
                          }),
                          n.jsx("button", {
                            className: "button primary",
                            disabled: E.busy || !U,
                            onClick: () => {
                              v();
                            },
                            children: E.busy
                              ? "Загружаем…"
                              : "Загрузить документ",
                          }),
                          n.jsx("p", {
                            className: "input-hint",
                            children:
                              "Перед отправкой файл сохраняется на этом устройстве под вашей учётной записью. Если связь прервётся, повторите отправку из блока черновиков.",
                          }),
                        ],
                      }),
                    W &&
                      n.jsx(ue, {
                        label: "Комментарий проверки",
                        hint: "Для возврата — не менее 3 символов",
                        children: n.jsx("input", {
                          value: ee,
                          maxLength: 300,
                          onChange: (m) => te(m.target.value),
                          placeholder: "Что нужно исправить",
                        }),
                      }),
                    !b.documents.length &&
                      n.jsx("p", {
                        className: "muted",
                        children:
                          "Загрузите накладную и путевой лист. Каждая новая загрузка сохраняется отдельной версией.",
                      }),
                    n.jsx("div", {
                      className: "document-list",
                      children: b.documents.map((m) =>
                        n.jsxs(
                          "article",
                          {
                            className: "document-card",
                            children: [
                              n.jsxs("div", {
                                className: "row-between",
                                children: [
                                  n.jsx("strong", { children: zo[m.kind] }),
                                  n.jsx("span", {
                                    className: `workflow-badge ${m.status}`,
                                    children: Op[m.status],
                                  }),
                                ],
                              }),
                              n.jsx("p", {
                                className: "file-label",
                                children: m.filename,
                              }),
                              ["image/jpeg", "image/png"].includes(m.mimeType) &&
                                n.jsx(PhotoPreview, {
                                  token: c,
                                  path: `/workflow/documents/${m.id}/download`,
                                  alt: `${zo[m.kind]} — ${m.filename}`,
                                  filename: m.filename,
                                  onExpired: g,
                                }),
                              n.jsxs("p", {
                                className: "input-hint",
                                children: [
                                  "Версия ",
                                  m.revision,
                                  " ·",
                                  " ",
                                  Math.ceil(m.byteSize / 1024),
                                  " КБ ·",
                                  " ",
                                  et(m.uploadedAt),
                                ],
                              }),
                              m.reason &&
                                n.jsx("p", {
                                  className: "review-reason",
                                  children: m.reason,
                                }),
                              n.jsxs("div", {
                                className: "action-row",
                                children: [
                                  n.jsx("button", {
                                    className: "text-button",
                                    disabled: E.busy,
                                    onClick: () => {
                                      E.run(() =>
                                        Wy(
                                          c,
                                          `/workflow/documents/${m.id}/download`,
                                          m.filename,
                                        ),
                                      );
                                    },
                                    children: "Скачать",
                                  }),
                                  W &&
                                    m.status === "pending" &&
                                    n.jsxs(n.Fragment, {
                                      children: [
                                        n.jsx("button", {
                                          className: "button small secondary",
                                          disabled: E.busy,
                                          onClick: () => {
                                            E.run(async () => {
                                              (await Ye(
                                                c,
                                                `/workflow/documents/${m.id}/review`,
                                                {
                                                  idempotencyKey:
                                                    crypto.randomUUID(),
                                                  decision: "accepted",
                                                },
                                              ),
                                                await de());
                                            }, "Документ принят.");
                                          },
                                          children: "Принять",
                                        }),
                                        n.jsx("button", {
                                          className: "button small danger",
                                          disabled:
                                            E.busy || ee.trim().length < 3,
                                          onClick: () => {
                                            E.run(async () => {
                                              (await Ye(
                                                c,
                                                `/workflow/documents/${m.id}/review`,
                                                {
                                                  idempotencyKey:
                                                    crypto.randomUUID(),
                                                  decision: "returned",
                                                  reason: ee.trim(),
                                                },
                                              ),
                                                await de());
                                            }, "Документ возвращён на исправление.");
                                          },
                                          children: "Вернуть",
                                        }),
                                      ],
                                    }),
                                ],
                              }),
                            ],
                          },
                          m.id,
                        ),
                      ),
                    }),
                  ],
                }),
              J === "facts" &&
                n.jsxs("div", {
                  className: "workflow-content",
                  children: [
                    n.jsx("p", {
                      className: "muted",
                      children:
                        "Фактические показатели для расчёта. После ввода документовед проверяет и подтверждает данные.",
                    }),
                    b.facts &&
                      n.jsxs("div", {
                        className: "facts-summary",
                        children: [
                          n.jsxs("div", {
                            className: "row-between",
                            children: [
                              n.jsxs("strong", {
                                children: ["Факт · версия ", b.facts.revision],
                              }),
                              n.jsx("span", {
                                className: `workflow-badge ${b.facts.status}`,
                                children: Op[b.facts.status],
                              }),
                            ],
                          }),
                          n.jsxs("dl", {
                            className: "metric-grid",
                            children: [
                              n.jsxs("div", {
                                children: [
                                  n.jsx("dt", { children: "Работа" }),
                                  n.jsxs("dd", {
                                    children: [b.facts.minutes, " мин"],
                                  }),
                                ],
                              }),
                              n.jsxs("div", {
                                children: [
                                  n.jsx("dt", { children: "Точки" }),
                                  n.jsx("dd", { children: b.facts.stops }),
                                ],
                              }),
                              n.jsxs("div", {
                                children: [
                                  n.jsx("dt", { children: "Пробег" }),
                                  n.jsxs("dd", {
                                    children: [
                                      b.facts.kilometersHundredths / 100,
                                      " км",
                                    ],
                                  }),
                                ],
                              }),
                              n.jsxs("div", {
                                children: [
                                  n.jsx("dt", { children: "Ожидание" }),
                                  n.jsxs("dd", {
                                    children: [b.facts.waitingMinutes, " мин"],
                                  }),
                                ],
                              }),
                            ],
                          }),
                          b.facts.reason &&
                            n.jsx("p", {
                              className: "review-reason",
                              children: b.facts.reason,
                            }),
                        ],
                      }),
                    V &&
                      n.jsxs(
                        "form",
                        {
                          className: "data-form",
                          onChange: () => {
                            P.current = crypto.randomUUID();
                          },
                          onSubmit: (m) => {
                            m.preventDefault();
                            const S = new FormData(m.currentTarget),
                              _ = {
                                idempotencyKey: P.current,
                                minutes: Number(S.get("minutes")),
                                stops: Number(S.get("stops")),
                                kilometersHundredths: Math.round(
                                  Number(S.get("km")) * 100,
                                ),
                                waitingMinutes: Number(S.get("waiting")),
                              };
                            E.run(async () => {
                              (await Ye(c, `/workflow/trips/${f}/facts`, _),
                                (P.current = crypto.randomUUID()),
                                await de());
                            }, "Факт рейса отправлен на проверку.");
                          },
                          children: [
                            n.jsxs("div", {
                              className: "form-grid",
                              children: [
                                n.jsx(ue, {
                                  label: "Время работы, мин",
                                  children: n.jsx("input", {
                                    name: "minutes",
                                    type: "number",
                                    min: "0",
                                    max: "10080",
                                    step: "1",
                                    required: !0,
                                    defaultValue: b.facts?.minutes ?? 480,
                                  }),
                                }),
                                n.jsx(ue, {
                                  label: "Выполнено точек",
                                  children: n.jsx("input", {
                                    name: "stops",
                                    type: "number",
                                    min: "0",
                                    max: "1000",
                                    step: "1",
                                    required: !0,
                                    defaultValue: b.facts?.stops ?? 3,
                                  }),
                                }),
                                n.jsx(ue, {
                                  label: "Пробег, км",
                                  children: n.jsx("input", {
                                    name: "km",
                                    type: "number",
                                    min: "0",
                                    max: "100000",
                                    step: "0.01",
                                    required: !0,
                                    defaultValue:
                                      (b.facts?.kilometersHundredths ?? 6e3) /
                                      100,
                                  }),
                                }),
                                n.jsx(ue, {
                                  label: "Ожидание, мин",
                                  children: n.jsx("input", {
                                    name: "waiting",
                                    type: "number",
                                    min: "0",
                                    max: "10080",
                                    step: "1",
                                    required: !0,
                                    defaultValue: b.facts?.waitingMinutes ?? 0,
                                  }),
                                }),
                              ],
                            }),
                            n.jsx("button", {
                              className: "button primary",
                              disabled: E.busy,
                              children: b.facts
                                ? "Отправить новую версию"
                                : "Отправить на проверку",
                            }),
                          ],
                        },
                        b.facts?.id ?? "new",
                      ),
                    W &&
                      b.facts?.status === "pending" &&
                      n.jsxs("div", {
                        className: "data-form",
                        children: [
                          n.jsx(ue, {
                            label: "Комментарий проверки",
                            children: n.jsx("input", {
                              value: ee,
                              maxLength: 300,
                              onChange: (m) => te(m.target.value),
                              placeholder: "Причина возврата, если требуется",
                            }),
                          }),
                          n.jsxs("div", {
                            className: "action-row",
                            children: [
                              n.jsx("button", {
                                className: "button primary",
                                disabled: E.busy,
                                onClick: () => {
                                  E.run(async () => {
                                    (await Ye(
                                      c,
                                      `/workflow/facts/${b.facts.id}/review`,
                                      {
                                        idempotencyKey: crypto.randomUUID(),
                                        decision: "approved",
                                      },
                                    ),
                                      await de());
                                  }, "Факт рейса подтверждён.");
                                },
                                children: "Подтвердить факт",
                              }),
                              n.jsx("button", {
                                className: "button danger",
                                disabled: E.busy || ee.trim().length < 3,
                                onClick: () => {
                                  E.run(async () => {
                                    (await Ye(
                                      c,
                                      `/workflow/facts/${b.facts.id}/review`,
                                      {
                                        idempotencyKey: crypto.randomUUID(),
                                        decision: "returned",
                                        reason: ee.trim(),
                                      },
                                    ),
                                      await de());
                                  }, "Факт возвращён на исправление.");
                                },
                                children: "Вернуть",
                              }),
                            ],
                          }),
                        ],
                      }),
                    !b.facts &&
                      !V &&
                      n.jsx("p", {
                        className: "empty-message",
                        children:
                          "Водитель ещё не передал фактические показатели.",
                      }),
                  ],
                }),
              J === "attendance" &&
                n.jsxs("div", {
                  className: "workflow-content",
                  children: [
                    n.jsx("p", {
                      className: "muted",
                      children:
                        "Отметки сохраняют время действия и время получения сервером.",
                    }),
                    d.role === "driver" &&
                      n.jsx("div", {
                        className: "attendance-actions",
                        children: ["accept", "check_in", "check_out"].map(
                          (m) => {
                            const S = b.attendance.some(
                                (pe) => pe.driver.id === d.id && pe.kind === m,
                              ),
                              _ = le.some(
                                (pe) =>
                                  pe.type === "attendance" &&
                                  pe.payload.kind === m,
                              ),
                              ie = (pe) =>
                                b.attendance.some(
                                  (F) => F.driver.id === d.id && F.kind === pe,
                                ) ||
                                le.some(
                                  (F) =>
                                    F.type === "attendance" &&
                                    F.payload.kind === pe,
                                ),
                              ye = ie("accept"),
                              Te = ie("check_in"),
                              ne = ie("check_out");
                            return n.jsxs(
                              "button",
                              {
                                className: `button ${!S && !_ ? "primary" : "secondary"}`,
                                disabled:
                                  E.busy ||
                                  S ||
                                  _ ||
                                  ne ||
                                  (m === "accept" && Te) ||
                                  (m === "check_in" && !ye) ||
                                  (m === "check_out" && !Te),
                                onClick: () => {
                                  ((fe.current[m] ||= new Date().toISOString()),
                                    E.run(async () => {
                                      const pe = {
                                          idempotencyKey: H.current[m],
                                          kind: m,
                                          occurredAt: fe.current[m],
                                        },
                                        F = {
                                          id: d.id + ":" + pe.idempotencyKey,
                                          actorId: d.id,
                                          tripId: f,
                                          createdAt: new Date().toISOString(),
                                          type: "attendance",
                                          payload: pe,
                                        };
                                      return (
                                        await ce(F),
                                        navigator.onLine ? (await B(F), !0) : !1
                                      );
                                    }).then((pe) => {
                                      pe !== void 0 &&
                                        E.setSuccess(
                                          pe
                                            ? `${Do[m]}. Отметка получена сервером и доступна диспетчеру.`
                                            : "Отметка сохранена на устройстве. Диспетчер увидит её после отправки.",
                              m,
                            );
                                    }));
                                },
                                children: [
                                  n.jsxs("span", {
                                    children: [S ? "✓ " : "", sg[m]],
                                  }),
                                  n.jsx("small", {
                                    children: S
                                      ? "Подтверждено сервером"
                                      : _
                                        ? "Ожидает отправки"
                                        : m === "accept" && Te
                                          ? "Рейс начат без отметки принятия"
                                          : m === "check_in" && !ye
                                            ? "Сначала примите заявку"
                                            : m === "check_out" && !Te
                                              ? "После выхода на рейс"
                                              : "",
                                  }),
                                ],
                              },
                                        );
                          },
                        ),
                      }),
                    b.attendance.length
                      ? n.jsx("ol", {
                          className: "attendance-list",
                          children: b.attendance.map((m) =>
                            n.jsxs(
                              "li",
                              {
                                children: [
                                  n.jsx("strong", { children: Do[m.kind] }),
                                  d.role !== "driver" &&
                                    n.jsx("span", { children: m.driver.name }),
                                  n.jsx("span", { children: et(m.occurredAt) }),
                                  n.jsxs("small", {
                                    children: [
                                      "Получено: ",
                                      et(m.receivedAt),
                                      " ·",
                                      " ",
                                      m.channel === "web" || m.channel === "dev"
                                        ? "приложение"
                                        : m.channel,
                                    ],
                                  }),
                                ],
                              },
                              m.id,
                            ),
                          ),
                        })
                      : n.jsx("p", {
                          className: "empty-message",
                          children: "Отметок пока нет.",
                        }),
                    n.jsx("p", {
                      className: "input-hint",
                      children:
                        "Неотправленные отметки сохраняются на устройстве после нажатия. Диспетчер видит только полученные сервером отметки. При повторной отправке принятие, выход и завершение передаются по порядку. Отправьте их в течение 7 дней из той же учётной записи.",
                    }),
                  ],
                }),
            ],
          })
        : n.jsx("p", {
            className: "muted",
            children: E.busy ? "Загружаем данные…" : "Данные пока недоступны.",
          }),
    ],
  });
}
const dg = {
    traffic: "ГИБДД",
    repair: "Ремонт / франшиза",
    fuel: "Топливо",
    client_claim: "Претензия клиента",
    late_documents: "Опоздания / документы",
    temperature: "Температурный режим",
    other: "Другое удержание",
  },
  Bo = (c) =>
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(
      c / 100,
    ) + "%",
  ko = (c) =>
    new Date(`${c.slice(0, 10)}T12:00:00Z`).toLocaleDateString("ru-RU", {
      timeZone: "UTC",
    });
function $o({ result: c, preview: d = !1 }) {
  return n.jsxs("section", {
    className: "settlement-breakdown",
    "aria-label": d
      ? "Предварительный расчёт зарплаты"
      : "Пошаговый расчёт зарплаты",
    children: [
      d &&
        n.jsx("p", {
          className: "notice",
          children:
            "Предварительный расчёт. Депозит изменится только после подтверждения.",
        }),
      n.jsxs("div", {
        className: "payroll-overview",
        children: [
          n.jsxs("div", {
            className: "payroll-balance",
            children: [
              n.jsx("span", {
                children: d
                  ? "По расчёту осталось выплатить"
                  : "К выплате на дату расчёта",
              }),
              n.jsx("strong", { children: je(c.totalPayableKopecks) }),
              n.jsx("p", {
                children:
                  "Официальная часть и остаток по ведомости с учётом уже зафиксированных выплат.",
              }),
            ],
          }),
          n.jsxs("dl", {
            className: "payroll-totals",
            children: [
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "Общая зарплата" }),
                  n.jsx("dd", { children: je(c.grossKopecks) }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "В том числе официальная часть" }),
                  n.jsx("dd", { children: je(c.officialKopecks) }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "Осталось по официальной части" }),
                  n.jsx("dd", { children: je(c.officialRemainingKopecks) }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "Осталось по ведомости" }),
                  n.jsx("dd", { children: je(c.additionalPayableKopecks) }),
                ],
              }),
            ],
          }),
        ],
      }),
      !c.canConfirm &&
        n.jsxs("div", {
          className: "error",
          role: "alert",
          children: [
            n.jsxs("strong", {
              children: ["Не покрыто ", je(c.uncoveredKopecks), "."],
            }),
            " Зарплаты и допустимого использования депозита недостаточно. Такой расчёт нельзя подтвердить; проверьте суммы и основания.",
          ],
        }),
      n.jsxs("section", {
        className: "surface settlement-source",
        children: [
          n.jsx("h3", { children: "Из чего начислена зарплата" }),
          n.jsx("p", { children: c.grossExplanation }),
          n.jsxs("p", {
            className: "input-hint",
            children: ["Основание: ", c.sourceReference],
          }),
        ],
      }),
      n.jsxs("section", {
        className: "surface settlement-steps",
        "aria-label": "Как получилась сумма к выдаче",
        children: [
          n.jsx("h2", { children: "Как получилась сумма к выдаче" }),
          n.jsxs("p", {
            className: "muted",
            children: [
              "Общая зарплата ",
              je(c.grossKopecks),
              ". Официальная часть выделяется отдельно; следующие шаги объясняют расчёт оставшейся части.",
            ],
          }),
          c.steps.map((f, r) =>
            n.jsxs(
              "details",
              {
                className: "settlement-step",
                children: [
                  n.jsxs("summary", {
                    children: [
                      n.jsx("span", {
                        className: "settlement-step-number",
                        children: r + 1,
                      }),
                      n.jsxs("span", {
                        className: "settlement-step-label",
                        children: [
                          n.jsx("strong", { children: f.label }),
                          n.jsx("small", {
                            children:
                              f.kind === "official"
                                ? "Часть общей зарплаты"
                                : f.kind === "deposit_contribution"
                                  ? "Перевод в депозит"
                                  : f.kind === "payment"
                                    ? "Уже выплачено"
                                    : f.amountKopecks === 0
                                      ? "Удержаний нет"
                                      : "Удержание",
                          }),
                        ],
                      }),
                      n.jsxs("span", {
                        className: "settlement-step-money",
                        children: [
                          n.jsx("strong", { children: je(f.amountKopecks) }),
                          f.depositKopecks > 0 &&
                            n.jsxs("small", {
                              children: [
                                "Из ЗП ",
                                je(f.salaryKopecks),
                                " · из депозита ",
                                je(f.depositKopecks),
                              ],
                            }),
                          f.uncoveredKopecks > 0 &&
                            n.jsxs("small", {
                              children: ["Не покрыто ", je(f.uncoveredKopecks)],
                            }),
                          n.jsxs("small", {
                            children: [
                              "Остаток по ведомости ",
                              je(f.remainingSalaryKopecks),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                  n.jsxs("div", {
                    className: "payroll-line-details",
                    children: [
                      f.date &&
                        n.jsxs("p", { children: ["Дата: ", ko(f.date)] }),
                      n.jsx("p", { children: f.explanation }),
                      f.kind === "commission" &&
                        n.jsxs("p", {
                          className: "settlement-formula",
                          children: [
                            "(",
                            je(c.grossKopecks),
                            " − ",
                            je(c.officialKopecks),
                            ") × 8% = ",
                            n.jsx("strong", {
                              children: je(c.commissionKopecks),
                            }),
                          ],
                        }),
                      f.kind === "deposit_contribution" &&
                        n.jsxs(n.Fragment, {
                          children: [
                            n.jsxs("p", {
                              children: [
                                "Лимит: ",
                                je(c.grossKopecks),
                                " × ",
                                Bo(c.policy.maxContributionBasisPoints),
                                " = ",
                                je(c.contributionCapKopecks),
                                ".",
                              ],
                            }),
                            n.jsx("p", {
                              children:
                                "Пополнение ограничено недостающей суммой до цели и деньгами после удержаний и учтённых выплат. После заполнения депозита пополнение прекращается.",
                            }),
                          ],
                        }),
                      f.kind === "deduction" &&
                        n.jsxs("dl", {
                          className: "settlement-funding",
                          children: [
                            n.jsxs("div", {
                              children: [
                                n.jsx("dt", { children: "Из зарплаты" }),
                                n.jsx("dd", { children: je(f.salaryKopecks) }),
                              ],
                            }),
                            n.jsxs("div", {
                              children: [
                                n.jsx("dt", { children: "Из депозита" }),
                                n.jsx("dd", { children: je(f.depositKopecks) }),
                              ],
                            }),
                            f.uncoveredKopecks > 0 &&
                              n.jsxs("div", {
                                children: [
                                  n.jsx("dt", { children: "Не покрыто" }),
                                  n.jsx("dd", {
                                    children: je(f.uncoveredKopecks),
                                  }),
                                ],
                              }),
                          ],
                        }),
                      n.jsxs("p", {
                        className: "payroll-evidence",
                        children: [
                          n.jsx("span", { children: "Основание:" }),
                          " ",
                          f.sourceReference,
                        ],
                      }),
                    ],
                  }),
                ],
              },
              f.id,
            ),
          ),
          n.jsxs("div", {
            className: "settlement-final",
            children: [
              n.jsx("span", { children: "К выдаче по ведомости" }),
              n.jsx("strong", { children: je(c.additionalPayableKopecks) }),
            ],
          }),
        ],
      }),
      n.jsxs("section", {
        className: "surface",
        "aria-label": "Депозит по выбранному расчёту",
        children: [
          n.jsx("h2", { children: "Депозит по этому расчёту" }),
          n.jsxs("div", {
            className: "deposit-metrics",
            children: [
              n.jsxs("div", {
                children: [
                  n.jsx("span", { children: "Было" }),
                  n.jsx("strong", { children: je(c.depositOpeningKopecks) }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("span", { children: "Использовано" }),
                  n.jsxs("strong", {
                    children: ["−", je(c.depositUsedKopecks)],
                  }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("span", { children: "Пополнено" }),
                  n.jsxs("strong", {
                    children: ["+", je(c.depositContributionKopecks)],
                  }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("span", { children: "Стало" }),
                  n.jsx("strong", { children: je(c.depositClosingKopecks) }),
                ],
              }),
            ],
          }),
          n.jsxs("p", {
            className: "muted",
            children: [
              "Цель ",
              je(c.policy.targetKopecks),
              ". Лимит пополнения ",
              Bo(c.policy.maxContributionBasisPoints),
              " от общей зарплаты.",
            ],
          }),
          n.jsx("p", {
            className: "input-hint",
            children:
              "Удержания сначала покрываются оставшейся частью зарплаты. Депозит покрывает недостаток по подтверждённым удержаниям; использованная сумма повторно из зарплаты не вычитается.",
          }),
        ],
      }),
      n.jsxs("section", {
        className: "surface settlement-payments",
        children: [
          n.jsx("h3", { children: "Уже выплачено" }),
          n.jsxs("dl", {
            className: "settlement-funding",
            children: [
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "По официальной части" }),
                  n.jsx("dd", { children: je(c.officialPaidKopecks) }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("dt", {
                    children: "Авансы / наличные по остальной части",
                  }),
                  n.jsx("dd", { children: je(c.additionalPaidKopecks) }),
                ],
              }),
            ],
          }),
          c.officialPaidKopecks > 0 &&
            n.jsxs("p", {
              className: "input-hint",
              children: ["Официальная часть: ", c.officialPaymentReference],
            }),
          c.additionalPaidKopecks > 0 &&
            n.jsxs("p", {
              className: "input-hint",
              children: ["Остальные выплаты: ", c.additionalPaymentReference],
            }),
        ],
      }),
    ],
  });
}
function Qp({ account: c }) {
  const d = Math.max(0, c.policy.targetKopecks - c.balanceKopecks),
    f =
      c.state === "returned"
        ? "Возврат зафиксирован"
        : c.state === "reconciled"
          ? "Сверки завершены · ожидается возврат"
          : d === 0
            ? "Депозит набран"
            : c.policy.maxContributionBasisPoints === 0
              ? "Пополнение отключено"
              : "Пополнение до цели";
  return n.jsxs("section", {
    className: "surface deposit-account",
    "aria-label": "Текущий депозит",
    children: [
      n.jsxs("div", {
        className: "section-heading",
        children: [
          n.jsxs("div", {
            children: [
              n.jsx("span", {
                className: "eyebrow",
                children: "Депозит сейчас",
              }),
              n.jsx("h2", { children: je(c.balanceKopecks) }),
            ],
          }),
          n.jsx("span", { className: "payroll-status approved", children: f }),
        ],
      }),
      n.jsxs("p", {
        className: "muted",
        children: [
          c.project.name,
          " · ",
          c.legalEntity.name,
          " · ",
          c.responsibilityScope.name,
        ],
      }),
      n.jsxs("div", {
        className: "deposit-metrics",
        children: [
          n.jsxs("div", {
            children: [
              n.jsx("span", { children: "Цель" }),
              n.jsx("strong", { children: je(c.policy.targetKopecks) }),
            ],
          }),
          n.jsxs("div", {
            children: [
              n.jsx("span", { children: "Лимит от общей ЗП" }),
              n.jsx("strong", {
                children: Bo(c.policy.maxContributionBasisPoints),
              }),
            ],
          }),
          c.state === "active" &&
            n.jsxs("div", {
              children: [
                n.jsx("span", { children: "До цели" }),
                n.jsx("strong", { children: je(d) }),
              ],
            }),
        ],
      }),
      n.jsx("p", {
        className: "input-hint",
        children:
          "Набранный депозит сохраняется до увольнения и завершения сверок. Он используется раньше только при нехватке зарплаты для подтверждённых удержаний, затем снова пополняется.",
      }),
      c.returnInfo &&
        n.jsxs("div", {
          className: "deposit-return-info",
          children: [
            n.jsx("h3", { children: "Возврат после увольнения" }),
            n.jsxs("p", {
              children: [
                "Дата увольнения: ",
                ko(c.returnInfo.terminationDate),
                ". Сверки завершены ",
                et(c.returnInfo.reconciledAt),
                ".",
              ],
            }),
            n.jsx("p", { children: c.returnInfo.explanation }),
            n.jsxs("p", {
              children: ["Основание: ", c.returnInfo.reconciliationReference],
            }),
            n.jsxs("p", {
              children: [
                "Сумма возврата: ",
                n.jsx("strong", { children: je(c.returnInfo.amountKopecks) }),
              ],
            }),
            c.returnInfo.paidAt
              ? n.jsxs("p", {
                  children: [
                    "Выплата ",
                    ko(c.returnInfo.paymentDate),
                    " · ",
                    c.returnInfo.paymentReference,
                  ],
                })
              : n.jsx("p", {
                  children: "Факт возврата денег ещё не зарегистрирован.",
                }),
          ],
        }),
      n.jsxs("details", {
        className: "deposit-history",
        children: [
          n.jsxs("summary", {
            children: ["История движения депозита · ", c.ledger.length],
          }),
          c.ledger.length
            ? c.ledger.map((r) =>
                n.jsxs(
                  "div",
                  {
                    className: "deposit-entry",
                    children: [
                      n.jsxs("div", {
                        children: [
                          n.jsx("strong", {
                            children:
                              r.kind === "contribution"
                                ? "Пополнение из зарплаты"
                                : r.kind === "deduction"
                                  ? "Покрытие недостатка зарплаты"
                                  : "Возврат депозита",
                          }),
                          n.jsxs("span", {
                            children: [
                              r.amountKopecks > 0 ? "+" : "",
                              je(r.amountKopecks),
                            ],
                          }),
                        ],
                      }),
                      n.jsx("p", { children: r.explanation }),
                      n.jsxs("small", {
                        children: [
                          et(r.createdAt),
                          " · Остаток ",
                          je(r.balanceAfterKopecks),
                        ],
                      }),
                      n.jsxs("p", {
                        className: "input-hint",
                        children: ["Основание: ", r.sourceReference],
                      }),
                    ],
                  },
                  r.id,
                ),
              )
            : n.jsx("p", {
                className: "muted",
                children:
                  "Движений ещё нет. Цель депозита не является уже удержанной суммой.",
              }),
        ],
      }),
    ],
  });
}
const Zs = (c) =>
    [c.driverUserId, c.projectId, c.responsibilityScopeId].join(":"),
  fg = (c) => String(c / 100),
  wn = () => crypto.randomUUID();
function hg({ token: c, actor: d, onExpired: f }) {
  const [r, g] = h.useState([]),
    [p, b] = h.useState(""),
    [D, J] = h.useState(!0),
    [j, U] = h.useState(""),
    [y, L] = h.useState(0),
    M = h.useRef(f);
  ((M.current = f),
    h.useEffect(() => {
      const te = new AbortController();
      return (
        J(!0),
        U(""),
        g([]),
        ze("/finance/payroll/catalog", { signal: te.signal }, c)
          .then(({ items: R }) => {
            te.signal.aborted ||
              (g(R),
              b((re) =>
                R.some((le) => Zs(le) === re) ? re : R[0] ? Zs(R[0]) : "",
              ));
          })
          .catch((R) => {
            te.signal.aborted ||
              (R instanceof Ne && R.status === 401
                ? M.current()
                : U(
                    R instanceof Ne
                      ? R.message
                      : "Не удалось загрузить водителей.",
                  ));
          })
          .finally(() => {
            te.signal.aborted || J(!1);
          }),
        () => te.abort()
      );
    }, [c, y]));
  const ee = r.find((te) => Zs(te) === p);
  return n.jsxs("div", {
    className: "payroll-management",
    children: [
      n.jsxs("div", {
        className: "section-heading",
        children: [
          n.jsxs("div", {
            children: [
              n.jsx("h2", { children: "Зарплаты и депозиты" }),
              n.jsx("p", {
                className: "muted",
                children:
                  "Настройки, расчёт по ведомости и подтверждённые движения денег.",
              }),
            ],
          }),
          n.jsx("button", {
            className: "button secondary",
            disabled: D,
            onClick: () => L((te) => te + 1),
            children: "Обновить водителей",
          }),
        ],
      }),
      n.jsx(Ot, { error: j }),
      D
        ? n.jsx("p", { role: "status", children: "Загружаем водителей…" })
        : r.length
          ? n.jsx(ue, {
              label: "Водитель",
              children: n.jsx("select", {
                value: p,
                onChange: (te) => b(te.target.value),
                children: r.map((te) =>
                  n.jsxs(
                    "option",
                    {
                      value: Zs(te),
                      children: [
                        te.driverLabel,
                        " · ",
                        te.accountId ? `Счёт ${te.accountId.slice(0, 8)}` : "Новый счёт",
                      ],
                    },
                    Zs(te),
                  ),
                ),
              }),
            })
          : !j &&
            n.jsx("p", {
              className: "notice",
              children: "Нет водителей в доступных вам финансовых контурах.",
            }),
      ee &&
        n.jsx(
          mg,
          { token: c, actor: d, onExpired: f, driver: ee },
          `${c}:${p}`,
        ),
    ],
  });
}
function mg({ token: c, actor: d, onExpired: f, driver: r }) {
  const g = Jl(f),
    [p, b] = h.useState(null),
    [D, J] = h.useState(!!r.accountId),
    [j, U] = h.useState(""),
    [y, L] = h.useState(0),
    [M, ee] = h.useState(r.accountId),
    te = h.useRef(wn()),
    R = h.useRef(f);
  R.current = f;
  const re = d.role === "document_specialist";
  h.useEffect(() => {
    const K = new AbortController();
    return (
      b(null),
      U(""),
      J(!!M),
      M &&
        ze(`/finance/payroll/accounts/${M}`, { signal: K.signal }, c)
          .then((I) => {
            K.signal.aborted || b(I);
          })
          .catch((I) => {
            K.signal.aborted ||
              (I instanceof Ne && I.status === 401
                ? R.current()
                : U(
                    I instanceof Ne && I.status === 404
                      ? "Депозит недоступен. Обновите водителей."
                      : I instanceof Ne
                        ? I.message
                        : "Не удалось загрузить депозит.",
                  ));
          })
          .finally(() => {
            K.signal.aborted || J(!1);
          }),
      () => K.abort()
    );
  }, [c, M, y]);
  async function le() {
    const K = await g.run(
      () =>
        Ye(c, "/finance/payroll/accounts", {
          driverUserId: r.driverUserId,
          projectId: r.projectId,
          responsibilityScopeId: r.responsibilityScopeId,
          idempotencyKey: te.current,
        }),
      "Депозит доступен. Текущие настройки показаны ниже.",
    );
    K && ee(K.id);
  }
  return n.jsxs("div", {
    className: "payroll-account-workspace",
    children: [
      n.jsx(Ot, { error: j || g.error, success: g.success }),
      D && n.jsx("p", { role: "status", children: "Загружаем депозит…" }),
      j &&
        n.jsx("button", {
          className: "button secondary",
          onClick: () => L((K) => K + 1),
          children: "Повторить загрузку",
        }),
      !M &&
        n.jsxs("section", {
          className: "surface",
          children: [
            n.jsx("h3", { children: "Депозит ещё не открыт" }),
            n.jsx("p", {
              children:
                "По умолчанию цель — 30 000 ₽, пополнение — не более 50% общей зарплаты. Открытие счёта само по себе денег не удерживает.",
            }),
            re &&
              n.jsx("button", {
                className: "button",
                disabled: g.busy,
                onClick: () => {
                  le();
                },
                children: "Открыть депозит",
              }),
          ],
        }),
      p &&
        n.jsxs(n.Fragment, {
          children: [
            n.jsx(Qp, { account: p }),
            n.jsx(
              pg,
              { token: c, onExpired: f, account: p },
              `history:${p.accountVersion}`,
            ),
            re
              ? n.jsxs(n.Fragment, {
                  children: [
                    n.jsx(
                      vg,
                      {
                        token: c,
                        onExpired: f,
                        account: p,
                        onSaved: (K) => {
                          (b(K), g.setSuccess("Настройки депозита сохранены."));
                        },
                      },
                      `settings:${p.accountVersion}`,
                    ),
                    n.jsx(
                      xg,
                      {
                        token: c,
                        onExpired: f,
                        account: p,
                        driver: r,
                        onSaved: () => {
                          (g.setSuccess(
                            "Расчёт подтверждён и опубликован в кабинете водителя. Движения депозита сохранены.",
                          ),
                            L((K) => K + 1));
                        },
                      },
                      `editor:${p.accountVersion}`,
                    ),
                    n.jsx(
                      yg,
                      {
                        token: c,
                        onExpired: f,
                        account: p,
                        onSaved: (K) => {
                          (b(K),
                            g.setSuccess(
                              K.state === "returned"
                                ? "Факт возврата сохранён."
                                : "Сверки завершены. Остаток зафиксирован к возврату.",
                            ));
                        },
                      },
                      `return:${p.accountVersion}`,
                    ),
                  ],
                })
              : n.jsx("p", {
                  className: "notice",
                  children:
                    "Вам доступен просмотр. Настройки и подтверждение расчётов выполняет документовед с финансовым доступом.",
                }),
          ],
        }),
    ],
  });
}
function pg({ token: c, onExpired: d, account: f }) {
  const [r, g] = h.useState([]),
    [p, b] = h.useState(""),
    [D, J] = h.useState(null),
    [j, U] = h.useState(""),
    [y, L] = h.useState(!0),
    [M, ee] = h.useState(0),
    te = h.useRef(d);
  return (
    (te.current = d),
    h.useEffect(() => {
      const R = new AbortController();
      return (
        g([]),
        U(""),
        L(!0),
        ze(
          `/finance/payroll/accounts/${f.id}/statements`,
          { signal: R.signal },
          c,
        )
          .then((re) => {
            R.signal.aborted || g(re.items);
          })
          .catch((re) => {
            R.signal.aborted ||
              (re instanceof Ne && re.status === 401
                ? te.current()
                : U("Не удалось загрузить историю расчётов."));
          })
          .finally(() => {
            R.signal.aborted || L(!1);
          }),
        () => R.abort()
      );
    }, [c, f.id, M]),
    h.useEffect(() => {
      const R = new AbortController();
      return (
        J(null),
        p &&
          ze(`/finance/payroll/statements/${p}`, { signal: R.signal }, c)
            .then((re) => {
              R.signal.aborted || J(re);
            })
            .catch((re) => {
              R.signal.aborted ||
                (re instanceof Ne && re.status === 401
                  ? te.current()
                  : U("Расчёт недоступен. Обновите историю."));
            }),
        () => R.abort()
      );
    }, [c, p, M]),
    n.jsxs("details", {
      className: "surface payroll-settings",
      children: [
        n.jsxs("summary", { children: ["Утверждённые расчёты · ", r.length] }),
        y && n.jsx("p", { role: "status", children: "Загружаем историю…" }),
        n.jsx(Ot, { error: j }),
        j &&
          n.jsx("button", {
            className: "button secondary",
            onClick: () => {
              (J(null), ee((R) => R + 1));
            },
            children: "Повторить загрузку",
          }),
        !y &&
          !j &&
          !r.length &&
          n.jsx("p", {
            className: "muted",
            children: "Расчётов по новой ведомости ещё нет.",
          }),
        !!r.length &&
          n.jsx(ue, {
            label: "Открыть утверждённый расчёт",
            children: n.jsxs("select", {
              value: p,
              onChange: (R) => {
                (J(null), U(""), b(R.target.value));
              },
              children: [
                n.jsx("option", { value: "", children: "Выберите период" }),
                r.map((R) =>
                  n.jsxs(
                    "option",
                    {
                      value: R.id,
                      children: [R.periodStart, " — ", R.periodEnd],
                    },
                    R.id,
                  ),
                ),
              ],
            }),
          }),
        p &&
          !D &&
          !j &&
          n.jsx("p", { role: "status", children: "Загружаем расчёт…" }),
        D?.id === p &&
          D.settlement &&
          n.jsxs("div", {
            className: "payroll-preview",
            children: [
              D.sourceKind === "demo_manual" &&
                n.jsx("p", {
                  className: "payroll-demo-note",
                  children: "Учебный расчёт с вымышленными суммами.",
                }),
              n.jsx($o, { result: D.settlement }),
              n.jsxs("p", {
                className: "input-hint",
                children: [
                  "Утверждённый расчёт: ",
                  D.id,
                  ". Суммы сохранены на дату подтверждения.",
                ],
              }),
            ],
          }),
      ],
    })
  );
}
function vg({ token: c, onExpired: d, account: f, onSaved: r }) {
  const g = Jl(d),
    [p, b] = h.useState(fg(f.policy.targetKopecks)),
    [D, J] = h.useState(String(f.policy.maxContributionBasisPoints / 100)),
    [j, U] = h.useState(""),
    y = h.useRef(wn());
  if (f.state !== "active") return null;
  async function L() {
    let M, ee;
    try {
      if (((M = gl(p)), (ee = gl(D)), ee > 1e4))
        throw new Error("Лимит должен быть от 0 до 100%.");
    } catch (R) {
      g.setError(R.message);
      return;
    }
    const te = await g.run(() =>
      Ye(c, `/finance/payroll/accounts/${f.id}/policy`, {
        targetKopecks: M,
        maxContributionBasisPoints: ee,
        reason: j.trim(),
        accountVersion: f.accountVersion,
        idempotencyKey: y.current,
      }),
    );
    te && r(te);
  }
  return n.jsxs("details", {
    className: "surface payroll-settings",
    children: [
      n.jsx("summary", { children: "Настройки депозита" }),
      n.jsx("form", {
        onChange: () => {
          y.current = wn();
        },
        onSubmit: (M) => {
          (M.preventDefault(), L());
        },
        children: n.jsxs("fieldset", {
          disabled: g.busy,
          children: [
            n.jsxs("div", {
              className: "form-grid",
              children: [
                n.jsx(ue, {
                  label: "Цель депозита, ₽",
                  children: n.jsx("input", {
                    inputMode: "decimal",
                    value: p,
                    onChange: (M) => b(M.target.value),
                    required: !0,
                  }),
                }),
                n.jsx(ue, {
                  label: "Максимум от общей зарплаты, %",
                  children: n.jsx("input", {
                    inputMode: "decimal",
                    value: D,
                    onChange: (M) => J(M.target.value),
                    required: !0,
                  }),
                }),
                n.jsx(ue, {
                  label: "Основание изменения",
                  children: n.jsx("input", {
                    value: j,
                    maxLength: 300,
                    onChange: (M) => U(M.target.value),
                    required: !0,
                  }),
                }),
              ],
            }),
            n.jsx("p", {
              className: "input-hint",
              children:
                "Новая настройка применяется к следующим расчётам. Снижение цели не оформляет возврат денег автоматически.",
            }),
            n.jsx(Ot, { error: g.error }),
            n.jsx("button", {
              className: "button secondary",
              type: "submit",
              children: "Сохранить настройки",
            }),
          ],
        }),
      }),
    ],
  });
}
function xg({ token: c, onExpired: d, account: f, driver: r, onSaved: g }) {
  const p = Jl(d),
    b = Zl(),
    [D, J] = h.useState({
      periodStart: `${b.slice(0, 7)}-01`,
      periodEnd: b,
      gross: "",
      official: "",
      grossExplanation: "",
      sourceReference: "",
      officialPaid: "0",
      officialPaymentReference: "",
      additionalPaid: "0",
      additionalPaymentReference: "",
    }),
    [j, U] = h.useState([]),
    [y, L] = h.useState(null),
    [M, ee] = h.useState(!1),
    te = h.useRef(wn()),
    R = () => {
      (L(null), ee(!1), (te.current = wn()), p.setError(""));
    },
    re = (k, Z) => {
      (J((G) => ({ ...G, [k]: Z })), R());
    },
    le = (k, Z) => {
      (U((G) => G.map((E) => (E.id === k ? { ...E, ...Z } : E))), R());
    };
  if (f.state !== "active") return null;
  async function K() {
    let k;
    try {
      const G = gl(D.gross),
        E = gl(D.official),
        se = gl(D.officialPaid),
        P = gl(D.additionalPaid);
      if (E > G)
        throw new Error("Официальная часть не может превышать общую зарплату.");
      if (se > E || P > G - E)
        throw new Error(
          "Проверьте уже выплаченные суммы: они превышают соответствующую часть зарплаты.",
        );
      if (D.periodStart > D.periodEnd)
        throw new Error("Конец периода должен быть не раньше начала.");
      if (
        (se > 0 && !D.officialPaymentReference.trim()) ||
        (P > 0 && !D.additionalPaymentReference.trim())
      )
        throw new Error(
          "Укажите документ-основание каждой уже произведённой выплаты.",
        );
      k = {
        driverUserId: r.driverUserId,
        projectId: r.projectId,
        responsibilityScopeId: r.responsibilityScopeId,
        periodStart: D.periodStart,
        periodEnd: D.periodEnd,
        grossKopecks: G,
        officialKopecks: E,
        grossExplanation: D.grossExplanation.trim(),
        sourceReference: D.sourceReference.trim(),
        officialPaidKopecks: se,
        officialPaymentReference: D.officialPaymentReference.trim(),
        additionalPaidKopecks: P,
        additionalPaymentReference: D.additionalPaymentReference.trim(),
        deductions: j.map(({ amount: H, ...fe }) => {
          const Y = gl(H);
          if (!Y) throw new Error("Сумма удержания должна быть больше нуля.");
          return {
            ...fe,
            label: fe.label.trim(),
            explanation: fe.explanation.trim(),
            sourceReference: fe.sourceReference.trim(),
            amountKopecks: Y,
          };
        }),
      };
    } catch (G) {
      p.setError(G.message);
      return;
    }
    const Z = await p.run(() => Ye(c, "/finance/payroll/preview", k));
    Z && (L({ response: Z, input: k }), ee(!1));
  }
  async function I() {
    if (!y || !M || !y.response.result.canConfirm) return;
    (await p.run(
      () =>
        Ye(c, "/finance/payroll/confirm", {
          ...y.input,
          accountVersion: y.response.accountVersion,
          idempotencyKey: te.current,
          humanConfirmed: !0,
        }),
      "Расчёт подтверждён и доступен водителю.",
    )) && (L(null), g());
  }
  return n.jsxs("section", {
    className: "surface payroll-editor",
    children: [
      n.jsx("h2", { children: "Расчёт зарплаты" }),
      n.jsx("p", {
        className: "muted",
        children:
          "Введите проверенные начисления и основания. Водитель увидит эти пояснения после подтверждения.",
      }),
      n.jsx("form", {
        onSubmit: (k) => {
          (k.preventDefault(), K());
        },
        children: n.jsxs("fieldset", {
          disabled: p.busy,
          children: [
            n.jsxs("div", {
              className: "form-grid",
              children: [
                n.jsx(ue, {
                  label: "Начало периода",
                  children: n.jsx("input", {
                    type: "date",
                    value: D.periodStart,
                    required: !0,
                    onChange: (k) => re("periodStart", k.target.value),
                  }),
                }),
                n.jsx(ue, {
                  label: "Конец периода",
                  children: n.jsx("input", {
                    type: "date",
                    value: D.periodEnd,
                    required: !0,
                    onChange: (k) => re("periodEnd", k.target.value),
                  }),
                }),
                n.jsx(ue, {
                  label: "Общая зарплата, ₽",
                  hint: "Включая официальную часть",
                  children: n.jsx("input", {
                    inputMode: "decimal",
                    value: D.gross,
                    required: !0,
                    onChange: (k) => re("gross", k.target.value),
                  }),
                }),
                n.jsx(ue, {
                  label: "Официальная часть, ₽",
                  children: n.jsx("input", {
                    inputMode: "decimal",
                    value: D.official,
                    required: !0,
                    onChange: (k) => re("official", k.target.value),
                  }),
                }),
              ],
            }),
            n.jsx(ue, {
              label: "Из чего начислена зарплата",
              hint: "Укажите смены, ставки, доплаты и формулы, чтобы водитель мог проверить сумму",
              children: n.jsx("textarea", {
                value: D.grossExplanation,
                maxLength: 1e3,
                required: !0,
                onChange: (k) => re("grossExplanation", k.target.value),
              }),
            }),
            n.jsx(ue, {
              label: "Основание начисления",
              children: n.jsx("input", {
                value: D.sourceReference,
                maxLength: 300,
                required: !0,
                onChange: (k) => re("sourceReference", k.target.value),
              }),
            }),
            n.jsx("p", {
              className: "notice",
              children:
                "Официальная часть учитывается отдельно. Комиссия 8% считается от общей зарплаты за вычетом официальной части. Удержания покрываются из остатка по ведомости; депозит используется только при недостатке.",
            }),
            n.jsxs("details", {
              className: "payroll-input-details",
              children: [
                n.jsx("summary", {
                  children: "Уже произведённые выплаты и авансы",
                }),
                n.jsxs("div", {
                  className: "form-grid",
                  children: [
                    n.jsx(ue, {
                      label: "Уже выплачено официально, ₽",
                      children: n.jsx("input", {
                        inputMode: "decimal",
                        value: D.officialPaid,
                        required: !0,
                        onChange: (k) => re("officialPaid", k.target.value),
                      }),
                    }),
                    n.jsx(ue, {
                      label: "Документ официальной выплаты",
                      children: n.jsx("input", {
                        value: D.officialPaymentReference,
                        maxLength: 300,
                        onChange: (k) =>
                          re("officialPaymentReference", k.target.value),
                      }),
                    }),
                    n.jsx(ue, {
                      label: "Авансы / наличные по ведомости, ₽",
                      children: n.jsx("input", {
                        inputMode: "decimal",
                        value: D.additionalPaid,
                        required: !0,
                        onChange: (k) => re("additionalPaid", k.target.value),
                      }),
                    }),
                    n.jsx(ue, {
                      label: "Документ аванса / выплаты",
                      children: n.jsx("input", {
                        value: D.additionalPaymentReference,
                        maxLength: 300,
                        onChange: (k) =>
                          re("additionalPaymentReference", k.target.value),
                      }),
                    }),
                  ],
                }),
              ],
            }),
            n.jsxs("div", {
              className: "section-heading",
              children: [
                n.jsx("h3", { children: "Подтверждённые удержания" }),
                n.jsx("button", {
                  className: "button secondary",
                  type: "button",
                  disabled: j.length >= 20,
                  onClick: () => {
                    (U((k) => [
                      ...k,
                      {
                        id: wn(),
                        category: "client_claim",
                        date: b,
                        label: "",
                        amount: "",
                        explanation: "",
                        sourceReference: "",
                      },
                    ]),
                      R());
                  },
                  children: "Добавить удержание",
                }),
              ],
            }),
            !j.length &&
              n.jsx("p", {
                className: "muted",
                children:
                  "Удержаний нет. Комиссия рассчитывается отдельно автоматически.",
              }),
            j.map((k, Z) =>
              n.jsxs(
                "div",
                {
                  className: "payroll-deduction-input",
                  children: [
                    n.jsxs("div", {
                      className: "section-heading",
                      children: [
                        n.jsxs("h4", { children: ["Удержание ", Z + 1] }),
                        n.jsx("button", {
                          className: "button secondary",
                          type: "button",
                          "aria-label": `Удалить удержание ${Z + 1}`,
                          onClick: () => {
                            (U((G) => G.filter((E) => E.id !== k.id)), R());
                          },
                          children: "Удалить",
                        }),
                      ],
                    }),
                    n.jsxs("div", {
                      className: "form-grid",
                      children: [
                        n.jsx(ue, {
                          label: `Категория удержания ${Z + 1}`,
                          children: n.jsx("select", {
                            value: k.category,
                            onChange: (G) =>
                              le(k.id, { category: G.target.value }),
                            children: Object.entries(dg).map(([G, E]) =>
                              n.jsx("option", { value: G, children: E }, G),
                            ),
                          }),
                        }),
                        n.jsx(ue, {
                          label: `Дата удержания ${Z + 1}`,
                          children: n.jsx("input", {
                            type: "date",
                            value: k.date,
                            required: !0,
                            onChange: (G) => le(k.id, { date: G.target.value }),
                          }),
                        }),
                        n.jsx(ue, {
                          label: `Название удержания ${Z + 1}`,
                          children: n.jsx("input", {
                            value: k.label,
                            maxLength: 200,
                            required: !0,
                            onChange: (G) =>
                              le(k.id, { label: G.target.value }),
                          }),
                        }),
                        n.jsx(ue, {
                          label: `Сумма удержания ${Z + 1}, ₽`,
                          children: n.jsx("input", {
                            inputMode: "decimal",
                            value: k.amount,
                            required: !0,
                            onChange: (G) =>
                              le(k.id, { amount: G.target.value }),
                          }),
                        }),
                      ],
                    }),
                    n.jsx(ue, {
                      label: `За что и как рассчитано удержание ${Z + 1}`,
                      children: n.jsx("textarea", {
                        value: k.explanation,
                        maxLength: 1e3,
                        required: !0,
                        onChange: (G) =>
                          le(k.id, { explanation: G.target.value }),
                      }),
                    }),
                    n.jsx(ue, {
                      label: `Документ и решение по удержанию ${Z + 1}`,
                      children: n.jsx("input", {
                        value: k.sourceReference,
                        maxLength: 300,
                        required: !0,
                        onChange: (G) =>
                          le(k.id, { sourceReference: G.target.value }),
                      }),
                    }),
                  ],
                },
                k.id,
              ),
            ),
            n.jsx("button", {
              className: "button",
              type: "submit",
              children: p.busy
                ? "Выполняем…"
                : "Рассчитать без удержания денег",
            }),
          ],
        }),
      }),
      n.jsx(Ot, { error: p.error, success: p.success }),
      y &&
        n.jsxs("div", {
          className: "payroll-preview",
          children: [
            n.jsx($o, { result: y.response.result, preview: !0 }),
            n.jsxs("label", {
              className: "payroll-confirm",
              children: [
                n.jsx("input", {
                  type: "checkbox",
                  checked: M,
                  disabled: p.busy,
                  onChange: (k) => ee(k.target.checked),
                }),
                n.jsx("span", {
                  children:
                    "Проверены начисления, фактические выплаты, основания удержаний и причастность водителя. Подтверждаю расчёт.",
                }),
              ],
            }),
            n.jsx("button", {
              className: "button",
              disabled: p.busy || !M || !y.response.result.canConfirm,
              onClick: () => {
                I();
              },
              children: "Подтвердить и показать водителю",
            }),
            n.jsx("p", {
              className: "input-hint",
              children:
                "Подтверждение сохраняет расчёт и движения депозита. Банковский перевод эта кнопка не выполняет. Изменить утверждённую ведомость здесь нельзя.",
            }),
          ],
        }),
    ],
  });
}
function yg({ token: c, onExpired: d, account: f, onSaved: r }) {
  const g = Jl(d),
    [p, b] = h.useState(Zl()),
    [D, J] = h.useState(""),
    [j, U] = h.useState(""),
    [y, L] = h.useState(!1),
    M = h.useRef(wn());
  if (f.state === "returned") return null;
  const ee = f.state === "active";
  async function te() {
    if (!y) return;
    const R = ee
        ? {
            terminationDate: p,
            reconciliationReference: D.trim(),
            explanation: j.trim(),
          }
        : { paymentDate: p, paymentReference: D.trim() },
      re = await g.run(() =>
        Ye(
          c,
          `/finance/payroll/accounts/${f.id}/${ee ? "reconcile" : "return-payment"}`,
          {
            ...R,
            accountVersion: f.accountVersion,
            idempotencyKey: M.current,
            humanConfirmed: !0,
          },
        ),
      );
    re && r(re);
  }
  return n.jsxs("details", {
    className: "surface payroll-settings",
    children: [
      n.jsx("summary", {
        children: ee
          ? "Увольнение и завершение сверок"
          : "Зарегистрировать фактический возврат депозита",
      }),
      n.jsx("form", {
        onChange: () => {
          M.current = wn();
        },
        onSubmit: (R) => {
          (R.preventDefault(), te());
        },
        children: n.jsxs("fieldset", {
          disabled: g.busy,
          children: [
            n.jsx("p", {
              className: "notice",
              children: ee
                ? "Завершайте сверки после проверки всех расчётов, претензий и штрафов. После этого новые зарплаты и удержания по этому депозиту не принимаются, остаток фиксируется к возврату."
                : "Внесите сведения об уже выполненной выплате полного остатка. Банковский перевод приложение не отправляет.",
            }),
            n.jsxs("div", {
              className: "form-grid",
              children: [
                n.jsx(ue, {
                  label: ee ? "Дата увольнения" : "Дата фактического возврата",
                  children: n.jsx("input", {
                    type: "date",
                    value: p,
                    max: Zl(),
                    required: !0,
                    onChange: (R) => {
                      (b(R.target.value), L(!1));
                    },
                  }),
                }),
                n.jsx(ue, {
                  label: ee
                    ? "Документ завершения сверок"
                    : "Документ возврата денег",
                  children: n.jsx("input", {
                    value: D,
                    maxLength: 300,
                    required: !0,
                    onChange: (R) => {
                      (J(R.target.value), L(!1));
                    },
                  }),
                }),
              ],
            }),
            ee &&
              n.jsx(ue, {
                label: "Результат сверок",
                children: n.jsx("textarea", {
                  value: j,
                  maxLength: 1e3,
                  required: !0,
                  onChange: (R) => {
                    (U(R.target.value), L(!1));
                  },
                }),
              }),
            n.jsxs("label", {
              className: "payroll-confirm",
              children: [
                n.jsx("input", {
                  type: "checkbox",
                  checked: y,
                  onChange: (R) => L(R.target.checked),
                }),
                n.jsx("span", {
                  children: ee
                    ? "Все сверки завершены, окончательный расчёт проверен, остаток согласован к возврату."
                    : "Подтверждаю фактический возврат всей суммы по указанному документу.",
                }),
              ],
            }),
            n.jsx(Ot, { error: g.error }),
            n.jsx("button", {
              className: "button secondary",
              type: "submit",
              disabled: !y,
              children: ee
                ? "Завершить сверки и зафиксировать сумму возврата"
                : "Зафиксировать возврат по документу",
            }),
          ],
        }),
      }),
    ],
  });
}
const gg = {
  unknown_trip: "Рейс не найден",
  duplicate_trip: "Повтор рейса",
  invalid_amount: "Некорректная сумма",
  trip_not_completed: "Рейс не завершён",
  facts_not_approved: "Факт не подтверждён",
  documents_not_accepted: "Документы не приняты",
  tariff_missing: "Нет тарифа на дату рейса",
  amount_mismatch: "Сумма не совпадает",
  already_confirmed: "Рейс уже в подтверждённом реестре",
  pricing_registry_pending:
    "Расчёт конструктора: новый формат реестра ещё не подключён",
};
function zp({ rows: c }) {
  return n.jsx("div", {
    className: "table-scroll",
    children: n.jsxs("table", {
      className: "registry-table",
      children: [
        n.jsx("thead", {
          children: n.jsxs("tr", {
            children: [
              n.jsx("th", { children: "Рейс" }),
              n.jsx("th", { children: "В файле" }),
              n.jsx("th", { children: "По тарифу" }),
              n.jsx("th", { children: "Проверка" }),
            ],
          }),
        }),
        n.jsx("tbody", {
          children: c.map((d) =>
            n.jsxs(
              "tr",
              {
                children: [
                  n.jsxs("td", {
                    children: [
                      n.jsx("strong", { children: d.tripReference }),
                      n.jsxs("small", { children: ["Строка ", d.rowNumber] }),
                    ],
                  }),
                  n.jsx("td", {
                    children:
                      d.claimedKopecks === null ? "—" : je(d.claimedKopecks),
                  }),
                  n.jsx("td", {
                    children:
                      d.expectedKopecks === null ? "—" : je(d.expectedKopecks),
                  }),
                  n.jsx("td", {
                    children: d.reasons.length
                      ? d.reasons.map((f) =>
                          n.jsx(
                            "span",
                            { className: "mismatch", children: gg[f] },
                            f,
                          ),
                        )
                      : n.jsx("span", {
                          className: "workflow-badge accepted",
                          children: "Сходится",
                        }),
                  }),
                ],
              },
              d.rowNumber,
            ),
          ),
        }),
      ],
    }),
  });
}
function jg({ token: c, actor: d, onExpired: f }) {
  const [r, g] = h.useState("registries"),
    [p, b] = h.useState(null),
    [D, J] = h.useState(0),
    [j, U] = h.useState([]),
    [y, L] = h.useState([]),
    [M, ee] = h.useState([]),
    [te, R] = h.useState(""),
    [re, le] = h.useState(null),
    [K, I] = h.useState(null),
    [k, Z] = h.useState(!1),
    [G, E] = h.useState(!1),
    [se, P] = h.useState(!1),
    [H, fe] = h.useState(null),
    Y = Jl(f),
    xe = h.useRef(crypto.randomUUID()),
    registryInput = h.useRef(""),
    ae = h.useRef(crypto.randomUUID()),
    V = h.useRef(crypto.randomUUID()),
    W = h.useRef(crypto.randomUUID()),
    he = d.grants.filter((S) => S.financeVisible),
    ve =
      p?.scopes.filter((S) =>
        he.some(
          (_) =>
            _.projectId === S.projectId &&
            _.responsibilityScopeId === S.responsibilityScopeId,
        ),
      ) ?? [],
    oe = ve[D] ?? he[D],
    ce = oe
      ? {
          projectId: oe.projectId,
          responsibilityScopeId: oe.responsibilityScopeId,
        }
      : null;
  async function B() {
    const S = await Promise.all([
      ze("/finance/tariffs", {}, c),
      ze("/finance/registries", {}, c),
      ze("/finance/integration-jobs", {}, c),
    ]);
    (U(S[0].items), L(S[1].items), ee(S[2].items));
  }
  h.useEffect(() => {
    Y.run(async () => {
      (await B(), b(await ze("/workflow/catalog", {}, c)));
    });
  }, [c]);
  function de(S) {
    registryInput.current = S;
    (R(S), le(null), (xe.current = crypto.randomUUID()));
  }
  async function previewRegistry() {
    const csv = te;
    const choices = ve.length ? ve : he;
    const previews = await Promise.all(choices.map(async (scope, index) => ({
      index,
      scope: { projectId: scope.projectId, responsibilityScopeId: scope.responsibilityScopeId },
      preview: await Ye(c, "/finance/registries/preview", { projectId: scope.projectId, responsibilityScopeId: scope.responsibilityScopeId, csv }),
    })));
    if (registryInput.current !== csv) return;
    const matches = previews.filter(({ preview }) => preview.rows.some(row => row.tripId));
    if (matches.length > 1) {
      throw new Ne(400, "В файле рейсы из нескольких договоров. Разделите реестр по договорам и повторите загрузку.");
    }
    const selected = matches[0] || previews[0];
    if (selected) {
      J(selected.index);
      le({ ...selected.preview, scope: selected.scope, csv });
    }
  }
  const v = new TextEncoder().encode(te).byteLength > 25e4;
  return n.jsxs("div", {
    className: "finance-workspace",
    children: [
      n.jsxs("div", {
        className: "page-heading",
        children: [
          n.jsxs("div", {
            children: [
              n.jsx("span", {
                className: "eyebrow",
                children: "Контроль расчётов",
              }),
              n.jsx("h1", { children: "Финансы и 1С" }),
              n.jsx("p", {
                children:
                  "Тарифы, зарплаты водителей, сверка реестров и очередь обмена",
              }),
            ],
          }),
          n.jsx("button", {
            className: "button secondary",
            disabled: Y.busy,
            onClick: () => {
              Y.run(B);
            },
            children: "Обновить",
          }),
        ],
      }),
      r !== "payroll" &&
        n.jsx("div", {
          className: "help-callout",
          children:
            "Конструктор рассчитывает клиента, исполнителя и остаток по рейсу. Реестры пока используют прежнюю демоформулу. Подключение новых расчётов к реестрам и вашей 1С — отдельный этап.",
        }),
      n.jsxs("div", {
        className: "segmented finance-tabs",
        children: [
          n.jsx("button", {
            "aria-pressed": r === "payroll",
            onClick: () => g("payroll"),
            children: "Зарплаты и депозиты",
          }),
          n.jsxs("button", {
            "aria-pressed": r === "registries",
            onClick: () => g("registries"),
            children: ["Реестры ", n.jsx("span", { children: y.length })],
          }),
          n.jsx("button", {
            "aria-pressed": r === "tariffs",
            onClick: () => g("tariffs"),
            children: "Тарифы",
          }),
          n.jsxs("button", {
            "aria-pressed": r === "exchange",
            onClick: () => g("exchange"),
            children: [
              "Обмен с 1С",
              " ",
              n.jsx("span", {
                children: M.filter((S) => S.status === "pending").length,
              }),
            ],
          }),
        ],
      }),
      n.jsx(Ot, { ...Y }),
      r === "payroll" && n.jsx(hg, { token: c, actor: d, onExpired: f }),
      r === "registries" &&
        n.jsxs(n.Fragment, {
          children: [
            n.jsxs("div", {
              className: "section-heading",
              children: [
                n.jsxs("div", {
                  children: [
                    n.jsx("h2", { children: "Реестры перевозок" }),
                    n.jsx("p", {
                      className: "muted",
                      children:
                        "Подтверждение доступно после проверки документов, факта и сумм.",
                    }),
                  ],
                }),
                n.jsx("button", {
                  className: "button primary",
                  onClick: () => {
                    (Z(!k), I(null));
                  },
                  children: "Загрузить реестр",
                }),
              ],
            }),
            k &&
              n.jsxs("section", {
                className: "surface data-form",
                children: [
                  n.jsx("h3", { children: "Новый реестр из CSV" }),
                  n.jsxs("div", {
                    className: "action-row",
                    children: [
                      n.jsx("button", {
                        className: "button secondary",
                        onClick: () =>
                          Ho(
                            "registry-template.csv",
                            `\uFEFFtrip_reference,amount_rub
DEMO-001,5300.00
`,
                            "text/csv;charset=utf-8",
                            c,
                          ),
                        children: "Скачать шаблон",
                      }),
                      n.jsx("span", {
                        className: "muted",
                        children: "Колонки: trip_reference, amount_rub",
                      }),
                    ],
                  }),
                  n.jsx(ue, {
                    label: "CSV-файл",
                    children: n.jsx("input", {
                      type: "file",
                      accept: ".csv,text/csv",
                      disabled: Y.busy,
                      onChange: (S) => {
                        const _ = S.target.files?.[0];
                        if (_) {
                          if (_.size > 25e4) {
                            Y.setError("Максимум 250 КБ.");
                            return;
                          }
                          Y.run(async () => de(await _.text()));
                        }
                      },
                    }),
                  }),
                  n.jsx(ue, {
                    label: "Данные реестра",
                    hint: v
                      ? "Превышен лимит 250 000 байт. Разделите файл на несколько частей."
                      : void 0,
                    children: n.jsx("textarea", {
                      rows: 5,
                      className: "csv-input",
                      value: te,
                      onChange: (S) => de(S.target.value),
                      placeholder: `trip_reference,amount_rub
DEMO-001,5300.00`,
                    }),
                  }),
                  n.jsx("button", {
                    className: "button secondary",
                    disabled: Y.busy || !te.trim() || !ce || v,
                    onClick: () => {
                      Y.run(previewRegistry);
                    },
                    children: "Проверить и рассчитать",
                  }),
                  re &&
                    n.jsxs(n.Fragment, {
                      children: [
                        n.jsx(zp, { rows: re.rows }),
                        n.jsx("p", {
                          className: "muted",
                          children: re.readyToConfirm
                            ? "Все строки прошли проверку. После сохранения можно подтвердить реестр."
                            : "Расхождения сохранятся в черновике. Устраните причины и выполните сверку повторно.",
                        }),
                        n.jsx("button", {
                          className: "button primary",
                          disabled: Y.busy || !re.canCommit,
                          onClick: () => {
                            Y.run(async () => {
                              const S = await Ye(c, "/finance/registries", {
                                ...re.scope,
                                csv: re.csv,
                                idempotencyKey: xe.current,
                              });
                              (I(S), Z(!1), de(""), await B());
                            }, "Черновик реестра сохранён.");
                          },
                          children: "Сохранить черновик",
                        }),
                      ],
                    }),
                ],
              }),
            n.jsxs("div", {
              className: "registry-layout",
              children: [
                n.jsxs("section", {
                  className: "surface registry-list",
                  children: [
                    n.jsx("h3", { children: "Все реестры" }),
                    y.length
                      ? y.map((S) =>
                          n.jsxs(
                            "button",
                            {
                              className: `registry-card ${K?.id === S.id ? "selected" : ""}`,
                              disabled: Y.busy,
                              onClick: () => {
                                Y.run(async () => {
                                  (I(
                                    await ze(
                                      `/finance/registries/${S.id}`,
                                      {},
                                      c,
                                    ),
                                  ),
                                    P(!1),
                                    Z(!1),
                                    (V.current = crypto.randomUUID()));
                                });
                              },
                              children: [
                                n.jsxs("span", {
                                  className: "row-between",
                                  children: [
                                    n.jsxs("strong", {
                                      children: ["Реестр · ", S.id.slice(0, 8)],
                                    }),
                                    n.jsx("span", {
                                      className: `workflow-badge ${S.status === "confirmed" ? "accepted" : "pending"}`,
                                      children:
                                        S.status === "confirmed"
                                          ? "Подтверждён"
                                          : "Черновик",
                                    }),
                                  ],
                                }),
                                n.jsx("span", {
                                  className: "registry-amount",
                                  children: je(S.totalClaimedKopecks),
                                }),
                                n.jsxs("span", {
                                  className: "muted",
                                  children: [
                                    S.rowCount,
                                    " строк · ",
                                    et(S.createdAt),
                                  ],
                                }),
                              ],
                            },
                            S.id,
                          ),
                        )
                      : n.jsx("p", {
                          className: "empty-message",
                          children:
                            "Реестров пока нет. Загрузите CSV с номерами рейсов и суммами.",
                        }),
                  ],
                }),
                K &&
                  n.jsxs("section", {
                    className: "surface registry-detail",
                    children: [
                      n.jsxs("div", {
                        className: "section-heading",
                        children: [
                          n.jsxs("div", {
                            children: [
                              n.jsxs("span", {
                                className: "eyebrow",
                                children: ["Реестр ", K.id.slice(0, 8)],
                              }),
                              n.jsx("h2", {
                                children: je(K.totalClaimedKopecks),
                              }),
                            ],
                          }),
                          n.jsx("button", {
                            className: "text-button",
                            onClick: () => I(null),
                            children: "Закрыть",
                          }),
                        ],
                      }),
                      n.jsx(zp, { rows: K.rows }),
                      K.status === "confirmed"
                        ? n.jsx("div", {
                            className: "success",
                            children:
                              "Реестр подтверждён. Задание обмена создано в разделе «Обмен с 1С».",
                          })
                        : n.jsxs("div", {
                            className: "data-form",
                            children: [
                              n.jsx("button", {
                                className: "button secondary",
                                disabled: Y.busy,
                                onClick: () => {
                                  Y.run(async () => {
                                    (I(
                                      await Ye(
                                        c,
                                        `/finance/registries/${K.id}/reconcile`,
                                        {},
                                      ),
                                    ),
                                      P(!1));
                                  }, "Сверка обновлена по текущим документам, факту и тарифам.");
                                },
                                children: "Повторить сверку",
                              }),
                              K.readyToConfirm
                                ? n.jsxs(n.Fragment, {
                                    children: [
                                      n.jsxs("label", {
                                        className: "checkbox-label",
                                        children: [
                                          n.jsx("input", {
                                            type: "checkbox",
                                            checked: se,
                                            onChange: (S) =>
                                              P(S.target.checked),
                                          }),
                                          "Я проверил строки и подтверждаю сумму",
                                          " ",
                                          je(K.totalClaimedKopecks),
                                        ],
                                      }),
                                      n.jsx("button", {
                                        className: "button primary",
                                        disabled: Y.busy || !se,
                                        onClick: () => {
                                          Y.run(async () => {
                                            const S = await Ye(
                                              c,
                                              `/finance/registries/${K.id}/confirm`,
                                              { idempotencyKey: V.current },
                                            );
                                            (I(S), P(!1), await B());
                                          }, "Реестр подтверждён. Создано задание обмена с 1С.");
                                        },
                                        children: "Подтвердить реестр",
                                      }),
                                    ],
                                  })
                                : n.jsx("p", {
                                    className: "help-callout",
                                    children:
                                      "Устраните все расхождения и повторите сверку. Пока есть ошибки, подтвердить реестр нельзя.",
                                  }),
                            ],
                          }),
                    ],
                  }),
              ],
            }),
          ],
        }),
      r === "tariffs" &&
        n.jsxs(n.Fragment, {
          children: [
            n.jsx(tg, { token: c, actor: d, onExpired: f }),
            n.jsxs("details", {
              className: "pricing-legacy",
              children: [
                n.jsx("summary", {
                  children: "Прежние демотарифы для CSV-реестров",
                }),
                n.jsx("p", {
                  className: "help-callout",
                  children:
                    "Эти ставки используются только прежней формулой реестров: база + все точки + ожидание. Они не определяют суммы вкладки «Расчёт».",
                }),
                n.jsxs("div", {
                  className: "section-heading",
                  children: [
                    n.jsxs("div", {
                      children: [
                        n.jsx("h2", { children: "Версии прежних демотарифов" }),
                        n.jsx("p", {
                          className: "muted",
                          children:
                            "Суммы в рублях. Изменения сохраняются новой версией.",
                        }),
                      ],
                    }),
                    n.jsx("button", {
                      className: "button primary",
                      onClick: () => E(!G),
                      children: "Добавить версию",
                    }),
                  ],
                }),
                G &&
                  n.jsxs("form", {
                    className: "surface data-form",
                    onChange: () => {
                      ae.current = crypto.randomUUID();
                    },
                    onSubmit: (S) => {
                      S.preventDefault();
                      const _ = S.currentTarget,
                        ie = new FormData(_);
                      Y.run(async () => {
                        (await Ye(c, "/finance/tariffs", {
                          ...ce,
                          effectiveFrom: ie.get("from"),
                          effectiveTo: ie.get("to") || null,
                          baseKopecks: gl(String(ie.get("base"))),
                          perStopKopecks: gl(String(ie.get("stop"))),
                          perWaitingMinuteKopecks: gl(
                            String(ie.get("waiting")),
                          ),
                          idempotencyKey: ae.current,
                        }),
                          (ae.current = crypto.randomUUID()),
                          _.reset(),
                          E(!1),
                          await B());
                      }, "Новая версия тарифа сохранена.");
                    },
                    children: [
                      n.jsx("h3", { children: "Новая версия тарифа" }),
                      n.jsxs("div", {
                        className: "form-grid",
                        children: [
                          n.jsx(ue, {
                            label: "Действует с",
                            children: n.jsx("input", {
                              name: "from",
                              type: "date",
                              defaultValue: Zl(),
                              required: !0,
                            }),
                          }),
                          n.jsx(ue, {
                            label: "Действует по",
                            hint: "Оставьте пустым для бессрочного тарифа",
                            children: n.jsx("input", {
                              name: "to",
                              type: "date",
                            }),
                          }),
                        ],
                      }),
                      n.jsxs("div", {
                        className: "form-grid three",
                        children: [
                          n.jsx(ue, {
                            label: "За рейс, ₽",
                            children: n.jsx("input", {
                              name: "base",
                              type: "number",
                              min: "0",
                              step: "0.01",
                              required: !0,
                              defaultValue: "5000",
                            }),
                          }),
                          n.jsx(ue, {
                            label: "За точку, ₽",
                            children: n.jsx("input", {
                              name: "stop",
                              type: "number",
                              min: "0",
                              step: "0.01",
                              required: !0,
                              defaultValue: "100",
                            }),
                          }),
                          n.jsx(ue, {
                            label: "За минуту ожидания, ₽",
                            children: n.jsx("input", {
                              name: "waiting",
                              type: "number",
                              min: "0",
                              step: "0.01",
                              required: !0,
                              defaultValue: "10",
                            }),
                          }),
                        ],
                      }),
                      n.jsx("button", {
                        className: "button primary",
                        disabled: Y.busy || !ce,
                        children: "Сохранить версию тарифа",
                      }),
                    ],
                  }),
                n.jsxs("section", {
                  className: "surface",
                  children: [
                    n.jsx("div", {
                      className: "table-scroll",
                      children: n.jsxs("table", {
                        children: [
                          n.jsx("thead", {
                            children: n.jsxs("tr", {
                              children: [
                                n.jsx("th", { children: "Версия" }),
                                n.jsx("th", { children: "Период" }),
                                n.jsx("th", { children: "За рейс" }),
                                n.jsx("th", { children: "За точку" }),
                                n.jsx("th", { children: "Ожидание / мин" }),
                              ],
                            }),
                          }),
                          n.jsx("tbody", {
                            children: j.map((S) =>
                              n.jsxs(
                                "tr",
                                {
                                  children: [
                                    n.jsxs("td", {
                                      children: [
                                        n.jsxs("strong", {
                                          children: ["Версия ", S.version],
                                        }),
                                        n.jsx("button", {
                                          className: "text-button",
                                          disabled: Y.busy,
                                          onClick: () => {
                                            const index = ve.findIndex(scope => scope.projectId === S.projectId && scope.responsibilityScopeId === S.responsibilityScopeId);
                                            if (index < 0) return;
                                            J(index); E(true); ae.current = crypto.randomUUID();
                                          },
                                          children: "Новая версия",
                                        }),
                                      ],
                                    }),
                                    n.jsxs("td", {
                                      children: [
                                        S.effectiveFrom.slice(0, 10),
                                        n.jsx("small", {
                                          children: S.effectiveTo
                                            ? `по ${S.effectiveTo.slice(0, 10)}`
                                            : "Без окончания",
                                        }),
                                      ],
                                    }),
                                    n.jsx("td", {
                                      children: je(S.baseKopecks),
                                    }),
                                    n.jsx("td", {
                                      children: je(S.perStopKopecks),
                                    }),
                                    n.jsx("td", {
                                      children: je(S.perWaitingMinuteKopecks),
                                    }),
                                  ],
                                },
                                S.id,
                              ),
                            ),
                          }),
                        ],
                      }),
                    }),
                    !j.length &&
                      n.jsx("p", {
                        className: "empty-message",
                        children:
                          "Нет доступных тарифов. Создайте первую версию.",
                      }),
                  ],
                }),
              ],
            }),
          ],
        }),
      r === "exchange" &&
        n.jsxs(n.Fragment, {
          children: [
            n.jsx("div", {
              className: "section-heading",
              children: n.jsxs("div", {
                children: [
                  n.jsx("h2", { children: "Обмен с 1С" }),
                  n.jsx("p", {
                    className: "muted",
                    children:
                      "Подтверждённые реестры готовы к передаче разработчику 1С.",
                  }),
                ],
              }),
            }),
            n.jsxs("section", {
              className: "surface",
              children: [
                n.jsx("div", {
                  className: "help-callout",
                  children:
                    "JSON содержит суммы в копейках, версии тарифа и факта, идентификатор обмена. Ручная отметка означает только фиксацию квитанции оператором; сама по себе она не отправляет данные в 1С.",
                }),
                M.length
                  ? n.jsx("div", {
                      className: "exchange-jobs",
                      children: M.map((S) =>
                        n.jsxs(
                          "article",
                          {
                            className: "exchange-card",
                            children: [
                              n.jsxs("div", {
                                className: "row-between",
                                children: [
                                  n.jsxs("strong", {
                                    children: [
                                      "Реестр ",
                                      S.registryId.slice(0, 8),
                                    ],
                                  }),
                                  n.jsx("span", {
                                    className: `workflow-badge ${S.status === "acknowledged" ? "accepted" : S.status === "failed" ? "returned" : "pending"}`,
                                    children: {
                                      pending: "Ожидает передачи",
                                      processing: "Передаётся",
                                      acknowledged: "Квитанция получена",
                                      failed: "Ошибка передачи",
                                    }[S.status],
                                  }),
                                ],
                              }),
                              n.jsxs("p", {
                                className: "muted",
                                children: [
                                  et(S.createdAt),
                                  " ·",
                                  " ",
                                  S.deliveryMode === "manual"
                                    ? "Ручной обмен"
                                    : "HTTP-адаптер",
                                  " ",
                                  "· попыток: ",
                                  S.attempts,
                                ],
                              }),
                              S.sourceDocumentId &&
                                n.jsxs("p", {
                                  children: [
                                    "Документ в 1С: ",
                                    S.sourceDocumentId,
                                  ],
                                }),
                              S.lastErrorCode &&
                                n.jsxs("p", {
                                  className: "review-reason",
                                  children: ["Код ошибки: ", S.lastErrorCode],
                                }),
                              n.jsxs("div", {
                                className: "action-row",
                                children: [
                                  n.jsx("button", {
                                    className: "button secondary",
                                    disabled: Y.busy,
                                    onClick: () => {
                                      Y.run(async () => {
                                        const _ = await ze(
                                          `/finance/integration-jobs/${S.id}/export`,
                                          {},
                                          c,
                                        );
                                        Ho(
                                          `1c-registry-${S.registryId}.json`,
                                          JSON.stringify(_, null, 2),
                                          "application/json;charset=utf-8",
                                          c,
                                        );
                                      }, "Файл обмена подготовлен к скачиванию.");
                                    },
                                    children: "Скачать JSON для 1С",
                                  }),
                                  S.status !== "acknowledged" &&
                                    S.deliveryMode === "manual" &&
                                    n.jsx("button", {
                                      className: "text-button",
                                      onClick: () => {
                                        (fe(H === S.id ? null : S.id),
                                          (W.current = crypto.randomUUID()));
                                      },
                                      children: "Записать квитанцию вручную",
                                    }),
                                ],
                              }),
                              H === S.id &&
                                n.jsxs("form", {
                                  className: "data-form receipt-form",
                                  onSubmit: (_) => {
                                    _.preventDefault();
                                    const ie = new FormData(_.currentTarget);
                                    Y.run(async () => {
                                      (await Ye(
                                        c,
                                        `/finance/integration-jobs/${S.id}/acknowledge`,
                                        {
                                          sourceSystem: "1C",
                                          sourceDocumentId: String(
                                            ie.get("sourceDocumentId"),
                                          ).trim(),
                                          idempotencyKey: W.current,
                                        },
                                      ),
                                        fe(null),
                                        await B());
                                    }, "Ручная квитанция зафиксирована в журнале аудита.");
                                  },
                                  children: [
                                    n.jsx(ue, {
                                      label:
                                        "Идентификатор созданного документа в 1С",
                                      children: n.jsx("input", {
                                        name: "sourceDocumentId",
                                        required: !0,
                                        maxLength: 128,
                                        placeholder:
                                          "Идентификатор из подтверждения 1С",
                                        onChange: () => {
                                          W.current = crypto.randomUUID();
                                        },
                                      }),
                                    }),
                                    n.jsxs("label", {
                                      className: "checkbox-label",
                                      children: [
                                        n.jsx("input", {
                                          type: "checkbox",
                                          required: !0,
                                        }),
                                        "Я получил подтверждение о создании документа в 1С",
                                      ],
                                    }),
                                    n.jsx("button", {
                                      className: "button primary",
                                      disabled: Y.busy,
                                      children: "Сохранить ручную квитанцию",
                                    }),
                                  ],
                                }),
                            ],
                          },
                          S.id,
                        ),
                      ),
                    })
                  : n.jsx("p", {
                      className: "empty-message",
                      children:
                        "Очередь пуста. Подтвердите реестр, чтобы создать задание обмена.",
                    }),
              ],
            }),
          ],
        }),
    ],
  });
}
const bg = {
    shift: "смен",
    hour: "ч",
    trip: "рейсов",
    stop: "точек",
    kilometer: "км",
    day: "дн.",
    item: "ед.",
    payment: "платёж",
  },
  Ng = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
function Yo(c) {
  return new Date(`${c}T12:00:00Z`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
function Sg(c) {
  return `${Yo(c.periodStart)} — ${Yo(c.periodEnd)}`;
}
function Up(c) {
  return c instanceof Ne && c.status === 404
    ? "Расчёт больше недоступен. Обновите список периодов."
    : c instanceof Ne
      ? c.message
      : "Не удалось загрузить расчёт. Повторите попытку.";
}
function Uo({ title: c, lines: d, total: f, kind: r, empty: g }) {
  return n.jsxs("section", {
    className: `surface payroll-lines payroll-${r}`,
    "aria-label": c,
    children: [
      n.jsxs("div", {
        className: "payroll-section-heading",
        children: [
          n.jsxs("h2", {
            children: [
              c,
              " ",
              n.jsx("span", { className: "payroll-count", children: d.length }),
            ],
          }),
          n.jsx("strong", { children: je(f) }),
        ],
      }),
      d.length
        ? n.jsx("div", {
            className: "payroll-line-list",
            children: d.map((p) =>
              n.jsxs(
                "details",
                {
                  className: "payroll-line",
                  children: [
                    n.jsxs("summary", {
                      children: [
                        n.jsxs("span", {
                          className: "payroll-line-label",
                          children: [
                            n.jsx("strong", { children: p.label }),
                            n.jsx("span", { children: Yo(p.date) }),
                          ],
                        }),
                        n.jsxs("span", {
                          className: "payroll-line-amount",
                          children: [
                            n.jsx("strong", { children: je(p.amountKopecks) }),
                            n.jsxs("span", {
                              children: [
                                "Как рассчитано ",
                                n.jsx("span", {
                                  "aria-hidden": "true",
                                  children: "⌄",
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                    n.jsxs("div", {
                      className: "payroll-line-details",
                      children: [
                        n.jsxs("p", {
                          className: "payroll-line-formula",
                          children: [
                            Ng.format(p.quantityHundredths / 100),
                            " ",
                            bg[p.unit],
                            " × ",
                            je(p.rateKopecks),
                            " = ",
                            n.jsx("strong", { children: je(p.amountKopecks) }),
                          ],
                        }),
                        n.jsx("p", { children: p.explanation }),
                        n.jsxs("p", {
                          className: "payroll-evidence",
                          children: [
                            n.jsx("span", { children: "Основание:" }),
                            " ",
                            p.sourceReference,
                          ],
                        }),
                      ],
                    }),
                  ],
                },
                p.id,
              ),
            ),
          })
        : n.jsx("p", { className: "muted payroll-empty-lines", children: g }),
    ],
  });
}
function Tg({ statement: c }) {
  if (c.settlement)
    return n.jsxs("div", {
      className: "payroll-statement",
      children: [
        n.jsxs("div", {
          className: "payroll-context",
          children: [
            n.jsxs("div", {
              children: [
                n.jsx("strong", { children: c.project.name }),
                n.jsxs("span", {
                  children: [
                    c.legalEntity.name,
                    " · ",
                    c.responsibilityScope.name,
                  ],
                }),
              ],
            }),
            n.jsx("span", {
              className: "payroll-status approved",
              children: "Расчёт утверждён",
            }),
          ],
        }),
        c.sourceKind === "demo_manual" &&
          n.jsx("p", {
            className: "payroll-demo-note",
            children:
              "Учебная ведомость. Все суммы и выплаты в этом примере вымышлены.",
          }),
        n.jsx($o, { result: c.settlement }),
        n.jsxs("details", {
          className: "surface payroll-help",
          children: [
            n.jsx("summary", {
              children: "Как проверить или уточнить удержание?",
            }),
            n.jsx("p", {
              children:
                "Откройте строку: там указаны дата, основание, формула и источник покрытия. Для проверки передайте бухгалтерии период, название строки и номер расчёта.",
            }),
            n.jsxs("p", {
              className: "payroll-reference",
              children: ["Расчёт: ", c.id, " · версия ", c.revision],
            }),
          ],
        }),
        n.jsxs("p", {
          className: "payroll-updated",
          children: [
            "Утверждён ",
            et(c.approvedAt ?? c.calculatedAt),
            ". Суммы показывают состояние на момент утверждения расчёта.",
          ],
        }),
      ],
    });
  const d = c.status === "preliminary",
    f = c.balanceKopecks < 0;
  return n.jsxs("div", {
    className: "payroll-statement",
    children: [
      n.jsxs("div", {
        className: "payroll-context",
        children: [
          n.jsxs("div", {
            children: [
              n.jsx("strong", { children: c.project.name }),
              n.jsxs("span", {
                children: [
                  c.legalEntity.name,
                  " · ",
                  c.responsibilityScope.name,
                ],
              }),
            ],
          }),
          n.jsx("span", {
            className: `payroll-status ${d ? "preliminary" : "approved"}`,
            children: d ? "Предварительный расчёт" : "Расчёт утверждён",
          }),
        ],
      }),
      c.sourceKind === "demo_manual" &&
        n.jsx("p", {
          className: "payroll-demo-note",
          children:
            "Учебная ведомость. Все суммы и выплаты в этом примере вымышлены.",
        }),
      n.jsxs("section", {
        className: "payroll-overview",
        "aria-label": "Итог расчёта",
        children: [
          n.jsxs("div", {
            className: "payroll-balance",
            children: [
              n.jsx("span", {
                children: f
                  ? "Отрицательный остаток"
                  : d
                    ? "Предварительный остаток"
                    : "Осталось выплатить",
              }),
              n.jsx("strong", { children: je(Math.abs(c.balanceKopecks)) }),
              n.jsx("p", {
                children: f
                  ? "Перенос, удержания и выплаты дают отрицательный остаток. Уточните расчёт у бухгалтерии."
                  : d
                    ? "Сумма может измениться после проверки. Дата выплаты в расчёте не назначена."
                    : c.balanceKopecks === 0
                      ? "Начисления и учтённые выплаты сходятся."
                      : "Остаток с учётом предыдущего периода и уже учтённых выплат.",
              }),
            ],
          }),
          n.jsxs("dl", {
            className: "payroll-totals",
            children: [
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "Начислено" }),
                  n.jsx("dd", { children: je(c.earnedKopecks) }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "Удержано" }),
                  n.jsx("dd", { children: je(c.deductedKopecks) }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "После удержаний" }),
                  n.jsx("dd", { children: je(c.netKopecks) }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "Уже выплачено, включая аванс" }),
                  n.jsx("dd", { children: je(c.paidKopecks) }),
                ],
              }),
            ],
          }),
        ],
      }),
      n.jsxs("section", {
        className: "surface payroll-reconciliation",
        "aria-label": "Как складывается остаток",
        children: [
          n.jsx("h2", { children: "Как складывается остаток" }),
          n.jsxs("dl", {
            children: [
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "Перенос с прошлого периода" }),
                  n.jsx("dd", { children: je(c.openingBalanceKopecks) }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "+ Начислено за период" }),
                  n.jsx("dd", { children: je(c.earnedKopecks) }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "− Удержания" }),
                  n.jsx("dd", { children: je(c.deductedKopecks) }),
                ],
              }),
              n.jsxs("div", {
                children: [
                  n.jsx("dt", { children: "− Выплаты, включая аванс" }),
                  n.jsx("dd", { children: je(c.paidKopecks) }),
                ],
              }),
              n.jsxs("div", {
                className: "payroll-equation-total",
                children: [
                  n.jsx("dt", { children: "= Остаток" }),
                  n.jsx("dd", { children: je(c.balanceKopecks) }),
                ],
              }),
            ],
          }),
          n.jsx("p", { children: c.openingBalanceExplanation }),
        ],
      }),
      n.jsx(Uo, {
        title: "Начисления",
        lines: c.earnings,
        total: c.earnedKopecks,
        kind: "earnings",
        empty: "За этот период начислений пока нет.",
      }),
      n.jsx(Uo, {
        title: "Удержания",
        lines: c.deductions,
        total: c.deductedKopecks,
        kind: "deductions",
        empty: "В этом расчёте удержаний нет.",
      }),
      n.jsx(Uo, {
        title: "Выплаты и авансы",
        lines: c.payments,
        total: c.paidKopecks,
        kind: "payments",
        empty:
          "Выплаты ещё не зафиксированы. График выплат сам по себе не означает, что деньги перечислены.",
      }),
      n.jsxs("section", {
        className: "payroll-help",
        "aria-label": "Вопросы по расчёту",
        children: [
          n.jsxs("details", {
            children: [
              n.jsx("summary", {
                children: "Почему аванс не находится в удержаниях?",
              }),
              n.jsx("p", {
                children:
                  "Аванс — это уже выданная часть зарплаты. Он входит в выплаты и уменьшает остаток один раз.",
              }),
            ],
          }),
          n.jsxs("details", {
            children: [
              n.jsx("summary", {
                children: "Как учитываются резерв и корректировки?",
              }),
              n.jsx("p", {
                children:
                  "Текущее состояние депозита показано отдельно над ведомостью. Этот расчёт выпущен по прежнему формату; его строки сохранены без пересчёта. В новых ведомостях видно пополнение депозита и покрытие удержаний из него.",
              }),
            ],
          }),
          n.jsxs("details", {
            children: [
              n.jsx("summary", {
                children: "Что делать, если сумма не совпадает?",
              }),
              n.jsx("p", {
                children:
                  "Откройте нужную строку и передайте бухгалтерии период, название строки и номер расчёта. Это поможет проверить основание начисления или выплаты.",
              }),
              n.jsxs("p", {
                className: "payroll-reference",
                children: ["Расчёт: ", c.id, " · версия ", c.revision],
              }),
            ],
          }),
        ],
      }),
      n.jsxs("p", {
        className: "payroll-updated",
        children: [
          "Составлен ",
          et(c.calculatedAt),
          c.approvedAt && ` · Утверждён ${et(c.approvedAt)}`,
        ],
      }),
    ],
  });
}
function Eg({ token: c, onExpired: d }) {
  const [f, r] = h.useState([]),
    [g, p] = h.useState(""),
    [b, D] = h.useState(null),
    [J, j] = h.useState(!0),
    [U, y] = h.useState(!1),
    [L, M] = h.useState(""),
    [ee, te] = h.useState(""),
    [R, re] = h.useState(0),
    [le, K] = h.useState(0),
    [I, k] = h.useState([]),
    [Z, G] = h.useState(""),
    [E, se] = h.useState(!0),
    P = h.useRef(d);
  return (
    (P.current = d),
    h.useEffect(() => {
      const H = new AbortController();
      return (
        k([]),
        G(""),
        se(!0),
        ze("/me/deposit-accounts", { signal: H.signal }, c)
          .then(({ items: fe }) => {
            H.signal.aborted || k(fe);
          })
          .catch((fe) => {
            H.signal.aborted ||
              (fe instanceof Ne && fe.status === 401
                ? P.current()
                : G(
                    fe instanceof Ne
                      ? fe.message
                      : "Не удалось загрузить депозит. Обновите страницу.",
                  ));
          })
          .finally(() => {
            H.signal.aborted || se(!1);
          }),
        () => H.abort()
      );
    }, [c, R]),
    h.useEffect(() => {
      const H = new AbortController();
      return (
        j(!0),
        M(""),
        r([]),
        p(""),
        D(null),
        ze("/me/payroll", { signal: H.signal }, c)
          .then((fe) => {
            H.signal.aborted || (r(fe.items), p(fe.items[0]?.id ?? ""));
          })
          .catch((fe) => {
            H.signal.aborted ||
              (fe instanceof Ne && fe.status === 401 ? P.current() : M(Up(fe)));
          })
          .finally(() => {
            H.signal.aborted || j(!1);
          }),
        () => H.abort()
      );
    }, [c, R]),
    h.useEffect(() => {
      const H = new AbortController();
      return (
        D(null),
        te(""),
        y(!!g),
        g
          ? (ze(`/me/payroll/${encodeURIComponent(g)}`, { signal: H.signal }, c)
              .then((fe) => {
                H.signal.aborted || D(fe);
              })
              .catch((fe) => {
                H.signal.aborted ||
                  (fe instanceof Ne && fe.status === 401
                    ? P.current()
                    : (fe instanceof Ne && fe.status === 403 && r([]),
                      te(Up(fe))));
              })
              .finally(() => {
                H.signal.aborted || y(!1);
              }),
            () => H.abort())
          : () => H.abort()
      );
    }, [c, g, le]),
    n.jsxs("div", {
      className: "payroll-workspace",
      children: [
        n.jsxs("div", {
          className: "page-heading",
          children: [
            n.jsxs("div", {
              children: [
                n.jsx("span", {
                  className: "eyebrow",
                  children: "Кабинет водителя",
                }),
                n.jsx("h1", { children: "Моя зарплата" }),
                n.jsx("p", {
                  children:
                    "Каждое начисление, удержание и выплата — с расшифровкой.",
                }),
              ],
            }),
            n.jsx("button", {
              className: "button secondary",
              disabled: J || U || E,
              onClick: () => re((H) => H + 1),
              children: "Обновить",
            }),
          ],
        }),
        E && n.jsx("p", { role: "status", children: "Загружаем депозит…" }),
        Z && n.jsx("div", { className: "error", role: "alert", children: Z }),
        I.map((H) => n.jsx(Qp, { account: H }, H.id)),
        J &&
          n.jsxs("div", {
            className: "loading-state",
            role: "status",
            children: [
              n.jsx("span", { className: "spinner" }),
              "Загружаем периоды…",
            ],
          }),
        L && n.jsx("div", { className: "error", role: "alert", children: L }),
        !J &&
          !L &&
          f.length === 0 &&
          !ee &&
          n.jsxs("section", {
            className: "surface payroll-empty",
            children: [
              n.jsx("span", {
                className: "eyebrow",
                children: "Расчётные листки",
              }),
              n.jsx("h2", { children: "Ведомость ещё не опубликована" }),
              n.jsx("p", {
                className: "muted",
                children:
                  "Когда бухгалтерия подготовит ваш расчёт, здесь появятся начисления, удержания и выплаты. Отсутствие ведомости не означает нулевую зарплату.",
              }),
            ],
          }),
        f.length > 0 &&
          n.jsxs("div", {
            className: "payroll-period",
            children: [
              n.jsx("label", {
                htmlFor: "payroll-period",
                children: "Расчётный листок",
              }),
              n.jsx("select", {
                id: "payroll-period",
                value: g,
                onChange: (H) => {
                  (D(null), p(H.target.value));
                },
                children: f.map((H, index) =>
                  n.jsxs(
                    "option",
                    {
                      value: H.id,
                      children: [
                        Sg(H),
                        " · ",
                        `Расчёт ${index + 1}`,
                      ],
                    },
                    H.id,
                  ),
                ),
              }),
              n.jsx("small", {
                children: "Последние 24 расчёта, доступные вам.",
              }),
            ],
          }),
        U &&
          n.jsxs("div", {
            className: "loading-state",
            role: "status",
            children: [
              n.jsx("span", { className: "spinner" }),
              "Загружаем расшифровку…",
            ],
          }),
        ee &&
          n.jsxs("div", {
            className: "payroll-error",
            children: [
              n.jsx("div", { className: "error", role: "alert", children: ee }),
              n.jsx("button", {
                className: "button secondary",
                onClick: () => K((H) => H + 1),
                children: "Повторить загрузку",
              }),
            ],
          }),
        !J && !U && !ee && b?.id === g && n.jsx(Tg, { statement: b }),
      ],
    })
  );
}
const Cg = "/assets/ecl-logo-KqNBp_34.png",
  Fo = "ecl.theme",
  Vo = window.matchMedia("(prefers-color-scheme: dark)"),
  $s = new Set();
function Bc(c) {
  return c === "light" || c === "dark" ? c : "system";
}
function wg() {
  try {
    return Bc(window.localStorage.getItem(Fo));
  } catch {
    return Bc(document.documentElement.dataset.themePreference);
  }
}
let Fs = wg();
function Ws() {
  const c = Fs === "system" ? (Vo.matches ? "dark" : "light") : Fs;
  ((document.documentElement.dataset.theme = c),
    (document.documentElement.dataset.themePreference = Fs),
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", c === "dark" ? "#101820" : "#e8edf1"));
}
function Xp(c) {
  ((Fs = c), Ws(), $s.forEach((d) => d()));
}
function Mp(c) {
  if (!(c.key !== Fo && c.key !== null)) {
    try {
      if (c.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    Xp(Bc(c.newValue));
  }
}
function _g() {
  return Fs;
}
function Ag(c) {
  const d = Bc(c);
  try {
    window.localStorage.setItem(Fo, d);
  } catch {}
  Xp(d);
}
function Rg(c) {
  return (
    $s.size === 0 &&
      (Vo.addEventListener("change", Ws),
      window.addEventListener("storage", Mp),
      Ws()),
    $s.add(c),
    () => {
      ($s.delete(c),
        $s.size === 0 &&
          (Vo.removeEventListener("change", Ws),
          window.removeEventListener("storage", Mp)));
    }
  );
}
Ws();
function Zp() {
  const c = h.useSyncExternalStore(Rg, _g);
  return n.jsxs("label", {
    className: "theme-switcher",
    children: [
      n.jsx("svg", {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        "aria-hidden": "true",
        children:
          c === "dark"
            ? n.jsx("path", { d: "M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" })
            : c === "light"
              ? n.jsxs(n.Fragment, {
                  children: [
                    n.jsx("circle", { cx: "12", cy: "12", r: "4" }),
                    n.jsx("path", {
                      d: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
                    }),
                  ],
                })
              : n.jsxs(n.Fragment, {
                  children: [
                    n.jsx("rect", {
                      x: "3",
                      y: "4",
                      width: "18",
                      height: "13",
                      rx: "2",
                    }),
                    n.jsx("path", { d: "M8 21h8m-4-4v4" }),
                  ],
                }),
      }),
      n.jsx("span", {
        className: "visually-hidden",
        children: "Тема оформления",
      }),
      n.jsxs("select", {
        value: c,
        onChange: (d) => Ag(d.target.value),
        children: [
          n.jsx("option", { value: "light", children: "Светлая" }),
          n.jsx("option", { value: "dark", children: "Тёмная" }),
          n.jsx("option", { value: "system", children: "Системная" }),
        ],
      }),
    ],
  });
}
const Dg = [
    {
      id: "front",
      label: "ТС спереди",
      section: "vehicle",
      kind: "photo",
      instruction:
        "Снимите целиком при достаточном освещении. Отметьте повреждения и приложите крупный план при необходимости.",
      required: !0,
      critical: !1,
    },
    {
      id: "rear",
      label: "ТС сзади",
      section: "vehicle",
      kind: "photo",
      instruction:
        "Снимите целиком при достаточном освещении. Отметьте повреждения и приложите крупный план при необходимости.",
      required: !0,
      critical: !1,
    },
    {
      id: "left",
      label: "ТС слева",
      section: "vehicle",
      kind: "photo",
      instruction:
        "Снимите целиком при достаточном освещении. Отметьте повреждения и приложите крупный план при необходимости.",
      required: !0,
      critical: !1,
    },
    {
      id: "right",
      label: "ТС справа",
      section: "vehicle",
      kind: "photo",
      instruction:
        "Снимите целиком при достаточном освещении. Отметьте повреждения и приложите крупный план при необходимости.",
      required: !0,
      critical: !1,
    },
    {
      id: "cargo",
      label: "Грузовой отсек",
      section: "vehicle",
      kind: "photo",
      instruction:
        "Снимите целиком при достаточном освещении. Отметьте повреждения и приложите крупный план при необходимости.",
      required: !0,
      critical: !1,
    },
    {
      id: "oil",
      label: "Моторное масло",
      section: "fluids",
      kind: "photo",
      instruction:
        "Проверьте по инструкции ТС и сфотографируйте доступный индикатор уровня. Не открывайте горячие или находящиеся под давлением ёмкости.",
      required: !0,
      critical: !0,
    },
    {
      id: "coolant",
      label: "Охлаждающая жидкость",
      section: "fluids",
      kind: "photo",
      instruction:
        "Проверьте по инструкции ТС и сфотографируйте доступный индикатор уровня. Не открывайте горячие или находящиеся под давлением ёмкости.",
      required: !0,
      critical: !0,
    },
    {
      id: "brake_fluid",
      label: "Тормозная жидкость",
      section: "fluids",
      kind: "photo",
      instruction:
        "Проверьте по инструкции ТС и сфотографируйте доступный индикатор уровня. Не открывайте горячие или находящиеся под давлением ёмкости.",
      required: !0,
      critical: !0,
    },
    {
      id: "registration",
      label: "Свидетельство о регистрации ТС",
      section: "documents",
      kind: "document",
      instruction:
        "Проверьте наличие и читаемость. Приложите фото; при отсутствии выберите «Отсутствует» и укажите пояснение.",
      required: !0,
      critical: !0,
    },
    {
      id: "insurance",
      label: "Полис ОСАГО / доступ к электронному полису",
      section: "documents",
      kind: "document",
      instruction:
        "Проверьте наличие и читаемость. Приложите фото; при отсутствии выберите «Отсутствует» и укажите пояснение.",
      required: !0,
      critical: !0,
    },
    {
      id: "first_aid",
      label: "Аптечка",
      section: "equipment",
      kind: "check",
      instruction: "Отметьте наличие и состояние оборудования.",
      required: !0,
      critical: !0,
    },
    {
      id: "extinguisher",
      label: "Огнетушитель",
      section: "equipment",
      kind: "check",
      instruction: "Отметьте наличие и состояние оборудования.",
      required: !0,
      critical: !0,
    },
    {
      id: "warning_triangle",
      label: "Знак аварийной остановки",
      section: "equipment",
      kind: "check",
      instruction: "Отметьте наличие и состояние оборудования.",
      required: !0,
      critical: !0,
    },
    {
      id: "restraints",
      label: "Крепления груза",
      section: "equipment",
      kind: "check",
      instruction: "Отметьте наличие и состояние оборудования.",
      required: !0,
      critical: !0,
    },
    {
      id: "extra_photos",
      section: "other",
      kind: "photo",
      label: "Дополнительные фото механику",
      instruction: "Неисправности и другие детали, требующие внимания.",
      required: !1,
      critical: !1,
    },
  ],
  Og = Dg,
  Jp = [
    {
      code: "planning",
      label: "Отдел планирования",
      description: "Заявки, график, маршруты и изменения рейсов",
    },
    {
      code: "transport",
      label: "Транспортный отдел · механики",
      description: "Неисправности, ремонт, обслуживание и осмотр ТС",
    },
    {
      code: "accounting",
      label: "Бухгалтерия",
      description: "Начисления, выплаты, удержания и сверки",
    },
    {
      code: "hr",
      label: "Отдел кадров",
      description: "Оформление, отпуск, справки и кадровые вопросы",
    },
    {
      code: "documents",
      label: "Документооборот",
      description: "Накладные, путевые листы и закрывающие документы",
    },
    {
      code: "administration",
      label: "Администрация",
      description: "Предложения и проблемы, которые отделы не решают",
    },
  ];
function kc(c) {
  return JSON.stringify({
    actorId: c.actorId,
    tripId: c.tripId,
    template: c.template,
    expectedRevision: c.expectedRevision,
    occurredAt: c.occurredAt,
    answers: c.answers,
    comment: c.comment,
    submissionKey: c.submissionKey,
    photos: c.photos.map(({ uploaded: d, ...f }) => f),
  });
}
function Wo() {
  return new Promise((c, d) => {
    const f = indexedDB.open("transport-inspection-drafts", 1);
    ((f.onupgradeneeded = () => {
      f.result
        .createObjectStore("drafts", { keyPath: "id" })
        .createIndex("actorId", "actorId");
    }),
      (f.onerror = () =>
        d(new Error("Не удалось открыть локальное хранилище КО."))),
      (f.onblocked = () =>
        d(
          new Error(
            "Хранилище КО занято другой вкладкой. Закройте её и повторите.",
          ),
        )),
      (f.onsuccess = () => c(f.result)));
  });
}
async function Ip(c) {
  const d = await Wo();
  try {
    return await new Promise((f, r) => {
      const g = d
        .transaction("drafts", "readonly")
        .objectStore("drafts")
        .index("actorId")
        .getAll(IDBKeyRange.only(c));
      ((g.onsuccess = () => f(g.result.filter((p) => p.actorId === c))),
        (g.onerror = () =>
          r(new Error("Не удалось прочитать сохранённые КО."))));
    });
  } finally {
    d.close();
  }
}
async function Ps(c) {
  if (c.id !== `${c.actorId}:${c.tripId}`)
    throw new Error("Неверный владелец черновика КО.");
  const d = await Wo(),
    f = { ...c, version: c.version + 1, updatedAt: new Date().toISOString() };
  try {
    return (
      await new Promise((r, g) => {
        const p = d.transaction("drafts", "readwrite"),
          b = p.objectStore("drafts");
        let D =
          "Черновик не сохранён на устройстве. Проверьте свободное место и разрешение браузера на хранение данных.";
        const J = b.get(c.id);
        ((J.onsuccess = () => {
          const j = J.result;
          if (
            (j && j.actorId !== c.actorId) ||
            (j?.version ?? 0) !== c.version
          ) {
            ((D =
              "Черновик изменён в другой вкладке. Откройте КО заново, чтобы загрузить сохранённую версию."),
              p.abort());
            return;
          }
          if (
            j?.submissionKey &&
            (kc(j) !== kc(c) ||
              j.photos.some(
                (U) =>
                  U.uploaded &&
                  JSON.stringify(U.uploaded) !==
                    JSON.stringify(
                      c.photos.find((y) => y.localId === U.localId)?.uploaded,
                    ),
              ) ||
              (j.acknowledgedId && j.acknowledgedId !== c.acknowledgedId))
          ) {
            ((D =
              "Отправляемый КО зафиксирован. Повторная попытка должна содержать те же ответы и фото."),
              p.abort());
            return;
          }
          b.put(f);
        }),
          (p.oncomplete = () => r()),
          (p.onerror = p.onabort = () => g(new Error(D))));
      }),
      f
    );
  } finally {
    d.close();
  }
}
async function Go(c, d, f) {
  const r = await Wo();
  try {
    await new Promise((g, p) => {
      const b = r.transaction("drafts", "readwrite"),
        D = b.objectStore("drafts"),
        J = D.get(`${c}:${d}`);
      ((J.onsuccess = () => {
        const j = J.result;
        if (j) {
          if (j.actorId !== c || j.version !== f) {
            b.abort();
            return;
          }
          D.delete(j.id);
        }
      }),
        (b.oncomplete = () => g()),
        (b.onerror = b.onabort =
          () =>
            p(
              new Error(
                "Черновик изменился или хранилище недоступно. Откройте КО заново.",
              ),
            )));
    });
  } finally {
    r.close();
  }
}
// Reopen only a definitively rejected attempt after checking the server revision.
// Network failures keep the frozen payload and its original idempotency key.
async function reopenInspectionDraft(draft, photos, removedPhotoCount) {
  const database = await Wo();
  const next = { ...draft, photos, removedPhotoCount, submissionKey: null, acknowledgedId: null, version: draft.version + 1, updatedAt: new Date().toISOString() };
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("drafts", "readwrite");
      const entries = transaction.objectStore("drafts");
      const request = entries.get(draft.id);
      request.onsuccess = () => {
        const saved = request.result;
        if (!saved || saved.actorId !== draft.actorId || saved.version !== draft.version || !saved.submissionKey || saved.acknowledgedId || kc(saved) !== kc(draft)) {
          transaction.abort(); return;
        }
        entries.put(next);
      };
      transaction.oncomplete = resolve;
      transaction.onerror = transaction.onabort = () => reject(new Error("Черновик изменился. Откройте осмотр заново: сохранённые ответы остаются на устройстве."));
    });
    return next;
  } finally { database.close(); }
}
function zg(c) {
  if (!c.submissionKey) throw new Error("КО ещё не подготовлен к отправке.");
  return {
    idempotencyKey: c.submissionKey,
    templateId: c.template.id,
    expectedRevision: c.expectedRevision,
    occurredAt: c.occurredAt,
    comment: c.comment,
    answers: c.template.items.flatMap((d) => {
      const f = c.answers[d.id];
      return f?.result
        ? [
            {
              itemId: d.id,
              result: f.result,
              comment: f.comment,
              photoIds: c.photos
                .filter((r) => r.itemId === d.id)
                .map((r) => {
                  if (!r.uploaded)
                    throw new Error("Не все фото доставлены на сервер.");
                  return r.uploaded.id;
                }),
            },
          ]
        : [];
    }),
  };
}
async function Ug(c, d, f = () => {}) {
  if (!c.submissionKey) throw new Error("Сначала сохраните КО для отправки.");
  const r = (await Ip(c.actorId)).find((b) => b.id === c.id);
  if (!r || r.version !== c.version || kc(r) !== kc(c))
    throw new Error(
      "Сохранённый КО изменился. Откройте его заново перед отправкой.",
    );
  let g = r;
  if (g.acknowledgedId) return (await Go(g.actorId, g.tripId, g.version), null);
  for (const b of g.photos) {
    if (b.uploaded) continue;
    const D = await d.upload(g.tripId, {
      idempotencyKey: b.idempotencyKey,
      templateId: g.template.id,
      itemId: b.itemId,
      mimeType: b.mimeType,
      contentBase64: b.contentBase64,
      expectedRevision: g.expectedRevision,
    });
    ((g = await Ps({
      ...g,
      photos: g.photos.map((J) =>
        J.localId === b.localId ? { ...J, uploaded: D } : J,
      ),
    })),
      f(g));
  }
  const p = await d.submit(g.tripId, zg(g));
  return (
    (g = await Ps({ ...g, acknowledgedId: p.id })),
    f(g),
    await Go(g.actorId, g.tripId, g.version),
    p
  );
}
const Yc = {
    vehicle: "ТС со всех сторон",
    fluids: "Технические жидкости",
    documents: "Документы ТС",
    equipment: "Дополнительное оборудование",
    other: "Требования механика",
  },
  qp = {
    photo: "Фото и состояние",
    document: "Документ: фото и состояние",
    check: "Наличие и состояние",
    text: "Письменный ответ",
  },
  Qo = {
    ok: "В порядке",
    defect: "Есть замечание",
    missing: "Отсутствует",
    not_applicable: "Не применимо",
  },
  Uc = {
    pending: "У механика",
    accepted: "КО принят",
    returned: "Вернули на доработку",
  },
  Po = Object.keys(Yc),
  Vc = (c) => c === "defect" || c === "missing",
  Gt = (c) =>
    c instanceof Error
      ? c.message
      : "Не удалось выполнить действие. Повторите попытку.",
  li = (c) =>
    new Date(`${c.slice(0, 10)}T12:00:00Z`).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  ei = (c) =>
    new Date(c).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    }) + " МСК",
  Mc = (c) => `/inspections/trips/${encodeURIComponent(c)}`;
function $p({ status: c }) {
  return n.jsx("span", {
    className: `ko-status ko-status-${c}`,
    children: Uc[c],
  });
}
function ea({ text: c }) {
  return c
    ? n.jsx("div", { className: "error", role: "alert", children: c })
    : null;
}
function Mg({ token: c, id: d, alt: f, onExpired: r }) {
  return n.jsx(PhotoPreview, {
    token: c,
    path: `/inspections/photos/${encodeURIComponent(d)}/download`,
    alt: f,
    onExpired: r,
  });
}
function qg({ photo: c, remove: d, token, onExpired }) {
  const file = h.useMemo(() => {
    if (c.remote) return null;
    const bytes = Uint8Array.from(atob(c.contentBase64), (value) => value.charCodeAt(0));
    return new Blob([bytes], { type: c.mimeType });
  }, [c.localId, c.contentBase64, c.mimeType, c.remote]);
  return n.jsxs("figure", {
    className: "ko-draft-photo",
    children: [
      c.remote
        ? n.jsx(Mg, { token, id: c.uploaded.id, alt: c.name, onExpired })
        : n.jsx(LocalPhotoPreview, { file, alt: c.name }),
      n.jsxs("figcaption", {
        children: [
          c.remote ? "Из предыдущего осмотра" : c.uploaded ? "Доставлено" : "На устройстве",
          n.jsx("button", {
            type: "button",
            className: "text-button",
            onClick: d,
            "aria-label": `Удалить фото ${c.name}`,
            children: c.remote ? "Убрать из исправления" : "Удалить",
          }),
        ],
      }),
    ],
  });
}
function Fp({ submission: c, token: d, onExpired: f, onPhotosChanged }) {
  return n.jsxs("div", {
    className: "ko-submission",
    children: [
      n.jsxs("div", {
        className: "ko-meta-row",
        children: [
          n.jsx($p, { status: c.status }),
          n.jsxs("span", { children: ["Версия отчёта ", c.revision] }),
          n.jsxs("span", { children: ["Шаблон v", c.template.version] }),
        ],
      }),
      n.jsxs("p", {
        className: "muted",
        children: [
          c.vehicle.name,
          " · ",
          li(c.businessDate),
          " · Осмотр ",
          ei(c.occurredAt),
        ],
      }),
      c.hasCriticalDefects &&
        n.jsx("div", {
          className: "error",
          children:
            "Отмечены критические неисправности или отсутствие обязательного оснащения.",
        }),
      c.review &&
        n.jsxs("div", {
          className: "notice",
          children: [
            n.jsx("strong", {
              children:
                c.review.decision === "returned"
                  ? "Замечание механика"
                  : "Решение механика",
            }),
            n.jsx("p", {
              children: c.review.reason || "Фотоотчёт принят без замечаний.",
            }),
            n.jsx("small", { children: ei(c.review.reviewedAt) }),
          ],
        }),
      Po.map((r) => {
        const g = c.template.items.filter((p) => p.section === r);
        return g.length
          ? n.jsxs(
              "section",
              {
                className: "ko-review-section",
                children: [
                  n.jsx("h3", { children: Yc[r] }),
                  g.map((p) => {
                    const b = c.answers.find((D) => D.itemId === p.id);
                    return n.jsxs(
                      "article",
                      {
                        className: `ko-review-item ${b && Vc(b.result) ? "ko-negative" : ""}`,
                        children: [
                          n.jsxs("div", {
                            className: "ko-item-top",
                            children: [
                              n.jsx("strong", { children: p.label }),
                              n.jsx("span", {
                                children: b
                                  ? Qo[b.result]
                                  : "Не заполнено · необязательно",
                              }),
                            ],
                          }),
                          p.critical &&
                            n.jsx("small", {
                              className: "ko-critical",
                              children: "Критический пункт",
                            }),
                          p.instruction &&
                            n.jsx("p", {
                              className: "input-hint",
                              children: p.instruction,
                            }),
                          b?.comment &&
                            n.jsx("p", {
                              className: "ko-comment",
                              children: b.comment,
                            }),
                          !!b?.photoIds.length &&
                            n.jsx("div", {
                              className: "ko-photos",
                              children: b.photoIds.map((D) =>
                                n.jsx(
                                  ManagedInspectionPhoto,
                                  {
                                    photo: c.photos.find(photo => photo.id === D) || { id: D },
                                    alt: p.label,
                                    token: d,
                                    onExpired: f,
                                    onDeleted: onPhotosChanged,
                                  },
                                  D,
                                ),
                              ),
                            }),
                        ],
                      },
                      p.id,
                    );
                  }),
                ],
              },
              r,
            )
          : null;
      }),
      c.comment &&
        n.jsxs("div", {
          className: "ko-general-comment",
          children: [
            n.jsx("strong", { children: "Комментарий водителя" }),
            n.jsx("p", { children: c.comment }),
          ],
        }),
      n.jsxs("p", {
        className: "input-hint",
        children: [
          "Отправлено ",
          ei(c.submittedAt),
          ". Сохранённая версия отчёта не редактируется.",
        ],
      }),
    ],
  });
}
function Hg({ submission: c, token: d, onExpired: f, onPhotosChanged }) {
  const [r, g] = h.useState(!1);
  return n.jsxs("details", {
    onToggle: (p) => g(p.currentTarget.open),
    children: [
      n.jsxs("summary", {
        children: [
          n.jsxs("span", {
            children: ["Отчёт ", c.revision, " · ", ei(c.submittedAt)],
          }),
          n.jsx($p, { status: c.status }),
        ],
      }),
      r && n.jsx(Fp, { submission: c, token: d, onExpired: f, onPhotosChanged }),
    ],
  });
}
function Kg(c) {
  return c.template.items.flatMap((d) => {
    const f = c.answers[d.id],
      r = c.photos.filter((p) => p.itemId === d.id);
    if (!f?.result)
      return d.required || r.length || f?.comment.trim()
        ? [`${d.label}: выберите состояние.`]
        : [];
    const g = [];
    return (
      d.required &&
        f.result === "not_applicable" &&
        g.push(`${d.label}: обязательный пункт нельзя пропустить.`),
      Vc(f.result) &&
        f.comment.trim().length < 3 &&
        g.push(
          `${d.label}: поясните замечание или отсутствие (от 3 символов).`,
        ),
      d.kind === "text" &&
        f.result !== "not_applicable" &&
        f.comment.trim().length < 3 &&
        g.push(`${d.label}: введите ответ (от 3 символов).`),
      ((d.kind === "photo" && (d.required || f.result !== "not_applicable")) ||
        (d.kind === "document" && ["ok", "defect"].includes(f.result))) &&
        !r.length &&
        g.push(`${d.label}: добавьте фото.`),
      g
    );
  });
}
function Lg({
  state: c,
  tripReference: d,
  actor: f,
  token: r,
  onExpired: g,
  onSent: p,
  cachedDraft: b,
  onDraftSaved: D,
  onActivity: J,
  editSubmissionId,
  onEditStarted,
}) {
  const [j, U] = h.useState(b),
    y = h.useRef(j),
    L = h.useRef(j?.version ?? 0),
    M = h.useRef(Promise.resolve()),
    ee = h.useRef(!1),
    [te, R] = h.useState(b ? "Черновик восстановлен с устройства" : ""),
    [re, le] = h.useState(""),
    [K, I] = h.useState(!1),
    [k, Z] = h.useState(0),
    [G, E] = h.useState([]),
    se = h.useRef(!0);
  (h.useEffect(
    () => (
      (se.current = !0),
      () => {
        se.current = !1;
      }
    ),
    [],
  ),
    h.useEffect(() => {
      J(K || k > 0);
    }, [K, k]),
    h.useEffect(() => () => J(!1), []));
  const P = c?.submissions.reduce(
      (ce, B) => (!ce || B.revision > ce.revision ? B : ce),
      void 0,
    ),
    H =
      !!j &&
      !!c &&
      !isCurrentInspectionDraft(j, c);
  function fe(ce) {
    ((y.current = ce), se.current && U(ce));
  }
  function Y(ce) {
    (fe(ce),
      R("Сохраняем на устройстве…"),
      E([]),
      Z((B) => B + 1),
      J(!0),
      (M.current = M.current.then(async () => {
        try {
          if (ee.current) return;
          const B = await Ps({ ...ce, version: L.current });
          ((L.current = B.version),
            D(B),
            y.current === ce && fe(B),
            se.current && R("Сохранено на устройстве"));
        } catch (B) {
          ((ee.current = !0),
            se.current && (R("Есть несохранённые изменения"), le(Gt(B))));
        } finally {
          se.current && Z((B) => B - 1);
        }
      })));
  }
  function xe() {
    if (!c?.template || (P && P.status !== "returned")) return;
    Y(correctionDraft(c, P, f.id, d));
    onEditStarted?.();
  }
  h.useEffect(() => {
    if (editSubmissionId && P?.id === editSubmissionId) {
      if (!j && P.status === "returned") xe();
      else if (j) onEditStarted?.();
    }
  }, [editSubmissionId, P?.id, P?.status, j]);
  async function ae() {
    if (!(!y.current || K)) {
      (I(!0), le(""));
      try {
        await M.current;
        const ce = await Ps({ ...y.current, version: L.current });
        ((L.current = ce.version),
          (ee.current = !1),
          fe(ce),
          D(ce),
          R("Сохранено на устройстве"));
      } catch (ce) {
        le(Gt(ce));
      } finally {
        I(!1);
      }
    }
  }
  async function V() {
    if (
      !(!j || !c || K) &&
      window.confirm(
        "Удалить этот черновик и его локальные фото? Новый осмотр нужно будет заполнить заново.",
      )
    ) {
      (I(!0), le(""));
      try {
        (await M.current,
          await Go(f.id, j.tripId, L.current),
          (L.current = 0),
          (ee.current = !1),
          U(null),
          (y.current = null),
          R(""),
          p());
      } catch (ce) {
        le(Gt(ce));
      } finally {
        I(!1);
      }
    }
  }
  async function W(ce, files) {
    const de = Array.from(files);
    if (de.length && y.current && !K) {
      if (
        de.some(
          (v) =>
            !["image/jpeg", "image/png"].includes(v.type) ||
            v.size > 5 * 1024 * 1024 ||
            !v.size,
        )
      ) {
        le("Каждое фото должно быть JPEG или PNG, размером не более 5 МБ.");
        return;
      }
      if (
        y.current.photos.filter((v) => v.itemId === ce.id).length + de.length >
        4
      ) {
        le("Можно приложить до 4 фото к одному пункту.");
        return;
      }
      (I(!0), le(""));
      try {
        const v = [];
        for (const S of de) {
          const _ = new Uint8Array(await S.slice(0, 8).arrayBuffer());
          if (
            !(S.type === "image/jpeg"
              ? _[0] === 255 && _[1] === 216 && _[2] === 255
              : [137, 80, 78, 71, 13, 10, 26, 10].every(
                  (Te, ne) => _[ne] === Te,
                ))
          )
            throw new Error(
              "Содержимое файла не соответствует JPEG или PNG. Выберите исправное фото.",
            );
          const ye = await new Promise((Te, ne) => {
            const pe = new FileReader();
            ((pe.onerror = () =>
              ne(new Error("Не удалось прочитать фото. Выберите его снова."))),
              (pe.onload = () => Te(String(pe.result).split(",")[1] ?? "")),
              pe.readAsDataURL(S));
          });
          v.push({
            localId: crypto.randomUUID(),
            itemId: ce.id,
            name: S.name,
            mimeType: S.type,
            contentBase64: ye,
            idempotencyKey: crypto.randomUUID(),
            uploaded: null,
          });
        }
        const m = y.current;
        m && (Y({ ...m, photos: [...m.photos, ...v] }), await M.current);
      } catch (v) {
        le(Gt(v));
      } finally {
        I(!1);
      }
    }
  }
  async function he() {
    if (!(!y.current || K)) {
      (I(!0), le(""));
      try {
        if ((await M.current, ee.current))
          throw new Error(
            "Отправка остановлена: черновик не сохранён. Сохраните данные на устройстве и откройте КО заново.",
          );
        let ce = { ...y.current, version: L.current };
        if (!ce.submissionKey) {
          const B = Kg(ce);
          if ((E(B), B.length)) return;
          const de = await ze(Mc(ce.tripId), {}, r),
            v = Math.max(0, ...de.submissions.map((m) => m.revision));
          if (!isCurrentInspectionDraft(ce, de) || v !== ce.expectedRevision)
            throw (
              p(),
              new Error(
                "История КО изменилась. Обновите данные и проверьте последнюю версию; текущий черновик сохранён.",
              )
            );
          const latest = de.submissions.find(item => item.revision === v);
          const removedIds = new Set((latest?.photos || []).filter(photo => photo.deletedAt).map(photo => photo.id));
          if (ce.photos.some(photo => photo.remote && removedIds.has(photo.uploaded.id))) {
            Y({ ...ce, photos: ce.photos.filter(photo => !photo.remote || !removedIds.has(photo.uploaded.id)), removedPhotoCount: removedIds.size });
            le("Часть фотографий удалена. Остальные фото и ответы сохранены. Добавьте недостающие снимки и отправьте исправления.");
            return;
          }
          ((ce = await Ps({ ...ce, submissionKey: crypto.randomUUID() })),
            (L.current = ce.version),
            fe(ce),
            D(ce));
        }
        (await Ug(
          ce,
          {
            upload: (B, de) => Ye(r, `${Mc(B)}/photos`, de),
            submit: (B, de) => Ye(r, `${Mc(B)}/submissions`, de),
          },
          (B) => {
            ((L.current = B.version), fe(B), D(B));
          },
        ),
          (y.current = null),
          U(null),
          (L.current = 0),
          R("КО доставлен механику"),
          inspectionChanged(),
          p());
      } catch (ce) {
        if (ce instanceof Ne && [400, 409].includes(ce.status) && y.current?.submissionKey && !y.current.acknowledgedId) {
          try {
            const frozen = { ...y.current, version: L.current };
            const state = await ze(Mc(frozen.tripId), {}, r);
            const latest = state.submissions.reduce((result, item) => !result || item.revision > result.revision ? item : result, null);
            if (isCurrentInspectionDraft(frozen, state) && (!latest || latest.status === "returned")) {
              const deleted = new Set([...(latest?.photos || []).filter(photo => photo.deletedAt).map(photo => photo.id), ...(ce.unavailablePhotoIds || [])]);
              const retained = frozen.photos.flatMap(photo => {
                if (!photo.uploaded || !deleted.has(photo.uploaded.id)) return [photo];
                return !photo.remote && photo.contentBase64 ? [{ ...photo, uploaded: null, idempotencyKey: crypto.randomUUID() }] : [];
              });
              const editable = await reopenInspectionDraft(frozen, retained, (frozen.removedPhotoCount || 0) + frozen.photos.length - retained.length);
              L.current = editable.version; fe(editable); D(editable);
              E(Kg(editable));
              le(deleted.size ? frozen.photos.length > retained.length
                ? "Фото были удалены или срок их хранения истёк. Ваши исправления и остальные фотографии сохранены. Добавьте недостающие снимки и отправьте снова."
                : "Срок хранения некоторых фото на сервере истёк. Ответы и снимки на устройстве сохранены. Нажмите отправку ещё раз, чтобы загрузить их повторно."
                : `${Gt(ce)} Ответы и фото сохранены, форму можно исправить и отправить снова.`);
              return;
            }
          } catch (recoveryError) {
            if (recoveryError instanceof Ne && recoveryError.status === 401) { g(); return; }
          }
        }
        ce instanceof Ne && ce.status === 401
          ? g()
          : le(
              ce instanceof Ne && ce.status === 400
                ? "Сервер отклонил эту попытку. Фото и ответы сохранены. Обновите историю и повторите отправку, чтобы проверить актуальную версию осмотра."
                : `${Gt(ce)} Черновик и фото остаются на устройстве. Повторная отправка продолжит доставку без дублирования.`,
            );
      } finally {
        I(!1);
      }
    }
  }
  if (!j)
    return n.jsxs("section", {
      className: "surface ko-start",
      children: [
        n.jsx(ea, { text: re }),
        c
          ? c.template
            ? P?.status === "pending"
              ? n.jsxs(n.Fragment, {
                  children: [
                    n.jsx("h2", { children: "КО передан механику" }),
                    n.jsx("p", {
                      children:
                        "Дождитесь решения. При возврате вы сможете исправить этот осмотр, сохранив ответы и фотографии.",
                    }),
                  ],
                })
              : P?.status === "accepted"
                ? n.jsxs(n.Fragment, {
                    children: [
                      n.jsx("h2", { children: "Фотоотчёт принят" }),
                      n.jsx("p", {
                        className: "muted",
                        children:
                          "Решение и фотографии доступны в истории ниже.",
                      }),
                    ],
                  })
                : n.jsxs(n.Fragment, {
                    children: [
                      n.jsx("span", {
                        className: "eyebrow",
                        children: "Утренний контрольный осмотр",
                      }),
                      n.jsx("h2", {
                        children: P
                          ? "Осмотр возвращён на доработку"
                          : "Подготовьте ТС к рабочему дню",
                      }),
                      n.jsxs("p", {
                        className: "muted",
                        children: [
                          (P?.status === "returned" ? P.template : c.template).title,
                          " · ",
                          (P?.status === "returned" ? P.template : c.template).items.filter((ce) => ce.required).length,
                          " обязательных пунктов. Фото, документы и оборудование — по требованиям механика.",
                        ],
                      }),
                      P?.review?.reason && n.jsx("p", { className: "notice ko-correction-notice", children: P.review.reason }),
                      P && n.jsx("p", { className: "input-hint", children: "Ответы, комментарии и доступные фото перенесутся в исправление. Поменяйте только то, что требует доработки." }),
                      n.jsx("button", {
                        className: "button primary",
                        type: "button",
                        onClick: xe,
                        children: P ? "Исправить КО" : "Начать КО",
                      }),
                    ],
                  })
            : n.jsxs(n.Fragment, {
                children: [
                  n.jsx("h2", { children: "Ожидаем шаблон от механика" }),
                  n.jsx("p", {
                    className: "muted",
                    children:
                      "Механик должен опубликовать требования КО для проекта этого рейса.",
                  }),
                ],
              })
          : n.jsx("p", {
              children:
                "Нет связи с сервером. Для нового осмотра сначала загрузите рейс и шаблон.",
            }),
      ],
    });
  const ve = K || !!j.submissionKey || ee.current,
    oe = j.template.items.filter((ce) => !!j.answers[ce.id]?.result).length;
  return n.jsxs("section", {
    className: "ko-driver-form",
    children: [
      n.jsxs("div", {
        className: "surface ko-form-heading",
        children: [
          n.jsxs("div", {
            children: [
              n.jsxs("span", {
                className: "eyebrow",
                children: ["Черновик · шаблон v", j.template.version],
              }),
              n.jsx("h2", { children: j.template.title }),
              n.jsxs("p", {
                children: [j.vehicleName, " · ", li(j.businessDate)],
              }),
            ],
          }),
          n.jsxs("strong", { children: [oe, " / ", j.template.items.length] }),
          n.jsx("progress", {
            max: j.template.items.length,
            value: oe,
            "aria-label": "Заполнено пунктов",
          }),
        ],
      }),
      j.correctionOf && n.jsxs("div", {
        className: "notice ko-correction-notice",
        children: [
          n.jsx("strong", { children: "Исправление возвращённого осмотра" }),
          n.jsx("p", { children: j.correctionReason }),
          n.jsx("p", { children: "Все доступные фото и ответы сохранены. Исправьте замечания и отправьте КО повторно." }),
          j.removedPhotoCount > 0 && n.jsx("p", { children: "Некоторые фотографии были удалены. Добавьте новые снимки только в пункты, где их не хватает." }),
        ],
      }),
      n.jsx("div", {
        className: "ko-save-state",
        role: "status",
        children: te,
      }),
      n.jsx(ea, { text: re }),
      ee.current &&
        n.jsx("button", {
          className: "button secondary",
          disabled: K,
          onClick: () => {
            ae();
          },
          children: "Повторить сохранение на устройстве",
        }),
      H &&
        n.jsxs("div", {
          className: "notice",
          children: [
            "Шаблон или версия отчёта изменились. Проверьте историю ниже. Черновик сохранён по прежней версии.",
            j.submissionKey
              ? " При потере ответа сервера сначала повторите отправку, чтобы проверить доставку."
              : " Для нового осмотра загрузите актуальные требования.",
            n.jsx("button", {
              type: "button",
              className: "text-button",
              disabled: K,
              onClick: () => {
                V();
              },
              children: "Удалить черновик и загрузить актуальные данные",
            }),
          ],
        }),
      !!j.submissionKey &&
        n.jsx("div", {
          className: "notice",
          children: j.acknowledgedId
            ? "Сервер принял КО. Осталось убрать локальную копию."
            : "КО подготовлен к отправке. Фото и ответы зафиксированы, повторная попытка продолжит доставку.",
        }),
      G.length > 0 &&
        n.jsxs("div", {
          className: "error",
          role: "alert",
          children: [
            n.jsx("strong", { children: "Завершите заполнение" }),
            n.jsx("ul", {
              children: G.map((ce) => n.jsx("li", { children: ce }, ce)),
            }),
          ],
        }),
      n.jsxs("fieldset", {
        disabled: ve || H,
        className: "ko-fieldset",
        children: [
          Po.map((ce) => {
            const B = j.template.items.filter((de) => de.section === ce);
            return B.length
              ? n.jsxs(
                  "section",
                  {
                    className: "surface ko-form-section",
                    children: [
                      n.jsx("h3", { children: Yc[ce] }),
                      B.map((de, v) => {
                        const m = j.answers[de.id] ?? {
                            result: "",
                            comment: "",
                          },
                          S = j.photos.filter((ie) => ie.itemId === de.id),
                          _ = (ie) =>
                            Y({ ...j, answers: { ...j.answers, [de.id]: ie } });
                        return n.jsxs(
                          "div",
                          {
                            className: "ko-form-item",
                            children: [
                              n.jsxs("div", {
                                className: "ko-item-top",
                                children: [
                                  n.jsxs("h4", {
                                    children: [
                                      n.jsx("span", {
                                        className: "ko-item-number",
                                        children: v + 1,
                                      }),
                                      de.label,
                                    ],
                                  }),
                                  n.jsx("span", {
                                    className: "input-hint",
                                    children: de.required
                                      ? "Обязательно"
                                      : "По необходимости",
                                  }),
                                ],
                              }),
                              de.critical &&
                                n.jsx("span", {
                                  className: "ko-critical",
                                  children: "Критический пункт",
                                }),
                              n.jsx("p", {
                                className: "input-hint",
                                children: de.instruction,
                              }),
                              n.jsx("div", {
                                className: "ko-result-options",
                                role: "group",
                                "aria-label": `Состояние: ${de.label}`,
                                children: Object.keys(Qo)
                                  .filter(
                                    (ie) =>
                                      ie !== "not_applicable" || !de.required,
                                  )
                                  .map((ie) =>
                                    n.jsx(
                                      "button",
                                      {
                                        type: "button",
                                        className:
                                          m.result === ie
                                            ? `selected ko-result-${ie}`
                                            : "",
                                        "aria-pressed": m.result === ie,
                                        onClick: () =>
                                          _({
                                            ...m,
                                            result:
                                              m.result === ie && !de.required
                                                ? ""
                                                : ie,
                                          }),
                                        children: Qo[ie],
                                      },
                                      ie,
                                    ),
                                  ),
                              }),
                              n.jsxs("label", {
                                className: "ko-comment-field",
                                children: [
                                  de.kind === "text"
                                    ? "Ответ механику"
                                    : "Комментарий",
                                  Vc(m.result) ||
                                  (de.kind === "text" &&
                                    m.result !== "not_applicable")
                                    ? " · обязателен"
                                    : "",
                                  n.jsx("textarea", {
                                    rows: 2,
                                    maxLength: 1e3,
                                    value: m.comment,
                                    placeholder:
                                      m.result && m.result !== "ok"
                                        ? "Опишите замечание или причину"
                                        : "Дополнительные сведения",
                                    onChange: (ie) =>
                                      _({ ...m, comment: ie.target.value }),
                                  }),
                                ],
                              }),
                              n.jsx("div", {
                                className: "ko-photos",
                                children: S.map((ie) =>
                                  n.jsx(
                                    qg,
                                    {
                                      photo: ie,
                                      token: r,
                                      onExpired: g,
                                      remove: () =>
                                        Y({
                                          ...j,
                                          photos: j.photos.filter(
                                            (ye) => ye.localId !== ie.localId,
                                          ),
                                        }),
                                    },
                                    ie.localId,
                                  ),
                                ),
                              }),
                              n.jsx(PhotoPicker, {
                                label: `Добавить фото: ${de.label}`,
                                cameraLabel: `Сфотографировать: ${de.label}`,
                                accept: "image/jpeg,image/png",
                                multiple: !0,
                                maxBytes: 5 * 1024 * 1024,
                                disabled: S.length >= 4 || ve || H || K,
                                onFiles: (files) => W(de, files),
                              }),
                              n.jsx("small", {
                                className: "input-hint",
                                children: `JPEG / PNG · до 5 МБ · ${S.length}/4`,
                              }),
                            ],
                          },
                          de.id,
                        );
                      }),
                    ],
                  },
                  ce,
                )
              : null;
          }),
          n.jsx("section", {
            className: "surface ko-form-section",
            children: n.jsxs("label", {
              children: [
                "Общий комментарий механику",
                n.jsx("textarea", {
                  rows: 3,
                  maxLength: 2e3,
                  value: j.comment,
                  onChange: (ce) => Y({ ...j, comment: ce.target.value }),
                }),
              ],
            }),
          }),
        ],
      }),
      n.jsxs("div", {
        className: "surface ko-submit-bar",
        children: [
          n.jsxs("div", {
            children: [
              n.jsx("strong", {
                children: j.submissionKey
                  ? "Продолжить доставку"
                  : "Передать механику",
              }),
              n.jsx("p", {
                className: "input-hint",
                children:
                  "Черновик хранится в этом браузере. Для отправки нужен интернет. Решение механика появится в истории КО.",
              }),
            ],
          }),
          n.jsx("button", {
            type: "button",
            className: "button primary",
            disabled: K || (H && !j.submissionKey) || ee.current,
            onClick: () => {
              he();
            },
            children: K
              ? "Сохраняем и отправляем…"
              : j.acknowledgedId
                ? "Завершить сохранение"
                : j.submissionKey
                  ? "Повторить отправку"
                  : j.correctionOf ? "Отправить исправления" : "Отправить КО",
          }),
        ],
      }),
      c &&
        !H &&
        n.jsx("button", {
          type: "button",
          className: "text-button ko-discard",
          disabled: K || k > 0,
          onClick: () => {
            V();
          },
          children: "Удалить локальный черновик и начать заново",
        }),
    ],
  });
}
function Bg(c) {
  const [correctionRequest, setCorrectionRequest] = h.useState(null);
  const currentTrip = h.useRef(null);
  const [d, f] = h.useState([]),
    [r, g] = h.useState([]),
    [p, b] = h.useState(""),
    [D, J] = h.useState(null),
    [j, U] = h.useState(""),
    [y, L] = h.useState(!0),
    [M, ee] = h.useState(0),
    [te, R] = h.useState(""),
    [re, le] = h.useState(!1),
    [K, I] = h.useState(null),
    [k, Z] = h.useState(!1),
    { actor: G, token: E, onExpired: se } = c;
  (h.useEffect(() => {
    let Y = !0;
    return (
      le(!1),
      Ip(G.id)
        .then((xe) => {
          Y && (g(xe), b((ae) => ae || xe[0]?.tripId || ""), R(""));
        })
        .catch((xe) => {
          Y && R(Gt(xe));
        })
        .finally(() => {
          Y && le(!0);
        }),
      () => {
        Y = !1;
      }
    );
  }, [G.id, M]),
    h.useEffect(() => {
      const Y = new AbortController();
      return (
        L(!0),
        el
          .trips(E, null, Y.signal)
          .then((xe) => {
            Y.signal.aborted ||
              (f(xe.items),
              I(xe.nextCursor),
              b((ae) => ae || xe.items[0]?.id || ""),
              U(""));
          })
          .catch((xe) => {
            Y.signal.aborted ||
              (xe instanceof Ne && xe.status === 401 ? se() : U(Gt(xe)));
          })
          .finally(() => {
            Y.signal.aborted || L(!1);
          }),
        () => Y.abort()
      );
    }, [E, M]),
    h.useEffect(() => {
      if ((J(null), !p)) return;
      const Y = new AbortController();
      return (
        ze(Mc(p), { signal: Y.signal }, E)
          .then((xe) => {
            Y.signal.aborted || J(xe);
          })
          .catch((xe) => {
            Y.signal.aborted ||
              (xe instanceof Ne && xe.status === 401 ? se() : U(Gt(xe)));
          }),
        () => Y.abort()
      );
    }, [E, p, M]));
  currentTrip.current = p;
  h.useEffect(() => () => { currentTrip.current = null; }, []);
  ai(async () => {
    const selected = p;
    try {
      const state = await ze(Mc(selected), {}, E);
      if (currentTrip.current === selected) J(previous => JSON.stringify(previous) === JSON.stringify(state) ? previous : state);
    } catch (error) {
      if (currentTrip.current !== selected) return;
      if (error instanceof Ne && error.status === 401) se();
      else if ([403, 404].includes(error.status)) { J(null); U(Gt(error)); }
    }
  }, Boolean(p) && !k && !y);
  const P = r.find((Y) => Y.tripId === p) ?? null,
    H = d.map((Y) => ({
      id: Y.id,
      label: `${Y.reference} · ${li(Y.businessDate)} · ${Y.vehicle.label}`,
    }));
  for (const Y of r)
    H.some((xe) => xe.id === Y.tripId) ||
      H.push({
        id: Y.tripId,
        label: `${Y.tripReference} · ${li(Y.businessDate)} · ${Y.vehicleName} · черновик`,
      });
  for (const item of c.attention?.items || []) {
    if (!H.some(trip => trip.id === item.tripId)) H.push({ id: item.tripId, label: `${item.tripReference} · требует доработки` });
  }
  async function openCorrection(item) {
    currentTrip.current = item.tripId;
    b(item.tripId);
    setCorrectionRequest(null);
    try {
      const state = await ze(Mc(item.tripId), {}, E);
      if (currentTrip.current !== item.tripId) return;
      J(state);
      setCorrectionRequest(item);
      U("");
    } catch (error) {
      if (currentTrip.current !== item.tripId) return;
      if (error instanceof Ne && error.status === 401) se();
      else U(Gt(error));
    }
  }
  async function fe() {
    if (K) {
      L(!0);
      try {
        const Y = await el.trips(E, K);
        (f((xe) => [
          ...xe,
          ...Y.items.filter((ae) => !xe.some((V) => V.id === ae.id)),
        ]),
          I(Y.nextCursor));
      } catch (Y) {
        Y instanceof Ne && Y.status === 401 ? se() : U(Gt(Y));
      } finally {
        L(!1);
      }
    }
  }
  return n.jsxs("div", {
    className: "ko-driver",
    children: [
      n.jsxs("div", {
        className: "page-heading",
        children: [
          n.jsxs("div", {
            children: [
              n.jsx("span", {
                className: "eyebrow",
                children: "Кабинет водителя",
              }),
              n.jsx("h1", { children: "Контрольный осмотр" }),
              n.jsx("p", {
                children: "Утром: фото ТС, документы и оборудование",
              }),
              n.jsx("p", {
                className: "input-hint",
                children: "После принятия осмотра фото сжимаются и хранятся до истечения трёх месяцев с загрузки. Затем они удаляются автоматически.",
              }),
            ],
          }),
          n.jsx("button", {
            className: "button secondary",
            onClick: () => ee((Y) => Y + 1),
            disabled: y || k,
            children: "Обновить",
          }),
        ],
      }),
      n.jsx(InspectionAttention, {
        attention: c.attention,
        disabled: k,
        onSelect: openCorrection,
      }),
      n.jsx(ea, { text: j }),
      n.jsx(ea, { text: te }),
      n.jsxs("section", {
        className: "surface ko-trip-picker",
        children: [
          n.jsxs("label", {
            children: [
              "Рейс и транспорт",
              n.jsxs("select", {
                value: p,
                onChange: (Y) => b(Y.target.value),
                disabled: !H.length || k,
                children: [
                  n.jsx("option", {
                    value: "",
                    disabled: !0,
                    children: "Выберите назначенный рейс",
                  }),
                  H.map((Y) =>
                    n.jsx("option", { value: Y.id, children: Y.label }, Y.id),
                  ),
                ],
              }),
            ],
          }),
          K &&
            n.jsx("button", {
              className: "text-button",
              disabled: y || k,
              onClick: () => {
                fe();
              },
              children: "Загрузить ещё рейсы",
            }),
          !y &&
            !H.length &&
            n.jsx("p", {
              className: "muted",
              children:
                "Назначенные рейсы появятся после создания диспетчером.",
            }),
        ],
      }),
      re &&
        p &&
        (D?.tripId === p || P) &&
        !te &&
        n.jsx(
          Lg,
          {
            ...c,
            state: D?.tripId === p ? D : null,
            tripReference:
              d.find((Y) => Y.id === p)?.reference ??
              P?.tripReference ??
              "Рейс",
            cachedDraft: P,
            editSubmissionId: correctionRequest?.tripId === p ? correctionRequest.submissionId : null,
            onEditStarted: () => {
              setCorrectionRequest(null);
              requestAnimationFrame(() => document.querySelector(".ko-driver-form")?.scrollIntoView({ block: "start" }));
            },
            onSent: () => { ee((Y) => Y + 1); c.attention?.refresh(); },
            onActivity: Z,
            onDraftSaved: (Y) =>
              g((xe) => [...xe.filter((ae) => ae.tripId !== Y.tripId), Y]),
          },
          `${G.id}:${p}:${M}`,
        ),
      D?.tripId === p &&
        D.submissions.length > 0 &&
        n.jsxs("section", {
          className: "surface ko-history",
          children: [
            n.jsx("h2", { children: "История КО" }),
            [...D.submissions]
              .sort((Y, xe) => xe.revision - Y.revision)
              .map((Y) =>
                n.jsx(Hg, { submission: Y, token: E, onExpired: se }, Y.id),
              ),
          ],
        }),
      n.jsx("p", {
        className: "ko-boundary input-hint",
        children:
          "«КО принят» означает, что механик проверил фотоотчёт. Отметка выхода в рейс выполняется отдельно в разделе «Рейсы».",
      }),
    ],
  });
}
function kg({ submission: c, token: d, onExpired: f, onReviewed: r }) {
  const [g, p] = h.useState(""),
    [b, D] = h.useState(!1),
    [J, j] = h.useState(""),
    U = h.useRef(null),
    y = c.answers.some((M) => Vc(M.result));
  async function L(M) {
    if (b) return;
    if ((M === "returned" || y || g.trim()) && g.trim().length < 3) {
      j("Укажите причину решения — не менее 3 символов.");
      return;
    }
    (D(!0), j(""));
    const ee = { decision: M, reason: g.trim() || null },
      te = JSON.stringify(ee);
    (!U.current || U.current.serialized !== te) &&
      (U.current = {
        serialized: te,
        payload: { ...ee, idempotencyKey: crypto.randomUUID() },
      });
    try {
      (await Ye(
        d,
        `/inspections/submissions/${encodeURIComponent(c.id)}/review`,
        U.current.payload,
      ),
        r());
    } catch (R) {
      R instanceof Ne && R.status === 401 ? f() : j(Gt(R));
    } finally {
      D(!1);
    }
  }
  return n.jsxs("section", {
    className: "ko-review-actions",
    children: [
      n.jsx("h3", { children: "Решение механика" }),
      n.jsx(ea, { text: J }),
      c.hasCriticalDefects &&
        n.jsx("p", {
          className: "error",
          children:
            "Принять КО с критическими замечаниями нельзя. Укажите, что водителю нужно исправить, и верните отчёт.",
        }),
      n.jsxs("label", {
        children: [
          "Комментарий к решению",
          y ? " · обязателен" : "",
          n.jsx("textarea", {
            rows: 3,
            maxLength: 1e3,
            disabled: b,
            value: g,
            onChange: (M) => p(M.target.value),
            placeholder:
              "Для возврата опишите, какие пункты исправить и какие фото переснять",
          }),
        ],
      }),
      n.jsxs("div", {
        className: "action-row",
        children: [
          n.jsx("button", {
            className: "button primary",
            disabled: b || c.hasCriticalDefects || (y && g.trim().length < 3),
            onClick: () => {
              L("accepted");
            },
            children: b ? "Сохраняем…" : "Принять КО",
          }),
          n.jsx("button", {
            className: "button secondary",
            disabled: b || g.trim().length < 3,
            onClick: () => {
              L("returned");
            },
            children: "Вернуть на доработку",
          }),
        ],
      }),
    ],
  });
}
function Yg({ token: c, onExpired: d }) {
  const [f, r] = h.useState(null),
    [g, p] = h.useState(""),
    [b, D] = h.useState("Утренний контрольный осмотр"),
    [J, j] = h.useState([]),
    [U, y] = h.useState(0),
    [L, M] = h.useState(""),
    [ee, te] = h.useState(""),
    [R, re] = h.useState(!1),
    [le, K] = h.useState(0),
    I = h.useRef(null);
  (h.useEffect(() => {
    const E = new AbortController();
    return (
      ze("/inspections/templates", { signal: E.signal }, c)
        .then((se) => {
          E.signal.aborted ||
            (r(se), p((P) => P || (se.scopes.length ? "0" : "")));
        })
        .catch((se) => {
          E.signal.aborted ||
            (se instanceof Ne && se.status === 401 ? d() : M(Gt(se)));
        }),
      () => E.abort()
    );
  }, [c, le]),
    h.useEffect(() => {
      const E = f?.scopes[Number(g)];
      if (!E || g === "") return;
      const se = f.templates
        .filter(
          (P) =>
            P.scope.legalEntityId === E.legalEntityId &&
            P.scope.regionId === E.regionId &&
            P.scope.projectId === E.projectId &&
            P.scope.responsibilityScopeId === E.responsibilityScopeId,
        )
        .sort((P, H) => H.version - P.version)[0];
      (D(se?.title ?? "Утренний контрольный осмотр"),
        j((se?.items ?? Og).map((P) => ({ ...P }))),
        y(se?.version ?? 0),
        (I.current = null));
    }, [f, g]));
  function k(E, se) {
    (j((P) => P.map((H, fe) => (fe === E ? { ...H, ...se } : H))), te(""));
  }
  function Z(E, se) {
    j((P) => {
      const H = [...P],
        fe = E + se;
      return fe < 0 || fe >= H.length
        ? P
        : (([H[E], H[fe]] = [H[fe], H[E]]), H);
    });
  }
  async function G() {
    const E = f?.scopes[Number(g)];
    if (!E || R) return;
    if (
      b.trim().length < 3 ||
      !J.length ||
      J.some((H) => H.label.trim().length < 3)
    ) {
      M(
        "Укажите название шаблона и каждого пункта (от 3 символов), добавьте хотя бы один пункт.",
      );
      return;
    }
    const se = {
        scope: {
          legalEntityId: E.legalEntityId,
          regionId: E.regionId,
          projectId: E.projectId,
          responsibilityScopeId: E.responsibilityScopeId,
        },
        expectedVersion: U,
        title: b.trim(),
        items: J.map((H) => ({
          ...H,
          label: H.label.trim(),
          instruction: H.instruction.trim(),
        })),
      },
      P = JSON.stringify(se);
    ((!I.current || I.current.serialized !== P) &&
      (I.current = {
        serialized: P,
        payload: { ...se, idempotencyKey: crypto.randomUUID() },
      }),
      re(!0),
      M(""),
      te(""));
    try {
      const H = await Ye(c, "/inspections/templates", I.current.payload);
      (te(
        `Опубликован шаблон версии ${H.version}. Новые КО будут заполнены по нему.`,
      ),
        K((fe) => fe + 1));
    } catch (H) {
      H instanceof Ne && H.status === 401 ? d() : M(Gt(H));
    } finally {
      re(!1);
    }
  }
  return n.jsxs("section", {
    className: "surface ko-template",
    children: [
      n.jsxs("div", {
        className: "ko-item-top",
        children: [
          n.jsxs("div", {
            children: [
              n.jsx("span", {
                className: "eyebrow",
                children: "Настройка требований",
              }),
              n.jsx("h2", { children: "Шаблоны механика" }),
            ],
          }),
          n.jsx("button", {
            className: "button secondary",
            disabled: R,
            onClick: () => K((E) => E + 1),
            children: "Обновить",
          }),
        ],
      }),
      n.jsx("p", {
        className: "muted",
        children:
          "Настройте фото, документы, оборудование и дополнительные требования к осмотру. Опубликованные версии сохраняются в истории отчётов.",
      }),
      n.jsx(ea, { text: L }),
      ee && n.jsx("div", { className: "notice", role: "status", children: ee }),
      n.jsxs("fieldset", {
        className: "ko-fieldset",
        disabled: R,
        children: [
          n.jsxs("label", {
            children: [
              "Шаблон осмотра",
              n.jsxs("select", {
                value: g,
                onChange: (E) => {
                  (p(E.target.value), te(""));
                },
                children: [
                  n.jsx("option", {
                    value: "",
                    disabled: !0,
                    children: "Выберите шаблон осмотра",
                  }),
                  f?.scopes.map((E, se) => {
                    const template = f.templates.filter(item => item.scope.responsibilityScopeId === E.responsibilityScopeId).sort((a, b) => b.version - a.version)[0];
                    return n.jsx(
                      "option",
                      { value: se, children: template ? `${template.title} · версия ${template.version} · ${template.items.length} пунктов` : `Новый шаблон осмотра ${se + 1}` },
                      `${E.legalEntityId}:${E.regionId}:${E.projectId}:${E.responsibilityScopeId}`,
                    );
                  }),
                ],
              }),
            ],
          }),
          f &&
            !f.scopes.length &&
            n.jsx("p", {
              children: "Нет доступных областей для публикации шаблонов.",
            }),
          g !== "" &&
            n.jsxs(n.Fragment, {
              children: [
                n.jsx("p", {
                  className: "input-hint",
                  children: U
                    ? `Текущая версия: ${U}. Изменения создадут новую версию.`
                    : "Новый шаблон осмотра.",
                }),
                n.jsxs("label", {
                  children: [
                    "Название шаблона",
                    n.jsx("input", {
                      maxLength: 160,
                      value: b,
                      onChange: (E) => D(E.target.value),
                    }),
                  ],
                }),
                n.jsx("div", {
                  className: "ko-template-items",
                  children: J.map((E, se) =>
                    n.jsxs(
                      "article",
                      {
                        className: "ko-template-item",
                        children: [
                          n.jsxs("div", {
                            className: "ko-item-top",
                            children: [
                              n.jsxs("strong", {
                                children: ["Пункт ", se + 1],
                              }),
                              n.jsxs("div", {
                                className: "ko-reorder",
                                children: [
                                  n.jsx("button", {
                                    type: "button",
                                    disabled: se === 0,
                                    onClick: () => Z(se, -1),
                                    "aria-label": `Переместить ${E.label} выше`,
                                    children: "↑",
                                  }),
                                  n.jsx("button", {
                                    type: "button",
                                    disabled: se === J.length - 1,
                                    onClick: () => Z(se, 1),
                                    "aria-label": `Переместить ${E.label} ниже`,
                                    children: "↓",
                                  }),
                                  n.jsx("button", {
                                    type: "button",
                                    onClick: () =>
                                      j((P) => P.filter((H, fe) => se !== fe)),
                                    "aria-label": `Удалить пункт ${E.label}`,
                                    children: "Удалить",
                                  }),
                                ],
                              }),
                            ],
                          }),
                          n.jsxs("label", {
                            children: [
                              "Название пункта",
                              n.jsx("input", {
                                maxLength: 160,
                                value: E.label,
                                onChange: (P) =>
                                  k(se, { label: P.target.value }),
                              }),
                            ],
                          }),
                          n.jsxs("div", {
                            className: "ko-template-grid",
                            children: [
                              n.jsxs("label", {
                                children: [
                                  "Раздел",
                                  n.jsx("select", {
                                    value: E.section,
                                    onChange: (P) =>
                                      k(se, { section: P.target.value }),
                                    children: Po.map((P) =>
                                      n.jsx(
                                        "option",
                                        { value: P, children: Yc[P] },
                                        P,
                                      ),
                                    ),
                                  }),
                                ],
                              }),
                              n.jsxs("label", {
                                children: [
                                  "Формат ответа",
                                  n.jsx("select", {
                                    value: E.kind,
                                    onChange: (P) =>
                                      k(se, { kind: P.target.value }),
                                    children: Object.keys(qp).map((P) =>
                                      n.jsx(
                                        "option",
                                        { value: P, children: qp[P] },
                                        P,
                                      ),
                                    ),
                                  }),
                                ],
                              }),
                            ],
                          }),
                          n.jsxs("label", {
                            children: [
                              "Инструкция водителю",
                              n.jsx("textarea", {
                                rows: 2,
                                maxLength: 1e3,
                                value: E.instruction,
                                onChange: (P) =>
                                  k(se, { instruction: P.target.value }),
                              }),
                            ],
                          }),
                          n.jsxs("div", {
                            className: "ko-template-checks",
                            children: [
                              n.jsxs("label", {
                                children: [
                                  n.jsx("input", {
                                    type: "checkbox",
                                    checked: E.required,
                                    onChange: (P) =>
                                      k(se, { required: P.target.checked }),
                                  }),
                                  "Обязательный пункт",
                                ],
                              }),
                              n.jsxs("label", {
                                children: [
                                  n.jsx("input", {
                                    type: "checkbox",
                                    checked: E.critical,
                                    onChange: (P) =>
                                      k(se, { critical: P.target.checked }),
                                  }),
                                  "Критический: замечание блокирует принятие КО",
                                ],
                              }),
                            ],
                          }),
                        ],
                      },
                      E.id,
                    ),
                  ),
                }),
                n.jsx("button", {
                  className: "button secondary",
                  type: "button",
                  disabled: J.length >= 40,
                  onClick: () =>
                    j((E) => [
                      ...E,
                      {
                        id: `item_${crypto.randomUUID().replaceAll("-", "")}`,
                        section: "other",
                        kind: "check",
                        label: "",
                        instruction: "",
                        required: !0,
                        critical: !1,
                      },
                    ]),
                  children: "＋ Добавить требование",
                }),
              ],
            }),
        ],
      }),
      g !== "" &&
        n.jsx("div", {
          className: "ko-publish",
          children: n.jsx("button", {
            className: "button primary",
            disabled: R || !J.length,
            onClick: () => {
              G();
            },
            children: R ? "Публикуем…" : "Опубликовать новую версию",
          }),
        }),
    ],
  });
}
function Vg({ actor: c, token: d, onExpired: f }) {
  const [photoVersion, setPhotoVersion] = h.useState(0);
  const [inspectionHistory, setInspectionHistory] = h.useState([]);
  const [historyError, setHistoryError] = h.useState("");
  const [r, g] = h.useState("queue"),
    [p, b] = h.useState("pending"),
    [D, J] = h.useState({ items: [], nextCursor: null }),
    [j, U] = h.useState(null),
    [y, L] = h.useState(null),
    [M, ee] = h.useState(""),
    [te, R] = h.useState(!1),
    [re, le] = h.useState(0),
    K = h.useRef(0);
  function I(Z) {
    Z instanceof Ne && Z.status === 401 ? f() : ee(Gt(Z));
  }
  (h.useEffect(() => {
    const Z = new AbortController(),
      G = ++K.current;
    return (
      R(!0),
      ee(""),
      J({ items: [], nextCursor: null }),
      U(null),
      L(null),
      ze(`/inspections/queue?status=${p}`, { signal: Z.signal }, d)
        .then((E) => {
          !Z.signal.aborted && G === K.current && J(E);
        })
        .catch((E) => {
          !Z.signal.aborted && G === K.current && I(E);
        })
        .finally(() => {
          !Z.signal.aborted && G === K.current && R(!1);
        }),
      () => Z.abort()
    );
  }, [d, p, re]),
    h.useEffect(() => {
      setInspectionHistory([]); setHistoryError("");
      if ((L(null), !j)) return;
      const Z = new AbortController();
      ze(`${Mc(j.tripId)}?driverId=${encodeURIComponent(j.driver.id)}`, { signal: Z.signal }, d).then(state => {
        if (!Z.signal.aborted) setInspectionHistory(state.submissions.filter(item => item.driver.id === j.driver.id && item.id !== j.id).sort((a, b) => b.revision - a.revision));
      }).catch(error => {
        if (!Z.signal.aborted) {
          if (error.status === 401) f();
          else setHistoryError("Не удалось загрузить предыдущие версии осмотра.");
        }
      });
      return (
        ze(
          `/inspections/submissions/${encodeURIComponent(j.id)}`,
          { signal: Z.signal },
          d,
        )
          .then((G) => {
            Z.signal.aborted || L(G);
          })
          .catch((G) => {
            Z.signal.aborted || I(G);
          }),
        () => Z.abort()
      );
    }, [j?.id, d, photoVersion]),
    ai(
      async () => {
        if (D.items.length > 50) return;
        const Z = K.current;
        try {
          const G = await ze(`/inspections/queue?status=${p}`, {}, d);
          Z === K.current && J(G);
        } catch (G) {
          Z === K.current && I(G);
        }
      },
      r === "queue" && !te && !j,
    ));
  async function k() {
    if (!D.nextCursor || te) return;
    const Z = K.current;
    R(!0);
    try {
      const G = await ze(
        `/inspections/queue?status=${p}&cursor=${encodeURIComponent(D.nextCursor)}`,
        {},
        d,
      );
      Z === K.current &&
        J((E) => ({
          items: [
            ...E.items,
            ...G.items.filter((se) => !E.items.some((P) => P.id === se.id)),
          ],
          nextCursor: G.nextCursor,
        }));
    } catch (G) {
      Z === K.current && I(G);
    } finally {
      Z === K.current && R(!1);
    }
  }
  return n.jsxs("div", {
    className: "ko-office",
    children: [
      n.jsxs("div", {
        className: "page-heading",
        children: [
          n.jsxs("div", {
            children: [
              n.jsx("span", {
                className: "eyebrow",
                children:
                  c.role === "mechanic"
                    ? "Рабочее место механика"
                    : "Контроль автопарка",
              }),
              n.jsx("h1", { children: "Контрольные осмотры" }),
              n.jsx("p", {
                children: "Фотоотчёты водителей и требования к утреннему КО",
              }),
              n.jsx("p", {
                className: "input-hint",
                children: "Фото сжимаются после принятия КО. Срок хранения всех фото — три месяца с загрузки; ответы и история осмотра сохраняются.",
              }),
            ],
          }),
          n.jsx("button", {
            className: "button secondary",
            disabled: te,
            onClick: () => le((Z) => Z + 1),
            children: "Обновить",
          }),
        ],
      }),
      c.role === "mechanic" &&
        n.jsxs("nav", {
          className: "ko-tabs",
          "aria-label": "Разделы контрольного осмотра",
          children: [
            n.jsx("button", {
              "aria-pressed": r === "queue",
              onClick: () => g("queue"),
              children: "Осмотры",
            }),
            n.jsx("button", {
              "aria-pressed": r === "templates",
              onClick: () => g("templates"),
              children: "Шаблоны и требования",
            }),
          ],
        }),
      r === "templates"
        ? n.jsx(Yg, { token: d, onExpired: f })
        : n.jsxs(n.Fragment, {
            children: [
              n.jsx(ea, { text: M }),
              n.jsx("div", {
                className: "ko-tabs",
                role: "group",
                "aria-label": "Статус осмотра",
                children: Object.keys(Uc).map((Z) =>
                  n.jsx(
                    "button",
                    {
                      "aria-pressed": Z === p,
                      onClick: () => b(Z),
                      children: Uc[Z],
                    },
                    Z,
                  ),
                ),
              }),
              n.jsxs("div", {
                className: `ko-office-layout ${j ? "ko-has-selection" : ""}`,
                children: [
                  n.jsxs("section", {
                    className: "surface ko-queue",
                    "aria-label": "Список контрольных осмотров",
                    children: [
                      n.jsxs("div", {
                        className: "ko-queue-heading",
                        children: [
                          n.jsx("h2", { children: Uc[p] }),
                          n.jsxs("span", {
                            children: [D.items.length, D.nextCursor ? "+" : ""],
                          }),
                        ],
                      }),
                      te && !D.items.length
                        ? n.jsx("p", {
                            role: "status",
                            children: "Загружаем осмотры…",
                          })
                        : D.items.length
                          ? D.items.map((Z) =>
                              n.jsxs(
                                "button",
                                {
                                  className: `ko-queue-item ${j?.id === Z.id ? "selected" : ""}`,
                                  "aria-pressed": j?.id === Z.id,
                                  onClick: () => U(Z),
                                  children: [
                                    n.jsxs("div", {
                                      children: [
                                        n.jsx("strong", {
                                          children: Z.vehicle.name,
                                        }),
                                        n.jsx("span", {
                                          children: li(Z.businessDate),
                                        }),
                                      ],
                                    }),
                                    n.jsx("span", { children: Z.driver.name }),
                                    n.jsxs("small", {
                                      children: [
                                        Z.tripReference,
                                        " · отчёт ",
                                        Z.revision,
                                        " · ",
                                        ei(Z.submittedAt),
                                      ],
                                    }),
                                    Z.hasCriticalDefects &&
                                      n.jsx("span", {
                                        className: "ko-critical",
                                        children: "Критические замечания",
                                      }),
                                  ],
                                },
                                Z.id,
                              ),
                            )
                          : n.jsxs("div", {
                              className: "ko-empty",
                              children: [
                                n.jsx("strong", {
                                  children: "Осмотров пока нет",
                                }),
                                n.jsx("p", {
                                  children:
                                    "Отчёты водителей появятся после отправки КО.",
                                }),
                              ],
                            }),
                      D.nextCursor &&
                        n.jsx("button", {
                          className: "button secondary",
                          disabled: te,
                          onClick: () => {
                            k();
                          },
                          children: "Загрузить ещё",
                        }),
                    ],
                  }),
                  n.jsx("section", {
                    className: "surface ko-review-panel",
                    "aria-label": "Проверка КО",
                    children: j
                      ? n.jsxs(n.Fragment, {
                          children: [
                            n.jsx("button", {
                              className: "text-button ko-close-report",
                              onClick: () => {
                                (U(null), L(null));
                              },
                              children: "← К списку осмотров",
                            }),
                            n.jsx("h2", { children: j.vehicle.name }),
                            n.jsxs("p", {
                              className: "muted",
                              children: [j.driver.name, " · ", j.tripReference],
                            }),
                            y
                              ? n.jsxs(n.Fragment, {
                                  children: [
                                    n.jsx(Fp, {
                                      submission: y,
                                      token: d,
                                      onExpired: f,
                                      onPhotosChanged: () => setPhotoVersion(value => value + 1),
                                    }),
                                    (inspectionHistory.length > 0 || historyError) && n.jsxs("section", {
                                      className: "ko-history",
                                      children: [
                                        n.jsx("h3", { children: "Предыдущие версии осмотра" }),
                                        historyError && n.jsxs("div", { className: "error", role: "alert", children: [historyError, n.jsx("button", { className: "text-button", onClick: () => setPhotoVersion(value => value + 1), children: "Повторить" })] }),
                                        inspectionHistory.map(item => n.jsx(Hg, { submission: item, token: d, onExpired: f, onPhotosChanged: () => setPhotoVersion(value => value + 1) }, item.id)),
                                      ],
                                    }),
                                    c.role === "mechanic" &&
                                      y.status === "pending" &&
                                      n.jsx(
                                        kg,
                                        {
                                          submission: y,
                                          token: d,
                                          onExpired: f,
                                          onReviewed: () => le((Z) => Z + 1),
                                        },
                                        y.id,
                                      ),
                                    c.role !== "mechanic" &&
                                      n.jsx("p", {
                                        className: "input-hint",
                                        children:
                                          "Решение по КО принимает механик.",
                                      }),
                                  ],
                                })
                              : n.jsx("p", {
                                  role: "status",
                                  children: "Загружаем отчёт…",
                                }),
                          ],
                        })
                      : n.jsxs("div", {
                          className: "ko-empty",
                          children: [
                            n.jsx("strong", { children: "Выберите фотоотчёт" }),
                            n.jsx("p", {
                              children:
                                "Проверьте каждый пункт, фото и комментарии водителя.",
                            }),
                          ],
                        }),
                  }),
                ],
              }),
            ],
          }),
    ],
  });
}
function Gg(c) {
  return c.actor.role === "driver" ? n.jsx(Bg, { ...c }) : n.jsx(Vg, { ...c });
}
const Hp = {
    new: "Новое",
    in_progress: "В работе",
    resolved: "Решено",
    escalated: "Передано в администрацию",
  },
  Kp = { question: "Вопрос", problem: "Проблема", suggestion: "Предложение" },
  Lp = {
    take: "Взять в работу",
    resolve: "Отметить решённым",
    reopen: "Открыть повторно",
    escalate: "Передать в администрацию",
  },
  Js = (c) => Jp.find((d) => d.code === c).label,
  Mo = (c) => `/communications/tickets/${encodeURIComponent(c)}`,
  Qg = {
    pending: "Сообщение ожидает отправки в Telegram",
    sent: "Последнее сообщение принято Telegram",
    failed: "Не удалось доставить последнее сообщение",
  };
function Xg({ link: c }) {
  function d(f) {
    if (messengerProvider === "max" && window.WebApp?.openLink) {
      f.preventDefault();
      window.WebApp.openLink(c.url);
    } else if (window.Telegram?.WebApp?.openTelegramLink) {
      f.preventDefault();
      window.Telegram.WebApp.openTelegramLink(c.url);
    }
  }
  return n.jsx("a", {
    className: "button primary comm-telegram-link",
    href: c.url,
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: d,
    children: "Перейти в Telegram ↗",
  });
}
function Zg({ actor: c, token: d, onExpired: f }) {
  const [r, g] = h.useState(null),
    [p, b] = h.useState([]),
    [D, J] = h.useState(null),
    [j, U] = h.useState("mine"),
    [y, L] = h.useState(!0),
    [M, ee] = h.useState(!1),
    [te, R] = h.useState(""),
    [re, le] = h.useState(""),
    [K, I] = h.useState(null),
    [k, Z] = h.useState("question"),
    [G, E] = h.useState(""),
    [se, P] = h.useState(0),
    [H, fe] = h.useState(null),
    [Y, xe] = h.useState(null),
    [ae, V] = h.useState(null),
    [W, he] = h.useState(""),
    ve = h.useRef(!0),
    oe = h.useRef(0),
    ce = h.useRef({ payload: "", key: "" }),
    B = h.useRef(null),
    de = h.useRef(null);
  (h.useEffect(
    () => (
      (ve.current = !0),
      () => {
        ((ve.current = !1), oe.current++);
      }
    ),
    [],
  ),
    h.useEffect(() => {
      H &&
        (de.current?.scrollIntoView({ block: "start" }),
        de.current?.focus({ preventScroll: !0 }));
    }, [H?.id]));
  function v(F) {
    if (ve.current) {
      if (F instanceof Ne && F.status === 401) {
        f();
        return;
      }
      (F instanceof Ne &&
        [403, 404].includes(F.status) &&
        (fe(null), xe(null), b([])),
        R(
          F instanceof Ne
            ? F.message
            : "Не удалось выполнить действие. Повторите попытку.",
        ));
    }
  }
  async function m(F = !1) {
    const Ae = ++oe.current,
      at = new URLSearchParams({ view: j });
    F && D && at.set("cursor", D);
    const Ve = await ze(`/communications/tickets?${at}`, {}, d);
    !ve.current ||
      Ae !== oe.current ||
      (b((De) =>
        F
          ? [
              ...De,
              ...Ve.items.filter((we) => !De.some((Le) => Le.id === we.id)),
            ]
          : Ve.items,
      ),
      J(Ve.nextCursor),
      fe((De) => (De ? (Ve.items.find((we) => we.id === De.id) ?? De) : null)));
  }
  (h.useEffect(() => {
    const F = new AbortController();
    return (
      ze("/communications/catalog", { signal: F.signal }, d)
        .then((Ae) => {
          F.signal.aborted || g(Ae);
        })
        .catch((Ae) => {
          F.signal.aborted || v(Ae);
        }),
      () => F.abort()
    );
  }, [d]),
    h.useEffect(
      () => (
        L(!0),
        R(""),
        fe(null),
        xe(null),
        m()
          .catch(v)
          .finally(() => {
            ve.current && L(!1);
          }),
        () => {
          oe.current++;
        }
      ),
      [d, j],
    ),
    ai(async () => {
      try {
        if (H) {
          const F = await ze(Mo(H.id), {}, d);
          ve.current &&
            (fe((Ae) => (Ae?.id === F.id ? F : Ae)),
            b((Ae) => Ae.map((at) => (at.id === F.id ? F : at))));
        } else p.length <= 30 && (await m());
      } catch (F) {
        v(F);
      }
    }, !M && !y));
  function S(F) {
    const Ae = JSON.stringify(F);
    return (
      ce.current.payload !== Ae &&
        (ce.current = { payload: Ae, key: crypto.randomUUID() }),
      ce.current.key
    );
  }
  async function _(F) {
    if (!M) {
      (ee(!0), R(""), le(""));
      try {
        return await F();
      } catch (Ae) {
        v(Ae);
      } finally {
        ve.current && ee(!1);
      }
    }
  }
  function ie(F) {
    (j !== "mine" && U("mine"),
      I(F),
      Z(F === "administration" ? "suggestion" : "question"),
      fe(null),
      xe(null),
      V(null),
      le(""),
      window.setTimeout(() => {
        (B.current?.scrollIntoView({ block: "nearest" }),
          B.current?.querySelector("input")?.focus({ preventScroll: !0 }));
      }, 0));
  }
  async function ye(F) {
    F.preventDefault();
    const Ae = r?.scopes[se];
    if (!K || !Ae) return;
    const {
        legalEntityId: at,
        regionId: Ve,
        projectId: De,
        responsibilityScopeId: we,
      } = Ae,
      Le = {
        department: K,
        kind: k,
        subject: G.trim(),
        scope: {
          legalEntityId: at,
          regionId: Ve,
          projectId: De,
          responsibilityScopeId: we,
        },
      },
      Xe = await _(() =>
        Ye(d, "/communications/tickets", { ...Le, idempotencyKey: S(Le) }),
      );
    !Xe ||
      !ve.current ||
      ((ce.current = { payload: "", key: "" }),
      E(""),
      I(null),
      fe(Xe),
      xe(null),
      b((O) => [Xe, ...O.filter((Ee) => Ee.id !== Xe.id)]),
      le(
        `Обращение ${Xe.reference} сохранено.${r?.telegram.configured ? " Откройте Telegram и опишите вопрос боту." : " Оно доступно отделу в приложении; переписка появится после подключения Telegram."}`,
      ));
  }
  async function Te(F) {
    const Ae = await _(() => Ye(d, `${Mo(F.id)}/telegram-link`, {}));
    Ae && ve.current && xe(Ae);
  }
  async function ne(F) {
    if ((F.preventDefault(), !H || !ae)) return;
    const Ae = {
        expectedVersion: H.version,
        action: ae,
        ...(W.trim() ? { reason: W.trim() } : {}),
      },
      at = { ticketId: H.id, ...Ae },
      Ve = await _(() =>
        Ye(d, `${Mo(H.id)}/actions`, { ...Ae, idempotencyKey: S(at) }),
      );
    !Ve ||
      !ve.current ||
      ((ce.current = { payload: "", key: "" }),
      fe(Ve),
      b((De) => De.map((we) => (we.id === Ve.id ? Ve : we))),
      xe(null),
      V(null),
      he(""),
      le(
        ae === "escalate"
          ? "Обращение передано в администрацию. Дальнейшие сообщения пойдут её сотрудникам."
          : "Статус обращения обновлён.",
      ));
  }
  function pe(F) {
    (fe(F), I(null), xe(null), V(null), he(""), le(""));
  }
  return n.jsxs("div", {
    className: "comm-workspace",
    children: [
      n.jsx("div", {
        className: "page-heading",
        children: n.jsxs("div", {
          children: [
            n.jsx("span", {
              className: "eyebrow",
              children: "Связь с компанией",
            }),
            n.jsx("h1", { children: "Связь с отделами" }),
            n.jsx("p", {
              children:
                "Выберите отдел. Продолжите разговор в Telegram через корпоративного бота.",
            }),
          ],
        }),
      }),
      n.jsxs("div", {
        className: "comm-intro",
        children: [
          n.jsx("span", {
            className: "comm-intro-icon",
            "aria-hidden": "true",
            children: "↗",
          }),
          n.jsxs("p", {
            children: [
              n.jsx("strong", { children: "Один бот для всех вопросов" }),
              n.jsx("span", {
                children:
                  "В приложении — обращения и их статус. В Telegram — ваш разговор с отделом. Чтобы сообщения не перепутались, используйте «Ответить» на сообщение нужного обращения.",
              }),
            ],
          }),
        ],
      }),
      r &&
        !r.telegram.configured &&
        n.jsxs("div", {
          className: "comm-notice",
          role: "status",
          children: [
            n.jsx("strong", { children: "Telegram ещё не подключён" }),
            n.jsx("span", {
              children:
                "Обращения можно зарегистрировать и обработать в приложении. Переписка станет доступна после подключения корпоративного бота.",
            }),
          ],
        }),
      n.jsx(Ot, { error: te, success: re }),
      n.jsx("div", {
        className: "comm-departments",
        "aria-label": "Выберите отдел",
        children: Jp.map((F, Ae) =>
          n.jsxs(
            "button",
            {
              type: "button",
              className: `comm-department ${K === F.code ? "comm-department-selected" : ""}`,
              onClick: () => ie(F.code),
              disabled: M || !r?.scopes.length,
              "aria-pressed": K === F.code,
              children: [
                n.jsx("span", {
                  className: "comm-department-number",
                  "aria-hidden": "true",
                  children: String(Ae + 1).padStart(2, "0"),
                }),
                n.jsx("strong", { children: F.label }),
                n.jsx("span", { children: F.description }),
                n.jsx("span", {
                  className: "comm-department-arrow",
                  "aria-hidden": "true",
                  children: "↗",
                }),
              ],
            },
            F.code,
          ),
        ),
      }),
      r &&
        !r.scopes.length &&
        n.jsx("p", {
          className: "muted",
          children:
            "Для обращения нужна назначенная область работы. Обратитесь к администратору доступа.",
        }),
      K &&
        r &&
        n.jsxs("form", {
          ref: B,
          className: "surface comm-form",
          onSubmit: ye,
          children: [
            n.jsxs("div", {
              className: "comm-section-heading",
              children: [
                n.jsx("h2", { children: Js(K) }),
                n.jsx("button", {
                  className: "button secondary",
                  type: "button",
                  onClick: () => I(null),
                  disabled: M,
                  children: "Отмена",
                }),
              ],
            }),
            n.jsx("p", {
              className: "comm-hint",
              role: "note",
              children: `Автор обращения — ${c.displayName}. Оно будет создано от вашего имени. В «Запросах водителей» отображаются обращения, отправленные из аккаунтов водителей.${c.role === "access_admin" && !c.impersonation ? " Для проверки водительского диалога войдите от имени водителя через раздел «Сотрудники»." : ""}`,
            }),
            n.jsxs("div", {
              className: "comm-form-grid",
              children: [
                n.jsx(ue, {
                  label: "Тип обращения",
                  children: n.jsx("select", {
                    value: k,
                    onChange: (F) => Z(F.target.value),
                    disabled: M,
                    children: Object.entries(Kp).map(([F, Ae]) =>
                      n.jsx("option", { value: F, children: Ae }, F),
                    ),
                  }),
                }),
              ],
            }),
            n.jsx(ue, {
              label: "Краткая тема",
              hint: "Например: «Изменение времени загрузки». Подробности напишите в Telegram.",
              children: n.jsx("input", {
                value: G,
                onChange: (F) => E(F.target.value),
                minLength: 3,
                maxLength: 140,
                required: !0,
                placeholder: "О чём хотите поговорить?",
                disabled: M,
              }),
            }),
            K === "administration" &&
              n.jsx("p", {
                className: "comm-hint",
                children:
                  "Если вопрос уже обсуждался с отделом, откройте прежнее обращение и нажмите «Передать в администрацию» — сохранится связь с исходной проблемой.",
              }),
            n.jsxs("div", {
              className: "comm-form-footer",
              children: [
                n.jsx("small", {
                  children:
                    "До подтверждения сервера обращение не считается отправленным. При ошибке повторите отправку, оставив форму открытой.",
                }),
                n.jsx("button", {
                  className: "button primary",
                  disabled: M || G.trim().length < 3,
                  children: M ? "Сохраняем…" : "Создать обращение",
                }),
              ],
            }),
          ],
        }),
      H &&
        n.jsxs("section", {
          ref: de,
          tabIndex: -1,
          className: "surface comm-detail",
          "aria-label": `Обращение ${H.reference}`,
          children: [
            n.jsxs("div", {
              className: "comm-section-heading",
              children: [
                n.jsxs("div", {
                  children: [
                    n.jsx("span", {
                      className: "eyebrow",
                      children: H.reference,
                    }),
                    n.jsx("h2", { children: H.subject }),
                  ],
                }),
                n.jsx("button", {
                  className: "button secondary",
                  type: "button",
                  onClick: () => {
                    (fe(null), xe(null), V(null));
                  },
                  disabled: M,
                  children: "Закрыть карточку",
                }),
              ],
            }),
            n.jsxs("div", {
              className: "comm-detail-meta",
              children: [
                n.jsx("span", {
                  className: `comm-status comm-status-${H.status}`,
                  children: Hp[H.status],
                }),
                n.jsx("span", { children: Js(H.department) }),
                n.jsx("span", { children: Kp[H.kind] }),
              ],
            }),
            H.department !== H.originalDepartment &&
              n.jsxs("p", {
                className: "comm-hint",
                children: [
                  "Исходный отдел: ",
                  Js(H.originalDepartment),
                  ". Обращение рассматривает администрация.",
                ],
              }),
            n.jsxs("dl", {
              className: "comm-facts",
              children: [
                n.jsxs("div", {
                  children: [
                    n.jsx("dt", { children: "Создано" }),
                    n.jsx("dd", { children: et(H.createdAt) }),
                  ],
                }),
                n.jsxs("div", {
                  children: [
                    n.jsx("dt", { children: "Ответственный" }),
                    n.jsx("dd", {
                      children: H.assignee?.name ?? "Ещё не назначен",
                    }),
                  ],
                }),
                n.jsxs("div", {
                  children: [
                    n.jsx("dt", { children: "Автор обращения" }),
                    n.jsx("dd", { children: `${H.requester.name}${H.requester.id === c.id ? " (вы)" : ""}` }),
                  ],
                }),
                n.jsxs("div", {
                  children: [
                    n.jsx("dt", { children: "Проект" }),
                    n.jsx("dd", { children: r?.scopes.find(value => value.responsibilityScopeId === H.scope.responsibilityScopeId)?.label || "Назначенная область обращения" }),
                  ],
                }),
              ],
            }),
            H.lastDeliveryStatus &&
              n.jsxs("p", {
                className: `comm-delivery ${H.lastDeliveryStatus === "failed" ? "comm-delivery-failed" : ""}`,
                children: [
                  Qg[H.lastDeliveryStatus],
                  H.lastDeliveryStatus === "sent"
                    ? ". Это не подтверждение прочтения."
                    : ".",
                ],
              }),
            H.status !== "resolved" &&
              n.jsx("div", {
                className: "comm-dialog-action",
                children: r?.telegram.configured
                  ? n.jsxs(n.Fragment, {
                      children: [
                        Y && new Date(Y.expiresAt).getTime() > Date.now()
                          ? n.jsx(Xg, { link: Y })
                          : n.jsx("button", {
                              type: "button",
                              className: "button primary",
                              disabled: M,
                              onClick: () => {
                                Te(H);
                              },
                              children: M
                                ? "Готовим переход…"
                                : "Открыть диалог в Telegram",
                            }),
                        n.jsx("p", {
                          children:
                            "В боте нажмите «Начать», затем ответьте на сообщение с номером обращения. Сейчас поддерживаются текстовые сообщения.",
                        }),
                      ],
                    })
                  : n.jsx("p", {
                      className: "muted",
                      children:
                        "Диалог станет доступен после подключения Telegram. Сохранённое обращение останется в списке.",
                    }),
              }),
            !!H.actions.length &&
              n.jsx("div", {
                className: "comm-ticket-actions",
                children: H.actions.map((F) =>
                  n.jsx(
                    "button",
                    {
                      className:
                        F === "escalate"
                          ? "button secondary comm-escalate"
                          : "button secondary",
                      type: "button",
                      onClick: () => {
                        (V(F), he(""));
                      },
                      disabled: M,
                      children: Lp[F],
                    },
                    F,
                  ),
                ),
              }),
            ae &&
              n.jsxs("form", {
                className: "comm-action-form",
                onSubmit: ne,
                children: [
                  n.jsx("h3", { children: Lp[ae] }),
                  ["resolve", "escalate"].includes(ae) &&
                    n.jsx(ue, {
                      label:
                        ae === "escalate"
                          ? "Что осталось нерешённым?"
                          : "Как решён вопрос?",
                      children: n.jsx("textarea", {
                        value: W,
                        onChange: (F) => he(F.target.value),
                        maxLength: 500,
                        minLength: 3,
                        required: !0,
                        rows: 3,
                        disabled: M,
                      }),
                    }),
                  ae === "take" &&
                    n.jsx("p", {
                      children: "Вы станете ответственным за это обращение.",
                    }),
                  ae === "reopen" &&
                    n.jsx("p", {
                      children: "Обращение снова появится в работе отдела.",
                    }),
                  n.jsxs("div", {
                    className: "comm-ticket-actions",
                    children: [
                      n.jsx("button", {
                        className: "button primary",
                        disabled: M,
                        children: M ? "Сохраняем…" : "Подтвердить",
                      }),
                      n.jsx("button", {
                        className: "button secondary",
                        type: "button",
                        onClick: () => V(null),
                        disabled: M,
                        children: "Отмена",
                      }),
                    ],
                  }),
                ],
              }),
            !!H.history.length &&
              n.jsxs("details", {
                className: "comm-history",
                children: [
                  n.jsxs("summary", {
                    children: ["История обработки · ", H.history.length],
                  }),
                  n.jsx("ol", {
                    children: H.history.map((F) =>
                      n.jsxs(
                        "li",
                        {
                          children: [
                            n.jsxs("div", {
                              children: [
                                n.jsx("strong", {
                                  children: {
                                    created: "Обращение создано",
                                    take: "Взято в работу",
                                    resolve: "Вопрос решён",
                                    reopen: "Открыто повторно",
                                    escalate: "Передано в администрацию",
                                  }[F.action],
                                }),
                                n.jsx("time", {
                                  dateTime: F.occurredAt,
                                  children: et(F.occurredAt),
                                }),
                              ],
                            }),
                            n.jsxs("span", {
                              children: [F.actor.name, " · ", Js(F.department)],
                            }),
                            F.reason && n.jsx("p", { children: F.reason }),
                          ],
                        },
                        F.version,
                      ),
                    ),
                  }),
                  H.history.length === 100 &&
                    n.jsx("small", {
                      children: "Показаны последние 100 событий обработки.",
                    }),
                ],
              }),
          ],
        }),
      n.jsxs("section", {
        className: "comm-requests",
        "aria-label": "Обращения",
        children: [
          n.jsxs("div", {
            className: "comm-section-heading",
            children: [
              n.jsx("h2", {
                children: j === "mine" ? "Мои обращения" : "Обращения отдела",
              }),
              n.jsx("button", {
                className: "button secondary",
                type: "button",
                disabled: M || y,
                onClick: () => {
                  _(() => m());
                },
                children: "Обновить",
              }),
            ],
          }),
          !!r?.memberships.length &&
            n.jsx("div", {
              className: "comm-view-tabs",
              "aria-label": "Вид обращений",
              children: ["mine", "department"].map((F) =>
                n.jsx(
                  "button",
                  {
                    type: "button",
                    "aria-pressed": j === F,
                    onClick: () => U(F),
                    disabled: M,
                    children: F === "mine" ? "Мои обращения" : "Мои отделы",
                  },
                  F,
                ),
              ),
            }),
          y
            ? n.jsx("p", {
                className: "muted",
                role: "status",
                children: "Загружаем обращения…",
              })
            : p.length
              ? n.jsx("div", {
                  className: "comm-ticket-list",
                  children: p.map((F) =>
                    n.jsxs(
                      "button",
                      {
                        type: "button",
                        className: `surface comm-ticket ${H?.id === F.id ? "comm-ticket-selected" : ""}`,
                        onClick: () => pe(F),
                        disabled: M,
                        children: [
                          n.jsxs("div", {
                            className: "comm-ticket-top",
                            children: [
                              n.jsx("span", {
                                className: "comm-reference",
                                children: F.reference,
                              }),
                              n.jsx("span", {
                                className: `comm-status comm-status-${F.status}`,
                                children: Hp[F.status],
                              }),
                            ],
                          }),
                          n.jsx("strong", { children: F.subject }),
                          n.jsxs("span", {
                            className: "comm-ticket-footer",
                            children: [
                              n.jsx("span", { children: Js(F.department) }),
                              n.jsx("span", { children: et(F.updatedAt) }),
                            ],
                          }),
                        ],
                      },
                      F.id,
                    ),
                  ),
                })
              : n.jsxs("div", {
                  className: "surface comm-empty",
                  children: [
                    n.jsx("strong", {
                      children:
                        j === "mine"
                          ? "Пока нет обращений"
                          : "В отделах пока нет обращений",
                    }),
                    n.jsx("p", {
                      children:
                        j === "mine"
                          ? "Выберите отдел выше, чтобы задать вопрос, сообщить о проблеме или предложить улучшение."
                          : "Здесь появятся обращения, доступные вам по отделу и области работы.",
                    }),
                  ],
                }),
          D &&
            n.jsx("button", {
              type: "button",
              className: "button secondary comm-load-more",
              disabled: M,
              onClick: () => {
                _(() => m(!0));
              },
              children: "Показать ещё",
            }),
        ],
      }),
    ],
  });
}
const qo = { search: "", role: "", status: "all" },
  Xo = {
    driver: "Водитель",
    dispatcher: "Диспетчер",
    manager: "Менеджер",
    recruiter: "Рекрутер",
    tender_specialist: "Тендерный специалист",
    external_recruiter: "Внешний рекрутер",
    document_specialist: "Документовед",
    mechanic: "Механик",
    access_admin: "Администратор доступа",
    auditor: "Аудитор",
  },
  Jg = {
    existing: "Учётная запись системы",
    demo_seed: "Демо-данные",
    demo_manual: "Добавлен для демо",
    external_manual: "Внешний рекрутер",
    external_invitation: "Приглашён по ссылке",
    internal_manual: "Добавлен администратором",
  },
  Ig = {
    employment_ended: "Завершение работы сотрудника",
    access_review: "Пересмотр доступа",
    security_incident: "Инцидент безопасности",
  },
  Bp = (c) => `${c.displayName} · ${c.employeeNumber}`,
  kp = (c) =>
    `${c.region.name} · ${c.project.name} · ${c.responsibilityScope.name} · ${c.legalEntity.name}`;
function qc({ employee: c }) {
  return n.jsxs("div", {
    className: "employee-identity",
    children: [
      n.jsx("span", {
        className: "employee-number",
        children: c.employeeNumber,
      }),
      n.jsx("h3", { children: c.displayName }),
      c.adaptationRequired && n.jsx("p", { className: "input-hint", children: c.adaptationCompletedAt ? "Адаптация пройдена" : "Назначена программа адаптации" }),
      n.jsxs("p", {
        children: [
          Xo[c.role],
          c.displayNameMasked &&
            n.jsx("span", {
              className: "employee-masked",
              children: " · Имя скрыто",
            }),
        ],
      }),
    ],
  });
}
function $g({
  employee: c,
  busy: d,
  error: f,
  blocked: r,
  identityHidden: g,
  onConfirm: p,
  onCancel: b,
  onRefresh: D,
  restoreFocus: J,
}) {
  const j = h.useRef(null),
    U = h.useRef(null),
    [y, L] = h.useState("access_review");
  return (
    h.useEffect(() => {
      const M = j.current;
      return (
        M.showModal(),
        U.current?.focus(),
        () => {
          (M.open && M.close(), J());
        }
      );
    }, []),
    n.jsx("dialog", {
      ref: j,
      className: "access-revoke-dialog",
      "aria-labelledby": "revoke-dialog-title",
      "aria-describedby": "revoke-dialog-consequences",
      "aria-modal": "true",
      onCancel: (M) => {
        (M.preventDefault(), d || b());
      },
      children: n.jsxs("form", {
        className: "access-revoke-content",
        onSubmit: (M) => {
          (M.preventDefault(), !d && !r && p(y));
        },
        children: [
          n.jsxs("div", {
            children: [
              n.jsx("span", {
                className: "eyebrow",
                children: "Управление доступом",
              }),
              n.jsx("h2", {
                id: "revoke-dialog-title",
                children: "Отозвать доступ?",
              }),
            ],
          }),
          g
            ? n.jsx("p", {
                children: "Данные сотрудника скрыты: права доступа изменились.",
              })
            : n.jsx(qc, { employee: c }),
          n.jsx(ue, {
            label: "Причина отзыва",
            children: n.jsx("select", {
              value: y,
              onChange: (M) => L(M.target.value),
              disabled: d || r,
              children: Object.entries(Ig).map(([M, ee]) =>
                n.jsx("option", { value: M, children: ee }, M),
              ),
            }),
          }),
          n.jsx("p", {
            id: "revoke-dialog-consequences",
            children:
              "Сотрудник потеряет доступ к приложению. Все его сессии завершатся, неиспользованные приглашения станут недействительными. Вернуть доступ через этот экран пока нельзя.",
          }),
          n.jsx(Ot, { error: f }),
          d &&
            n.jsx("p", {
              className: "input-hint",
              role: "status",
              children: "Выполняем отзыв. Дождитесь ответа сервера.",
            }),
          n.jsxs("div", {
            className: "access-revoke-actions",
            children: [
              n.jsx("button", {
                ref: U,
                className: "button secondary",
                type: "button",
                disabled: d,
                onClick: b,
                children: "Отмена",
              }),
              r
                ? n.jsx("button", {
                    className: "button primary",
                    type: "button",
                    disabled: d,
                    onClick: D,
                    children: "Обновить список",
                  })
                : n.jsx("button", {
                    className: "button danger",
                    type: "submit",
                    disabled: d,
                    children: d ? "Выполняем…" : "Подтвердить отзыв",
                  }),
            ],
          }),
        ],
      }),
    })
  );
}
function AdaptationEnrollment({ checked, onChange, disabled }) {
  return n.jsxs("div", {
    className: "adaptation-enrollment",
    children: [
      n.jsxs("label", { className: "checkbox-label", children: [
        n.jsx("input", { type: "checkbox", checked, disabled, onChange: event => onChange(event.target.checked) }),
        n.jsx("span", { children: "Нужна программа адаптации" }),
      ] }),
      n.jsx("p", { className: "input-hint", children: "При входе сотрудник сначала увидит инструкции из папок «Общая информация» и «Папка сотрудника компании». По умолчанию адаптация не назначается." }),
    ],
  });
}
function Fg({ actor: c, token: d, onExpired: f, onSelfPasswordReset }) {
  const [enteringEmployee, setEnteringEmployee] = h.useState(null);
  const [enterEmployeeError, setEnterEmployeeError] = h.useState("");
  const employeeEntryPending = h.useRef(false);
  async function enterEmployee(employee) {
    if (employeeEntryPending.current || !employee.canImpersonate || c.impersonation) return;
    employeeEntryPending.current = true;
    setEnteringEmployee(employee.id);
    setEnterEmployeeError("");
    try {
      await enterEmployeeAccount(employee.id);
    } catch (error) {
      if (error instanceof Ne && error.status === 401) f();
      if (De.current) setEnterEmployeeError($a(error));
    } finally {
      employeeEntryPending.current = false;
      if (De.current) setEnteringEmployee(null);
    }
  }
  const [passwordPhone, setPasswordPhone] = h.useState("");
  const [passwordIssued, setPasswordIssued] = h.useState(null);
  const [planningEmployee, setPlanningEmployee] = h.useState(null);
  const [tenderCreateOpen, setTenderCreateOpen] = h.useState(false);
  const [tenderName, setTenderName] = h.useState("");
  const [tenderScope, setTenderScope] = h.useState("");
  const [tenderAdaptation, setTenderAdaptation] = h.useState(false);
  const [recruiterAdaptation, setRecruiterAdaptation] = h.useState(false);
  const [demoAdaptation, setDemoAdaptation] = h.useState(false);
  const tenderCreationKey = h.useRef({ payload: "", key: "" });
  const [recruiterCreateOpen, setRecruiterCreateOpen] = h.useState(false);
  const [recruiterName, setRecruiterName] = h.useState("");
  const [recruiterScope, setRecruiterScope] = h.useState("");
  const [existingRecruiter, setExistingRecruiter] = h.useState(null);
  const recruiterCreationKey = h.useRef({ payload: "", key: "" });
  const [invitationProvider, setInvitationProvider] = h.useState("telegram");
  const invitationLabel = invitationProvider === "max" ? "MAX" : "Telegram";
  const canInviteEmployee = (employee) =>
    invitationProvider === "max" ? employee?.canInviteMax : employee?.canInvite;
  const [r, g] = h.useState(null),
    [p, b] = h.useState([]),
    [D, J] = h.useState(null),
    [j, U] = h.useState(qo),
    [y, L] = h.useState(""),
    [M, ee] = h.useState(0),
    [te, R] = h.useState(!0),
    [re, le] = h.useState(!1),
    [K, I] = h.useState(""),
    [k, Z] = h.useState(""),
    [G, E] = h.useState(!1),
    [se, P] = h.useState(""),
    [H, fe] = h.useState(""),
    [Y, xe] = h.useState(null),
    [ae, V] = h.useState(null),
    [W, he] = h.useState(""),
    [ve, oe] = h.useState(!1),
    [ce, B] = h.useState(null),
    [de, v] = h.useState(null),
    [m, S] = h.useState(""),
    [_, ie] = h.useState(!1),
    [ye, Te] = h.useState(!1),
    [ne, pe] = h.useState(!1),
    [F, Ae] = h.useState(""),
    [at, Ve] = h.useState(""),
    De = h.useRef(!0),
    we = h.useRef(!1),
    Le = h.useRef(!1),
    Xe = h.useRef(0),
    O = h.useRef({ payload: "", key: "" }),
    Ee = h.useRef(null),
    st = h.useRef(null),
    pt = h.useRef(null),
    Qt = h.useRef(null),
    Dl = h.useRef(null),
    Il = h.useRef(null),
    _n = h.useRef(null),
    ol = h.useRef(null),
    An = h.useRef(null),
    Rn = h.useRef(!1);
  (h.useEffect(
    () => (
      (De.current = !0),
      () => {
        ((De.current = !1), Xe.current++, Il.current?.abort());
      }
    ),
    [],
  ),
    h.useEffect(() => {
      Y && ae && Ee.current?.focus();
    }, [Y?.id, ae]),
    h.useEffect(() => {
      ce && st.current?.focus();
    }, [ce]),
    h.useEffect(() => {
      G && pt.current?.focus();
    }, [G]),
    h.useEffect(() => {
      at &&
        Rn.current &&
        ((Rn.current = !1),
        An.current?.scrollIntoView({ block: "center" }),
        An.current?.focus({ preventScroll: !0 }));
    }, [at]));
  function dl() {
    setPasswordPhone("");
    setPasswordIssued(null);
    (xe(null), V(null), B(null), he(""), oe(!1));
  }
  function openPasswordForm(employee) {
    if (ne || !employee.canIssuePassword) return;
    dl();
    E(false);
    setTenderCreateOpen(false);
    setRecruiterCreateOpen(false);
    Ae("");
    Ve("");
    xe(employee);
    V("password");
  }
  async function issueEmployeePassword(event) {
    event.preventDefault();
    if (!Y?.canIssuePassword || ne) return;
    const employee = Y;
    const phone = normalizeLoginPhone(passwordPhone);
    if (!phone) {
      Ae("Введите номер телефона сотрудника с кодом страны.");
      return;
    }
    const credential = await la(async () => {
      try {
        return await Ye(
          d,
          `/access/users/${encodeURIComponent(employee.id)}/password`,
          { phone },
        );
      } catch (error) {
        if (error instanceof Ne && error.status === 409)
          throw new Error("Этот телефон уже используется другим сотрудником.");
        if (error instanceof Ne && error.status === 400)
          throw new Error("Проверьте номер телефона сотрудника.");
        throw error;
      }
    });
    if (!credential || !De.current || Le.current) return;
    if (employee.id === c.id) {
      onSelfPasswordReset(credential);
      return;
    }
    setPasswordIssued({ credential, employee });
    V(null);
    setPasswordPhone("");
    b((items) =>
      items.map((item) =>
        item.id === employee.id
          ? {
              ...item,
              phoneLoginEnabled: true,
              phoneMasked: credential.phone.replace(/.(?=.{4})/g, "•"),
            }
          : item,
      ),
    );
  }
  function $l($) {
    return $ instanceof Ne && $.status === 401
      ? ((Le.current = !0), dl(), f(), "")
      : $ instanceof Ne && $.status === 403
        ? ((Le.current = !0),
          Xe.current++,
          R(!1),
          le(!1),
          dl(),
          b([]),
          J(null),
          g(null),
          setPlanningEmployee(null),
          E(!1),
          Qt.current &&
            (ie(!0),
            Te(!0),
            S(
              "Действие недоступно. Обновите список и проверьте права доступа.",
            )),
          "Действие недоступно в вашей области ответственности. Обновите список и проверьте права доступа.")
        : $ instanceof Ne && $.status === 404
          ? "Сотрудник не найден или больше недоступен. Обновите список."
          : $ instanceof Error
            ? $.message
            : "Не удалось выполнить действие. Проверьте связь и повторите попытку.";
  }
  function ta($) {
    const Se = new URLSearchParams({ status: j.status, limit: "30" });
    return (
      j.search && Se.set("search", j.search),
      j.role && Se.set("role", j.role),
      $ && Se.set("cursor", $),
      `/access/employees?${Se}`
    );
  }
  (h.useEffect(() => {
    if (c.role !== "access_admin") return;
    const $ = new AbortController();
    return (
      Z(""),
      ze("/access/employees/options", { signal: $.signal }, d)
        .then((Se) => {
          $.signal.aborted ||
            Le.current ||
            (g(Se),
            P((Oe) => (Oe && Se.roles.includes(Oe) ? Oe : (Se.roles[0] ?? ""))),
            fe((Oe) =>
              Se.scopes.some((ot) => ot.id === Oe)
                ? Oe
                : Se.scopes.length === 1
                  ? Se.scopes[0].id
                  : "",
            ),
            Se.demoCreationEnabled || E(!1));
        })
        .catch((Se) => {
          $.signal.aborted || (g(null), Z($l(Se)));
        }),
      () => $.abort()
    );
  }, [d, c.role, M]),
    h.useEffect(() => {
      if (c.role !== "access_admin") {
        R(!1);
        return;
      }
      const $ = new AbortController(),
        Se = ++Xe.current;
      return (
        R(!0),
        le(!1),
        I(""),
        b([]),
        J(null),
        ze(ta(), { signal: $.signal }, d)
          .then((Oe) => {
            $.signal.aborted ||
              Le.current ||
              Se !== Xe.current ||
              (b(Oe.items), J(Oe.nextCursor), (_n.current = null));
          })
          .catch((Oe) => {
            !$.signal.aborted && Se === Xe.current && I($l(Oe));
          })
          .finally(() => {
            !$.signal.aborted && Se === Xe.current && R(!1);
          }),
        () => $.abort()
      );
    }, [d, c.role, j, M]));
  async function Fa() {
    if (!D || te || re || ne) return;
    const $ = ++Xe.current;
    (le(!0), I(""));
    try {
      const Se = await ze(ta(D), {}, d);
      if (!De.current || Le.current || $ !== Xe.current) return;
      (b((Oe) => [
        ...Oe,
        ...Se.items.filter((ot) => !Oe.some((fl) => fl.id === ot.id)),
      ]),
        J(Se.nextCursor));
    } catch (Se) {
      De.current && $ === Xe.current && I($l(Se));
    } finally {
      De.current && $ === Xe.current && le(!1);
    }
  }
  async function la($) {
    if (!(we.current || Le.current || c.role !== "access_admin")) {
      ((we.current = !0), pe(!0), Ae(""), Ve(""), B(null));
      try {
        return await $();
      } catch (Se) {
        De.current && Ae($l(Se));
      } finally {
        ((we.current = !1), De.current && pe(!1));
      }
    }
  }
  function Gc(employee, provider = "telegram") {
    if (
      ne ||
      !(provider === "max" ? employee.canInviteMax : employee.canInvite)
    )
      return;
    dl();
    E(false);
    setTenderCreateOpen(false);
    setRecruiterCreateOpen(false);
    Ae("");
    Ve("");
    setInvitationProvider(provider);
    xe(employee);
    V("invite");
  }
  function na($) {
    (dl(), Ae(""), Ve(""), U($));
  }
  function Nt() {
    ((Le.current = !1), dl(), Ae(""), Ve(""), ee(($) => $ + 1));
  }
  async function Qc($) {
    if (
      ($.preventDefault(),
      !r?.demoCreationEnabled ||
        !se ||
        !r.roles.includes(se) ||
        !r.scopes.some((fl) => fl.id === H))
    )
      return;
    const Se = { role: se, scopeId: H, adaptationRequired: se !== "driver" && demoAdaptation },
      Oe = JSON.stringify(Se);
    O.current.payload !== Oe &&
      (O.current = { payload: Oe, key: crypto.randomUUID() });
    const ot = await la(() =>
      Ye(d, "/access/employees/demo", { ...Se, idempotencyKey: O.current.key }),
    );
    !ot ||
      !De.current ||
      Le.current ||
      ((O.current = { payload: "", key: "" }),
      E(!1),
      setDemoAdaptation(false),
      L(""),
      U(qo),
      ee((fl) => fl + 1),
      xe(ot),
      setPasswordPhone(""),
      V(ot.canIssuePassword ? "password" : null),
      Ve(
        `Тестовый профиль ${Bp(ot)} создан.${ot.canIssuePassword ? " Теперь можно выдать пароль для входа." : ""}`,
      ));
  }
  async function createTenderEmployee(event) {
    event.preventDefault();
    if (!r?.tenderCreationEnabled || !tenderName.trim() || !r.scopes.some(scope => scope.id === tenderScope)) return;
    const input = { displayName: tenderName.trim(), scopeId: tenderScope, adaptationRequired: tenderAdaptation };
    const payload = JSON.stringify(input);
    if (tenderCreationKey.current.payload !== payload) tenderCreationKey.current = { payload, key: crypto.randomUUID() };
    const employee = await la(() => Ye(d, "/access/employees/tender-specialist", { ...input, idempotencyKey: tenderCreationKey.current.key }));
    if (!employee || !De.current || Le.current) return;
    tenderCreationKey.current = { payload: "", key: "" };
    setTenderCreateOpen(false); setTenderName(""); setTenderAdaptation(false);
    L(""); U(qo); ee(value => value + 1); xe(employee); setPasswordPhone("");
    V(employee.canIssuePassword ? "password" : null);
    Ve("Тендерный специалист добавлен. Укажите телефон, чтобы выдать пароль для входа.");
  }
  function openRecruiterForm(employee = null) {
    if (ne || !r?.recruiterCreationEnabled) return;
    dl(); E(false); setTenderCreateOpen(false); Ae(""); Ve("");
    setExistingRecruiter(employee);
    setRecruiterAdaptation(false);
    const scopes = r.recruiterScopes.filter(scope => !employee?.scopes.some(existing => existing.id === scope.id));
    setRecruiterScope(scopes.length === 1 ? scopes[0].id : "");
    setRecruiterCreateOpen(true);
  }
  async function saveRecruiterEmployee(event) {
    event.preventDefault();
    if (!r?.recruiterCreationEnabled || !r.recruiterScopes.some(scope => scope.id === recruiterScope) || (!existingRecruiter && !recruiterName.trim())) return;
    const input = existingRecruiter
      ? { userId: existingRecruiter.id, scopeId: recruiterScope }
      : { displayName: recruiterName.trim(), scopeId: recruiterScope, adaptationRequired: recruiterAdaptation };
    const payload = JSON.stringify(input);
    if (recruiterCreationKey.current.payload !== payload) recruiterCreationKey.current = { payload, key: crypto.randomUUID() };
    const employee = await la(() => Ye(d, existingRecruiter ? "/access/employees/recruiter-scope" : "/access/employees/recruiter",
      existingRecruiter ? input : { ...input, idempotencyKey: recruiterCreationKey.current.key }));
    if (!employee || !De.current || Le.current) return;
    recruiterCreationKey.current = { payload: "", key: "" };
    setRecruiterCreateOpen(false); setRecruiterName(""); setRecruiterAdaptation(false);
    L(""); U({ ...qo, role: "recruiter" }); ee(value => value + 1); xe(employee); setPasswordPhone("");
    V(!existingRecruiter && employee.canIssuePassword ? "password" : null);
    Ve(existingRecruiter ? "Область работы добавлена. Сотрудник продолжает входить с прежним паролем." : "Рекрутер добавлен. Укажите телефон, чтобы выдать пароль для входа.");
    setExistingRecruiter(null);
  }
  async function si($) {
    if (($.preventDefault(), !canInviteEmployee(Y))) return;
    const Se = Y,
      Oe = W.trim();
    if (!ve || !/^[1-9]\d{0,15}$/.test(Oe) || Number(Oe) > 2 ** 52 - 1) {
      Ae(`Укажите проверенный числовой ${invitationLabel} ID сотрудника.`);
      return;
    }
    const ot = await la(() =>
      Ye(
        d,
        invitationProvider === "max"
          ? "/access/max-invitations"
          : "/access/invitations",
        {
          userId: Se.id,
          ...(invitationProvider === "max"
            ? { maxUserId: Oe }
            : { telegramUserId: Oe }),
        },
      ),
    );
    !ot ||
      !De.current ||
      Le.current ||
      (B({ invitation: ot, employee: Se, provider: invitationProvider }),
      V(null),
      he(""),
      oe(!1),
      b((fl) =>
        fl.map((Ht) =>
          Ht.id === Se.id
            ? {
                ...Ht,
                [invitationProvider === "max"
                  ? "maxInvitationPending"
                  : "invitationPending"]: true,
              }
            : Ht,
        ),
      ),
      Ve(
        `Приглашение для ${Se.displayName} создано. Передайте код сотруднику.`,
      ));
  }
  function ii($, Se) {
    if (we.current || Le.current || Qt.current || !$.canRevoke || $.id === c.id)
      return;
    const Oe = Object.freeze({ ...$ });
    ((Qt.current = Oe), (Dl.current = Se), dl(), E(!1), Ae(""), Ve(""));
    const ot = _n.current === Oe.id;
    (S(ot ? "Ответ не получен. Обновите список, чтобы проверить доступ." : ""),
      ie(ot),
      Te(!1),
      v(Oe));
  }
  function Fl() {
    ((Qt.current = null), v(null), S(""), ie(!1));
  }
  function Xc() {
    we.current || Fl();
  }
  function ci() {
    const $ = Dl.current;
    $?.isConnected
      ? $.focus({ preventScroll: !0 })
      : ol.current?.focus({ preventScroll: !0 });
  }
  async function Zc($) {
    const Se = Qt.current;
    if (!Se || we.current || Le.current || _ || _n.current === Se.id) return;
    ((we.current = !0), pe(!0), S(""));
    const Oe = new AbortController();
    Il.current = Oe;
    let ot = !1;
    const fl = window.setTimeout(() => {
      ((ot = !0), Oe.abort());
    }, 15e3);
    try {
      if (
        (await ze(
          `/access/users/${encodeURIComponent(Se.id)}/revoke`,
          {
            method: "POST",
            body: JSON.stringify({ reasonCode: $ }),
            signal: Oe.signal,
          },
          d,
        ),
        !De.current || Le.current)
      )
        return;
      ((Dl.current = null),
        Fl(),
        dl(),
        ee((Ht) => Ht + 1),
        (Rn.current = !0),
        Ve(
          `Доступ ${Bp(Se)} отозван. Сессии завершены, ожидающие приглашения отменены.`,
        ));
    } catch (Ht) {
      if (!De.current) return;
      if (ot || (Ht instanceof Ne && (Ht.status === 0 || Ht.status >= 500)))
        ((_n.current = Se.id),
          ie(!0),
          S("Ответ не получен. Обновите список, чтобы проверить доступ."));
      else {
        const sa = $l(Ht);
        (S(sa), Ht instanceof Ne && [403, 404].includes(Ht.status) && ie(!0));
      }
    } finally {
      (window.clearTimeout(fl),
        Il.current === Oe && (Il.current = null),
        (we.current = !1),
        De.current && pe(!1));
    }
  }
  if (c.role !== "access_admin") return null;
  const aa =
      r?.demoCreationEnabled && r.roles.length > 0 && r.scopes.length > 0,
    Wl = r?.scopes.find(($) => $.id === H);
  return n.jsxs("div", {
    className: "access-workspace",
    children: [
      n.jsxs("div", {
        className: "page-heading",
        children: [
          n.jsxs("div", {
            children: [
              n.jsx("span", {
                className: "eyebrow",
                children: "Администрирование",
              }),
              n.jsx("h1", { children: "Сотрудники" }),
              n.jsx("p", {
                children:
                  "Сотрудники, телефоны для входа и управление доступом.",
              }),
            ],
          }),
          n.jsxs("div", {
            className: "access-actions",
            children: [
              n.jsx("button", {
                className: "button secondary",
                type: "button",
                disabled: ne || te || re,
                onClick: Nt,
                children: "Обновить",
              }),
              r?.tenderCreationEnabled && r.scopes.length > 0 && n.jsx("button", {
                className: "button primary", type: "button", disabled: ne,
                onClick: () => { dl(); E(false); Ae(""); Ve(""); setRecruiterCreateOpen(false); setTenderAdaptation(false); setTenderCreateOpen(true); setTenderScope(current => r.scopes.some(scope => scope.id === current) ? current : r.scopes.length === 1 ? r.scopes[0].id : ""); },
                children: "Добавить тендерного специалиста",
              }),
              r?.recruiterCreationEnabled && n.jsx("button", {
                className: "button primary", type: "button", disabled: ne,
                onClick: () => openRecruiterForm(), children: "Добавить рекрутера",
              }),
              n.jsx(PlannerCreation, {
                options: r, token: d, disabled: ne, onExpired: f,
                onOpen: () => { dl(); E(false); setTenderCreateOpen(false); setRecruiterCreateOpen(false); Ae(""); Ve(""); },
                onCreated: employee => {
                  if (!De.current || Le.current) return;
                  L(""); U(qo); ee(value => value + 1); xe(employee); setPasswordPhone("");
                  V(employee.canIssuePassword ? "password" : null);
                  Ve(`${Xo[employee.role]} добавлен.${employee.canIssuePassword ? " Укажите телефон, чтобы выдать пароль для входа." : ""}`);
                },
              }),
              aa &&
                n.jsx("button", {
                  className: "button primary",
                  type: "button",
                  disabled: ne,
                  onClick: () => {
                    (dl(), Ae(""), Ve(""), setTenderCreateOpen(false), setRecruiterCreateOpen(false), setDemoAdaptation(false), E(!0));
                  },
                  children: "Добавить тестового сотрудника",
                }),
            ],
          }),
        ],
      }),
      r?.oneCStatus === "not_connected" &&
        n.jsxs("div", {
          className: "access-intro",
          children: [
            n.jsx("strong", { children: "Справочник 1С ещё не подключён" }),
            n.jsx("p", {
              children:
                "Сейчас показаны учётные записи этой системы. Тестовые профили отмечены отдельно; их имена и номера создаются автоматически.",
            }),
          ],
        }),
      n.jsx(Ot, { error: k }),
      recruiterCreateOpen && r?.recruiterCreationEnabled && n.jsxs("form", {
        className: "surface access-panel data-form", onSubmit: saveRecruiterEmployee,
        "aria-label": existingRecruiter ? "Добавить область рекрутеру" : "Добавить рекрутера",
        children: [
          n.jsxs("div", { className: "section-heading", children: [
            n.jsx("h2", { children: existingRecruiter ? "Добавить область рекрутеру" : "Добавить рекрутера" }),
            n.jsx("button", { type: "button", className: "button secondary", disabled: ne, onClick: () => setRecruiterCreateOpen(false), children: "Отмена" }),
          ] }),
          existingRecruiter && n.jsx(qc, { employee: existingRecruiter }),
          n.jsxs("div", { className: "form-grid", children: [
            !existingRecruiter && n.jsx(ue, { label: "Имя рекрутера", children: n.jsx("input", { value: recruiterName, onChange: event => setRecruiterName(event.target.value), required: true, maxLength: 160, disabled: ne, autoComplete: "name" }) }),
            n.jsx(ue, { label: "Область работы рекрутера", children: n.jsxs("select", { "aria-label": "Область работы рекрутера", value: recruiterScope, onChange: event => setRecruiterScope(event.target.value), required: true, disabled: ne, children: [
              n.jsx("option", { value: "", disabled: true, children: "Выберите область работы" }),
              ...r.recruiterScopes.filter(scope => !existingRecruiter?.scopes.some(existing => existing.id === scope.id)).map(scope => n.jsx("option", { value: scope.id, children: kp(scope) }, scope.id)),
            ] }) }),
          ] }),
          n.jsx("p", { className: "input-hint", children: existingRecruiter
            ? "Рекрутер получит доступ к подбору в выбранной области. Его учётная запись и пароль сохранятся."
            : "Рекрутер получит доступ к кандидатам и подбору в выбранной области. После создания укажите телефон для входа." }),
          !existingRecruiter && n.jsx(AdaptationEnrollment, { checked: recruiterAdaptation, onChange: setRecruiterAdaptation, disabled: ne }),
          n.jsxs("div", { className: "access-actions", children: [
            n.jsx("button", { className: "button primary", disabled: ne || (!existingRecruiter && !recruiterName.trim()) || !recruiterScope, children: ne ? "Сохраняем…" : existingRecruiter ? "Добавить область" : "Создать рекрутера" }),
            !existingRecruiter && n.jsx("button", { type: "button", className: "button secondary", disabled: ne, onClick: () => { setRecruiterCreateOpen(false); L(""); na({ ...qo, role: "recruiter", status: "active" }); Ve("Найдите рекрутера в списке и нажмите «Добавить область работы» в его карточке."); }, children: "Найти существующего рекрутера" }),
          ] }),
        ],
      }),
      tenderCreateOpen && r?.tenderCreationEnabled && n.jsxs("form", {
        className: "surface access-panel data-form", onSubmit: createTenderEmployee, "aria-label": "Добавить тендерного специалиста",
        children: [
          n.jsxs("div", { className: "section-heading", children: [
            n.jsx("h2", { children: "Добавить тендерного специалиста" }),
            n.jsx("button", { type: "button", className: "button secondary", disabled: ne, onClick: () => setTenderCreateOpen(false), children: "Отмена" }),
          ] }),
          n.jsxs("div", { className: "form-grid", children: [
            n.jsx(ue, { label: "Имя сотрудника", children: n.jsx("input", { value: tenderName, onChange: event => setTenderName(event.target.value), required: true, maxLength: 160, disabled: ne, autoComplete: "name" }) }),
            n.jsx(ue, { label: "Область работы", children: n.jsxs("select", { "aria-label": "Область работы", value: tenderScope, onChange: event => setTenderScope(event.target.value), required: true, disabled: ne, children: [
              n.jsx("option", { value: "", disabled: true, children: "Выберите область работы" }),
              ...r.scopes.map(scope => n.jsx("option", { value: scope.id, children: kp(scope) }, scope.id)),
            ] }) }),
          ] }),
          n.jsx("p", { className: "input-hint", children: "Сотруднику будет доступен раздел «Тендеры» в выбранной области. После создания укажите телефон для входа." }),
          n.jsx(AdaptationEnrollment, { checked: tenderAdaptation, onChange: setTenderAdaptation, disabled: ne }),
          n.jsx("button", { className: "button primary", disabled: ne || !tenderName.trim() || !tenderScope, children: ne ? "Создаём…" : "Создать сотрудника" }),
        ],
      }),
      r &&
        !r.demoCreationEnabled &&
        n.jsx("p", {
          className: "input-hint",
          children: "Создание тестовых профилей на этом сервере отключено.",
        }),
      r?.demoCreationEnabled &&
        !aa &&
        n.jsx("p", {
          className: "input-hint",
          children:
            "Для создания тестового профиля нужна доступная роль и назначенная область работы.",
        }),
      (F || at) &&
        n.jsx("div", {
          ref: An,
          tabIndex: -1,
          children: n.jsx(Ot, { error: F, success: at }),
        }),
      G &&
        aa &&
        n.jsxs("form", {
          ref: pt,
          className: "surface access-panel data-form",
          onSubmit: ($) => {
            Qc($);
          },
          tabIndex: -1,
          "aria-labelledby": "employee-create-title",
          children: [
            n.jsxs("div", {
              className: "section-heading",
              children: [
                n.jsxs("div", {
                  children: [
                    n.jsx("span", {
                      className: "eyebrow",
                      children: "Тестовая учётная запись",
                    }),
                    n.jsx("h2", {
                      id: "employee-create-title",
                      children: "Добавить сотрудника для демо",
                    }),
                    n.jsx("p", {
                      className: "muted",
                      children:
                        "Имя и номер тестового профиля создадутся автоматически.",
                    }),
                  ],
                }),
                n.jsx("button", {
                  className: "button secondary",
                  type: "button",
                  disabled: ne,
                  onClick: () => E(!1),
                  children: "Отмена",
                }),
              ],
            }),
            n.jsxs("div", {
              className: "form-grid",
              children: [
                n.jsx(ue, {
                  label: "Роль",
                  children: n.jsx("select", {
                    value: se,
                    onChange: ($) => { P($.target.value); if ($.target.value === "driver") setDemoAdaptation(false); },
                    disabled: ne,
                    required: !0,
                    children: r.roles.map(($) =>
                      n.jsx("option", { value: $, children: Xo[$] }, $),
                    ),
                  }),
                }),
                n.jsx(ue, {
                  label: "Область работы",
                  hint: Wl ? kp(Wl) : void 0,
                  children: n.jsxs("select", {
                    value: H,
                    onChange: ($) => fe($.target.value),
                    disabled: ne,
                    required: !0,
                    children: [
                      n.jsx("option", {
                        value: "",
                        disabled: !0,
                        children: "Выберите область работы",
                      }),
                      r.scopes.map(($) =>
                        n.jsx("option", { value: $.id, children: kp($) }, $.id),
                      ),
                    ],
                  }),
                }),
              ],
            }),
            n.jsx("p", {
              className: "input-hint",
              children:
                se === "recruiter"
                  ? "Рекрутер работает с кандидатами в выбранной области. Доступ к персональным данным передаётся только при наличии такого права у администратора. Доступ к финансам закрыт."
                  : "Профиль получает выбранную роль в одной области работы. Просмотр финансов и персональных данных для нового тестового профиля закрыт.",
            }),
            se !== "driver" && n.jsx(AdaptationEnrollment, { checked: demoAdaptation, onChange: setDemoAdaptation, disabled: ne }),
            n.jsx("button", {
              className: "button primary",
              disabled: ne || !se || !H,
              children: ne ? "Создаём…" : "Создать тестовый профиль",
            }),
          ],
        }),
      Y &&
        ae &&
        n.jsxs("section", {
          ref: Ee,
          className: "surface access-panel",
          tabIndex: -1,
          "aria-labelledby": "employee-action-title",
          children: [
            n.jsxs("div", {
              className: "section-heading",
              children: [
                n.jsxs("div", {
                  children: [
                    n.jsx("h2", {
                      id: "employee-action-title",
                      children:
                        ae === "password"
                          ? Y.phoneLoginEnabled
                            ? "Сбросить пароль"
                            : "Выдать доступ по телефону"
                          : `Пригласить в ${invitationLabel}`,
                    }),
                    n.jsx(qc, { employee: Y }),
                  ],
                }),
                n.jsx("button", {
                  className: "button secondary",
                  type: "button",
                  disabled: ne,
                  onClick: dl,
                  children: "К списку",
                }),
              ],
            }),
            ae === "password" &&
              n.jsxs("form", {
                className: "data-form",
                onSubmit: issueEmployeePassword,
                autoComplete: "off",
                "aria-busy": ne,
                children: [
                  Y.phoneMasked &&
                    n.jsx("p", {
                      className: "input-hint",
                      children: `Сейчас указан телефон ${Y.phoneMasked}. Для выдачи нового пароля введите полный номер.`,
                    }),
                  n.jsx(ue, {
                    label: "Телефон сотрудника",
                    hint: "Этот номер станет логином в браузере, Telegram и MAX.",
                    children: n.jsx("input", {
                      type: "tel",
                      inputMode: "tel",
                      autoComplete: "off",
                      value: passwordPhone,
                      maxLength: 40,
                      placeholder: "+7 900 123-45-67",
                      required: true,
                      disabled: ne,
                      onChange: (event) => setPasswordPhone(event.target.value),
                    }),
                  }),
                  n.jsx("p", {
                    className: "input-hint",
                    children:
                      Y.id === c.id
                        ? "Ваш прежний пароль и все ваши сессии будут завершены. Новый пароль появится на отдельном экране — сохраните его перед повторным входом."
                        : "Новый пароль заменит прежний. Активные сессии сотрудника завершатся. Пароль будет показан один раз.",
                  }),
                  n.jsx("button", {
                    className: "button primary",
                    disabled: ne || !passwordPhone.trim(),
                    children: ne
                      ? "Создаём пароль…"
                      : Y.phoneLoginEnabled
                        ? "Сбросить и показать новый пароль"
                        : "Выдать пароль",
                  }),
                ],
              }),
            ae === "invite" &&
              n.jsxs("form", {
                className: "data-form",
                onSubmit: ($) => {
                  si($);
                },
                autoComplete: "off",
                children: [
                  n.jsx(ue, {
                    label: `${invitationLabel} ID сотрудника`,
                    hint: "Числовой ID показан сотруднику на экране входа в мини-приложение.",
                    children: n.jsx("input", {
                      value: W,
                      onChange: ($) => {
                        (he($.target.value), oe(!1));
                      },
                      required: !0,
                      pattern: "[1-9][0-9]{0,15}",
                      maxLength: 16,
                      inputMode: "numeric",
                      disabled: ne,
                    }),
                  }),
                  n.jsxs("label", {
                    className: "checkbox-label",
                    children: [
                      n.jsx("input", {
                        type: "checkbox",
                        checked: ve,
                        onChange: ($) => oe($.target.checked),
                        disabled: ne,
                        required: !0,
                      }),
                      n.jsxs("span", {
                        children: [
                          `Я проверил, что этот аккаунт в ${invitationLabel} принадлежит `,
                          Y.displayName,
                          ".",
                        ],
                      }),
                    ],
                  }),
                  n.jsx("p", {
                    className: "input-hint",
                    children: `Код действует 24 часа только для этого аккаунта в ${invitationLabel}. Новое приглашение отменяет прежние неиспользованные коды сотрудника для этого мессенджера.`,
                  }),
                  n.jsx("button", {
                    className: "button primary",
                    disabled: ne || !ve || !canInviteEmployee(Y),
                    children: ne ? "Выполняем…" : "Создать приглашение",
                  }),
                ],
              }),
          ],
        }),
      passwordIssued &&
        n.jsx(IssuedPasswordCard, {
          credential: passwordIssued.credential,
          employee: passwordIssued.employee,
          onDone: () => setPasswordIssued(null),
        }),
      ce &&
        n.jsxs("section", {
          ref: st,
          className: "surface access-result",
          "aria-labelledby": "access-code-title",
          tabIndex: -1,
          children: [
            n.jsx("h2", {
              id: "access-code-title",
              children: `Код первого входа в ${ce.provider === "max" ? "MAX" : "Telegram"}`,
            }),
            n.jsx(qc, { employee: ce.employee }),
            n.jsxs("p", {
              children: ["Действует до ", et(ce.invitation.expiresAt), "."],
            }),
            n.jsx(ue, {
              label: "Одноразовый код приглашения",
              hint: "Выделите и скопируйте код. Сотрудник вводит его в мини-приложении при первом входе.",
              children: n.jsx("textarea", {
                readOnly: !0,
                value: ce.invitation.invitationToken,
                rows: 2,
                autoComplete: "off",
                spellCheck: !1,
                onFocus: ($) => $.currentTarget.select(),
              }),
            }),
            n.jsx("p", {
              className: "input-hint",
              children:
                "Код исчезнет при выборе другого сотрудника, обновлении списка или уходе из раздела. Скрытие кода не отменяет приглашение.",
            }),
            n.jsx("button", {
              className: "button secondary",
              type: "button",
              onClick: () => B(null),
              children: "Скрыть код",
            }),
          ],
        }),
      n.jsxs("section", {
        className: "employee-directory",
        "aria-labelledby": "employee-list-title",
        children: [
          n.jsxs("div", {
            className: "employee-list-heading",
            children: [
              n.jsx("h2", {
                ref: ol,
                tabIndex: -1,
                id: "employee-list-title",
                children: "Список сотрудников",
              }),
              n.jsxs("span", {
                children: [p.length, D ? "+" : "", " показано"],
              }),
            ],
          }),
          n.jsxs("form", {
            className: "employee-filters",
            onSubmit: ($) => {
              ($.preventDefault(), na({ ...j, search: y.trim() }));
            },
            children: [
              n.jsx(ue, {
                label: "Поиск",
                children: n.jsx("input", {
                  value: y,
                  onChange: ($) => L($.target.value),
                  maxLength: 80,
                  disabled: ne,
                  placeholder: "Имя или номер сотрудника",
                }),
              }),
              n.jsx(ue, {
                label: "Роль",
                children: n.jsxs("select", {
                  value: j.role,
                  disabled: ne,
                  onChange: ($) => na({ ...j, role: $.target.value }),
                  children: [
                    n.jsx("option", { value: "", children: "Все роли" }),
                    Object.entries(Xo).map(([$, Se]) =>
                      n.jsx("option", { value: $, children: Se }, $),
                    ),
                  ],
                }),
              }),
              n.jsx(ue, {
                label: "Доступ",
                children: n.jsxs("select", {
                  value: j.status,
                  disabled: ne,
                  onChange: ($) => na({ ...j, status: $.target.value }),
                  children: [
                    n.jsx("option", {
                      value: "all",
                      children: "Все сотрудники",
                    }),
                    n.jsx("option", { value: "active", children: "Активные" }),
                    n.jsx("option", {
                      value: "inactive",
                      children: "Неактивные",
                    }),
                  ],
                }),
              }),
              n.jsx("button", {
                className: "button secondary",
                disabled: ne || te,
                children: "Найти",
              }),
            ],
          }),
          n.jsx(Ot, { error: K || enterEmployeeError }),
          te
            ? n.jsxs("div", {
                className: "loading-state",
                role: "status",
                children: [
                  n.jsx("span", { className: "spinner" }),
                  "Загружаем сотрудников…",
                ],
              })
            : p.length > 0
              ? n.jsx("div", {
                  className: "employee-grid",
                  children: p.map(($) =>
                    n.jsxs(
                      "article",
                      {
                        className: `surface employee-card${Y?.id === $.id ? " employee-card-selected" : ""}`,
                        children: [
                          n.jsxs("div", {
                            className: "employee-card-top",
                            children: [
                              n.jsx(qc, { employee: $ }),
                              n.jsx("span", {
                                className: `employee-status ${$.active ? ($.approved ? "" : "employee-status-pending") : "employee-status-inactive"}`,
                                children: $.active
                                  ? $.approved
                                    ? "Активен"
                                    : "Не одобрен"
                                  : "Неактивен",
                              }),
                            ],
                          }),
                          n.jsxs("div", {
                            className: "employee-tags",
                            children: [
                              n.jsx("span", { children: Jg[$.sourceKind] }),
                              n.jsx("span", {
                                children: $.phoneLoginEnabled
                                  ? `Вход по телефону: ${$.phoneMasked || "настроен"}`
                                  : "Вход по телефону не настроен",
                              }),
                              $.id === c.id &&
                                n.jsx("span", { children: "Ваш профиль" }),
                            ],
                          }),
                          n.jsx("ul", {
                            className: "employee-scopes",
                            "aria-label": "Области работы",
                            children: $.scopes.map((Se) =>
                              n.jsxs(
                                "li",
                                {
                                  children: [
                                    n.jsx("strong", {
                                      children: Se.project.name,
                                    }),
                                    n.jsxs("span", {
                                      children: [
                                        Se.region.name,
                                        " · ",
                                        Se.responsibilityScope.name,
                                      ],
                                    }),
                                    n.jsx("small", {
                                      children: Se.legalEntity.name,
                                    }),
                                  ],
                                },
                                Se.id,
                              ),
                            ),
                          }),
                          $.role === "mechanic" && n.jsx(ChiefMechanicAccess, {
                            employee: $, token: d, onExpired: f,
                            onUpdated: employee => {
                              b(items => items.map(item => item.id === employee.id ? employee : item));
                              xe(selected => selected?.id === employee.id ? employee : selected);
                            },
                          }),
                          n.jsxs("div", {
                            className: "employee-card-actions",
                            children: [
                              n.jsx(PlanningAccess, {
                                employee: $, disabled: ne || re, onOpen: setPlanningEmployee,
                              }),
                              $.role === "recruiter" && $.active && $.approved && r?.recruiterScopes?.some(scope => !$.scopes.some(existing => existing.id === scope.id)) &&
                                n.jsx("button", { className: "button secondary", type: "button", disabled: ne || re,
                                  onClick: () => openRecruiterForm($), children: "Добавить область работы" }),
                              $.canImpersonate && !c.impersonation &&
                                n.jsx("button", {
                                  className: "button secondary",
                                  type: "button",
                                  disabled: ne || re || Boolean(enteringEmployee),
                                  onClick: () => enterEmployee($),
                                  children: enteringEmployee === $.id ? "Входим…" : "Войти как сотрудник",
                                }),
                              $.canIssuePassword &&
                                n.jsx("button", {
                                  className: "button primary",
                                  type: "button",
                                  disabled: ne || re,
                                  onClick: () => openPasswordForm($),
                                  children: $.phoneLoginEnabled
                                    ? "Сбросить пароль"
                                    : "Выдать доступ по телефону",
                                }),
                              $.canRevoke &&
                                $.id !== c.id &&
                                n.jsx("button", {
                                  className: "button secondary",
                                  type: "button",
                                  disabled: ne || re,
                                  onClick: (Se) => ii($, Se.currentTarget),
                                  children: "Отозвать доступ",
                                }),
                            ],
                          }),
                        ],
                      },
                      $.id,
                    ),
                  ),
                })
              : !K &&
                n.jsxs("div", {
                  className: "surface employee-empty",
                  children: [
                    n.jsx("strong", { children: "Сотрудники не найдены" }),
                    n.jsx("p", {
                      children:
                        j.search || j.role || j.status !== "all"
                          ? "Измените поиск или фильтры."
                          : aa
                            ? "Добавьте тестового сотрудника, чтобы проверить доступ по телефону и паролю."
                            : "В вашей области пока нет доступных сотрудников.",
                    }),
                    (j.search || j.role || j.status !== "all") &&
                      n.jsx("button", {
                        className: "button secondary",
                        type: "button",
                        disabled: ne,
                        onClick: () => {
                          (L(""), na(qo));
                        },
                        children: "Сбросить фильтры",
                      }),
                  ],
                }),
          K &&
            n.jsx("button", {
              className: "button secondary employee-load-more",
              type: "button",
              disabled: ne || te || re,
              onClick: Nt,
              children: "Повторить загрузку",
            }),
          D &&
            n.jsx("button", {
              className: "button secondary employee-load-more",
              type: "button",
              disabled: ne || te || re,
              onClick: () => {
                Fa();
              },
              children: re ? "Загружаем…" : "Показать ещё",
            }),
        ],
      }),
      planningEmployee && n.jsx(PlanningAccessEditor, {
        employee: planningEmployee, token: d, onExpired: f,
        onClose: () => setPlanningEmployee(null),
        onSaved: () => {
          ee(value => value + 1);
          Ve(`Настройки планирования для ${Bp(planningEmployee)} сохранены.`);
        },
      }),
      de &&
        n.jsx($g, {
          employee: de,
          busy: ne,
          error: m,
          blocked: _,
          identityHidden: ye,
          onConfirm: ($) => {
            Zc($);
          },
          onCancel: Xc,
          onRefresh: () => {
            we.current || ((Dl.current = null), Fl(), Nt());
          },
          restoreFocus: ci,
        }),
    ],
  });
}
function Wg(c) {
  if (!c || c.length > 16384) return null;
  try {
    const d = new URLSearchParams(c).getAll("user");
    if (d.length !== 1 || !d[0]) return null;
    const f = JSON.parse(d[0]);
    if (f === null || typeof f != "object" || Array.isArray(f)) return null;
    const r = f.id;
    return typeof r == "number" &&
      Number.isSafeInteger(r) &&
      r > 0 &&
      r <= 2 ** 52 - 1
      ? String(r)
      : null;
  } catch {
    return null;
  }
}
function Pg({ initData: c }) {
  const d = h.useRef(null),
    f = Wg(c);
  if (!f) return null;
  function r() {
    (d.current?.focus(), d.current?.select());
  }
  return n.jsxs("div", {
    className: "telegram-id-card",
    children: [
      n.jsx("label", {
        htmlFor: "telegram-display-id",
        children: `Ваш ${messengerLabel} ID`,
      }),
      n.jsxs("div", {
        className: "telegram-id-controls",
        children: [
          n.jsx("input", {
            ref: d,
            id: "telegram-display-id",
            type: "text",
            value: f,
            readOnly: !0,
            autoComplete: "off",
            spellCheck: !1,
            "aria-describedby": "telegram-id-hint",
            onFocus: (g) => g.currentTarget.select(),
          }),
          n.jsx("button", {
            className: "button secondary",
            type: "button",
            onClick: r,
            children: "Выделить",
          }),
        ],
      }),
      n.jsx("p", {
        id: "telegram-id-hint",
        className: "input-hint",
        children: "Передайте администратору для приглашения.",
      }),
    ],
  });
}
const ej = {
  document: n.jsx("path", { d: "M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h8" }),
  people: n.jsxs(n.Fragment, { children: [n.jsx("circle", { cx: "9", cy: "7", r: "3" }), n.jsx("path", { d: "M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3" })] }),
  truck: n.jsxs(n.Fragment, {
    children: [
      n.jsx("path", { d: "M3 5h11v12H3zM14 9h4l3 4v4h-7" }),
      n.jsx("circle", { cx: "7", cy: "18", r: "2" }),
      n.jsx("circle", { cx: "18", cy: "18", r: "2" }),
    ],
  }),
  arrow: n.jsx("path", { d: "M4 12h16m-6-6 6 6-6 6" }),
  refresh: n.jsxs(n.Fragment, {
    children: [
      n.jsx("path", { d: "M20 7v5h-5M4 17v-5h5" }),
      n.jsx("path", { d: "M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" }),
    ],
  }),
  shield: n.jsxs(n.Fragment, {
    children: [
      n.jsx("path", { d: "m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6z" }),
      n.jsx("path", { d: "m8 12 3 3 5-6" }),
    ],
  }),
  logout: n.jsx(n.Fragment, {
    children: n.jsx("path", { d: "M10 4H4v16h6m4-13 5 5-5 5m-6-5h11" }),
  }),
  pin: n.jsxs(n.Fragment, {
    children: [
      n.jsx("path", { d: "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" }),
      n.jsx("circle", { cx: "12", cy: "10", r: "2" }),
    ],
  }),
  chevron: n.jsx("path", { d: "m9 5 7 7-7 7" }),
  close: n.jsx("path", { d: "m6 6 12 12M6 18 18 6" }),
  route: n.jsxs(n.Fragment, {
    children: [
      n.jsx("circle", { cx: "5", cy: "5", r: "2" }),
      n.jsx("circle", { cx: "19", cy: "19", r: "2" }),
      n.jsx("path", { d: "M5 7v7a5 5 0 0 0 5 5h7M9 5h5a5 5 0 0 1 5 5v4" }),
    ],
  }),
};
function Rt({ name: c, className: d = "" }) {
  return n.jsx("svg", {
    className: `icon ${d}`,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    children: ej[c],
  });
}
const Wp = {
    driver: "Водитель",
    dispatcher: "Диспетчер",
    manager: "Менеджер",
    recruiter: "Рекрутер",
    tender_specialist: "Тендерный специалист",
    external_recruiter: "Внешний рекрутер",
    document_specialist: "Документовед",
    mechanic: "Механик",
    access_admin: "Администратор доступа",
    auditor: "Аудитор",
  },
  tj = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
function Pp(c) {
  const d = new Date(`${c.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? c : tj.format(d);
}
function lj(c) {
  if (!c) return "Время не задано";
  const d = new Date(c);
  return Number.isNaN(d.getTime())
    ? "Время не задано"
    : `${d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })} МСК`;
}
function $a(c) {
  return c instanceof Error
    ? c.message
    : "Не удалось выполнить запрос. Повторите попытку.";
}
function Hc({ compact: c = !1 }) {
  return n.jsxs("div", {
    className: `brand ${c ? "compact" : ""}`,
    children: [
      n.jsx("img", {
        className: "brand-logo",
        src: Cg,
        width: "210",
        height: "104",
        alt: "Единый центр логистики",
      }),
      !c &&
        n.jsx("span", {
          className: "brand-subtitle",
          children: "Операционная платформа",
        }),
    ],
  });
}
function ev({ enabled: c = !1 }) {
  return c
    ? n.jsxs("div", {
        className: "demo-banner",
        children: [
          n.jsx("span", { className: "demo-dot" }),
          " Локальная демонстрация · загружайте только обезличенные тестовые данные",
        ],
      })
    : null;
}
function nj({ mode, onSession, notice }) {
  const [phone, setPhone] = h.useState(rememberedPhone);
  const [password, setPassword] = h.useState("");
  const [showPassword, setShowPassword] = h.useState(false);
  const [rememberDevice, setRememberDevice] = h.useState(true);
  const [busy, setBusy] = h.useState(false);
  const [error, setError] = h.useState("");
  const [bridge, setBridge] = h.useState(getMessengerBridge());
  const [contactBusy, setContactBusy] = h.useState(false);
  const [contactNotice, setContactNotice] = h.useState("");
  const [demoProfiles, setDemoProfiles] = h.useState([]);
  const [demoId, setDemoId] = h.useState("");
  const mounted = h.useRef(true);
  const loginPending = h.useRef(false);
  const contactPending = h.useRef(false);
  const autoContactRequested = h.useRef(false);
  const phoneValue = h.useRef(phone);
  phoneValue.current = phone;
  h.useEffect(() => {
    mounted.current = true;
    el.demoProfiles()
      .then((result) => {
        if (!mounted.current || !result.enabled) return;
        const profiles = result.profiles.filter((profile) =>
          mode === "driver"
            ? profile.role === "driver"
            : profile.role !== "driver",
        );
        setDemoProfiles(profiles);
        setDemoId(profiles[0]?.id || "");
      })
      .catch(() => {});
    loadMessengerSdk()
      .then((sdk) => {
        if (mounted.current) setBridge(sdk);
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, [mode]);
  function applyPhone(candidate, initialValue) {
    const normalized = normalizeLoginPhone(candidate);
    if (
      !mounted.current ||
      !normalized ||
      !phoneHintCanApply(phoneValue.current, initialValue)
    )
      return false;
    phoneValue.current = normalized;
    setPhone(normalized);
    rememberPhone(normalized);
    return true;
  }
  async function getPhoneHint(sdk) {
    if (!sdk?.initData || messengerProvider === "browser") return null;
    try {
      return (
        (await el.phoneHint(messengerProvider, sdk.initData)).phone || null
      );
    } catch {
      return null;
    }
  }
  async function requestMessengerContact(sdk = bridge, automatic = false) {
    if (!sdk?.initData || !sdk.requestContact || contactPending.current) return;
    const initialValue = phoneValue.current;
    if (automatic && initialValue.trim()) return;
    contactPending.current = true;
    setContactBusy(true);
    setContactNotice("");
    try {
      if (messengerProvider === "max") {
        const result = await sdk.requestContact();
        if (
          !applyPhone(String(result?.phone || ""), initialValue) &&
          mounted.current &&
          !phoneValue.current
        )
          setContactNotice("Номер можно ввести вручную.");
      } else {
        const accepted = await new Promise((resolve) =>
          sdk.requestContact((ok) => resolve(Boolean(ok))),
        );
        if (accepted) {
          const deadline = Date.now() + 8000;
          do {
            const hint = await getPhoneHint(sdk);
            if (hint && applyPhone(hint, initialValue)) break;
            if (
              !mounted.current ||
              !phoneHintCanApply(phoneValue.current, initialValue)
            )
              break;
            await new Promise((resolve) => window.setTimeout(resolve, 700));
          } while (Date.now() < deadline);
        }
        if (mounted.current && !phoneValue.current)
          setContactNotice("Номер можно ввести вручную.");
      }
    } catch {
      if (mounted.current && !phoneValue.current)
        setContactNotice("Номер можно ввести вручную.");
    } finally {
      contactPending.current = false;
      if (mounted.current) setContactBusy(false);
    }
  }
  h.useEffect(() => {
    if (
      !bridge?.initData ||
      phoneValue.current.trim() ||
      autoContactRequested.current
    )
      return;
    autoContactRequested.current = true;
    const initialValue = phoneValue.current;
    getPhoneHint(bridge).then((hint) => {
      if (
        !mounted.current ||
        !phoneHintCanApply(phoneValue.current, initialValue)
      )
        return;
      if (hint && applyPhone(hint, initialValue)) return;
      requestMessengerContact(bridge, true);
    });
  }, [bridge]);
  async function signIn(event, demo = false) {
    event.preventDefault();
    if (loginPending.current) return;
    const normalized = normalizeLoginPhone(phone);
    if (!demo && !normalized) {
      setError(
        "Введите номер телефона с кодом страны, например +7 900 123-45-67.",
      );
      return;
    }
    if (!demo && !password) {
      setError("Введите пароль, выданный администратором.");
      return;
    }
    loginPending.current = true;
    setBusy(true);
    setError("");
    try {
      const session = demo
        ? await el.demoLogin(demoId)
        : await el.passwordLogin(normalized, password, rememberDevice);
      if (!mounted.current) return;
      if (!demo) rememberPhone(normalized);
      setPassword("");
      onSession(session, session.actor, demo);
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Ne && [400, 401].includes(failure.status)
            ? "Неверный телефон или пароль. Проверьте данные или обратитесь к администратору."
            : failure instanceof Ne && failure.status === 429
              ? "Слишком много попыток входа. Подождите немного и попробуйте снова."
              : $a(failure),
        );
    } finally {
      loginPending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return n.jsxs("div", {
    className: `app ${mode} login-app`,
    children: [
      n.jsx(ev, { enabled: demoProfiles.length > 0 }),
      n.jsxs("main", {
        className: "login-layout",
        children: [
          n.jsxs("section", {
            className: "login-intro",
            children: [
              n.jsx(Hc, {}),
              n.jsxs("div", {
                className: "intro-content",
                children: [
                  n.jsx("span", {
                    className: "eyebrow",
                    children:
                      mode === "driver"
                        ? "Кабинет водителя"
                        : "Единый центр логистики",
                  }),
                  n.jsxs("h1", {
                    children: [
                      "Рейсы под",
                      n.jsx("br", {}),
                      " ",
                      n.jsx("span", { children: "вашим контролем." }),
                    ],
                  }),
                  n.jsx("p", {
                    children:
                      "Рейсы, документы и расчёты в одном рабочем пространстве.",
                  }),
                  n.jsxs("div", {
                    className: "intro-regions",
                    "aria-label": "Регионы работы",
                    children: [
                      n.jsx("span", { children: "Москва" }),
                      n.jsx("span", { children: "Санкт-Петербург" }),
                      n.jsx("span", { children: "Регионы" }),
                    ],
                  }),
                ],
              }),
              n.jsxs("p", {
                className: "intro-footnote",
                children: [
                  n.jsx(Rt, { name: "shield" }),
                  " Доступ по роли и зоне ответственности",
                ],
              }),
            ],
          }),
          n.jsx("section", {
            className: "login-form-panel",
            "aria-label": "Вход",
            children: n.jsxs("div", {
              className: "login-form-content",
              children: [
                n.jsx("div", {
                  className: "login-theme",
                  children: n.jsx(Zp, {}),
                }),
                n.jsx("span", {
                  className: "eyebrow",
                  children: "Добро пожаловать",
                }),
                n.jsx("h2", { children: "Войти в кабинет" }),
                n.jsx("p", {
                  className: "muted",
                  children:
                    "Введите свой телефон и пароль, выданный администратором.",
                }),
                notice &&
                  n.jsx("div", {
                    className: "notice",
                    role: "status",
                    children: notice,
                  }),
                error &&
                  n.jsx("div", {
                    className: "error",
                    role: "alert",
                    children: error,
                  }),
                n.jsxs("form", {
                  className: "login-form phone-login-form",
                  onSubmit: signIn,
                  "aria-busy": busy,
                  children: [
                    n.jsx("label", {
                      htmlFor: "login-phone",
                      children: "Номер телефона",
                    }),
                    n.jsx("input", {
                      id: "login-phone",
                      name: "username",
                      type: "tel",
                      inputMode: "tel",
                      autoComplete: "username",
                      maxLength: 40,
                      placeholder: "+7 900 123-45-67",
                      required: true,
                      disabled: busy,
                      value: phone,
                      onChange: (event) => {
                        phoneValue.current = event.target.value;
                        setPhone(event.target.value);
                      },
                    }),
                    bridge?.initData &&
                      bridge?.requestContact &&
                      messengerProvider !== "browser" &&
                      n.jsx("button", {
                        className: "button secondary contact-phone-button",
                        type: "button",
                        disabled: busy || contactBusy,
                        onClick: () => requestMessengerContact(),
                        children: contactBusy
                          ? "Получаем номер…"
                          : `Подставить номер из ${messengerLabel}`,
                      }),
                    contactNotice &&
                      n.jsx("p", {
                        className: "input-hint",
                        role: "status",
                        children: contactNotice,
                      }),
                    n.jsx("label", {
                      htmlFor: "login-password",
                      children: "Пароль",
                    }),
                    n.jsxs("div", {
                      className: "password-input-row",
                      children: [
                        n.jsx("input", {
                          id: "login-password",
                          name: "password",
                          type: showPassword ? "text" : "password",
                          autoComplete: "current-password",
                          required: true,
                          maxLength: 256,
                          disabled: busy,
                          value: password,
                          onChange: (event) => setPassword(event.target.value),
                        }),
                        n.jsx("button", {
                          className: "button secondary",
                          type: "button",
                          disabled: busy,
                          "aria-label": showPassword
                            ? "Скрыть пароль"
                            : "Показать пароль",
                          "aria-pressed": showPassword,
                          onClick: () => setShowPassword(!showPassword),
                          children: showPassword ? "Скрыть" : "Показать",
                        }),
                      ],
                    }),
                    n.jsxs("label", {
                      className: "remember-device",
                      children: [
                        n.jsx("input", {
                          type: "checkbox",
                          checked: rememberDevice,
                          disabled: busy,
                          onChange: (event) =>
                            setRememberDevice(event.target.checked),
                        }),
                        n.jsx("span", {
                          children: "Запомнить вход на этом устройстве",
                        }),
                      ],
                    }),
                    n.jsx("p", {
                      className: "input-hint remember-device-hint",
                      children: "На общем устройстве снимите эту отметку.",
                    }),
                    n.jsxs("button", {
                      className: "button primary",
                      type: "submit",
                      disabled: busy || !phone.trim() || !password,
                      children: [
                        busy ? "Входим…" : "Войти",
                        n.jsx(Rt, { name: "arrow" }),
                      ],
                    }),
                    n.jsx("p", {
                      className: "input-hint",
                      children:
                        "Если доступа ещё нет или вы забыли пароль, обратитесь к администратору.",
                    }),
                  ],
                }),
                demoProfiles.length > 0 &&
                  n.jsxs("section", {
                    className: "demo-login-card",
                    children: [
                      n.jsx("h3", { children: "Попробуйте демо" }),
                      n.jsxs("form", {
                        onSubmit: (event) => signIn(event, true),
                        children: [
                          n.jsx("label", {
                            htmlFor: "demo-user",
                            children: "Войти как",
                          }),
                          n.jsx("select", {
                            id: "demo-user",
                            value: demoId,
                            disabled: busy,
                            onChange: (event) => setDemoId(event.target.value),
                            children: demoProfiles.map((profile) =>
                              n.jsx(
                                "option",
                                {
                                  value: profile.id,
                                  children: `${profile.displayName} · ${Wp[profile.role]}`,
                                },
                                profile.id,
                              ),
                            ),
                          }),
                          n.jsx("button", {
                            className: "button secondary",
                            disabled: busy || !demoId,
                            children: "Открыть демо",
                          }),
                        ],
                      }),
                    ],
                  }),
                n.jsxs("p", {
                  className: "login-security",
                  children: [
                    n.jsx(Rt, { name: "shield" }),
                    " Один кабинет в браузере, Telegram и MAX.",
                  ],
                }),
              ],
            }),
          }),
        ],
      }),
    ],
  });
}
function IssuedPasswordCard({ credential, employee, self = false, onDone }) {
  const resultRef = h.useRef(null);
  const manualCopyRef = h.useRef(null);
  const [manualCopy, setManualCopy] = h.useState(false);
  const [copyStatus, setCopyStatus] = h.useState("");
  const copyText = `Телефон: ${credential.phone}\nПароль: ${credential.password}`;
  h.useEffect(() => {
    if (manualCopy) {
      manualCopyRef.current?.focus();
      manualCopyRef.current?.select();
    }
  }, [manualCopy]);
  async function copyCredentials() {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(copyText);
      setCopyStatus("Данные для входа скопированы.");
    } catch {
      setManualCopy(true);
      setCopyStatus(
        "Автоматическое копирование недоступно. Выделите и скопируйте данные ниже.",
      );
    }
  }
  h.useEffect(() => {
    resultRef.current?.focus();
  }, [credential]);
  return n.jsxs("section", {
    ref: resultRef,
    className: "surface access-result data-form",
    tabIndex: -1,
    "aria-label": "Новый пароль",
    children: [
      n.jsx("h2", { children: "Новый пароль готов" }),
      employee && n.jsx(qc, { employee }),
      n.jsx("p", {
        className: "notice",
        children: self
          ? "Ваш прежний пароль и активные сессии больше не действуют. Сохраните новый пароль, затем войдите снова."
          : "Прежний пароль и активные сессии сотрудника больше не действуют. Передайте ему новые данные для входа.",
      }),
      n.jsx(ue, {
        label: "Телефон для входа",
        children: n.jsx("input", {
          readOnly: true,
          value: credential.phone,
          type: "tel",
          autoComplete: "off",
          onFocus: (event) => event.currentTarget.select(),
        }),
      }),
      n.jsx(ue, {
        label: "Новый пароль",
        hint: "Пароль показывается только сейчас. Выделите и скопируйте его до закрытия этого экрана.",
        children: n.jsx("input", {
          readOnly: true,
          value: credential.password,
          type: "text",
          autoComplete: "off",
          spellCheck: false,
          onFocus: (event) => event.currentTarget.select(),
        }),
      }),
      n.jsx("button", {
        className: "button secondary",
        type: "button",
        onClick: copyCredentials,
        children: "Скопировать данные для входа",
      }),
      copyStatus &&
        n.jsx("p", {
          className: "input-hint",
          role: "status",
          children: copyStatus,
        }),
      manualCopy &&
        n.jsx(ue, {
          label: "Данные для ручного копирования",
          children: n.jsx("textarea", {
            ref: manualCopyRef,
            readOnly: true,
            rows: 3,
            value: copyText,
            autoComplete: "off",
            spellCheck: false,
            onFocus: (event) => event.currentTarget.select(),
          }),
        }),
      n.jsx("button", {
        className: "button primary",
        type: "button",
        onClick: onDone,
        children: self ? "Сохранил пароль, перейти ко входу" : "Скрыть пароль",
      }),
    ],
  });
}
function tv() {
  return n.jsxs("span", {
    className: "status-badge",
    children: [n.jsx("span", {}), "Назначен"],
  });
}
function aj({ trip: c, selected: d, onSelect: f }) {
  return n.jsxs("button", {
    className: `trip-card ${d ? "selected" : ""}`,
    onClick: f,
    "aria-pressed": d,
    children: [
      n.jsxs("span", {
        className: "trip-card-top",
        children: [n.jsx("strong", { children: c.reference }), n.jsx(tv, {})],
      }),
      n.jsx("span", { className: "trip-date", children: Pp(c.businessDate) }),
      n.jsxs("span", {
        className: "trip-route",
        children: [
          n.jsx(Rt, { name: "pin" }),
          n.jsx("span", { children: c.routeSummary }),
        ],
      }),
      n.jsx(Gp, { progress: c.driverProgress, compact: !0 }),
      n.jsxs("span", {
        className: "trip-card-bottom",
        children: [
          n.jsxs("span", {
            children: [
              c.project.name,
              n.jsxs("span", {
                className: "trip-vehicle",
                children: [
                  c.vehicle.label,
                  " ·",
                  " ",
                  c.vehicle.bodyType === "refrigerated"
                    ? "Рефрижератор"
                    : "Фургон",
                ],
              }),
            ],
          }),
          n.jsx(Rt, { name: "chevron" }),
        ],
      }),
    ],
  });
}
function sj({
  token: c,
  actor: d,
  tripId: f,
  onClose: r,
  onExpired: g,
  onTripUpdated: p,
}) {
  const [b, D] = h.useState(null),
    [J, j] = h.useState(!1),
    [U, y] = h.useState(""),
    [L, M] = h.useState(0),
    ee = h.useRef(0),
    te = h.useRef(!1),
    R = h.useRef(!0);
  h.useEffect(
    () => (
      (R.current = !0),
      () => {
        ((R.current = !1), (ee.current += 1));
      }
    ),
    [],
  );
  async function re(le = !1) {
    if (!f) return;
    te.current ||= le;
    const K = ++ee.current;
    try {
      const I = await el.trip(c, f);
      if (!R.current || K !== ee.current) return;
      (D(I), y(""), te.current && ((te.current = !1), p(I)));
    } catch (I) {
      if (!R.current || K !== ee.current) return;
      I instanceof Ne && I.status === 401
        ? g()
        : (I instanceof Ne && [403, 404].includes(I.status) && D(null),
          y($a(I)));
    }
  }
  return (
    ai(re, !!f && !J),
    h.useEffect(() => {
      if ((D(null), y(""), !f)) return;
      const le = new AbortController(),
        K = ++ee.current;
      return (
        j(!0),
        el
          .trip(c, f, le.signal)
          .then((I) => {
            !le.signal.aborted && K === ee.current && D(I);
          })
          .catch((I) => {
            le.signal.aborted ||
              K !== ee.current ||
              (I instanceof Ne && I.status === 401 ? g() : y($a(I)));
          })
          .finally(() => {
            le.signal.aborted || j(!1);
          }),
        () => le.abort()
      );
    }, [c, f, L]),
    f
      ? n.jsxs("aside", {
          className: "detail-panel",
          "aria-label": "Детали рейса",
          children: [
            n.jsxs("div", {
              className: "detail-top",
              children: [
                n.jsx("span", {
                  className: "eyebrow",
                  children: "Карточка рейса",
                }),
                n.jsx("button", {
                  className: "icon-button",
                  onClick: r,
                  "aria-label": "Закрыть детали рейса",
                  children: n.jsx(Rt, { name: "close" }),
                }),
              ],
            }),
            J &&
              n.jsxs("div", {
                className: "loading-state",
                role: "status",
                children: [
                  n.jsx("span", { className: "spinner" }),
                  "Загружаем маршрут…",
                ],
              }),
            U &&
              n.jsxs("div", {
                className: "panel-message",
                children: [
                  n.jsx("div", {
                    className: "error",
                    role: "alert",
                    children: U,
                  }),
                  n.jsx("button", {
                    className: "button secondary",
                    onClick: () => M((le) => le + 1),
                    children: "Повторить",
                  }),
                ],
              }),
            b &&
              n.jsxs(n.Fragment, {
                children: [
                  n.jsxs("div", {
                    className: "detail-heading",
                    children: [
                      n.jsx("h2", { children: b.reference }),
                      n.jsx(tv, {}),
                      n.jsx("p", { children: Pp(b.businessDate) }),
                      n.jsx(Gp, { progress: b.driverProgress }),
                    ],
                  }),
                  n.jsx(
                    og,
                    {
                      token: c,
                      actor: d,
                      tripId: b.id,
                      tripScope: {
                        legalEntityId: b.legalEntity.id,
                        regionId: b.region.id,
                        projectId: b.project.id,
                        responsibilityScopeId: b.responsibilityScope.id,
                      },
                      onExpired: g,
                      onAttendanceChanged: () => {
                        re(!0);
                      },
                    },
                    b.id,
                  ),
                  n.jsxs("details", {
                    className: "route-details",
                    children: [
                      n.jsx("summary", {
                        children: "Маршрут, транспорт и область доступа",
                      }),
                      n.jsxs("dl", {
                        className: "detail-meta",
                        children: [
                          n.jsxs("div", {
                            children: [
                              n.jsx("dt", { children: "Проект" }),
                              n.jsx("dd", { children: b.project.name }),
                            ],
                          }),
                          n.jsxs("div", {
                            children: [
                              n.jsx("dt", { children: "Регион" }),
                              n.jsx("dd", { children: b.region.name }),
                            ],
                          }),
                          n.jsxs("div", {
                            children: [
                              n.jsx("dt", { children: "Юридическое лицо" }),
                              n.jsx("dd", { children: b.legalEntity.name }),
                            ],
                          }),
                          n.jsxs("div", {
                            children: [
                              n.jsx("dt", { children: "Зона ответственности" }),
                              n.jsx("dd", {
                                children: b.responsibilityScope.name,
                              }),
                            ],
                          }),
                        ],
                      }),
                      n.jsxs("section", {
                        className: "vehicle-section",
                        children: [
                          n.jsx("span", {
                            className: "section-icon",
                            children: n.jsx(Rt, { name: "truck" }),
                          }),
                          n.jsxs("div", {
                            children: [
                              n.jsx("h3", { children: b.vehicle.label }),
                              n.jsxs("p", {
                                children: [
                                  b.vehicle.bodyType === "refrigerated"
                                    ? "Рефрижератор"
                                    : "Промтоварный фургон",
                                  " ",
                                  "·",
                                  " ",
                                  new Intl.NumberFormat("ru-RU").format(
                                    b.vehicle.capacityKg,
                                  ),
                                  " ",
                                  "кг",
                                ],
                              }),
                              n.jsx("span", {
                                children:
                                  b.vehicle.fleetType === "own"
                                    ? "Собственный парк"
                                    : "Привлечённый парк",
                              }),
                            ],
                          }),
                        ],
                      }),
                      n.jsxs("section", {
                        className: "stops-section",
                        children: [
                          n.jsxs("h3", {
                            children: [
                              "Точки маршрута ",
                              n.jsx("span", { children: b.stops.length }),
                            ],
                          }),
                          b.stops.length
                            ? n.jsx("ol", {
                                className: "stops",
                                children: b.stops.map((le) =>
                                  n.jsxs(
                                    "li",
                                    {
                                      children: [
                                        n.jsx("span", {
                                          className: "stop-marker",
                                          children: le.sequence,
                                        }),
                                        n.jsxs("div", {
                                          children: [
                                            n.jsx("h4", { children: le.label }),
                                            n.jsx("p", {
                                              children: lj(le.plannedArrivalAt),
                                            }),
                                          ],
                                        }),
                                      ],
                                    },
                                    le.sequence,
                                  ),
                                ),
                              })
                            : n.jsx("p", {
                                className: "muted",
                                children: "Точки маршрута пока не заданы.",
                              }),
                        ],
                      }),
                    ],
                  }),
                  n.jsxs("div", {
                    className: "detail-footer",
                    children: [
                      n.jsx(Rt, { name: "shield" }),
                      " Просмотр · версия ",
                      b.version,
                    ],
                  }),
                ],
              }),
          ],
        })
      : n.jsxs("aside", {
          className: "detail-panel empty-detail",
          children: [
            n.jsx("div", {
              className: "empty-icon",
              children: n.jsx(Rt, { name: "route" }),
            }),
            n.jsx("h3", { children: "Детали рейса" }),
            n.jsxs("p", {
              children: [
                "Выберите рейс, чтобы посмотреть",
                n.jsx("br", {}),
                "транспорт и точки маршрута.",
              ],
            }),
          ],
        })
  );
}
const { PhotoPicker, PhotoPreview, LocalPhotoPreview } = createAttachmentPhotos({
  React: h,
  jsx: n,
  loadFile: loadTeamFile,
});
const { useInspectionAttention, InspectionAttention, ManagedInspectionPhoto } = createInspectionWorkflow(h, { request: ze, PhotoPreview });
const ChiefMechanicAccess = createChiefMechanicAccess({ React: h, jsx: n, request: ze });
const { PlannerCreation, PlanningAccess, PlanningAccessEditor } = createEmployeePlanningAccess({ React: h, jsx: n, request: ze });
const PlanningPanel = createPlanningPanel(h, { request: ze, download: Ho });
const FinanceLedgerWorkspace = createFinanceLedgerWorkspace(h, { request: ze, LegacyFinance: jg });
const onboardingPhotoComponents = createAttachmentPhotos({
  React: h,
  jsx: n,
  loadFile: async (token, path, options = {}) => {
    const response = await authenticatedFetch(path, options, token);
    if (!response.ok) throw new Ne(response.status, "Не удалось загрузить фотографию оформления.");
    return response.blob();
  },
});
const { OnboardingPanel, PublicOnboardingPanel } = createRecruitmentOnboarding(h, {
  request: ze,
  authenticatedFetch,
  ...onboardingPhotoComponents,
});
const RecruitmentPanel = createRecruitmentPanel(h, { request: ze, OnboardingPanel });
const TendersWorkspace = createTendersWorkspace(h, { request: ze });
const FleetOperationsWorkspace = createFleetOperationsWorkspace(h, { request: ze, authenticatedFetch });
const FleetDriverWorkspace = FleetOperationsWorkspace.Driver;
const DevelopmentWorkspace = createDevelopmentWorkspace(h, { request: ze });
const { DriverRequests, DriverCommunications } = createDriverRequests(h, { request: ze });
const TeamTasks = createTeamTasks(h, {request:ze});
const { TeamOutcomes } = createTeamOutcomes(h, {request:ze});
const { ProfileSettings, ProfileAvatar, ProfileCard, ProfileAccountButton } = createProfileUI(h, {request:ze});
const { useBirthdayReminders, BirthdayReminder, BirthdaysWorkspace } = createBirthdaysUI(h, { request: ze });
const TeamNotificationCenter = createTeamNotificationCenter(h, {request:ze});
const TeamWorkspace = createTeamWorkspace(h, { request: ze, download: Wy, loadFile: loadTeamFile, DriverRequests, TeamTasks, TeamOutcomes, ProfileAvatar, ProfileCard });
const NeuralSummary = createNeuralSummary(h, { request: ze, download: Wy, loadFile: loadTeamFile, DriverRequests, TeamTasks, TeamOutcomes, ProfileAvatar, ProfileCard });
const WorkOrderPriceAnalysis = createWorkOrderPriceAnalysis(h, { request: ze });
const NeuralWorkspace = createNeuralWorkspace(h, { request: ze, Summary: NeuralSummary, PriceAnalysis: WorkOrderPriceAnalysis });
const FleetMaintenanceWorkspace = createFleetMaintenanceWorkspace(h, { request: ze, authenticatedFetch, OperationsWorkspace: FleetOperationsWorkspace });
const RecruitmentReminder = createRecruitmentReminder(h, { request: ze });
const RecruitmentInvitationPanel = createRecruitmentInvitationPanel(h, {
  request: (path, ...args) => path === "/recruitment-invitations/accept"
    ? withDeviceAuthLock(() => ze(path, ...args))
    : ze(path, ...args),
});

const maxNotificationLinkRequests = new Map();
function linkMaxNotifications(token, actorId, initData, retry = false) {
  const launchHash = new URLSearchParams(initData).get("hash") || initData;
  const key = `${actorId}:${launchHash}`;
  if (retry) maxNotificationLinkRequests.delete(key);
  if (!maxNotificationLinkRequests.has(key)) {
    // MAX launch-data rejection is separate from the phone session. Never let
    // this endpoint's 401 clear an otherwise valid signed-in phone account.
    const pending = ze(
      "/notifications/max/link",
      { method: "POST", body: JSON.stringify({ initData }) },
      token,
      false,
    );
    maxNotificationLinkRequests.set(key, pending);
    const clear = () => {
      if (maxNotificationLinkRequests.get(key) === pending)
        maxNotificationLinkRequests.delete(key);
    };
    pending.then(clear, clear);
  }
  return maxNotificationLinkRequests.get(key);
}
function maxNotificationState(status) {
  if (!status)
    return {
      tone: "pending",
      title: "Проверяем уведомления MAX",
      description: "",
    };
  if (!status.enabled)
    return {
      tone: "muted",
      title: "Отправка в MAX выключена",
      description:
        "Уведомления доступны в кабинете. Для отправки в MAX обратитесь к администратору.",
    };
  if (!status.maxLinked)
    return {
      tone: "pending",
      title: "MAX ещё не подключён",
      description:
        "Откройте приложение через бота MAX и войдите по телефону, чтобы связать свой кабинет.",
    };
  if (!status.botStarted)
    return {
      tone: "pending",
      title: "Нужно запустить бота MAX",
      description:
        "Кабинет связан с MAX. Откройте бота и нажмите «Начать», чтобы он мог присылать сообщения.",
    };
  if (status.muted)
    return {
      tone: "muted",
      title: "Уведомления в боте выключены",
      description:
        "Откройте чат с ботом MAX и включите уведомления в настройках чата.",
    };
  return {
    tone: "ready",
    title: "Уведомления MAX подключены",
    description:
      "Важные сообщения могут приходить и при закрытом приложении. Подтверждайте их кнопкой в сообщении или здесь.",
  };
}
function openMaxNotificationBot(event, url) {
  if (
    messengerProvider === "max" &&
    window.WebApp?.initData &&
    window.WebApp.openMaxLink
  ) {
    event.preventDefault();
    window.WebApp.openMaxLink(url);
  }
}
function NotificationComposer({ token, onSent }) {
  const [scopes, setScopes] = h.useState([]);
  const [scopeId, setScopeId] = h.useState("");
  const [recipients, setRecipients] = h.useState([]);
  const [selected, setSelected] = h.useState([]);
  const [title, setTitle] = h.useState("");
  const [body, setBody] = h.useState("");
  const [loading, setLoading] = h.useState(true);
  const [busy, setBusy] = h.useState(false);
  const [error, setError] = h.useState("");
  const [success, setSuccess] = h.useState("");
  const pending = h.useRef(false);
  const idempotency = h.useRef({ payload: "", key: "" });
  const mounted = h.useRef(true);
  h.useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    ze("/notifications/scopes", { signal: controller.signal }, token)
      .then((result) => {
        if (controller.signal.aborted) return;
        setScopes(result.items);
        if (result.items.length === 1) setScopeId(result.items[0].id);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError($a(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [token]);
  h.useEffect(() => {
    setSelected([]);
    setRecipients([]);
    if (!scopeId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    ze(
      `/notifications/recipients?scopeId=${encodeURIComponent(scopeId)}`,
      { signal: controller.signal },
      token,
    )
      .then((result) => {
        if (!controller.signal.aborted) setRecipients(result.items);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError($a(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scopeId, token]);
  async function submit(event) {
    event.preventDefault();
    if (
      pending.current ||
      !scopeId ||
      !selected.length ||
      !title.trim() ||
      !body.trim()
    )
      return;
    const payload = {
      recipientIds: selected
        .filter((id) => recipients.some((person) => person.id === id))
        .sort(),
      responsibilityScopeId: scopeId,
      title: title.trim(),
      body: body.trim(),
    };
    if (!payload.recipientIds.length) return;
    const fingerprint = JSON.stringify(payload);
    if (idempotency.current.payload !== fingerprint)
      idempotency.current = { payload: fingerprint, key: crypto.randomUUID() };
    pending.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await Ye(token, "/notifications/messages", {
        ...payload,
        idempotencyKey: idempotency.current.key,
      });
      if (!mounted.current) return;
      setSuccess(
        `Уведомление передано в очередь: ${result.notificationIds?.length ?? payload.recipientIds.length}. Получатели увидят его в кабинете; доставка в MAX зависит от подключения и запуска бота.`,
      );
      setSelected([]);
      setTitle("");
      setBody("");
      idempotency.current = { payload: "", key: "" };
      onSent?.();
    } catch (failure) {
      if (mounted.current) setError($a(failure));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return n.jsxs("form", {
    className: "notification-composer data-form",
    onSubmit: submit,
    "aria-busy": busy || loading,
    children: [
      n.jsx("h3", { children: "Отправить уведомление" }),
      n.jsx(ue, {
        label: "Область работы",
        children: n.jsxs("select", {
          "aria-label": "Область работы",
          value: scopeId,
          required: true,
          disabled: busy,
          onChange: (event) => setScopeId(event.target.value),
          children: [
            n.jsx("option", { value: "", children: "Выберите область" }),
            scopes.map((scope) =>
              n.jsx(
                "option",
                {
                  value: scope.id,
                  children: [scope.projectName, scope.regionName, scope.name]
                    .filter(Boolean)
                    .join(" · "),
                },
                scope.id,
              ),
            ),
          ],
        }),
      }),
      loading &&
        n.jsx("p", {
          role: "status",
          className: "input-hint",
          children: "Загружаем сотрудников…",
        }),
      scopeId &&
        !loading &&
        n.jsxs("fieldset", {
          className: "notification-recipient-list",
          disabled: busy,
          children: [
            n.jsx("legend", {
              children: `Получатели: ${selected.length} из 50`,
            }),
            recipients.length
              ? recipients.map((person) =>
                  n.jsxs(
                    "label",
                    {
                      className: "notification-recipient",
                      children: [
                        n.jsx("input", {
                          type: "checkbox",
                          checked: selected.includes(person.id),
                          disabled:
                            !selected.includes(person.id) &&
                            selected.length >= 50,
                          onChange: (event) =>
                            setSelected((ids) =>
                              event.target.checked
                                ? [...ids, person.id]
                                : ids.filter((id) => id !== person.id),
                            ),
                        }),
                        n.jsxs("span", {
                          children: [
                            n.jsx("strong", { children: person.displayName }),
                            n.jsx("small", {
                              children: `${Wp[person.role] || person.role} · ${person.maxLinked ? "MAX связан" : "MAX не подключён"}`,
                            }),
                          ],
                        }),
                      ],
                    },
                    person.id,
                  ),
                )
              : n.jsx("p", {
                  className: "input-hint",
                  children: "В этой области нет доступных получателей.",
                }),
          ],
        }),
      selected.some((id) =>
        recipients.some((person) => person.id === id && !person.maxLinked),
      ) &&
        n.jsx("p", {
          className: "input-hint",
          children:
            "У части выбранных сотрудников MAX ещё не подключён. Уведомление сохранится в кабинете; отправка в MAX станет возможна после подключения и запуска бота.",
        }),
      n.jsx(ue, {
        label: "Заголовок",
        children: n.jsx("input", {
          "aria-label": "Заголовок",
          value: title,
          onChange: (event) => setTitle(event.target.value),
          maxLength: 120,
          required: true,
          disabled: busy,
        }),
      }),
      n.jsx(ue, {
        label: "Сообщение",
        children: n.jsx("textarea", {
          "aria-label": "Сообщение",
          value: body,
          onChange: (event) => setBody(event.target.value),
          maxLength: 2000,
          rows: 4,
          required: true,
          disabled: busy,
        }),
      }),
      (title.trim() || body.trim()) &&
        n.jsxs("section", {
          className: "notification-preview",
          "aria-label": "Предпросмотр уведомления",
          children: [
            n.jsx("span", { className: "eyebrow", children: "Предпросмотр" }),
            n.jsx("strong", { children: title.trim() || "Заголовок" }),
            n.jsx("p", { children: body.trim() }),
            n.jsx("small", {
              children: `Получатели: ${
                selected
                  .map(
                    (id) =>
                      recipients.find((person) => person.id === id)
                        ?.displayName,
                  )
                  .filter(Boolean)
                  .join(", ") || "не выбраны"
              }`,
            }),
          ],
        }),
      n.jsx(Ot, { error, success }),
      n.jsx("button", {
        className: "button primary",
        type: "submit",
        disabled:
          busy ||
          loading ||
          !scopeId ||
          !selected.length ||
          !title.trim() ||
          !body.trim(),
        children: busy
          ? "Отправляем…"
          : `Отправить выбранным (${selected.length})`,
      }),
    ],
  });
}
function MaxNotificationsPanel({ token, actor, session, onExpired }) {
  const [status, setStatus] = h.useState(null);
  const [items, setItems] = h.useState([]);
  const [open, setOpen] = h.useState(false);
  const [busy, setBusy] = h.useState(false);
  const [error, setError] = h.useState("");
  const [linkError, setLinkError] = h.useState("");
  const [ackId, setAckId] = h.useState(null);
  const [composer, setComposer] = h.useState(false);
  const [popoverTop, setPopoverTop] = h.useState(90);
  const mounted = h.useRef(true);
  const version = h.useRef(0);
  const ackPending = h.useRef(false);
  async function refreshStatus(link = false, retry = false) {
    const request = ++version.current;
    setBusy(true);
    setError("");
    try {
      const current = await ze("/notifications/status", {}, token);
      if (!mounted.current || request !== version.current) return;
      setStatus(current);
      if (link && !actor.impersonation && messengerProvider === "max") {
        const bridge = await loadMessengerSdk().catch(() => null);
        if (
          !mounted.current ||
          request !== version.current ||
          !bridge?.initData
        )
          return;
        try {
          const linked = await linkMaxNotifications(
            token,
            actor.id,
            bridge.initData,
            retry,
          );
          if (mounted.current && request === version.current) {
            setStatus(linked);
            setLinkError("");
          }
        } catch (failure) {
          if (mounted.current && request === version.current)
            setLinkError(
              failure instanceof Ne && failure.status === 409
                ? "Этот аккаунт MAX или кабинет уже связан с другим профилем. Обратитесь к администратору."
                : failure instanceof Ne && [400, 401].includes(failure.status)
                  ? "Откройте приложение через бота MAX заново, чтобы подключить уведомления."
                  : $a(failure),
            );
        }
      }
    } catch (failure) {
      if (!mounted.current || request !== version.current) return;
      if (failure instanceof Ne && failure.status === 401) onExpired?.();
      setError($a(failure));
    } finally {
      if (mounted.current && request === version.current) setBusy(false);
    }
  }
  async function loadItems() {
    try {
      const result = await ze("/notifications", {}, token);
      if (mounted.current) setItems(result.items);
    } catch (failure) {
      if (mounted.current) setError($a(failure));
    }
  }
  h.useEffect(() => {
    mounted.current = true;
    refreshStatus(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") refreshStatus();
    }, 60000);
    return () => {
      mounted.current = false;
      version.current += 1;
      window.clearInterval(timer);
    };
  }, [token, actor.id]);
  h.useEffect(() => {
    if (open) {
      refreshStatus();
      loadItems();
    }
  }, [open]);
  async function acknowledge(item) {
    if (ackPending.current || item.acknowledgedAt) return;
    ackPending.current = true;
    setAckId(item.id);
    setError("");
    try {
      const result = await Ye(
        token,
        `/notifications/${encodeURIComponent(item.id)}/ack`,
        {},
      );
      if (mounted.current) {
        setItems((rows) =>
          rows.map((row) =>
            row.id === item.id
              ? { ...row, acknowledgedAt: result.acknowledgedAt }
              : row,
          ),
        );
        refreshStatus();
      }
    } catch (failure) {
      if (mounted.current) setError($a(failure));
    } finally {
      ackPending.current = false;
      if (mounted.current) setAckId(null);
    }
  }
  const state = maxNotificationState(status);
  const botUrl =
    status?.botUrl || "https://max.ru/id890202734370_bot?start=notify";
  const canCompose = ["dispatcher", "access_admin"].includes(actor.role);
  const realMax =
    messengerProvider === "max" && Boolean(getMessengerBridge()?.initData);
  return n.jsxs("details", {
    className: "max-notifications",
    style: { "--notification-top": `${popoverTop}px` },
    onToggle: (event) => {
      setOpen(event.currentTarget.open);
      if (event.currentTarget.open)
        setPopoverTop(
          Math.round(event.currentTarget.getBoundingClientRect().bottom) + 10,
        );
    },
    children: [
      n.jsxs("summary", {
        className: "notification-summary",
        "aria-label": "Уведомления MAX",
        children: [
          n.jsxs("svg", {
            width: 20,
            height: 20,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.7,
            "aria-hidden": true,
            children: [
              n.jsx("path", {
                d: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
              }),
            ],
          }),
          n.jsx("span", { children: "MAX" }),
          status?.pending > 0 &&
            n.jsx("span", {
              className: "notification-count",
              children: status.pending,
            }),
        ],
      }),
      n.jsxs("section", {
        className: "notification-popover surface",
        "aria-label": "Уведомления",
        children: [
          n.jsxs("div", {
            className: "section-heading",
            children: [
              n.jsx("h2", { children: "Уведомления" }),
              n.jsx("button", {
                className: "button secondary",
                type: "button",
                disabled: busy,
                onClick: () => {
                  refreshStatus();
                  loadItems();
                },
                children: "Обновить",
              }),
            ],
          }),
          n.jsxs("div", {
            className: `notification-connection ${state.tone}`,
            children: [
              n.jsx("strong", { children: state.title }),
              state.description && n.jsx("p", { children: state.description }),
            ],
          }),
          (error || linkError) && n.jsx(Ot, { error: error || linkError }),
          !actor.impersonation && (!status?.maxLinked || !status.botStarted || status.muted) &&
            n.jsxs("div", {
              className: "action-row",
              children: [
                realMax &&
                  !status?.maxLinked &&
                  n.jsx("button", {
                    className: "button primary",
                    type: "button",
                    disabled: busy,
                    onClick: () => refreshStatus(true, true),
                    children: "Подключить уведомления MAX",
                  }),
                n.jsx("a", {
                  className: "button secondary",
                  href: botUrl,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  onClick: (event) => openMaxNotificationBot(event, botUrl),
                  children: status?.maxLinked
                    ? "Открыть бота MAX"
                    : "Подключить через бота MAX",
                }),
              ],
            }),
          status &&
            n.jsx("p", {
              className: "input-hint",
              children: `Ожидают подтверждения: ${status.pending || 0} · Подтверждено: ${status.acked || 0}${status.failed ? ` · Не доставлено: ${status.failed}` : ""}`,
            }),
          session?.rememberedDevice &&
            session.deviceCookieConfirmed !== false &&
            n.jsx("p", {
              className: "input-hint",
              children:
                session.deviceCookieConfirmed === null
                  ? "Вход запрошен для этого устройства, но его сохранение пока не подтверждено."
                  : "Вход сохранён на этом устройстве.",
            }),
          session?.rememberDeviceRequested &&
            session.deviceCookieConfirmed === false &&
            n.jsx("p", {
              className: "notice",
              role: "status",
              children:
                "Браузер не сохранил вход. После закрытия приложения может понадобиться пароль.",
            }),
          canCompose &&
            n.jsx("button", {
              className: "button secondary",
              type: "button",
              "aria-expanded": composer,
              onClick: () => setComposer(!composer),
              children: composer
                ? "Закрыть новое уведомление"
                : "Отправить уведомление",
            }),
          composer &&
            canCompose &&
            n.jsx(NotificationComposer, {
              token,
              onSent: () => {
                refreshStatus();
                loadItems();
              },
            }),
          n.jsx("h3", { children: "Последние сообщения" }),
          !items.length &&
            n.jsx("p", {
              className: "input-hint",
              children: "Новых сообщений пока нет.",
            }),
          n.jsx("div", {
            className: "notification-list",
            children: items.map((item) =>
              n.jsxs(
                "article",
                {
                  className: `notification-item${item.acknowledgedAt ? " acknowledged" : ""}`,
                  children: [
                    n.jsx("strong", { children: item.title }),
                    n.jsx("p", { children: item.body }),
                    n.jsx("small", {
                      children: `${et(item.createdAt)}${item.deliveryStatus === "failed" ? " · Не доставлено в MAX" : ""}`,
                    }),
                    item.acknowledgedAt
                      ? n.jsx("span", {
                          className: "input-hint",
                          children: "Подтверждено",
                        })
                      : n.jsx("button", {
                          className: "button primary",
                          type: "button",
                          disabled: Boolean(ackId),
                          onClick: () => acknowledge(item),
                          children:
                            ackId === item.id ? "Подтверждаем…" : "Подтвердить",
                        }),
                  ],
                },
                item.id,
              ),
            ),
          }),
        ],
      }),
    ],
  });
}

// Match the server's Team staff allowlist. Work location does not affect access.
const TEAM_STAFF_ROLES = new Set(["dispatcher", "manager", "recruiter", "tender_specialist", "document_specialist", "mechanic", "access_admin", "auditor"]);
const hasTeamAccess = (role) => TEAM_STAFF_ROLES.has(role);
const canUseOnboarding = (role) => ["manager", "dispatcher", "recruiter", "access_admin"].includes(role);

function ij({
  mode: c,
  session: d,
  actor: f,
  demo: r,
  onExpired: g,
  onLogout: p,
  onSelfPasswordReset,
  notice,
}) {
  const [b, D] = h.useState(
      canUseOnboarding(f.role) && (new URLSearchParams(window.location.search).get("section") === "onboarding" || (new URLSearchParams(window.location.search).get("section") === "recruitment" && new URLSearchParams(window.location.search).get("recruitmentTab") === "onboarding")) ? "onboarding" :
      new URLSearchParams(window.location.search).get("section") === "inspections" && ["driver", "mechanic", "dispatcher", "access_admin"].includes(f.role) ? "inspections" :
      new URLSearchParams(window.location.search).get("section") === "profile" ? "profile" :
      new URLSearchParams(window.location.search).get("section") === "finance" && ["access_admin", "manager", "auditor", "dispatcher", "document_specialist"].includes(f.role) && f.grants.some(grant => grant.financeVisible) ? "finance" :
      new URLSearchParams(window.location.search).get("section") === "neural" && hasTeamAccess(f.role) ? "neural" :
      new URLSearchParams(window.location.search).get("section") === "birthdays" && f.role === "access_admin" && !f.impersonation ? "birthdays" :
      new URLSearchParams(window.location.search).get("section") === "team" && hasTeamAccess(f.role)
        ? "team"
        : (new URLSearchParams(window.location.search).get("section") === "communications" && !["external_recruiter", "tender_specialist"].includes(f.role)) || (new URLSearchParams(window.location.search).get("section") === "team" && f.role === "driver")
        ? "communications"
        : new URLSearchParams(window.location.search).get("section") === "development" && f.role !== "external_recruiter"
        ? "development"
        : new URLSearchParams(window.location.search).get("section") === "fleet" && ["access_admin", "manager", "mechanic", "auditor"].includes(f.role) && f.grants.some(grant => grant.financeVisible)
        ? "fleet"
        : new URLSearchParams(window.location.search).get("section") === "fleet-driver" && f.role === "driver"
        ? "fleet-driver"
        :
      (f.role === "tender_specialist" || (new URLSearchParams(window.location.search).get("section") === "tenders" && f.role === "access_admin"))
        ? "tenders"
        : new URLSearchParams(window.location.search).get("section") === "planning" && ["manager", "dispatcher", "access_admin"].includes(f.role)
        ? "planning"
        : new URLSearchParams(window.location.search).get("section") === "recruitment" && ["manager", "dispatcher", "recruiter", "external_recruiter", "access_admin"].includes(f.role)
        ? "recruitment"
        : ["recruiter", "external_recruiter"].includes(f.role)
          ? "recruitment"
          : f.role === "access_admin"
        ? (f.impersonation ? "planning" : "access")
        : f.role === "mechanic"
          ? "inspections"
          : f.role === "auditor"
            ? "communications"
            : f.role === "manager"
              ? "planning"
              : "trips",
    ),
    [J, j] = h.useState(""),
    U = f.role === "dispatcher",
    y = ["driver", "dispatcher", "document_specialist"].includes(f.role),
    L = f.role === "access_admin" && !f.impersonation,
    canPlan = ["manager", "dispatcher", "access_admin"].includes(f.role),
    canRecruit = ["manager", "dispatcher", "recruiter", "external_recruiter", "access_admin"].includes(f.role),
    canOnboard = canUseOnboarding(f.role),
    canTender = ["tender_specialist", "access_admin"].includes(f.role),
    canDevelopment = f.role !== "external_recruiter",
    canTeam = hasTeamAccess(f.role),
    canFleet = ["access_admin", "manager", "mechanic", "auditor"].includes(f.role) && f.grants.some(grant => grant.financeVisible),
    M = ["driver", "mechanic", "dispatcher", "access_admin"].includes(f.role),
    ee =
      ["access_admin", "manager", "auditor", "dispatcher", "document_specialist"].includes(f.role) &&
      f.grants.some((_) => _.financeVisible),
    te = [
      ...(L ? [{ id: "access", label: "Сотрудники" }] : []),
      ...(L ? [{ id: "birthdays", label: "Поздравления" }] : []),
      ...(canFleet ? [{ id: "fleet", label: "Автопарк" }] : []),
      ...(f.role === "driver" ? [{ id: "fleet-driver", label: "Мой автомобиль" }] : []),
      ...(canTender ? [{ id: "tenders", label: "Тендеры" }] : []),
      ...(canPlan ? [{ id: "planning", label: "Планирование" }] : []),
      ...(canRecruit ? [{ id: "recruitment", label: "Рекрутинг" }] : []),
      ...(canOnboard ? [{ id: "onboarding", label: "Оформление" }] : []),
      ...(y ? [{ id: "trips", label: "Рейсы" }] : []),
      ...(M ? [{ id: "inspections", label: "Контрольный осмотр" }] : []),
      ...(f.role === "driver"
        ? [{ id: "payroll", label: "Моя зарплата" }]
        : []),
      ...(U ? [{ id: "create", label: "Добавить рейсы" }] : []),
      ...(ee ? [{ id: "finance", label: "Финансы и 1С" }] : []),
      ...(!["external_recruiter", "tender_specialist"].includes(f.role) ? [{ id: "communications", label: "Связь с отделами" }] : []),
      ...(canTeam ? [{ id: "team", label: "Команда" }] : []),
      ...(canTeam ? [{ id: "neural", label: "Нейросети" }] : []),
      { id:"profile", label:"Настройки" },
      ...(canDevelopment ? [{ id: "development", label: "Разработка" }] : []),
      ...(y ? [{ id: "guide", label: "Как проверить демо" }] : []),
    ],
    [R, re] = h.useState([]),
    [le, K] = h.useState(null),
    [I, k] = h.useState(null),
    [Z, G] = h.useState(!0),
    [E, se] = h.useState(!1),
    [P, H] = h.useState(""),
    [fe, Y] = h.useState(""),
    [xe, ae] = h.useState(!1),
    [V, W] = h.useState(0),
    [he, ve] = h.useState(null),
    oe = h.useRef(0),
    ce = h.useRef(!0);
  const birthdayReminders = useBirthdayReminders({ token: d.accessToken, actor: f, onExpired: g });
  const inspectionAttention = useInspectionAttention({ token: d.accessToken, actor: f, onExpired: g });
  h.useEffect(() => {
    const revealCurrentSection = () => {
      const navigation = document.querySelector(".mobile-navigation");
      const selected = navigation?.querySelector('[aria-current="page"]');
      if (!selected || !navigation.clientWidth) return;
      const bounds = selected.getBoundingClientRect();
      navigation.scrollLeft += bounds.left - navigation.getBoundingClientRect().left - (navigation.clientWidth - bounds.width) / 2;
    };
    revealCurrentSection();
    window.addEventListener("resize", revealCurrentSection);
    return () => window.removeEventListener("resize", revealCurrentSection);
  }, [b, inspectionAttention.count]);
  const planningDirty = h.useRef(false);
  const recruitmentDirty = h.useRef(false);
  const [onboardingCandidate, setOnboardingCandidate] = h.useState(null);
  h.useEffect(() => {
    if (b !== "onboarding" || !canOnboard) return;
    const url = new URL(window.location.href);
    url.searchParams.set("section", "onboarding");
    if (url.searchParams.get("recruitmentTab") === "onboarding") url.searchParams.delete("recruitmentTab");
    window.history.replaceState(null, "", url);
  }, [b, canOnboard]);
  const tendersDirty = h.useRef(false);
  const fleetDirty = h.useRef(false);
  const developmentDirty = h.useRef(false);
  const teamDirty = h.useRef(false);
  const neuralDirty = h.useRef(false);
  const profileDirty = h.useRef(false);
  const birthdaysDirty = h.useRef(false);
  const [teamNavigation, setTeamNavigation] = h.useState(null);
  const communicationsDirty = h.useRef(false);
  h.useEffect(() => {
    if (!canTeam && new URLSearchParams(window.location.search).get("section") === "team") {
      const url = new URL(window.location.href);
      url.searchParams.set("section", f.role === "driver" ? "communications" : f.role === "external_recruiter" ? "recruitment" : "profile");
      window.history.replaceState(null, "", url);
    }
  }, [f.role, canTeam]);
  const [adaptationLaunch, setAdaptationLaunch] = h.useState({ loading: canTeam, required: false, scopeId: "", error: "" });
  const [adaptationRetry, setAdaptationRetry] = h.useState(0);
  const adaptationChecked = h.useRef(false);
  h.useEffect(() => {
    if (!canTeam || adaptationChecked.current) return;
    const controller = new AbortController();
    setAdaptationLaunch(previous => ({ ...previous, loading: true, error: "" }));
    ze("/team/adaptation", { signal: controller.signal }, d.accessToken)
      .then(result => {
        if (controller.signal.aborted) return;
        adaptationChecked.current = true;
        const required = Boolean(result.required && !result.completed);
        setAdaptationLaunch({ loading: false, required, scopeId: result.scopeId || "", error: "" });
        if (required) {
          const url = new URL(window.location.href);
          url.searchParams.set("section", "team");
          window.history.replaceState(null, "", url);
          D("team");
        }
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        adaptationChecked.current = true;
        setAdaptationLaunch({ loading: false, required: false, scopeId: "", error: "Не удалось проверить программу адаптации. Повторите проверку." });
        if (error instanceof Ne && error.status === 401) g();
      });
    return () => controller.abort();
  }, [d.accessToken, f.id, f.role, adaptationRetry]);
  const [recruitmentTaskRequest, setRecruitmentTaskRequest] = h.useState(0);
  const [recruitmentReminderScope, setRecruitmentReminderScope] = h.useState("");
  function selectWorkspaceTab(next) {
    if (next === "team" && !canTeam) return false;
    if (next === "neural" && !canTeam) return false;
    if (next === "onboarding" && !canOnboard) return false;
    if (next === b) return true;
    if (birthdaysDirty.current && !window.confirm("В поздравлениях есть несохранённая дата рождения. Выйти без сохранения?")) return false;
    if (profileDirty.current && !window.confirm("В профиле есть несохранённые изменения. Выйти без сохранения?")) return false;
    if (communicationsDirty.current && !window.confirm("В обращениях есть неотправленный текст. Выйти без сохранения?")) return false;
    if (teamDirty.current && !window.confirm("В команде есть несохранённые изменения. Выйти без сохранения?")) return false;
    if (neuralDirty.current && !window.confirm("В нейросетях есть несохранённые изменения. Выйти без сохранения?")) return false;
    if (developmentDirty.current && !window.confirm("В разработке есть несохранённые изменения. Выйти без сохранения?")) return false;
    if (fleetDirty.current && !window.confirm("В автопарке есть несохранённая форма. Выйти без сохранения?")) return false;
    if (
      planningDirty.current &&
      !window.confirm(
        "В плане есть несохранённые изменения. Выйти без сохранения?",
      )
    )
      return false;
    if (recruitmentDirty.current && !window.confirm(b === "onboarding" ? "В оформлении есть несохранённые изменения. Выйти без сохранения?" : "В рекрутинге есть несохранённые изменения. Выйти без сохранения?")) return false;
    if (tendersDirty.current && !window.confirm("В тендерах есть несохранённые изменения. Выйти без сохранения?")) return false;
    planningDirty.current = false;
    recruitmentDirty.current = false;
    tendersDirty.current = false;
    fleetDirty.current = false;
    developmentDirty.current = false;
    teamDirty.current = false;
    neuralDirty.current = false;
    profileDirty.current = false;
    birthdaysDirty.current = false;
    communicationsDirty.current = false;
    setOnboardingCandidate(null);
    const workspaceUrl = new URL(window.location.href);
    if (workspaceUrl.searchParams.get("recruitmentTab") === "onboarding") workspaceUrl.searchParams.delete("recruitmentTab");
    if (["onboarding", "recruitment", "tenders", "fleet", "fleet-driver", "development", "team", "neural", "communications", "profile", "birthdays", "inspections"].includes(next)) workspaceUrl.searchParams.set("section", next);
    else {
      workspaceUrl.searchParams.delete("section");
      setRecruitmentTaskRequest(0);
      setRecruitmentReminderScope("");
    }
    window.history.replaceState(null, "", workspaceUrl);
    D(next);
    return true;
  }
  h.useEffect(
    () => (
      (ce.current = !0),
      () => {
        ((ce.current = !1), (oe.current += 1));
      }
    ),
    [],
  );
  function B(_) {
    ((oe.current += 1), re((ie) => ie.map((ye) => (ye.id === _.id ? _ : ye))));
  }
  function de(_) {
    if (_ instanceof Ne && _.status === 401) {
      g();
      return;
    }
    (_ instanceof Ne &&
      _.status === 403 &&
      (re([]), K(null), k(null), ve(null)),
      H($a(_)));
  }
  (h.useEffect(() => {
    if (!y) {
      G(!1);
      return;
    }
    const _ = new AbortController(),
      ie = ++oe.current;
    return (
      G(!0),
      H(""),
      el
        .trips(d.accessToken, null, _.signal)
        .then((ye) => {
          _.signal.aborted ||
            ie !== oe.current ||
            (re(ye.items),
            K(ye.nextCursor),
            ve(new Date()),
            k((Te) => (ye.items.some((ne) => ne.id === Te) ? Te : null)));
        })
        .catch((ye) => {
          _.signal.aborted || ie !== oe.current || de(ye);
        })
        .finally(() => {
          _.signal.aborted || G(!1);
        }),
      () => _.abort()
    );
  }, [d.accessToken, V, y]),
    ai(
      async () => {
        const _ = ++oe.current,
          ie = R.length;
        try {
          const ye = [];
          let Te = null;
          do {
            const ne = await el.trips(d.accessToken, Te);
            if (!ce.current || _ !== oe.current) return;
            (ye.push(...ne.items), (Te = ne.nextCursor));
          } while (Te && ye.length < ie);
          (re(ye), K(Te), ve(new Date()), H(""));
        } catch (ye) {
          ce.current && _ === oe.current && de(ye);
        }
      },
      y && b === "trips" && !Z && !E,
    ));
  async function v() {
    if (!le || E) return;
    (se(!0), H(""));
    const _ = ++oe.current;
    try {
      const ie = await el.trips(d.accessToken, le);
      if (!ce.current || _ !== oe.current) return;
      (re((ye) => [
        ...ye,
        ...ie.items.filter((Te) => !ye.some((ne) => ne.id === Te.id)),
      ]),
        K(ie.nextCursor),
        ve(new Date()));
    } catch (ie) {
      ce.current && _ === oe.current && de(ie);
    } finally {
      se(!1);
    }
  }
  async function m() {
    if (birthdaysDirty.current && !window.confirm("В поздравлениях есть несохранённая дата рождения. Выйти из кабинета без сохранения?")) return;
    if (communicationsDirty.current && !window.confirm("В обращениях есть неотправленный текст. Выйти из кабинета без сохранения?")) return;
    if (teamDirty.current && !window.confirm("В команде есть несохранённые изменения. Выйти из кабинета без сохранения?")) return;
    if (neuralDirty.current && !window.confirm("В нейросетях есть несохранённые изменения. Выйти из кабинета без сохранения?")) return;
    if (profileDirty.current && !window.confirm("В профиле есть несохранённые изменения. Выйти из кабинета без сохранения?")) return;
    if (developmentDirty.current && !window.confirm("В разработке есть несохранённые изменения. Выйти из кабинета без сохранения?")) return;
    if (tendersDirty.current && !window.confirm("В тендерах есть несохранённые изменения. Выйти из кабинета без сохранения?")) return;
    if (fleetDirty.current && !window.confirm("В автопарке есть несохранённая форма. Выйти из кабинета без сохранения?")) return;
    if (recruitmentDirty.current && !window.confirm(b === "onboarding" ? "В оформлении есть несохранённые изменения. Выйти из кабинета без сохранения?" : "В рекрутинге есть несохранённые изменения. Выйти из кабинета без сохранения?")) return;
    if (
      planningDirty.current &&
      !window.confirm(
        "В плане есть несохранённые изменения. Выйти из кабинета без сохранения?",
      )
    )
      return;
    (ae(!0), Y(""));
    try {
      if (f.impersonation) await returnToAdministrator();
      else (await el.logout(d.accessToken), p());
    } catch (_) {
      _ instanceof Ne && _.status === 401 ? g() : Y($a(_));
    } finally {
      ae(!1);
    }
  }
  if (adaptationLaunch.loading) return n.jsx("main", { className: "main-content", role: "status", children: "Загружаем рабочее пространство…" });
  const S = [...new Set(R.map((_) => _.region.name))];
  return n.jsxs("div", {
    className: `app ${c}`,
    children: [
      n.jsx(ev, { enabled: r }),
      f.impersonation && n.jsxs("section", {
        className: "impersonation-banner",
        role: "region",
        "aria-label": "Вход от имени сотрудника",
        children: [
          n.jsxs("div", { children: [
            n.jsx("strong", { children: `Вы вошли как ${f.displayName}` }),
            n.jsx("span", { children: "Действия выполняются в учётной записи сотрудника." }),
          ] }),
          n.jsx("button", {
            className: "button secondary",
            type: "button",
            onClick: m,
            disabled: xe,
            children: xe ? "Возвращаемся…" : "Вернуться в админку",
          }),
          fe && n.jsx("p", { role: "alert", children: fe }),
        ],
      }),
      n.jsxs("div", {
        className: "workspace-shell",
        children: [
          c === "office" &&
            n.jsxs("aside", {
              className: "sidebar",
              children: [
                n.jsx(Hc, { compact: !0 }),
                n.jsx("div", {
                  className: "sidebar-label",
                  children: "Операции",
                }),
                n.jsx("nav", {
                  className: "workspace-nav",
                  "aria-label": "Разделы",
                  children: te.map((_) =>
                    n.jsxs(
                      "button",
                      {
                        className: b === _.id ? "active-nav" : "nav-button",
                        onClick: () => selectWorkspaceTab(_.id),
                        "aria-current": b === _.id ? "page" : void 0,
                        children: [
                          n.jsx(Rt, {
                            name:
                              _.id === "onboarding" ? "document" :
                              (_.id === "recruitment" || _.id === "team" || _.id === "birthdays")
                                ? "people"
                                : _.id === "trips"
                                ? "truck"
                                : _.id === "finance" || _.id === "access"
                                  ? "shield"
                                  : "route",
                          }),
                          _.label,
                          _.id === "inspections" && inspectionAttention.count > 0 &&
                            n.jsx("span", { className: "ko-nav-count", "aria-label": `Требуют доработки: ${inspectionAttention.count}`, children: inspectionAttention.count }),
                          _.id === "birthdays" && birthdayReminders.pendingToday > 0 &&
                            n.jsx("span", { className: "birthdays-nav-count", "aria-label": `Ждут поздравления: ${birthdayReminders.pendingToday}`, children: birthdayReminders.pendingToday }),
                          _.id === "trips" &&
                            n.jsxs("span", {
                              children: [R.length, le ? "+" : ""],
                            }),
                        ],
                      },
                      _.id,
                    ),
                  ),
                }),
                n.jsxs("div", {
                  className: "sidebar-bottom",
                  children: [
                    n.jsx(Rt, { name: "shield" }),
                    n.jsxs("p", {
                      children: [
                        "Персональный доступ",
                        n.jsxs("span", {
                          children: [
                            f.grants.length,
                            " ",
                            f.grants.length === 1
                              ? "область доступа"
                              : "областей доступа",
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          n.jsxs("div", {
            className: "workspace",
            children: [
              n.jsxs("header", {
                className: "topbar",
                children: [
                  c === "driver"
                    ? n.jsx(Hc, { compact: !0 })
                    : n.jsxs("div", {
                        className: "office-header",
                        children: [
                          n.jsx("div", {
                            className: "mobile-brand",
                            children: n.jsx(Hc, { compact: !0 }),
                          }),
                          n.jsxs("div", {
                            className: "breadcrumb",
                            children: [
                              "ЕЦЛ",
                              n.jsx("span", { children: "/" }),
                              n.jsx("strong", {
                                children: te.find((_) => _.id === b)?.label,
                              }),
                            ],
                          }),
                        ],
                      }),
                  n.jsxs("div", {
                    className: "account",
                    children: [
                      n.jsx(Zp, {}),
                      !["external_recruiter", "tender_specialist"].includes(f.role) && n.jsx(MaxNotificationsPanel, {
                        token: d.accessToken,
                        actor: f,
                        session: d,
                        onExpired: g,
                      }),
                      canTeam && n.jsx(TeamNotificationCenter, {token:d.accessToken,actor:f,onExpired:g,onOpenConversation:target=>{if(selectWorkspaceTab("team"))setTeamNavigation({...target,nonce:crypto.randomUUID()});}}),
                      n.jsx(ProfileAccountButton, {token:d.accessToken,actor:f,onClick:()=>selectWorkspaceTab("profile")}),
                      n.jsxs("span", {
                        className: "account-info",
                        children: [
                          n.jsx("strong", { children: f.displayName }),
                          n.jsx("span", { children: Wp[f.role] }),
                        ],
                      }),
                      !f.impersonation && n.jsx("button", {
                        className: "icon-button logout-button",
                        onClick: () => {
                          m();
                        },
                        disabled: xe,
                        "aria-label": xe ? "Выходим…" : "Выйти из кабинета",
                        title: "Выйти из кабинета",
                        children: n.jsx(Rt, { name: "logout" }),
                      }),
                    ],
                  }),
                ],
              }),
              n.jsxs("main", {
                className: "main-content",
                children: [
                  n.jsx("nav", {
                    className: "mobile-navigation",
                    "aria-label": "Разделы",
                    children: te.map((_) =>
                      n.jsx(
                        "button",
                        {
                          "aria-current": b === _.id ? "page" : void 0,
                          onClick: () => selectWorkspaceTab(_.id),
                          children: [_.label, _.id === "inspections" && inspectionAttention.count > 0 &&
                            n.jsx("span", { className: "ko-nav-count", "aria-label": `Требуют доработки: ${inspectionAttention.count}`, children: inspectionAttention.count }), _.id === "birthdays" && birthdayReminders.pendingToday > 0 &&
                            n.jsx("span", { className: "birthdays-nav-count", "aria-label": `Ждут поздравления: ${birthdayReminders.pendingToday}`, children: birthdayReminders.pendingToday })],
                        },
                        _.id,
                      ),
                    ),
                  }),
                  notice && n.jsx("p", { className: "session-notice", role: "status", children: notice }),
                  L && b !== "birthdays" && n.jsx(BirthdayReminder, { count: birthdayReminders.pendingToday, onOpen: () => selectWorkspaceTab("birthdays") }),
                  adaptationLaunch.error && n.jsxs("div", { className: "error", role: "alert", children: [
                    n.jsx("p", { children: adaptationLaunch.error }),
                    n.jsx("button", { type: "button", className: "button secondary", onClick: () => {
                      if ([birthdaysDirty, profileDirty, teamDirty, neuralDirty, communicationsDirty, developmentDirty, fleetDirty, planningDirty, recruitmentDirty, tendersDirty].some(ref => ref.current)
                        && !window.confirm("Есть несохранённые изменения. Повторить проверку адаптации и перейти к инструкциям?")) return;
                      adaptationChecked.current = false; setAdaptationRetry(value => value + 1);
                    }, children: "Проверить адаптацию" }),
                  ] }),
                  canRecruit && n.jsx(RecruitmentReminder, {
                    token: d.accessToken,
                    onExpired: g,
                    onOpen: (scopeId) => {
                      if (selectWorkspaceTab("recruitment")) {
                        setRecruitmentReminderScope(scopeId || "");
                        setRecruitmentTaskRequest((value) => value + 1);
                      }
                    },
                  }),
                  fe && !f.impersonation &&
                    n.jsxs("div", {
                      className: "error",
                      role: "alert",
                      children: ["Выход не завершён. ", fe],
                    }),
                  b === "planning" &&
                    canPlan &&
                    n.jsx(PlanningPanel, {
                      token: d.accessToken,
                      actor: f,
                      onExpired: g,
                      onDirtyChange: (value) => {
                        planningDirty.current = value;
                      },
                    }),
                  ((b === "recruitment" && canRecruit) || (b === "onboarding" && canOnboard)) && n.jsx(RecruitmentPanel, {
                    key: b,
                    workspace: b,
                    initialCandidate: onboardingCandidate,
                    onOpenOnboarding: (candidate) => {
                      if (selectWorkspaceTab("onboarding")) setOnboardingCandidate(candidate);
                    },
                    token: d.accessToken,
                    actor: f,
                    onExpired: g,
                    taskRequest: b === "recruitment" ? recruitmentTaskRequest : 0,
                    reminderScopeId: recruitmentReminderScope,
                    onDirtyChange: (value) => { recruitmentDirty.current = value; },
                  }),
                  b === "tenders" && canTender && n.jsx(TendersWorkspace, {
                    token: d.accessToken, actor: f, onExpired: g,
                    onDirtyChange: (value) => { tendersDirty.current = value; },
                  }),
                  b === "profile" && n.jsx(ProfileSettings, {key:f.id,token:d.accessToken,actor:f,onExpired:g,canTeam,onDirtyChange:value=>{profileDirty.current=value;}}),
                  b === "birthdays" && L && n.jsx(BirthdaysWorkspace, { reminders: birthdayReminders, onDirtyChange: value => { birthdaysDirty.current = value; } }),
                  b === "neural" && canTeam && n.jsx(NeuralWorkspace, {
                    token: d.accessToken, actor: f, onExpired: g,
                    onDirtyChange: value => { neuralDirty.current = value; },
                    onNavigate: target => { if (selectWorkspaceTab("team")) setTeamNavigation({ ...target, nonce: crypto.randomUUID() }); },
                  }),
                  b === "team" && canTeam && n.jsx(TeamWorkspace, {
                    token: d.accessToken, actor: f, onExpired: g,
                    navigationRequest:teamNavigation,
                    initialTab: adaptationLaunch.required ? "adaptation" : undefined,
                    initialScopeId: adaptationLaunch.scopeId || undefined,
                    onAdaptationComplete: () => {
                      setAdaptationLaunch(previous => ({ ...previous, required: false }));
                      const url = new URL(window.location.href);
                      if (url.searchParams.get("section") === "team") { url.searchParams.delete("section"); window.history.replaceState(null, "", url); }
                    },
                    onDirtyChange: (value) => { teamDirty.current = value; },
                  }),
                  b === "development" && canDevelopment && n.jsx(DevelopmentWorkspace, {
                    token: d.accessToken, actor: f, onExpired: g,
                    onDirtyChange: (value) => { developmentDirty.current = value; },
                  }),
                  b === "fleet" && canFleet && n.jsx(FleetMaintenanceWorkspace, {
                    token: d.accessToken, actor: f, onExpired: g,
                    onDirtyChange: (value) => { fleetDirty.current = value; },
                  }),
                  b === "fleet-driver" && f.role === "driver" && n.jsx(FleetDriverWorkspace, {
                    token: d.accessToken, actor: f, onExpired: g,
                    onDirtyChange: (value) => { fleetDirty.current = value; },
                  }),
                  b === "create" &&
                    U &&
                    n.jsx(rg, {
                      token: d.accessToken,
                      actor: f,
                      onExpired: g,
                      onCreated: () => W((_) => _ + 1),
                    }),
                  b === "finance" &&
                    ee &&
                    n.jsx(FinanceLedgerWorkspace, { token: d.accessToken, actor: f, onExpired: g }),
                  b === "payroll" &&
                    f.role === "driver" &&
                    n.jsx(Eg, { token: d.accessToken, onExpired: g }),
                  b === "inspections" &&
                    M &&
                    n.jsx(Gg, { actor: f, token: d.accessToken, onExpired: g, attention: inspectionAttention }),
                  b === "communications" &&
                    (f.role === "driver" ? n.jsx(DriverCommunications, { actor: f, token: d.accessToken, onExpired: g, onDirtyChange: value => { communicationsDirty.current = value; } }) : n.jsx(Zg, { actor: f, token: d.accessToken, onExpired: g })),
                  b === "access" &&
                    L &&
                    n.jsx(
                      Fg,
                      {
                        actor: f,
                        token: d.accessToken,
                        onExpired: g,
                        onSelfPasswordReset,
                      },
                      f.id,
                    ),
                  b === "guide" &&
                    y &&
                    n.jsx(cj, { mode: c, onTrips: () => D("trips") }),
                  b === "trips" &&
                    y &&
                    n.jsxs(n.Fragment, {
                      children: [
                        n.jsxs("div", {
                          className: "page-heading",
                          children: [
                            n.jsxs("div", {
                              children: [
                                n.jsx("span", {
                                  className: "eyebrow",
                                  children:
                                    c === "driver"
                                      ? "Кабинет водителя"
                                      : "Диспетчерская",
                                }),
                                n.jsxs("h1", {
                                  children: [
                                    c === "driver"
                                      ? "Мои рейсы"
                                      : "Управление рейсами",
                                    n.jsxs("span", {
                                      className: "count-badge",
                                      children: [R.length, le ? "+" : ""],
                                    }),
                                  ],
                                }),
                                n.jsx("p", {
                                  children:
                                    c === "driver"
                                      ? "Назначения и детали маршрута"
                                      : "Доступные рейсы в вашей зоне ответственности",
                                }),
                              ],
                            }),
                            n.jsxs("button", {
                              className: "button refresh-button",
                              disabled: Z || E,
                              onClick: () => {
                                (k(null), W((_) => _ + 1));
                              },
                              children: [
                                n.jsx(Rt, { name: "refresh" }),
                                Z ? "Обновляем…" : "Обновить",
                              ],
                            }),
                          ],
                        }),
                        c === "office" &&
                          n.jsxs("div", {
                            className: "overview-grid",
                            children: [
                              n.jsxs("div", {
                                children: [
                                  n.jsx("span", {
                                    children: "Доступно рейсов",
                                  }),
                                  n.jsxs("strong", {
                                    children: [R.length, le ? "+" : ""],
                                  }),
                                  n.jsx("small", {
                                    children: "В вашей области ответственности",
                                  }),
                                ],
                              }),
                              n.jsxs("div", {
                                children: [
                                  n.jsx("span", { children: "Проекты" }),
                                  n.jsx("strong", {
                                    children: new Set(
                                      R.map((_) => _.project.id),
                                    ).size,
                                  }),
                                  n.jsx("small", {
                                    children:
                                      S.join(" · ") || "Согласно доступу",
                                  }),
                                ],
                              }),
                              n.jsxs("div", {
                                className: "overview-action",
                                children: [
                                  n.jsx("span", { children: "Следующий шаг" }),
                                  n.jsx("strong", {
                                    children: U
                                      ? "Добавьте данные"
                                      : "Проверьте документы",
                                  }),
                                  n.jsx("button", {
                                    className: "text-button",
                                    onClick: () =>
                                      U ? D("create") : k(R[0]?.id ?? null),
                                    children: U
                                      ? "Создать или загрузить рейсы →"
                                      : "Открыть первый рейс →",
                                  }),
                                ],
                              }),
                            ],
                          }),
                        n.jsxs("div", {
                          className: "scope-strip",
                          children: [
                            n.jsxs("span", {
                              children: [
                                n.jsx(Rt, { name: "shield" }),
                                "Доступ по вашей роли",
                              ],
                            }),
                            n.jsx("span", {
                              className: "scope-region",
                              children: S.length
                                ? S.join(" · ")
                                : "Регионы согласно назначенному доступу",
                            }),
                            he &&
                              n.jsxs("span", {
                                className: "last-loaded",
                                children: [
                                  "Загружено в",
                                  " ",
                                  he.toLocaleTimeString("ru-RU", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }),
                                ],
                              }),
                          ],
                        }),
                        n.jsxs("div", {
                          className: `trips-layout ${I ? "has-selection" : ""}`,
                          children: [
                            n.jsxs("section", {
                              className: "trips-list",
                              "aria-label": "Список рейсов",
                              children: [
                                n.jsxs("div", {
                                  className: "list-heading",
                                  children: [
                                    n.jsx("h2", {
                                      children:
                                        c === "driver"
                                          ? "Назначенные рейсы"
                                          : "Список рейсов",
                                    }),
                                    n.jsx("span", {
                                      children: "Плановая дата",
                                    }),
                                  ],
                                }),
                                n.jsx("div", {
                                  className: "trip-search",
                                  children: n.jsx("input", {
                                    "aria-label": "Поиск рейсов",
                                    value: J,
                                    onChange: (_) => j(_.target.value),
                                    placeholder:
                                      "Номер, маршрут, проект или водитель",
                                  }),
                                }),
                                P &&
                                  n.jsxs("div", {
                                    className: "panel-message",
                                    children: [
                                      n.jsxs("div", {
                                        className: "error",
                                        role: "alert",
                                        children: [
                                          P,
                                          R.length > 0 &&
                                            " Показаны ранее загруженные данные.",
                                        ],
                                      }),
                                      n.jsx("button", {
                                        className: "button secondary",
                                        disabled: Z,
                                        onClick: () => W((_) => _ + 1),
                                        children: "Повторить загрузку",
                                      }),
                                    ],
                                  }),
                                Z
                                  ? n.jsxs("div", {
                                      className: "loading-state",
                                      role: "status",
                                      children: [
                                        n.jsx("span", { className: "spinner" }),
                                        "Загружаем рейсы…",
                                      ],
                                    })
                                  : R.length === 0 && !P
                                    ? n.jsxs("div", {
                                        className: "empty-list",
                                        children: [
                                          n.jsx("div", {
                                            className: "empty-icon",
                                            children: n.jsx(Rt, {
                                              name: "truck",
                                            }),
                                          }),
                                          n.jsx("h3", {
                                            children: "Рейсов пока нет",
                                          }),
                                          n.jsxs("p", {
                                            children: [
                                              "Назначенные и доступные вам рейсы",
                                              n.jsx("br", {}),
                                              "появятся здесь после создания диспетчером.",
                                            ],
                                          }),
                                        ],
                                      })
                                    : n.jsx("div", {
                                        className: "trip-cards",
                                        children: R.filter((_) =>
                                          `${_.reference} ${_.routeSummary} ${_.project.name} ${_.driverProgress.map((ie) => ie.driver.name).join(" ")}`
                                            .toLocaleLowerCase("ru-RU")
                                            .includes(
                                              J.toLocaleLowerCase("ru-RU"),
                                            ),
                                        ).map((_) =>
                                          n.jsx(
                                            aj,
                                            {
                                              trip: _,
                                              selected: _.id === I,
                                              onSelect: () => k(_.id),
                                            },
                                            _.id,
                                          ),
                                        ),
                                      }),
                                !Z &&
                                  le &&
                                  n.jsx("div", {
                                    className: "pagination",
                                    children: n.jsx("button", {
                                      className: "button secondary",
                                      disabled: E,
                                      onClick: () => {
                                        v();
                                      },
                                      children: E
                                        ? "Загружаем…"
                                        : "Загрузить ещё",
                                    }),
                                  }),
                                !Z &&
                                  R.length > 0 &&
                                  n.jsxs("p", {
                                    className: "list-footnote",
                                    children: [
                                      "Показано ",
                                      R.length,
                                      le
                                        ? " · есть ещё рейсы"
                                        : " · все доступные рейсы",
                                      " · отметки обновляются каждые 20 секунд",
                                    ],
                                  }),
                              ],
                            }),
                            n.jsx(
                              sj,
                              {
                                token: d.accessToken,
                                actor: f,
                                tripId: I,
                                onClose: () => k(null),
                                onExpired: g,
                                onTripUpdated: B,
                              },
                              `${I ?? "empty"}-${V}`,
                            ),
                          ],
                        }),
                      ],
                    }),
                  n.jsxs("footer", {
                    className: "workspace-footer",
                    children: [
                      "ЕЦЛ · Единый центр логистики",
                      n.jsx("span", {
                        children:
                          "Данные доступны только авторизованным сотрудникам",
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
function cj({ mode: c, onTrips: d }) {
  return n.jsxs("section", {
    className: "demo-guide",
    children: [
      n.jsx("div", {
        className: "page-heading",
        children: n.jsxs("div", {
          children: [
            n.jsx("span", { className: "eyebrow", children: "Начните здесь" }),
            n.jsx("h1", { children: "Проверьте полный цикл" }),
            n.jsx("p", {
              children: "От назначения водителю до файла обмена с 1С",
            }),
          ],
        }),
      }),
      n.jsx("div", {
        className: "guide-grid",
        children: [
          [
            "01",
            "Диспетчер",
            "Создайте рейс или загрузите CSV",
            "Раздел «Добавить рейсы» содержит шаблон с нужными идентификаторами. Сначала проверьте файл, затем сохраните рейсы.",
          ],
          [
            "02",
            "Водитель",
            "Отметьтесь и передайте документы",
            "В кабинете водителя откройте рейс: примите заявку, отметьте выход и завершение. Диспетчер увидит водителя и время каждого этапа в списке рейсов. Загрузите накладную и путевой лист, заполните фактические показатели.",
          ],
          [
            "03",
            "Документовед",
            "Проверьте комплект и факт",
            "Выйдите и войдите как документовед. Откройте тот же рейс, примите оба документа и подтвердите факт. Для возврата укажите причину.",
          ],
          [
            "04",
            "Диспетчер или документовед",
            "Сверьте реестр",
            "Загрузите CSV в разделе «Финансы и 1С». Для DEMO-001 с 3 точками и без ожидания начальный тариф даёт 5 300 ₽. Устраните расхождения и подтвердите реестр.",
          ],
          [
            "05",
            "Программист 1С",
            "Проверьте файл обмена",
            "В разделе «Обмен с 1С» скачайте JSON. После настройки адаптера программист 1С согласует справочники, создаст документы и настроит квитанции.",
          ],
        ].map(([f, r, g, p]) =>
          n.jsxs(
            "article",
            {
              className: "surface guide-step",
              children: [
                n.jsx("span", { className: "guide-number", children: f }),
                n.jsx("span", { className: "eyebrow", children: r }),
                n.jsx("h2", { children: g }),
                n.jsx("p", { className: "muted", children: p }),
              ],
            },
            f,
          ),
        ),
      }),
      n.jsxs("section", {
        className: "surface data-form",
        children: [
          n.jsx("h2", { children: "Что важно знать о демо" }),
          n.jsx("p", {
            className: "muted",
            children:
              "Данные сохраняются на локальном сервере. Вход после обновления страницы потребуется повторить. Доступ зависит от роли, проекта и назначений водителю.",
          }),
          n.jsx("p", {
            className: "muted",
            children:
              "Используйте обезличенные документы: файлы хранятся в папке проекта, которая может синхронизироваться через OneDrive. Проверяются тип и сигнатура файла; антивирусная проверка в демо не подключена.",
          }),
          n.jsx("p", {
            className: "muted",
            children:
              "В демо реализован ручной ввод факта и тарифа. Автоматическая синхронизация с вашей 1С, Wialon и распознавание документов требуют подключения и проверки.",
          }),
          n.jsxs("div", {
            className: "action-row",
            children: [
              n.jsx("button", {
                className: "button primary",
                onClick: d,
                children: "Открыть рейсы",
              }),
              n.jsx("a", {
                className: "button secondary",
                href:
                  c === "driver"
                    ? "http://127.0.0.1:5174"
                    : "http://127.0.0.1:5173",
                target: "_blank",
                rel: "noreferrer",
                children:
                  c === "driver"
                    ? "Открыть офисный кабинет"
                    : "Открыть кабинет водителя",
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
function readOnboardingToken() {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return fragment.has("onboarding") ? fragment.get("onboarding") : null;
}
function readRecruitmentInvitation() {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return fragment.has("recruitment-invite") ? fragment.get("recruitment-invite") : null;
}
function clearRecruitmentInvitationUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.set("section", "recruitment");
  window.history.replaceState(null, "", url);
}
function uj({ mode: c }) {
  const [invitationToken, setInvitationToken] = h.useState(readRecruitmentInvitation);
  const [onboardingToken, setOnboardingToken] = h.useState(readOnboardingToken);
  const [session, setSession] = h.useState(null);
  const [actor, setActor] = h.useState(null);
  const [notice, setNotice] = h.useState("");
  const [demo, setDemo] = h.useState(false);
  const [restoring, setRestoring] = h.useState(true);
  const [selfCredential, setSelfCredential] = h.useState(null);
  const [restoreError, setRestoreError] = h.useState("");
  const [restoreAttempt, setRestoreAttempt] = h.useState(0);
  const restorePromise = h.useRef(null);
  const viewIdentity = h.useRef(null);
  function applySession(next) {
    setNotice(sessionNotice);
    if (next) {
      if (viewIdentity.current?.actorId !== next.actor.id)
        viewIdentity.current = {
          actorId: next.actor.id,
          token: next.accessToken,
        };
      setSession(next);
      setActor(next.actor);
    } else {
      viewIdentity.current = null;
      setSession(null);
      setActor(null);
    }
  }
  function clearSession(message) {
    deactivateSession();
    applySession(null);
    setNotice(message);
  }
  h.useEffect(() => subscribeSession(applySession), []);
  h.useEffect(() => {
    const read = () => {
      const nextInvitationToken = readRecruitmentInvitation();
      const nextOnboardingToken = readOnboardingToken();
      if (nextInvitationToken !== null || nextOnboardingToken !== null) invalidateSessionWork();
      setOnboardingToken(nextOnboardingToken);
      restorePromise.current = null;
      setInvitationToken(nextInvitationToken);
    };
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  h.useEffect(() => {
    if (invitationToken !== null || onboardingToken !== null) {
      setRestoring(false);
      setRestoreError("");
      return;
    }
    let active = true;
    setRestoring(true);
    setRestoreError("");
    restorePromise.current ??= restoreSession();
    restorePromise.current
      .then((restored) => {
        if (active) applySession(restored);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof Ne && [401, 403].includes(error.status))
          clearSession("Сессия завершена. Войдите по телефону и паролю.");
        else setRestoreError($a(error));
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [restoreAttempt, invitationToken, onboardingToken]);
  h.useEffect(() => {
    if (!session || invitationToken !== null || onboardingToken !== null) return;
    let stopped = false;
    let timer;
    const renew = async () => {
      if (stopped) return;
      if (session.actor.impersonation) {
        try {
          await returnToAdministrator("Вход в учётную запись сотрудника завершён. Вы вернулись в админку.");
        } catch (error) {
          if (!stopped) {
            setNotice($a(error));
            timer = window.setTimeout(renew, 15000);
          }
        }
        return;
      }
      if (session.rememberedDevice === false) {
        if (Date.parse(session.expiresAt) <= Date.now())
          clearSession("Сессия завершена. Войдите снова.");
        return;
      }
      try {
        await refreshAccessSession(session.actor.id);
      } catch (error) {
        if (stopped || (activeSession && activeSession.actor.id !== session.actor.id)) return;
        if (error instanceof Ne && [401, 403].includes(error.status))
          clearSession("Сохранённый вход завершён. Войдите снова.");
        else timer = window.setTimeout(renew, 15000);
      }
    };
    const advance = session.actor.impersonation || session.rememberedDevice === false ? 0 : 60000;
    timer = window.setTimeout(
      renew,
      Math.max(
        0,
        Math.min(
          Date.parse(session.expiresAt) - Date.now() - advance,
          2147483647,
        ),
      ),
    );
    const wake = () => {
      if (
        document.visibilityState !== "hidden" &&
        Date.parse(session.expiresAt) - Date.now() <= advance
      ) {
        window.clearTimeout(timer);
        renew();
      }
    };
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [session, invitationToken, onboardingToken]);
  h.useEffect(() => {
    // Invitation tokens stay in the URL fragment until accepted/cancelled;
    // do not load third-party SDKs while the registration screen is open.
    if (invitationToken === null && onboardingToken === null) loadMessengerSdk().catch(() => {});
  }, [invitationToken, onboardingToken]);
  async function recoverSession() {
    // An unmounted workspace may finish a request after the identity changed.
    if (activeSession && activeSession.actor.id !== session?.actor.id) return;
    if (session?.actor.impersonation) {
      try {
        await returnToAdministrator("Вход в учётную запись сотрудника завершён. Вы вернулись в админку.");
      } catch (error) {
        setNotice($a(error));
      }
      return;
    }
    try {
      await refreshAccessSession(actor?.id);
    } catch (error) {
      if (activeSession && activeSession.actor.id !== session?.actor.id) return;
      if (error instanceof Ne && [401, 403].includes(error.status))
        clearSession("Сессия завершена. Войдите снова.");
    }
  }
  if (onboardingToken !== null)
    return n.jsx(PublicOnboardingPanel, {
      onboardingToken,
      onCancel: () => {
        const url = new URL(window.location.href);
        url.hash = "";
        window.history.replaceState(null, "", url);
        restorePromise.current = null;
        setRestoring(true);
        setOnboardingToken(null);
      },
    }, onboardingToken);
  if (invitationToken !== null)
    return n.jsx(RecruitmentInvitationPanel, {
      invitationToken,
      onAuthenticated: (issued, phone) => {
        const next = { ...issued, rememberedDevice: false, deviceCookieConfirmed: false };
        // Acceptance clears the old remembered cookie server-side. Never carry
        // an administrator identity or an in-flight refresh into this account.
        deactivateSession();
        sessionNotice = "";
        setDemo(false);
        setNotice("");
        setSelfCredential(null);
        setRestoreError("");
        restorePromise.current = Promise.resolve(next);
        clearRecruitmentInvitationUrl();
        setInvitationToken(null);
        setRestoring(false);
        rememberPhone(phone);
        activateSession(next);
      },
      onCancel: () => {
        clearRecruitmentInvitationUrl();
        restorePromise.current = null;
        setRestoring(true);
        setInvitationToken(null);
      },
    }, invitationToken);
  if (selfCredential)
    return n.jsx("main", {
      className: "app login-app",
      children: n.jsx("div", {
        className: "self-password-result",
        children: n.jsx(IssuedPasswordCard, {
          credential: selfCredential,
          self: true,
          onDone: () => setSelfCredential(null),
        }),
      }),
    });
  if (restoring || restoreError)
    return n.jsx("main", {
      className: "app login-app",
      "aria-busy": restoring,
      children: n.jsxs("section", {
        className: "surface data-form",
        style: { maxWidth: "32rem", margin: "10vh auto", padding: "2rem" },
        children: [
          n.jsx(Hc, {}),
          n.jsx("p", {
            role: restoreError ? "alert" : "status",
            children: restoreError || "Проверяем доступ…",
          }),
          restoreError &&
            n.jsx("button", {
              className: "button primary",
              type: "button",
              children: "Повторить проверку",
              onClick: () => {
                restorePromise.current = null;
                setRestoreAttempt((value) => value + 1);
              },
            }),
        ],
      }),
    });
  return session && actor
    ? n.jsx(
        ij,
        {
          mode: c,
          session: {
            ...session,
            accessToken: viewIdentity.current?.token || session.accessToken,
          },
          actor,
          demo,
          notice,
          onExpired: recoverSession,
          onLogout: () => clearSession("Вы вышли из кабинета."),
          onSelfPasswordReset: (credential) => {
            rememberPhone(credential.phone);
            setSelfCredential(credential);
            clearSession("Пароль изменён. Войдите с новым паролем.");
          },
        },
        `${actor.id}:${actor.role}`,
      )
    : n.jsx(nj, {
        mode: c,
        notice,
        onSession: (newSession, newActor, isDemo) => {
          sessionNotice = "";
          setDemo(isDemo);
          setNotice("");
          activateSession(
            isDemo ? { ...newSession, rememberedDevice: false } : newSession,
            !isDemo,
          );
        },
      });
}
Fy.createRoot(document.getElementById("root")).render(
  n.jsx(h.StrictMode, { children: n.jsx(uj, { mode: "office" }) }),
);
