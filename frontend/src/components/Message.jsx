import React, { useContext, useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import FeedbackButtons from './FeedbackButtons';
import { ChatModeContext } from '../context/ChatModeContext';

function preprocessLinks(text) {
  // Thêm https:// vào URL chưa có protocol
  // Loại trừ URL đã có https://, http://, hay đang trong markdown [text](url)
  return text.replace(
    /(?<![/(:"'`\]])\b((?:www\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}|(?:facebook|fb|instagram|youtube|youtu|twitter|tiktok|zalo|linkedin|github|uit\.edu)\.(?:com|vn|net|org|edu|be)(?:\/[^\s<>"'`\]]*)?))(?=[^a-zA-Z]|$)/gi,
    (match) => `https://${match}`
  );
}
const mdComponents = (ink) => ({
  p:          ({ children }) => <p style={{ margin: '0 0 8px', lineHeight: 1.75 }}>{children}</p>,
  ul:         ({ children }) => <ul style={{ margin: '4px 0 8px', paddingLeft: 20 }}>{children}</ul>,
  ol:         ({ children }) => <ol style={{ margin: '4px 0 8px', paddingLeft: 20 }}>{children}</ol>,
  li:         ({ children }) => <li style={{ marginBottom: 4, lineHeight: 1.65 }}>{children}</li>,
  strong:     ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
  em:         ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: '3px solid #999', paddingLeft: 12, margin: '6px 0', color: '#777', fontStyle: 'italic' }}>
      {children}
    </blockquote>
  ),
  h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 700, margin: '8px 0 4px' }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 4px' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, margin: '6px 0 4px' }}>{children}</h3>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: '#2563eb',
        textDecoration: 'underline',
        textDecorationColor: '#2563eb',
        textUnderlineOffset: '2px',
        fontWeight: 500,
        wordBreak: 'break-all',
        transition: 'color .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#1d4ed8'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#2563eb'; }}
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13.5 }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr:    ({ children }) => <tr>{children}</tr>,
  th:    ({ children }) => (
    <th style={{ border: '1px solid rgba(0,0,0,0.18)', padding: '7px 10px', textAlign: 'left', fontWeight: 700, background: 'rgba(0,0,0,0.06)' }}>
      {children}
    </th>
  ),
  td:    ({ children }) => (
    <td style={{ border: '1px solid rgba(0,0,0,0.14)', padding: '7px 10px', verticalAlign: 'top' }}>
      {children}
    </td>
  ),
  code: ({ className, children }) => {
    const isBlock = !!className;
    return isBlock
      ? (
        <pre style={{ background: 'rgba(0,0,0,0.08)', padding: '10px 14px', borderRadius: 8, overflowX: 'auto', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", margin: '6px 0' }}>
          <code>{children}</code>
        </pre>
      )
      : (
        <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: 4, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
          {children}
        </code>
      );
  },
});

export default function Message({ msg, pal, brand, onChip, onEditSubmit }) {
  const { mode, switchMode } = useContext(ChatModeContext);
  const [hovered, setHovered]     = useState(false);
  const [copied, setCopied]       = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText]   = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // ── Tin nhắn người dùng ──────────────────────────────────────────────────────
  if (msg.role === 'user') {
    const handleCopy = () => {
      navigator.clipboard.writeText(msg.text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    };

    const handleEditClick = () => {
      setEditText(msg.text);
      setIsEditing(true);
    };

    const handleCancel = () => {
      setIsEditing(false);
      setEditText('');
    };

    const handleUpdate = () => {
      if (!editText.trim()) return;
      setIsEditing(false);
      if (onEditSubmit) onEditSubmit(editText.trim());
    };

    return (
      <div
        style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14, position: 'relative' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, maxWidth: '75%' }}>
          {/* Bubble */}
          {!isEditing ? (
            <div style={{
              padding: '11px 16px', borderRadius: '18px 18px 4px 18px',
              background: `linear-gradient(135deg, ${pal.accent}, ${pal.accent2})`,
              color: '#fff', fontSize: 14.5, lineHeight: 1.55,
              boxShadow: `0 10px 30px -10px ${pal.accent}60`,
            }}>
              {msg.text}
            </div>
          ) : (
            /* Inline edit textarea */
            <div style={{
              width: '100%', minWidth: 320,
              borderRadius: 12,
              border: `2px solid ${pal.accent}`,
              background: pal.panel,
              overflow: 'hidden',
              boxShadow: `0 8px 32px -8px ${pal.accent}40`,
              animation: 'fadeUp .2s both',
            }}>
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUpdate(); }
                  if (e.key === 'Escape') handleCancel();
                }}
                rows={Math.min(10, Math.max(3, editText.split('\n').length + 1))}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '12px 16px',
                  background: 'transparent', border: 'none', outline: 'none',
                  color: pal.ink, fontSize: 14.5, lineHeight: 1.65,
                  fontFamily: 'inherit', resize: 'vertical',
                  minHeight: '80px', maxHeight: '220px', overflowY: 'auto',
                }}
              />
              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: 8,
                padding: '8px 12px',
                borderTop: `1px solid ${pal.accent}20`,
                background: `${pal.soft}`,
              }}>
                <button
                  onClick={handleCancel}
                  style={{
                    padding: '5px 14px', borderRadius: 7, border: `1px solid ${pal.accent}30`,
                    background: 'transparent', color: pal.mute, cursor: 'pointer',
                    fontSize: 12.5, fontFamily: 'inherit', transition: 'all .15s',
                  }}
                >
                  Huỷ
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={!editText.trim()}
                  style={{
                    padding: '5px 14px', borderRadius: 7, border: 'none',
                    background: `linear-gradient(135deg, ${pal.accent}, ${pal.accent2})`,
                    color: '#fff', cursor: editText.trim() ? 'pointer' : 'not-allowed',
                    fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                    opacity: editText.trim() ? 1 : 0.5, transition: 'all .15s',
                  }}
                >
                  Cập nhật
                </button>
              </div>
            </div>
          )}

          {/* Action buttons — below bubble, only icons, shown on hover */}
          {!isEditing && (
            <div style={{
              display: 'flex', gap: 6,
              opacity: hovered ? 1 : 0,
              transition: 'opacity .15s',
              pointerEvents: hovered ? 'auto' : 'none',
            }}>
              {/* Copy button */}
              <IconBtn
                title={copied ? 'Đã sao chép!' : 'Sao chép văn bản'}
                onClick={handleCopy}
                pal={pal}
                active={copied}
              >
                {copied ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  /* Two-pages copy icon */
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                )}
              </IconBtn>

              {/* Edit button */}
              <IconBtn
                title="Chỉnh sửa văn bản"
                onClick={handleEditClick}
                pal={pal}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                </svg>
              </IconBtn>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Tin nhắn bot ─────────────────────────────────────────────────────────────
  const otherMode  = mode === 'uit' ? 'cnpm' : 'uit';
  const otherLabel = mode === 'uit' ? 'Khám phá Khoa CNPM' : 'Xem toàn Trường UIT';

  const validSources = (msg.sources || []).filter(
    (src) => src && typeof src === 'object' && src.url && src.url.trim() !== ''
  );

  const processedText = preprocessLinks(msg.text || '');

  const handleBotCopy = () => {
    navigator.clipboard.writeText(msg.text || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  // Tin nhắn hệ thống đặc biệt (dừng sinh text)
  if (msg.role === 'bot' && msg.stopped) {
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
            padding: '10px 16px', borderRadius: '4px 16px 16px 16px',
            background: `${pal.accent}10`, border: `1px dashed ${pal.accent}40`,
            color: pal.mute, fontSize: 13, fontStyle: 'italic',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
            Người dùng đã dừng sinh câu trả lời
          </div>
          {/* Suggestions after stop */}
          {msg.suggestions && msg.suggestions.length > 0 && (
            <div style={{ marginTop: 10, animation: 'fadeUp .4s 0.1s both' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {msg.suggestions.map((c, i) => (
                  <SuggestionChip key={i} label={c} pal={pal} onClick={() => onChip && onChip(c)} />
                ))}
              </div>
              <SwitchModeButton label={otherLabel} pal={pal} onClick={() => switchMode(otherMode)} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'flex-start' }}>
      {/* Avatar */}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Bubble trả lời */}
          <div style={{
            borderRadius: '4px 16px 16px 16px',
            background: `linear-gradient(180deg, ${pal.soft}, ${pal.panel})`,
            border: `1px solid ${pal.accent}25`,
            boxShadow: pal.isDark ? 'none' : '0 6px 24px -16px rgba(10,26,58,0.35)',
            color: pal.ink,
            fontFamily: "'Be Vietnam Pro', sans-serif",
            animation: 'fadeUp .5s both',
          }}>
            {/* Dòng trên cùng: badge trái + nút copy phải */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 12px 9px 18px',
              borderBottom: `1px solid ${pal.accent}18`,
              background: `${pal.accent}08`,
            }}>
              <div style={{
                padding: '2px 10px', background: pal.gold,
                color: pal.isDark ? pal.bg : '#fff',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', borderRadius: 4,
                display: 'inline-block',
              }}>TRẢ LỜI</div>

              <BotCopyBtn pal={pal} onCopy={handleBotCopy} copied={copied} />
            </div>

            {/* Nội dung văn bản bên dưới */}
            <div style={{ padding: '14px 18px', lineHeight: 1.75, fontSize: 14.5 }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={mdComponents(pal.ink)}
              >
                {processedText}
              </ReactMarkdown>
            </div>
          </div>

          {/* Gợi ý + nút chuyển phạm vi */}
          {msg.suggestions && msg.suggestions.length > 0 && (
            <div style={{ animation: 'fadeUp .5s 0.25s both' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {msg.suggestions.map((c, i) => (
                  <SuggestionChip key={i} label={c} pal={pal} onClick={() => onChip && onChip(c)} />
                ))}
              </div>
              <SwitchModeButton label={otherLabel} pal={pal} onClick={() => switchMode(otherMode)} />
            </div>
          )}
        </div>

        {/* Nguồn tài liệu */}
        {validSources.length > 0 && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: `${pal.accent}08`, border: `1px solid ${pal.accent}20` }}>
            <div style={{ fontSize: 10.5, color: pal.mute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>
              Nguồn tham khảo
            </div>
            {validSources.map((src, i) => (
              <SourceItem key={i} src={src} pal={pal} />
            ))}
          </div>
        )}

        {/* Feedback */}
        {msg.id && (
          <FeedbackButtons
            messageId={msg.id}
            accentColor={pal.accent}
            question={msg.question || ''}
            answer={msg.text || ''}
          />
        )}
      </div>
    </div>
  );
}

/* ── Copy button below bot bubble (inline, không absolute) ────────────────── */
function BotCopyBtn({ pal, onCopy, copied }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={onCopy}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        title={copied ? 'Đã sao chép!' : 'Sao chép văn bản'}
        style={{
          width: 34, height: 34, borderRadius: 8,
          border: `1px solid ${copied ? pal.accent + '70' : pal.accent + '30'}`,
          background: hov ? `${pal.accent}18` : 'transparent',
          color: copied ? pal.accent : pal.mute,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .15s',
        }}
      >
        {copied ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        )}
      </button>
    </div>
  );
}

/* ── Icon-only action button for user messages ────────────────────────────── */
function IconBtn({ children, onClick, title, pal, active }) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 32, height: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8,
        border: `1px solid ${active ? pal.accent + '60' : pal.accent + '30'}`,
        background: hov ? `${pal.accent}14` : `${pal.panel}cc`,
        color: active ? pal.accent : pal.mute,
        cursor: 'pointer',
        transition: 'all .15s', backdropFilter: 'blur(4px)',
      }}
    >
      {children}
    </button>
  );
}

/* ── Source item ──────────────────────────────────────────────────────────── */
function SourceItem({ src, pal }) {
  const isWeb   = src.source_type === 'web';
  const label   = src.title || src.url;
  const display = label.replace(/^https?:\/\//, '').substring(0, 60);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{
        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
        background: isWeb ? `${pal.accent2}25` : `${pal.gold}25`,
        color: isWeb ? pal.accent2 : pal.gold,
        letterSpacing: '0.08em', flexShrink: 0,
      }}>
        {isWeb ? 'WEB' : 'DB'}
      </span>
      <a
        href={src.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: '#2563eb',
          fontSize: 11.5,
          textDecoration: 'underline',
          textDecorationColor: '#2563eb',
          textUnderlineOffset: '2px',
          wordBreak: 'break-all',
        }}
        title={src.url}
      >
        {display}{display.length < label.replace(/^https?:\/\//, '').length ? '…' : ''}
      </a>
    </div>
  );
}

function SuggestionChip({ label, pal, onClick }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '7px 12px', borderRadius: 99,
        background: hovered ? `${pal.accent}15` : 'transparent',
        border: `1px solid ${hovered ? pal.accent : pal.accent + '50'}`,
        color: pal.accent, fontSize: 12.5, cursor: 'pointer',
        fontWeight: 500, fontFamily: 'inherit',
        transition: 'all .15s',
      }}>
      {label}
    </button>
  );
}

function SwitchModeButton({ label, pal, onClick }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 14px', borderRadius: 99,
        background: hovered ? `${pal.warm}18` : 'transparent',
        border: `1px dashed ${pal.warm}80`,
        color: pal.warm, fontSize: 12, cursor: 'pointer',
        fontWeight: 600, fontFamily: 'inherit',
        transition: 'all .18s', letterSpacing: '0.01em',
      }}>
      {label}
    </button>
  );
}
