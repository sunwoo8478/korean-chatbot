import { marked } from 'marked';
import mermaid from 'mermaid';

marked.use({ breaks: true, gfm: true });

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#dbeafe', primaryTextColor: '#1e3a5f', primaryBorderColor: '#2563eb',
    lineColor: '#64748b', secondaryColor: '#f1f5f9', tertiaryColor: '#e0f2fe',
    background: '#fff', mainBkg: '#dbeafe', nodeBorder: '#2563eb',
    clusterBkg: '#f8fafc', clusterBorder: '#94a3b8', titleColor: '#0f172a',
    edgeLabelBackground: '#fff', labelTextColor: '#1e3a5f',
    fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif", fontSize: '13px',
  },
  flowchart: { curve: 'basis', padding: 20, htmlLabels: false, useMaxWidth: true },
  securityLevel: 'loose',
});

export function parseMarkdown(text) {
  let html = marked.parse(text || '');
  html = html.replace(
    /<pre><code[^>]*class="[^"]*mermaid[^"]*"[^>]*>([\s\S]*?)<\/code><\/pre>/g,
    (_, encoded) => {
      const code = encoded
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      return `<div class="mermaid-wrap" data-rawcode="${code.replace(/"/g, '&quot;')}"><pre class="mermaid">${code}</pre></div>`;
    }
  );
  return html;
}

function decodeMermaid(code) {
  return code.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/<br\s*\/?>/gi,' ');
}

function cleanFlowchart(code) {
  return code
    .replace(/[「」『』【】《》〈〉]/g,'')
    .replace(/[·・]/g,'-')
    .replace(/^\s*direction\s+\w+\s*$/gm,'')
    .replace(/\[([^\]]*)\]/g,(_,t)=>`[${t.replace(/\//g,'-').replace(/:/g,' ').replace(/[?!()]/g,'').replace(/\s{2,}/g,' ').trim()}]`)
    .replace(/\{([^}]*)\}/g,(_,t)=>`{${t.replace(/\//g,'-').replace(/:/g,' ').replace(/[?!()]/g,'').replace(/\s{2,}/g,' ').trim()}}`)
    .replace(/--\s*([^->\n]+?)\s*-->/g,(_,l)=>`-- ${l.replace(/[:/?()`]/g,'').trim()} -->`);
}

function fixErDiagram(code) {
  if (!code.trim().startsWith('erDiagram')) return code;
  const lines = code.split('\n').map(l=>l.trim()).filter(Boolean);
  const out = ['erDiagram']; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line==='erDiagram'){i++;continue;}
    if (/^\w+\s*\(\[/.test(line)||/^style\s/i.test(line)||/^class\w*\s/i.test(line)||/^direction\s/i.test(line)||/^subgraph\s/i.test(line)||/^end\s*$/i.test(line)){i++;continue;}
    const ebm=line.match(/^([A-Z_][A-Z_0-9]*)\s*\{(.*)$/);
    if (ebm) {
      const [,name,rest]=ebm; let attrContent=rest; let j=i+1;
      while(j<lines.length&&!lines[j].startsWith('}')) {attrContent+=' '+lines[j];j++;}
      if(lines[j]==='}'||lines[j]?.startsWith('}'))j++;
      i=j;
      const attrs=[]; const ag=/(string|int|float|boolean|date|datetime)\s+(\w+)/gi; let m;
      while((m=ag.exec(attrContent))!==null) attrs.push(`        ${m[1].toLowerCase()} ${m[2]}`);
      if(attrs.length){out.push(`    ${name} {`);attrs.forEach(a=>out.push(a));out.push(`    }`);}
      continue;
    }
    if(line.includes('||')||line.includes('}o')||line.includes('o{')||line.includes('|{')){
      let fixed=line.replace(/([|}{o*][|}{o*-]+[|}{o*])([A-Z])/g,'$1 $2').replace(/([A-Z_][A-Z_0-9]*)\s+"([^"]+)"/g,'$1 : "$2"');
      const ms=[...fixed.matchAll(/([A-Z_][A-Z_0-9]*\s+[|}{o*-]{2,}\s+[A-Z_][A-Z_0-9]*(?:\s+:\s+"[^"]*")?)/g)];
      if(ms.length>0) ms.forEach(m=>out.push('    '+m[1].trim()));
      i++;continue;
    }
    out.push('    '+line); i++;
  }
  return out.join('\n');
}

function simplifyMermaid(code) {
  const lines = code.split('\n'); let inSub = false;
  return lines.filter(line => {
    const t = line.trim();
    if(/^subgraph\s/i.test(t)){inSub=true;return false;}
    if(/^end\s*$/i.test(t)){inSub=false;return false;}
    if(inSub)return false;
    if(/^direction\s/i.test(t))return false;
    return true;
  }).join('\n');
}

function cleanMermaid(code) {
  const decoded = decodeMermaid(code);
  if (decoded.trim().startsWith('erDiagram')) return decoded;
  return cleanFlowchart(decoded).trim();
}

export async function renderMermaidInEl(el) {
  const wraps = [...el.querySelectorAll('.mermaid-wrap')];
  if (!wraps.length) return;

  for (const wrap of wraps) {
    if (wrap.querySelector('svg')) continue;
    const pre = wrap.querySelector('.mermaid');
    if (!pre) continue;
    const rawCode = wrap.dataset.rawcode || pre.textContent;
    const isEr = rawCode.trim().startsWith('erDiagram');
    const c1 = isEr ? fixErDiagram(rawCode) : cleanMermaid(rawCode);
    const uid = 'mg' + Math.random().toString(36).slice(2, 10);

    function injectSvg(wrap, svg, code) {
      const card = document.createElement('div');
      card.className = 'mermaid-card';
      card.dataset.code = code || '';
      const type = (code || '').trim().split(/\s/)[0].toLowerCase();
      const label = {erdiagram:'ER 다이어그램',flowchart:'흐름도',graph:'그래프',sequencediagram:'시퀀스'}[type] || '다이어그램';
      const cid = 'mc' + Math.random().toString(36).slice(2, 8);
      card.innerHTML = `<div class="mermaid-bar"><div style="display:flex;align-items:center;gap:6px;font-size:12px;">📊 ${label}</div><div class="mermaid-bar-right"><button class="mermaid-btn" data-action="toggle" data-cid="${cid}">코드 보기</button><button class="mermaid-btn" data-action="copy" data-cid="${cid}">복사</button></div></div><div class="mermaid-viewport" id="${cid}-vp">${svg}</div><div class="mermaid-code-view" id="${cid}-code"><pre>${(code||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></div>`;
      // wire up buttons
      card.querySelector('[data-action="toggle"]').addEventListener('click', function() {
        const isCode = card.classList.toggle('show-code');
        this.textContent = isCode ? '다이어그램 보기' : '코드 보기';
      });
      card.querySelector('[data-action="copy"]').addEventListener('click', function() {
        navigator.clipboard.writeText(code || '').then(() => {
          this.textContent = '복사됨 ✓'; this.classList.add('copied');
          setTimeout(() => { this.textContent = '복사'; this.classList.remove('copied'); }, 1800);
        });
      });
      const svgEl = card.querySelector('svg:not([width="14"])');
      if (svgEl) {
        if (!svgEl.getAttribute('viewBox')) {
          const w = parseFloat(svgEl.getAttribute('width')) || 600;
          const h = parseFloat(svgEl.getAttribute('height')) || 300;
          svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
        }
        svgEl.removeAttribute('width'); svgEl.removeAttribute('height');
        svgEl.style.cssText = 'max-width:100%;height:auto;display:block;';
      }
      if (wrap.parentNode) wrap.parentNode.replaceChild(card, wrap);
    }

    try {
      const { svg } = await mermaid.render(uid, c1);
      injectSvg(wrap, svg, rawCode); continue;
    } catch (e1) { console.warn('mermaid 1차 실패', e1.message); }

    const c2 = isEr ? c1 : simplifyMermaid(c1);
    try {
      const uid2 = 'mg' + Math.random().toString(36).slice(2, 10);
      const { svg } = await mermaid.render(uid2, c2);
      injectSvg(wrap, svg, rawCode); continue;
    } catch (e2) { console.warn('mermaid 2차 실패', e2.message); }

    wrap.innerHTML = `<pre style="background:#1e1e1e;color:#d4d4d4;padding:14px;border-radius:10px;font-size:12px;overflow-x:auto;">${rawCode}</pre>`;
  }
}
