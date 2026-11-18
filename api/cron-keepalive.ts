// Vercel Serverless Function: Cron Keepalive
// Runs on a recurring schedule (e.g. every 10-12 minutes) to ping the Render backend health check
// and prevent free-tier Render instances from spinning down / going to sleep.

export const config = {
  maxDuration: 10,
};

export default async function handler(req: any, res: any) {
  const backendUrl =
    process.env.RENDER_BACKEND_URL ||
    process.env.VITE_BACKEND_URL ||
    "https://aircommand-backend.onrender.com";

  const targetHealthUrl = `${backendUrl.replace(/\/+$/, "")}/api/health`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(targetHealthUrl, {
      method: "GET",
      headers: {
        "User-Agent": "AirCommand-Vercel-Cron-Keepalive/1.0",
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json().catch(() => ({}));
    const durationMs = Date.now() - startTime;

    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      pingedUrl: targetHealthUrl,
      durationMs,
      renderData: data,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    return res.status(200).json({
      ok: false,
      error: error?.message || "Ping error",
      pingedUrl: targetHealthUrl,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  }
}
