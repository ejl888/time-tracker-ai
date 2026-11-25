import { useEffect, useId, useRef, useState } from 'react'
import './menu.css'

interface MenuProps<Screen extends string> {
  screens: { screen: Screen; title: string }[]
  current: Screen
  /** Also called when the current screen is chosen. */
  onGoTo: (screen: Screen) => void
  /** Puts focus on the icon when the menu appears. */
  focused?: boolean
}

/** An icon that opens a list of screens to go to; only shown on phones. */
export function Menu<Screen extends string>({
  screens,
  current,
  onGoTo,
  focused = false,
}: MenuProps<Screen>) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const iconRef = useRef<HTMLButtonElement>(null)
  const listId = useId()

  function closeToIcon() {
    setOpen(false)
    iconRef.current?.focus()
  }

  // On the document, because Safari does not focus a clicked button.
  useEffect(() => {
    if (!open) return
    function click(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        wrapRef.current?.contains(event.target)
      )
        return
      setOpen(false)
    }
    function keyDown(event: KeyboardEvent) {
      // A field that handled Escape itself keeps its focus.
      if (event.key !== 'Escape' || event.defaultPrevented) return
      setOpen(false)
      iconRef.current?.focus()
    }
    document.addEventListener('click', click)
    document.addEventListener('keydown', keyDown)
    return () => {
      document.removeEventListener('click', click)
      document.removeEventListener('keydown', keyDown)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="menu-wrap">
      <button
        ref={iconRef}
        className="icon-btn"
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={listId}
        autoFocus={focused}
        onClick={() => setOpen(!open)}
      >
        <MenuIcon />
      </button>
      <div id={listId} className="menu" hidden={!open}>
        {screens.map(({ screen, title }) => (
          <button
            key={screen}
            type="button"
            aria-current={screen === current ? 'page' : undefined}
            onClick={() => {
              closeToIcon()
              onGoTo(screen)
            }}
          >
            {title}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Three lines. */
function MenuIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M2 4h12M2 8h12M2 12h12" />
    </svg>
  )
}
