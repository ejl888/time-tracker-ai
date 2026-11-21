import { useState } from 'react'
import { LabelsPage } from './labels/LabelsPage.tsx'
import { createServices } from './services.ts'

function App() {
  const [services] = useState(createServices)

  return (
    <main>
      <h1>Timetracker</h1>
      <LabelsPage labels={services.labels} />
    </main>
  )
}

export default App
