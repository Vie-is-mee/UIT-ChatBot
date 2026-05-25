import React, { useContext, useState } from 'react';
import { ChatModeContext } from '../context/ChatModeContext';

export default function Timeline({ pal, brand, timeline }) {
  const { mode, focusYear, setFocusYear, askQuery, isLoading } = useContext(ChatModeContext);
  const [hoverYear, setHoverYear] = useState(null);

  const handlePick = (item) => {
    if (isLoading) return;
    setFocusYear?.(item.year);
    const scopeLabel = mode === 'uit' ? 'Trường UIT' : 'Khoa Công nghệ Phần mềm';
    const q = `Kể về dấu mốc năm ${item.year} — ${item.title} trong hành trình phát triển của ${scopeLabel}.`;
    askQuery(q);
  };

  return (
    <aside style={{
      background: pal.isDark ? pal.panel : '#ffffff',
      borderRadius: 20, padding: '18px 16px 20px',
      border: `1px solid ${pal.accent}${pal.isDark ? '30' : '22'}`,
      boxShadow: pal.isDark ? 'none' : '0 20px 60px -30px rgba(29,78,216,0.18)',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 22,
      maxHeight: 'calc(100vh - 44px)',
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '0 8px' }}>
        <div>
          <div style={{ fontSize: 11, color: pal.warm, letterSpacing: '0.2em', fontWeight: 700 }}>HÀNH TRÌNH</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, marginTop: 2, color: pal.ink }}>{brand.timelineTitle}</div>
          <div style={{ fontSize: 10.5, color: pal.mute, marginTop: 4, letterSpacing: '0.05em' }}>
            Chạm một cột mốc để nghe câu chuyện ↓
          </div>
        </div>
        <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: pal.mute, padding: '3px 8px', borderRadius: 6, background: `${pal.accent}15` }}>
          {focusYear}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', flex: 1 }}>
        <div style={{
          position: 'absolute', left: 11, top: 6, bottom: 6, width: 1,
          background: `linear-gradient(to bottom, transparent, ${pal.accent}80, ${pal.gold}, ${pal.accent}80, transparent)`,
        }} />
        {timeline.map((t) => {
          const active  = t.year === focusYear;
          const hovered = t.year === hoverYear;
          return (
            <div
              key={t.year}
              role="button"
              tabIndex={0}
              onClick={() => handlePick(t)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handlePick(t)}
              onMouseEnter={() => setHoverYear(t.year)}
              onMouseLeave={() => setHoverYear(null)}
              title={`Kể câu chuyện năm ${t.year} — ${t.title}`}
              style={{
                display: 'grid', gridTemplateColumns: '24px 1fr', gap: 14,
                padding: '10px 8px 10px 0', cursor: isLoading ? 'wait' : 'pointer', position: 'relative',
                opacity: isLoading ? 0.6 : (active || hovered ? 1 : (pal.isDark ? 0.72 : 0.85)),
                borderRadius: 10,
                background: hovered ? (pal.isDark ? `${pal.accent}12` : `${pal.accent}08`) : 'transparent',
                transform: hovered ? 'translateX(2px)' : 'translateX(0)',
                transition: 'opacity .25s, background .2s, transform .2s',
                outline: 'none',
              }}>
              <div style={{ position: 'relative', height: 24, display: 'grid', placeItems: 'center' }}>
                <div style={{
                  width: active ? 14 : (hovered ? 11 : 8),
                  height: active ? 14 : (hovered ? 11 : 8),
                  borderRadius: '50%',
                  background: active ? pal.gold : (hovered ? pal.warm : pal.accent),
                  boxShadow: active
                    ? `0 0 0 4px ${pal.gold}25, 0 0 18px ${pal.gold}80`
                    : (hovered ? `0 0 0 4px ${pal.warm}25` : `0 0 0 3px ${pal.accent}20`),
                  transition: 'all .25s',
                }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: active ? pal.gold : (hovered ? pal.warm : pal.accent2), letterSpacing: '0.08em', fontWeight: 600 }}>
                    {t.year}
                  </div>
                  <div style={{ fontSize: 13, color: pal.ink, fontWeight: 500 }}>{t.title}</div>
                </div>
                <div style={{ fontSize: 12, color: pal.mute, lineHeight: 1.5, marginTop: 3 }}>{t.body}</div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
