import { useState, useEffect, useRef } from "react";
import { getDDJ400Controller, DDJ400State, DDJ400Actions } from "../services/midi/ddj400";

export function useDDJ400(actions: DDJ400Actions) {
  const [controllerState, setControllerState] = useState<DDJ400State>({
    isConnected: false,
    deviceName: null,
    isJogTouching: false,
    pitchRate: 1.0,
    pitchPercent: 0.0,
    colorFilter: 0.0,
    eqLowDb: 0.0,
    eqMidDb: 0.0,
    eqHighDb: 0.0,
    channelVolume: 0.85
  });

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const controller = getDDJ400Controller();

    controller.initialize(actionsRef.current, (newState) => {
      setControllerState(newState);
    });

    return () => {
      // Keep controller alive across re-renders, updates actions dynamically
    };
  }, []);

  // Keep actions updated on re-render
  useEffect(() => {
    const controller = getDDJ400Controller();
    controller.updateActions(actions);
  }, [actions]);

  return controllerState;
}
