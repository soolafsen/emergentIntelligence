import type { ReactNode } from 'react';

export function ControlsPanel({ children }: { children: ReactNode }) {
  return <section className="control-panel">{children}</section>;
}
