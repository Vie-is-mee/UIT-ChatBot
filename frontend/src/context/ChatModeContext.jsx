import React, { createContext, useState, useCallback } from 'react';
// Use built-in crypto.randomUUID() — no extra dependency needed
const uuidv4 = () => crypto.randomUUID();
import { clearSession } from '../api';

export const ChatModeContext = createContext();

// Mỗi scope (uit / cnpm) có session + messages riêng biệt
const freshState = (defaultYear) => ({
  messages: [],
  sessionId: uuidv4(),
  focusYear: defaultYear,
});

export const ChatModeProvider = ({ children }) => {
  const [mode, setMode] = useState('uit');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingQuery, setPendingQuery] = useState(null);

  // Lưu riêng state của từng mode để đổi qua lại không mất lịch sử
  const [uitState,  setUitState]  = useState(() => freshState('2006'));
  const [cnpmState, setCnpmState] = useState(() => freshState('2008'));

  // Helper lấy state của mode hiện tại
  const currentState = mode === 'uit' ? uitState : cnpmState;
  const setCurrentState = useCallback(
    (updater) => (mode === 'uit' ? setUitState : setCnpmState)(updater),
    [mode]
  );

  // Thêm tin nhắn vào state của mode hiện tại
  const addMessage = useCallback((msg) => {
    setCurrentState((prev) => ({ ...prev, messages: [...prev.messages, msg] }));
  }, [setCurrentState]);

  const setFocusYear = useCallback((year) => {
    setCurrentState((prev) => ({ ...prev, focusYear: year }));
  }, [setCurrentState]);

  // Đẩy 1 câu hỏi vào hàng đợi để ChatBox xử lý qua pipeline streaming
  const askQuery = useCallback((q) => {
    if (!q) return;
    setPendingQuery({ q, ts: Date.now() });
  }, []);
  const consumePendingQuery = useCallback(() => setPendingQuery(null), []);

  // Đổi mode — lịch sử của mode cũ được GIỮ LẠI
  const switchMode = useCallback((newMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setIsLoading(false);
  }, [mode]);

  // Cắt lịch sử từ index trở xuống + reset sessionId (dùng khi chỉnh sửa câu hỏi cũ)
  const editFromMessage = useCallback((index) => {
    const oldSessionId = currentState.sessionId;
    clearSession(oldSessionId).catch(() => {});
    setCurrentState((prev) => ({
      ...prev,
      messages: prev.messages.slice(0, index),
      sessionId: uuidv4(),
    }));
  }, [currentState.sessionId, setCurrentState]);

  // Tạo cuộc trò chuyện mới trong mode hiện tại
  const startNewSession = useCallback(async () => {
    const oldSessionId = currentState.sessionId;
    // Xoá lịch sử phía backend (best-effort)
    await clearSession(oldSessionId);
    // Reset state (messages + sessionId mới)
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
      messages:    currentState.messages,
      sessionId:   currentState.sessionId,
      focusYear:   currentState.focusYear,
      addMessage,
      setFocusYear,
      isLoading,
      setIsLoading,
      startNewSession,
      editFromMessage,
      pendingQuery,
      askQuery,
      consumePendingQuery,
    }}>
      {children}
    </ChatModeContext.Provider>
  );
};
