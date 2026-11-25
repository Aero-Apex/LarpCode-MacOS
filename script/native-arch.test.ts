import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { NativeArch } from "./native-arch"

const X64 = 0x01000007
const ARM64 = 0x0100000c

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((file) => rm(file, { recursive: true, force: true })))
})

// A minimal 64-bit little-endian Mach-O header: magic bytes, then a 32-bit CPU type at offset 4.
function thin(cpu: number) {
  const bytes = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0])
  bytes.writeUInt32LE(cpu, 4)
  return bytes
}

// A big-endian fat header with one fat_arch entry per slice, each holding an embedded thin image.
function fat(slices: ReadonlyArray<readonly [cpu: number, offset: number, size: number]>) {
  const bytes = Buffer.alloc(Math.max(8 + slices.length * 20, ...slices.map((slice) => slice[1] + slice[2])))
  bytes.writeUInt32BE(0xcafebabe, 0)
  bytes.writeUInt32BE(slices.length, 4)
  slices.forEach(([cpu, offset, size], index) => {
    const entry = 8 + index * 20
    bytes.writeUInt32BE(cpu, entry)
    bytes.writeUInt32BE(offset, entry + 8)
    bytes.writeUInt32BE(size, entry + 12)
    thin(cpu).copy(bytes, offset)
  })
  return bytes
}

async function tempBinary(bytes: Buffer) {
  const directory = await mkdtemp(path.join(tmpdir(), "larpcode-native-arch-"))
  cleanup.push(directory)
  const file = path.join(directory, "binary")
  await Bun.write(file, bytes)
  return file
}

describe("NativeArch.images", () => {
  test("parses thin little-endian Mach-O headers for x64 and arm64", () => {
    expect(NativeArch.images(thin(X64))).toEqual([{ offset: 0, format: "Mach-O", arches: ["x64"] }])
    expect(NativeArch.images(thin(ARM64))).toEqual([{ offset: 0, format: "Mach-O", arches: ["arm64"] }])
  })

  test("parses a fat header with both slices as one image", () => {
    const bytes = fat([
      [X64, 0x1000, 8],
      [ARM64, 0x2000, 8],
    ])
    // The embedded thin headers belong to the universal image and must not be reported separately.
    expect(NativeArch.images(bytes)).toEqual([
      { offset: 0, format: "Mach-O", arches: ["x64", "arm64"], end: 0x2008 },
    ])
  })

  test("rejects Java class files that share the fat magic", () => {
    for (const major of [45, 52]) {
      const classFile = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, major])
      expect(NativeArch.images(classFile), `major version ${major}`).toEqual([])
    }
  })
})

describe("NativeArch.verify", () => {
  test("accepts a universal binary for both architectures", async () => {
    const file = await tempBinary(
      fat([
        [X64, 0x1000, 8],
        [ARM64, 0x2000, 8],
      ]),
    )
    expect(await NativeArch.verify(file, "x64")).toBeUndefined()
    expect(await NativeArch.verify(file, "arm64")).toBeUndefined()
  })

  test("rejects a thin image built for the other architecture", async () => {
    const file = await tempBinary(thin(X64))
    expect(await NativeArch.verify(file, "x64")).toBeUndefined()
    await expect(NativeArch.verify(file, "arm64")).rejects.toThrow("must contain only arm64 code")
  })
})
