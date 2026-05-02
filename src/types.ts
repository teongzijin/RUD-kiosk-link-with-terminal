/**
 * Data structures for the RUD Payment Gateway
 */
export interface Transaction {
    tid: string;
    amount: number;
    sales_type: '00' | '01'; // 00=Card, 01=QR
}

export interface WSResponse {
    status: number;
    msg: string;
    data?: any;
}
