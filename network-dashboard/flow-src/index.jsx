import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './flow.css';
import TrafficFlow from './TrafficFlow.jsx';
import ConnectionFlow from './ConnectionFlow.jsx';

const roots = new WeakMap();

function mount(container, element) {
  if (!container) return;
  let root = roots.get(container);
  if (!root) {
    container.innerHTML = '';
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(element);
}

export function mountTrafficFlow(container, { resources = [], pageHost = '' } = {}) {
  mount(container, <TrafficFlow resources={resources} pageHost={pageHost} />);
}

export function mountConnectionFlow(container, props = {}) {
  mount(container, <ConnectionFlow {...props} />);
}
