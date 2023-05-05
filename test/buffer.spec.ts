import assert from 'node:assert';
import {DataChunk} from "../pages/transfer-manager/data-chunk";
import {convertToBuffer, join, revertFromBuffer, split} from "../shared/buffer-utils";


//
// DataChunk
//
const chunkSize = 65535
const data = "Test".repeat(20000)
const encoder = new TextEncoder()
const stringBuffer = encoder.encode(data)

assert.deepEqual(stringBuffer.byteLength, 4 * 20000)

const id = Math.floor(Math.random() * 65534)
const bufferChunk = new DataChunk({ data: stringBuffer, id, chunkSize })

const chunk1 = bufferChunk.take()
const chunk1DataView = new DataView(chunk1.buffer)
assert.deepEqual(bufferChunk.isEnd(), false)
assert.deepEqual(chunk1DataView.getUint32(0), id)
assert.deepEqual(chunk1DataView.getUint32(4), 0)
assert.deepEqual(chunk1DataView.getUint32(8), 2)

const chunk2 = bufferChunk.take()
const chunk2DataView = new DataView(chunk2.buffer)
assert.deepEqual(chunk2DataView.getUint32(0), id)
assert.deepEqual(chunk2DataView.getUint32(4), 1)
assert.deepEqual(chunk2DataView.getUint32(8), 2)
assert.deepEqual(bufferChunk.isEnd(), true)


const decoder = new TextDecoder()
const combinedBuffer = DataChunk.restore([  chunk2.buffer, chunk1.buffer ])
const decodedText = decoder.decode(combinedBuffer)
assert.deepEqual(decodedText, data)


//
// revertFromBuffer/convertToBuffer
//
const string = 'String'
assert.deepEqual(revertFromBuffer(convertToBuffer(string)), string)

const bool = false
const boolBuffer = convertToBuffer(bool)
assert.deepEqual(revertFromBuffer(boolBuffer), bool)

const json = {
  "test": "object"
}
const jsonBuffer = convertToBuffer(json)
assert.deepEqual(revertFromBuffer(jsonBuffer), json)


//
// split/join
//
const buffers = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]), new Uint8Array([7, 8, 9, 10])]
assert.deepEqual(split(join(buffers)), buffers)

