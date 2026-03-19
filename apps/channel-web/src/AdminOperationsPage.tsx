import { startTransition, useEffect, useState } from "react";

import {
  airlinePointsConfigUpsertRequestSchema,
  pointsRuleSetUpsertRequestSchema,
  type AdminSession,
  type AirlinePointsConfig,
  type AirlinePointsConfigUpsertRequest,
  type AirlinePointsSyncRecord,
  type AirlinePointsSyncStatus,
  type ChannelCatalogEntry,
  type PointsAuditEntry,
  type PointsRule,
  type PointsRuleKind,
  type PointsRuleSet,
  type PointsRuleSetUpsertRequest
} from "@wifi-portal/game-sdk";

import {
  dispatchAdminAirlineSyncPending,
  getAdminAirlinePointsConfig,
  getAdminAirlineSyncRecords,
  getAdminMe,
  getAdminPointsRulesAudit,
  getAdminPointsRulesConfig,
  getChannelCatalog,
  loginAdmin,
  logoutAdmin,
  retryAdminAirlineSyncRecord,
  updateAdminAirlinePointsConfig,
  updateAdminPointsRulesConfig
} from "./channel-api";

type LoadStatus =
  | "authenticating"
  | "idle"
  | "loading"
  | "saving-airline"
  | "saving-rules"
  | "dispatching"
  | "retrying";

type LoginForm = {
  password: string;
  username: string;
};

type SyncStatusFilter = AirlinePointsSyncStatus | "all";

const ADMIN_SESSION_STORAGE_KEY = "wifi-portal-admin-session-token";
const POINTS_EVENT_OPTIONS = ["entry", "completion", "duration", "result", "any"] as const;
const POINTS_RULE_KIND_OPTIONS: PointsRuleKind[] = [
  "requested_points_multiplier",
  "metadata_number_multiplier",
  "metadata_boolean_bonus",
  "flat_bonus"
];
const AIRLINE_AUTH_TYPE_OPTIONS = ["none", "bearer", "api_key"] as const;
const AIRLINE_PROVIDER_OPTIONS = ["mock-http", "legacy-batch"] as const;
const AIRLINE_SYNC_MODE_OPTIONS = ["realtime", "batch"] as const;
const AIRLINE_SIMULATION_MODE_OPTIONS = [
  "success",
  "retryable_failure",
  "permanent_failure"
] as const;

export function AdminOperationsPage() {
  const [airlineCode, setAirlineCode] = useState("MU");
  const [locale, setLocale] = useState("zh-CN");
  const [selectedGameId, setSelectedGameId] = useState("quiz-duel");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [syncStatusFilter, setSyncStatusFilter] =
    useState<SyncStatusFilter>("all");
  const [auditPassengerId, setAuditPassengerId] = useState("");
  const [syncLimit, setSyncLimit] = useState(12);
  const [catalog, setCatalog] = useState<ChannelCatalogEntry[]>([]);
  const [pointsRuleDraft, setPointsRuleDraft] =
    useState<PointsRuleSetUpsertRequest | null>(null);
  const [pointsAuditEntries, setPointsAuditEntries] = useState<PointsAuditEntry[]>(
    []
  );
  const [airlineConfigDraft, setAirlineConfigDraft] =
    useState<AirlinePointsConfigUpsertRequest | null>(null);
  const [fieldMappingText, setFieldMappingText] = useState("{}");
  const [syncRecords, setSyncRecords] = useState<AirlinePointsSyncRecord[]>([]);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [loginForm, setLoginForm] = useState<LoginForm>({
    password: "portal-super-123",
    username: "super-admin"
  });
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canOperate =
    adminSession?.user.roles.some(
      (role) => role === "ops_admin" || role === "super_admin"
    ) ?? false;

  useEffect(() => {
    const storedToken = readStoredAdminToken();
    if (!storedToken) {
      return;
    }

    let isStale = false;

    void (async () => {
      setStatus("authenticating");
      setError(null);

      try {
        const session = await getAdminMe(storedToken);
        if (isStale) {
          return;
        }

        startTransition(() => {
          setAdminSession(session);
        });
      } catch {
        clearStoredAdminToken();
      } finally {
        if (!isStale) {
          setStatus("idle");
        }
      }
    })();

    return () => {
      isStale = true;
    };
  }, []);

  useEffect(() => {
    if (!adminSession || !canOperate) {
      setCatalog([]);
      setPointsRuleDraft(null);
      setPointsAuditEntries([]);
      setAirlineConfigDraft(null);
      setFieldMappingText("{}");
      setSyncRecords([]);
      return;
    }

    let isStale = false;

    void (async () => {
      setStatus("loading");
      setError(null);
      setNotice(null);

      try {
        const activeGameId = selectedGameId.trim() || "quiz-duel";
        const [nextCatalog, initialRuleSet, audit, airlineConfig, syncList] =
          await Promise.all([
            getChannelCatalog({
              airline_code: airlineCode,
              locale
            }),
            getAdminPointsRulesConfig({
              airline_code: airlineCode,
              game_id: activeGameId,
              session_token: adminSession.session_token
            }),
            getAdminPointsRulesAudit({
              game_id: activeGameId,
              limit: 8,
              passenger_id: auditPassengerId.trim() || undefined,
              session_token: adminSession.session_token
            }),
            getAdminAirlinePointsConfig({
              airline_code: airlineCode,
              session_token: adminSession.session_token
            }),
            getAdminAirlineSyncRecords({
              airline_code: airlineCode,
              limit: syncLimit,
              session_token: adminSession.session_token,
              status:
                syncStatusFilter === "all" ? undefined : syncStatusFilter
            })
          ]);

        const catalogGameId =
          nextCatalog.find((entry) => entry.game_id === activeGameId)?.game_id ??
          nextCatalog[0]?.game_id ??
          activeGameId;
        const needsRuleReload = catalogGameId !== activeGameId;
        const nextRuleSet = needsRuleReload
          ? await getAdminPointsRulesConfig({
              airline_code: airlineCode,
              game_id: catalogGameId,
              session_token: adminSession.session_token
            })
          : initialRuleSet;
        const nextAudit = needsRuleReload
          ? await getAdminPointsRulesAudit({
              game_id: catalogGameId,
              limit: 8,
              passenger_id: auditPassengerId.trim() || undefined,
              session_token: adminSession.session_token
            })
          : audit;

        if (isStale) {
          return;
        }

        startTransition(() => {
          setCatalog(nextCatalog);
          setSelectedGameId(catalogGameId);
          setPointsRuleDraft(toPointsRuleSetDraft(nextRuleSet));
          setPointsAuditEntries(nextAudit.entries);
          setAirlineConfigDraft(toAirlineConfigDraft(airlineConfig));
          setFieldMappingText(JSON.stringify(airlineConfig.field_mapping, null, 2));
          setSyncRecords(syncList.entries);
        });
      } catch (loadError) {
        if (!isStale) {
          setError(loadError instanceof Error ? loadError.message : "Load failed");
        }
      } finally {
        if (!isStale) {
          setStatus("idle");
        }
      }
    })();

    return () => {
      isStale = true;
    };
  }, [
    adminSession,
    airlineCode,
    locale,
    selectedGameId,
    reloadVersion,
    syncStatusFilter,
    syncLimit,
    auditPassengerId,
    canOperate
  ]);

  async function handleLogin() {
    setStatus("authenticating");
    setError(null);
    setNotice(null);

    try {
      const session = await loginAdmin(loginForm);
      persistAdminToken(session.session_token);
      startTransition(() => {
        setAdminSession(session);
      });
      setNotice(`已登录为 ${session.user.display_name}`);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setStatus("idle");
    }
  }

  async function handleLogout() {
    const sessionToken = adminSession?.session_token;
    clearStoredAdminToken();

    try {
      if (sessionToken) {
        await logoutAdmin(sessionToken);
      }
    } catch {
      // Ignore logout network errors once the local session is cleared.
    }

    startTransition(() => {
      setAdminSession(null);
      setCatalog([]);
      setPointsRuleDraft(null);
      setPointsAuditEntries([]);
      setAirlineConfigDraft(null);
      setFieldMappingText("{}");
      setSyncRecords([]);
    });
    setNotice("已退出运营后台。");
  }

  async function handleSavePointsRules() {
    if (!pointsRuleDraft || !adminSession) {
      return;
    }

    const parsedDraft = pointsRuleSetUpsertRequestSchema.safeParse(pointsRuleDraft);
    if (!parsedDraft.success) {
      setError(parsedDraft.error.issues[0]?.message ?? "规则配置校验失败");
      setNotice(null);
      return;
    }

    setStatus("saving-rules");
    setError(null);
    setNotice(null);

    try {
      const [updated, audit] = await Promise.all([
        updateAdminPointsRulesConfig({
          ...parsedDraft.data,
          session_token: adminSession.session_token
        }),
        getAdminPointsRulesAudit({
          game_id: parsedDraft.data.game_id,
          limit: 8,
          passenger_id: auditPassengerId.trim() || undefined,
          session_token: adminSession.session_token
        })
      ]);

      startTransition(() => {
        setPointsRuleDraft(toPointsRuleSetDraft(updated));
        setPointsAuditEntries(audit.entries);
      });
      setNotice(
        `积分规则已发布到 ${updated.airline_code}/${updated.game_id}。`
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setStatus("idle");
    }
  }

  async function handleSaveAirlineConfig() {
    if (!airlineConfigDraft || !adminSession) {
      return;
    }

    const fieldMapping = parseJsonRecord(fieldMappingText);
    if (!fieldMapping.success) {
      setError(fieldMapping.message);
      setNotice(null);
      return;
    }

    const parsedDraft = airlinePointsConfigUpsertRequestSchema.safeParse({
      ...airlineConfigDraft,
      field_mapping: fieldMapping.value
    });
    if (!parsedDraft.success) {
      setError(parsedDraft.error.issues[0]?.message ?? "航司配置校验失败");
      setNotice(null);
      return;
    }

    setStatus("saving-airline");
    setError(null);
    setNotice(null);

    try {
      const updated = await updateAdminAirlinePointsConfig({
        ...parsedDraft.data,
        session_token: adminSession.session_token
      });

      startTransition(() => {
        setAirlineConfigDraft(toAirlineConfigDraft(updated));
        setFieldMappingText(JSON.stringify(updated.field_mapping, null, 2));
      });
      setNotice(`航司积分接口配置已发布到 ${updated.airline_code}。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setStatus("idle");
    }
  }

  async function handleDispatchPending() {
    if (!adminSession) {
      return;
    }

    setStatus("dispatching");
    setError(null);
    setNotice(null);

    try {
      const response = await dispatchAdminAirlineSyncPending({
        airline_code: airlineCode,
        limit: syncLimit,
        session_token: adminSession.session_token
      });
      const syncList = await getAdminAirlineSyncRecords({
        airline_code: airlineCode,
        limit: syncLimit,
        session_token: adminSession.session_token,
        status: syncStatusFilter === "all" ? undefined : syncStatusFilter
      });

      startTransition(() => {
        setSyncRecords(syncList.entries);
      });
      setNotice(`已补发 ${response.processed_count} 条待处理航司积分记录。`);
    } catch (dispatchError) {
      setError(
        dispatchError instanceof Error ? dispatchError.message : "Dispatch failed"
      );
    } finally {
      setStatus("idle");
    }
  }

  async function handleRetrySync(syncId: string) {
    if (!adminSession) {
      return;
    }

    setStatus("retrying");
    setError(null);
    setNotice(null);

    try {
      const result = await retryAdminAirlineSyncRecord({
        session_token: adminSession.session_token,
        sync_id: syncId
      });
      const syncList = await getAdminAirlineSyncRecords({
        airline_code: airlineCode,
        limit: syncLimit,
        session_token: adminSession.session_token,
        status: syncStatusFilter === "all" ? undefined : syncStatusFilter
      });

      startTransition(() => {
        setSyncRecords(syncList.entries);
      });
      setNotice(`已重试 ${result.sync_id}，当前状态为 ${result.status}。`);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Retry failed");
    } finally {
      setStatus("idle");
    }
  }

  function updatePointsRuleDraft(
    patch: Partial<PointsRuleSetUpsertRequest>
  ) {
    setPointsRuleDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updatePointsRule(
    ruleId: string,
    patch: Partial<PointsRule>
  ) {
    setPointsRuleDraft((current) =>
      current
        ? {
            ...current,
            rules: current.rules.map((rule) =>
              rule.id === ruleId
                ? {
                    ...rule,
                    ...patch
                  }
                : rule
            )
          }
        : current
    );
  }

  function togglePointsRuleEvent(ruleId: string, eventType: (typeof POINTS_EVENT_OPTIONS)[number]) {
    setPointsRuleDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        rules: current.rules.map((rule) => {
          if (rule.id !== ruleId) {
            return rule;
          }

          const nextEvents = rule.applies_to_events.includes(eventType)
            ? rule.applies_to_events.filter((event) => event !== eventType)
            : [...rule.applies_to_events, eventType];

          return {
            ...rule,
            applies_to_events: nextEvents.length > 0 ? nextEvents : [eventType]
          };
        })
      };
    });
  }

  function removePointsRule(ruleId: string) {
    setPointsRuleDraft((current) =>
      current
        ? {
            ...current,
            rules: current.rules.filter((rule) => rule.id !== ruleId)
          }
        : current
    );
  }

  function addPointsRule() {
    setPointsRuleDraft((current) =>
      current
        ? {
            ...current,
            rules: [
              ...current.rules,
              createEmptyPointsRule(current.game_id, current.rules.length + 1)
            ]
          }
        : current
    );
  }

  function updateAirlineConfigDraft(
    patch: Partial<AirlinePointsConfigUpsertRequest>
  ) {
    setAirlineConfigDraft((current) =>
      current ? { ...current, ...patch } : current
    );
  }

  if (!adminSession) {
    return (
      <main className="shell">
        <section className="hero-panel admin-hero">
          <div>
            <p className="eyebrow">Operations Console</p>
            <h1>积分规则与航司接口后台</h1>
            <p className="hero-copy">
              这个入口负责积分规则、航司接口、失败补发和同步记录查询。需要
              ops-admin 或 super-admin 权限。
            </p>
          </div>

          <div className="hero-stat-card">
            <strong>Ops RBAC</strong>
            <span>ops / super</span>
          </div>
        </section>

        <section className="dashboard">
          <article className="panel panel-span-2">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Admin Auth</p>
                <h2>登录运营后台</h2>
              </div>
              <span className="pill">{status}</span>
            </div>

            <div className="form-grid">
              <label>
                Username
                <input
                  onChange={(event) => {
                    setLoginForm((current) => ({
                      ...current,
                      username: event.target.value
                    }));
                  }}
                  value={loginForm.username}
                />
              </label>
              <label>
                Password
                <input
                  onChange={(event) => {
                    setLoginForm((current) => ({
                      ...current,
                      password: event.target.value
                    }));
                  }}
                  type="password"
                  value={loginForm.password}
                />
              </label>
            </div>

            <div className="button-row">
              <button
                className="action-button action-button-primary"
                onClick={() => void handleLogin()}
                type="button"
              >
                登录
              </button>
              <a className="action-button" href="/admin/channel">
                转到频道内容后台
              </a>
            </div>

            <div className="admin-credentials">
              <div className="tag-row">
                <span className="tag">ops-admin / portal-ops-123</span>
                <span className="tag">super-admin / portal-super-123</span>
              </div>
            </div>

            {error ? <p className="admin-message admin-error">{error}</p> : null}
            {notice ? <p className="admin-message admin-success">{notice}</p> : null}
          </article>
        </section>
      </main>
    );
  }

  if (!canOperate) {
    return (
      <main className="shell">
        <section className="hero-panel admin-hero">
          <div>
            <p className="eyebrow">Operations Console</p>
            <h1>当前账号没有运营配置权限</h1>
            <p className="hero-copy">
              请使用 ops-admin 或 super-admin 登录，才能维护积分规则和航司接口。
            </p>
          </div>

          <div className="hero-stat-card">
            <strong>{adminSession.user.display_name}</strong>
            <span>{adminSession.user.roles.join(" / ")}</span>
          </div>
        </section>

        <section className="dashboard">
          <article className="panel panel-span-2">
            <div className="button-row">
              <a className="action-button" href="/admin/channel">
                打开频道内容后台
              </a>
              <button className="action-button" onClick={() => void handleLogout()} type="button">
                退出登录
              </button>
            </div>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero-panel admin-hero">
        <div>
          <p className="eyebrow">Operations Console</p>
          <h1>积分规则与航司接口配置后台</h1>
          <p className="hero-copy">
            管理积分规则、航司积分接口、失败同步记录与补发动作。配置保存前先走
            schema 校验，避免明显错误直接落库。
          </p>
        </div>

        <div className="hero-stat-card">
          <strong>{syncRecords.length}</strong>
          <span>{adminSession.user.display_name}</span>
        </div>
      </section>

      <section className="dashboard">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Scope</p>
              <h2>运营范围</h2>
            </div>
            <span className="pill">{status}</span>
          </div>

          <div className="tag-row">
            {adminSession.user.roles.map((role) => (
              <span className="tag" key={role}>
                {role}
              </span>
            ))}
          </div>

          <div className="form-grid">
            <label>
              Airline Code
              <input
                onChange={(event) => {
                  setAirlineCode(event.target.value.toUpperCase());
                }}
                value={airlineCode}
              />
            </label>
            <label>
              Locale
              <input
                onChange={(event) => {
                  setLocale(event.target.value);
                }}
                value={locale}
              />
            </label>
          </div>

          <div className="button-row">
            <button
              className="action-button"
              onClick={() => {
                setReloadVersion((current) => current + 1);
              }}
              type="button"
            >
              重新加载
            </button>
            <a className="action-button" href="/admin/channel">
              打开频道内容后台
            </a>
            <button className="action-button" onClick={() => void handleLogout()} type="button">
              退出登录
            </button>
          </div>

          {error ? <p className="admin-message admin-error">{error}</p> : null}
          {notice ? <p className="admin-message admin-success">{notice}</p> : null}
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Points Rules</p>
              <h2>游戏积分规则配置</h2>
            </div>
            <span className="pill">{pointsRuleDraft?.rules.length ?? 0} rules</span>
          </div>

          {pointsRuleDraft ? (
            <>
              <div className="admin-form-grid">
                <label>
                  Game
                  <select
                    onChange={(event) => {
                      setSelectedGameId(event.target.value);
                    }}
                    value={selectedGameId}
                  >
                    {catalog.map((entry) => (
                      <option key={entry.game_id} value={entry.game_id}>
                        {entry.display_name} ({entry.game_id})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Max Points Per Report
                  <input
                    min={1}
                    onChange={(event) => {
                      updatePointsRuleDraft({
                        max_points_per_report: parseOptionalInteger(
                          event.target.value
                        )
                      });
                    }}
                    type="number"
                    value={pointsRuleDraft.max_points_per_report ?? ""}
                  />
                </label>
              </div>

              <div className="button-row">
                <button className="action-button" onClick={() => addPointsRule()} type="button">
                  新增规则
                </button>
                <button
                  className="action-button action-button-primary"
                  onClick={() => void handleSavePointsRules()}
                  type="button"
                >
                  校验并发布规则
                </button>
              </div>

              <div className="admin-rule-list">
                {pointsRuleDraft.rules.map((rule) => (
                  <article className="admin-rule-card" key={rule.id}>
                    <div className="panel-heading">
                      <div>
                        <p className="panel-kicker">Rule</p>
                        <h3>{rule.label || rule.id}</h3>
                      </div>
                      <button
                        className="action-button"
                        onClick={() => {
                          removePointsRule(rule.id);
                        }}
                        type="button"
                      >
                        删除
                      </button>
                    </div>

                    <div className="admin-card-grid">
                      <label>
                        Rule ID
                        <input
                          onChange={(event) => {
                            updatePointsRule(rule.id, {
                              id: event.target.value
                            });
                          }}
                          value={rule.id}
                        />
                      </label>
                      <label>
                        Label
                        <input
                          onChange={(event) => {
                            updatePointsRule(rule.id, {
                              label: event.target.value
                            });
                          }}
                          value={rule.label}
                        />
                      </label>
                      <label>
                        Kind
                        <select
                          onChange={(event) => {
                            updatePointsRule(rule.id, {
                              kind: event.target.value as PointsRuleKind
                            });
                          }}
                          value={rule.kind}
                        >
                          {POINTS_RULE_KIND_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Metadata Key
                        <input
                          onChange={(event) => {
                            updatePointsRule(rule.id, {
                              metadata_key: event.target.value || undefined
                            });
                          }}
                          value={rule.metadata_key ?? ""}
                        />
                      </label>
                      <label>
                        Multiplier
                        <input
                          min={0}
                          onChange={(event) => {
                            updatePointsRule(rule.id, {
                              multiplier: parseOptionalNumber(event.target.value)
                            });
                          }}
                          step="0.1"
                          type="number"
                          value={rule.multiplier ?? ""}
                        />
                      </label>
                      <label>
                        Flat Points
                        <input
                          min={0}
                          onChange={(event) => {
                            updatePointsRule(rule.id, {
                              points: parseOptionalInteger(event.target.value)
                            });
                          }}
                          type="number"
                          value={rule.points ?? ""}
                        />
                      </label>
                      <label>
                        Max Points
                        <input
                          min={0}
                          onChange={(event) => {
                            updatePointsRule(rule.id, {
                              max_points: parseOptionalInteger(event.target.value)
                            });
                          }}
                          type="number"
                          value={rule.max_points ?? ""}
                        />
                      </label>
                      <label>
                        Boolean Match
                        <select
                          onChange={(event) => {
                            updatePointsRule(rule.id, {
                              boolean_match:
                                event.target.value === ""
                                  ? undefined
                                  : event.target.value === "true"
                            });
                          }}
                          value={
                            rule.boolean_match === undefined
                              ? ""
                              : String(rule.boolean_match)
                          }
                        >
                          <option value="">Not set</option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      </label>
                    </div>

                    <div className="admin-toggle-row">
                      <label className="admin-toggle">
                        <span>Enabled</span>
                        <input
                          checked={rule.enabled}
                          onChange={(event) => {
                            updatePointsRule(rule.id, {
                              enabled: event.target.checked
                            });
                          }}
                          type="checkbox"
                        />
                      </label>
                      <label className="admin-toggle">
                        <span>Require Room</span>
                        <input
                          checked={rule.require_room ?? false}
                          onChange={(event) => {
                            updatePointsRule(rule.id, {
                              require_room: event.target.checked
                            });
                          }}
                          type="checkbox"
                        />
                      </label>
                    </div>

                    <div className="tag-row">
                      {POINTS_EVENT_OPTIONS.map((eventType) => {
                        const isActive = rule.applies_to_events.includes(eventType);
                        return (
                          <button
                            className={`section-chip ${isActive ? "section-chip-active" : ""}`}
                            key={eventType}
                            onClick={() => {
                              togglePointsRuleEvent(rule.id, eventType);
                            }}
                            type="button"
                          >
                            {eventType}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state compact">
              <p>正在加载积分规则配置。</p>
            </div>
          )}
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Points Audit</p>
              <h2>规则命中与积分审计</h2>
            </div>
            <span className="pill">{pointsAuditEntries.length} entries</span>
          </div>

          <div className="admin-form-grid">
            <label>
              Passenger Filter
              <input
                onChange={(event) => {
                  setAuditPassengerId(event.target.value);
                }}
                placeholder="选填 passenger_id"
                value={auditPassengerId}
              />
            </label>
            <label>
              当前游戏
              <input disabled value={selectedGameId} />
            </label>
          </div>

          <div className="activity-list">
            {pointsAuditEntries.map((entry) => (
              <article className="activity-item tone-info" key={entry.audit_id}>
                <div className="activity-topline">
                  <strong>
                    {entry.passenger_id} · {entry.awarded_points} pts
                  </strong>
                  <span>{formatDateTime(entry.created_at)}</span>
                </div>
                <p>
                  {entry.game_id} · {entry.event_type} · applied:{" "}
                  {entry.applied_rule_ids.join(", ") || "none"}
                </p>
                <p className="admin-muted">
                  requested {entry.requested_points} · report {entry.report_id}
                </p>
              </article>
            ))}
            {pointsAuditEntries.length === 0 ? (
              <div className="empty-state compact">
                <p>当前筛选条件下还没有积分审计记录。</p>
              </div>
            ) : null}
          </div>
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Airline Config</p>
              <h2>航司积分接口配置</h2>
            </div>
            <span className="pill">{airlineConfigDraft?.provider ?? "-"}</span>
          </div>

          {airlineConfigDraft ? (
            <>
              <div className="admin-form-grid">
                <label>
                  API Base URL
                  <input
                    onChange={(event) => {
                      updateAirlineConfigDraft({
                        api_base_url: event.target.value
                      });
                    }}
                    value={airlineConfigDraft.api_base_url}
                  />
                </label>
                <label>
                  Auth Credential
                  <input
                    onChange={(event) => {
                      updateAirlineConfigDraft({
                        auth_credential: event.target.value
                      });
                    }}
                    value={airlineConfigDraft.auth_credential}
                  />
                </label>
                <label>
                  Auth Type
                  <select
                    onChange={(event) => {
                      updateAirlineConfigDraft({
                        auth_type: event.target.value as AirlinePointsConfig["auth_type"]
                      });
                    }}
                    value={airlineConfigDraft.auth_type}
                  >
                    {AIRLINE_AUTH_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Provider
                  <select
                    onChange={(event) => {
                      updateAirlineConfigDraft({
                        provider: event.target.value as AirlinePointsConfig["provider"]
                      });
                    }}
                    value={airlineConfigDraft.provider}
                  >
                    {AIRLINE_PROVIDER_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sync Mode
                  <select
                    onChange={(event) => {
                      updateAirlineConfigDraft({
                        sync_mode: event.target.value as AirlinePointsConfig["sync_mode"]
                      });
                    }}
                    value={airlineConfigDraft.sync_mode}
                  >
                    {AIRLINE_SYNC_MODE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Simulation Mode
                  <select
                    onChange={(event) => {
                      updateAirlineConfigDraft({
                        simulation_mode:
                          event.target.value as AirlinePointsConfig["simulation_mode"]
                      });
                    }}
                    value={airlineConfigDraft.simulation_mode}
                  >
                    {AIRLINE_SIMULATION_MODE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Points Multiplier
                  <input
                    min={0.1}
                    onChange={(event) => {
                      updateAirlineConfigDraft({
                        points_multiplier: Number(event.target.value) || 1
                      });
                    }}
                    step="0.1"
                    type="number"
                    value={airlineConfigDraft.points_multiplier}
                  />
                </label>
                <label>
                  Max Attempts
                  <input
                    min={1}
                    onChange={(event) => {
                      updateAirlineConfigDraft({
                        retry_policy: {
                          ...airlineConfigDraft.retry_policy,
                          max_attempts: Number(event.target.value) || 1
                        }
                      });
                    }}
                    type="number"
                    value={airlineConfigDraft.retry_policy.max_attempts}
                  />
                </label>
                <label>
                  Base Backoff Seconds
                  <input
                    min={1}
                    onChange={(event) => {
                      updateAirlineConfigDraft({
                        retry_policy: {
                          ...airlineConfigDraft.retry_policy,
                          base_backoff_seconds: Number(event.target.value) || 1
                        }
                      });
                    }}
                    type="number"
                    value={airlineConfigDraft.retry_policy.base_backoff_seconds}
                  />
                </label>
              </div>

              <div className="admin-toggle-row">
                <label className="admin-toggle">
                  <span>Enabled</span>
                  <input
                    checked={airlineConfigDraft.enabled}
                    onChange={(event) => {
                      updateAirlineConfigDraft({
                        enabled: event.target.checked
                      });
                    }}
                    type="checkbox"
                  />
                </label>
              </div>

              <label>
                Field Mapping (JSON)
                <textarea
                  className="code-input"
                  onChange={(event) => {
                    setFieldMappingText(event.target.value);
                  }}
                  rows={8}
                  value={fieldMappingText}
                />
              </label>

              <div className="button-row">
                <button
                  className="action-button action-button-primary"
                  onClick={() => void handleSaveAirlineConfig()}
                  type="button"
                >
                  校验并发布航司配置
                </button>
                <button className="action-button" onClick={() => void handleDispatchPending()} type="button">
                  批量补发待处理记录
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state compact">
              <p>正在加载航司接口配置。</p>
            </div>
          )}
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Airline Sync</p>
              <h2>调用结果、失败记录与补发入口</h2>
            </div>
            <span className="pill">{syncRecords.length} records</span>
          </div>

          <div className="admin-form-grid">
            <label>
              Status Filter
              <select
                onChange={(event) => {
                  setSyncStatusFilter(event.target.value as SyncStatusFilter);
                }}
                value={syncStatusFilter}
              >
                <option value="all">all</option>
                <option value="pending">pending</option>
                <option value="synced">synced</option>
                <option value="failed">failed</option>
              </select>
            </label>
            <label>
              Record Limit
              <input
                min={1}
                onChange={(event) => {
                  setSyncLimit(Number(event.target.value) || 12);
                }}
                type="number"
                value={syncLimit}
              />
            </label>
          </div>

          <div className="activity-list">
            {syncRecords.map((entry) => (
              <article
                className={`activity-item ${getSyncToneClass(entry.status)}`}
                key={entry.sync_id}
              >
                <div className="activity-topline">
                  <strong>
                    {entry.airline_code} · {entry.status} · {entry.converted_points} pts
                  </strong>
                  <span>{formatDateTime(entry.updated_at)}</span>
                </div>
                <p>
                  {entry.game_id} · attempts {entry.attempt_count}/{entry.max_attempts} ·{" "}
                  {entry.sync_mode}
                </p>
                <p className="admin-muted">
                  sync_id {entry.sync_id} · ref {entry.external_reference ?? "n/a"}
                </p>
                {entry.last_error ? (
                  <p className="admin-error-inline">{entry.last_error}</p>
                ) : null}
                <div className="button-row">
                  <button
                    className="action-button"
                    disabled={entry.status === "synced"}
                    onClick={() => {
                      void handleRetrySync(entry.sync_id);
                    }}
                    type="button"
                  >
                    重试这条记录
                  </button>
                </div>
              </article>
            ))}
            {syncRecords.length === 0 ? (
              <div className="empty-state compact">
                <p>当前筛选条件下没有航司同步记录。</p>
              </div>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}

function toPointsRuleSetDraft(ruleSet: PointsRuleSet): PointsRuleSetUpsertRequest {
  return {
    airline_code: ruleSet.airline_code,
    game_id: ruleSet.game_id,
    max_points_per_report: ruleSet.max_points_per_report,
    rules: ruleSet.rules
  };
}

function toAirlineConfigDraft(
  config: AirlinePointsConfig
): AirlinePointsConfigUpsertRequest {
  return {
    airline_code: config.airline_code,
    api_base_url: config.api_base_url,
    auth_credential: config.auth_credential,
    auth_type: config.auth_type,
    enabled: config.enabled,
    field_mapping: config.field_mapping,
    points_multiplier: config.points_multiplier,
    provider: config.provider,
    retry_policy: config.retry_policy,
    simulation_mode: config.simulation_mode,
    sync_mode: config.sync_mode
  };
}

function createEmptyPointsRule(gameId: string, index: number): PointsRule {
  return {
    applies_to_events: ["completion"],
    enabled: true,
    id: `${gameId}-rule-${index}`,
    kind: "flat_bonus",
    label: `New rule ${index}`,
    points: 10,
    require_room: false
  };
}

function parseOptionalInteger(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseJsonRecord(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return {
        message: "Field mapping 必须是 JSON object。",
        success: false as const
      };
    }

    for (const [key, entryValue] of Object.entries(parsed)) {
      if (!key.trim() || typeof entryValue !== "string" || !entryValue.trim()) {
        return {
          message: "Field mapping 的 key 和 value 都必须是非空字符串。",
          success: false as const
        };
      }
    }

    return {
      success: true as const,
      value: parsed as Record<string, string>
    };
  } catch {
    return {
      message: "Field mapping 不是合法 JSON。",
      success: false as const
    };
  }
}

function getSyncToneClass(status: AirlinePointsSyncStatus) {
  switch (status) {
    case "synced":
      return "tone-success";
    case "failed":
      return "tone-error";
    default:
      return "tone-warn";
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  });
}

function persistAdminToken(sessionToken: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, sessionToken);
}

function readStoredAdminToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
}

function clearStoredAdminToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
}
