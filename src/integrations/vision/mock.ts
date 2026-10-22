export interface VisionAdapter {
  compare(photosA: string[], photosB: string[]): Promise<{ notes: string[] }>
}

export const mockVision: VisionAdapter = {
  async compare() {
    return { notes: ['Controlla il paraurti posteriore (mock VisionAdapter).'] }
  },
}
