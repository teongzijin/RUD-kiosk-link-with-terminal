/**
 * Utility class for PAX ECR Protocol handling
 */
export class ProtocolUtils {
    /**
     * Calculates the Longitudinal Redundancy Check (LRC)
     * XOR sum of all bytes after STX
     */
    static calcLRC(buf: Buffer): number {
        let x = 0;
        for (const b of buf) x ^= b;
        return x & 0xFF;
    }

    /**
     * Converts a number to BCD-encoded LLLL (4-digit length)
     */
    static bcdLLLL(n: number): Buffer {
        const s = n.toString().padStart(4, '0');
        const hi = ((s.charCodeAt(0) - 48) << 4) | (s.charCodeAt(1) - 48);
        const lo = ((s.charCodeAt(2) - 48) << 4) | (s.charCodeAt(3) - 48);
        return Buffer.from([hi, lo]);
    }

    /**
     * Builds a standard PAX ECR Sale Packet
     */
    static buildSalePacket(tid: string, amt: number, type: string): Buffer {
        const STX = 0x02, ETX = 0x03, FS = 0x1C;
        
        let body = Buffer.concat([
            Buffer.from('60'), Buffer.from('0000'), Buffer.from('0000'), Buffer.from('1'),
            Buffer.from('0'), Buffer.from(type || '00'), Buffer.from('00'), Buffer.from('0'),
            Buffer.from([FS])
        ]);

        // Field 40: Amount (12 digits)
        body = Buffer.concat([
            body, Buffer.from('40'), this.bcdLLLL(12), Buffer.from(amt.toString().padStart(12, '0')), Buffer.from([FS])
        ]);

        // Field 77: Reference ID (50 chars)
        body = Buffer.concat([
            body, Buffer.from('77'), this.bcdLLLL(50), Buffer.from(tid.padEnd(50, ' ')), Buffer.from([FS])
        ]);

        const llll = this.bcdLLLL(body.length);
        const withoutLRC = Buffer.concat([Buffer.from([STX]), llll, body, Buffer.from([ETX])]);
        const lrc = this.calcLRC(withoutLRC.subarray(1));
        
        return Buffer.concat([withoutLRC, Buffer.from([lrc])]);
    }
}
