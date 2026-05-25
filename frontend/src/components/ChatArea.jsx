import ChatPanel from './ChatPanel';
import MessageInput from './MessageInput';

export default function ChatArea({
  compareMode, compareType, qwenModel,
  leftMessages, rightMessages,
  leftTyping, rightTyping,
  onSend, onOpenSource,
  onDeleteMessage, onEditMessage, onFeedback, convId,
  onRegenerate, onExtractColumns,
}) {
  const leftChip  = qwenModel === '27b' ? 'chip-d' : 'chip-q';
  const leftLabel = qwenModel === '27b' ? 'Mixtral 8x7B' : 'Qwen 35B';
  const leftSub   = qwenModel === '27b' ? 'GX10-1 vLLM' : 'GX10-2 MoE';

  let rightChip = 'chip-c', rightLabel = 'Claude Sonnet 4.6', rightSub = 'Anthropic API';
  if (compareType === 'qwen27') { rightChip = 'chip-d'; rightLabel = 'Mixtral 8x7B'; rightSub = 'GX10-1 vLLM'; }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0, background:'hsl(var(--muted))' }}>
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <ChatPanel label={leftLabel} chipClass={leftChip} subLabel={leftSub}
          messages={leftMessages} isTyping={leftTyping} compareType={compareType} onOpenSource={onOpenSource}
          onDeleteMessage={onDeleteMessage} onEditMessage={onEditMessage} onFeedback={onFeedback} convId={convId}
          onSend={q=>onSend(q)} onRegenerate={onRegenerate} onExtractColumns={onExtractColumns}/>
        {compareMode && <>
          <div style={{ width:1, background:'hsl(var(--border))', flexShrink:0 }} />
          <ChatPanel label={rightLabel} chipClass={rightChip} subLabel={rightSub}
            messages={rightMessages} isTyping={rightTyping} compareType={compareType} onOpenSource={onOpenSource}
            onDeleteMessage={onDeleteMessage} onEditMessage={onEditMessage} onFeedback={onFeedback} convId={convId}/>
        </>}
      </div>
      <MessageInput compareMode={compareMode} onSend={onSend} />
    </div>
  );
}
