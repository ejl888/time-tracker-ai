/** A metric in the summary: its name, value and the note under it. */
export function Metric({
  name,
  title,
  value,
  tone,
  note,
}: {
  name: string
  /** The tooltip of the name, if any. */
  title?: string
  value: string
  /** Marks the value as positive or negative. */
  tone?: 'pos' | 'neg' | undefined
  note: string
}) {
  return (
    <div className="metric">
      <span className="k" title={title}>
        {name}
      </span>
      <span className={tone ? `v ${tone}` : 'v'}>{value}</span>
      <span className="n">{note}</span>
    </div>
  )
}
