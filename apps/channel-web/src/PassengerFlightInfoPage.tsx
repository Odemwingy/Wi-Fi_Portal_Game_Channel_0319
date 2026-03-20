import { PassengerPortalShell } from "./PassengerPortalShell";
import { usePassengerBootstrap } from "./passenger-portal";

export function PassengerFlightInfoPage() {
  const { apiError, bootstrapData } = usePassengerBootstrap();

  return (
    <PassengerPortalShell
      activePath="/portal/flight-info"
      bootstrapData={bootstrapData}
    >
      <section className="portal-page-hero">
        <div>
          <p className="portal-kicker">Flight Overview</p>
          <h2>飞行信息</h2>
          <p className="portal-copy">
            当前页面按照参考稿的航旅信息面板风格，展示乘客座位、舱位、Portal
            连接状态和机上频道可用性。现阶段为演示数据视图。
          </p>
        </div>
        <div className="portal-stat-grid">
          <article className="portal-stat-card">
            <span>航司</span>
            <strong>{bootstrapData?.session.airlineCode ?? "MU"}</strong>
          </article>
          <article className="portal-stat-card">
            <span>舱位</span>
            <strong>{bootstrapData?.session.cabinClass ?? "economy"}</strong>
          </article>
          <article className="portal-stat-card">
            <span>座位</span>
            <strong>{bootstrapData?.session.seatNumber ?? "32A"}</strong>
          </article>
        </div>
      </section>

      {apiError ? (
        <section className="portal-banner portal-banner-error">
          <strong>飞行信息加载失败：</strong>
          <span>{apiError}</span>
        </section>
      ) : null}

      <section className="portal-info-grid">
        <article className="portal-info-card">
          <p className="portal-kicker">Connectivity</p>
          <h3>当前连接状态</h3>
          <div className="portal-detail-list">
            <div>
              <span>Wi-Fi Portal</span>
              <strong>已连接</strong>
            </div>
            <div>
              <span>Game Channel</span>
              <strong>可用</strong>
            </div>
            <div>
              <span>Locale</span>
              <strong>{bootstrapData?.session.locale ?? "zh-CN"}</strong>
            </div>
            <div>
              <span>Session</span>
              <strong>{bootstrapData?.session.sessionId ?? "pending"}</strong>
            </div>
          </div>
        </article>

        <article className="portal-info-card">
          <p className="portal-kicker">Demo Notes</p>
          <h3>当前视图说明</h3>
          <div className="portal-detail-list">
            <div>
              <span>数据来源</span>
              <strong>session bootstrap</strong>
            </div>
            <div>
              <span>定位</span>
              <strong>乘客门户演示页</strong>
            </div>
            <div>
              <span>用途</span>
              <strong>频道入口与信息承载</strong>
            </div>
            <div>
              <span>建议</span>
              <strong>后续可接真实航班 API</strong>
            </div>
          </div>
        </article>
      </section>
    </PassengerPortalShell>
  );
}
