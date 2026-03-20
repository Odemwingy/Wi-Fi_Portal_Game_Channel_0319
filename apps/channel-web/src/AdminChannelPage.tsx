import { startTransition, useEffect, useState } from "react";

import type {
  AdminAuditEntry,
  AdminSession,
  ChannelContentDocument,
  ChannelContentState
} from "@wifi-portal/game-sdk";

import {
  getAdminAuditLogs,
  getAdminChannelContent,
  getAdminMe,
  loginAdmin,
  publishAdminChannelContent,
  logoutAdmin,
  updateAdminChannelContent
} from "./channel-api";

type LoadStatus = "authenticating" | "idle" | "loading" | "saving";

type LoginForm = {
  password: string;
  username: string;
};

const ADMIN_SESSION_STORAGE_KEY = "wifi-portal-admin-session-token";

export function AdminChannelPage() {
  const [airlineCode, setAirlineCode] = useState("MU");
  const [locale, setLocale] = useState("zh-CN");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [document, setDocument] = useState<ChannelContentDocument | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [loginForm, setLoginForm] = useState<LoginForm>({
    password: "portal-super-123",
    username: "super-admin"
  });
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const draft = document?.draft ?? null;
  const sortedCatalog = [...(draft?.catalog ?? [])].sort(
    (left, right) => left.sort_order - right.sort_order
  );
  const publication = document?.publication ?? null;
  const hasUnpublishedChanges = publication?.has_unpublished_changes ?? false;
  const canViewAudit = adminSession?.user.roles.some(
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
    if (!adminSession) {
      setDocument(null);
      setAuditEntries([]);
      return;
    }

    let isStale = false;

    void (async () => {
      setStatus("loading");
      setError(null);
      setNotice(null);

      try {
        const [content, audit] = await Promise.all([
          getAdminChannelContent({
            airline_code: airlineCode,
            locale,
            session_token: adminSession.session_token
          }),
          canViewAudit
            ? getAdminAuditLogs(adminSession.session_token)
            : Promise.resolve({ entries: [] })
        ]);

        if (isStale) {
          return;
        }

        startTransition(() => {
          setDocument(content);
          setAuditEntries(audit.entries);
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
  }, [adminSession, airlineCode, locale, reloadVersion, canViewAudit]);

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
      setDocument(null);
      setAuditEntries([]);
    });
    setNotice("已退出后台登录。");
  }

  async function handleSave() {
    if (!draft || !adminSession) {
      return;
    }

    setStatus("saving");
    setError(null);
    setNotice(null);

    try {
      const response = await updateAdminChannelContent({
        catalog: draft.catalog.map((entry) => ({
          categories: entry.categories,
          description: entry.description,
          featured: entry.featured,
          game_id: entry.game_id,
          sort_order: entry.sort_order,
          status: entry.status
        })),
        channel_config: draft.channel_config,
        session_token: adminSession.session_token
      });

      const audit = canViewAudit
        ? await getAdminAuditLogs(adminSession.session_token)
        : { entries: [] };

      startTransition(() => {
        setDocument(response);
        setAuditEntries(audit.entries);
      });
      setNotice("草稿已保存，发布前不会影响前台频道。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setStatus("idle");
    }
  }

  async function handlePublish() {
    if (!adminSession) {
      return;
    }

    setStatus("saving");
    setError(null);
    setNotice(null);

    try {
      const response = await publishAdminChannelContent({
        airline_code: airlineCode,
        locale,
        session_token: adminSession.session_token
      });

      const audit = canViewAudit
        ? await getAdminAuditLogs(adminSession.session_token)
        : { entries: [] };

      startTransition(() => {
        setDocument(response);
        setAuditEntries(audit.entries);
      });
      setNotice("草稿已发布，前台会读取最新 published 配置。");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Publish failed");
    } finally {
      setStatus("idle");
    }
  }

  function updateConfigField(
    field: "channel_name" | "hero_title",
    value: string
  ) {
    setDocument((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              channel_config: {
                ...current.draft.channel_config,
                [field]: value
              }
            }
          }
        : current
    );
  }

  function updateFeatureFlag(flag: string, checked: boolean) {
    setDocument((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              channel_config: {
                ...current.draft.channel_config,
                feature_flags: {
                  ...current.draft.channel_config.feature_flags,
                  [flag]: checked
                }
              }
            }
          }
        : current
    );
  }

  function updateSections(value: string) {
    const sections = value
      .split(",")
      .map((section) => section.trim())
      .filter(Boolean);

    setDocument((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              channel_config: {
                ...current.draft.channel_config,
                sections
              }
            }
          }
        : current
    );
  }

  function updateCatalogEntry(
    gameId: string,
    patch: Partial<ChannelContentState["catalog"][number]>
  ) {
    setDocument((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              catalog: current.draft.catalog.map((entry) =>
                entry.game_id === gameId
                  ? {
                      ...entry,
                      ...patch
                    }
                  : entry
              )
            }
          }
        : current
    );
  }

  if (!adminSession) {
    return (
      <main className="shell">
        <section className="hero-panel admin-hero">
          <div>
            <p className="eyebrow">Admin Console</p>
            <h1>后台登录与权限控制</h1>
            <p className="hero-copy">
              使用后台账号登录后，才能访问频道内容配置和审计日志。当前内置了
              demo 账号，后续可以切到真实身份源。
            </p>
          </div>

          <div className="hero-stat-card">
            <strong>RBAC</strong>
            <span>content / ops / super</span>
          </div>
        </section>

        <section className="dashboard">
          <article className="panel panel-span-2">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Admin Auth</p>
                <h2>登录后台</h2>
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
            </div>

            <div className="admin-credentials">
              <div className="tag-row">
                <span className="tag">content-admin / portal-content-123</span>
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

  return (
    <main className="shell">
      <section className="hero-panel admin-hero">
        <div>
          <p className="eyebrow">Admin Console</p>
          <h1>频道内容配置后台</h1>
          <p className="hero-copy">
            管理频道头图文案、分区、推荐位、分类、排序和上下架。前台
            `/api/session/bootstrap`
            与 `/api/channel/catalog` 会直接消费这里的配置。
          </p>
        </div>

        <div className="hero-stat-card">
          <strong>v{publication?.published_revision ?? 1}</strong>
          <span>{hasUnpublishedChanges ? "draft pending" : adminSession.user.display_name}</span>
        </div>
      </section>

      <section className="dashboard">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Scope</p>
              <h2>管理范围</h2>
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
                setAirlineCode((current) => current.trim() || "MU");
                setLocale((current) => current.trim() || "zh-CN");
                setReloadVersion((current) => current + 1);
              }}
              type="button"
            >
              重新加载
            </button>
            <button
              className="action-button action-button-primary"
              disabled={!draft || status === "saving"}
              onClick={() => void handleSave()}
              type="button"
            >
              保存草稿
            </button>
            <button
              className="action-button action-button-primary"
              disabled={!draft || !hasUnpublishedChanges || status === "saving"}
              onClick={() => void handlePublish()}
              type="button"
            >
              发布到前台
            </button>
            <a className="action-button" href="/admin/operations">
              打开积分与航司后台
            </a>
            <button className="action-button" onClick={() => void handleLogout()} type="button">
              退出登录
            </button>
          </div>

          {error ? <p className="admin-message admin-error">{error}</p> : null}
          {notice ? <p className="admin-message admin-success">{notice}</p> : null}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Publication</p>
              <h2>草稿与发布状态</h2>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span>Draft Revision</span>
              <strong>{publication?.draft_revision ?? 1}</strong>
            </div>
            <div className="stat-card">
              <span>Published Revision</span>
              <strong>{publication?.published_revision ?? 1}</strong>
            </div>
            <div className="stat-card">
              <span>Pending Changes</span>
              <strong>{hasUnpublishedChanges ? "Yes" : "No"}</strong>
            </div>
          </div>

          <div className="activity-list">
            <article className={`activity-item ${hasUnpublishedChanges ? "tone-warn" : "tone-success"}`}>
              <div className="activity-topline">
                <strong>
                  {hasUnpublishedChanges ? "存在未发布草稿" : "草稿已与前台同步"}
                </strong>
                <span>
                  {publication?.last_published_at
                    ? formatAuditTime(publication.last_published_at)
                    : "尚未发布"}
                </span>
              </div>
              <p>
                最近发布人：{publication?.last_published_by ?? "seed"}，当前前台读取的是
                published 配置。
              </p>
            </article>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Channel Config</p>
              <h2>频道头部与开关</h2>
            </div>
          </div>

          {draft ? (
            <div className="admin-form-grid">
              <label>
                Channel Name
                <input
                  onChange={(event) => {
                    updateConfigField("channel_name", event.target.value);
                  }}
                  value={draft.channel_config.channel_name}
                />
              </label>
              <label>
                Hero Title
                <textarea
                  onChange={(event) => {
                    updateConfigField("hero_title", event.target.value);
                  }}
                  rows={3}
                  value={draft.channel_config.hero_title}
                />
              </label>
              <label>
                Sections
                <input
                  onChange={(event) => {
                    updateSections(event.target.value);
                  }}
                  value={draft.channel_config.sections.join(", ")}
                />
              </label>

              <div className="admin-flag-grid">
                {Object.entries(draft.channel_config.feature_flags).map(
                  ([flag, enabled]) => (
                    <label className="admin-flag-card" key={flag}>
                      <span>{flag}</span>
                      <input
                        checked={enabled}
                        onChange={(event) => {
                          updateFeatureFlag(flag, event.target.checked);
                        }}
                        type="checkbox"
                      />
                    </label>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state compact">
              <p>正在加载频道配置。</p>
            </div>
          )}
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Catalog Management</p>
              <h2>游戏上下架、推荐位与排序</h2>
            </div>
            <span className="pill">{sortedCatalog.length} games</span>
          </div>

          <div className="admin-game-grid">
            {sortedCatalog.map((entry) => (
              <article className="catalog-card admin-game-card" key={entry.game_id}>
                <div className="catalog-topline">
                  <strong>{entry.display_name}</strong>
                  <span>{entry.game_id}</span>
                </div>
                <p>{entry.route}</p>

                <div className="admin-card-grid">
                  <label>
                    Description
                    <textarea
                      onChange={(event) => {
                        updateCatalogEntry(entry.game_id, {
                          description: event.target.value
                        });
                      }}
                      rows={3}
                      value={entry.description}
                    />
                  </label>
                  <label>
                    Categories
                    <input
                      onChange={(event) => {
                        updateCatalogEntry(entry.game_id, {
                          categories: event.target.value
                            .split(",")
                            .map((category) => category.trim())
                            .filter(Boolean)
                        });
                      }}
                      value={entry.categories.join(", ")}
                    />
                  </label>
                  <label>
                    Sort Order
                    <input
                      min={0}
                      onChange={(event) => {
                        updateCatalogEntry(entry.game_id, {
                          sort_order: Number(event.target.value) || 0
                        });
                      }}
                      type="number"
                      value={entry.sort_order}
                    />
                  </label>
                </div>

                <div className="admin-toggle-row">
                  <label className="admin-toggle">
                    <span>Published</span>
                    <input
                      checked={entry.status === "published"}
                      onChange={(event) => {
                        updateCatalogEntry(entry.game_id, {
                          status: event.target.checked ? "published" : "hidden"
                        });
                      }}
                      type="checkbox"
                    />
                  </label>
                  <label className="admin-toggle">
                    <span>Featured</span>
                    <input
                      checked={entry.featured}
                      onChange={(event) => {
                        updateCatalogEntry(entry.game_id, {
                          featured: event.target.checked
                        });
                      }}
                      type="checkbox"
                    />
                  </label>
                </div>

                <div className="tag-row">
                  {entry.capabilities.map((capability) => (
                    <span className="tag" key={capability}>
                      {capability}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Audit</p>
              <h2>最近操作审计</h2>
            </div>
            <span className="pill">{auditEntries.length} entries</span>
          </div>

          {canViewAudit ? (
            <div className="activity-list">
              {auditEntries.map((entry) => (
                <article className="activity-item tone-info" key={entry.audit_id}>
                  <div className="activity-topline">
                    <strong>{entry.summary}</strong>
                    <span>{formatAuditTime(entry.created_at)}</span>
                  </div>
                  <p>
                    {entry.action} · {entry.actor_username ?? "system"} · {entry.target_type}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <p>当前账号没有审计日志查看权限，使用 ops-admin 或 super-admin 可查看。</p>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}

function formatAuditTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit"
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
