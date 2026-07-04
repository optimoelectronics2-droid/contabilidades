import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function Autocomplete({
  value,
  items,
  getLabel = (item) => item.name,
  getMeta,
  getSearchText,
  onSelect,
  placeholder = 'Buscar...',
  emptyText = 'Sin resultados',
  startText = 'Escriba para buscar',
  minQueryLength = 0,
  disabled = false,
  name = 'autocomplete-search',
  id = name,
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef(null)
  const menuRef = useRef(null)
  const focusedRef = useRef(false)
  const activeIndexRef = useRef(-1)
  const filteredRef = useRef([])
  const debounceRef = useRef(null)
  const positionRef = useRef({ top: -9999, left: -9999, width: 0, maxHeight: 240 })
  const selectedLabel = value ? getLabel(value) : ''

  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 150)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const filtered = useMemo(() => {
    const term = normalize(debouncedQuery)
    if (term.length < minQueryLength || !term) return []
    return items.map((item) => {
      const searchText = getSearchText ? getSearchText(item) : `${getLabel(item)} ${getMeta?.(item) || ''}`
      return { item, score: scoreText(searchText, term) }
    }).filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((entry) => entry.item)
  }, [debouncedQuery, getLabel, getMeta, getSearchText, items, minQueryLength])

  useEffect(() => { focusedRef.current = focused }, [focused])
  useEffect(() => { activeIndexRef.current = activeIndex }, [activeIndex])
  useEffect(() => { filteredRef.current = filtered }, [filtered])
  useEffect(() => { setActiveIndex(-1) }, [filtered.length])

  const updatePosition = useCallback(() => {
    if (!inputRef.current || !menuRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const GAP = 6
    const MIN_HEIGHT = 60
    const MAX_HEIGHT = 320
    const pad = 8
    const spaceBelow = vh - rect.bottom - GAP
    const spaceAbove = rect.top - GAP
    let top, maxHeight
    if (spaceBelow >= MIN_HEIGHT) {
      top = rect.bottom + GAP
      maxHeight = Math.min(spaceBelow - pad, MAX_HEIGHT)
    } else if (spaceAbove >= MIN_HEIGHT) {
      maxHeight = Math.min(spaceAbove - pad, MAX_HEIGHT)
      top = rect.top - GAP - maxHeight
    } else {
      const taller = Math.max(spaceBelow, spaceAbove)
      if (taller === spaceBelow) {
        top = rect.bottom + GAP
        maxHeight = Math.max(spaceBelow - pad, MIN_HEIGHT)
      } else {
        maxHeight = Math.max(spaceAbove - pad, MIN_HEIGHT)
        top = rect.top - GAP - maxHeight
      }
    }
    top = Math.max(GAP, Math.min(top, vh - maxHeight - GAP))
    const left = Math.max(GAP, Math.min(rect.left, vw - rect.width - GAP))
    positionRef.current = { top, left, width: rect.width, maxHeight }
    Object.assign(menuRef.current.style, { top: `${top}px`, left: `${left}px`, width: `${rect.width}px`, maxHeight: `${maxHeight}px` })
  }, [])

  useLayoutEffect(() => {
    if (!focused) return
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    let observer
    if (inputRef.current) {
      observer = new ResizeObserver(updatePosition)
      observer.observe(inputRef.current)
    }
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      if (observer) observer.disconnect()
    }
  }, [focused, updatePosition])

  useEffect(() => {
    if (!focused) return
    const handleOutside = (event) => {
      if (inputRef.current && !inputRef.current.contains(event.target) &&
          menuRef.current && !menuRef.current.contains(event.target)) {
        setFocused(false)
        setQuery('')
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleOutside, true)
    return () => document.removeEventListener('mousedown', handleOutside, true)
  }, [focused])

  useEffect(() => {
    if (!focused) return
    const handleVisibility = () => {
      if (document.hidden) {
        setFocused(false)
        setQuery('')
        setActiveIndex(-1)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [focused])

  const handleKeyDown = useCallback((event) => {
    const key = event.key
    if (!focusedRef.current) return
    const items = filteredRef.current
    const count = items.length
    let idx = activeIndexRef.current
    switch (key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex(count ? (idx < count - 1 ? idx + 1 : 0) : -1)
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex(count ? (idx > 0 ? idx - 1 : count - 1) : -1)
        break
      case 'Enter':
        event.preventDefault()
        if (idx >= 0 && idx < count) {
          const item = items[idx]
          onSelect(item)
          setFocused(false)
          setQuery('')
          setActiveIndex(-1)
          inputRef.current?.blur()
        }
        break
      case 'Escape':
        event.preventDefault()
        setFocused(false)
        setQuery('')
        setActiveIndex(-1)
        inputRef.current?.blur()
        break
      case 'Tab':
        setFocused(false)
        setQuery('')
        setActiveIndex(-1)
        break
      case 'Home':
        if (count) { event.preventDefault(); setActiveIndex(0) }
        break
      case 'End':
        if (count) { event.preventDefault(); setActiveIndex(count - 1) }
        break
      case 'PageUp':
        if (count) {
          event.preventDefault()
          const step = Math.max(1, Math.floor((positionRef.current.maxHeight || 240) / 52))
          setActiveIndex(Math.max(0, idx - step))
        }
        break
      case 'PageDown':
        if (count) {
          event.preventDefault()
          const step = Math.max(1, Math.floor((positionRef.current.maxHeight || 240) / 52))
          setActiveIndex(Math.min(count - 1, idx + step))
        }
        break
    }
  }, [onSelect])

  useEffect(() => {
    if (activeIndex < 0 || !menuRef.current) return
    const items = menuRef.current.querySelectorAll('[data-autocomplete-item]')
    const el = items[activeIndex]
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  const handleItemSelect = useCallback((item) => {
    onSelect(item)
    setFocused(false)
    setQuery('')
    setActiveIndex(-1)
    inputRef.current?.blur()
  }, [onSelect])

  const hasQuery = debouncedQuery.trim().length > 0

  const menuContent = !hasQuery ? (
    <p className="px-3 py-3 text-sm text-white/45">{startText}</p>
  ) : filtered.length ? (
    filtered.map((item, index) => (
      <button
        key={item.id || getLabel(item)}
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        data-autocomplete-item
        className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm transition-all duration-100 ${
          index === activeIndex
            ? 'bg-blue-500/20 text-blue-200 shadow-sm shadow-blue-500/10'
            : 'text-white hover:bg-white/[0.07]'
        }`}
        onMouseEnter={() => setActiveIndex(index)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => handleItemSelect(item)}
      >
        <p className="font-bold">{highlightMatch(getLabel(item), debouncedQuery)}</p>
        {getMeta ? <p className="mt-0.5 text-xs text-white/45">{getMeta(item)}</p> : null}
      </button>
    ))
  ) : (
    <p className="px-3 py-3 text-sm text-white/45">{emptyText}</p>
  )

  return (
    <div className="relative z-[1000]">
      <input
        id={id}
        ref={inputRef}
        name={name}
        disabled={disabled}
        value={focused ? query : selectedLabel}
        onFocus={() => {
          setFocused(true)
          setQuery('')
          setActiveIndex(-1)
        }}
        onBlur={() => {
          setTimeout(() => {
            if (document.activeElement !== inputRef.current &&
                menuRef.current && !menuRef.current.contains(document.activeElement)) {
              setFocused(false)
              setQuery('')
              setActiveIndex(-1)
            }
          }, 180)
        }}
        onChange={(event) => {
          const value = event.target.value
          if (!value && focusedRef.current) {
            setFocused(false)
            setQuery('')
            setActiveIndex(-1)
            return
          }
          setQuery(value)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400/60 disabled:opacity-50"
        role="combobox"
        aria-expanded={focused}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
      />
      {focused ? createPortal(
        <div
          ref={menuRef}
          id={`${id}-listbox`}
          role="listbox"
          className="fixed z-[9999] overflow-auto rounded-xl border border-white/10 bg-[#111118] p-1.5 shadow-2xl shadow-black/60"
          style={positionRef.current}
          onMouseDown={(event) => event.preventDefault()}
        >
          {menuContent}
        </div>,
        document.body
      ) : null}
    </div>
  )
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function scoreText(value, query) {
  const text = normalize(value)
  if (!text) return 0
  if (text === query) return 100
  if (text.startsWith(query)) return 70
  if (text.includes(query)) return 45
  if (query.split(/\s+/).every((part) => text.includes(part))) return 25
  return 0
}

function highlightMatch(text, query) {
  if (!query || !text) return text
  const term = normalize(query)
  if (!term) return text
  const lower = text.toLowerCase()
  const idx = lower.indexOf(term)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-blue-500/30 px-0.5 text-blue-200">{text.slice(idx, idx + term.length)}</mark>
      {text.slice(idx + term.length)}
    </>
  )
}