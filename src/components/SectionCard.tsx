import type { ReactNode } from 'react'

export function SectionCard({ title, subtitle, children, className = '', headerAction }: { title: string; subtitle?: string; children: ReactNode; className?: string; headerAction?: ReactNode }) {
  return <section className={`section-card ${className}`}><div className="section-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{headerAction}</div>{children}</section>
}
