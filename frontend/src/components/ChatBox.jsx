import React, { useContext, useState, useRef, useEffect, useCallback } from 'react';
import { ChatModeContext } from '../context/ChatModeContext';
import { sendChatMessageStream } from '../api';
import Message from './Message';

const DEFAULT_STOP_SUGGESTIONS = [
  'Lịch sử UIT?',
  'Các ngành đào tạo?',
  'Đời sống sinh viên UIT?',
];

export default function ChatBox({ pal, brand, suggested, apiKey }) {
  const {
    mode, messages, addMessage, truncateMessages, isLoading, setIsLoading,
    sessionId, startNewSession,
  } = useContext(ChatModeContext);

  const [input, setInput]                   = useState('');
  const [thinkingStages, setThinkingStages] = useState([]);
  const [streamingText, setStreamingText]   = useState('');
  const [isStreaming, setIsStreaming]       = useState(false);
  const scrollRef        = useRef(null);
  const streamingDoneRef = useRef(null);
  const streamingTextRef = useRef('');
  const abortControllerRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, thinkingStages, streamingText]);

  // ── Hàm dừng stream ─────────────────────────────────────────────────────────
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const partialText = streamingTextRef.current;
    const doneData    = streamingDoneRef.current;

    setThinkingStages([]);
    setStreamingText('');
    setIsStreaming(false);
    setIsLoading(false);
    streamingTextRef.current = '';

    // Lưu phần đã sinh (nếu có)
    if (partialText.trim()) {
      addMessage({
        id: doneData?.message_id ?? null,
        role: 'bot',
        text: partialText,
        question: '',
        suggestions: [],
        sources: doneData?.sources || [],
      });
    }

    // Thêm tin nhắn dừng kèm gợi ý
    addMessage({
      id: null,
      role: 'bot',
      stopped: true,
      text: '',
      suggestions: DEFAULT_STOP_SUGGESTIONS,
      sources: [],
    });
  };

  // ── Gửi tin nhắn ────────────────────────────────────────────────────────────
  const handleSendFinal = async (q) => {
    if (!q.trim() || isLoading) return;
    setInput('');
    addMessage({ role: 'user', text: q });
    setIsLoading(true);
    setThinkingStages([]);
    setStreamingText('');
    setIsStreaming(false);
    streamingTextRef.current = '';
    streamingDoneRef.current = null;
    streamingDoneRef._fullText = '';

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const isFirst = messages.filter((m) => m.role === 'bot').length === 0;

    await sendChatMessageStream(
      q, mode, isFirst, sessionId, apiKey,
      {
        onThinking: (stage, message) => {
          setThinkingStages((prev) => {
            const updated = prev.map((s) => ({ ...s, done: true }));
            return [...updated, { stage, message, done: false }];
          });
        },
        onToken: (text) => {
          setIsStreaming(true);
          setStreamingText((prev) => {
            const next = prev + text;
            streamingTextRef.current = next;
            if (streamingDoneRef._fullText !== undefined)
              streamingDoneRef._fullText = next;
            return next;
          });
        },
        onDone: (data) => {
          streamingDoneRef.current = data;
          streamingDoneRef._fullText = streamingTextRef.current;
        },
        onError: () => {
          setThinkingStages([]);
          setStreamingText('');
          setIsStreaming(false);
          setIsLoading(false);
          addMessage({
            id: null, role: 'bot',
            text: 'Rất tiếc, có lỗi xảy ra. Bạn thử lại nhé.',
            question: q, suggestions: [], sources: [],
          });
        },
      },
      controller.signal
    );

    if (controller.signal.aborted) return;

    const doneData = streamingDoneRef.current;
    const fullText = streamingTextRef.current;
    setThinkingStages([]);
    setStreamingText('');
    setIsStreaming(false);
    setIsLoading(false);

    if (doneData) {
      addMessage({
        id: doneData.message_id,
        role: 'bot',
        text: fullText,
        question: q,
        suggestions: doneData.suggestions || [],
        sources: doneData.sources || [],
      });
    }
  };

  const handleNewChat = async () => {
    if (isLoading) return;
    await startNewSession();
  };

  const hasMessages  = messages.length > 0;
  const isThinking   = thinkingStages.length > 0 && !isStreaming;
  const showStreaming = streamingText.length > 0;

  return (
    <section style={{
      background: pal.isDark ? pal.panel : '#ffffff',
      borderRadius: 20,
      border: `1px solid ${pal.accent}${pal.isDark ? '30' : '22'}`,
      minHeight: 580, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: pal.isDark
        ? `0 30px 80px -40px ${pal.accent}80`
        : '0 30px 80px -40px rgba(29,78,216,0.35)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${pal.accent}${pal.isDark ? '20' : '15'}`,
        background: pal.isDark ? 'transparent' : pal.soft + '60',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: pal.warm, boxShadow: `0 0 12px ${pal.warm}` }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: pal.ink }}>{brand.botName}</div>
          {brand.botBadge && (
            <div style={{ fontSize: 11, color: pal.mute, padding: '2px 8px', borderRadius: 99, background: `${pal.accent}15`, border: `1px solid ${pal.accent}30` }}>
              {brand.botBadge}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {hasMessages && (
            <NewChatButton pal={pal} onClick={handleNewChat} disabled={isLoading} />
          )}
          <div style={{ fontSize: 11, color: pal.mute, fontFamily: "'JetBrains Mono', monospace" }}>
            {brand.version}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '28px 28px 8px',
        scrollbarWidth: 'thin', scrollbarColor: `${pal.accent}40 transparent`,
      }}>
        {!hasMessages && !isLoading && (
          <EmptyState pal={pal} mode={mode} suggested={suggested} onAsk={handleSendFinal} />
        )}

        {messages.map((msg, i) => (
          <Message
            key={i}
            msg={msg}
            pal={pal}
            brand={brand}
            onChip={handleSendFinal}
            onEditSubmit={(newText) => {
              if (isLoading) return;
              truncateMessages(i);
              handleSendFinal(newText);
            }}
          />
        ))}

        {/* Thinking stages */}
        {isLoading && thinkingStages.length > 0 && (
          <ThinkingPanel stages={thinkingStages} streaming={showStreaming} pal={pal} brand={brand} />
        )}

        {/* Streaming text bubble */}
        {showStreaming && (
          <StreamingBubble text={streamingText} pal={pal} brand={brand} />
        )}

        {/* Initial loading */}
        {isLoading && thinkingStages.length === 0 && !showStreaming && (
          <InitialLoader pal={pal} />
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-4 sm:p-[14px_18px_18px]" style={{ borderTop: `1px solid ${pal.accent}${pal.isDark ? '20' : '15'}`, flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 6px 6px 16px', borderRadius: 14,
          background: pal.soft, border: `1px solid ${pal.accent}35`,
        }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSendFinal(input)}
            placeholder={isLoading ? 'Đang xử lý...' : brand.placeholder}
            disabled={isLoading && !isStreaming}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: pal.ink, fontSize: 14, padding: '10px 0', fontFamily: 'inherit',
              minWidth: 0, opacity: (isLoading && !isStreaming) ? 0.5 : 1,
            }}
          />

          {/* Nút DỪNG hoặc GỬI */}
          {isLoading ? (
            <StopButton pal={pal} onClick={handleStop} />
          ) : (
            <SendButton pal={pal} onClick={() => handleSendFinal(input)} disabled={!input.trim()} />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: pal.mute }}>
          <div className="hidden sm:block">
            {isStreaming ? '■ Nhấn ô vuông để dừng' : '↵ Enter để gửi'}
          </div>
          <div className="sm:hidden"></div>
          <div>{mode === 'uit' ? 'UIT · 2006—2026' : 'Khoa CNPM · 2008—2026'}</div>
        </div>
      </div>
    </section>
  );
}

/* ── Nút GỬI (mũi tên hướng lên) ────────────────────────────────────────── */
function SendButton({ pal, onClick, disabled }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Gửi tin nhắn"
      style={{
        width: 40, height: 40, borderRadius: 10, border: 'none', flexShrink: 0,
        background: disabled
          ? `${pal.accent}40`
          : hovered
            ? `linear-gradient(135deg, ${pal.accent2}, ${pal.accent})`
            : `linear-gradient(135deg, ${pal.accent}, ${pal.accent2})`,
        color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: disabled ? 'none' : `0 8px 24px -8px ${pal.accent}80`,
        transition: 'all .18s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {/* Up arrow */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="19" x2="12" y2="5"/>
        <polyline points="5 12 12 5 19 12"/>
      </svg>
    </button>
  );
}

/* ── Nút DỪNG ────────────────────────────────────────────────────────────── */
function StopButton({ pal, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Dừng sinh text"
      style={{
        width: 40, height: 40, borderRadius: 10, border: 'none', flexShrink: 0,
        background: hovered
          ? `linear-gradient(135deg, #ef4444, #dc2626)`
          : `linear-gradient(135deg, ${pal.accent}90, ${pal.accent2}90)`,
        color: '#fff', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: hovered ? '0 8px 24px -8px #ef444480' : `0 8px 24px -8px ${pal.accent}60`,
        transition: 'all .18s',
      }}
    >
      <div style={{
        width: 14, height: 14, borderRadius: 2,
        background: '#fff',
        boxShadow: hovered ? '0 0 8px rgba(255,255,255,0.8)' : 'none',
        transition: 'box-shadow .18s',
      }} />
    </button>
  );
}

/* ── Nút cuộc trò chuyện mới ─────────────────────────────────────────────── */
function NewChatButton({ pal, onClick, disabled }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Bắt đầu cuộc trò chuyện mới"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 14px', borderRadius: 8,
        border: `1px solid ${pal.accent}60`,
        background: hovered
          ? `linear-gradient(135deg, ${pal.accent}, ${pal.accent2})`
          : `${pal.accent}18`,
        color: hovered ? '#fff' : pal.accent,
        fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', transition: 'all .18s',
        opacity: disabled ? 0.5 : 1,
        boxShadow: hovered ? `0 4px 16px -4px ${pal.accent}60` : 'none',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Cuộc trò chuyện mới
    </button>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
function EmptyState({ pal, mode, suggested, onAsk }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px 0', width: '100%' }}>
      <div style={{
        display: 'inline-block', padding: '6px 14px', borderRadius: 99,
        background: `${pal.warm}15`, border: `1px solid ${pal.warm}40`, color: pal.warm,
        fontSize: 11, letterSpacing: '0.2em', fontWeight: 700, marginBottom: 20,
      }}>BẮT ĐẦU HÀNH TRÌNH</div>

      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, lineHeight: 1.4, color: pal.ink, maxWidth: 500, margin: '0 auto 8px', letterSpacing: '-0.01em' }}>
        "Mỗi câu hỏi của bạn sẽ{' '}
        <em style={{ color: pal.warm, fontStyle: 'italic' }}>mở ra một chương</em>
        {' '}trong cuốn sách {mode === 'uit' ? '20' : '18'} năm."
      </div>
      <div style={{ fontSize: 13, color: pal.mute, marginBottom: 24 }}>
        Chọn một chủ đề bên dưới, hoặc tự gõ câu hỏi của bạn.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-[560px] mx-auto text-left">
        {suggested.map((s, i) => (
          <PromptCard key={i} s={s} pal={pal} onClick={() => onAsk(s.q)} />
        ))}
      </div>
    </div>
  );
}

function PromptCard({ s, pal, onClick }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', borderRadius: 12,
        background: pal.soft,
        border: `1px solid ${hovered ? pal.warm : pal.accent + '25'}`,
        color: pal.ink, fontSize: 13.5, cursor: 'pointer',
        textAlign: 'left', fontFamily: 'inherit',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all .2s',
      }}>
      <div style={{ lineHeight: 1.35 }}>{s.label}</div>
    </button>
  );
}

/* ── Loader ban đầu ───────────────────────────────────────────────────────── */
function InitialLoader({ pal }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'center' }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: `conic-gradient(from 200deg, ${pal.accent}, ${pal.gold}, ${pal.accent2}, ${pal.accent})`,
        animation: 'spin 3s linear infinite',
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: pal.panel }} />
      </div>
      <div style={{
        padding: '10px 16px', borderRadius: 16,
        background: pal.panel, border: `1px solid ${pal.accent}25`,
        fontSize: 13, color: pal.mute, fontStyle: 'italic',
      }}>
        Đang kết nối...
      </div>
    </div>
  );
}

/* ── Thinking panel ───────────────────────────────────────────────────────── */
function ThinkingPanel({ stages, streaming, pal, brand }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'flex-start' }}>
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
        background: `conic-gradient(from 200deg, ${pal.accent}, ${pal.gold}, ${pal.accent2}, ${pal.accent})`,
        display: 'grid', placeItems: 'center', marginTop: 2,
        boxShadow: `0 4px 16px -4px ${pal.accent}80`, padding: 2,
      }}>
        <img src="/uit.jpg" alt=""
          style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', background: pal.panel, padding: 2 }} />
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: pal.mute, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 600 }}>
          {brand.botName}
        </div>
        <div style={{
          padding: '12px 16px', borderRadius: '4px 14px 14px 14px',
          background: `linear-gradient(180deg, ${pal.soft}, ${pal.panel})`,
          border: `1px solid ${pal.accent}25`,
          display: 'flex', flexDirection: 'column', gap: 6,
          animation: 'fadeUp .3s both',
        }}>
          {stages.map((s, i) => (
            <ThinkingLine key={s.stage + i} stage={s} pal={pal} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ThinkingLine({ stage, pal }) {
  const isActive = !stage.done;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 13, lineHeight: 1.5,
      color: stage.done ? pal.mute : pal.ink,
      opacity: stage.done ? 0.55 : 1,
      transition: 'opacity .3s',
    }}>
      <span style={{
        display: 'inline-block',
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: stage.done ? pal.mute : pal.accent,
        boxShadow: isActive ? `0 0 0 3px ${pal.accent}30` : 'none',
        animation: isActive ? 'pulse 1.4s ease-in-out infinite' : 'none',
      }} />
      <span style={{ fontStyle: isActive ? 'italic' : 'normal' }}>
        {stage.message}
        {isActive && <AnimatedDots />}
      </span>
    </div>
  );
}

function AnimatedDots() {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 400);
    return () => clearInterval(id);
  }, []);
  return <span style={{ opacity: 0.7 }}>{dots}</span>;
}

function renderWithLinks(text) {
  const urlRegex = /(https?:\/\/[^\s<>"']+[^\s<>"'.,!?)\]]|(?:www\.|(?:facebook|fb|instagram|youtube|youtu|twitter|tiktok|zalo|linkedin|github)\.(?:com|vn|net|org|be))(?:\/[^\s<>"']*)?|(?:[a-zA-Z0-9-]+\.(?:edu\.vn|ac\.vn))(?:\/[^\s<>"']*)?)/gi;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const raw = match[0];
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    parts.push(
      <a key={match.index} href={href} target="_blank" rel="noopener noreferrer"
        style={{ color: '#2563eb', textDecoration: 'underline', textDecorationColor: '#2563eb', textUnderlineOffset: '2px', wordBreak: 'break-all' }}>
        {raw}
      </a>
    );
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/* ── Streaming bubble ─────────────────────────────────────────────────────── */
function StreamingBubble({ text, pal, brand }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'flex-start' }}>
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
        background: `conic-gradient(from 200deg, ${pal.accent}, ${pal.gold}, ${pal.accent2}, ${pal.accent})`,
        display: 'grid', placeItems: 'center', marginTop: 2,
        boxShadow: `0 4px 16px -4px ${pal.accent}80`, padding: 2,
      }}>
        <img src="/uit.jpg" alt=""
          style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', background: pal.panel, padding: 2 }} />
      </div>

      <div style={{ maxWidth: '82%', minWidth: 0 }}>
        <div style={{ fontSize: 11, color: pal.mute, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
          {brand.botName}
        </div>
        <div style={{
          padding: '16px 18px', borderRadius: '4px 16px 16px 16px',
          background: `linear-gradient(180deg, ${pal.soft}, ${pal.panel})`,
          border: `1px solid ${pal.accent}25`,
          color: pal.ink, fontSize: 14.5, lineHeight: 1.75,
          fontFamily: "'Be Vietnam Pro', sans-serif",
          animation: 'fadeUp .3s both',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: -8, left: 18,
            padding: '1px 8px', background: pal.gold,
            color: pal.isDark ? pal.bg : '#fff',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', borderRadius: 4,
          }}>TRẢ LỜI</div>
          {renderWithLinks(text)}
          <span style={{
            display: 'inline-block', width: 2, height: '1em',
            background: pal.accent, marginLeft: 2, verticalAlign: 'text-bottom',
            animation: 'blink 0.8s step-end infinite',
          }} />
        </div>
      </div>
    </div>
  );
}
