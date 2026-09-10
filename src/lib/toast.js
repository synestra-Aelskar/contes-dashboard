let node = null;
let timer = null;

export function toast(msg) {
  if (typeof document === 'undefined') return;
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast';
    document.body.appendChild(node);
  }
  node.textContent = msg;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (node) { node.remove(); node = null; }
  }, 3000);
}
