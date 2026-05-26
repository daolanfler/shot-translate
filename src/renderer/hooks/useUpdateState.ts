import { useEffect, useState } from "react";
import type { UpdateState } from "../../shared/types";
import { UpdateService } from "../services/UpdateService";

export function useUpdateState() {
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);

  useEffect(() => {
    let mounted = true;

    UpdateService.getState()
      .then((state) => {
        if (mounted) {
          setUpdateState(state);
        }
      })
      .catch((error: unknown) => {
        console.error("[useUpdateState]", error);
      });

    const unsubscribe = UpdateService.onStateChanged(setUpdateState);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { updateState };
}
