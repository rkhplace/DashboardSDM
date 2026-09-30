import type { ChatChart } from '../types/workforce'

const number = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 1 })

export function ChatChartView({ chart }: { chart: ChatChart }) {
  const max = Math.max(...chart.data.map(item => item.value), 1)
  return <figure className="chat-chart">
    <figcaption>{chart.title}</figcaption>
    <div className="chat-chart-rows">{chart.data.map(item => <div className="chat-chart-row" key={item.label}>
      <span className="chat-chart-label" title={item.label}>{item.label}</span>
      <span className="chat-chart-track"><span style={{ width: `${Math.max(item.value / max * 100, 1.5)}%` }}/></span>
      <span className="chat-chart-value">{number(item.value)}{chart.unit && <small> {chart.unit}</small>}</span>
    </div>)}</div>
    {chart.truncated && <p className="chat-chart-note">Menampilkan {chart.data.length} kelompok teratas.</p>}
  </figure>
}
