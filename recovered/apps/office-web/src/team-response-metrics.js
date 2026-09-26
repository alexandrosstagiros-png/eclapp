const duration = (seconds) => {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return "< 1 мин";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  if (hours < 24) return `${hours} ч${rest ? ` ${rest} мин` : ""}`;
  return `${Math.floor(hours / 24)} д${hours % 24 ? ` ${hours % 24} ч` : ""}`;
};

export function createTeamResponseMetrics(React) {
  const { createElement: h, useState, useEffect, useRef } = React;
  return function TeamResponseMetrics({
    api,
    scopeId,
    refreshRequest,
    onError,
  }) {
    const [days, setDays] = useState(30),
      [query, setQuery] = useState("");
    const [sort, setSort] = useState("name"),
      [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true),
      [error, setError] = useState("");
    const [revision, setRevision] = useState(0),
      callbacks = useRef({ api, onError });
    callbacks.current = { api, onError };
    useEffect(() => {
      const controller = new AbortController();
      setLoading(true);
      setReport(null);
      setError("");
      callbacks.current
        .api(
          `/team/response-metrics?responsibilityScopeId=${encodeURIComponent(scopeId)}&days=${days}`,
          { signal: controller.signal },
        )
        .then((value) => {
          if (!controller.signal.aborted) setReport(value);
        })
        .catch((reason) => {
          if (!controller.signal.aborted)
            setError(callbacks.current.onError(reason));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
    }, [scopeId, days, revision, refreshRequest]);
    const employees = (report?.employees || [])
      .filter((person) =>
        person.displayName
          .toLocaleLowerCase("ru")
          .includes(query.trim().toLocaleLowerCase("ru")),
      )
      .sort((a, b) => {
        if (sort === "speed") {
          if (
            a.averageResponseSeconds == null &&
            b.averageResponseSeconds != null
          )
            return 1;
          if (
            b.averageResponseSeconds == null &&
            a.averageResponseSeconds != null
          )
            return -1;
          const difference =
            (a.averageResponseSeconds || 0) - (b.averageResponseSeconds || 0);
          if (difference) return difference;
        }
        if (sort === "count" && a.responseCount !== b.responseCount)
          return b.responseCount - a.responseCount;
        return a.displayName.localeCompare(b.displayName, "ru");
      });
    const field = (label, input) =>
      h("label", { className: "team-field" }, h("span", null, label), input);
    const cell = (label, value, props = {}) =>
      h("td", { "data-label": label, ...props }, value);
    return h(
      "section",
      {
        className: "team-response-metrics",
        "aria-label": "Статистика скорости ответов",
        "aria-busy": loading,
      },
      h(
        "div",
        { className: "team-response-heading" },
        h(
          "div",
          null,
          h("h2", null, "Скорость ответов"),
          h(
            "p",
            { className: "team-muted" },
            "Время ответа по сотрудникам · доступно только администратору",
          ),
        ),
        h(
          "button",
          {
            type: "button",
            className: "button",
            disabled: loading,
            onClick: () => setRevision((value) => value + 1),
          },
          "Обновить статистику",
        ),
      ),
      h(
        "div",
        { className: "team-response-controls" },
        field(
          "Период статистики",
          h(
            "select",
            {
              value: days,
              onChange: (event) => setDays(Number(event.target.value)),
            },
            ...[7, 30, 90].map((value) =>
              h("option", { key: value, value }, `Последние ${value} дней`),
            ),
          ),
        ),
        field(
          "Найти сотрудника",
          h("input", {
            type: "search",
            value: query,
            placeholder: "Имя сотрудника",
            onChange: (event) => setQuery(event.target.value),
          }),
        ),
        field(
          "Сортировка",
          h(
            "select",
            { value: sort, onChange: (event) => setSort(event.target.value) },
            h("option", { value: "name" }, "По имени"),
            h("option", { value: "speed" }, "Сначала быстрые ответы"),
            h("option", { value: "count" }, "По числу ответов"),
          ),
        ),
      ),
      error && h("div", { className: "team-error", role: "alert" }, error),
      loading &&
        h(
          "p",
          { className: "team-loading", role: "status" },
          "Рассчитываем время ответов…",
        ),
      report &&
        h(
          React.Fragment,
          null,
          h(
            "div",
            { className: "team-response-summary" },
            ...[
              ["Ответов за период", report.totals.responseCount],
              ["Среднее время", duration(report.totals.averageResponseSeconds)],
              ["Медиана", duration(report.totals.medianResponseSeconds)],
              ["Чатов ожидают ответа", report.totals.pendingDirectCount],
            ].map(([label, value]) =>
              h(
                "div",
                { key: label },
                h("span", null, label),
                h("strong", null, value),
              ),
            ),
          ),
          employees.length
            ? h(
                "table",
                { className: "team-response-table" },
                h(
                  "caption",
                  { className: "team-response-caption" },
                  "Показатели сотрудников за выбранный период",
                ),
                h(
                  "thead",
                  null,
                  h(
                    "tr",
                    null,
                    ...[
                      "Сотрудник",
                      "Среднее",
                      "Медиана",
                      "Ответов",
                      "Ожидают ответа",
                      "Дольше всего ждут",
                    ].map((label) =>
                      h("th", { key: label, scope: "col" }, label),
                    ),
                  ),
                ),
                h(
                  "tbody",
                  null,
                  ...employees.map((person) =>
                    h(
                      "tr",
                      { key: person.userId, "data-employee-id": person.userId },
                      h("th", { scope: "row" }, person.displayName),
                      cell("Среднее", duration(person.averageResponseSeconds)),
                      cell("Медиана", duration(person.medianResponseSeconds)),
                      cell("Ответов", person.responseCount, {
                        title: `Личные чаты: ${person.directResponseCount} · Ответы в каналах: ${person.channelResponseCount}`,
                      }),
                      cell("Ожидают ответа", person.pendingDirectCount),
                      cell(
                        "Дольше всего ждут",
                        duration(person.oldestPendingSeconds),
                      ),
                    ),
                  ),
                ),
              )
            : h(
                "p",
                { className: "team-muted", role: "status" },
                query.trim()
                  ? "Сотрудники не найдены."
                  : "Нет доступных сотрудников.",
              ),
          !report.totals.responseCount &&
            h(
              "p",
              { className: "team-muted" },
              "За этот период ещё нет ответов для расчёта. Прочерк означает отсутствие данных.",
            ),
        ),
      h(
        "details",
        { className: "team-response-method" },
        h("summary", null, "Как считается время"),
        h(
          "p",
          null,
          "В личных чатах — от первого сообщения подряд от собеседника до первого ответа. Несколько входящих сообщений до ответа считаются одним обращением. В каналах — первый явный ответ сотрудника на чужое сообщение через ветку обсуждения.",
        ),
        h(
          "p",
          null,
          "В период попадают ответы, отправленные за выбранные дни. Ожидание показано для личных чатов, где не отвечено на серию сообщений, начавшуюся в этот период. Чтение сообщения само по себе не считается ответом.",
        ),
        h(
          "p",
          null,
          "Учитывается календарное время, включая ночи и выходные. Медиана — время в середине списка ответов; отдельные долгие ожидания влияют на неё меньше, чем на среднее. Сравнивайте скорость вместе с числом ответов.",
        ),
      ),
    );
  };
}
