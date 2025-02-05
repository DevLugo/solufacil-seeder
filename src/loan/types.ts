export interface Loan {
    id: number;
    fullName: string;
    givedDate: Date;
    status: string;
    givedAmount: number;
    requestedAmount: number;
    noWeeks: number;
    interestRate: number;
    finished: boolean;
    finishedDate: Date;
    leadId: string;
    previousLoanId?: string;
    weeklyPaymentAmount: number;
    amountToPay: number;
    avalName: string;
    avalPhone: string;
    titularPhone: string;
    badDebtDate: Date;
}

export interface ExcelLoanRelationship {
    [key: string]: keyof Loan;
}

export interface ExcelRow {
    [key: string]: any;
}



