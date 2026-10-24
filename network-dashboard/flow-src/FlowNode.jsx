import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

// One node component handles every kind; `data.kind` only changes styling.
function FlowNode({ data, selected }) {
  const { kind = 'default', color = '#1a5cff', icon, title, subtitle, badge, rows, dim } = data;
  return (
    <div className={`fn fn-${kind}${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`} style={{ '--accent': color }}>
      <Handle type="target" position={Position.Left} className="fn-handle" isConnectable={false} />
      <div className="fn-head">
        {icon && <span className="fn-icon">{icon}</span>}
        <div className="fn-titles">
          <div className="fn-title" title={title}>{title}</div>
          {subtitle && <div className="fn-sub">{subtitle}</div>}
        </div>
        {badge && <span className={`fn-badge ${badge.tone || ''}`}>{badge.text}</span>}
      </div>
      {rows && rows.length > 0 && (
        <dl className="fn-rows">
          {rows.map(([k, v]) => (
            <div key={k} className="fn-row"><dt>{k}</dt><dd title={String(v)}>{v}</dd></div>
          ))}
        </dl>
      )}
      <Handle type="source" position={Position.Right} className="fn-handle" isConnectable={false} />
    </div>
  );
}

export default memo(FlowNode);
