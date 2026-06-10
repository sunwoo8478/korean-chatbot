/**
 * Add inline citation spans to a rendered bubble DOM element.
 * Matching source titles get dotted underlines that open the source panel.
 */
export function addInlineCitations(bubble, sources, onOpenPanel) {
  if (!sources || !sources.length) return;
  const cands = [...sources]
    .filter(s => s.title && s.title.length >= 2)
    .sort((a, b) => b.title.length - a.title.length);
  if (!cands.length) return;

  const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
  const reps = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.classList.contains('inline-cite')) continue;
    if (node.parentElement?.closest('code,pre')) continue;
    for (const src of cands) {
      if (node.textContent.includes(src.title)) {
        reps.push({ node, src }); break;
      }
    }
  }

  for (const { node, src } of reps) {
    const parts = node.textContent.split(src.title);
    const frag = document.createDocumentFragment();
    parts.forEach((part, i) => {
      if (part) frag.appendChild(document.createTextNode(part));
      if (i < parts.length - 1) {
        const cite = document.createElement('span');
        cite.className = 'inline-cite';
        cite.title = `${src.source}: ${src.title}`;
        cite.textContent = src.title;
        cite.onclick = () => onOpenPanel(src);
        frag.appendChild(cite);
      }
    });
    node.parentNode.replaceChild(frag, node);
  }
}
