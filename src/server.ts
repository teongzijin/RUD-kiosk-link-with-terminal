import { SerialPort } from 'serialport';
import WebSocket, { Server } from 'ws';
import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';

/**
 * Interface for Transaction Data
 * tid: Unique transaction ID
 * amount: Value in cents (e.g., 5000 = RM 50.00)
 * sales_type: 00 for Card, 01 for QR Wallet[cite: 1]
 */
interface Transaction {
    tid: string;
    amount: number;
    sales_type: '00' | '01'; 
}

interface TagMap {
    [key: string]: string;
}

// ====== GLOBAL CONFIGURATION ======
const IS_DEMO_MODE = true;      // Set to TRUE for GitHub/Demonstration purposes[cite: 1]
const INITIAL_DELAY = 15000;   // 15s delay to prevent Windows Kiosk driver conflicts[cite: 1]
const WS_PORT = 8081;

/**
 * MOCK HARDWARE SIMULATOR
 * Simulates PAX IM30 terminal behavior without physical hardware[cite: 1].
 * Useful for showcasing the integration logic in a virtual environment.
 */
class MockIM30 extends EventEmitter {
    open(cb: (err: Error | null) => void) {
        console.log("[Mock] Initializing simulated hardware...");
        setTimeout(() => cb(null), 1000);
    }
    
    write(pkt: Buffer, cb?: (err: Error | null) => void) {
        console.log("[Mock] Command received from Gateway (Hex):", pkt.toString('hex'));
        
        // Simulate Hardware Response Flow
        setTimeout(() => {
            // 1. Send ACK (Acknowledgment)[cite: 1]
            this.emit('data', Buffer.from([0x06])); 
            
            setTimeout(() => {
                /**
                 * 2. Simulate a successful Card Sale response
                 * Includes Media ID (001120) and Status Code (00)[cite: 1]
                 */
                const mockHex = "020030" + "60000000001096000" + "1C" + "001120" + "00" + "APPROVED" + "03";
                this.emit('data', Buffer.from(mockHex, 'ascii'));
            }, 2000);
        }, 500);
        if (cb) cb(null);
    }
}

/**
 * CORE GATEWAY CONTROLLER
 * Manages WebSocket communication with Kiosk UI and Serial communication with IM30[cite: 1].
 */
class RUDPaymentGateway {
    private port: any;
    private wss: Server;
    private currentClient: WebSocket | null = null;
    private currentTxn: Transaction | null = null;
    private tagMap: TagMap = {
        '40': 'Amount',
        '02': 'Response Text',
        '01': 'Approval Code',
        '77': 'POS Transaction ID'
    };

    constructor() {
        // Toggle between real SerialPort and Simulator[cite: 1]
        this.port = IS_DEMO_MODE ? new MockIM30() : new SerialPort({ 
            path: this.getComPort(), 
            baudRate: 115200, 
            autoOpen: false 
        });

        this.wss = new WebSocket.Server({ port: WS_PORT }, () => {
            console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);
        });

        this.init();
    }

    private getComPort(): string {
        try {
            const configPath = path.join(__dirname, '../im30_config.txt');
            return fs.readFileSync(configPath, 'utf8').trim();
        } catch (e) {
            return 'COM3'; // Default fallback
        }
    }

    private init() {
        // Handle WebSocket client connections (Kiosk Frontend)
        this.wss.on('connection', (ws: WebSocket) => {
            console.log("Kiosk UI Client Connected");
            if (this.currentClient) this.currentClient.close();
            this.currentClient = ws;

            ws.on('message', (msg: string) => this.handleWSMessage(msg));
            ws.on('close', () => { this.currentClient = null; });
        });

        // Listen for incoming data from the Payment Terminal
        this.port.on('data', (data: Buffer) => this.handleHardwareData(data));
        
        console.log(`RUD Gateway Starting... (Demo Mode: ${IS_DEMO_MODE})`);
        // Cold start delay to ensure all OS drivers are ready[cite: 1]
        setTimeout(() => this.connectHardware(), INITIAL_DELAY); 
    }

    private connectHardware() {
        console.log("Attempting to connect to payment terminal...");
        this.port.open((err: any) => {
            if (err) {
                console.error(`Connection failed: ${err.message}. Retrying in 10s...`);
                setTimeout(() => this.connectHardware(), 10000);
            } else {
                console.log("Payment Terminal connected successfully!");
            }
        });
    }

    private handleWSMessage(msg: string) {
        try {
            const data = JSON.parse(msg.toString());
            console.log("Received command from UI:", data);

            if (data.op === 'sale') {
                this.currentTxn = data;
                const pkt = this.buildCardSalePacket(data.tid, data.amount, 0, data.sales_type);
                this.port.write(pkt);
                this.broadcast({ status: 1, msg: "Packet sent to terminal" });
            }
        } catch (err) {
            console.error("WS Message Parse Error:", err);
        }
    }

    /**
     * HARDWARE DATA HANDLER
     * Logic to identify transaction status and payment media[cite: 1].
     */
    private handleHardwareData(data: Buffer) {
        const rawStr = data.toString();
        console.log('Raw Terminal Response:', rawStr);

        // Identify Media: 001120 = Card, 001121 = QR[cite: 1]
        const cardIdx = rawStr.indexOf("001120");
        const qrIdx = rawStr.indexOf("001121");

        if (cardIdx !== -1 || qrIdx !== -1) {
            const foundIdx = cardIdx !== -1 ? cardIdx : qrIdx;
            // The 2 characters following the media ID represent the status[cite: 1]
            const respCode = rawStr.substr(foundIdx + 6, 2); 
            
            if (respCode === "00") { // SUCCESS code[cite: 1]
                console.log("Transaction Approved");
                this.broadcast(`terminal_approved|${this.currentTxn?.tid}|${(this.currentTxn?.amount || 0) / 100}`);
            } else if (respCode === "TO" || respCode === "LC") { // Timeout/Loss of Connection
                console.warn("Terminal Timeout. Retrying packet...");
                const _pkt = this.buildCardSalePacket(this.currentTxn!.tid, this.currentTxn!.amount, 0, this.currentTxn!.sales_type);
                this.port.write(_pkt);
            } else {
                console.log(`Transaction Declined: ${respCode}`);
                this.broadcast(`terminal_declined|${this.currentTxn?.tid}|${respCode}`);
            }
        }

        // Handle Protocol Control Characters
        if (data[0] === 0x06) console.log("ACK Received");
        if (data[0] === 0x15) this.broadcast(`terminal_declined|${this.currentTxn?.tid}|NAK_ERROR`);
    }

    // ====== PROTOCOL UTILITIES (PAX ECR) ======

    /**
     * Build Card/QR Sale Packet according to PAX ECR standards[cite: 1].
     */
    private buildCardSalePacket(tid: string, amt: number, tips: number, type: string): Buffer {
        const STX = 0x02, ETX = 0x03, FS = 0x1C;
        
        // Transport & Presentation Headers
        let body = Buffer.concat([
            Buffer.from('60'), Buffer.from('0000'), Buffer.from('0000'), Buffer.from('1'),
            Buffer.from('0'), Buffer.from(type || '00'), Buffer.from('00'), Buffer.from('0'),
            Buffer.from([FS])
        ]);

        // Field 40: Amount (Formatted to 12 digits)
        body = Buffer.concat([
            body, Buffer.from('40'), this.bcdLLLL(12), Buffer.from(amt.toString().padStart(12, '0')), Buffer.from([FS])
        ]);

        // Field 77: Transaction ID (Padded to 50 chars)
        body = Buffer.concat([
            body, Buffer.from('77'), this.bcdLLLL(50), Buffer.from(tid.padEnd(50, ' ')), Buffer.from([FS])
        ]);

        const llll = this.bcdLLLL(body.length);
        const withoutLRC = Buffer.concat([Buffer.from([STX]), llll, body, Buffer.from([ETX])]);
        
        // Finalize with LRC (Longitudinal Redundancy Check)
        const lrc = this.calcLRC(withoutLRC.subarray(1));
        
        return Buffer.concat([withoutLRC, Buffer.from([lrc])]);
    }

    /**
     * Converts number to BCD-encoded LLLL format for PAX headers[cite: 1].
     */
    private bcdLLLL(n: number): Buffer {
        const s = n.toString().padStart(4, '0');
        const hi = ((s.charCodeAt(0) - 48) << 4) | (s.charCodeAt(1) - 48);
        const lo = ((s.charCodeAt(2) - 48) << 4) | (s.charCodeAt(3) - 48);
        return Buffer.from([hi, lo]);
    }

    /**
     * Calculates LRC by XORing all bytes after STX[cite: 1].
     */
    private calcLRC(buf: Buffer): number {
        let x = 0;
        for (const b of buf) x ^= b;
        return x & 0xFF;
    }

    private broadcast(msg: any) {
        if (this.currentClient && this.currentClient.readyState === WebSocket.OPEN) {
            this.currentClient.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
    }
}

// Start the RUD Gateway Service
new RUDPaymentGateway();
