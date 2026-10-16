import { useId } from 'react'
import { Minus, Plus } from 'lucide-react'

type Props = {
  label: string
  value: number
  min: number
  max: number
  /** Clickable marks under the track. */
  ticks: number[]
  tickLabel?: (value: number) => string
  /** Text inside the stepper, e.g. value → "18 bulan". */
  valueLabel: (value: number) => string
  stepName: string
  onChange: (value: number) => void
}

/** Slider with a −/+ stepper and clickable tick marks; used for projection ranges. */
export function RangeSlider({ label, value, min, max, ticks, tickLabel = String, valueLabel, stepName, onChange }: Props) {
  const id = useId()
  const position = (at: number) => (at - min) / (max - min)
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)))
  return <div className="horizon-control">
    <div className="horizon-head">
      <span id={`${id}-label`}>{label}</span>
      <div className="horizon-stepper">
        <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label={`Kurangi satu ${stepName}`}><Minus size={12}/></button>
        <output htmlFor={`${id}-range`} aria-live="polite">{valueLabel(value)}</output>
        <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label={`Tambah satu ${stepName}`}><Plus size={12}/></button>
      </div>
    </div>
    <div className="horizon-track" style={{ '--fill': position(value) } as React.CSSProperties}>
      <input id={`${id}-range`} type="range" min={min} max={max} step={1} value={value} aria-labelledby={`${id}-label`} aria-valuetext={valueLabel(value)} onChange={event => set(Number(event.target.value))}/>
      <div className="horizon-ticks" aria-hidden="true">{ticks.map(tick => <button type="button" tabIndex={-1} key={tick} className={tick <= value ? 'is-passed' : ''} style={{ '--at': position(tick) } as React.CSSProperties} onClick={() => set(tick)}><i/>{tickLabel(tick)}</button>)}</div>
    </div>
  </div>
}
