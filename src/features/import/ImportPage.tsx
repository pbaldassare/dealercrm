import { useMemo, useState } from 'react'
import { previewVehicleImport } from '../../lib/importPreview'

const SAMPLE = `targa,marca,modello
ZZ102AA,BMW,X3
ZZ999AA,Fiat,Panda
NOPE,Audi,A3`

export function ImportPage() {
  const [text, setText] = useState(SAMPLE)
  const preview = useMemo(() => {
    const lines = text.trim().split('\n').slice(1)
    const rows = lines.map((line) => {
      const [plate, make, model] = line.split(',')
      return { plate: plate ?? '', make, model }
    })
    return previewVehicleImport(rows, ['ZZ102AA'])
  }, [text])

  return (
    <section className="space-y-4 p-5 pb-24">
      <h1 className="text-2xl font-semibold">Import</h1>
      <p className="text-sm text-[#5c6578]">
        Prova a vuoto: nessuna riga viene scritta. I duplicati sulla targa vengono contati prima
        della conferma.
      </p>
      <textarea
        className="min-h-40 w-full rounded-xl border border-[#d9d1c7] p-2 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-sm">
        Valide: {preview.valid} · Scartate: {preview.skipped} · Duplicate: {preview.duplicates}
      </p>
    </section>
  )
}
