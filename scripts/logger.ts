import { mkdirSync, createWriteStream, type WriteStream } from "node:fs"
import { dirname } from "node:path"

export type LogEvent = {
  ts: string
  workbcId?: string
  stage: string
  durationMs?: number
  ok: boolean
  error?: string
  meta?: Record<string, unknown>
}

export class JsonlLogger {
  private stream: WriteStream
  private closed = false

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.stream = createWriteStream(path, { flags: "a" })
    const close = () => this.close()
    process.once("exit", close)
    process.once("SIGINT", () => {
      this.close()
      process.exit(130)
    })
    process.once("uncaughtException", (e) => {
      this.log({ ts: new Date().toISOString(), stage: "uncaught", ok: false, error: String(e) })
      this.close()
      process.exit(1)
    })
  }

  log(ev: Omit<LogEvent, "ts"> & { ts?: string }) {
    if (this.closed) return
    const line = JSON.stringify({ ts: ev.ts ?? new Date().toISOString(), ...ev })
    this.stream.write(line + "\n")
  }

  close() {
    if (this.closed) return
    this.closed = true
    try { this.stream.end() } catch {}
  }
}
