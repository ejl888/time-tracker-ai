import { useState } from 'react'
import { Temporal } from 'temporal-polyfill'
import { systemClock } from './domain/clock.ts'
import { EntriesPage } from './entries/EntriesPage.tsx'
import { Menu } from './Menu.tsx'
import { scrollToTop } from './scrollToTop.ts'
import { createServices } from './services.ts'
import { SettingsPage } from './settings/SettingsPage.tsx'

type Screen = 'entries' | 'settings'

const screens: { screen: Screen; title: string }[] = [
  { screen: 'entries', title: 'Overview' },
  { screen: 'settings', title: 'Settings' },
]

/** Services and the time zone, set up once when the app starts. */
function setUp() {
  return { ...createServices(), timeZone: Temporal.Now.timeZoneId() }
}

function App() {
  const [app] = useState(setUp)
  const [active, setActive] = useState<Screen>('entries')
  const [focusMenu, setFocusMenu] = useState(false)

  function goTo(screen: Screen) {
    setActive(screen)
    setFocusMenu(false)
  }

  function goToFromMenu(screen: Screen) {
    if (screen === active) return
    setActive(screen)
    setFocusMenu(true)
    scrollToTop()
  }

  const menu = (
    <Menu
      screens={screens}
      current={active}
      onGoTo={goToFromMenu}
      focused={focusMenu}
    />
  )

  return (
    <main className="wrap">
      <header className="app">
        <h1 className="brand">Timetracker</h1>
        <nav className="tabs">
          {screens.map(({ screen, title }) => (
            <button
              key={screen}
              type="button"
              aria-pressed={active === screen}
              onClick={() => goTo(screen)}
            >
              {title}
            </button>
          ))}
        </nav>
      </header>
      {active === 'entries' ? (
        <EntriesPage
          entries={app.entries}
          labels={app.labels}
          contracts={app.contracts}
          clock={systemClock}
          timeZone={app.timeZone}
          menu={menu}
        />
      ) : (
        <SettingsPage
          contracts={app.contracts}
          labels={app.labels}
          clock={systemClock}
          timeZone={app.timeZone}
          menu={menu}
        />
      )}
    </main>
  )
}

export default App
