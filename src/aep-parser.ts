import { ConverterError, type Chunk, type ParsedAep } from './types';

const MAX_CHUNKS = 100_000;
const dec = new TextDecoder('latin1');

const u32 = (v: DataView, o: number) => v.getUint32(o, false); // RIFX = big-endian
const tag = (b: Uint8Array, o: number) => dec.decode(b.subarray(o, o + 4));

/** Parse the RIFX container at the root level only. Never mutates `bytes`. */
export function parseAep(bytes: Uint8Array): ParsedAep {
    if (bytes.length < 32) throw new ConverterError('INVALID_FILE', 'This file is not a valid After Effects project.');
    if (tag(bytes, 0) !== 'RIFX') {
        throw new ConverterError(tag(bytes, 0) === 'RIFF' ? 'UNSUPPORTED_FORMAT' : 'INVALID_FILE',
            tag(bytes, 0) === 'RIFF' ? 'This file format is not supported yet.' : 'This file is not a valid After Effects project.');
    }
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (tag(bytes, 8) !== 'Egg!') throw new ConverterError('INVALID_FILE', 'This file is not a valid After Effects project.');

    const declaredEnd = u32(v, 4) + 8;
    if (declaredEnd > bytes.length) throw new ConverterError('STRUCTURE_ERROR', 'The project structure could not be validated.');

    const chunks: Chunk[] = [];
    let off = 12;
    while (off + 8 <= declaredEnd) {
        if (chunks.length >= MAX_CHUNKS) throw new ConverterError('STRUCTURE_ERROR', 'The project structure could not be validated.');
        const type = tag(bytes, off);
        const size = u32(v, off + 4);
        const next = off + 8 + size + (size & 1);
        if (off + 8 + size > declaredEnd) throw new ConverterError('STRUCTURE_ERROR', 'The project structure could not be validated.');
        const c: Chunk = { type, offset: off, size };
        if (type === 'LIST' && size >= 4) c.listType = tag(bytes, off + 8);
        chunks.push(c);
        off = next;
    }
    // The scan must land exactly on the declared end (allowing for padding).
    if (off !== declaredEnd && off !== declaredEnd + 1 && off - 1 !== declaredEnd) {
        throw new ConverterError('STRUCTURE_ERROR', 'The project structure could not be validated.');
    }
    const head = chunks.find((c) => c.type === 'head');
    if (!head || head.size !== 20) throw new ConverterError('INVALID_FILE', 'This file is not a valid After Effects project.');

    return {
        declaredEnd, trailerLength: bytes.length - declaredEnd, chunks,
        head: { offset: head.offset, dataOffset: head.offset + 8, size: head.size }
    };
}
