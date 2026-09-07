import { StudentExamSession } from "../types";

const CHANNEL_NAME = "slideexam_live_sessions_channel_v1";
const STORAGE_SYNC_KEY = "slideexam_latest_session_broadcast_v1";

export interface SessionResetPayload {
  sessionId?: string;
  studentName?: string;
  token?: string;
  examCode?: string;
  nisn?: string;
}

type SessionListener = (session: StudentExamSession) => void;
type ResetListener = (resetPayload: SessionResetPayload) => void;

const listeners = new Set<SessionListener>();
const resetListeners = new Set<ResetListener>();

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
      } else if (event?.data && event.data.type === "SESSION_RESET") {
        const payload = event.data.payload;
        resetListeners.forEach((fn) => {
          try {
            fn(payload);
          } catch (e) {
            console.error("LiveSync reset listener error:", e);
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
        } else if (payload && payload.type === "SESSION_RESET" && payload.resetPayload) {
          resetListeners.forEach((fn) => {
            try {
              fn(payload.resetPayload);
            } catch (e) {
              console.error("Storage reset listener error:", e);
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

export interface SessionResetPayload {
  sessionId?: string;
  studentName?: string;
  token?: string;
  nisn?: string;
  examCode?: string;
}

/**
 * Broadcast a student session reset / deletion so all student views reset to initial state.
 */
export function broadcastLiveSessionReset(payload: SessionResetPayload): void {
  if (!payload) return;

  // 1. BroadcastChannel
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({
        type: "SESSION_RESET",
        payload,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.warn("Failed to broadcast session reset via channel:", e);
    }
  }

  // 2. LocalStorage event
  try {
    localStorage.setItem(
      STORAGE_SYNC_KEY,
      JSON.stringify({ type: "SESSION_RESET", resetPayload: payload, timestamp: Date.now() })
    );
  } catch (e) {
    // ignore
  }

  // 3. In-tab listeners
  resetListeners.forEach((fn) => {
    try {
      fn(payload);
    } catch (err) {
      console.error("In-tab reset listener error:", err);
    }
  });
}

/**
 * Subscribe to session reset notifications across tabs.
 */
export function subscribeToSessionResets(listener: ResetListener): () => void {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}

