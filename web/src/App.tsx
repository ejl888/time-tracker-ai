import { useState } from 'react'
import { Temporal } from 'temporal-polyfill'
import { systemClock } from './domain/clock.ts'
import { EntriesPage } from './entries/EntriesPage.tsx'
import { LabelsPage } from './labels/LabelsPage.tsx'
import { createServices } from './services.ts'

type Screen = 'entries' | 'labels'

const screens: { screen: Screen; title: string }[] = [
  { screen: 'entries', title: 'Entries' },
  { screen: 'labels', title: 'Labels' },
]

/** Services and the time zone, set up once when the app starts. */
function setUp() {
  return { ...createServices(), timeZone: Temporal.Now.timeZoneId() }
}

function App() {
  const [app] = useState(setUp)
  const [active, setActive] = useState<Screen>('entries')

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
              onClick={() => setActive(screen)}
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
          clock={systemClock}
          timeZone={app.timeZone}
        />
      ) : (
        <LabelsPage labels={app.labels} />
      )}
    </main>
  )
}

export default App
