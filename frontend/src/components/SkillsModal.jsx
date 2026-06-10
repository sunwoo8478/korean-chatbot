import { useState, useEffect, useRef } from 'react';
import { PlusIcon, TrashIcon, ToggleLeftIcon, ToggleRightIcon, XIcon, ChevronDownIcon, SparklesIcon, CheckCircleIcon, AlertCircleIcon } from 'lucide-react';

const TYPE_LABELS = {
  prompt:   { label: '프롬프트 주입', color: '#2563eb', desc: '특정 상황에서 추가 지식을 모델에 주입합니다.' },
  db_query: { label: 'DB 쿼리',      color: '#059669', desc: 'SQL을 실행하고 결과를 모델에 전달합니다.' },
  http:     { label: '외부 API',     color: '#d97706', desc: '외부 HTTP API를 호출하고 결과를 전달합니다.' },
  code:     { label: 'AI 생성 코드', color: '#7c3aed', desc: 'AI가 자동 생성한 Python 코드 스킬입니다.' },
};

export default function SkillsModal({ onClose }) {
  const [tab, setTab] = useState('list');   // 'list' | 'manual' | 'ai'
  const [skills, setSkills] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', skill_type: 'prompt', config: {} });
  const [expandedId, setExpandedId] = useState(null);

  // AI 생성 상태
  const [aiRequest, setAiRequest] = useState('');
  const [aiSteps, setAiSteps] = useState([]);
  const [aiGenerated, setAiGenerated] = useState(null);
  const [aiStatus, setAiStatus] = useState('idle');  // idle | loading | done | error
  const stepsEndRef = useRef(null);

  useEffect(() => { loadSkills(); }, []);
  useEffect(() => { stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiSteps]);

  async function loadSkills() {
    const res = await fetch('/api/skills');
    if (res.ok) setSkills(await res.json());
  }

  async function createSkill() {
    if (!form.name.trim() || !form.description.trim()) return;
    const res = await fetch('/api/skills', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      await loadSkills();
      setTab('list');
      setForm({ name: '', description: '', skill_type: 'prompt', config: {} });
    }
  }

  async function toggleSkill(id) {
    await fetch(`/api/skills/${id}/toggle`, { method: 'PATCH' });
    loadSkills();
  }

  async function deleteSkill(id) {
    if (!window.confirm('이 스킬을 삭제할까요?')) return;
    await fetch(`/api/skills/${id}`, { method: 'DELETE' });
    loadSkills();
  }

  function updateConfig(key, value) {
    setForm(f => ({ ...f, config: { ...f.config, [key]: value } }));
  }

  async function generateSkill() {
    if (!aiRequest.trim()) return;
    setAiStatus('loading');
    setAiSteps([]);
    setAiGenerated(null);

    try {
      const res = await fetch('/api/skills/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: aiRequest }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));
          setAiSteps(prev => [...prev, data]);

          if (data.step === 'generated') setAiGenerated(data);
          if (data.step === 'done') { setAiStatus('done'); await loadSkills(); }
          if (data.step === 'error') setAiStatus('error');
        }
      }
    } catch (e) {
      setAiSteps(prev => [...prev, { step: 'error', message: e.message }]);
      setAiStatus('error');
    }
  }

  const s = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(3px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    modal:   { background: 'hsl(var(--background))', borderRadius: 16, width: 620, maxWidth: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
    head:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid hsl(var(--border))', flexShrink: 0 },
    body:    { flex: 1, overflowY: 'auto', padding: 20, minHeight: 0 },
    foot:    { padding: '12px 20px', borderTop: '1px solid hsl(var(--border))', flexShrink: 0 },
    label:   { fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))', marginBottom: 5, display: 'block' },
    input:   { width: '100%', padding: '8px 12px', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', boxSizing: 'border-box' },
    textarea:{ width: '100%', padding: '8px 12px', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', resize: 'vertical', minHeight: 80, boxSizing: 'border-box' },
    btn:     (bg, col = '#fff') => ({ padding: '7px 16px', borderRadius: 8, border: 'none', background: bg, color: col, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }),
    tab:     (active) => ({ padding: '7px 16px', borderRadius: 8, border: 'none', background: active ? 'hsl(var(--primary))' : 'hsl(var(--muted))', color: active ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }),
  };

  const STEP_ICONS = {
    start: '...', generated: 'GEN', validated: 'OK', saved: 'DB', done: 'DONE', error: 'ERR',
  };

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        {/* 헤더 */}
        <div style={s.head}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>스킬 관리</h2>
            <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>모델이 사용할 커스텀 도구를 만들고 관리합니다</p>
          </div>
          <button onClick={onClose} style={{ ...s.btn('hsl(var(--muted))', 'hsl(var(--foreground))'), padding: '6px 10px' }}>
            <XIcon size={16} />
          </button>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 20px 0', borderBottom: '1px solid hsl(var(--border))', flexShrink: 0 }}>
          <button style={s.tab(tab === 'list')} onClick={() => setTab('list')}>스킬 목록</button>
          <button style={s.tab(tab === 'ai')} onClick={() => setTab('ai')}>
            AI 자동 생성
          </button>
          <button style={s.tab(tab === 'manual')} onClick={() => setTab('manual')}>직접 만들기</button>
        </div>

        <div style={s.body}>

          {/* ── 스킬 목록 탭 ── */}
          {tab === 'list' && <>
            {skills.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'hsl(var(--muted-foreground))' }}>
                <p style={{ fontSize: 14 }}>등록된 스킬이 없습니다</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>AI 자동 생성 또는 직접 만들기로 스킬을 추가하세요</p>
              </div>
            )}
            {skills.map(skill => {
              const meta = TYPE_LABELS[skill.skill_type] || TYPE_LABELS.prompt;
              const isExpanded = expandedId === skill.id;
              return (
                <div key={skill.id} style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: skill.is_active ? 'hsl(142 71% 45%)' : 'hsl(var(--border))', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{skill.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: meta.color + '18', color: meta.color }}>{meta.label}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => setExpandedId(isExpanded ? null : skill.id)} style={{ ...s.btn('hsl(var(--muted))', 'hsl(var(--foreground))'), padding: '5px 8px' }}>
                        <ChevronDownIcon size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                      </button>
                      <button onClick={() => toggleSkill(skill.id)} style={{ ...s.btn(skill.is_active ? 'hsl(142 71% 45%)' : 'hsl(var(--muted))', skill.is_active ? '#fff' : 'hsl(var(--foreground))'), padding: '5px 8px' }}>
                        {skill.is_active ? <ToggleRightIcon size={14} /> : <ToggleLeftIcon size={14} />}
                      </button>
                      <button onClick={() => deleteSkill(skill.id)} style={{ ...s.btn('hsl(var(--muted))', 'hsl(0 72% 55%)'), padding: '5px 8px' }}>
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '10px 14px 14px', borderTop: '1px solid hsl(var(--border))', background: 'hsl(var(--muted))', fontSize: 12 }}>
                      <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}><strong>설명:</strong> {skill.description}</p>
                      {skill.generated_code && (
                        <pre style={{ background: 'hsl(var(--background))', padding: '10px 12px', borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 200 }}>
                          {skill.generated_code}
                        </pre>
                      )}
                      {!skill.generated_code && skill.config && Object.keys(skill.config).length > 0 && (
                        <pre style={{ background: 'hsl(var(--background))', padding: '8px 10px', borderRadius: 6, fontSize: 11, overflow: 'auto' }}>
                          {JSON.stringify(skill.config, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>}

          {/* ── AI 자동 생성 탭 ── */}
          {tab === 'ai' && (
            <div>
              <div style={{ background: 'hsl(var(--muted))', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13 }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>자연어로 스킬을 설명하면 AI가 Python 코드를 생성합니다</p>
                <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>예시: "현재 환율을 조회해서 원화로 변환해주는 스킬"</p>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={s.label}>원하는 스킬을 설명해주세요</label>
                <textarea
                  style={{ ...s.textarea, minHeight: 80 }}
                  placeholder="예: 사용자가 입력한 숫자를 받아서 한국어 금액 표기법으로 변환해주는 스킬 (예: 1500000 → 150만원)"
                  value={aiRequest}
                  onChange={e => setAiRequest(e.target.value)}
                  disabled={aiStatus === 'loading'}
                />
              </div>

              <button
                onClick={generateSkill}
                disabled={aiStatus === 'loading' || !aiRequest.trim()}
                style={{ ...s.btn('hsl(271 91% 55%)'), display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, opacity: (aiStatus === 'loading' || !aiRequest.trim()) ? 0.5 : 1 }}
              >
                <SparklesIcon size={14} />
                {aiStatus === 'loading' ? '생성 중...' : 'AI 스킬 생성'}
              </button>

              {/* 진행 로그 */}
              {aiSteps.length > 0 && (
                <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', background: 'hsl(var(--muted))', fontWeight: 600, fontSize: 12 }}>생성 진행 상황</div>
                  <div style={{ padding: 14 }}>
                    {aiSteps.map((step, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, fontSize: 13 }}>
                        <span style={{ flexShrink: 0, fontSize: 16 }}>{STEP_ICONS[step.step] || '•'}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: step.step === 'error' ? 700 : 500, color: step.step === 'error' ? '#dc2626' : 'inherit' }}>{step.message}</p>
                          {step.step === 'generated' && step.code && (
                            <pre style={{ background: 'hsl(var(--muted))', padding: '8px 10px', borderRadius: 6, fontSize: 11, marginTop: 8, overflow: 'auto', maxHeight: 180 }}>
                              {step.code}
                            </pre>
                          )}
                          {step.step === 'done' && (
                            <p style={{ fontSize: 12, color: 'hsl(142 71% 40%)', marginTop: 4 }}>스킬 목록에서 확인하고 활성화할 수 있습니다.</p>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={stepsEndRef} />
                  </div>
                </div>
              )}

              {aiStatus === 'done' && (
                <button onClick={() => setTab('list')} style={{ ...s.btn('hsl(142 71% 45%)'), marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircleIcon size={14} /> 스킬 목록으로
                </button>
              )}
            </div>
          )}

          {/* ── 직접 만들기 탭 ── */}
          {tab === 'manual' && (
            <div>
              <div style={{ marginBottom: 12 }}>
                <label style={s.label}>스킬 이름</label>
                <input style={s.input} placeholder="예: 도로명주소 조회" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={s.label}>설명 (모델이 언제 이 스킬을 쓸지 결정하는 기준)</label>
                <textarea style={s.textarea} placeholder="예: 사용자가 주소 관련 컬럼 설계를 물어볼 때..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={s.label}>스킬 타입</label>
                <select style={{ ...s.input, cursor: 'pointer' }} value={form.skill_type} onChange={e => setForm(f => ({ ...f, skill_type: e.target.value, config: {} }))}>
                  <option value="prompt">프롬프트 주입</option>
                  <option value="db_query">DB 쿼리</option>
                  <option value="http">외부 API</option>
                </select>
                <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 5 }}>{TYPE_LABELS[form.skill_type]?.desc}</p>
              </div>

              {form.skill_type === 'prompt' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={s.label}>주입할 내용</label>
                  <textarea style={{ ...s.textarea, minHeight: 100 }} value={form.config.content || ''} onChange={e => updateConfig('content', e.target.value)} />
                </div>
              )}
              {form.skill_type === 'db_query' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={s.label}>SQL 쿼리</label>
                  <textarea style={{ ...s.textarea, fontFamily: 'monospace', fontSize: 12 }} placeholder="SELECT term_name FROM std_term WHERE ..." value={form.config.sql || ''} onChange={e => updateConfig('sql', e.target.value)} />
                </div>
              )}
              {form.skill_type === 'http' && <>
                <div style={{ marginBottom: 8 }}>
                  <label style={s.label}>URL</label>
                  <input style={s.input} placeholder="https://api.example.com/endpoint" value={form.config.url || ''} onChange={e => updateConfig('url', e.target.value)} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={s.label}>메서드</label>
                  <select style={{ ...s.input, cursor: 'pointer' }} value={form.config.method || 'GET'} onChange={e => updateConfig('method', e.target.value)}>
                    <option value="GET">GET</option><option value="POST">POST</option>
                  </select>
                </div>
              </>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => setTab('list')} style={s.btn('hsl(var(--muted))', 'hsl(var(--foreground))')}>취소</button>
                <button onClick={createSkill} style={s.btn('hsl(var(--primary))', 'hsl(var(--primary-foreground))')} disabled={!form.name || !form.description}>
                  <PlusIcon size={13} style={{ marginRight: 4 }} />스킬 저장
                </button>
              </div>
            </div>
          )}

        </div>

        {/* 하단: 목록 탭에서만 버튼 표시 */}
        {tab === 'list' && (
          <div style={{ ...s.foot, display: 'flex', gap: 8 }}>
            <button onClick={() => setTab('ai')} style={{ ...s.btn('hsl(271 91% 55%)'), display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}>
              <SparklesIcon size={14} /> AI 자동 생성
            </button>
            <button onClick={() => setTab('manual')} style={{ ...s.btn('hsl(var(--primary))', 'hsl(var(--primary-foreground))'), display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}>
              <PlusIcon size={14} /> 직접 만들기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
