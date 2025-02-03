export interface Payments {
    oldId: number;
    oldLoanId: number;
    paymentDate: Date;
    amount: number;
    type: string;
}

export interface ExcelPaymentRelationship {
    [key: string]: keyof Payments;
}