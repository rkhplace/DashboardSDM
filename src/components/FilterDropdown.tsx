import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

type Props = {
  label: string
  options: string[]
  selected: string[]
  onChange: (values: string[]) => void
  multiple?: boolean
  display?: (value: string) => string
}

export function FilterDropdown({ label, options, selected, onChange, multiple = false, display = value => value }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const matches = options.filter(option => display(option).toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id').trim()))
  const caption = selected.length === 0 ? 'Semua' : multiple && selected.length > 1 ? `${selected.length} dipilih` : display(selected[0])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape) }
  }, [open])

  function choose(option: string) {
    if (multiple) onChange(selected.includes(option) ? selected.filter(value => value !== option) : [...selected, option])
    else { onChange([option]); setOpen(false); trigger.current?.focus() }
  }

  return <div className={`filter-dropdown ${open ? 'is-open' : ''}`} ref={root}>
    <button type="button" ref={trigger} className="filter-dropdown-trigger" aria-label={`${label}: ${caption}`} aria-expanded={open} aria-controls={id} aria-haspopup="listbox" onClick={() => { setOpen(value => !value); setSearch('') }}><span title={caption}>{caption}</span><ChevronDown size={15}/></button>
    {open && <div className="filter-dropdown-popover" id={id}>
      {options.length > 7 && <label className="filter-dropdown-search"><Search size={14}/><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder={`Cari ${label.toLowerCase()}...`} aria-label={`Cari ${label}`}/></label>}
      <div className="filter-dropdown-options" role="listbox" aria-label={label} aria-multiselectable={multiple || undefined}>
        <button type="button" role="option" aria-selected={selected.length === 0} className="filter-dropdown-option" onClick={() => { onChange([]); if (!multiple) setOpen(false) }}><span>Semua</span>{selected.length === 0 && <Check size={14}/>}</button>
        {matches.map(option => <button type="button" role="option" aria-selected={selected.includes(option)} key={option} className="filter-dropdown-option" onClick={() => choose(option)}><span>{display(option)}</span>{selected.includes(option) && <Check size={14}/>}</button>)}
        {!matches.length && <p className="filter-dropdown-empty">Tidak ada pilihan yang cocok.</p>}
      </div>
    </div>}
  </div>
}
