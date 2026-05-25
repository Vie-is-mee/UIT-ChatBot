import React, { useContext, useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import FeedbackButtons from './FeedbackButtons';
import { ChatModeContext } from '../context/ChatModeContext';

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
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '8px 0', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ minWidth: '100%', borderCollapse: 'collapse', fontSize: 13.5, fontFamily: 'inherit' }}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ background: 'rgba(0,0,0,0.06)' }}>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr:    ({ children }) => <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>{children}</tr>,
  th:    ({ children, style }) => (
    <th style={{ padding: '8px 10px', textAlign: style?.textAlign || 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</th>
  ),
  td:    ({ children, style }) => (
    <td style={{ padding: '8px 10px', textAlign: style?.textAlign || 'left', verticalAlign: 'top', wordBreak: 'break-word' }}>{children}</td>
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

export default function Message({ msg, pal, brand, onChip, onEdit, index, canEdit }) {
  const { mode, switchMode } = useContext(ChatModeContext);
  const [copied, setCopied] = useState(false);
  const [copyHover, setCopyHover] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(msg.text || '');
      } else {
        const ta = document.createElement('textarea');
        ta.value = msg.text || '';
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (msg.role === 'user') {
    return (
      <UserMessage
        msg={msg}
        pal={pal}
        index={index}
        onEdit={onEdit}
        canEdit={canEdit}
      />
    );
  }

  const otherMode  = mode === 'uit' ? 'cnpm' : 'uit';
  const otherLabel = mode === 'uit' ? 'Khám phá Khoa CNPM' : 'Xem toàn Trường UIT';

  const validSources = (msg.sources || []).filter(
    (src) => src && typeof src === 'object' && src.url && src.url.trim() !== ''
  );

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: pal.mute, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>
            {brand.botName}
          </div>
          <button
            onClick={handleCopy}
            onMouseEnter={() => setCopyHover(true)}
            onMouseLeave={() => setCopyHover(false)}
            title={copied ? 'Đã sao chép' : 'Sao chép câu trả lời'}
            aria-label="Sao chép câu trả lời"
            style={{
              width: 32, height: 32, padding: 0, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8,
              border: `1px solid ${pal.accent}30`,
              background: copyHover || copied
                ? (pal.isDark ? `${pal.accent}25` : `${pal.accent}12`)
                : (pal.isDark ? `${pal.panel}cc` : '#ffffffcc'),
              color: copied ? pal.accent : pal.mute,
              cursor: 'pointer', transition: 'all .15s',
            }}>
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Bubble tra loi */}
          <div style={{
            padding: '16px 18px', borderRadius: '4px 16px 16px 16px',
            background: `linear-gradient(180deg, ${pal.soft}, ${pal.panel})`,
            border: `1px solid ${pal.accent}25`,
            boxShadow: pal.isDark ? 'none' : '0 6px 24px -16px rgba(10,26,58,0.35)',
            color: pal.ink, lineHeight: 1.75, fontSize: 14.5,
            fontFamily: "'Be Vietnam Pro', sans-serif",
            animation: 'fadeUp .5s both',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -8, left: 18,
              padding: '1px 8px', background: pal.gold,
              color: pal.isDark ? pal.bg : '#fff',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', borderRadius: 4,
            }}>TRẢ LỜI</div>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={mdComponents(pal.ink)}
            >
              {msg.text}
            </ReactMarkdown>
          </div>

          {/* Goi y tiep + nut chuyen pham vi */}
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

        {/* Nguon tai lieu */}
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
        style={{ color: pal.accent2, fontSize: 11.5, textDecoration: 'none', wordBreak: 'break-all' }}
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

function UserMessage({ msg, pal, index, onEdit, canEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.text);
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const taRef = useRef(null);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(msg.text || '');
      } else {
        const ta = document.createElement('textarea');
        ta.value = msg.text || '';
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [editing]);

  const autoresize = (e) => {
    setDraft(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  const cancel = () => {
    setDraft(msg.text);
    setEditing(false);
  };

  const submit = () => {
    const next = draft.trim();
    if (!next) return;
    setEditing(false);
    onEdit?.(index, next);
  };

  if (editing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <div style={{
          width: '75%', maxWidth: 560,
          padding: 14, borderRadius: 14,
          background: pal.isDark ? `${pal.panel}` : '#ffffff',
          border: `2px solid ${pal.accent}`,
          boxShadow: `0 10px 30px -10px ${pal.accent}80`,
        }}>
          <textarea
            ref={taRef}
            value={draft}
            onChange={autoresize}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              if (e.key === 'Escape') cancel();
            }}
            rows={1}
            style={{
              width: '100%', resize: 'vertical', minHeight: 64,
              background: 'transparent', border: 'none', outline: 'none',
              color: pal.ink, fontSize: 14.5, lineHeight: 1.55,
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button
              onClick={cancel}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: 'transparent', color: pal.mute, fontSize: 13,
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
              }}>
              Huỷ
            </button>
            <button
              onClick={submit}
              disabled={!draft.trim()}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: `linear-gradient(135deg, ${pal.accent}, ${pal.accent2})`,
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: draft.trim() ? 'pointer' : 'not-allowed',
                opacity: draft.trim() ? 1 : 0.5,
                fontFamily: 'inherit',
                boxShadow: `0 6px 18px -8px ${pal.accent}`,
              }}>
              Cập nhật
            </button>
          </div>
        </div>
      </div>
    );
  }

  const iconBtnStyle = {
    width: 32, height: 32, padding: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8,
    border: `1px solid ${pal.accent}30`,
    background: pal.isDark ? `${pal.panel}cc` : '#ffffff',
    cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all .15s',
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: 14 }}
    >
      <div style={{
        maxWidth: '75%', padding: '11px 16px', borderRadius: '18px 18px 4px 18px',
        background: `linear-gradient(135deg, ${pal.accent}, ${pal.accent2})`,
        color: '#fff', fontSize: 14.5, lineHeight: 1.55,
        boxShadow: `0 10px 30px -10px ${pal.accent}60`,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {msg.text}
      </div>

      <div style={{
        display: 'flex', gap: 6, marginTop: 8,
        opacity: hovered || copied ? 1 : 0.55,
        transition: 'opacity .15s',
      }}>
        <button
          onClick={handleCopy}
          title={copied ? 'Đã sao chép' : 'Sao chép câu hỏi'}
          aria-label="Sao chép câu hỏi"
          style={{ ...iconBtnStyle, color: copied ? pal.accent : pal.mute }}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            title="Chỉnh sửa"
            aria-label="Chỉnh sửa câu hỏi"
            style={{ ...iconBtnStyle, color: pal.mute }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
