// Client-side backend keepalive & pre-warm utility
// Fires pre-warm health ping on app launch to wake up Render free instance before user starts simulation,
// and maintains periodic keepalive while user has active simulator tab open.

export interface BackendHealthState {
  online: boolean;
  isColdStarting: boolean;
  lastPingMs: number;
  airportCount: number;
}

let healthState: BackendHealthState = {
  online: false,
  isColdStarting: false,
  lastPingMs: 0,
  airportCount: 0,
};

const subscribers = new Set<(state: BackendHealthState) => void>();

function notifySubscribers() {
  for (const sub of subscribers) {
    try {
      sub({ ...healthState });
    } catch {
      // Ignore
    }
  }
}

export function subscribeBackendHealth(callback: (state: BackendHealthState) => void): () => void {
  subscribers.add(callback);
  callback({ ...healthState });
  return () => subscribers.delete(callback);
}

export function getBackendHealth(): BackendHealthState {
  return { ...healthState };
}

/**
 * Fires a background pre-warm health ping to wake up the Render backend.
 * If cold-starting (takes > 2.5s or fails), sets isColdStarting = true and retries until online.
 */
export async function prewarmBackend(): Promise<boolean> {
  const startMs = Date.now();
  healthState.isColdStarting = true;
  notifySubscribers();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch("/api/health", {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      healthState = {
        online: true,
        isColdStarting: false,
        lastPingMs: Date.now(),
        airportCount: Number(data?.airports || 0),
      };
      notifySubscribers();
      return true;
    }
  } catch {
    // Cold starting or network error
  }

  // If initial ping didn't succeed immediately, retry in background every 4s until awake
  const retryInterval = window.setInterval(async () => {
    try {
      const r = await fetch("/api/health");
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        healthState = {
          online: true,
          isColdStarting: false,
          lastPingMs: Date.now(),
          airportCount: Number(d?.airports || 0),
        };
        window.clearInterval(retryInterval);
        notifySubscribers();
      }
    } catch {
      // Still warming up
    }
  }, 4000);

  // Stop retrying after 60 seconds
  setTimeout(() => window.clearInterval(retryInterval), 60000);
  return false;
}

// Automatically start pre-warm on initial load
if (typeof window !== "undefined") {
  // Fire pre-warm after a short 200ms tick so initial render isn't blocked
  setTimeout(() => {
    prewarmBackend();
  }, 200);

  // Keep alive every 5 minutes while user is on page
  setInterval(() => {
    fetch("/api/health").catch(() => {});
  }, 5 * 60 * 1000);
}
