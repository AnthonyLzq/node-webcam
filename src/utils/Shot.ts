class Shot {
  #location: string
  #data: Buffer

  constructor(location: string, data: Buffer) {
    this.#location = location
    this.#data = data
  }

  get location() {
    return this.#location
  }

  get data() {
    return Buffer.from(this.#data)
  }
}

export { Shot }
