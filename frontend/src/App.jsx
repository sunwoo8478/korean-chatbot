import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SourcePanel from './components/SourcePanel';
import ApiKeyModal from './components/ApiKeyModal';
import SkillsModal from './components/SkillsModal';
import DocumentsModal from './components/DocumentsModal';
import StandardsUpdateModal from './components/StandardsUpdateModal';
import AdminPanel from './components/AdminPanel';
import NotificationBell from './components/NotificationBell';
import QuickSearchModal from './components/QuickSearchModal';
import ShareView from './components/ShareView';
import ColumnExportModal from './components/ColumnExportModal';
import LoginModal from './components/LoginModal';
import { useConversations } from './hooks/useConversations';
import { useStream } from './hooks/useStream';

const WELCOME_MSG = {
  id: 'welcome',
  role: 'bot',
  content: '안녕하세요. 표준국어대사전과 공공데이터 공통표준을 기반으로 답변드립니다.\n\n**예시** — 납부금액 영문약어 / 주민등록번호 데이터 타입 / 사랑 뜻풀이',
  sources: [],
  streaming: false,
  isClaude: false,
  suggested: true,
};

let msgIdCounter = 1;
function nextId() { return `msg-${msgIdCounter++}`; }

// 공유 링크 라우팅
const shareMatch = window.location.pathname.match(/^\/share\/([a-f0-9-]+)$/);
if (shareMatch) {
  const root = document.getElementById('root');
  import('./components/ShareView.jsx').then(m => {
    const { default: ShareView } = m;
    import('react-dom/client').then(({ createRoot }) => {
      createRoot(root).render(<ShareView shareId={shareMatch[1]}/>);
    });
  });
}

export default function App() {
  const [authToken,   setAuthToken]   = useState(() => localStorage.getItem('auth_token') || '');
  const [username,    setUsername]    = useState(() => localStorage.getItem('username') || '');
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('display_name') || '');
  const [qwenModel, setQwenModel] = useState(() => localStorage.getItem('qwen_model') || '35b');
  const [anthropicKey, setAnthropicKey] = useState(() => localStorage.getItem('anthropic_api_key') || '');
  const [compareType, setCompareType] = useState('none'); // 'none' | 'qwen27' | 'claude'
  const compareMode = compareType !== 'none';

  const [leftMessages, setLeftMessages] = useState([WELCOME_MSG]);
  const [rightMessages, setRightMessages] = useState([]);
  const [leftTyping, setLeftTyping] = useState(false);
  const [rightTyping, setRightTyping] = useState(false);

  const [activeSource, setActiveSource] = useState(null);
  const [showApiModal, setShowApiModal] = useState(false);
  const [showSkills,   setShowSkills]   = useState(false);
  const [showDocs,      setShowDocs]      = useState(false);
  const [showStandards, setShowStandards] = useState(false);
  const [showAdmin,        setShowAdmin]        = useState(false);
  const [showQuickSearch,   setShowQuickSearch]   = useState(false);
  const [showColumnExport,  setShowColumnExport]  = useState(false);
  const [extractedColumns,  setExtractedColumns]  = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');

  const {
    conversations, currentConvId, setCurrentConvId,
    loadList, loadConversation, deleteConversation,
    saveMessage, createConversation,
  } = useConversations(username);

  const { stream } = useStream();

  // Load conversation list on mount
  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  function handleSetQwenModel(v) {
    setQwenModel(v);
    localStorage.setItem('qwen_model', v);
  }

  function handleToggleQwen27() {
    if (compareType === 'qwen27') {
      setCompareType('none');
    } else {
      setCompareType('qwen27');
      setRightMessages([{
        id: nextId(), role: 'bot', isClaude: false,
        content: '비교 모드가 활성화됐습니다. 질문을 입력하면 두 모델의 답변을 동시에 비교합니다.',
        sources: [], streaming: false,
      }]);
    }
  }

  function handleToggleClaude() {
    if (compareType === 'claude') {
      setCompareType('none');
    } else if (anthropicKey) {
      setCompareType('claude');
      setRightMessages([{
        id: nextId(), role: 'bot', isClaude: true,
        content: '비교 모드가 활성화됐습니다. 질문을 입력하면 두 모델의 답변을 동시에 비교합니다.',
        sources: [], streaming: false,
      }]);
    } else {
      setShowApiModal(true);
    }
  }

  function handleConnectApiKey(key) {
    setAnthropicKey(key);
    localStorage.setItem('anthropic_api_key', key);
    setCompareType('claude');
    setRightMessages([{
      id: nextId(), role: 'bot', isClaude: true,
      content: '비교 모드가 활성화됐습니다. 질문을 입력하면 두 모델의 답변을 동시에 비교합니다.',
      sources: [], streaming: false,
    }]);
  }

  function handleNewChat() {
    setCurrentConvId(null);
    setLeftMessages([WELCOME_MSG]);
    setRightMessages([]);
  }

  async function handleLoadConv(id) {
    const conv = await loadConversation(id);
    if (!conv) return;
    setCurrentConvId(id);

    const left = [];
    const right = [];
    for (const msg of conv.messages) {
      const isClaude = msg.model === 'claude';
      const sources = msg.sources
        ? (typeof msg.sources === 'string' ? JSON.parse(msg.sources) : msg.sources)
        : [];
      const item = {
        id: nextId(),
        role: msg.role === 'assistant' ? 'bot' : msg.role,
        content: msg.content,
        sources,
        streaming: false,
        isClaude,
      };
      if (isClaude) right.push(item);
      else left.push(item);
    }

    setLeftMessages(left.length ? left : [WELCOME_MSG]);
    setRightMessages(right);
  }

  async function handleDeleteConv(id) {
    if (!confirm('이 대화를 삭제할까요?')) return;
    await deleteConversation(id);
    if (currentConvId === id) handleNewChat();
    loadList();
  }

  // Ensure conversation exists, return convId
  const ensureConv = useCallback(async (text) => {
    if (currentConvId) return currentConvId;
    const conv = await createConversation(text, qwenModel);
    setCurrentConvId(conv.id);
    setTimeout(() => loadList(), 300);
    return conv.id;
  }, [currentConvId, qwenModel]);

  const sendingRef = useRef(false);
  async function handleSend(text, target) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const toLeft = !compareMode || target !== 'right';
    const toRight = compareMode && target !== 'left';

    // Add user messages
    const userMsg = { id: nextId(), role: 'user', content: text, sources: [], streaming: false, isClaude: false };
    if (toLeft) setLeftMessages(m => [...m, { ...userMsg, id: nextId() }]);
    if (toRight) setRightMessages(m => [...m, { ...userMsg, id: nextId(), isClaude: compareType === 'claude' }]);

    // Save user message
    const convId = await ensureConv(text);
    await saveMessage(convId, 'user', text, qwenModel, []);

    // Determine models to call
    const tasks = [];

    if (toLeft) {
      const leftModel = compareType === 'qwen27' ? '35b' : qwenModel;
      tasks.push(streamPanel({
        side: 'left', text, model: 'qwen', qwenModelOverride: leftModel, convId,
        isClaude: false,
      }));
    }

    if (toRight) {
      if (compareType === 'qwen27') {
        // 왼쪽이 RAG 캐시를 먼저 채우도록 1.5초 지연 후 오른쪽 시작
        tasks.push((async () => {
          await new Promise(r => setTimeout(r, 1500));
          await streamPanel({ side: 'right', text, model: 'qwen', qwenModelOverride: '27b', convId, isClaude: false });
        })());
      } else {
        tasks.push(streamPanel({ side: 'right', text, model: 'claude', qwenModelOverride: qwenModel, convId, isClaude: true }));
      }
    }

    await Promise.all(tasks);
    setTimeout(() => loadList(), 800);
    sendingRef.current = false;
  }

  async function streamPanel({ side, text, model, qwenModelOverride, convId, isClaude }) {
    const setTyping = side === 'left' ? setLeftTyping : setRightTyping;
    const setMsgs   = side === 'left' ? setLeftMessages : setRightMessages;
    const curMsgs   = side === 'left' ? leftMessages    : rightMessages;

    // 현재 패널의 완료된 메시지를 히스토리로 구성 (최근 6턴 = 3번의 Q&A)
    const history = curMsgs
      .filter(m => m.role === 'user' || (m.role === 'bot' && !m.streaming && m.content))
      .slice(-6)
      .map(m => ({
        role: m.role === 'bot' ? 'assistant' : 'user',
        content: m.content,
      }));

    // Placeholder 메시지 추가 (typing 인디케이터 대신 사용)
    setTyping(false);  // typing dot 비활성화 — placeholder가 대신함
    const msgId = nextId();
    const placeholder = {
      id: msgId, role: 'bot', content: '',
      status: '검색 중...',
      sources: [], streaming: true, isClaude,
    };
    setMsgs(m => [...m, placeholder]);

    let sources = [];

    await stream({
      message: text,
      model,
      apiKey: model === 'claude' ? anthropicKey : '',
      qwenModel: qwenModelOverride,
      convId,
      history,
      onSources: (s) => {
        sources = s;
        setMsgs(m => m.map(msg =>
          msg.id === msgId ? { ...msg, sources: s, status: '생성 중...' } : msg
        ));
      },
      onQuality: (q) => {
        setMsgs(m => m.map(msg =>
          msg.id === msgId ? { ...msg, quality: q } : msg
        ));
      },
      onToken: (fullText) => {
        setMsgs(m => m.map(msg =>
          msg.id === msgId ? { ...msg, content: fullText, status: null, streaming: true } : msg
        ));
      },
      onDone: async (fullText) => {
        // 먼저 content 업데이트 (streaming: true 유지)
        setMsgs(m => m.map(msg =>
          msg.id === msgId ? { ...msg, content: fullText, status: null, streaming: true } : msg
        ));
        // 다음 틱에서 streaming: false로 전환해서 정적 렌더링 트리거
        setTimeout(() => {
          setMsgs(m => m.map(msg =>
            msg.id === msgId ? { ...msg, streaming: false } : msg
          ));
        }, 50);
        setTyping(false);
        // Save assistant message
        const saveModel = model === 'claude' ? 'claude' : qwenModelOverride;
        await saveMessage(convId, 'assistant', fullText, saveModel, sources);
      },
      onError: (err) => {
        setMsgs(m => m.map(msg =>
          msg.id === msgId ? { ...msg, content: `오류: ${err}`, status: null, streaming: false } : msg
        ));
        setTyping(false);
      },
    });
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', position: 'relative' }}>
      {!authToken && <LoginModal onLogin={({ token, username: u, displayName: d }) => { setAuthToken(token); setUsername(u); setDisplayName(d); }} />}
      <Sidebar
        conversations={conversations}
        currentConvId={currentConvId}
        qwenModel={qwenModel}
        compareType={compareType}
        onNewChat={handleNewChat}
        onLoadConv={handleLoadConv}
        onDeleteConv={handleDeleteConv}
        onSetQwenModel={handleSetQwenModel}
        onToggleQwen27={handleToggleQwen27}
        onToggleClaude={handleToggleClaude}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        onOpenSkills={() => setShowSkills(true)}
        onOpenDocs={() => setShowDocs(true)}
        displayName={displayName}
        onLogout={async () => {
          await fetch('/api/auth/logout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token: authToken }) });
          localStorage.removeItem('auth_token');
          localStorage.removeItem('username');
          localStorage.removeItem('display_name');
          setAuthToken(''); setUsername(''); setDisplayName('');
        }}
        onOpenStandards={() => setShowStandards(true)}
        onOpenAdmin={() => setShowAdmin(true)}
        onRenameConv={async (id, title) => {
          await fetch(`/api/conversations/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title }) });
          loadList();
        }}
      />

      {/* 상단바 — DB 검색, 알림 */}
      <div style={{ position:'absolute', top:10, right:16, display:'flex', gap:8, zIndex:100 }}>
        <button onClick={() => setShowColumnExport(true)} title="컬럼 설계서 생성"
          style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', border:'1px solid hsl(var(--border))', borderRadius:8, background:'hsl(var(--background))', color:'hsl(var(--foreground))', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
          설계서
        </button>
        <button onClick={() => setShowQuickSearch(true)} title="DB 빠른 검색"
          style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', border:'1px solid hsl(var(--border))', borderRadius:8, background:'hsl(var(--background))', color:'hsl(var(--foreground))', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          DB 검색
        </button>
        <NotificationBell />
      </div>

      <ChatArea
        compareMode={compareMode}
        compareType={compareType}
        qwenModel={qwenModel}
        leftMessages={leftMessages}
        rightMessages={rightMessages}
        leftTyping={leftTyping}
        rightTyping={rightTyping}
        onSend={handleSend}
        onOpenSource={setActiveSource}
        convId={currentConvId}
        onDeleteMessage={async (msgId) => {
          await fetch(`/api/messages/${msgId}`, { method: 'DELETE' });
          setLeftMessages(m => m.filter(x => x.id !== msgId));
          setRightMessages(m => m.filter(x => x.id !== msgId));
        }}
        onEditMessage={async (msgId, content) => {
          await fetch(`/api/messages/${msgId}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ content }) });
          setLeftMessages(m => m.map(x => x.id === msgId ? {...x, content} : x));
          setRightMessages(m => m.map(x => x.id === msgId ? {...x, content} : x));
        }}
        onRegenerate={async () => {
          const lastUser = leftMessages.slice().reverse().find(m => m.role === 'user');
          if (lastUser) handleSend(lastUser.content, 'left');
        }}
        onExtractColumns={(content) => {
          setExtractedColumns(content);
          setShowColumnExport(true);
        }}
        onFeedback={async (msg, type) => {
          await fetch('/api/admin/feedback', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              conversation_id: currentConvId,
              message_content: msg.content,
              rating: type === 'positive' ? 1 : -1,
            }),
          });
        }}
      />

      {activeSource && (
        <SourcePanel source={activeSource} onClose={() => setActiveSource(null)} />
      )}

      {showSkills && <SkillsModal onClose={() => setShowSkills(false)} />}
      {showDocs       && <DocumentsModal       onClose={() => setShowDocs(false)} />}
      {showStandards  && <StandardsUpdateModal onClose={() => setShowStandards(false)} />}
      {showAdmin        && <AdminPanel         onClose={() => setShowAdmin(false)} />}
      {showQuickSearch   && <QuickSearchModal  onClose={() => setShowQuickSearch(false)} />}
      {showColumnExport  && <ColumnExportModal onClose={() => setShowColumnExport(false)} />}

      {showApiModal && (
        <ApiKeyModal
          onConnect={handleConnectApiKey}
          onClose={() => setShowApiModal(false)}
        />
      )}
    </div>
  );
}
