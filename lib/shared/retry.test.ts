import { describe, it, expect, vi } from "vitest"
import { retryOnce } from "./retry"

describe("retryOnce", () => {
  it("returns the first success without retrying", async () => {
    const fn = vi.fn(async () => "ok")
    await expect(retryOnce(fn, 0)).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries a transient error once", async () => {
    const fn = vi.fn(async () => "ok").mockRejectedValueOnce(new Error("blip"))
    await expect(retryOnce(fn, 0)).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("throws if both attempts fail", async () => {
    const fn = vi.fn(async () => {
      throw new Error("still broken")
    })
    await expect(retryOnce(fn, 0)).rejects.toThrow("still broken")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("does NOT retry the fatal out-of-credit billing error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("Your credit balance is too low to access the Anthropic API")
    })
    await expect(retryOnce(fn, 0)).rejects.toThrow(/credit balance/)
    expect(fn).toHaveBeenCalledTimes(1) // fatal — no wasted second call
  })
})
