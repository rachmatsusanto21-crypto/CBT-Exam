import { StudentExamSession } from "../types";

const CHANNEL_NAME = "slideexam_live_sessions_channel_v1";
const STORAGE_SYNC_KEY = "slideexam_latest_session_broadcast_v1";

type SessionListener = (session: StudentExamSession) => void;
const listeners = new Set<SessionListener>();

let broadcastChannel: BroadcastChannel | null = null;

if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      if (event?.data && event.data.type === "SESSION_UPDATE" && event.data.session) {
        const incomingSession = event.data.session as StudentExamSession;
        listeners.forEach((fn) => {
          try {
            fn(incomingSession);
          } catch (e) {
            console.error("LiveSync listener error:", e);
          }
        });
      }
    };
  } catch (e) {
    console.warn("BroadcastChannel not supported or restricted:", e);
  }
}

// Fallback to storage event for older browsers or sandboxed iframes
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_SYNC_KEY && event.newValue) {
      try {
        const payload = JSON.parse(event.newValue);
        if (payload && payload.session) {
          const incoming = payload.session as StudentExamSession;
          listeners.forEach((fn) => {
            try {
              fn(incoming);
            } catch (e) {
              console.error("Storage sync listener error:", e);
            }
          });
        }
      } catch (e) {
        console.error("Storage event parse error:", e);
      }
    }
  });
}

/**
 * Broadcast an updated / started student session immediately to all open tabs and windows.
 */
export function broadcastLiveSession(session: StudentExamSession): void {
  if (!session || !session.id) return;

  // 1. Send via BroadcastChannel
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({
        type: "SESSION_UPDATE",
        session,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.warn("Failed to broadcast session via channel:", e);
    }
  }

  // 2. Trigger localStorage write for cross-tab storage event
  try {
    localStorage.setItem(
      STORAGE_SYNC_KEY,
      JSON.stringify({ session, timestamp: Date.now() })
    );
  } catch (e) {
    // ignore
  }

  // 3. Notify in-tab listeners
  listeners.forEach((fn) => {
    try {
      fn(session);
    } catch (err) {
      console.error("In-tab listener error:", err);
    }
  });
}

/**
 * Subscribe to live incoming sessions from any tab/device.
 */
export function subscribeToLiveSessions(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
