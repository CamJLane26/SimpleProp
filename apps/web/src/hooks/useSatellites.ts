import { useEffect, useState } from "react";
import type { Satellite } from "../types";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; satellites: Satellite[] };

export function useSatellites(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/satellites");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as Satellite[];
        if (!Array.isArray(data)) {
          throw new Error("Invalid satellite catalog response");
        }
        if (!cancelled) {
          setState({ status: "ready", satellites: data });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              err instanceof Error ? err.message : "Failed to load satellites",
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
