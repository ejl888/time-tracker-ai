import { useState } from 'react'
import type { Temporal } from 'temporal-polyfill'

/** What the page shows. */
interface View {
  /** The date of the open day. */
  date: Temporal.PlainDate
  /** Raised after entries changed, to load them again. */
  revision: number
  /** The entry whose editor opened last on the open day; at most one is open at a time. */
  editor: Editor | undefined
  /** The add row gets focus with a prefill of this revision or later; undefined for no focus. */
  focusAt: number | undefined
}

interface Editor {
  id: string
  /** The editor closes once the entries of this revision are shown; undefined while it stays open. */
  closesAt: number | undefined
}

/** Whether the revision that is waited for is loaded. */
function reached(
  awaited: number | undefined,
  loaded: number | undefined,
): boolean {
  return awaited !== undefined && loaded !== undefined && loaded >= awaited
}

/** Whether the add row gets focus, given the revision of its prefill once loaded. */
export function focusesAddRow(view: View, loaded: number | undefined): boolean {
  return reached(view.focusAt, loaded)
}

/** The ids of the entry being edited and of the one whose editor closed last, given the revision shown. */
export function editorOf(
  { editor }: View,
  loaded: number,
): { editing: string | undefined; closed: string | undefined } {
  return reached(editor?.closesAt, loaded)
    ? { editing: undefined, closed: editor?.id }
    : { editing: editor?.id, closed: undefined }
}

/** The view on the open day, at first `initial`, and the steps that change it. */
export function useView(initial: Temporal.PlainDate) {
  const [view, setView] = useState<View>({
    date: initial,
    revision: 0,
    editor: undefined,
    focusAt: undefined,
  })

  return {
    view,

    /** Shows another date, closing any open editor. */
    goTo(date: Temporal.PlainDate) {
      setView((v) => ({ ...v, date, editor: undefined, focusAt: undefined }))
    },

    /** Like `goTo`, with focus on the add row. */
    open(date: Temporal.PlainDate) {
      setView((v) => ({ ...v, date, editor: undefined, focusAt: 0 }))
    },

    /** Opens the editor of an entry, closing any other. */
    edit(id: string) {
      setView((v) => ({
        ...v,
        editor: { id, closesAt: undefined },
        focusAt: undefined,
      }))
    },

    /** Closes the editor, discarding its changes. */
    cancelEdit() {
      setView((v) => ({
        ...v,
        editor: v.editor && { ...v.editor, closesAt: 0 },
      }))
    },

    /** After an entry was saved or deleted: loads again, then closes its editor if still open. */
    edited(id: string) {
      setView((v) => {
        const revision = v.revision + 1
        const isOpen = v.editor?.id === id && v.editor.closesAt === undefined
        const editor = isOpen ? { id, closesAt: revision } : v.editor
        return { ...v, revision, editor }
      })
    },

    /** After an entry was added: loads again, then focuses the add row if still shown. */
    added(date: Temporal.PlainDate) {
      setView((v) => {
        const revision = v.revision + 1
        const editorOpen = v.editor && v.editor.closesAt === undefined
        const addRowShown = v.date.equals(date) && !editorOpen
        return { ...v, revision, focusAt: addRowShown ? revision : v.focusAt }
      })
    },
  }
}
