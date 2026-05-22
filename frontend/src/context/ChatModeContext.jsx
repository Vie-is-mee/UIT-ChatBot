import React, { createContext, useState, useCallback } from 'react';
const uuidv4 = () => crypto.randomUUID();
import { clearSession } from '../api';

export const ChatModeContext = createContext();

const freshState = (defaultYear) => ({
  messages: [],
  sessionId: uuidv4(),
  focusYear: defaultYear,
});

export const ChatModeProvider = ({ children }) => {
  const [mode, setMode] = useState('uit');
  const [isLoading, setIsLoading] = useState(false);

  const [uitState,  setUitState]  = useState(() => freshState('2006'));
  const [cnpmState, setCnpmState] = useState(() => freshState('2008'));

  const currentState = mode === 'uit' ? uitState : cnpmState;
  const setCurrentState = useCallback(
    (updater) => (mode === 'uit' ? setUitState : setCnpmState)(updater),
    [mode]
  );

  const addMessage = useCallback((msg) => {
    setCurrentState((prev) => ({ ...prev, messages: [...prev.messages, msg] }));
  }, [setCurrentState]);

  // Cắt bỏ tất cả messages từ index `fromIndex` trở đi
  const truncateMessages = useCallback((fromIndex) => {
    setCurrentState((prev) => ({
      ...prev,
      messages: prev.messages.slice(0, fromIndex),
    }));
  }, [setCurrentState]);

  const switchMode = useCallback((newMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setIsLoading(false);
  }, [mode]);

  const startNewSession = useCallback(async () => {
    const oldSessionId = currentState.sessionId;
    await clearSession(oldSessionId);
    setCurrentState({
      messages: [],
      sessionId: uuidv4(),
      focusYear: mode === 'uit' ? '2006' : '2008',
    });
    setIsLoading(false);
  }, [mode, currentState.sessionId, setCurrentState]);

  return (
    <ChatModeContext.Provider value={{
      mode,
      switchMode,
      messages:         currentState.messages,
      sessionId:        currentState.sessionId,
      focusYear:        currentState.focusYear,
      addMessage,
      truncateMessages,
      isLoading,
      setIsLoading,
      startNewSession,
    }}>
      {children}
    </ChatModeContext.Provider>
  );
};
